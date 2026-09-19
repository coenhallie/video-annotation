import { describe, it, expect, vi, beforeEach } from 'vitest';

// Comment counts used to cost one HEAD request per annotation on every editor
// load - 300 annotations, 300 requests, three times over for a comparison. They
// now ride along in the annotations query as an embedded aggregate.
let rows: unknown[] = [];
const chain: Record<string, any> = {};
for (const m of ['select', 'eq', 'is']) chain[m] = vi.fn(() => chain);
chain.order = vi.fn(() => Promise.resolve({ data: rows, error: null }));
const fromMock = vi.fn((_table: string) => chain);

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (t: string) => fromMock(t) },
}));

const row = (id: string, comments: number) => ({
  id,
  timestamp: 1,
  annotation_labels: [{ labelId: 'l1' }],
  annotation_comments: [{ count: comments }],
});

beforeEach(() => {
  fromMock.mockClear();
  chain.select.mockClear();
  rows = [row('a1', 4), row('a2', 0)];
});

describe('annotation comment counts', () => {
  it('reads video annotation counts from the one annotations query', async () => {
    const { AnnotationService } = await import('@/services/annotationService');

    const result = await AnnotationService.getVideoAnnotations('v1', 'p1', true);

    expect(result.map((a: any) => [a.id, a.commentCount])).toEqual([
      ['a1', 4],
      ['a2', 0],
    ]);
    expect(fromMock.mock.calls.map((c) => c[0])).toEqual(['annotations']);
  });

  it('reads comparison annotation counts from the one annotations query', async () => {
    const { AnnotationService } = await import('@/services/annotationService');

    const result = await AnnotationService.getComparisonVideoAnnotations('c1', true);

    expect(result.map((a: any) => [a.id, a.commentCount])).toEqual([
      ['a1', 4],
      ['a2', 0],
    ]);
    expect(fromMock.mock.calls.map((c) => c[0])).toEqual(['annotations']);
  });

  it('does not ask for counts nobody wanted', async () => {
    const { AnnotationService } = await import('@/services/annotationService');

    await AnnotationService.getVideoAnnotations('v1', 'p1', false);

    expect(String(chain.select.mock.calls[0]?.[0])).not.toContain('annotation_comments');
  });
});
