import { describe, it, expect, vi } from 'vitest';

// annotations rows: two for video v1, one for comparison c1
const annotationRows = [
  { id: 'a1', videoId: 'v1', comparisonVideoId: null },
  { id: 'a2', videoId: 'v1', comparisonVideoId: null },
  { id: 'a3', videoId: null, comparisonVideoId: 'c1' },
];
const commentRows = [
  { annotationId: 'a1' },
  { annotationId: 'a1' },
  { annotationId: 'a3' },
];

function makeChain(rows: unknown[]) {
  const chain: any = {
    select: vi.fn(() => chain),
    in: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return chain;
}
let annCall = 0;
const fromMock = vi.fn((table: string) => {
  if (table === 'annotations') {
    annCall += 1;
    return makeChain(
      annCall === 1
        ? annotationRows.filter((r) => r.videoId)
        : annotationRows.filter((r) => r.comparisonVideoId)
    );
  }
  return makeChain(commentRows);
});
vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (t: string) => fromMock(t) },
}));

describe('getProjectCountsBatched', () => {
  it('buckets annotation and comment counts by project id', async () => {
    const { ProjectService } = await import('@/services/projectService');
    const projects: any = [
      { id: 'v1', projectType: 'single', video: { id: 'v1' } },
      { id: 'c1', projectType: 'dual', comparisonVideo: { id: 'c1' } },
    ];
    const { annotationCounts, commentCounts } =
      await ProjectService.getProjectCountsBatched(projects);
    expect(annotationCounts).toEqual({ v1: 2, c1: 1 });
    expect(commentCounts).toEqual({ v1: 2, c1: 1 });
    // two column-filtered annotations queries + one comments query = 3 table reads
    expect(fromMock.mock.calls.length).toBe(3);
  });
});
