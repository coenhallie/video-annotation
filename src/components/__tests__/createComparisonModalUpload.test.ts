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
/** Drives the stub's busy event, as the real uploader does while it works. */
let setBusy: (busy: boolean) => void = () => {};
vi.mock('@/components/ComparisonVideoUpload.vue', () => ({
  default: defineComponent({
    emits: ['uploaded', 'busy'],
    setup(_, { emit }) {
      setBusy = (b: boolean) => emit('busy', b);
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

let initialStep: string | undefined;

async function mount(
  onError?: (e: unknown) => void,
  onClose?: () => void
) {
  const { default: C } = await import('@/components/CreateComparisonModal.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({ render: () => h(C, { isVisible: true, ...(onClose ? { onClose } : {}) }) });
  if (onError) app.config.errorHandler = onError;
  app.mount(root);
  await flush();
  initialStep = document.body
    .querySelector('[data-testid="comparison-step"]')
    ?.textContent?.trim();
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

  // Picking a video advances the step, which unmounts the uploader and so
  // cancels it. A stray click must not throw away a gigabyte in flight.
  it('does not let a video be picked while an upload is running', async () => {
    getUserVideos.mockResolvedValue([video('a'), video('b')]);
    const m = await mount();
    setBusy(true);
    await flush();

    await m.clickVideo('video a');
    expect(m.step()).toBe(initialStep);

    setBusy(false);
    await flush();
    await m.clickVideo('video a');
    expect(m.step()).not.toBe(initialStep);
    m.unmount();
  });

  // selectVideoB awaits a lookup and then wrote state unconditionally. Closing
  // or going back during that await left the wizard on the details step with a
  // blank side A, or threw on a null selection.
  it('ignores the existing-comparison lookup of a wizard that was closed meanwhile', async () => {
    getUserVideos.mockResolvedValue([video('a'), video('b')]);
    let finishLookup!: (v: null) => void;
    findExistingComparison.mockImplementationOnce(
      () => new Promise<null>((resolve) => (finishLookup = resolve))
    );
    const errors: unknown[] = [];
    const m = await mount((e) => errors.push(e));
    await m.clickVideo('video a');
    await m.clickVideo('video b');

    (m.q<HTMLButtonElement>('button[aria-label="Close"]'))!.click();
    await flush();
    finishLookup(null);
    await flush();

    expect(errors).toEqual([]);
    expect(m.step()).toBe(initialStep);
    m.unmount();
  });

  it('closes on Escape from anywhere in the dialog, with dialog semantics', async () => {
    getUserVideos.mockResolvedValue([video('a')]);
    const closed: number[] = [];
    const m = await mount(undefined, () => closed.push(1));
    expect(m.q('[role="dialog"][aria-modal="true"]')).not.toBeNull();

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();

    expect(closed).toEqual([1]);
    m.unmount();
  });
});
