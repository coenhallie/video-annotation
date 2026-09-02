import { describe, it, expect, vi, beforeEach } from 'vitest';

let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
let rejectWith: unknown = null;

const settle = () =>
  rejectWith ? Promise.reject(rejectWith) : Promise.resolve(queryResult);

const chain: Record<string, any> = {};
for (const m of ['select', 'eq', 'order', 'upsert']) {
  chain[m] = vi.fn(() => chain);
}
chain.maybeSingle = vi.fn(() => settle());
chain.then = (onFulfilled: any, onRejected: any) =>
  settle().then(onFulfilled, onRejected);

// Declares the table argument it is called with, so the call sites typecheck
// and toHaveBeenCalledWith can be checked against it.
const fromMock = vi.fn((_table?: unknown) => chain);

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

const fetchOwnersMock = vi.fn();
vi.mock('@/services/ownerEnrichmentService', () => ({
  fetchOwners: (...a: unknown[]) => fetchOwnersMock(...a),
}));

beforeEach(() => {
  fromMock.mockClear();
  fetchOwnersMock.mockReset();
  for (const m of ['select', 'eq', 'order', 'upsert', 'maybeSingle']) {
    chain[m].mockClear();
  }
  queryResult = { data: null, error: null };
  rejectWith = null;
  // error-path tests exercise the service's console.warn-and-swallow contract;
  // keep the test output pristine
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('getProgress', () => {
  it('returns the row for a user/video pair', async () => {
    const { getProgress } = await import('@/services/watchProgressService');
    const row = {
      userId: 'u1',
      videoId: 'v1',
      watchedRanges: [[0, 5]],
      percentWatched: 10,
    };
    queryResult = { data: row, error: null };
    expect(await getProgress('v1', 'u1')).toEqual(row);
    expect(fromMock).toHaveBeenCalledWith('video_watch_progress');
    expect(chain.eq).toHaveBeenCalledWith('videoId', 'v1');
    expect(chain.eq).toHaveBeenCalledWith('userId', 'u1');
  });

  it('returns null on error without throwing', async () => {
    const { getProgress } = await import('@/services/watchProgressService');
    queryResult = { data: null, error: { message: 'boom' } };
    expect(await getProgress('v1', 'u1')).toBeNull();
  });

  it('returns null on a rejected promise without throwing', async () => {
    const { getProgress } = await import('@/services/watchProgressService');
    rejectWith = new Error('network drop');
    await expect(getProgress('v1', 'u1')).resolves.toBeNull();
  });
});

describe('getProgressForVideo', () => {
  it('enriches rows with user info and falls back to Unknown', async () => {
    const { getProgressForVideo } = await import(
      '@/services/watchProgressService'
    );
    queryResult = {
      data: [
        { userId: 'u1', videoId: 'v1', watchedRanges: [], percentWatched: 80 },
        { userId: 'u2', videoId: 'v1', watchedRanges: [], percentWatched: 5 },
      ],
      error: null,
    };
    fetchOwnersMock.mockResolvedValue({
      u1: { id: 'u1', name: 'Alice' },
      u2: { id: 'u2', name: 'Unknown' },
    });
    const result = await getProgressForVideo('v1');
    expect(result.map((r) => r.user.name)).toEqual(['Alice', 'Unknown']);
    expect(fetchOwnersMock).toHaveBeenCalledWith(['u1', 'u2']);
  });

  it('returns [] on error', async () => {
    const { getProgressForVideo } = await import(
      '@/services/watchProgressService'
    );
    queryResult = { data: null, error: { message: 'boom' } };
    expect(await getProgressForVideo('v1')).toEqual([]);
  });

  it('returns [] on a rejected promise without throwing', async () => {
    const { getProgressForVideo } = await import(
      '@/services/watchProgressService'
    );
    rejectWith = new Error('network drop');
    await expect(getProgressForVideo('v1')).resolves.toEqual([]);
  });
});

describe('upsertProgress', () => {
  it('merges ranges, computes percent, and upserts on (userId,videoId)', async () => {
    const { upsertProgress } = await import(
      '@/services/watchProgressService'
    );
    queryResult = { data: null, error: null };
    const ok = await upsertProgress(
      'u1',
      'v1',
      [
        [0, 5],
        [3, 10],
      ],
      100
    );
    expect(ok).toBe(true);
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        watchedRanges: [[0, 10]],
        percentWatched: 10,
      }),
      { onConflict: 'userId,videoId' }
    );
  });

  it('returns false on error without throwing', async () => {
    const { upsertProgress } = await import(
      '@/services/watchProgressService'
    );
    queryResult = { data: null, error: { message: 'boom' } };
    expect(await upsertProgress('u1', 'v1', [[0, 1]], 10)).toBe(false);
  });

  it('returns false on a rejected promise without throwing', async () => {
    const { upsertProgress } = await import(
      '@/services/watchProgressService'
    );
    rejectWith = new Error('network drop');
    await expect(
      upsertProgress('u1', 'v1', [[0, 1]], 10)
    ).resolves.toBe(false);
  });
});

describe('mergeDualProgress', () => {
  it('takes the per-user minimum across the two videos, missing video = 0', async () => {
    const { mergeDualProgress } = await import(
      '@/services/watchProgressService'
    );
    const alice = { id: 'u1', name: 'Alice' };
    const bob = { id: 'u2', name: 'Bob' };
    const a = [
      { userId: 'u1', videoId: 'va', watchedRanges: [], percentWatched: 80, user: alice },
      { userId: 'u2', videoId: 'va', watchedRanges: [], percentWatched: 40, user: bob },
    ];
    const b = [
      { userId: 'u1', videoId: 'vb', watchedRanges: [], percentWatched: 20, user: alice },
    ];
    const merged = mergeDualProgress(a as any, b as any);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ userId: 'u1', percentWatched: 20 });
    expect(merged[1]).toMatchObject({ userId: 'u2', percentWatched: 0 });
  });
});
