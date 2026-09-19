// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { Video } from '@/types/database';
import type { VideoUploadService as Service } from '@/services/videoUploadService';

vi.mock('@/composables/useSupabase', () => ({ supabase: {} }));
vi.mock('@/services/videoService', () => ({ VideoService: {} }));
vi.mock('@/utils/thumbnailGenerator', () => ({ ThumbnailGenerator: {} }));
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ user: { value: { id: 'user-1' } } }),
}));

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

async function mount() {
  const { default: C } = await import('@/components/ComparisonVideoUpload.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const uploaded: Video[] = [];
  const busy: boolean[] = [];
  const app = createApp({
    render: () =>
      h(C, {
        onUploaded: (v: Video) => uploaded.push(v),
        onBusy: (b: boolean) => busy.push(b),
      }),
  });
  app.mount(root);
  const input = () => root.querySelector<HTMLInputElement>('input[type="file"]')!;
  return {
    root,
    uploaded,
    busy,
    input,
    text: () => root.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    pick: async (file: File) => {
      Object.defineProperty(input(), 'files', { value: [file], configurable: true });
      input().dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    },
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

const mp4 = (name = 'clip.mp4') => new File([new Uint8Array(8)], name, { type: 'video/mp4' });

let uploadVideoComplete: MockInstance<typeof Service.uploadVideoComplete>;
let validateVideoCompatibility: MockInstance<typeof Service.validateVideoCompatibility>;

beforeEach(async () => {
  const { VideoUploadService } = await import('@/services/videoUploadService');
  uploadVideoComplete = vi
    .spyOn(VideoUploadService, 'uploadVideoComplete')
    .mockImplementation(async (file, _userId, options) => {
      options?.onProgress?.({ loaded: 42, total: 100, percentage: 42 });
      return { id: 'v-new', title: file.name.replace(/\.mp4$/, '') } as Video;
    });
  validateVideoCompatibility = vi
    .spyOn(VideoUploadService, 'validateVideoCompatibility')
    .mockResolvedValue({ valid: true });
});

afterEach(() => vi.restoreAllMocks());

describe('ComparisonVideoUpload', () => {
  it('offers a file picker limited to the supported video types', async () => {
    const m = await mount();
    expect(m.input().accept).toBe(
      'video/mp4,video/webm,video/ogg,video/quicktime'
    );
    expect(m.text()).not.toMatch(/AVI/);
    expect(
      m.root.querySelector('[data-testid="comparison-upload-button"]')?.textContent ?? ''
    ).toMatch(/upload a video/i);
    m.unmount();
  });

  it('uploads the chosen file as the signed-in user and emits the new video', async () => {
    const m = await mount();
    await m.pick(mp4('serve.mp4'));
    expect(uploadVideoComplete).toHaveBeenCalledTimes(1);
    expect(uploadVideoComplete.mock.calls[0]?.[1]).toBe('user-1');
    expect(m.uploaded).toEqual([{ id: 'v-new', title: 'serve' }]);
    // Back at rest, ready for the next file.
    expect(m.text()).toMatch(/upload a video/i);
    expect(m.text()).not.toMatch(/%/);
    m.unmount();
  });

  it('shows the file name and progress while uploading', async () => {
    const m = await mount();
    let finish!: (v: Video) => void;
    uploadVideoComplete.mockImplementation(
      (_file, _userId, options) =>
        new Promise<Video>((resolve) => {
          options?.onProgress?.({ loaded: 42, total: 100, percentage: 42 });
          finish = resolve;
        })
    );
    await m.pick(mp4('serve.mp4'));
    expect(m.text()).toContain('serve.mp4');
    expect(m.text()).toContain('42%');
    finish({ id: 'v-new' } as Video);
    await flush();
    expect(m.uploaded).toHaveLength(1);
    m.unmount();
  });

  it('rejects an unsupported file inline without starting an upload', async () => {
    const m = await mount();
    await m.pick(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(uploadVideoComplete).not.toHaveBeenCalled();
    expect(m.text()).toContain('Unsupported file type');
    m.unmount();
  });

  it('rejects an HEVC file inline without starting an upload', async () => {
    const m = await mount();
    validateVideoCompatibility.mockResolvedValue({ valid: false, error: 'HEVC no' });
    await m.pick(mp4('h265.mp4'));
    expect(uploadVideoComplete).not.toHaveBeenCalled();
    expect(m.text()).toContain('HEVC no');
    m.unmount();
  });

  it('shows the upload error and clears it on the next pick', async () => {
    const m = await mount();
    uploadVideoComplete.mockRejectedValueOnce(new Error('policy says no'));
    await m.pick(mp4());
    expect(m.text()).toContain('policy says no');
    expect(m.uploaded).toHaveLength(0);
    // The control is still usable: the same file can be picked again.
    await m.pick(mp4());
    expect(m.uploaded).toHaveLength(1);
    expect(m.text()).not.toContain('policy says no');
    m.unmount();
  });

  /** An upload that stays in flight until its signal aborts. */
  const holdUpload = () => {
    let signal: AbortSignal | undefined;
    uploadVideoComplete.mockImplementation(
      (_file, _userId, options) =>
        new Promise<Video>((_resolve, reject) => {
          signal = options?.signal;
          signal?.addEventListener('abort', () => reject(new Error('Upload was cancelled.')));
        })
    );
    return () => signal;
  };

  // An upload can be a gigabyte. There was no way to stop one.
  it('can be cancelled, and goes back to the picker without an error', async () => {
    const signal = holdUpload();
    const m = await mount();
    await m.pick(mp4());

    [...m.root.querySelectorAll('button')].find((b) => /cancel/i.test(b.textContent ?? ''))!.click();
    await flush();

    expect(signal()?.aborted).toBe(true);
    expect(m.root.querySelector('[data-testid="comparison-upload-button"]')).not.toBeNull();
    expect(m.text()).not.toMatch(/failed|cancelled/i);
    m.unmount();
  });

  // Vue drops emits from an unmounted instance, so an upload that outlived the
  // component finished, inserted its row, and was never selected or listed.
  it('stops the upload when the component goes away', async () => {
    const signal = holdUpload();
    const m = await mount();
    await m.pick(mp4());

    m.unmount();

    expect(signal()?.aborted).toBe(true);
  });

  // The host disables everything that would unmount this while it works.
  it('tells its host when it starts and stops working', async () => {
    const m = await mount();
    await m.pick(mp4());
    expect(m.busy).toEqual([true, false]);
    m.unmount();
  });
});
