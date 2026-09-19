import { describe, it, expect, vi, beforeEach } from 'vitest';

// Annotation rows as the one paged scan returns them: each carries its comment
// count as an embedded aggregate, so there is no second query over annotation ids.
const rows = [
  { id: 'a1', videoId: 'v1', comparisonVideoId: null, annotation_comments: [{ count: 2 }] },
  { id: 'a2', videoId: 'v1', comparisonVideoId: null, annotation_comments: [{ count: 0 }] },
  { id: 'a3', videoId: null, comparisonVideoId: 'c1', annotation_comments: [{ count: 1 }] },
];
const selectAllIn = vi.fn(async (_t: string, _s: string, column: string, ids: string[]) =>
  rows.filter((r) => ids.includes((r as any)[column]))
);
vi.mock('@/services/selectAllIn', () => ({ selectAllIn }));
vi.mock('@/composables/useSupabase', () => ({ supabase: {} }));

// Braces matter: vitest calls a function RETURNED from beforeEach as a teardown,
// and mockClear returns the mock itself.
beforeEach(() => {
  selectAllIn.mockClear();
});

const projects: any = [
  { id: 'v1', projectType: 'single', video: { id: 'v1' } },
  { id: 'c1', projectType: 'dual', comparisonVideo: { id: 'c1' } },
  // v2 has no annotations at all - regression guard for seeding both counts to
  // 0 for every project id.
  { id: 'v2', projectType: 'single', video: { id: 'v2' } },
];

describe('getProjectCountsBatched', () => {
  it('buckets annotation and comment counts by project id, seeding zeroes', async () => {
    const { ProjectService } = await import('@/services/projectService');

    const { annotationCounts, commentCounts } =
      await ProjectService.getProjectCountsBatched(projects);

    expect(annotationCounts).toEqual({ v1: 2, c1: 1, v2: 0 });
    expect(commentCounts).toEqual({ v1: 2, c1: 1, v2: 0 });
  });

  it('scans annotations once per id column, through the paged helper', async () => {
    const { ProjectService } = await import('@/services/projectService');
    await ProjectService.getProjectCountsBatched(projects);

    expect(selectAllIn.mock.calls.map((c) => [c[0], c[2], c[3]])).toEqual([
      ['annotations', 'videoId', ['v1', 'v2']],
      ['annotations', 'comparisonVideoId', ['c1']],
    ]);
  });

  // A counts failure used to be swallowed and shown as zeroes.
  it('rejects when the scan fails', async () => {
    const { ProjectService } = await import('@/services/projectService');
    selectAllIn.mockRejectedValueOnce({ message: 'permission denied' });
    await expect(ProjectService.getProjectCountsBatched(projects)).rejects.toMatchObject({
      message: 'permission denied',
    });
  });
});
