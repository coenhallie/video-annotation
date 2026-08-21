import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mirrors src/services/__tests__/scopeQueries.test.ts: a self-returning chain,
// so every builder call lands on the same set of spies.
const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  is: vi.fn(() => chain),
  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
};
const fromMock = vi.fn(() => chain);

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

const eqCalls = () => chain.eq.mock.calls.map((call: unknown[]) => call[0]);

beforeEach(() => {
  fromMock.mockClear();
  chain.select.mockClear();
  chain.eq.mockClear();
  chain.is.mockClear();
  chain.order.mockClear();
});

describe('AnnotationService.getVideoAnnotations surface filter', () => {
  it('filters on the requested surface', async () => {
    const { AnnotationService } = await import('@/services/annotationService');

    await AnnotationService.getVideoAnnotations(
      'video-1',
      'project-1',
      false,
      'pipeline'
    );

    expect(chain.eq).toHaveBeenCalledWith('surface', 'pipeline');
  });

  it('filters on video when the video surface is requested', async () => {
    const { AnnotationService } = await import('@/services/annotationService');

    await AnnotationService.getVideoAnnotations(
      'video-1',
      'project-1',
      false,
      'video'
    );

    expect(chain.eq).toHaveBeenCalledWith('surface', 'video');
  });

  // The argument is omitted by 17 of the 18 call sites in the repo, including
  // every comparison and share path. Omitted must mean "no filter", not
  // "surface = video": defaulting would silently drop rows from callers that
  // never asked about surfaces at all.
  it('applies no surface filter when the argument is omitted', async () => {
    const { AnnotationService } = await import('@/services/annotationService');

    await AnnotationService.getVideoAnnotations('video-1', 'project-1', false);

    expect(eqCalls()).not.toContain('surface');
  });
});
