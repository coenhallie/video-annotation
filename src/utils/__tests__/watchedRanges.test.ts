import { describe, it, expect } from 'vitest';
import {
  mergeRanges,
  addSecond,
  percentFromRanges,
  type WatchedRange,
} from '@/utils/watchedRanges';

describe('mergeRanges', () => {
  it('merges overlapping and touching ranges', () => {
    expect(
      mergeRanges([
        [0, 3],
        [2, 5],
        [5, 6],
      ])
    ).toEqual([[0, 6]]);
  });

  it('keeps disjoint ranges separate and sorts them', () => {
    expect(
      mergeRanges([
        [10, 12],
        [0, 2],
      ])
    ).toEqual([
      [0, 2],
      [10, 12],
    ]);
  });

  it('drops empty/inverted ranges and does not mutate input', () => {
    const input: WatchedRange[] = [
      [5, 5],
      [3, 1],
      [0, 1],
    ];
    const copy = JSON.parse(JSON.stringify(input));
    expect(mergeRanges(input)).toEqual([[0, 1]]);
    expect(input).toEqual(copy);
  });
});

describe('addSecond', () => {
  it('extends the current range during continuous playback', () => {
    let r: WatchedRange[] = [];
    r = addSecond(r, 0.2);
    r = addSecond(r, 1.1);
    r = addSecond(r, 2.7);
    expect(r).toEqual([[0, 3]]);
  });

  it('starts a new range after a seek, leaving the gap unwatched', () => {
    let r: WatchedRange[] = [[0, 3]];
    r = addSecond(r, 30.5);
    expect(r).toEqual([
      [0, 3],
      [30, 31],
    ]);
  });

  it('ignores negative and non-finite times', () => {
    expect(addSecond([], -1)).toEqual([]);
    expect(addSecond([], NaN)).toEqual([]);
  });
});

describe('percentFromRanges', () => {
  it('computes unique coverage percent', () => {
    expect(percentFromRanges([[0, 10]], 100)).toBe(10);
  });

  it('rewatching does not inflate; clamps to 100', () => {
    expect(
      percentFromRanges(
        [
          [0, 10],
          [0, 10],
          [0, 12],
        ],
        10
      )
    ).toBe(100);
  });

  it('ignores coverage beyond duration (last partial second)', () => {
    // 9.5s video: marking second 9 stores [9,10); only 0.5s of it counts
    expect(percentFromRanges([[9, 10]], 9.5)).toBe(5.3);
  });

  it('returns 0 for zero/unknown duration', () => {
    expect(percentFromRanges([[0, 5]], 0)).toBe(0);
    expect(percentFromRanges([], 100)).toBe(0);
  });
});
