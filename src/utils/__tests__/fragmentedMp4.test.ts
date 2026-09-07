import { describe, it, expect } from 'vitest';
import {
  readBoxes,
  findBox,
  parseInitSegment,
  mfraSizeFromMfro,
  parseMfra,
  buildFragmentIndex,
  fragmentDuration,
  findFragment,
  sameObject,
} from '../fragmentedMp4';

// ---- tiny box builders -------------------------------------------------------

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u64 = (n: number) => [...u32(Math.floor(n / 2 ** 32)), ...u32(n >>> 0)];
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));
const zeros = (n: number) => new Array<number>(n).fill(0);
const box = (type: string, ...parts: number[][]): number[] => {
  const body = parts.flat();
  return [...u32(8 + body.length), ...str(type), ...body];
};
const full = (type: string, version: number, flags: number, ...parts: number[][]) =>
  box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
const bytes = (arr: number[]) => Uint8Array.from(arr).buffer;

const TIMESCALE = 12800;

function initSegment(opts: { mvex?: boolean; sampleCount?: number; traks?: number; entry?: string } = {}) {
  const { mvex = true, sampleCount = 0, traks = 1, entry = 'avc1' } = opts;
  const ftyp = box('ftyp', str('iso5'), u32(0x200), str('iso5'), str('iso6'), str('mp41'));
  const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(0), zeros(80));
  const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(0), [0x55, 0xc4], [0, 0]);
  // configurationVersion, profile, compat, level, then a couple of filler bytes
  const avcC = box('avcC', [1, 0x42, 0xc0, 0x20, 0xff, 0xe1]);
  const sampleEntry = box(entry, zeros(78), avcC);
  const stsd = full('stsd', 0, 0, u32(1), sampleEntry);
  const stsz = full('stsz', 0, 0, u32(0), u32(sampleCount));
  const stbl = box('stbl', stsd, stsz);
  const trak = box('trak', box('mdia', mdhd, box('minf', stbl)));
  const trex = full('trex', 0, 0, u32(1), u32(1), u32(512), u32(0), u32(0));
  const moovParts = [mvhd, ...new Array(traks).fill(trak)];
  if (mvex) moovParts.push(box('mvex', trex));
  const moov = box('moov', ...moovParts);
  return { ftyp, moov, all: [...ftyp, ...moov] };
}

function mfraBox(entries: { time: number; offset: number }[], version: 0 | 1 = 1) {
  const rows = entries.flatMap(({ time, offset }) =>
    version === 1 ? [...u64(time), ...u64(offset), 1, 1, 1] : [...u32(time), ...u32(offset), 1, 1, 1]
  );
  const tfra = full('tfra', version, 0, u32(1), u32(0), u32(entries.length), rows);
  const size = 8 + tfra.length + 16;
  const mfro = full('mfro', 0, 0, u32(size));
  return box('mfra', tfra, mfro);
}

// ---- tests -----------------------------------------------------------------

describe('readBoxes / findBox', () => {
  it('walks sibling boxes and descends by path', () => {
    const { all, ftyp } = initSegment();
    const top = readBoxes(bytes(all));
    expect(top.map((b) => b.type)).toEqual(['ftyp', 'moov']);
    expect(top[1]?.start).toBe(ftyp.length);
    const mdhd = findBox(bytes(all), ['moov', 'trak', 'mdia', 'mdhd']);
    expect(mdhd?.type).toBe('mdhd');
  });

  it('understands 64-bit largesize headers', () => {
    const body = [1, 2, 3, 4];
    const large = [...u32(1), ...str('mdat'), ...u64(16 + body.length), ...body];
    const [b] = readBoxes(bytes(large));
    expect(b).toMatchObject({ type: 'mdat', size: 20, headerSize: 16 });
  });

  it('skips the sample entry header when descending into avc1', () => {
    const { all } = initSegment();
    const avcC = findBox(bytes(all), ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd', 'avc1', 'avcC']);
    expect(avcC).not.toBeNull();
  });
});

describe('parseInitSegment', () => {
  it('reads a single-track fragmented init segment', () => {
    const { all, ftyp, moov } = initSegment();
    // Pad with the start of a moof so the moov is not the end of the buffer.
    const head = bytes([...all, ...u32(1000), ...str('moof')]);
    expect(parseInitSegment(head)).toEqual({
      initLength: ftyp.length + moov.length,
      timescale: TIMESCALE,
      codec: 'avc1.42C020',
      defaultSampleDuration: 512,
    });
  });

  it('rejects a moov that does not fit in the probed head', () => {
    const { all } = initSegment();
    expect(parseInitSegment(bytes(all.slice(0, all.length - 10)))).toBeNull();
  });

  it('rejects a non-fragmented file (no mvex)', () => {
    expect(parseInitSegment(bytes(initSegment({ mvex: false }).all))).toBeNull();
  });

  it('rejects a moov that already carries samples', () => {
    expect(parseInitSegment(bytes(initSegment({ sampleCount: 30 }).all))).toBeNull();
  });

  it('rejects multi-track files', () => {
    expect(parseInitSegment(bytes(initSegment({ traks: 2 }).all))).toBeNull();
  });

  it('rejects codecs it cannot name', () => {
    expect(parseInitSegment(bytes(initSegment({ entry: 'hvc1' }).all))).toBeNull();
  });
});

describe('mfra index', () => {
  const entries = [
    { time: 0, offset: 756 },
    { time: 128000, offset: 1_989_198 },
    // a second random-access point inside the same fragment
    { time: 192000, offset: 1_989_198 },
    { time: 256000, offset: 8_532_730 },
  ];

  it('reads the mfra size from the trailing mfro', () => {
    const mfra = mfraBox(entries);
    expect(mfraSizeFromMfro(bytes(mfra))).toBe(mfra.length);
    expect(mfraSizeFromMfro(bytes(zeros(16)))).toBeNull();
    expect(mfraSizeFromMfro(bytes(zeros(8)))).toBeNull();
  });

  it('parses version 1 and version 0 tfra entries into seconds', () => {
    for (const version of [1, 0] as const) {
      const parsed = parseMfra(bytes(mfraBox(entries, version)), TIMESCALE);
      expect(parsed).toEqual([
        { time: 0, offset: 756 },
        { time: 10, offset: 1_989_198 },
        { time: 15, offset: 1_989_198 },
        { time: 20, offset: 8_532_730 },
      ]);
    }
  });

  it('collapses entries to one range per moof and ends the last at the mfra', () => {
    const mfraStart = 10_000_000;
    const parsed = parseMfra(bytes(mfraBox(entries)), TIMESCALE);
    expect(buildFragmentIndex(parsed, mfraStart)).toEqual([
      { time: 0, start: 756, end: 1_989_197 },
      { time: 10, start: 1_989_198, end: 8_532_729 },
      { time: 20, start: 8_532_730, end: mfraStart - 1 },
    ]);
  });

  it('drops entries that point past the mfra', () => {
    const idx = buildFragmentIndex([{ time: 0, offset: 100 }, { time: 1, offset: 5000 }], 4000);
    expect(idx).toEqual([{ time: 0, start: 100, end: 3999 }]);
  });
});

describe('fragmentDuration', () => {
  const moofWith = (tfhdFlags: number, tfhdExtra: number[], trunFlags: number, samples: number[][]) => {
    const tfhd = full('tfhd', 0, tfhdFlags, u32(1), tfhdExtra);
    const trun = full(
      'trun',
      0,
      trunFlags,
      u32(samples.length),
      trunFlags & 1 ? u32(1112) : [],
      trunFlags & 4 ? u32(0) : [],
      samples.flat()
    );
    return bytes(box('moof', full('mfhd', 0, 0, u32(1)), box('traf', tfhd, trun)));
  };

  it('uses the tfhd default duration when trun carries only sizes', () => {
    // 0x020038 = default-base-is-moof + default duration/size/flags present
    const moof = moofWith(0x020038, [...u32(512), ...u32(0), ...u32(0)], 0x000205, zeros(250).map(() => u32(100)));
    expect(fragmentDuration(moof, 0, TIMESCALE)).toBe(10);
  });

  it('sums per-sample durations when trun carries them', () => {
    const moof = moofWith(0x020000, [], 0x000301, [
      [...u32(512), ...u32(1)],
      [...u32(512), ...u32(1)],
      [...u32(256), ...u32(1)],
    ]);
    expect(fragmentDuration(moof, 0, TIMESCALE)).toBe(1280 / TIMESCALE);
  });

  it('falls back to the trex default', () => {
    const moof = moofWith(0x020000, [], 0x000201, zeros(25).map(() => u32(100)));
    expect(fragmentDuration(moof, 512, TIMESCALE)).toBe(1);
  });

  it('returns null when no duration source exists', () => {
    const moof = moofWith(0x020000, [], 0x000201, [u32(100)]);
    expect(fragmentDuration(moof, 0, TIMESCALE)).toBeNull();
  });
});

describe('findFragment', () => {
  const index = [0, 10, 20, 30].map((time, i) => ({ time, start: i * 100, end: i * 100 + 99 }));
  it('returns the fragment containing the time', () => {
    expect(findFragment(index, 0)).toBe(0);
    expect(findFragment(index, 9.99)).toBe(0);
    expect(findFragment(index, 10)).toBe(1);
    expect(findFragment(index, 25)).toBe(2);
    expect(findFragment(index, 1e9)).toBe(3);
    expect(findFragment(index, -5)).toBe(0);
  });
});

describe('sameObject', () => {
  it('ignores the query string but not the path or host', () => {
    const a = 'https://b.s3.eu-west-2.amazonaws.com/storage/x/streams/generated.mp4?X-Amz-Signature=1';
    expect(sameObject(a, a.replace('=1', '=2'))).toBe(true);
    expect(sameObject(a, a.replace('/x/', '/y/'))).toBe(false);
    expect(sameObject(a, a.replace('b.s3', 'c.s3'))).toBe(false);
    expect(sameObject(a, 'not a url')).toBe(false);
  });
});
