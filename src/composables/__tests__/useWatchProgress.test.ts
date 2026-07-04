import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';

const getProgressMock = vi.fn();
const upsertProgressMock = vi.fn();

vi.mock('@/services/watchProgressService', () => ({
  getProgress: (...a: unknown[]) => getProgressMock(...a),
  upsertProgress: (...a: unknown[]) => upsertProgressMock(...a),
}));

async function setup(overrides: Partial<Record<'videoId' | 'userId', string | null>> = {}) {
  const { useWatchProgress } = await import('@/composables/useWatchProgress');
  const videoId = ref<string | null>('videoId' in overrides ? overrides.videoId : 'v1');
  const userId = ref<string | null>('userId' in overrides ? overrides.userId : 'u1');
  const duration = ref(100);
  const wp = useWatchProgress({ videoId, duration, userId });
  // let the immediate load settle
  await Promise.resolve();
  await Promise.resolve();
  return { wp, videoId, userId, duration };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-04T12:00:00Z'));
  getProgressMock.mockReset().mockResolvedValue(null);
  upsertProgressMock.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useWatchProgress', () => {
  it('accumulates percent while playing and ignores paused updates', async () => {
    const { wp } = await setup();
    for (let t = 0; t < 10; t++) wp.onTimeUpdate(t + 0.5, true);
    expect(wp.percentWatched.value).toBe(10);
    wp.onTimeUpdate(50, false); // paused scrub — not counted
    expect(wp.percentWatched.value).toBe(10);
  });

  it('does not track without a signed-in user', async () => {
    const { wp } = await setup({ userId: null });
    wp.onTimeUpdate(1, true);
    expect(wp.percentWatched.value).toBe(0);
    await wp.flush();
    expect(upsertProgressMock).not.toHaveBeenCalled();
  });

  it('throttles persistence to one upsert per 10s window', async () => {
    const { wp } = await setup();
    wp.onTimeUpdate(0, true); // first mark flushes immediately
    expect(upsertProgressMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    wp.onTimeUpdate(5, true); // within window — no flush
    expect(upsertProgressMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6000);
    wp.onTimeUpdate(11, true); // window elapsed — flush
    expect(upsertProgressMock).toHaveBeenCalledTimes(2);
  });

  it('flush is a no-op when nothing changed', async () => {
    const { wp } = await setup();
    await wp.flush();
    expect(upsertProgressMock).not.toHaveBeenCalled();
  });

  it('merges previously stored ranges into the live percent', async () => {
    getProgressMock.mockResolvedValue({
      userId: 'u1',
      videoId: 'v1',
      watchedRanges: [[0, 20]],
      percentWatched: 20,
    });
    const { wp } = await setup();
    expect(wp.percentWatched.value).toBe(20);
    wp.onTimeUpdate(50.2, true);
    expect(wp.percentWatched.value).toBe(21);
  });

  it('merges DB-stored ranges with seconds marked while the load was in flight', async () => {
    const { useWatchProgress } = await import('@/composables/useWatchProgress');
    let resolveLoad!: (value: unknown) => void;
    getProgressMock.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
    );
    const videoId = ref<string | null>('v1');
    const userId = ref<string | null>('u1');
    const duration = ref(100);
    const wp = useWatchProgress({ videoId, duration, userId });

    // The load kicked off synchronously (immediate watcher) but is still
    // pending — mark a second while it's in flight.
    wp.onTimeUpdate(0.5, true);
    expect(wp.percentWatched.value).toBe(1);

    resolveLoad({
      userId: 'u1',
      videoId: 'v1',
      watchedRanges: [[10, 20]],
      percentWatched: 10,
    });
    await Promise.resolve();
    await Promise.resolve();

    // Stored [10,20) = 10s plus the live-marked [0,1) = 1s → 11/100 = 11%.
    expect(wp.percentWatched.value).toBe(11);
  });

  it('sanitizes malformed DB-stored watchedRanges instead of throwing', async () => {
    getProgressMock.mockResolvedValue({
      userId: 'u1',
      videoId: 'v1',
      watchedRanges: [['a', 'b'], [5], {}, [0, 10]] as any,
      percentWatched: 0,
    });
    const { wp } = await setup();
    expect(wp.percentWatched.value).toBe(10);
  });

  it('reloads when the video changes', async () => {
    const { wp, videoId } = await setup();
    wp.onTimeUpdate(3, true);
    videoId.value = 'v2';
    await nextTick(); // let the [videoId, userId] watcher fire
    await Promise.resolve();
    await Promise.resolve();
    expect(getProgressMock).toHaveBeenLastCalledWith('v2', 'u1');
    expect(wp.percentWatched.value).toBe(0);
  });
});
