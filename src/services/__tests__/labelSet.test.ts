import { describe, it, expect, vi } from 'vitest';

// Annotation rows as the one paged scan returns them, labels embedded.
const foul = { id: 'l1', name: 'Foul', color: '#f00' };
const goal = { id: 'l2', name: 'Goal', color: '#0f0' };
const rows = [
  { id: 'a1', videoId: 'v1', comparisonVideoId: null, annotation_labels: [
    { labelId: 'l1', labels: foul }, { labelId: 'l1', labels: foul },
  ] },
  { id: 'a2', videoId: 'v2', comparisonVideoId: null, annotation_labels: [{ labelId: 'l2', labels: goal }] },
  { id: 'a3', videoId: null, comparisonVideoId: 'c1', annotation_labels: [{ labelId: 'l2', labels: goal }] },
];
const selectAllIn = vi.fn(async (_t: string, _s: string, column: string, ids: string[]) =>
  rows.filter((r) => ids.includes((r as any)[column]))
);
vi.mock('@/services/selectAllIn', () => ({ selectAllIn }));
vi.mock('@/composables/useSupabase', () => ({ supabase: {} }));

describe('getLabelsForProjects', () => {
  it('returns the distinct labels across all annotations of the videos', async () => {
    const { LabelService } = await import('@/services/labelService');
    const labels = await LabelService.getLabelsForProjects(['v1', 'v2']);
    expect(labels.map((l) => l.id).sort()).toEqual(['l1', 'l2']);
  });
});

describe('getProjectLabelData', () => {
  it('maps each project key to the distinct label ids used on it', async () => {
    const { LabelService } = await import('@/services/labelService');
    const { labels, labelIdsByProject } =
      await LabelService.getProjectLabelData(['v1', 'v2']);
    expect(labels.map((l) => l.id).sort()).toEqual(['l1', 'l2']);
    expect(labelIdsByProject).toEqual({ v1: ['l1'], v2: ['l2'] });
  });

  it('returns empty data when no project ids are given', async () => {
    const { LabelService } = await import('@/services/labelService');
    expect(await LabelService.getProjectLabelData([])).toEqual({
      labels: [],
      labelIdsByProject: {},
    });
  });

  it('keys a comparison project by its comparison id', async () => {
    const { LabelService } = await import('@/services/labelService');
    const { labelIdsByProject } = await LabelService.getProjectLabelData(['v1'], ['c1']);
    expect(labelIdsByProject).toEqual({ v1: ['l1'], c1: ['l2'] });
  });
});
