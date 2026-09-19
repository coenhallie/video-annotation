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

// jsdom's media element has no playback engine; a plain settable currentTime is
// all frame stepping needs.
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

describe('dual frame step buttons', () => {
  it('steps each video one frame from its own position, keeping the offset', async () => {
    let dual: DualVideoPlayer | null = null;
    const player = ref<{ stepFrame: (n: number) => void } | null>(null);
    const Host = defineComponent({
      setup() {
        dual = useDualVideoPlayer();
        return () =>
          h(UnifiedVideoPlayer, {
            ref: player,
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
    await nextTick();
    await nextTick();

    try {
      const d = dual as unknown as DualVideoPlayer;
      const a = d.videoARef.value!;
      const b = d.videoBRef.value!;
      fakeClock(a, 10);
      fakeClock(b, 25);
      d.videoACurrentTime!.value = 10;
      d.videoBCurrentTime!.value = 25;
      d.setFps!('A', 25);
      d.setFps!('B', 25);

      player.value!.stepFrame(1);

      expect(a.currentTime).toBeCloseTo(10.04, 5);
      expect(b.currentTime).toBeCloseTo(25.04, 5);
    } finally {
      app.unmount();
      root.remove();
    }
  });
});
