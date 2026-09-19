// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

vi.mock('@/services/fragmentedMp4Source', () => ({
  openFragmentedMp4: vi.fn(async () => null),
  sameObject: () => false,
}));

import SingleVideoPlayer from '@/components/video/SingleVideoPlayer.vue';

// The overlay (the drawing canvas) used to fill the whole player box, letterbox
// bands included, so drawing coordinates depended on the shape of the box.
describe('SingleVideoPlayer overlay', () => {
  it('sits in a box with the picture’s own size and shape, and is told the video size', async () => {
    let slotProps: Record<string, unknown> = {};
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = createApp({
      render: () =>
        h(SingleVideoPlayer, { videoUrl: 'https://example.com/v.mp4' }, {
          overlays: (p: Record<string, unknown>) => {
            slotProps = p;
            return h('div', { 'data-testid': 'overlay-content' });
          },
        }),
    });
    app.use(createPinia());
    app.mount(root);
    await nextTick();

    const video = root.querySelector('video')!;
    Object.defineProperty(video, 'videoWidth', { value: 1920 });
    Object.defineProperty(video, 'videoHeight', { value: 660 });
    Object.defineProperty(video, 'duration', { value: 10 });
    video.dispatchEvent(new Event('loadedmetadata'));
    await nextTick();
    await nextTick();

    const box = root.querySelector('[data-testid="overlay-content"]')!.parentElement!;
    expect(box.style.aspectRatio.replace(/\s/g, '')).toBe('1920/660');
    expect(box.style.width).toBe('1920px');
    expect(slotProps.videoSize).toEqual({ width: 1920, height: 660 });
    app.unmount();
    root.remove();
  });
});
