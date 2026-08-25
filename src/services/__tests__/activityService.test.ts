import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const fetchOwners = vi.fn();

vi.mock('@/composables/useSupabase', () => ({ supabase: { from } }));
vi.mock('@/services/ownerEnrichmentService', () => ({
  fetchOwners: (...args: unknown[]) => fetchOwners(...args),
  UNKNOWN_OWNER_NAME: 'Unknown',
}));

const loadService = async () => await import('@/services/activityService');

/** Terminal builder for the events read: .select().eq().order().limit() */
function eventsQuery(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve(result));
  return builder;
}

/** Terminal builder for the liveness read: .select().in() */
function livenessQuery(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.in = vi.fn(() => Promise.resolve(result));
  return builder;
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  videoId: 'v1',
  comparisonVideoId: null,
  actorId: 'u1',
  actorName: null,
  entityType: 'annotation',
  entityId: 'a1',
  action: 'created',
  summary: { title: 'Ball out of frame', timestamp: 12.5 },
  createdAt: '2026-08-25T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchOwners.mockResolvedValue({ u1: { id: 'u1', name: 'Alice' } });
});

describe('getActivity', () => {
  it('queries events for a single video, newest first', async () => {
    const events = eventsQuery({ data: [row()], error: null });
    const live = livenessQuery({ data: [{ id: 'a1' }], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    await getActivity({ videoId: 'v1' });

    expect(from).toHaveBeenCalledWith('activity_events');
    expect(events.eq).toHaveBeenCalledWith('videoId', 'v1');
    expect(events.order).toHaveBeenCalledWith('createdAt', { ascending: false });
    expect(events.limit).toHaveBeenCalledWith(100);
  });

  it('queries events for a comparison target on the comparison column', async () => {
    const events = eventsQuery({ data: [], error: null });
    from.mockReturnValue(events);

    const { getActivity } = await loadService();
    await getActivity({ comparisonVideoId: 'c9' });

    expect(events.eq).toHaveBeenCalledWith('comparisonVideoId', 'c9');
  });

  it('honours an explicit limit', async () => {
    const events = eventsQuery({ data: [], error: null });
    from.mockReturnValue(events);

    const { getActivity } = await loadService();
    await getActivity({ videoId: 'v1' }, 10);

    expect(events.limit).toHaveBeenCalledWith(10);
  });

  it('resolves actor names through fetchOwners', async () => {
    const events = eventsQuery({ data: [row()], error: null });
    const live = livenessQuery({ data: [{ id: 'a1' }], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(fetchOwners).toHaveBeenCalledWith(['u1']);
    expect(entries[0].actor).toBe('Alice');
  });

  it('prefers the snapshot name when there is no actor id', async () => {
    const events = eventsQuery({
      data: [row({ actorId: null, actorName: 'Visitor 7', entityType: 'comment' })],
      error: null,
    });
    const live = livenessQuery({ data: [], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries[0].actor).toBe('Visitor 7');
  });

  it('falls back to Unknown when neither an id nor a name resolves', async () => {
    const events = eventsQuery({
      data: [row({ actorId: 'gone', actorName: null })],
      error: null,
    });
    const live = livenessQuery({ data: [], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );
    fetchOwners.mockResolvedValue({ gone: { id: 'gone', name: 'Unknown' } });

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries[0].actor).toBe('Unknown');
  });

  it('marks an entry live when its annotation still exists', async () => {
    const events = eventsQuery({
      data: [row({ entityId: 'a1' }), row({ id: 'e2', entityId: 'a2' })],
      error: null,
    });
    const live = livenessQuery({ data: [{ id: 'a1' }], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries[0].live).toBe(true);
    expect(entries[1].live).toBe(false);
  });

  it('checks liveness against the comment parent, not the comment id', async () => {
    const events = eventsQuery({
      data: [
        row({
          entityType: 'comment',
          entityId: 'c1',
          summary: { annotationId: 'a1', excerpt: 'hi' },
        }),
      ],
      error: null,
    });
    const live = livenessQuery({ data: [{ id: 'a1' }], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(live.in).toHaveBeenCalledWith('id', ['a1']);
    expect(entries[0].live).toBe(true);
  });

  it('marks a deleted annotation as not live', async () => {
    const events = eventsQuery({
      data: [row({ action: 'deleted' })],
      error: null,
    });
    // The annotation is gone, so the liveness read cannot return it.
    const live = livenessQuery({ data: [], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries[0].live).toBe(false);
  });

  // Liveness is a fact about the target, not about the action. A removed
  // comment on a surviving annotation still has somewhere to seek to.
  it('keeps a comment-delete entry live when its parent annotation survives', async () => {
    const events = eventsQuery({
      data: [
        row({
          entityType: 'comment',
          entityId: 'c1',
          action: 'deleted',
          summary: { annotationId: 'a1', excerpt: 'gone now' },
        }),
      ],
      error: null,
    });
    const live = livenessQuery({ data: [{ id: 'a1' }], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries[0].live).toBe(true);
  });

  it('returns an empty list and does not throw when the query errors', async () => {
    const events = eventsQuery({ data: null, error: { message: 'boom' } });
    from.mockReturnValue(events);

    const { getActivity } = await loadService();
    await expect(getActivity({ videoId: 'v1' })).resolves.toEqual([]);
  });

  it('skips the liveness and owner reads when there are no events', async () => {
    const events = eventsQuery({ data: [], error: null });
    from.mockReturnValue(events);

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(fetchOwners).not.toHaveBeenCalled();
  });
});
