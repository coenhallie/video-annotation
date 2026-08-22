import { parseWindow, type ReplayRecord } from './frameWindow';

/** How much to read for each probe. Comfortably more than one record. */
export const PROBE_BYTES = 65536;

export interface IndexEntry {
  offset: number;
  frameCount: number;
  t: number;
}

export interface RangeFetcher {
  head(): Promise<{ size: number; acceptsRanges: boolean }>;
  range(start: number, endInclusive: number): Promise<string>;
}

export interface JsonlIndex {
  size: number;
  acceptsRanges: boolean;
  first: IndexEntry;
  last: IndexEntry;
  /** Measured, not assumed: window sizes are derived from this. */
  meanRecordBytes: number;
  /** Sorted by offset. Densifies as the file is used. */
  entries: IndexEntry[];
}

function entryFrom(record: ReplayRecord, offset: number): IndexEntry {
  return { offset, frameCount: record.frameCount, t: record.t };
}

/**
 * Build the index with about ten small reads.
 *
 * When ranges are unsupported the whole object is read once instead, and the
 * index is built from that. Same shape either way, so nothing downstream has to
 * know which happened.
 */
export async function buildIndex(
  fetcher: RangeFetcher,
  probes = 8
): Promise<JsonlIndex> {
  const { size, acceptsRanges } = await fetcher.head();

  if (!acceptsRanges) {
    const text = await fetcher.range(0, size - 1);
    const records = parseWindow(text, { startsAtBof: true, endsAtEof: true });
    if (!records.length) throw new Error('Pipeline data file holds no records');
    return {
      size,
      acceptsRanges: false,
      first: entryFrom(records[0], 0),
      last: entryFrom(records[records.length - 1], size),
      meanRecordBytes: Math.max(1, Math.round(size / records.length)),
      entries: [entryFrom(records[0], 0)],
    };
  }

  const head = await fetcher.range(0, Math.min(PROBE_BYTES, size) - 1);
  const headRecords = parseWindow(head, {
    startsAtBof: true,
    endsAtEof: size <= PROBE_BYTES,
  });
  if (!headRecords.length) throw new Error('Pipeline data file holds no records');

  // Mean record size from the head sample. Every window size derives from this
  // rather than from a fixed byte count, because per-record size scales with
  // how many players a frame holds.
  const headBytes = size <= PROBE_BYTES ? size : head.lastIndexOf('\n') + 1;
  const meanRecordBytes = Math.max(
    1,
    Math.round(headBytes / headRecords.length)
  );

  const tailStart = Math.max(0, size - PROBE_BYTES);
  const tail =
    tailStart === 0 ? head : await fetcher.range(tailStart, size - 1);
  const tailRecords = parseWindow(tail, {
    startsAtBof: tailStart === 0,
    endsAtEof: true,
  });
  const lastRecord = tailRecords[tailRecords.length - 1] ?? headRecords[0];

  const entries: IndexEntry[] = [entryFrom(headRecords[0], 0)];

  for (let i = 1; i <= probes; i++) {
    const at = Math.floor((size * i) / (probes + 1));
    if (at <= 0 || at >= size) continue;
    const end = Math.min(size, at + PROBE_BYTES) - 1;
    const text = await fetcher.range(at, end);
    const newlineAt = text.indexOf('\n');
    if (newlineAt < 0) continue;
    const records = parseWindow(text, {
      startsAtBof: false,
      endsAtEof: end === size - 1,
    });
    if (!records.length) continue;
    insertEntryInto(entries, entryFrom(records[0], at + newlineAt + 1));
  }

  return {
    size,
    acceptsRanges: true,
    first: entries[0],
    last: entryFrom(lastRecord, size),
    meanRecordBytes,
    entries,
  };
}

function insertEntryInto(entries: IndexEntry[], entry: IndexEntry): void {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].offset < entry.offset) lo = mid + 1;
    else hi = mid;
  }
  if (entries[lo]?.offset === entry.offset) return;
  entries.splice(lo, 0, entry);
}

/** Record an offset observed while fetching, so later estimates improve. */
export function insertEntry(index: JsonlIndex, entry: IndexEntry): void {
  insertEntryInto(index.entries, entry);
}

/**
 * Estimate the byte offset of the record at time `t`.
 *
 * Linear interpolation between the two bracketing known entries. Records are
 * near-uniform in size, so this lands close; the caller corrects from what it
 * actually reads and feeds the correction back through insertEntry.
 */
export function estimateOffset(index: JsonlIndex, t: number): number {
  const entries = index.entries;
  if (t <= entries[0].t) return entries[0].offset;

  const tail = { offset: index.last.offset, t: index.last.t };
  for (let i = 0; i < entries.length; i++) {
    const lo = entries[i];
    const hi = entries[i + 1] ?? tail;
    if (t > hi.t) continue;
    const span = hi.t - lo.t;
    if (span <= 0) return lo.offset;
    const ratio = (t - lo.t) / span;
    return Math.round(lo.offset + ratio * (hi.offset - lo.offset));
  }
  return entries[entries.length - 1].offset;
}
