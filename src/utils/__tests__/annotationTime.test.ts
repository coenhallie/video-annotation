import { describe, it, expect } from 'vitest';
import { annotationListTime } from '@/utils/annotationTime';

describe('annotationListTime', () => {
  it('is the plain timestamp for a single video', () => {
    expect(
      annotationListTime({ timestamp: 5, videoAFrame: 900 }, { isDualMode: false, fps: 30 })
    ).toBe(5);
  });

  it("is video A's stored timestamp in a comparison", () => {
    expect(
      annotationListTime(
        { timestamp: 0, videoAFrame: 647, videoATimestamp: 21.5 },
        { isDualMode: true, fps: 30 }
      )
    ).toBe(21.5);
  });

  it("derives it from video A's frame when no timestamp was stored", () => {
    expect(
      annotationListTime(
        { timestamp: 0, videoAFrame: 300, videoATimestamp: null },
        { isDualMode: true, fps: 25 }
      )
    ).toBe(12);
  });

  it('falls back to the plain timestamp when A has no position, and to 30 fps when the rate is unknown', () => {
    expect(annotationListTime({ timestamp: 7 }, { isDualMode: true, fps: 30 })).toBe(7);
    expect(
      annotationListTime({ timestamp: 0, videoAFrame: 60 }, { isDualMode: true, fps: 0 })
    ).toBe(2);
  });
});
