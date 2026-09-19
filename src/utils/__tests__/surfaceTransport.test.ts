import { describe, it, expect } from 'vitest';
import { surfaceTransport, type Transport } from '@/utils/surfaceTransport';

const fake = (playing = false): Transport & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    isPlaying: () => playing,
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    step: (n) => calls.push(`step:${n}`),
  };
};

describe('surfaceTransport', () => {
  // On the Pipeline tab the video is hidden behind the replay. Space, the arrow
  // keys and draw mode all drove it anyway: audio from a player nobody can see,
  // while the replay on screen kept running under a drawing.
  it('drives the replay, and leaves the hidden video alone, on the pipeline tab', () => {
    const video = fake();
    const replay = fake(true);
    const t = surfaceTransport(() => true, video, replay);

    expect(t.isPlaying()).toBe(true);
    t.pause();
    t.play();
    t.step(-1);

    expect(replay.calls).toEqual(['pause', 'play', 'step:-1']);
    expect(video.calls).toEqual([]);
  });

  it('drives the video on the video tab', () => {
    const video = fake();
    const replay = fake(true);
    const t = surfaceTransport(() => false, video, replay);

    expect(t.isPlaying()).toBe(false);
    t.play();

    expect(video.calls).toEqual(['play']);
    expect(replay.calls).toEqual([]);
  });

  it('follows a tab switch made after it was created', () => {
    const video = fake();
    const replay = fake();
    let onPipeline = false;
    const t = surfaceTransport(() => onPipeline, video, replay);
    onPipeline = true;

    t.pause();

    expect(replay.calls).toEqual(['pause']);
  });
});

describe('replayStepTarget', () => {
  it('moves one frame of replay time and stays inside the replay', async () => {
    const { replayStepTarget } = await import('@/utils/surfaceTransport');
    expect(replayStepTarget({ currentTime: 4, fps: 25, duration: 10 }, 1)).toBeCloseTo(4.04);
    expect(replayStepTarget({ currentTime: 0, fps: 25, duration: 10 }, -1)).toBe(0);
    expect(replayStepTarget({ currentTime: 10, fps: 25, duration: 10 }, 1)).toBe(10);
    expect(replayStepTarget({ currentTime: 4, fps: 0, duration: 10 }, 1)).toBeCloseTo(4 + 1 / 30);
  });
});
