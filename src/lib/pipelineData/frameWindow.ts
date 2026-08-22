import type { Frame } from '@/lib/vis/types';

/** One JSONL record, reduced to what the replay and the renderer need. */
export interface ReplayRecord {
  /** The pipeline's own frame number. Not zero-based. */
  frameCount: number;
  /** Absolute record timestamp in seconds. Not zero-based. */
  t: number;
  /** The frame handed to the renderer. */
  frame: Frame;
}

/**
 * Read one JSONL line.
 *
 * Two shapes reach this. The stored file holds bare frames; the live socket
 * wraps them as `{ match: ... }` (see DataOutputView.vue:582 in
 * datalabelling-frontend). Accept both so one parser serves either source.
 *
 * `frame_uuid` is dropped from the retained frame. It is a rolling window of
 * roughly nine `{timestamp, uuid}` entries per record, it is the single largest
 * field, and the renderer never reads it. One timestamp is lifted out as `t`
 * before it goes.
 *
 * It must be the LAST entry, not the first. The window holds the last ~9
 * frames, so entry 0 is the OLDEST, about 0.32 s stale, and the final entry is
 * the frame this record actually describes. That is not merely a constant
 * offset that would cancel out of a relative timebase: while the window is
 * still filling at the start of a run it is short, so the lag varies exactly
 * where replay time is measured from.
 *
 * Source: datalabelling's data-analysis project, ingest/labels.py, which uses
 * `float(ts[-1])` and has scanned 32 matches end to end. Measured there on
 * match 1681: at frame 30,426 the window spanned 2619.529 to 2619.848.
 */
export function readRecord(line: string): ReplayRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const envelope = parsed as { match?: unknown };
  const frame = (envelope.match ?? parsed) as Frame;

  const meta = frame.frame_data?.[0] as
    | { frame_count?: number; frame_uuid?: { timestamp?: number }[] }
    | undefined;
  if (!meta || typeof meta.frame_count !== 'number') return null;

  const uuids = meta.frame_uuid;
  const t = uuids?.[uuids.length - 1]?.timestamp;
  if (typeof t !== 'number') return null;

  return {
    frameCount: meta.frame_count,
    t,
    frame: { ...frame, frame_data: [{ frame_count: meta.frame_count }] },
  };
}

/**
 * Parse a byte range into records.
 *
 * A range from the middle of the file starts and ends mid-record, and both
 * fragments have to go. The flags say which ends are real boundaries: without
 * `endsAtEof`, reading the tail of the file to find its last record silently
 * returns the second-to-last one instead.
 *
 * When `startsAtBof` is false, the caller MUST start the range at least one
 * byte BEFORE the intended record's first byte, so the leading fragment is
 * guaranteed to be a genuine partial (not a complete record).
 */
export function parseWindow(
  text: string,
  opts: { startsAtBof: boolean; endsAtEof: boolean }
): ReplayRecord[] {
  const lines = text.split('\n');

  if (!opts.startsAtBof) lines.shift();
  if (!opts.endsAtEof) lines.pop();

  const out: ReplayRecord[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    // Load-bearing: this guard filters the empty final element that split('\n')
    // produces when endsAtEof is true. Removing it silently reintroduces the
    // off-by-one bug this function exists to prevent.
    if (!line) continue;
    const record = readRecord(line);
    if (record) out.push(record);
  }
  return out;
}
