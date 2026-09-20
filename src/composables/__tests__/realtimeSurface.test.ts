import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { annotationRealtimeScope } from '@/utils/annotationRealtimeScope';
import type { Annotation, AnnotationSurface } from '@/types/database';

type Handler = (payload: Record<string, unknown>) => void;

/** Captured `on('postgres_changes', config, handler)` registrations. */
const handlers: Array<{
  event: string;
  filter: string | undefined;
  handler: Handler;
}> = [];

const channel = {
  on: vi.fn(
    (_type: string, config: { event: string; filter?: string }, handler: Handler) => {
      handlers.push({ event: config.event, filter: config.filter, handler });
      return channel;
    }
  ),
  subscribe: vi.fn(() => channel),
  track: vi.fn(),
  presenceState: vi.fn(() => ({})),
};

vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  },
}));

const insertHandler = (): Handler => {
  const entry = handlers.find((h) => h.event === 'INSERT');
  if (!entry) throw new Error('no INSERT handler registered');
  return entry.handler;
};

const singleScope = (surface: AnnotationSurface) =>
  ref(
    annotationRealtimeScope({
      playerMode: 'single',
      videoId: 'video-1',
      surface,
      comparison: null,
    })
  );

const row = (id: string, surface: string) =>
  ({ id, surface, timestamp: 1 }) as unknown as Annotation;

beforeEach(() => {
  handlers.length = 0;
  channel.on.mockClear();
  channel.subscribe.mockClear();
});

describe('useRealtimeAnnotations surface guard', () => {
  it('appends an insert on the active surface', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const annotations = ref<Annotation[]>([]);

    useRealtimeAnnotations(singleScope('video'), annotations);
    insertHandler()({ new: row('a1', 'video') });

    expect(annotations.value.map((a) => a.id)).toEqual(['a1']);
  });

  // The subscription filters on videoId only, and both tabs share one video
  // row. Without this guard another client's pipeline annotation appends into
  // the Video tab's list and shows up as a phantom marker on the timeline.
  it('drops an insert from the other surface', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const annotations = ref<Annotation[]>([]);

    useRealtimeAnnotations(singleScope('video'), annotations);
    insertHandler()({ new: row('a2', 'pipeline') });

    expect(annotations.value).toEqual([]);
  });

  it('appends a pipeline insert while the pipeline surface is active', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const annotations = ref<Annotation[]>([]);

    useRealtimeAnnotations(singleScope('pipeline'), annotations);
    insertHandler()({ new: row('a3', 'pipeline') });

    expect(annotations.value.map((a) => a.id)).toEqual(['a3']);
  });
});

describe('useRealtimeAnnotations surface switch', () => {
  // Both tabs listen to the same video, so switching tabs keeps the channel.
  // The rows it accepts still have to follow the tab that is now open.
  it('accepts the newly opened surface without resubscribing', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const surface = ref<AnnotationSurface>('video');
    const annotations = ref<Annotation[]>([]);
    useRealtimeAnnotations(
      () =>
        annotationRealtimeScope({
          playerMode: 'single',
          videoId: 'video-1',
          surface: surface.value,
          comparison: null,
        }),
      annotations
    );
    const subscriptions = channel.subscribe.mock.calls.length;

    surface.value = 'pipeline';
    await nextTick();
    insertHandler()({ new: row('p1', 'pipeline') });

    expect(channel.subscribe.mock.calls.length).toBe(subscriptions);
    expect(annotations.value.map((a) => a.id)).toEqual(['p1']);
  });
});

describe('useRealtimeAnnotations update merge', () => {
  // A realtime payload is the bare table row. `labels` and `commentCount` are
  // hydrated client-side from other tables, and the card derives its title,
  // dot colour and category filter from `labels`.
  it('keeps client-hydrated fields when the row is updated', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const hydrated = {
      ...row('a1', 'video'),
      content: 'before',
      labels: [{ id: 'l1', name: 'Smash' }],
      commentCount: 3,
    } as unknown as Annotation;
    const annotations = ref<Annotation[]>([hydrated]);

    useRealtimeAnnotations(singleScope('video'), annotations);
    const update = handlers.find((h) => h.event === 'UPDATE')!.handler;
    update({ new: { ...row('a1', 'video'), content: 'after' } });

    expect(annotations.value[0]).toMatchObject({
      content: 'after',
      labels: [{ id: 'l1', name: 'Smash' }],
      commentCount: 3,
    });
  });
});

describe('useRealtimeAnnotations in a comparison', () => {
  const comparison = { id: 'c1', videoAId: 'va', videoBId: 'vb' };
  const dualScope = () =>
    annotationRealtimeScope({
      playerMode: 'dual',
      videoId: '',
      surface: 'video',
      comparison,
    });
  const insertFor = (filter: string) =>
    handlers.find((h) => h.event === 'INSERT' && h.filter === filter)!.handler;

  // The subscription used to be keyed on the single-video id, which a
  // comparison never sets, so a comparison had no subscription at all.
  it('subscribes to the comparison and both of its videos', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    useRealtimeAnnotations(ref(dualScope()), ref<Annotation[]>([]));

    expect(
      handlers.filter((h) => h.event === 'INSERT').map((h) => h.filter)
    ).toEqual(['comparisonVideoId=eq.c1', 'videoId=eq.va', 'videoId=eq.vb']);
  });

  it("adds a teammate's annotation on video B, tagged with its side", async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const annotations = ref<Annotation[]>([]);
    useRealtimeAnnotations(ref(dualScope()), annotations);

    insertFor('videoId=eq.vb')({
      new: { id: 'b1', timestamp: 2, projectId: null, videoId: 'vb' },
    });

    expect(annotations.value).toMatchObject([{ id: 'b1', videoContext: 'video_b' }]);
  });

  it('ignores a row the list would not show after a reload', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const annotations = ref<Annotation[]>([]);
    useRealtimeAnnotations(ref(dualScope()), annotations);

    insertFor('videoId=eq.va')({
      new: { id: 'p1', timestamp: 2, projectId: 'p9', videoId: 'va' },
    });

    expect(annotations.value).toEqual([]);
  });

  // A delete event carries the primary key and nothing else, so a column
  // filter can never match it: a filtered DELETE binding receives nothing.
  it('listens for deletes without a filter and removes the row by id', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const annotations = ref<Annotation[]>([row('gone', 'video'), row('kept', 'video')]);
    useRealtimeAnnotations(ref(dualScope()), annotations);

    const deletes = handlers.filter((h) => h.event === 'DELETE');
    expect(deletes.map((h) => h.filter)).toEqual([undefined]);
    deletes[0]!.handler({ old: { id: 'gone' } });

    expect(annotations.value.map((a) => a.id)).toEqual(['kept']);
  });

  it('moves the subscription when another project opens', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const { supabase } = await import('@/composables/useSupabase');
    const scope = ref(dualScope());
    useRealtimeAnnotations(scope, ref<Annotation[]>([]));
    vi.mocked(supabase.channel).mockClear();
    vi.mocked(supabase.removeChannel).mockClear();

    scope.value = singleScope('video').value;
    await nextTick();

    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(supabase.channel).toHaveBeenCalledWith('video_annotations:video-1');
  });
});
