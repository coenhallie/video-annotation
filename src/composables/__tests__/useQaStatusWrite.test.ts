import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { QaStatusTarget } from '@/utils/qaStatus';
import type { Video } from '@/types/database';

const setQaStatus = vi.fn();
const addNotification = vi.fn();

vi.mock('@/services/videoService', () => ({ VideoService: { setQaStatus } }));
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ addNotification }),
}));

const load = async () =>
  (await import('@/composables/useQaStatusWrite')).useQaStatusWrite;

const video = (over: Partial<Video> = {}): Video =>
  ({ id: 'v1', qaStatus: 'staging', qaStatusUpdatedAt: '2026-08-22T00:00:00Z', ...over }) as Video;

beforeEach(() => vi.clearAllMocks());

describe('useQaStatusWrite', () => {
  it('applies and emits when the target has not changed', async () => {
    setQaStatus.mockResolvedValue(video());
    const useQaStatusWrite = await load();
    const target = ref<QaStatusTarget>({ id: 'v1', qaStatus: 'not_started' });
    const seen: Video[] = [];
    const w = useQaStatusWrite(() => target.value, (v) => seen.push(v));

    await w.change('staging');

    expect(w.current.value).toBe('staging');
    expect(seen).toHaveLength(1);
    expect(w.saving.value).toBe(false);
  });

  // The Critical finding from the feature's final review: a write resolving
  // after the caller swapped targets must not write one video onto another.
  it('applies nothing and emits nothing when the target changed mid-write', async () => {
    let resolve!: (v: Video) => void;
    setQaStatus.mockReturnValue(new Promise<Video>((r) => { resolve = r; }));
    const useQaStatusWrite = await load();
    const target = ref<QaStatusTarget>({ id: 'v1', qaStatus: 'not_started' });
    const seen: Video[] = [];
    const w = useQaStatusWrite(() => target.value, (v) => seen.push(v));

    const pending = w.change('staging');
    target.value = { id: 'v2', qaStatus: 'in_review' };
    resolve(video());
    await pending;

    expect(seen).toHaveLength(0);
    expect(w.saving.value).toBe(false);
  });

  it('rolls back and notifies when the write is refused', async () => {
    setQaStatus.mockRejectedValue(new Error('not visible to the caller'));
    const useQaStatusWrite = await load();
    const target = ref<QaStatusTarget>({ id: 'v1', qaStatus: 'in_review' });
    const w = useQaStatusWrite(() => target.value, () => {});

    await w.change('production');

    expect(w.current.value).toBe('in_review');
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  // The rollback is video-specific; the notification is not. Swallowing it
  // would recreate "a denied write looks like a success" on the error path.
  it('notifies but does not roll back when the target changed mid-failure', async () => {
    let reject!: (e: Error) => void;
    setQaStatus.mockReturnValue(new Promise<Video>((_, r) => { reject = r; }));
    const useQaStatusWrite = await load();
    const target = ref<QaStatusTarget>({ id: 'v1', qaStatus: 'in_review' });
    const w = useQaStatusWrite(() => target.value, () => {});

    const pending = w.change('production');
    target.value = { id: 'v2', qaStatus: 'failed' };
    reject(new Error('refused'));
    await pending;

    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    expect(w.current.value).not.toBe('in_review'); // v1's value was not restored onto v2
    expect(w.saving.value).toBe(false);
  });

  it('ignores a change to the value already shown', async () => {
    const useQaStatusWrite = await load();
    const target = ref<QaStatusTarget>({ id: 'v1', qaStatus: 'staging' });
    const w = useQaStatusWrite(() => target.value, () => {});

    await w.change('staging');

    expect(setQaStatus).not.toHaveBeenCalled();
  });
});
