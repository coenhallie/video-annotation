/**
 * Pure parsing for fragmented MP4 (ISO BMFF) objects: just enough of the box
 * structure to feed one to Media Source Extensions straight from byte-range
 * requests, with no server-side remux.
 *
 * Why this exists: the pipeline writes `generated.mp4` as a live fragmented
 * stream - an empty `moov` (duration 0, no sample tables), then hundreds of
 * `moof`+`mdat` pairs, then an `mfra` index at the very end. Chrome plays a
 * plain `<video src>` MP4 through FFmpeg's demuxer, which refuses to report a
 * duration or a first frame until it has read every `moof` in the file, and it
 * never consults the `mfra`. On a 4.9 GB, two-hour object that is 780 range
 * requests before anything paints. MSE is a different Chrome code path that
 * consumes exactly this layout as init segment + media segments, and the
 * `mfra` gives it a complete time-to-byte map in one 15 KB read.
 *
 * Everything here is synchronous and side-effect free. The loader that does
 * the fetching lives in services/fragmentedMp4Source.ts.
 */

export interface Box {
  type: string;
  /** Offset of the box header within the buffer it was read from. */
  start: number;
  /** Total box size including the header. */
  size: number;
  /** 8, or 16 for a box with a 64-bit largesize. */
  headerSize: number;
}

export interface InitSegmentInfo {
  /**
   * Byte length of `ftyp` + `moov`. The MSE initialization segment is
   * `head.slice(0, initLength)`.
   */
  initLength: number;
  /** Media timescale from `mdhd`: the unit of `tfra` times and `trun` durations. */
  timescale: number;
  /** RFC 6381 codec string for `MediaSource.isTypeSupported`, e.g. `avc1.42C020`. */
  codec: string;
  /** `trex` default_sample_duration in timescale units, 0 when absent. */
  defaultSampleDuration: number;
}

export interface FragmentIndexEntry {
  /** Presentation time of the fragment's first sample, in seconds. */
  time: number;
  /** First byte of the `moof`. */
  start: number;
  /** Last byte of the following `mdat`, inclusive. */
  end: number;
}

/**
 * Sample entry types whose payload starts with the 78-byte VisualSampleEntry
 * header before any child box (such as `avcC`).
 */
const VISUAL_SAMPLE_ENTRIES = new Set(['avc1', 'avc3', 'hvc1', 'hev1', 'av01', 'vp09']);

function fourcc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

/**
 * List the boxes laid end to end in `buf[start, end)`. A box whose declared
 * size runs past `end` is still listed with that size; callers that need the
 * whole box check `start + size` themselves.
 */
export function readBoxes(buf: ArrayBuffer, start = 0, end = buf.byteLength): Box[] {
  const view = new DataView(buf);
  const out: Box[] = [];
  let p = start;
  while (p + 8 <= end) {
    let size = view.getUint32(p);
    const type = fourcc(view, p + 4);
    let headerSize = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      size = Number(view.getBigUint64(p + 8));
      headerSize = 16;
    } else if (size === 0) {
      // "Extends to the end of the file."
      size = end - p;
    }
    if (size < headerSize) break;
    out.push({ type, start: p, size, headerSize });
    p += size;
  }
  return out;
}

/** Byte offset of a container's first child box. */
function payloadStart(box: Box): number {
  const skip = box.type === 'stsd' ? 8 : VISUAL_SAMPLE_ENTRIES.has(box.type) ? 78 : 0;
  return box.start + box.headerSize + skip;
}

/**
 * Depth-first search for a box by path, e.g. `['moov', 'trak', 'mdia', 'mdhd']`.
 * Returns the first match.
 */
export function findBox(
  buf: ArrayBuffer,
  path: readonly string[],
  start = 0,
  end = buf.byteLength
): Box | null {
  const [head, ...rest] = path;
  if (!head) return null;
  for (const box of readBoxes(buf, start, end)) {
    if (box.type !== head) continue;
    if (rest.length === 0) return box;
    const found = findBox(buf, rest, payloadStart(box), Math.min(box.start + box.size, end));
    if (found) return found;
  }
  return null;
}

/**
 * Inspect the first bytes of a file and decide whether it is a single-track
 * fragmented MP4 that MSE can play. Returns null for anything else - a
 * non-fragmented file, a `moov` that does not fit in `head`, a multi-track
 * file, or a codec whose string this does not know how to build - and the
 * caller falls back to `video.src`.
 */
export function parseInitSegment(head: ArrayBuffer): InitSegmentInfo | null {
  const view = new DataView(head);
  const moov = readBoxes(head).find((b) => b.type === 'moov');
  if (!moov || moov.start + moov.size > head.byteLength) return null;
  const moovEnd = moov.start + moov.size;

  // Fragmented means: movie extends box present, and no samples in the moov.
  if (!findBox(head, ['moov', 'mvex'], 0, moovEnd)) return null;
  const traks = readBoxes(head, payloadStart(moov), moovEnd).filter((b) => b.type === 'trak');
  if (traks.length !== 1) return null;
  const stsz = findBox(head, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsz'], 0, moovEnd);
  if (stsz && view.getUint32(stsz.start + 16) !== 0) return null;

  const mdhd = findBox(head, ['moov', 'trak', 'mdia', 'mdhd'], 0, moovEnd);
  if (!mdhd) return null;
  const mdhdVersion = view.getUint8(mdhd.start + 8);
  const timescale = view.getUint32(mdhd.start + 12 + (mdhdVersion === 1 ? 16 : 8));
  if (!timescale) return null;

  const stsd = findBox(head, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd'], 0, moovEnd);
  if (!stsd) return null;
  const entry = readBoxes(head, payloadStart(stsd), stsd.start + stsd.size)[0];
  if (!entry || (entry.type !== 'avc1' && entry.type !== 'avc3')) return null;
  const avcC = findBox(head, ['avcC'], payloadStart(entry), entry.start + entry.size);
  if (!avcC) return null;
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
  const codec =
    `${entry.type}.` +
    hex(view.getUint8(avcC.start + 9)) +
    hex(view.getUint8(avcC.start + 10)) +
    hex(view.getUint8(avcC.start + 11));

  const trex = findBox(head, ['moov', 'mvex', 'trex'], 0, moovEnd);
  const defaultSampleDuration = trex ? view.getUint32(trex.start + 20) : 0;

  return { initLength: moovEnd, timescale, codec, defaultSampleDuration };
}

/**
 * The `mfro` box is the last 16 bytes of a file that carries an `mfra`, and
 * it holds the `mfra`'s size. Returns null when those bytes are not an `mfro`.
 */
export function mfraSizeFromMfro(tail: ArrayBuffer): number | null {
  if (tail.byteLength < 16) return null;
  const view = new DataView(tail, tail.byteLength - 16);
  if (view.getUint32(0) !== 16 || fourcc(view, 4) !== 'mfro') return null;
  const size = view.getUint32(12);
  return size >= 16 ? size : null;
}

/**
 * Read the `tfra` random-access table out of an `mfra`. Times come back in
 * seconds; offsets are absolute byte offsets of `moof` boxes.
 */
export function parseMfra(
  mfra: ArrayBuffer,
  timescale: number
): { time: number; offset: number }[] {
  const tfra = findBox(mfra, ['mfra', 'tfra']);
  if (!tfra) return [];
  const view = new DataView(mfra);
  const version = view.getUint8(tfra.start + 8);
  let p = tfra.start + 12; // past version/flags
  p += 4; // track_ID
  const lengthSizes = view.getUint32(p);
  p += 4;
  const trailing =
    (((lengthSizes >> 4) & 3) + 1) + (((lengthSizes >> 2) & 3) + 1) + ((lengthSizes & 3) + 1);
  const count = view.getUint32(p);
  p += 4;
  const entrySize = (version === 1 ? 16 : 8) + trailing;
  const out: { time: number; offset: number }[] = [];
  for (let i = 0; i < count && p + entrySize <= tfra.start + tfra.size; i++) {
    let time: number;
    let offset: number;
    if (version === 1) {
      time = Number(view.getBigUint64(p));
      offset = Number(view.getBigUint64(p + 8));
    } else {
      time = view.getUint32(p);
      offset = view.getUint32(p + 4);
    }
    p += entrySize;
    out.push({ time: time / timescale, offset });
  }
  return out;
}

/**
 * Turn `tfra` entries into byte ranges, one per `moof`. A `tfra` may list
 * several random-access points inside one fragment; they collapse to the
 * fragment's first. The last fragment ends where the `mfra` begins.
 */
export function buildFragmentIndex(
  entries: readonly { time: number; offset: number }[],
  mfraStart: number
): FragmentIndexEntry[] {
  const byOffset = new Map<number, number>();
  for (const { time, offset } of entries) {
    if (offset >= mfraStart) continue;
    const seen = byOffset.get(offset);
    if (seen === undefined || time < seen) byOffset.set(offset, time);
  }
  const starts = [...byOffset.keys()].sort((a, b) => a - b);
  return starts.map((start, i) => {
    const next = starts[i + 1];
    return {
      time: byOffset.get(start) as number,
      start,
      end: (next ?? mfraStart) - 1,
    };
  });
}

/**
 * Sum of the sample durations in a `moof`, in seconds. Reads per-sample
 * durations from `trun` when present, else the `tfhd` default, else the
 * `trex` default passed in. Null when none of those is available.
 *
 * Used for the very last fragment, whose length is not implied by a
 * successor in the index: the pipeline closes the stream mid-fragment, so
 * the real duration is not a multiple of the fragment length.
 */
export function fragmentDuration(
  moof: ArrayBuffer,
  trexDefaultSampleDuration: number,
  timescale: number
): number | null {
  const traf = findBox(moof, ['moof', 'traf']);
  if (!traf) return null;
  const view = new DataView(moof);

  let defaultDuration = trexDefaultSampleDuration;
  const tfhd = findBox(moof, ['tfhd'], payloadStart(traf), traf.start + traf.size);
  if (tfhd) {
    const flags = view.getUint32(tfhd.start + 8) & 0xffffff;
    let p = tfhd.start + 16; // past version/flags and track_ID
    if (flags & 0x000001) p += 8; // base_data_offset
    if (flags & 0x000002) p += 4; // sample_description_index
    if (flags & 0x000008) defaultDuration = view.getUint32(p);
  }

  let total = 0;
  let sawTrun = false;
  const children = readBoxes(moof, payloadStart(traf), traf.start + traf.size);
  for (const trun of children) {
    if (trun.type !== 'trun') continue;
    sawTrun = true;
    const flags = view.getUint32(trun.start + 8) & 0xffffff;
    const count = view.getUint32(trun.start + 12);
    let p = trun.start + 16;
    if (flags & 0x000001) p += 4; // data_offset
    if (flags & 0x000004) p += 4; // first_sample_flags
    if (flags & 0x000100) {
      const stride =
        4 + (flags & 0x000200 ? 4 : 0) + (flags & 0x000400 ? 4 : 0) + (flags & 0x000800 ? 4 : 0);
      for (let i = 0; i < count; i++, p += stride) total += view.getUint32(p);
    } else {
      if (!defaultDuration) return null;
      total += count * defaultDuration;
    }
  }
  return sawTrun ? total / timescale : null;
}

/** Index of the fragment containing `time`: the last one starting at or before it. */
export function findFragment(index: readonly FragmentIndexEntry[], time: number): number {
  let lo = 0;
  let hi = index.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((index[mid] as FragmentIndexEntry).time <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Whether two URLs name the same object, ignoring query and fragment. A
 * refreshed presigned URL differs from the stale one only in its query, and
 * that is the one case a loader can hot-swap without starting over.
 */
export function sameObject(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin && ua.pathname === ub.pathname;
  } catch {
    return false;
  }
}
