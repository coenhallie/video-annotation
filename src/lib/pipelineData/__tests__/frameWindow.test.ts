import { describe, it, expect } from 'vitest';
import { readRecord, parseWindow } from '@/lib/pipelineData/frameWindow';

function record(frameCount: number, t: number, extra: object = {}) {
  return JSON.stringify({
    match_id: 1,
    pitch_dimensions: { length: 105, width: 68 },
    teams: [{ team_id: 0, players: [], actions: [] }],
    balls: [],
    state: { actions: [] },
    frame_data: [
      {
        frame_count: frameCount,
        frame_uuid: [
          { timestamp: t, uuid: 'a' },
          { timestamp: t + 0.04, uuid: 'b' },
        ],
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
