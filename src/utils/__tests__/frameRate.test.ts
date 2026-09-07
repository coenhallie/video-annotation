import { describe, it, expect } from 'vitest';
import {
  frameRateFromMediaTimes,
  snapFrameRate,
  MIN_FRAME_DELTAS,
} from '../frameRate';

const times = (fps: number, count: number, start = 0) =>
  Array.from({ length: count }, (_, i) => start + i / fps);

describe('snapFrameRate', () => {
  it('snaps a near miss onto the common rate', () => {
    expect(snapFrameRate(24.9)).toBe(25);
    expect(snapFrameRate(29.98)).toBe(29.97);
    expect(snapFrameRate(59.9)).toBe(59.94);
  });

  it('keeps an unusual rate as measured, to three decimals', () => {
    expect(snapFrameRate(27.5)).toBe(27.5);
    expect(snapFrameRate(15.0004)).toBe(15);
  });
});

describe('frameRateFromMediaTimes', () => {
  it('reads an exact 25 fps from evenly presented frames', () => {
    expect(frameRateFromMediaTimes(times(25, 31))).toBe(25);
  });

  it('is unmoved by dropped frames, unlike a wall-clock count', () => {
    // Every third frame missing: the deltas are 1/25 and 2/25, and the median
    // is still one frame. Counting callbacks over elapsed time would say ~17.
    const presented = times(25, 60).filter((_, i) => i % 3 !== 2);
    expect(frameRateFromMediaTimes(presented)).toBe(25);
  });

  it('ignores a seek in the middle of the sample', () => {
    const sample = [...times(30, 12, 0), ...times(30, 12, 500), ...times(30, 12, 2)];
    expect(frameRateFromMediaTimes(sample)).toBe(30);
  });

  it('does not answer from too few frames', () => {
    expect(frameRateFromMediaTimes(times(25, MIN_FRAME_DELTAS))).toBeNull();
    expect(frameRateFromMediaTimes(times(25, MIN_FRAME_DELTAS + 1))).toBe(25);
  });

  it('reports 29.97 for NTSC material', () => {
    expect(frameRateFromMediaTimes(times(30000 / 1001, 31))).toBe(29.97);
  });
});
