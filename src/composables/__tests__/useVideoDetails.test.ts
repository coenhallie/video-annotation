/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getVideoAnnotations = vi.fn();
const getAllComparisonVideoAnnotations = vi.fn();

vi.mock('@/services/annotationService', () => ({
  AnnotationService: {
    getVideoAnnotations: (...a: unknown[]) => getVideoAnnotations(...a),
    getAllComparisonVideoAnnotations: (...a: unknown[]) =>
      getAllComparisonVideoAnnotations(...a),
  },
}));

const ann = (id: string, timestamp: number, labels: string[] = []) =>
  ({ id, timestamp, frame: Math.round(timestamp * 30), title: 't' + id, content: '', color: '#000', labels }) as any;

const singleProject = {
  id: 'p1',
  projectType: 'single',
  video: { id: 'v1' },
} as any;

const dualProject = {
  id: 'p2',
  projectType: 'dual',
  comparisonVideo: { id: 'c1' },
  videoA: { id: 'va' },
  videoB: { id: 'vb' },
} as any;

beforeEach(() => {
  getVideoAnnotations.mockReset();
  getAllComparisonVideoAnnotations.mockReset();
});

describe('mergeComparisonAnnotations', () => {
  it('merges the three groups and sorts by timestamp', async () => {
    const { mergeComparisonAnnotations } = await import('@/composables/useVideoDetails');
    const merged = mergeComparisonAnnotations({
      comparison: [ann('c', 5)],
      videoA: [ann('a', 1)],
      videoB: [ann('b', 3)],
    });
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('summarizeLabels', () => {
  it('counts label ids, resolves name/color, skips unknown ids, sorts by count desc', async () => {
    const { summarizeLabels } = await import('@/composables/useVideoDetails');
    const labelMap = new Map<string, any>([
      ['l1', { id: 'l1', name: 'Bug', color: '#f00' }],
      ['l2', { id: 'l2', name: 'Note', color: '#0f0' }],
    ]);
    const result = summarizeLabels(
      [ann('1', 0, ['l1', 'l2']), ann('2', 1, ['l1', 'unknown'])],
      labelMap
    );
    expect(result).toEqual([
      { id: 'l1', name: 'Bug', color: '#f00', count: 2 },
      { id: 'l2', name: 'Note', color: '#0f0', count: 1 },
    ]);
  });
});

describe('useVideoDetails.selectProject', () => {
  it('fetches single-project annotations via getVideoAnnotations', async () => {
    const { useVideoDetails } = await import('@/composables/useVideoDetails');
    getVideoAnnotations.mockResolvedValue([ann('1', 2), ann('2', 1)]);
    const d = useVideoDetails();
    await d.selectProject(singleProject);
    expect(getVideoAnnotations).toHaveBeenCalledWith('v1', 'p1');
    expect(d.annotations.value).toHaveLength(2);
    expect(d.loading.value).toBe(false);
  });

  it('fetches and merges dual-project annotations sorted by timestamp', async () => {
    const { useVideoDetails } = await import('@/composables/useVideoDetails');
    getAllComparisonVideoAnnotations.mockResolvedValue({
      comparison: [ann('c', 5)],
      videoA: [ann('a', 1)],
      videoB: [ann('b', 3)],
    });
    const d = useVideoDetails();
    await d.selectProject(dualProject);
    expect(getAllComparisonVideoAnnotations).toHaveBeenCalledWith('c1', 'va', 'vb');
    expect(d.annotations.value.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('caches per project id and does not refetch on re-select', async () => {
    const { useVideoDetails } = await import('@/composables/useVideoDetails');
    getVideoAnnotations.mockResolvedValue([ann('1', 0)]);
    const d = useVideoDetails();
    await d.selectProject(singleProject);
    await d.selectProject(singleProject);
    expect(getVideoAnnotations).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale fetch when a newer selection resolves first', async () => {
    const { useVideoDetails } = await import('@/composables/useVideoDetails');
    let resolveSlow!: (v: unknown) => void;
    getVideoAnnotations.mockImplementationOnce(
      () => new Promise((r) => (resolveSlow = r))
    );
    getAllComparisonVideoAnnotations.mockResolvedValue({
      comparison: [], videoA: [ann('a', 1)], videoB: [],
    });
    const d = useVideoDetails();
    const p1 = d.selectProject(singleProject); // slow, pending
    await d.selectProject(dualProject); // newer, resolves now
    resolveSlow([ann('stale', 9)]); // slow resolves late
    await p1;
    expect(d.annotations.value.map((x) => x.id)).toEqual(['a']);
  });

  it('sets error and empties annotations on fetch failure', async () => {
    const { useVideoDetails } = await import('@/composables/useVideoDetails');
    getVideoAnnotations.mockRejectedValue(new Error('boom'));
    const d = useVideoDetails();
    await d.selectProject(singleProject);
    expect(d.error.value).toBe('boom');
    expect(d.annotations.value).toEqual([]);
    expect(d.loading.value).toBe(false);
  });
});
