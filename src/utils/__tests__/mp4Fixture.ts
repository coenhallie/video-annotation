/**
 * Tiny MP4 box builders for tests: enough of a fragmented MP4 for the parsers
 * in utils/fragmentedMp4.ts, and for the streaming source to play end to end
 * against a fake Media Source.
 */

export const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
export const u64 = (n: number) => [...u32(Math.floor(n / 2 ** 32)), ...u32(n >>> 0)];
export const str = (s: string) => [...s].map((c) => c.charCodeAt(0));
export const zeros = (n: number) => new Array<number>(n).fill(0);
export const box = (type: string, ...parts: number[][]): number[] => {
  const body = parts.flat();
  return [...u32(8 + body.length), ...str(type), ...body];
};
export const full = (type: string, version: number, flags: number, ...parts: number[][]) =>
  box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
export const bytes = (arr: number[]) => Uint8Array.from(arr).buffer;

export const TIMESCALE = 12800;
/** The trex default sample duration: 512 / 12800 = 0.04 s, 25 frames a second. */
export const DEFAULT_SAMPLE_DURATION = 512;

export function initSegment(
  opts: { mvex?: boolean; sampleCount?: number; traks?: number; entry?: string } = {}
) {
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
  const trex = full('trex', 0, 0, u32(1), u32(1), u32(DEFAULT_SAMPLE_DURATION), u32(0), u32(0));
  const moovParts = [mvhd, ...new Array(traks).fill(trak)];
  if (mvex) moovParts.push(box('mvex', trex));
  const moov = box('moov', ...moovParts);
  return { ftyp, moov, all: [...ftyp, ...moov] };
}

export function mfraBox(entries: { time: number; offset: number }[], version: 0 | 1 = 1) {
  const rows = entries.flatMap(({ time, offset }) =>
    version === 1 ? [...u64(time), ...u64(offset), 1, 1, 1] : [...u32(time), ...u32(offset), 1, 1, 1]
  );
  const tfra = full('tfra', version, 0, u32(1), u32(0), u32(entries.length), rows);
  const size = 8 + tfra.length + 16;
  const mfro = full('mfro', 0, 0, u32(size));
  return box('mfra', tfra, mfro);
}

/**
 * A fragment: a moof whose mfhd sequence number is the fragment's index, so a
 * fake SourceBuffer can tell which one it was handed, and an mdat of padding.
 */
function fragmentBox(index: number, samples: number, padding: number): number[] {
  const tfhd = full('tfhd', 0, 0, u32(1));
  const trun = full('trun', 0, 0, u32(samples));
  const moof = box('moof', full('mfhd', 0, 0, u32(index)), box('traf', tfhd, trun));
  return [...moof, ...box('mdat', zeros(padding))];
}

export interface FixtureFragment {
  time: number;
  duration: number;
  start: number;
  end: number;
}

/**
 * A whole fragmented MP4: init segment, one fragment per entry of `seconds`
 * (each a whole number of 0.04 s samples), and the mfra index after them.
 */
export function fragmentedFile(seconds: number[], padding = 20000) {
  const out: number[] = [...initSegment().all];
  const fragments: FixtureFragment[] = [];
  let time = 0;
  seconds.forEach((s, i) => {
    const samples = Math.round((s * TIMESCALE) / DEFAULT_SAMPLE_DURATION);
    const start = out.length;
    out.push(...fragmentBox(i, samples, padding));
    const duration = (samples * DEFAULT_SAMPLE_DURATION) / TIMESCALE;
    fragments.push({ time, duration, start, end: out.length - 1 });
    time += duration;
  });
  const mfra = mfraBox(
    fragments.map((f) => ({ time: Math.round(f.time * TIMESCALE), offset: f.start }))
  );
  out.push(...mfra);
  return { buffer: bytes(out), fragments, duration: time };
}
