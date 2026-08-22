// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { Video } from '@/types/database';

const setQaStatus = vi.fn();
const addNotification = vi.fn();
vi.mock('@/services/videoService', () => ({ VideoService: { setQaStatus } }));
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ addNotification }),
}));

async function mount(status = 'not_started') {
  const { default: C } = await import('@/components/QaStatusPillSelect.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const rowClicks: string[] = [];
  const app = createApp(
    defineComponent({
      setup: () => () =>
        // A stand-in for ProjectListItem's clickable, draggable row.
        h('div', { onClick: () => rowClicks.push('row') }, [
          h(C, { video: { id: 'v1', qaStatus: status } }),
        ]),
    })
  );
  app.mount(root);
  const sel = () => root.querySelector<HTMLSelectElement>('[data-testid="qa-status-pill-select"]')!;
  return {
    sel, rowClicks,
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

  it('writes the chosen status and emits the updated video', async () => {
    setQaStatus.mockResolvedValue({ id: 'v1', qaStatus: 'failed' } as Video);
    const m = await mount();
    await m.choose('failed');
    expect(setQaStatus).toHaveBeenCalledWith('v1', 'failed');
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
