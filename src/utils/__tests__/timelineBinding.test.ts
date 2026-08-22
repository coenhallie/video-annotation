import { describe, it, expect } from 'vitest';
import {
  timelineNumbersFor,
  type TimelineNumbers,
} from '@/utils/timelineBinding';

const VIDEO: TimelineNumbers = {
  currentTime: 12,
  duration: 600,
  currentFrame: 360,
  totalFrames: 18000,
  fps: 30,
  isPlaying: true,
};

const REPLAY: TimelineNumbers = {
  currentTime: 4,
  duration: 300,
  currentFrame: 557,
  totalFrames: 7500,
  fps: 25,
  isPlaying: false,
};

describe('timelineNumbersFor', () => {
  it('gives the video numbers on the video surface', () => {
    expect(timelineNumbersFor('video', VIDEO, REPLAY)).toEqual(VIDEO);
  });

  it('gives the replay numbers on the pipeline surface', () => {
    expect(timelineNumbersFor('pipeline', VIDEO, REPLAY)).toEqual(REPLAY);
  });

  it('never blends the two, so a position cannot leak across a tab switch', () => {
    const picked = timelineNumbersFor('pipeline', VIDEO, REPLAY);
    expect(picked.currentTime).toBe(REPLAY.currentTime);
    expect(picked.duration).toBe(REPLAY.duration);
    expect(picked.currentFrame).toBe(REPLAY.currentFrame);
    expect(picked.fps).toBe(REPLAY.fps);
    expect(picked.isPlaying).toBe(REPLAY.isPlaying);
  });

  it('falls back to the video numbers for an unrecognised surface', () => {
    expect(
      timelineNumbersFor('something-else' as never, VIDEO, REPLAY)
    ).toEqual(VIDEO);
  });
});
