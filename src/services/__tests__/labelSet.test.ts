import { describe, it, expect, vi } from 'vitest';

const annChain: any = { select: vi.fn(() => annChain), in: vi.fn(() =>
  Promise.resolve({ data: [
    { id: 'a1', videoId: 'v1', comparisonVideoId: null },
    { id: 'a2', videoId: 'v2', comparisonVideoId: null },
  ], error: null })) };
const joinChain: any = { select: vi.fn(() => joinChain), in: vi.fn(() =>
  Promise.resolve({ data: [
    { annotationId: 'a1', labelId: 'l1', labels: { id: 'l1', name: 'Foul', color: '#f00' } },
    { annotationId: 'a1', labelId: 'l1', labels: { id: 'l1', name: 'Foul', color: '#f00' } },
    { annotationId: 'a2', labelId: 'l2', labels: { id: 'l2', name: 'Goal', color: '#0f0' } },
  ], error: null })) };
const fromMock = vi.fn((t: string) => (t === 'annotations' ? annChain : joinChain));
vi.mock('@/composables/useSupabase', () => ({ supabase: { from: (t: string) => fromMock(t) } }));

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
});
