import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake table of 2,500 rows, 25 per parent. The fake honours `.in` and
// `.range` and caps every response at 1,000 rows, as PostgREST does.
const ROWS = Array.from({ length: 2500 }, (_, i) => ({ id: `r${i}`, parent: `p${i % 100}` }));
const calls: Array<{ ids: string[]; from: number; to: number }> = [];
let failWith: unknown = null;

vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    from: () => {
      let ids: string[] = [];
      const chain: any = {
        select: () => chain,
        in: (_c: string, v: string[]) => ((ids = v), chain),
        order: () => chain,
        range: (from: number, to: number) => {
          calls.push({ ids, from, to });
          if (failWith) return Promise.resolve({ data: null, error: failWith });
          const matching = ROWS.filter((r) => ids.includes(r.parent));
          return Promise.resolve({
            data: matching.slice(from, Math.min(to + 1, from + 1000)),
            error: null,
          });
        },
      };
      return chain;
    },
  },
}));

beforeEach(() => {
  calls.length = 0;
  failWith = null;
});

const parents = Array.from({ length: 100 }, (_, i) => `p${i}`);

describe('selectAllIn', () => {
  // A plain `.in(ids)` silently stops at the API's 1,000-row cap, so dashboard
  // counts were wrong for a library with more annotations than that.
  it('returns every matching row, past the 1,000-row response cap', async () => {
    const { selectAllIn } = await import('@/services/selectAllIn');
    const rows = await selectAllIn('annotations', 'id, parent', 'parent', parents);
    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map((r: any) => r.id)).size).toBe(2500);
  });

  // ~37 bytes per uuid: a few hundred ids in one URL exceeds gateway limits.
  it('never puts more than one chunk of ids in a request', async () => {
    const { selectAllIn, IN_CHUNK_SIZE } = await import('@/services/selectAllIn');
    await selectAllIn('annotations', 'id', 'parent', parents);
    expect(Math.max(...calls.map((c) => c.ids.length))).toBeLessThanOrEqual(IN_CHUNK_SIZE);
  });

  it('asks nothing for an empty id list', async () => {
    const { selectAllIn } = await import('@/services/selectAllIn');
    expect(await selectAllIn('annotations', 'id', 'parent', [])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('throws the database error instead of returning a partial result', async () => {
    const { selectAllIn } = await import('@/services/selectAllIn');
    failWith = { message: 'permission denied' };
    await expect(selectAllIn('annotations', 'id', 'parent', parents)).rejects.toMatchObject({
      message: 'permission denied',
    });
  });
});
