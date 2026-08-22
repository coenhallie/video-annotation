import { describe, it, expect, vi } from 'vitest';
import { usePipelineReplay } from '@/composables/usePipelineReplay';
import type { RangeFetcher } from '@/lib/pipelineData/jsonlIndex';

const RECORD_BYTES = 400;

function fakeFile(count: number, startFrame = 457, t0 = 1000, dt = 0.04) {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const body: Record<string, unknown> = {
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
    body.pad = 'p'.repeat(Math.max(0, RECORD_BYTES - JSON.stringify(body).length));
    lines.push(JSON.stringify(body));
  }
  return lines.join('\n');
}

function counting(text: string) {
  const calls: Array<[number, number]> = [];
  const fetcher: RangeFetcher = {
    async head() {
      return { size: text.length, acceptsRanges: true };
    },
    async range(start, end) {
      calls.push([start, end]);
      return text.slice(start, end + 1);
    },
  };
  return { fetcher, calls };
}

/** A hand-driven rAF: nothing runs until the test calls tick(). */
function manualClock() {
  let queued: ((ms: number) => void) | null = null;
  return {
    raf: (cb: (ms: number) => void) => {
      queued = cb;
      return 1;
    },
    caf: () => {
      queued = null;
    },
    tick(ms: number) {
      const cb = queued;
      queued = null;
      cb?.(ms);
    },
    get pending() {
      return queued !== null;
    },
  };
}

describe('usePipelineReplay', () => {
  it('reports empty when no fetcher is available', async () => {
    const r = usePipelineReplay({ openFetcher: async () => null });
    await r.load();
    expect(r.state.value).toBe('empty');
  });

  it('reports error when opening the fetcher throws', async () => {
    const r = usePipelineReplay({
      openFetcher: async () => {
        throw new Error('boom');
      },
    });
    await r.load();
    expect(r.state.value).toBe('error');
    expect(r.error.value).toContain('boom');
  });

  it('exposes duration, total frames and fps after loading', async () => {
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    expect(r.state.value).toBe('ready');
    expect(r.duration.value).toBeCloseTo(499 * 0.04, 2);
    expect(r.totalFrames.value).toBe(500);
    expect(r.fps.value).toBe(25);
  });

  it('starts at the first record', async () => {
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    expect(r.currentTime.value).toBe(0);
    expect(r.currentFrame.value).toBe(457);
    expect(r.frame.value).not.toBeNull();
  });

  it('seeks to the record bracketing the requested time', async () => {
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    await r.seek(4);
    expect(r.currentFrame.value).toBe(457 + 100);
    expect(r.currentTime.value).toBeCloseTo(4, 2);
  });

  // Also the regression test for the quarter-window backoff in recordAt.
  // index.last.offset is the file size, so estimateOffset at the very end
  // returns a byte past the last record; without the backoff the window is
  // empty and currentFrame never reaches the final frame.
  it('clamps a seek past the end and still finds the last record', async () => {
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    await r.seek(9999);
    expect(r.currentFrame.value).toBe(457 + 499);
  });

  it('clamps a negative seek to zero', async () => {
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    await r.seek(-5);
    expect(r.currentTime.value).toBe(0);
  });

  it('advances the clock while playing and stops on pause', async () => {
    const clock = manualClock();
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
    });
    await r.load();

    r.play();
    expect(r.isPlaying.value).toBe(true);
    clock.tick(0);
    clock.tick(1000);
    expect(r.currentTime.value).toBeCloseTo(1, 1);

    r.pause();
    expect(r.isPlaying.value).toBe(false);
    expect(clock.pending).toBe(false);
  });

  it('pauses itself at the end of the data', async () => {
    const clock = manualClock();
    const { fetcher } = counting(fakeFile(50));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
    });
    await r.load();
    r.play();
    clock.tick(0);
    clock.tick(60_000);
    expect(r.isPlaying.value).toBe(false);
    expect(r.currentTime.value).toBeCloseTo(r.duration.value, 2);
  });

  it('serves a second seek inside a cached window without refetching', async () => {
    const { fetcher, calls } = counting(fakeFile(2000));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    await r.seek(20);
    const after = calls.length;
    await r.seek(20.4);
    expect(calls.length).toBe(after);
  });

  it('evicts the oldest window past the LRU limit', async () => {
    const { fetcher, calls } = counting(fakeFile(4000));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      lruSize: 2,
    });
    await r.load();
    await r.seek(10);
    await r.seek(50);
    await r.seek(90);
    const before = calls.length;
    await r.seek(10);
    expect(calls.length).toBeGreaterThan(before);
  });

  it('prefetches the next window before playback reaches the boundary', async () => {
    const clock = manualClock();
    const { fetcher, calls } = counting(fakeFile(4000));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
      windowSeconds: 10,
    });
    await r.load();
    await r.seek(9);
    await r.whenIdle();
    const before = calls.length;

    r.play();
    clock.tick(0);
    clock.tick(100);
    await r.whenIdle();

    // Still inside the first window, but the next one is already on its way.
    expect(r.currentTime.value).toBeLessThan(10);
    expect(calls.length).toBeGreaterThan(before);
    r.pause();
  });

  it('does not stack prefetches while one is in flight', async () => {
    const clock = manualClock();
    const { fetcher, calls } = counting(fakeFile(4000));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
      windowSeconds: 10,
    });
    await r.load();
    await r.seek(9);
    await r.whenIdle();
    const before = calls.length;

    r.play();
    clock.tick(0);
    clock.tick(20);
    clock.tick(40);
    clock.tick(60);
    await r.whenIdle();

    expect(calls.length).toBe(before + 1);
    r.pause();
  });

  it('stops the clock on dispose', async () => {
    const clock = manualClock();
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
    });
    await r.load();
    r.play();
    r.dispose();
    expect(clock.pending).toBe(false);
    expect(r.isPlaying.value).toBe(false);
  });
});
