import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick, ref } from 'vue';

const recordOpenMock = vi.fn();
vi.mock('@/services/recentOpensService', () => ({
  recordOpen: (...args: unknown[]) => recordOpenMock(...args),
}));

// Mirrors the editor at mount: the store may still hold the PREVIOUS project's
// id, and isAppLoading starts true until this mount's load settles.
function harness(initial?: {
  videoId?: string | null;
  comparisonId?: string | null;
  userId?: string | null;
}) {
  const currentVideoId = ref<string | null>(initial?.videoId ?? null);
  const currentComparisonId = ref<string | null>(initial?.comparisonId ?? null);
  const isAppLoading = ref(true);
  // Not `initial?.userId ?? 'u1'`: `??` treats an explicit `userId: null`
  // the same as an absent key, which would silently turn the anonymous-
  // viewer test's harness({ userId: null }) into a signed-in 'u1' harness.
  const userId = ref<string | null>(
    initial?.userId === undefined ? 'u1' : initial.userId
  );
  return { currentVideoId, currentComparisonId, isAppLoading, userId };
}

beforeEach(() => {
  recordOpenMock.mockReset();
  recordOpenMock.mockResolvedValue(true);
});

describe('useRecordProjectOpen', () => {
  it('records nothing while the mount is still loading', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness();
    useRecordProjectOpen(h);
    h.currentVideoId.value = 'v1';
    await nextTick();
    expect(recordOpenMock).not.toHaveBeenCalled();
  });

  it('records the single-video open once the load settles', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness();
    useRecordProjectOpen(h);
    h.currentVideoId.value = 'v1';
    h.isAppLoading.value = false;
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledTimes(1);
    expect(recordOpenMock).toHaveBeenCalledWith('u1', { videoId: 'v1' });
  });

  it('records a comparison open with the comparison target', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness();
    useRecordProjectOpen(h);
    h.currentComparisonId.value = 'c1';
    h.isAppLoading.value = false;
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledWith('u1', {
      comparisonVideoId: 'c1',
    });
  });

  it('records a project whose id was already in the singleton store at mount', async () => {
    // Returning to the same video: the ids never change, only isAppLoading does.
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness({ videoId: 'v1' });
    useRecordProjectOpen(h);
    h.isAppLoading.value = false;
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledWith('u1', { videoId: 'v1' });
  });

  it('does not write twice for the same project', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness();
    useRecordProjectOpen(h);
    h.currentVideoId.value = 'v1';
    h.isAppLoading.value = false;
    await nextTick();
    // A second load cycle on the same project inside one mount must not
    // produce a second write.
    h.isAppLoading.value = true;
    await nextTick();
    h.isAppLoading.value = false;
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledTimes(1);
  });

  it('records again when the editor navigates to another project', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness();
    useRecordProjectOpen(h);
    h.currentVideoId.value = 'v1';
    h.isAppLoading.value = false;
    await nextTick();
    h.currentVideoId.value = 'v2';
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledTimes(2);
    expect(recordOpenMock).toHaveBeenLastCalledWith('u1', { videoId: 'v2' });
  });

  it('writes nothing for an anonymous viewer, then writes once the user arrives', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness({ userId: null });
    useRecordProjectOpen(h);
    h.currentVideoId.value = 'v1';
    h.isAppLoading.value = false;
    await nextTick();
    expect(recordOpenMock).not.toHaveBeenCalled();

    h.userId.value = 'u1';
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledWith('u1', { videoId: 'v1' });
  });
});
