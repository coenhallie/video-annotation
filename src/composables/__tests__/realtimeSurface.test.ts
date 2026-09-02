import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { Annotation } from '@/types/database';

type Handler = (payload: Record<string, unknown>) => void;

/** Captured `on('postgres_changes', config, handler)` registrations. */
const handlers: Array<{ event: string; handler: Handler }> = [];

const channel = {
  on: vi.fn(
    (_type: string, config: { event: string }, handler: Handler) => {
      handlers.push({ event: config.event, handler });
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

    useRealtimeAnnotations(ref('video-1'), annotations, ref('video'));
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

    useRealtimeAnnotations(ref('video-1'), annotations, ref('video'));
    insertHandler()({ new: row('a2', 'pipeline') });

    expect(annotations.value).toEqual([]);
  });

  it('appends a pipeline insert while the pipeline surface is active', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const annotations = ref<Annotation[]>([]);

    useRealtimeAnnotations(ref('video-1'), annotations, ref('pipeline'));
    insertHandler()({ new: row('a3', 'pipeline') });

    expect(annotations.value.map((a) => a.id)).toEqual(['a3']);
  });
});
