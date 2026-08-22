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
 * nine `{timestamp, uuid}` entries per record, it is the single largest field,
 * and the renderer never reads it. The first entry's timestamp is lifted out as
 * `t` before it goes.
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

  const t = meta.frame_uuid?.[0]?.timestamp;
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
    if (!line) continue;
    const record = readRecord(line);
    if (record) out.push(record);
  }
  return out;
}
