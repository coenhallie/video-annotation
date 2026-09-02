/**
 * @vitest-environment jsdom
 *
 * The composable reads `window.location.search` to detect a share link, so this
 * file needs a DOM. It exercises the surface scoping of useVideoAnnotations:
 * what is stamped on create, and what is allowed to end up in the local list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick, ref } from 'vue';
import type { Annotation, AnnotationSurface } from '@/types/database';

const getVideoAnnotations = vi.fn();
const createAnnotation = vi.fn();

vi.mock('@/services/annotationService', () => ({
  AnnotationService: {
    getVideoAnnotations: (...a: unknown[]) => getVideoAnnotations(...a),
    createAnnotation: (...a: unknown[]) => createAnnotation(...a),
    getAllComparisonVideoAnnotations: vi.fn(),
    createComparisonAnnotation: vi.fn(),
    updateAnnotation: vi.fn(),
    deleteAnnotation: vi.fn(),
  },
}));

vi.mock('@/services/annotationLabelService', () => ({
  AnnotationLabelService: {
    addLabelsToAnnotation: vi.fn(),
    updateAnnotationLabels: vi.fn(),
  },
}));

// A fresh ref per call is fine: the composable calls useAuth() once and no test
// here signs out. It must be a real ref, because the composable watches it.
vi.mock('@/composables/useAuth', async () => {
  const { ref: vueRef } = await import('vue');
  return {
    useAuth: () => ({
      user: vueRef({ id: 'u1', email: 'tester@example.com' }),
    }),
  };
});

// The real module builds a Supabase client at import time from env vars that
// are absent under vitest.
vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));

const row = (id: string) =>
  ({ id, timestamp: 1, frame: 30 }) as unknown as Annotation;

const ids = (list: readonly { readonly id: string | number }[]) =>
  list.map((a) => a.id);

/** Lets a test decide when a service call settles, and in what order. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Drains the microtask queue so an awaited chain runs to completion. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function setup(surface: AnnotationSurface = 'video') {
  const { useVideoAnnotations } = await import(
    '@/composables/useVideoAnnotations'
  );
  const activeSurface = ref<AnnotationSurface>(surface);
  const api = useVideoAnnotations(
    ref('https://example.test/v.mp4'),
    ref('v1'),
    ref('p1'),
    ref(null),
    activeSurface
  );
  await api.initializeVideo({ existingVideo: { id: 'v1' } });
  return { api, activeSurface };
}

beforeEach(() => {
  getVideoAnnotations.mockReset();
  getVideoAnnotations.mockResolvedValue([]);
  createAnnotation.mockReset();
  createAnnotation.mockResolvedValue(row('created'));
});

describe('useVideoAnnotations surface stamping on create', () => {
  it('stamps surface video when the video tab is active', async () => {
    const { api } = await setup('video');
    createAnnotation.mockResolvedValue(row('a1'));

    await api.addAnnotation({ content: 'x', timestamp: 1, frame: 30 });

    expect(createAnnotation).toHaveBeenCalledTimes(1);
    expect(createAnnotation.mock.calls[0]?.[0]).toMatchObject({
      videoId: 'v1',
      surface: 'video',
    });
    expect(ids(api.annotations.value)).toEqual(['a1']);
  });

  // Without this stamp the row is inserted with the column default 'video' and
  // is never retrievable on the tab it was created from.
  it('stamps surface pipeline when the pipeline tab is active', async () => {
    const { api } = await setup('pipeline');
    createAnnotation.mockResolvedValue(row('a2'));

    await api.addAnnotation({ content: 'x', timestamp: 1, frame: 30 });

    expect(createAnnotation).toHaveBeenCalledTimes(1);
    expect(createAnnotation.mock.calls[0]?.[0]).toMatchObject({
      videoId: 'v1',
      surface: 'pipeline',
    });
    expect(ids(api.annotations.value)).toEqual(['a2']);
  });
});

describe('useVideoAnnotations surface switching', () => {
  it('refetches for the new surface and swaps the list', async () => {
    getVideoAnnotations.mockResolvedValue([row('v-1')]);
    const { api, activeSurface } = await setup('video');
    expect(ids(api.annotations.value)).toEqual(['v-1']);

    getVideoAnnotations.mockResolvedValue([row('p-1')]);
    activeSurface.value = 'pipeline';
    await flush();

    expect(getVideoAnnotations).toHaveBeenLastCalledWith(
      'v1',
      'p1',
      true,
      'pipeline'
    );
    expect(ids(api.annotations.value)).toEqual(['p-1']);
  });

  // A network blip on the reload used to leave the previous tab's annotations
  // listed under the new tab, markers and all. Empty is truthful, stale is a
  // lie.
  it('shows an empty list when the reload for the new surface fails', async () => {
    getVideoAnnotations.mockResolvedValue([row('v-1')]);
    const { api, activeSurface } = await setup('video');
    expect(ids(api.annotations.value)).toEqual(['v-1']);

    getVideoAnnotations.mockRejectedValue(new Error('network blip'));
    activeSurface.value = 'pipeline';
    await flush();

    expect(api.annotations.value).toEqual([]);
  });

  // Click Pipeline then quickly Video: two loads are in flight and the pipeline
  // one lands last. Its rows must not settle into the Video tab.
  it('ignores a stale load that resolves after a newer one', async () => {
    getVideoAnnotations.mockResolvedValue([row('v-1')]);
    const { api, activeSurface } = await setup('video');

    const pipelineLoad = deferred<Annotation[]>();
    const videoLoad = deferred<Annotation[]>();
    getVideoAnnotations.mockImplementation(
      (
        _videoId: string,
        _projectId: string,
        _counts: boolean,
        surface: AnnotationSurface
      ) => (surface === 'pipeline' ? pipelineLoad.promise : videoLoad.promise)
    );

    activeSurface.value = 'pipeline';
    await nextTick();
    activeSurface.value = 'video';
    await nextTick();

    videoLoad.resolve([row('v-2')]);
    await flush();
    pipelineLoad.resolve([row('p-1')]);
    await flush();

    expect(ids(api.annotations.value)).toEqual(['v-2']);
  });

  // The row itself is still created in the database, which is correct. Only the
  // local list is surface-specific.
  it('does not push a create that completes after the surface changed', async () => {
    const { api, activeSurface } = await setup('video');

    const create = deferred<Annotation>();
    createAnnotation.mockReturnValue(create.promise);
    const pending = api.addAnnotation({ content: 'x', timestamp: 1, frame: 30 });

    activeSurface.value = 'pipeline';
    await nextTick();

    create.resolve(row('a1'));
    await expect(pending).resolves.toMatchObject({ id: 'a1' });
    await flush();

    expect(createAnnotation).toHaveBeenCalledTimes(1);
    expect(api.annotations.value).toEqual([]);
  });
});
