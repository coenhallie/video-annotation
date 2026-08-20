import { describe, it, expect, vi, beforeEach } from 'vitest';

let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
let rejectWith: unknown = null;

const settle = () =>
  rejectWith ? Promise.reject(rejectWith) : Promise.resolve(queryResult);

const chain: Record<string, any> = {};
for (const m of ['select', 'eq', 'order', 'limit', 'upsert']) {
  chain[m] = vi.fn(() => chain);
}
chain.then = (onFulfilled: any, onRejected: any) =>
  settle().then(onFulfilled, onRejected);

const fromMock = vi.fn(() => chain);

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

beforeEach(() => {
  fromMock.mockClear();
  for (const m of ['select', 'eq', 'order', 'limit', 'upsert']) {
    chain[m].mockClear();
  }
  queryResult = { data: null, error: null };
  rejectWith = null;
  // error-path tests exercise the service's console.warn-and-swallow contract;
  // keep the test output pristine
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('recordOpen', () => {
  it('upserts a single-video open on (userId,videoId)', async () => {
    const { recordOpen } = await import('@/services/recentOpensService');
    expect(await recordOpen('u1', { videoId: 'v1' })).toBe(true);

    expect(fromMock).toHaveBeenCalledWith('project_opens');
    const [row, options] = chain.upsert.mock.calls[0];
    expect(row).toMatchObject({
      userId: 'u1',
      videoId: 'v1',
      comparisonVideoId: null,
    });
    expect(options).toEqual({ onConflict: 'userId,videoId' });
  });

  it('upserts a comparison open on (userId,comparisonVideoId)', async () => {
    const { recordOpen } = await import('@/services/recentOpensService');
    expect(await recordOpen('u1', { comparisonVideoId: 'c1' })).toBe(true);

    const [row, options] = chain.upsert.mock.calls[0];
    expect(row).toMatchObject({
      userId: 'u1',
      videoId: null,
      comparisonVideoId: 'c1',
    });
    expect(options).toEqual({ onConflict: 'userId,comparisonVideoId' });
  });

  it('sends openedAt explicitly so re-opens actually move the timestamp', async () => {
    const { recordOpen } = await import('@/services/recentOpensService');
    const before = Date.now();
    await recordOpen('u1', { videoId: 'v1' });
    const [row] = chain.upsert.mock.calls[0];
    // DEFAULT now() fires on INSERT only, and PostgREST builds DO UPDATE SET
    // from the columns actually sent - omitting this would freeze every row at
    // its first-open time.
    expect(typeof row.openedAt).toBe('string');
    expect(Date.parse(row.openedAt)).toBeGreaterThanOrEqual(before);
  });

  it('returns false on error without throwing', async () => {
    const { recordOpen } = await import('@/services/recentOpensService');
    queryResult = { data: null, error: { message: 'boom' } };
    expect(await recordOpen('u1', { videoId: 'v1' })).toBe(false);
  });

  it('returns false on a rejected promise without throwing', async () => {
    const { recordOpen } = await import('@/services/recentOpensService');
    rejectWith = new Error('network drop');
    await expect(recordOpen('u1', { videoId: 'v1' })).resolves.toBe(false);
  });
});

describe('getRecentOpens', () => {
  it('keys both row shapes by project id', async () => {
    const { getRecentOpens } = await import('@/services/recentOpensService');
    queryResult = {
      data: [
        { videoId: 'v1', comparisonVideoId: null, openedAt: '2026-08-21T11:00:00Z' },
        { videoId: null, comparisonVideoId: 'c1', openedAt: '2026-08-21T09:00:00Z' },
      ],
      error: null,
    };
    expect(await getRecentOpens('u1')).toEqual({
      v1: '2026-08-21T11:00:00Z',
      c1: '2026-08-21T09:00:00Z',
    });
    expect(fromMock).toHaveBeenCalledWith('project_opens');
    expect(chain.eq).toHaveBeenCalledWith('userId', 'u1');
    expect(chain.order).toHaveBeenCalledWith('openedAt', { ascending: false });
  });

  it('returns {} on error', async () => {
    const { getRecentOpens } = await import('@/services/recentOpensService');
    queryResult = { data: null, error: { message: 'boom' } };
    expect(await getRecentOpens('u1')).toEqual({});
  });

  it('returns {} on a rejected promise without throwing', async () => {
    const { getRecentOpens } = await import('@/services/recentOpensService');
    rejectWith = new Error('network drop');
    await expect(getRecentOpens('u1')).resolves.toEqual({});
  });
});
