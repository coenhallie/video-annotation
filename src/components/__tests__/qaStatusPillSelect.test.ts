// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { QaStatus, Video } from '@/types/database';

const setQaStatus = vi.fn();
const addNotification = vi.fn();
vi.mock('@/services/videoService', () => ({ VideoService: { setQaStatus } }));
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ addNotification }),
}));

async function mount(status: QaStatus = 'not_started') {
  const { default: C } = await import('@/components/QaStatusPillSelect.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const rowClicks: string[] = [];
  const rowMousedowns: string[] = [];
  const updates: Video[] = [];
  const app = createApp(
    defineComponent({
      setup: () => () =>
        // A stand-in for ProjectListItem's clickable, draggable row.
        h(
          'div',
          {
            onClick: () => rowClicks.push('row'),
            onMousedown: () => rowMousedowns.push('row'),
          },
          [
            h(C, {
              video: { id: 'v1', qaStatus: status },
              onUpdated: (v: Video) => updates.push(v),
            }),
          ]
        ),
    })
  );
  app.mount(root);
  const sel = () => root.querySelector<HTMLSelectElement>('[data-testid="qa-status-pill-select"]')!;
  return {
    sel, rowClicks, rowMousedowns, updates,
    choose: async (v: string) => {
      sel().value = v;
      sel().dispatchEvent(new Event('change', { bubbles: true }));
      await nextTick(); await Promise.resolve(); await nextTick();
    },
    unmount: () => { app.unmount(); root.remove(); },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('QaStatusPillSelect', () => {
  it('offers the five values in workflow order', async () => {
    const m = await mount();
    expect([...m.sel().options].map((o) => o.value)).toEqual([
      'not_started', 'in_review', 'failed', 'staging', 'production',
    ]);
    m.unmount();
  });

  // At rest it must be indistinguishable from the read-only pill, or the
  // column stops scanning as one thing.
  it('wears the pill geometry', async () => {
    const m = await mount();
    const c = m.sel().className;
    expect(c).toContain('w-24');
    expect(c).toContain('rounded-full');
    expect(c).toContain('appearance-none');
    expect(c).toContain('text-center');
    m.unmount();
  });

  it('carries the status weight, accent on failed only', async () => {
    const failed = await mount('failed');
    expect(failed.sel().className).toContain('text-red-600');
    failed.unmount();
    const staging = await mount('staging');
    expect(staging.sel().className).not.toContain('red');
    staging.unmount();
  });

  // Without stopPropagation every status change also opens the details panel.
  it('does not trigger the row click', async () => {
    const m = await mount();
    m.sel().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(m.rowClicks).toHaveLength(0);
    m.unmount();
  });

  // A mousedown on a child of a draggable row starts a drag instead of
  // opening the menu, which makes the control unusable by mouse.
  it('is not draggable', async () => {
    const m = await mount();
    expect(m.sel().getAttribute('draggable')).toBe('false');
    m.unmount();
  });

  // Distinct from "is not draggable": that test only checks the static
  // attribute. This one checks the actual propagation defence - a bubbling
  // mousedown on the select must not reach a mousedown listener on the row.
  it('does not trigger the row mousedown', async () => {
    const m = await mount();
    m.sel().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    expect(m.rowMousedowns).toHaveLength(0);
    m.unmount();
  });

  it('writes the chosen status and emits the updated video', async () => {
    const updated = { id: 'v1', qaStatus: 'failed' } as Video;
    setQaStatus.mockResolvedValue(updated);
    const m = await mount();
    await m.choose('failed');
    expect(setQaStatus).toHaveBeenCalledWith('v1', 'failed');
    expect(m.updates).toEqual([updated]);
    m.unmount();
  });

  it('disables itself while the write is in flight', async () => {
    let resolve!: (v: Video) => void;
    setQaStatus.mockReturnValue(new Promise<Video>((r) => { resolve = r; }));
    const m = await mount();
    m.sel().value = 'failed';
    m.sel().dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(m.sel().disabled).toBe(true);
    resolve({ id: 'v1', qaStatus: 'failed' } as Video);
    await nextTick(); await Promise.resolve(); await nextTick();
    expect(m.sel().disabled).toBe(false);
    m.unmount();
  });
});
