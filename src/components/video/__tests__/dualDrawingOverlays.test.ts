// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';

// Stand-in for the fabric-backed canvas: records the frame each side is given.
const seenFrames: Record<string, number> = {};
vi.mock('@/components/DrawingCanvas.vue', () => ({
  default: {
    name: 'DrawingCanvas',
    props: ['currentFrame', 'currentColor'],
    render(this: { currentFrame: number; currentColor: string }) {
      seenFrames[this.currentColor] = this.currentFrame;
      return null;
    },
  },
}));

import UnifiedVideoPlayer from '@/components/UnifiedVideoPlayer.vue';
import {
  useDualVideoPlayer,
  type DualVideoPlayer,
} from '@/composables/useDualVideoPlayer';

// The colour is only a tag that tells the two stub canvases apart.
const canvasStub = (color: string) => ({
  isDrawingMode: ref(false),
  currentTool: ref({ type: 'pen', strokeWidth: 3, severity: 'medium' as const }),
  allDrawings: ref([]),
  isLoadingDrawings: ref(false),
  getCurrentColor: () => color,
});

async function mountDual() {
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
          drawingCanvasA: canvasStub('A'),
          drawingCanvasB: canvasStub('B'),
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
  return {
    dual: dual as unknown as DualVideoPlayer,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

describe('dual drawing overlays', () => {
  it('renders a drawing canvas over video B as well as video A', async () => {
    for (const k of Object.keys(seenFrames)) delete seenFrames[k];
    const { unmount } = await mountDual();
    try {
      expect(Object.keys(seenFrames).sort()).toEqual(['A', 'B']);
    } finally {
      unmount();
    }
  });

  it("gives each canvas the composable's frame number, not time * 30", async () => {
    for (const k of Object.keys(seenFrames)) delete seenFrames[k];
    const { dual, unmount } = await mountDual();
    try {
      // A 25 fps video at t=100s: drawings there are stamped frame 2500.
      dual.videoACurrentTime!.value = 100;
      dual.videoACurrentFrame!.value = 2500;
      dual.videoBCurrentTime!.value = 40;
      dual.videoBCurrentFrame!.value = 1000;
      await nextTick();
      expect(seenFrames.A).toBe(2500);
      expect(seenFrames.B).toBe(1000);
    } finally {
      unmount();
    }
  });
});
