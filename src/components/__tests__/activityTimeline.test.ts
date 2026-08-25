// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { ActivityEntry } from '@/types/database';

const getActivity = vi.fn();
vi.mock('@/services/activityService', () => ({
  getActivity: (...args: unknown[]) => getActivity(...args),
}));

import ActivityTimeline from '@/components/ActivityTimeline.vue';

function entry(over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'e1',
    videoId: 'v1',
    comparisonVideoId: null,
    actorId: 'u1',
    actorName: null,
    entityType: 'annotation',
    entityId: 'a1',
    action: 'created',
    summary: { title: 'Ball out of frame', timestamp: 12.5 },
    createdAt: new Date().toISOString(),
    actor: 'Alice',
    live: true,
    ...over,
  };
}

function mount(props: Record<string, unknown>) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const selected: Array<[string, number]> = [];
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(ActivityTimeline, {
          ...props,
          onSelectAnnotation: (id: string, t: number) => selected.push([id, t]),
        }),
    })
  );
  app.mount(root);
  return {
    root,
    selected,
    q: (sel: string) => root.querySelector<HTMLElement>(sel),
    all: (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel)),
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

function mountReactive(initialTarget: Record<string, string> | null) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const target = ref(initialTarget);
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(ActivityTimeline, { target: target.value, active: true }),
    })
  );
  app.mount(root);
  return {
    target,
    all: (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel)),
    text: () => root.textContent ?? '',
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getActivity.mockResolvedValue([]);
});

describe('ActivityTimeline', () => {
  it('does not fetch while inactive', async () => {
    const w = mount({ target: { videoId: 'v1' }, active: false });
    await nextTick();
    expect(getActivity).not.toHaveBeenCalled();
    w.unmount();
  });

  it('fetches once when it becomes active', async () => {
    getActivity.mockResolvedValue([entry()]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    expect(getActivity).toHaveBeenCalledWith({ videoId: 'v1' });
    expect(w.all('[data-testid="activity-entry"]')).toHaveLength(1);
    w.unmount();
  });

  it('renders the sentence with actor, verb and subject', async () => {
    getActivity.mockResolvedValue([entry()]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    const text = w.q('[data-testid="activity-entry"]')?.textContent ?? '';
    expect(text).toContain('Alice');
    expect(text).toContain('added');
    expect(text).toContain('Ball out of frame');
    w.unmount();
  });

  it('renders a day heading', async () => {
    getActivity.mockResolvedValue([entry()]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    expect(w.q('[data-testid="activity-day"]')?.textContent).toContain('TODAY');
    w.unmount();
  });

  it('renders the comment excerpt under a comment entry', async () => {
    getActivity.mockResolvedValue([
      entry({
        entityType: 'comment',
        summary: { annotationTitle: 'Offside call', excerpt: 'looks wrong' },
      }),
    ]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    expect(w.q('[data-testid="activity-excerpt"]')?.textContent).toContain(
      'looks wrong'
    );
    w.unmount();
  });

  it('emits select-annotation with the snapshot timestamp when a live entry is clicked', async () => {
    getActivity.mockResolvedValue([entry()]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    w.q('[data-testid="activity-entry"]')?.click();
    expect(w.selected).toEqual([['a1', 12.5]]);
    w.unmount();
  });

  it('renders an entry whose target is gone as plain text, not a button, and emits nothing', async () => {
    getActivity.mockResolvedValue([entry({ live: false, action: 'deleted' })]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    const el = w.q('[data-testid="activity-entry"]');
    expect(el?.tagName).toBe('DIV');
    el?.click();
    expect(w.selected).toEqual([]);
    w.unmount();
  });

  it('renders a live entry as a button', async () => {
    getActivity.mockResolvedValue([entry()]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    expect(w.q('[data-testid="activity-entry"]')?.tagName).toBe('BUTTON');
    w.unmount();
  });

  it('shows an empty state when there is no activity', async () => {
    getActivity.mockResolvedValue([]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    expect(w.q('[data-testid="activity-empty"]')).not.toBeNull();
    w.unmount();
  });

  it('refetches when the target changes', async () => {
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();
    expect(getActivity).toHaveBeenCalledTimes(1);
    w.unmount();

    const w2 = mount({ target: { videoId: 'v2' }, active: true });
    await nextTick();
    await nextTick();
    expect(getActivity).toHaveBeenLastCalledWith({ videoId: 'v2' });
    w2.unmount();
  });

  it('renders nothing and does not fetch without a target', async () => {
    const w = mount({ target: null, active: true });
    await nextTick();
    expect(getActivity).not.toHaveBeenCalled();
    w.unmount();
  });

  it('discards a stale response when the target changes mid-flight', async () => {
    // The first fetch is held open deliberately. The second target's response
    // arrives first, then the first resolves late - which is exactly the order
    // the request-generation guard exists to survive.
    let resolveFirst!: (rows: ActivityEntry[]) => void;
    getActivity
      .mockImplementationOnce(
        () => new Promise<ActivityEntry[]>((resolve) => { resolveFirst = resolve; })
      )
      .mockImplementationOnce(() =>
        Promise.resolve([entry({ id: 'newer', summary: { title: 'from the second target' } })])
      );

    const w = mountReactive({ videoId: 'v1' });
    await nextTick();

    w.target.value = { videoId: 'v2' };
    await nextTick();
    await nextTick();

    // The stale first response lands last and must be thrown away.
    resolveFirst([entry({ id: 'stale', summary: { title: 'from the first target' } })]);
    await nextTick();
    await nextTick();

    expect(w.text()).toContain('from the second target');
    expect(w.text()).not.toContain('from the first target');
    expect(w.all('[data-testid="activity-entry"]')).toHaveLength(1);
    w.unmount();
  });

  it('emits with annotation id from comment summary when a comment entry is clicked', async () => {
    getActivity.mockResolvedValue([
      entry({
        entityType: 'comment',
        summary: { annotationId: 'a9', annotationTitle: 'Offside call', excerpt: 'looks wrong', timestamp: 4.25 },
      }),
    ]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    w.q('[data-testid="activity-entry"]')?.click();
    expect(w.selected).toEqual([['a9', 4.25]]);
    w.unmount();
  });
});
