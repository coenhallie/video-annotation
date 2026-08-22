import { describe, it, expect } from 'vitest';
import { readRecord, parseWindow } from '@/lib/pipelineData/frameWindow';

const DT = 0.04;
const WINDOW_SIZE = 9; // matches the real pipeline's rolling window

/**
 * Build one JSONL record whose `frame_uuid` window ends at `t`, the frame's
 * own timestamp. Older entries are derived by subtracting DT per step, so
 * `t` is always the LAST entry and never the first (once the window is
 * full). This lets each test assert the timestamp it expects to get back,
 * rather than an arithmetic result.
 */
function record(
  frameCount: number,
  t: number,
  extra: object = {},
  windowSize: number = WINDOW_SIZE
) {
  const frame_uuid = Array.from({ length: windowSize }, (_, i) => ({
    timestamp: t - (windowSize - 1 - i) * DT,
    uuid: String.fromCharCode(97 + i),
  }));
  return JSON.stringify({
    match_id: 1,
    pitch_dimensions: { length: 105, width: 68 },
    teams: [{ team_id: 0, players: [], actions: [] }],
    balls: [],
    state: { actions: [] },
    frame_data: [
      {
        frame_count: frameCount,
        frame_uuid,
      },
    ],
    ...extra,
  });
}

const WHOLE = { startsAtBof: true, endsAtEof: true };
const MIDDLE = { startsAtBof: false, endsAtEof: false };

describe('readRecord', () => {
  it('reads frame count and timestamp', () => {
    const r = readRecord(record(457, 1208.44));
    expect(r?.frameCount).toBe(457);
    expect(r?.t).toBeCloseTo(1208.44, 5);
  });

  it('takes the LAST entry of the window, not the first', () => {
    // A full window where every entry is a distinguishable timestamp. If
    // readRecord ever regresses to frame_uuid[0], this asserts against the
    // oldest (stale) entry instead of the newest and fails.
    const line = JSON.stringify({
      frame_data: [
        {
          frame_count: 30426,
          frame_uuid: [
            { timestamp: 2619.529, uuid: 'a' },
            { timestamp: 2619.569, uuid: 'b' },
            { timestamp: 2619.609, uuid: 'c' },
            { timestamp: 2619.848, uuid: 'z' }, // the frame this record describes
          ],
        },
      ],
    });
    const r = readRecord(line);
    expect(r?.t).toBeCloseTo(2619.848, 5);
    expect(r?.t).not.toBeCloseTo(2619.529, 5);
  });

  it('takes the last entry even when the window is only partially filled', () => {
    // At the start of a run the window hasn't reached its full ~9 entries
    // yet. The old first-entry reasoning assumed a constant offset that
    // only holds once the window is full; a partial window is exactly
    // where it breaks. The last entry is still the frame's own timestamp.
    const twoEntries = record(2, 10.08, {}, 2);
    expect(readRecord(twoEntries)?.t).toBeCloseTo(10.08, 5);

    const oneEntry = record(1, 10.0, {}, 1);
    expect(readRecord(oneEntry)?.t).toBeCloseTo(10.0, 5);
  });

  it('unwraps a { match: ... } envelope', () => {
    const wrapped = JSON.stringify({ match: JSON.parse(record(12, 5)) });
    expect(readRecord(wrapped)?.frameCount).toBe(12);
  });

  it('drops frame_uuid from the retained frame but keeps frame_count', () => {
    const r = readRecord(record(9, 1));
    expect(r?.frame.frame_data?.[0]).toEqual({ frame_count: 9 });
  });

  it('returns null for malformed JSON', () => {
    expect(readRecord('{ not json')).toBeNull();
  });

  it('returns null when the record carries no frame_data', () => {
    expect(readRecord(JSON.stringify({ teams: [] }))).toBeNull();
  });

  it('returns null when frame_uuid is missing', () => {
    const line = JSON.stringify({
      frame_data: [{ frame_count: 1 }],
    });
    expect(readRecord(line)).toBeNull();
  });

  it('returns null when frame_uuid is empty', () => {
    const line = JSON.stringify({
      frame_data: [{ frame_count: 1, frame_uuid: [] }],
    });
    expect(readRecord(line)).toBeNull();
  });
});

describe('parseWindow', () => {
  it('keeps every record of a whole file', () => {
    const text = [record(1, 10), record(2, 10.04), record(3, 10.08)].join('\n');
    expect(parseWindow(text, WHOLE).map((r) => r.frameCount)).toEqual([1, 2, 3]);
  });

  it('keeps the final record when the range ends at EOF without a newline', () => {
    const text = [record(1, 10), record(2, 10.04)].join('\n');
    expect(parseWindow(text, WHOLE).map((r) => r.frameCount)).toEqual([1, 2]);
  });

  it('keeps the final record when the range ends at EOF with a trailing newline', () => {
    const text = [record(1, 10), record(2, 10.04)].join('\n') + '\n';
    expect(parseWindow(text, WHOLE).map((r) => r.frameCount)).toEqual([1, 2]);
  });

  it('discards both partial fragments of a mid-file range', () => {
    const text = 'ount": 99}]}\n' + record(2, 10.04) + '\n' + '{"match_id": 1, "fra';
    expect(parseWindow(text, MIDDLE).map((r) => r.frameCount)).toEqual([2]);
  });

  it('keeps the first record when the range starts at BOF', () => {
    const text = record(1, 10) + '\n' + record(2, 10.04) + '\n{"partial';
    const opts = { startsAtBof: true, endsAtEof: false };
    expect(parseWindow(text, opts).map((r) => r.frameCount)).toEqual([1, 2]);
  });

  it('skips a malformed line without dropping its neighbours', () => {
    const text = [record(1, 10), '{ broken', record(3, 10.08)].join('\n');
    expect(parseWindow(text, WHOLE).map((r) => r.frameCount)).toEqual([1, 3]);
  });

  it('handles CRLF line endings', () => {
    const text = [record(1, 10), record(2, 10.04)].join('\r\n');
    expect(parseWindow(text, WHOLE).map((r) => r.frameCount)).toEqual([1, 2]);
  });

  it('returns an empty array for a range holding no complete record', () => {
    expect(parseWindow('no newline here at all', MIDDLE)).toEqual([]);
  });
});
