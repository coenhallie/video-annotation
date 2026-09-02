import { describe, it, expect } from 'vitest';
import {
  buildIndex,
  estimateOffset,
  insertEntry,
  MAX_WHOLE_FILE_READ_BYTES,
  type RangeFetcher,
  type JsonlIndex,
} from '@/lib/pipelineData/jsonlIndex';

/** A file of `count` records, each padded to a fixed width so offsets are exact. */
function fakeFile(count: number, startFrame = 457, t0 = 1208.4, dt = 0.04) {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const body = {
      match_id: 1,
      teams: [{ team_id: 0, players: [], actions: [] }],
      balls: [],
      state: { actions: [] },
      frame_data: [
        {
          frame_count: startFrame + i,
          frame_uuid: [{ timestamp: Number((t0 + i * dt).toFixed(4)), uuid: 'x' }],
        },
      ],
      pad: '',
    };
    let line = JSON.stringify(body);
    // Pad every record to exactly 400 bytes so byte offsets are predictable.
    const padding = 400 - line.length;
    body.pad = 'p'.repeat(Math.max(0, padding));
    line = JSON.stringify(body);
    lines.push(line);
  }
  return lines.join('\n');
}

function fetcherFor(text: string, acceptsRanges = true): RangeFetcher {
  return {
    async head() {
      return { size: text.length, acceptsRanges };
    },
    async range(start: number, endInclusive: number) {
      return text.slice(start, endInclusive + 1);
    },
  };
}

describe('buildIndex', () => {
  it('reads the first and last record', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    expect(index.first.frameCount).toBe(457);
    expect(index.last.frameCount).toBe(457 + 499);
  });

  it('reports a duration spanning the whole file', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    expect(index.last.t - index.first.t).toBeCloseTo(499 * 0.04, 3);
  });

  it('keeps entries sorted by offset', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    const offsets = index.entries.map((e) => e.offset);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });

  it('measures a plausible mean record size', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    expect(index.meanRecordBytes).toBeGreaterThan(300);
    expect(index.meanRecordBytes).toBeLessThan(500);
  });

  it('handles a single-record file', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(1)));
    expect(index.first.frameCount).toBe(457);
    expect(index.last.frameCount).toBe(457);
    expect(index.last.t - index.first.t).toBe(0);
  });

  it('reports when ranges are unsupported', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(50), false));
    expect(index.acceptsRanges).toBe(false);
    expect(index.first.frameCount).toBe(457);
    expect(index.last.frameCount).toBe(457 + 49);
  });

  it('rejects an empty file rather than requesting a negative range', async () => {
    const calls: Array<[number, number]> = [];
    const fetcher: RangeFetcher = {
      async head() {
        return { size: 0, acceptsRanges: false };
      },
      async range(start: number, end: number) {
        calls.push([start, end]);
        return '';
      },
    };
    await expect(buildIndex(fetcher)).rejects.toThrow(/empty/i);
    expect(calls).toEqual([]);
  });

  it('refuses a large no-ranges file rather than reading it whole', async () => {
    const calls: Array<[number, number]> = [];
    const fetcher: RangeFetcher = {
      async head() {
        return { size: MAX_WHOLE_FILE_READ_BYTES + 1, acceptsRanges: false };
      },
      async range(start: number, end: number) {
        calls.push([start, end]);
        return '';
      },
    };
    await expect(buildIndex(fetcher)).rejects.toThrow(/too large/i);
    expect(calls).toEqual([]);
  });
});

describe('estimateOffset', () => {
  it('returns the first offset for the start of the file', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    expect(estimateOffset(index, index.first.t)).toBe(index.first.offset);
  });

  it('lands within one window of the true offset mid-file', async () => {
    const text = fakeFile(500);
    const index = await buildIndex(fetcherFor(text));
    const target = index.first.t + 250 * 0.04;
    const guess = estimateOffset(index, target);
    expect(Math.abs(guess - 250 * 400)).toBeLessThan(20 * 400);
  });

  it('clamps a target past the end to the last known offset', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    expect(estimateOffset(index, index.last.t + 1000)).toBeLessThanOrEqual(
      index.last.offset
    );
  });
});

describe('insertEntry', () => {
  it('keeps the entry list sorted and makes later estimates better', async () => {
    const index: JsonlIndex = await buildIndex(fetcherFor(fakeFile(500)));
    const truth = { offset: 250 * 400, frameCount: 457 + 250, t: index.first.t + 10 };
    insertEntry(index, truth);
    const offsets = index.entries.map((e) => e.offset);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    expect(estimateOffset(index, truth.t)).toBe(truth.offset);
  });

  it('does not duplicate an offset it already holds', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    const before = index.entries.length;
    insertEntry(index, { ...index.first });
    expect(index.entries.length).toBe(before);
  });
});
