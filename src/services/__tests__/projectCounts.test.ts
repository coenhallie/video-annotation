import { describe, it, expect, vi } from 'vitest';

// annotations rows: two for video v1, one for comparison c1, none for v2
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

function makeChain(resolver: (column: string, ids: string[]) => unknown[]) {
  const chain: any = {
    select: vi.fn(() => chain),
    in: vi.fn((column: string, ids: string[]) =>
      Promise.resolve({ data: resolver(column, ids), error: null })
    ),
  };
  return chain;
}

// The annotations table is queried twice (once per filtered column), so we
// reuse a single chain instance to capture both `.in` calls in order.
const annotationsChain = makeChain((column) =>
  column === 'videoId'
    ? annotationRows.filter((r) => r.videoId)
    : annotationRows.filter((r) => r.comparisonVideoId)
);
const commentsChain = makeChain(() => commentRows);

const fromMock = vi.fn((table: string) =>
  table === 'annotations' ? annotationsChain : commentsChain
);
vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (t: string) => fromMock(t) },
}));

describe('getProjectCountsBatched', () => {
  it('buckets annotation and comment counts by project id, seeding zero counts for projects with no annotations', async () => {
    const { ProjectService } = await import('@/services/projectService');
    const projects: any = [
      { id: 'v1', projectType: 'single', video: { id: 'v1' } },
      { id: 'c1', projectType: 'dual', comparisonVideo: { id: 'c1' } },
      // v2 has no annotations at all — regression guard for seeding both
      // annotationCounts and commentCounts to 0 for every project id.
      { id: 'v2', projectType: 'single', video: { id: 'v2' } },
    ];

    const { annotationCounts, commentCounts } =
      await ProjectService.getProjectCountsBatched(projects);

    expect(annotationCounts).toEqual({ v1: 2, c1: 1, v2: 0 });
    expect(commentCounts).toEqual({ v1: 2, c1: 1, v2: 0 });
    expect(annotationCounts.v2).toBe(0);
    expect(commentCounts.v2).toBe(0);

    // two column-filtered annotations queries + one comments query = 3 table reads
    expect(fromMock.mock.calls.length).toBe(3);

    // Verify the annotations queries hit the correct column + id list, not
    // just "some query happened in the right order".
    expect(annotationsChain.in.mock.calls[0]).toEqual([
      'videoId',
      ['v1', 'v2'],
    ]);
    expect(annotationsChain.in.mock.calls[1]).toEqual([
      'comparisonVideoId',
      ['c1'],
    ]);

    // Comments query filtered by annotationId, containing exactly the
    // annotation ids discovered in the two annotations queries.
    const [commentColumn, commentIds] = commentsChain.in.mock.calls[0];
    expect(commentColumn).toBe('annotationId');
    expect([...commentIds].sort()).toEqual(['a1', 'a2', 'a3']);
  });
});
