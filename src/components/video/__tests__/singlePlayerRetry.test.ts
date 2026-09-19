// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const openFragmentedMp4 = vi.fn(async () => null);
vi.mock('@/services/fragmentedMp4Source', () => ({
  openFragmentedMp4: (...a: unknown[]) => openFragmentedMp4(...(a as [])),
  sameObject: () => false,
}));

import SingleVideoPlayer from '@/components/video/SingleVideoPlayer.vue';

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

// The error overlay's "Try Again" emitted `retry`, and no parent has ever
// listened for it: the one recovery control on a failed video did nothing.
describe('SingleVideoPlayer Try Again', () => {
  it('attaches the source again and clears the error', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = createApp({
      render: () => h(SingleVideoPlayer, { videoUrl: 'https://example.com/v.mp4' }),
    });
    app.use(createPinia());
    app.mount(root);
    await settle();
    const video = root.querySelector('video')!;
    video.dispatchEvent(new Event('error'));
    await settle();
    expect(root.textContent).toContain('Failed to load video');
    const attachesBefore = openFragmentedMp4.mock.calls.length;

    [...root.querySelectorAll('button')]
      .find((b) => /try again/i.test(b.textContent ?? ''))!
      .click();
    await settle();

    expect(openFragmentedMp4.mock.calls.length).toBe(attachesBefore + 1);
    expect(root.textContent).not.toContain('Failed to load video');
    app.unmount();
    root.remove();
  });
});
