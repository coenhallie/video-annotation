// @vitest-environment jsdom
//
// Covers the fix for the QA status write-back gap: AnnotationPanel mounts
// QaStatusSelect but, before this fix, never listened for its `updated`
// event, so the panel had no way to hand a saved status back to whoever
// mounted it. EditorView's currentVideoObject then kept its pre-save value,
// and a later unrelated reassignment of that ref (an AWS presigned URL
// refresh, for instance) would carry the stale qaStatus forward and revert
// the control. This test only asserts the pass-through itself: that
// AnnotationPanel re-emits `qa-status-updated` when its QaStatusSelect
// child emits `updated`. It does not mount EditorView.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { Video } from '@/types/database';

const setQaStatus = vi.fn();

vi.mock('@/services/videoService', () => ({
  VideoService: { setQaStatus },
}));
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));

// AnnotationPanel pulls in auth, comment and label state that reach for
// Supabase in the real app. None of that is exercised by this test - the
// panel is mounted with no annotations, signed out, and no videoId, so the
// comment-subscription branch never runs - so each is stubbed to its
// simplest shape rather than pulled in for real.
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ user: { value: null }, isAuthenticated: { value: false } }),
}));
vi.mock('@/composables/useGlobalComments', () => ({
  useGlobalComments: () => ({
    setupGlobalCommentSubscription: vi.fn(),
    markCommentsAsViewed: vi.fn(),
    hasNewComments: vi.fn(() => false),
    getNewCommentCount: vi.fn(() => 0),
    getTotalCommentCount: vi.fn(() => 0),
    initializeCommentCounts: vi.fn(),
    cleanup: vi.fn(),
    onNewComment: vi.fn(),
  }),
}));
vi.mock('@/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({
    labels: { value: [] },
    labelsById: { value: {} },
    load: vi.fn(),
    reload: vi.fn(),
  }),
}));

// Stubbed out because `canAnnotate: true` (needed for the QA block's own
// v-if) also unfolds this form, and its drawing-canvas machinery is unrelated
// to the QA pass-through this test checks.
vi.mock('../AnnotationForm.vue', () => ({
  default: defineComponent({ name: 'AnnotationFormStub', render: () => null }),
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

async function mountPanel(initialVideo: Video) {
  const { default: AnnotationPanel } = await import('@/components/AnnotationPanel.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const qaStatusUpdates: Video[] = [];
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(AnnotationPanel, {
          annotations: [],
          canAnnotate: true,
          isDualMode: false,
          video: initialVideo,
          'onQa-status-updated': (v: Video) => qaStatusUpdates.push(v),
        }),
    })
  );
  app.mount(root);
  return {
    qaStatusUpdates,
    select: () =>
      root.querySelector<HTMLSelectElement>('[data-testid="qa-status-select"]')!,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AnnotationPanel QA status pass-through', () => {
  it('re-emits QaStatusSelect\'s saved video as qa-status-updated', async () => {
    const updated = video({ qaStatus: 'staging' });
    setQaStatus.mockResolvedValue(updated);
    const panel = await mountPanel(video({ qaStatus: 'in_review' }));

    const el = panel.select();
    el.value = 'staging';
    el.dispatchEvent(new Event('change'));
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(panel.qaStatusUpdates).toHaveLength(1);
    expect(panel.qaStatusUpdates[0]?.qaStatus).toBe('staging');
    panel.unmount();
  });

  it('emits nothing when no write has happened', async () => {
    const panel = await mountPanel(video());
    expect(panel.qaStatusUpdates).toHaveLength(0);
    panel.unmount();
  });
});
