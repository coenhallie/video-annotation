import { describe, it, expect, vi } from 'vitest';

const annChain: any = { select: vi.fn(() => annChain), in: vi.fn(() =>
  Promise.resolve({ data: [{ id: 'a1' }, { id: 'a2' }], error: null })) };
const joinChain: any = { select: vi.fn(() => joinChain), in: vi.fn(() =>
  Promise.resolve({ data: [
    { labelId: 'l1', labels: { id: 'l1', name: 'Foul', color: '#f00' } },
    { labelId: 'l1', labels: { id: 'l1', name: 'Foul', color: '#f00' } },
    { labelId: 'l2', labels: { id: 'l2', name: 'Goal', color: '#0f0' } },
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
