import { describe, it, expect, vi, beforeEach } from 'vitest';

// A DELETE that RLS filters down to nothing answers 2xx with zero rows and no
// error. Treating that as success made the row vanish locally and come back on
// reload. Every delete here must read the deleted rows back and reject on none.
let result: { data: unknown; error: unknown } = { data: [], error: null };

const chain: Record<string, any> = {};
for (const m of ['select', 'eq', 'delete', 'single', 'maybeSingle']) {
  chain[m] = vi.fn(() => chain);
}
chain.then = (ok: any, bad: any) => Promise.resolve(result).then(ok, bad);

vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    from: () => chain,
    rpc: vi.fn(async () => ({ data: null, error: null })),
    storage: { from: () => ({ remove: vi.fn(async () => ({})) }) },
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
  getOptimizedSession: async () => null,
}));

beforeEach(() => {
  result = { data: [], error: null };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const cases: Array<[string, () => Promise<unknown>]> = [
  [
    'AnnotationService.deleteAnnotation',
    async () =>
      (await import('@/services/annotationService')).AnnotationService.deleteAnnotation('a1'),
  ],
  [
    'CommentService.deleteComment',
    async () =>
      (await import('@/services/commentService')).CommentService.deleteComment('c1'),
  ],
  [
    'comparisonVideoService.deleteComparisonVideo',
    async () =>
      (await import('@/services/comparisonVideoService')).ComparisonVideoService.deleteComparisonVideo('cv1'),
  ],
];

describe('deletes that affect no row', () => {
  it.each(cases)('%s rejects', async (_name, run) => {
    await expect(run()).rejects.toThrow(/permission|not found/i);
  });

  it.each(cases)('%s resolves when a row was deleted', async (_name, run) => {
    result = { data: [{ id: 'x' }], error: null };
    await expect(run()).resolves.toBeUndefined();
  });
});
