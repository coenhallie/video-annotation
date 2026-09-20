// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';

vi.mock('@/components/DrawingCanvas.vue', () => ({
  default: { name: 'DrawingCanvas', render: () => null },
}));

import UnifiedVideoPlayer from '@/components/UnifiedVideoPlayer.vue';
import {
  useDualVideoPlayer,
  type DualVideoPlayer,
} from '@/composables/useDualVideoPlayer';

function fakeClock(el: HTMLVideoElement, start: number) {
  let t = start;
  Object.defineProperty(el, 'currentTime', {
    configurable: true,
    get: () => t,
    set: (v: number) => {
      t = v;
    },
  });
}

function mountDual() {
  let dual: DualVideoPlayer | null = null;
  const mode = ref<'dual' | 'single'>('dual');
  const Host = defineComponent({
    setup() {
      dual = useDualVideoPlayer();
      return () =>
        h(UnifiedVideoPlayer, {
          mode: mode.value,
          videoUrl: 'https://example.com/single.mp4',
          videoAUrl: 'https://example.com/a.mp4',
          videoBUrl: 'https://example.com/b.mp4',
          dualVideoPlayer: dual,
        });
    },
  });
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(Host);
  app.use(createPinia());
  app.mount(root);
  return {
    dual: () => dual as unknown as DualVideoPlayer,
    mode,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

describe('dual player across a project switch', () => {
  // Going from one comparison straight to another keeps the same two <video>
  // elements mounted, so nothing re-binds them after the switch cleanup.
  it('still follows and drives the mounted videos after destroy()', async () => {
    const host = mountDual();
    await nextTick();
    await nextTick();
    try {
      const d = host.dual();
      const a = d.videoARef.value!;
      const b = d.videoBRef.value!;

      d.destroy();
      await nextTick();

      fakeClock(a, 4);
      fakeClock(b, 6);
      a.dispatchEvent(new Event('timeupdate'));
      b.dispatchEvent(new Event('timeupdate'));
      expect(d.videoACurrentTime!.value).toBe(4);
      expect(d.videoBCurrentTime!.value).toBe(6);

      d.seekVideoA!(12);
      expect(a.currentTime).toBe(12);
    } finally {
      host.unmount();
    }
  });

  it('lets go of the videos when the dual player leaves the page', async () => {
    const host = mountDual();
    await nextTick();
    await nextTick();
    try {
      const d = host.dual();
      expect(d.videoARef.value).toBeInstanceOf(HTMLVideoElement);

      host.mode.value = 'single';
      await nextTick();
      await nextTick();

      expect(d.videoARef.value).toBeNull();
      expect(d.videoBRef.value).toBeNull();
    } finally {
      host.unmount();
    }
  });
});
