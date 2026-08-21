// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { Video } from '@/types/database';

const setQaStatus = vi.fn();
const addNotification = vi.fn();

vi.mock('@/services/videoService', () => ({
  VideoService: { setQaStatus },
}));
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ addNotification }),
}));

const video = (overrides: Partial<Video> = {}): Video =>
  ({
    id: 'v1',
    title: 'Match 1',
    url: 'http://v',
    videoId: 'aws:abc',
    fps: 30,
    duration: 10,
    totalFrames: 300,
    isPublic: false,
    allowAnnotations: true,
    ownerId: 'u1',
    videoType: 'url',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    qaStatus: 'not_started',
    ...overrides,
  }) as Video;

async function mountSelect(initial: Video, updatedByName?: string) {
  const { default: QaStatusSelect } = await import('@/components/QaStatusSelect.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const updates: Video[] = [];
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(QaStatusSelect, {
          video: initial,
          updatedByName,
          onUpdated: (v: Video) => updates.push(v),
        }),
    })
  );
  app.mount(root);
  return {
    updates,
    select: () => root.querySelector<HTMLSelectElement>('[data-testid="qa-status-select"]')!,
    attribution: () => root.querySelector<HTMLElement>('[data-testid="qa-status-attribution"]'),
    choose: async (value: string) => {
      const el = root.querySelector<HTMLSelectElement>('[data-testid="qa-status-select"]')!;
      el.value = value;
      el.dispatchEvent(new Event('change'));
      await nextTick();
      await Promise.resolve();
      await nextTick();
    },
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('QaStatusSelect', () => {
  it('offers the five values in workflow order', async () => {
    const s = await mountSelect(video());
    expect([...s.select().options].map((o) => o.value)).toEqual([
      'not_started',
      'in_review',
      'failed',
      'staging',
      'production',
    ]);
    s.unmount();
  });

  it('writes the chosen status through the service', async () => {
    setQaStatus.mockResolvedValue(video({ qaStatus: 'staging' }));
    const s = await mountSelect(video());

    await s.choose('staging');

    expect(setQaStatus).toHaveBeenCalledWith('v1', 'staging');
    expect(s.select().value).toBe('staging');
    s.unmount();
  });

  it('emits the updated video so the parent can refresh its copy', async () => {
    const updated = video({ qaStatus: 'staging', qaStatusUpdatedBy: 'u2' });
    setQaStatus.mockResolvedValue(updated);
    const s = await mountSelect(video());

    await s.choose('staging');

    expect(s.updates).toHaveLength(1);
    expect(s.updates[0]?.qaStatus).toBe('staging');
    s.unmount();
  });

  // The optimistic update is what stops a five-value dropdown feeling like a
  // form submission. The rollback is what keeps it honest when the RPC raises.
  it('rolls back and notifies when the write is rejected', async () => {
    setQaStatus.mockRejectedValue(new Error('Video v1 is not visible to the caller'));
    const s = await mountSelect(video({ qaStatus: 'in_review' }));

    await s.choose('production');

    expect(s.select().value).toBe('in_review');
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    expect(s.updates).toHaveLength(0);
    s.unmount();
  });

  it('shows attribution once the status has been set', async () => {
    const s = await mountSelect(
      video({ qaStatus: 'staging', qaStatusUpdatedAt: '2026-08-20T00:00:00Z' }),
      'Alice'
    );
    expect(s.attribution()?.textContent).toContain('Alice');
    s.unmount();
  });

  it('shows no attribution line before anyone has set it', async () => {
    const s = await mountSelect(video());
    expect(s.attribution()).toBeNull();
    s.unmount();
  });
});
