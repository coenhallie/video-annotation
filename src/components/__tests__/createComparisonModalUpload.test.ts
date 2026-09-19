// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';

const getUserVideos = vi.fn();
vi.mock('@/services/videoService', () => ({ VideoService: { getUserVideos } }));
const findExistingComparison = vi.fn(async () => null);
const createComparisonVideo = vi.fn();
vi.mock('@/services/comparisonVideoService', () => ({
  ComparisonVideoService: { findExistingComparison, createComparisonVideo },
}));
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ user: { value: { id: 'user-1' } } }),
}));
const addNotification = vi.fn();
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ addNotification }),
}));

// The upload row is tested on its own. Here it is a button that emits one
// fixed video, so the wizard's reaction to an upload can be driven directly.
let nextUploadedId = 'up-1';
vi.mock('@/components/ComparisonVideoUpload.vue', () => ({
  default: defineComponent({
    emits: ['uploaded'],
    setup(_, { emit }) {
      return () =>
        h(
          'button',
          {
            'data-testid': 'upload-stub',
            onClick: () =>
              emit('uploaded', {
                id: nextUploadedId,
                title: `uploaded ${nextUploadedId}`,
                duration: 3,
                fps: 30,
              }),
          },
          'stub'
        );
    },
  }),
}));

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

const video = (id: string) => ({ id, title: `video ${id}`, duration: 10, fps: 30 });

async function mount() {
  const { default: C } = await import('@/components/CreateComparisonModal.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({ render: () => h(C, { isVisible: true }) });
  app.mount(root);
  await flush();
  // The modal teleports to body.
  const q = <T extends Element>(sel: string) => document.body.querySelector<T>(sel);
  const qa = (sel: string) => [...document.body.querySelectorAll(sel)];
  return {
    q,
    qa,
    text: () => document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    step: () => document.body.querySelector('[data-testid="comparison-step"]')?.textContent?.trim(),
    uploadStubs: () => qa('[data-testid="upload-stub"]'),
    upload: async () => {
      (q<HTMLButtonElement>('[data-testid="upload-stub"]'))!.click();
      await flush();
    },
    clickVideo: async (title: string) => {
      const btn = qa('button').find((b) => b.textContent?.includes(title)) as HTMLButtonElement;
      btn.click();
      await flush();
    },
    unmount: () => {
      app.unmount();
      root.remove();
      document.body.innerHTML = '';
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // A failed assertion skips unmount; never let one test's modal leak into the next.
  document.body.innerHTML = '';
  nextUploadedId = 'up-1';
  getUserVideos.mockResolvedValue([video('a'), video('b'), video('c')]);
});

describe('CreateComparisonModal upload', () => {
  it('offers an upload row on the pick-A step and the pick-B step', async () => {
    const m = await mount();
    expect(m.step()).toBe('1 / 3');
    expect(m.uploadStubs()).toHaveLength(1);
    await m.clickVideo('video a');
    expect(m.step()).toBe('2 / 3');
    expect(m.uploadStubs()).toHaveLength(1);
    m.unmount();
  });

  it('selects an uploaded file as A and moves on to picking B', async () => {
    const m = await mount();
    await m.upload();
    expect(m.step()).toBe('2 / 3');
    expect(m.text()).toContain('uploaded up-1');
    // The new video is now in the list too, so it can be picked again later.
    expect(m.text()).toContain('video a');
    m.unmount();
  });

  it('selects an uploaded file as B and lands on details with the pair titled', async () => {
    const m = await mount();
    await m.clickVideo('video a');
    nextUploadedId = 'up-2';
    await m.upload();
    expect(m.step()).toBe('3 / 3');
    const title = m.q<HTMLInputElement>('input[placeholder="Describe this comparison"]');
    expect(title?.value).toBe('video a vs uploaded up-2');
    m.unmount();
  });

  it('lets a user with no videos start by uploading', async () => {
    getUserVideos.mockResolvedValue([]);
    const m = await mount();
    expect(m.text()).not.toContain('Try again');
    expect(m.uploadStubs()).toHaveLength(1);
    await m.upload();
    expect(m.step()).toBe('2 / 3');
    m.unmount();
  });

  it('does not treat one existing video as an error', async () => {
    getUserVideos.mockResolvedValue([video('a')]);
    const m = await mount();
    expect(m.text()).not.toContain('at least two videos');
    expect(m.text()).toContain('video a');
    expect(m.uploadStubs()).toHaveLength(1);
    m.unmount();
  });
});
