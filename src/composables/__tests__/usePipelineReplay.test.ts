import { describe, it, expect, vi } from 'vitest';
import { watch } from 'vue';
import { usePipelineReplay } from '@/composables/usePipelineReplay';
import type { RangeFetcher } from '@/lib/pipelineData/jsonlIndex';
import {
  bandedFile,
  recordAtTime,
  fetcherFor,
} from '@/lib/pipelineData/__tests__/taperedFixture';

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

/**
 * A fetcher whose reads can be held in flight, the way a real network holds
 * them. A fetcher that answers within the same microtask hides every bug that
 * only exists while a read is still on its way.
 */
function gated(text: string) {
  const calls: Array<{ start: number; end: number; signal: AbortSignal | undefined }> = [];
  let holding = false;
  const waiting: Array<() => void> = [];
  const fetcher: RangeFetcher = {
    async head() {
      return { size: text.length, acceptsRanges: true };
    },
    async range(start, end, signal) {
      calls.push({ start, end, signal });
      if (holding) await new Promise<void>((resolve) => waiting.push(resolve));
      return text.slice(start, end + 1);
    },
  };
  return {
    fetcher,
    calls,
    hold() {
      holding = true;
    },
    release() {
      holding = false;
      waiting.splice(0).forEach((resolve) => resolve());
    },
  };
}

/**
 * The frame fakeFile shows at a replay time: the last record whose stored
 * (4 dp) timestamp is at or before it. Computed the way the replay compares,
 * so a time a float's width either side of a record boundary still agrees.
 */
function frameAt(time: number, startFrame = 457, t0 = 1000, dt = 0.04): number {
  const target = t0 + time;
  const stamp = (i: number) => Number((t0 + i * dt).toFixed(4));
  let i = Math.max(0, Math.floor(time / dt));
  while (stamp(i + 1) <= target) i++;
  while (i > 0 && stamp(i) > target) i--;
  return startFrame + i;
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

  // The index already knows exactly where the first record is, so finding it
  // must not spend a round of probes spread across the whole file.
  it('reads only the first frame and its window after building the index', async () => {
    const { fetcher, calls } = counting(fakeFile(4000));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    // Head, tail and eight probes for the index; then one probe and one window.
    expect(calls.length).toBe(12);
  });

  // A server without range support can only hand over the whole object, so
  // the replay has to read it once and serve every frame from that. Larger
  // than one window on purpose: that is where a windowed read would be
  // narrower than the object and the fetcher would refuse it.
  it('plays a file served without range support from one whole read', async () => {
    const text = fakeFile(2000);
    const fetcher: RangeFetcher = {
      async head() {
        return { size: text.length, acceptsRanges: false };
      },
      async range(start, end) {
        if (start !== 0 || end !== text.length - 1) {
          throw new Error('only a whole-object read is valid');
        }
        return text;
      },
    };
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    expect(r.state.value).toBe('ready');
    expect(r.currentFrame.value).toBe(457);

    await r.seek(70);
    expect(r.state.value).toBe('ready');
    expect(r.currentFrame.value).toBe(frameAt(70));
  });

  it('seeks to the record bracketing the requested time', async () => {
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    await r.seek(4);
    expect(r.currentFrame.value).toBe(457 + 100);
    expect(r.currentTime.value).toBeCloseTo(4, 2);
  });

  // Also the regression test for centring the seek's probe on its estimate.
  // index.last.offset is the file size, so estimateOffset at the very end
  // returns a byte past the last record; a read starting there is empty and
  // currentFrame never reaches the final frame.
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

  it('replays from the start when play is pressed at the end', async () => {
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

    r.play();
    expect(r.currentTime.value).toBe(0);
    clock.tick(60_001);
    clock.tick(60_101);
    expect(r.isPlaying.value).toBe(true);
    expect(r.currentTime.value).toBeCloseTo(0.1, 2);
  });

  it('replays from the start when play is pressed on the last frame', async () => {
    const clock = manualClock();
    const { fetcher } = counting(fakeFile(50));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
    });
    await r.load();
    // Where scrubbing to the far end of the timeline lands: short of duration,
    // but inside the last frame.
    await r.seek(r.duration.value - 0.5 / r.fps.value);
    expect(r.currentTime.value).toBeGreaterThan(0);

    r.play();
    expect(r.currentTime.value).toBe(0);
    clock.tick(0);
    clock.tick(100);
    expect(r.isPlaying.value).toBe(true);
    expect(r.currentTime.value).toBeCloseTo(0.1, 2);
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

  it('does not reject or write state when disposed mid-fetch', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const text = fakeFile(2000);
    let stall = false;
    const fetcher = {
      async head() {
        return { size: text.length, acceptsRanges: true };
      },
      async range(start: number, end: number) {
        // Let the load complete normally; stall only the seek's reads.
        if (stall) await gate;
        return text.slice(start, end + 1);
      },
    };
    const rejections: unknown[] = [];
    const onRejection = (e: PromiseRejectionEvent | unknown) => rejections.push(e);
    process.on('unhandledRejection', onRejection);

    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    stall = true;
    const pending = r.seek(30);
    r.dispose();
    release();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.off('unhandledRejection', onRejection);
    expect(rejections).toEqual([]);
    expect(r.state.value).toBe('idle');
  });

  it('moves to error when a fetch rejects during a seek', async () => {
    const text = fakeFile(2000);
    let built = false;
    const fetcher = {
      async head() {
        return { size: text.length, acceptsRanges: true };
      },
      async range(start: number, end: number) {
        if (built) throw new Error('network is down');
        return text.slice(start, end + 1);
      },
    };
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    built = true;
    await r.seek(40);
    expect(r.state.value).toBe('error');
    expect(r.error.value).toContain('network is down');
    expect(r.isPlaying.value).toBe(false);
  });

  it('is inert after dispose: play does not re-arm the clock', async () => {
    const clock = manualClock();
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
    });
    await r.load();
    r.dispose();
    r.play();
    expect(r.isPlaying.value).toBe(false);
    expect(clock.pending).toBe(false);
  });

  it('shows the newer seek when two overlap out of order', async () => {
    const text = fakeFile(4000);
    const delays: number[] = [];
    let built = false;
    const fetcher = {
      async head() {
        return { size: text.length, acceptsRanges: true };
      },
      async range(start: number, end: number) {
        const slice = text.slice(start, end + 1);
        if (!built) return slice;
        // Make the FIRST post-load read resolve last, so an unguarded
        // implementation would show the older seek's frame.
        const delay = delays.length === 0 ? 20 : 0;
        delays.push(delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return slice;
      },
    };
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    built = true;

    const slow = r.seek(20);
    const fast = r.seek(60);
    await Promise.all([slow, fast]);

    expect(r.currentTime.value).toBeCloseTo(60, 1);
    expect(r.currentFrame.value).toBe(457 + Math.round(60 / 0.04));
  });

  it('still caches a prefetched window when playback seeks while it is in flight', async () => {
    const clock = manualClock();
    const text = fakeFile(4000);
    const calls: Array<[number, number]> = [];
    let slowFrom = false;
    const fetcher = {
      async head() {
        return { size: text.length, acceptsRanges: true };
      },
      async range(start: number, end: number) {
        calls.push([start, end]);
        const slice = text.slice(start, end + 1);
        if (slowFrom) await new Promise((resolve) => setTimeout(resolve, 10));
        return slice;
      },
    };

    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
      windowSeconds: 10,
    });
    await r.load();
    await r.seek(9);
    await r.whenIdle();
    slowFrom = true;

    r.play();
    clock.tick(0);
    // Several ticks while the prefetch is still in flight. Each one seeks, so
    // a seek-invalidated prefetch would be discarded and never cached.
    clock.tick(20);
    clock.tick(40);
    clock.tick(60);
    await r.whenIdle();
    r.pause();

    const afterPrefetch = calls.length;
    // The prefetched region must now be served from cache, not refetched.
    await r.seek(12);
    expect(calls.length).toBe(afterPrefetch);
  });

  it('does not let a disposed load clobber a newer one', async () => {
    // Large enough that the fresh load's initial window does not cover the
    // whole file: seeking far past it below must trigger a genuine fetch, so
    // whichever fetcher the closure currently holds actually gets exercised.
    // (A file that fits in one window would let this test pass vacuously,
    // since a clobbered `fetcher` that's never called again proves nothing.)
    const text = fakeFile(4000);
    const madeFetchers: string[] = [];
    let stall!: () => void;

    function fetcherNamed(name: string) {
      return {
        async head() {
          return { size: text.length, acceptsRanges: true };
        },
        async range(start: number, end: number) {
          madeFetchers.push(name);
          return text.slice(start, end + 1);
        },
      };
    }

    let openCount = 0;
    const r = usePipelineReplay({
      openFetcher: async () => {
        openCount += 1;
        if (openCount === 1) {
          // The first (soon to be disposed) load hangs here until released.
          await new Promise<void>((resolve) => {
            stall = resolve;
          });
          return fetcherNamed('stale');
        }
        return fetcherNamed('fresh');
      },
    });

    const first = r.load();
    r.dispose();
    const second = r.load();
    await second;

    // The fresh load's own index and first-frame reads prove the property so
    // far: nothing has reached the stale fetcher yet.
    expect(madeFetchers.length).toBeGreaterThan(0);
    expect(madeFetchers.every((name) => name === 'fresh')).toBe(true);

    // Release the stale load only after the fresh one has finished, so its
    // continuation resolves last. With the bug this is exactly when it would
    // clobber `fetcher`.
    stall();
    await first;

    madeFetchers.length = 0;
    // Seek well outside the window the fresh load already cached, so this
    // must call fetcher.range() again and thereby exercise whichever fetcher
    // the closure currently holds.
    await r.seek(100);

    expect(madeFetchers.length).toBeGreaterThan(0);
    expect(madeFetchers.every((name) => name === 'fresh')).toBe(true);
  });
});

describe('usePipelineReplay under network latency', () => {
  it('adds no reads for the frames that tick past a seek in flight', async () => {
    const clock = manualClock();
    const g = gated(fakeFile(20000));
    const r = usePipelineReplay({
      openFetcher: async () => g.fetcher,
      raf: clock.raf,
      caf: clock.caf,
    });
    await r.load();
    r.play();
    clock.tick(0);
    clock.tick(16);

    g.hold();
    const before = g.calls.length;
    void r.seek(600);
    // The seek's own first round of probes.
    const afterSeek = g.calls.length;
    expect(afterSeek - before).toBeGreaterThan(0);
    expect(afterSeek - before).toBeLessThanOrEqual(4);

    for (let ms = 32; ms < 1000; ms += 16) clock.tick(ms);
    expect(g.calls.length).toBe(afterSeek);
    g.release();
    await r.whenIdle();
    r.pause();
  });

  it('holds the clock while the record it needs is still loading', async () => {
    const clock = manualClock();
    const g = gated(fakeFile(20000));
    const r = usePipelineReplay({
      openFetcher: async () => g.fetcher,
      raf: clock.raf,
      caf: clock.caf,
    });
    await r.load();
    r.play();
    clock.tick(0);

    g.hold();
    void r.seek(600);
    for (let ms = 16; ms <= 1000; ms += 16) clock.tick(ms);
    // The playhead must not run ahead of a frame that has not been drawn.
    expect(r.currentTime.value).toBe(600);
    expect(r.buffering.value).toBe(true);

    g.release();
    await r.whenIdle();
    clock.tick(1016);
    clock.tick(1116);
    expect(r.currentTime.value).toBeGreaterThan(600);
    expect(r.currentFrame.value).toBe(frameAt(r.currentTime.value));
    expect(r.buffering.value).toBe(false);
    r.pause();
  });

  it('aborts the reads of a seek a newer one has replaced', async () => {
    const g = gated(fakeFile(20000));
    const r = usePipelineReplay({ openFetcher: async () => g.fetcher });
    await r.load();

    g.hold();
    void r.seek(200);
    const superseded = g.calls[g.calls.length - 1];
    const latest = r.seek(600);
    expect(superseded?.signal?.aborted).toBe(true);

    g.release();
    await latest;
    expect(r.currentFrame.value).toBe(frameAt(600));
  });

  it("shows a seek's frame before the window around it has arrived", async () => {
    const text = fakeFile(20000);
    let holdLarge = false;
    const waiting: Array<() => void> = [];
    const fetcher: RangeFetcher = {
      async head() {
        return { size: text.length, acceptsRanges: true };
      },
      async range(start, end) {
        // Anything bigger than a probe is a window: hold it.
        if (holdLarge && end - start + 1 > 100_000) {
          await new Promise<void>((resolve) => waiting.push(resolve));
        }
        return text.slice(start, end + 1);
      },
    };
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();

    holdLarge = true;
    const pending = r.seek(600);
    await vi.waitFor(() => expect(r.currentFrame.value).toBe(frameAt(600)));

    waiting.splice(0).forEach((resolve) => resolve());
    await pending;
  });

  it('prefetches from the byte the playing window ends at', async () => {
    const clock = manualClock();
    const { fetcher, calls } = counting(fakeFile(4000));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
      windowSeconds: 10,
    });
    await r.load();
    const playing = calls[calls.length - 1];
    const before = calls.length;

    r.play();
    clock.tick(0);
    clock.tick(2100);
    await r.whenIdle();
    r.pause();

    const prefetch = calls[before];
    expect(playing).toBeDefined();
    expect(prefetch).toBeDefined();
    // At most the record the playing window cut off is read again, plus the
    // one byte a ranged read backs up by.
    expect(prefetch![0]).toBeGreaterThanOrEqual(playing![1] - (RECORD_BYTES + 1));
  });

  it('plays across a prefetched window boundary without stalling', async () => {
    const clock = manualClock();
    const { fetcher } = counting(fakeFile(4000));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
      windowSeconds: 10,
    });
    await r.load();
    r.play();
    clock.tick(0);
    clock.tick(2100);
    await r.whenIdle();

    // Through the end of the first window and into the second.
    for (let ms = 2110; ms <= 12100; ms += 10) {
      clock.tick(ms);
      expect(r.buffering.value).toBe(false);
      expect(r.currentFrame.value).toBe(frameAt(r.currentTime.value));
    }
    r.pause();
  });
});

describe('usePipelineReplay seeking a file with uneven time per byte', () => {
  /**
   * The bug this covers: the timeline's playhead moved but the pitch did not.
   *
   * A seek estimates a byte offset by interpolating between the handful of
   * (offset, time) entries the index probes built. That interpolation is only
   * as good as the assumption that time runs evenly through the file's bytes,
   * and on a real export it does not - stretches with far fewer detections
   * pack many more records, and therefore many more seconds, into their share
   * of the bytes. The estimate then lands megabytes away from the target.
   *
   * The loop used to answer that by stepping exactly one window along, three
   * times, and then returning null. A null record shows nothing, so the pitch
   * kept displaying whatever frame it already had while `currentTime` - and
   * with it the timeline's playhead - moved on without it.
   */
  const BANDS = {
    bands: 18,
    bandBytes: 1_500_000,
    narrowBytes: 200,
    wideBytes: 8000,
  };
  // Built once: it is a 27 MB string, which is the point. The estimate is
  // exact on a small or uniform file, so neither can show this failing.
  const text = bandedFile(BANDS);

  it('draws the record the seek asked for, at every position in the file', async () => {
    const r = usePipelineReplay({ openFetcher: async () => fetcherFor(text) });
    await r.load();
    expect(r.state.value).toBe('ready');
    const count = r.totalFrames.value;

    for (const fraction of [0.05, 0.25, 0.45, 0.55, 0.75, 0.95]) {
      const time = r.duration.value * fraction;
      await r.seek(time);
      expect(r.currentFrame.value).toBe(457 + recordAtTime(time, { count }));
    }
  });

  it('lands on the same record whichever position it arrives from', async () => {
    const r = usePipelineReplay({ openFetcher: async () => fetcherFor(text) });
    await r.load();
    const count = r.totalFrames.value;
    const half = r.duration.value * 0.5;

    await r.seek(r.duration.value * 0.95);
    await r.seek(half);
    const fromAhead = r.currentFrame.value;

    await r.seek(0);
    await r.seek(half);
    expect(r.currentFrame.value).toBe(fromAhead);
    expect(fromAhead).toBe(457 + recordAtTime(half, { count }));
  });

  it('converges on a far seek in a few round trips instead of crawling', async () => {
    // Reads go out in rounds, several at once, so what a user waits on is the
    // number of rounds, not the number of reads. Each read here answers on a
    // later macrotask, which keeps one round's reads together and the next
    // round's apart.
    let rounds = 0;
    let roundOpen = false;
    const fetcher: RangeFetcher = {
      async head() {
        return { size: text.length, acceptsRanges: true };
      },
      async range(start, end) {
        if (!roundOpen) {
          rounds += 1;
          roundOpen = true;
          setTimeout(() => {
            roundOpen = false;
          }, 0);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        return text.slice(start, end + 1);
      },
    };
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();

    rounds = 0;
    await r.seek(r.duration.value * 0.55);
    // The rounds that find the record, plus one for the window after it. The
    // composable's round bound is a backstop against a pathological file, not
    // a budget a normal seek is expected to spend.
    expect(rounds).toBeLessThanOrEqual(5);
  });
});

describe('usePipelineReplay team phase', () => {
  /**
   * Team 0 carries the ball until `switchAt` seconds, team 1 after. Keepers at
   * -45 (team 0) and +45 (team 1), ball at x = 20. Records are padded wide,
   * so the probes a seek makes carry well under a second of history on their
   * own: the lookback has to be fetched on purpose.
   */
  function phaseFile(count: number, switchAt: number, width = 4000) {
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      const t = i * 0.04;
      const carrier = t < switchAt ? 0 : 1;
      const body: Record<string, unknown> = {
        teams: [
          {
            team_id: 0,
            players: [
              { track_id: 1, person_type: 'PersonType.PLAYER', projected_coordinates: { x: 0, y: 5 }, in_possession: carrier === 0 },
              { track_id: 2, person_type: 'PersonType.GOALKEEPER', projected_coordinates: { x: -45, y: 0 } },
            ],
          },
          {
            team_id: 1,
            players: [
              { track_id: 3, person_type: 'PersonType.PLAYER', projected_coordinates: { x: 0, y: -5 }, in_possession: carrier === 1 },
              { track_id: 4, person_type: 'PersonType.GOALKEEPER', projected_coordinates: { x: 45, y: 0 } },
            ],
          },
        ],
        balls: [{ projected_coordinates: { x: 20, y: 0 } }],
        state: { actions: [] },
        frame_data: [{ frame_count: 457 + i, frame_uuid: [{ timestamp: Number((1000 + t).toFixed(4)), uuid: 'x' }] }],
        pad: '',
      };
      body.pad = 'p'.repeat(Math.max(0, width - JSON.stringify(body).length));
      lines.push(JSON.stringify(body));
    }
    return lines.join('\n');
  }

  // 300 s of play, the hand-over at 150 s: far from the window loaded first.
  const text = phaseFile(7500, 150);

  it('reports the phase of the frame on screen', async () => {
    const r = usePipelineReplay({ openFetcher: async () => fetcherFor(text) });
    await r.load();
    await r.seek(100);
    await r.whenIdle();
    expect(r.phase.value).toMatchObject({ possession: 0, states: { 0: 'attacking', 1: 'defending' } });
  });

  // Just after the hand-over, team 1 has carried for 0.6 s: not yet enough,
  // so team 0 is still in possession. Telling that needs the seconds before
  // the frame, which a seek on its own does not load.
  it('looks back before a seek target', async () => {
    const r = usePipelineReplay({ openFetcher: async () => fetcherFor(text) });
    await r.load();
    await r.seek(150.6);
    await r.whenIdle();
    expect(r.phase.value?.possession).toBe(0);

    await r.seek(151.5);
    await r.whenIdle();
    expect(r.phase.value?.possession).toBe(1);
  });

  // The clock ticks at display rate and records arrive at the data's rate, so
  // most ticks bring no new record, and the phase itself holds for seconds at
  // a time. A new phase object on every tick re-rendered and repainted
  // everything that shows it, 120 times a second.
  it('keeps the same phase while playing on through a stretch where it does not change', async () => {
    const clock = manualClock();
    const r = usePipelineReplay({ openFetcher: async () => fetcherFor(text), raf: clock.raf, caf: clock.caf });
    await r.load();
    await r.seek(100);
    await r.whenIdle();
    const before = r.phase.value;
    let changes = 0;
    const stop = watch(r.phase, () => changes++, { flush: 'sync' });
    r.play();
    clock.tick(0);
    for (let ms = 8; ms <= 2000; ms += 8) {
      clock.tick(ms);
      await r.whenIdle();
    }
    r.pause();
    stop();
    expect(r.currentTime.value).toBeGreaterThan(101.9);
    expect(changes).toBe(0);
    expect(r.phase.value).toBe(before);
  });

  it('still changes the phase while playing, the moment it changes', async () => {
    const clock = manualClock();
    const r = usePipelineReplay({ openFetcher: async () => fetcherFor(text), raf: clock.raf, caf: clock.caf });
    await r.load();
    await r.seek(150.5);
    await r.whenIdle();
    expect(r.phase.value?.possession).toBe(0);
    r.play();
    clock.tick(0);
    for (let ms = 8; ms <= 1200; ms += 8) {
      clock.tick(ms);
      await r.whenIdle();
    }
    r.pause();
    // Team 1 has carried since 150 s: possession passes once it has for 1 s.
    expect(r.phase.value?.possession).toBe(1);
  });

  it('gives a frame the same phase whether it was reached by playing or by seeking', async () => {
    const clock = manualClock();
    const played = usePipelineReplay({ openFetcher: async () => fetcherFor(text), raf: clock.raf, caf: clock.caf });
    await played.load();
    await played.seek(149);
    await played.whenIdle();
    played.play();
    clock.tick(0);
    for (let ms = 40; ms <= 1640; ms += 40) {
      clock.tick(ms);
      await played.whenIdle();
    }
    played.pause();

    const sought = usePipelineReplay({ openFetcher: async () => fetcherFor(text) });
    await sought.load();
    await sought.seek(played.currentTime.value);
    await sought.whenIdle();

    expect(sought.currentFrame.value).toBe(played.currentFrame.value);
    expect(sought.phase.value).toEqual(played.phase.value);
  });
});

describe('usePipelineReplay ball trail', () => {
  /**
   * Player 1 has the ball until `passAt` seconds, then plays it along x at
   * 10 m/s, and nobody has it after. Padded wide like the phase file, so a
   * seek's probes do not carry the moment the ball was played.
   */
  function passFile(count: number, passAt: number, width = 4000) {
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      const t = i * 0.04;
      const body: Record<string, unknown> = {
        teams: [
          {
            team_id: 0,
            players: [
              { track_id: 1, person_type: 'PersonType.PLAYER', projected_coordinates: { x: 0, y: 5 }, in_possession: t < passAt },
            ],
          },
        ],
        balls: [{ projected_coordinates: { x: t < passAt ? 0 : (t - passAt) * 10, y: 5 } }],
        state: { actions: [] },
        frame_data: [{ frame_count: 457 + i, frame_uuid: [{ timestamp: Number((1000 + t).toFixed(4)), uuid: 'x' }] }],
        pad: '',
      };
      body.pad = 'p'.repeat(Math.max(0, width - JSON.stringify(body).length));
      lines.push(JSON.stringify(body));
    }
    return lines.join('\n');
  }

  const text = passFile(7500, 150);

  it('reports the trail of the frame on screen, from the frames before a seek target', async () => {
    const r = usePipelineReplay({ openFetcher: async () => fetcherFor(text) });
    await r.load();
    await r.seek(149);
    await r.whenIdle();
    expect(r.ballTrail.value).toBeNull();
    await r.seek(151);
    await r.whenIdle();
    expect(r.ballTrail.value).toEqual({ passes: [], from: { x: 0, y: 5 } });
    await r.seek(160);
    await r.whenIdle();
    expect(r.ballTrail.value).toBeNull();
  });

  it('gives a frame the same trail whether it was reached by playing or by seeking', async () => {
    const clock = manualClock();
    const played = usePipelineReplay({ openFetcher: async () => fetcherFor(text), raf: clock.raf, caf: clock.caf });
    await played.load();
    await played.seek(149);
    await played.whenIdle();
    played.play();
    clock.tick(0);
    for (let ms = 40; ms <= 2000; ms += 40) {
      clock.tick(ms);
      await played.whenIdle();
    }
    played.pause();
    expect(played.ballTrail.value).not.toBeNull();

    const sought = usePipelineReplay({ openFetcher: async () => fetcherFor(text) });
    await sought.load();
    await sought.seek(played.currentTime.value);
    await sought.whenIdle();

    expect(sought.currentFrame.value).toBe(played.currentFrame.value);
    expect(sought.ballTrail.value).toEqual(played.ballTrail.value);
  });
});

