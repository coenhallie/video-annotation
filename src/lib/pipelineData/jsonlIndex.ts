import { parseWindow, type ReplayRecord } from './frameWindow';

/** How much to read for each probe. Comfortably more than one record. */
export const PROBE_BYTES = 65536;

/**
 * Ceiling on reading a no-ranges object whole.
 *
 * When the server won't serve byte ranges, the fallback below reads the
 * entire object into memory once to build the index - and then `load()`'s
 * first `recordAt` reads it again in full, since the index it builds keeps
 * only the first record's offset. The producer emits files on the order of a
 * gigabyte; two full downloads of one of those would stall the tab. A file
 * small enough to read whole twice without anyone noticing is fine. One that
 * is not, is not - so refuse rather than attempt it.
 */
export const MAX_WHOLE_FILE_READ_BYTES = 8 * 1024 * 1024;

export interface IndexEntry {
  /**
   * Byte offset where this record starts, with one exception: on
   * `JsonlIndex.last` this is the file size, an exclusive end-of-data
   * boundary rather than a record start. See the note on `last`.
   */
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
  /**
   * The final record, with `offset` set to the file size rather than to that
   * record's own start byte.
   *
   * That makes `last` a correct upper bracket for interpolation, which is all
   * it is for: `estimateOffset` needs a `(offset, t)` pair beyond every real
   * entry. It also means `estimateOffset(index, last.t)` returns a byte one
   * past the last record, so a caller must NOT range-read forward from a
   * returned offset expecting to find that record there. Read a window that
   * ENDS at the estimate instead of starting at it, which is what the replay
   * loop does by backing its window start off by a quarter window.
   */
  last: IndexEntry;
  /** Measured, not assumed: window sizes are derived from this. */
  meanRecordBytes: number;
  /**
   * Sorted by offset. Densifies as the file is used.
   *
   * Typed non-empty because it is: construction seeds it with the first record
   * of the file and nothing ever removes an entry. Saying so here is what lets
   * `entries[0]` be read without inventing a fallback record for a case that
   * cannot occur.
   */
  entries: [IndexEntry, ...IndexEntry[]];
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

  // An empty object has no records to index, and the fallback below would ask
  // for `bytes=0--1`, which is not a valid range.
  if (size <= 0) throw new Error('Pipeline data file is empty');

  if (!acceptsRanges) {
    if (size > MAX_WHOLE_FILE_READ_BYTES) {
      throw new Error(
        `Pipeline data file is too large to read without range support (${size} bytes, limit ${MAX_WHOLE_FILE_READ_BYTES})`
      );
    }
    const text = await fetcher.range(0, size - 1);
    const records = parseWindow(text, { startsAtBof: true, endsAtEof: true });
    const firstRecord = records[0];
    const lastRecord = records[records.length - 1];
    if (!firstRecord || !lastRecord) {
      throw new Error('Pipeline data file holds no records');
    }
    return {
      size,
      acceptsRanges: false,
      first: entryFrom(firstRecord, 0),
      last: entryFrom(lastRecord, size),
      meanRecordBytes: Math.max(1, Math.round(size / records.length)),
      entries: [entryFrom(firstRecord, 0)],
    };
  }

  const head = await fetcher.range(0, Math.min(PROBE_BYTES, size) - 1);
  const headRecords = parseWindow(head, {
    startsAtBof: true,
    endsAtEof: size <= PROBE_BYTES,
  });
  const headFirst = headRecords[0];
  if (!headFirst) throw new Error('Pipeline data file holds no records');

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
  // Falls back to the first head record only when the tail window parsed to
  // nothing - the same record the old code fell back to, now provably defined.
  const lastRecord = tailRecords[tailRecords.length - 1] ?? headFirst;

  const entries: [IndexEntry, ...IndexEntry[]] = [entryFrom(headFirst, 0)];

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
    const probeFirst = records[0];
    if (!probeFirst) continue;
    insertEntryInto(entries, entryFrom(probeFirst, at + newlineAt + 1));
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

function insertEntryInto(
  entries: [IndexEntry, ...IndexEntry[]],
  entry: IndexEntry
): void {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midEntry = entries[mid];
    if (midEntry && midEntry.offset < entry.offset) lo = mid + 1;
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
  const [firstEntry] = entries;
  if (t <= firstEntry.t) return firstEntry.offset;

  const tail = { offset: index.last.offset, t: index.last.t };
  // Tracks the last entry actually visited, so the fall-through return uses a
  // real entry rather than an index the compiler cannot prove is in range.
  let lastVisited = firstEntry;
  for (let i = 0; i < entries.length; i++) {
    const lo = entries[i];
    if (!lo) continue;
    lastVisited = lo;
    const hi = entries[i + 1] ?? tail;
    if (t > hi.t) continue;
    const span = hi.t - lo.t;
    if (span <= 0) return lo.offset;
    const ratio = (t - lo.t) / span;
    return Math.round(lo.offset + ratio * (hi.offset - lo.offset));
  }
  return lastVisited.offset;
}
