import { describe, it, expect } from 'vitest';
import {
  timelineNumbersFor,
  annotationStampFor,
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

describe('annotationStampFor', () => {
  it('stamps the video surface frame and fps on the video tab', () => {
    expect(annotationStampFor('video', VIDEO, REPLAY)).toEqual({
      frame: VIDEO.currentFrame,
      fps: VIDEO.fps,
    });
  });

  it('stamps the replay frame and fps on the pipeline tab', () => {
    expect(annotationStampFor('pipeline', VIDEO, REPLAY)).toEqual({
      frame: REPLAY.currentFrame,
      fps: REPLAY.fps,
    });
  });

  it('falls back to 30fps when the active surface reports a zero fps', () => {
    const noFps: TimelineNumbers = { ...REPLAY, fps: 0 };
    expect(annotationStampFor('pipeline', VIDEO, noFps)).toEqual({
      frame: noFps.currentFrame,
      fps: 30,
    });
  });

  it('never blends video and replay when stamping', () => {
    const stamp = annotationStampFor('pipeline', VIDEO, REPLAY);
    expect(stamp.frame).not.toBe(VIDEO.currentFrame);
    expect(stamp.fps).not.toBe(VIDEO.fps);
  });
});
