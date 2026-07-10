// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

// DrawingCanvas pulls in fabric.js and is irrelevant to player wiring
vi.mock('@/components/DrawingCanvas.vue', () => ({
  default: { name: 'DrawingCanvas', render: () => null },
}));

import UnifiedVideoPlayer from '@/components/UnifiedVideoPlayer.vue';
import {
  useDualVideoPlayer,
  type DualVideoPlayer,
} from '@/composables/useDualVideoPlayer';

describe('dual video player wiring', () => {
  it('binds the parent-provided dualVideoPlayer instance to the rendered video elements', async () => {
    let dual: DualVideoPlayer | null = null;

    const Host = defineComponent({
      setup() {
        dual = useDualVideoPlayer();
        return () =>
          h(UnifiedVideoPlayer, {
            mode: 'dual',
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

    // Let the mount + ref-binding watchers flush
    await nextTick();
    await nextTick();

    try {
      expect(dual!.videoARef.value).toBeInstanceOf(HTMLVideoElement);
      expect(dual!.videoBRef.value).toBeInstanceOf(HTMLVideoElement);
    } finally {
      app.unmount();
      root.remove();
    }
  });
});
