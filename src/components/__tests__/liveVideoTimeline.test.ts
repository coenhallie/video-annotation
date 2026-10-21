// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import LiveVideoTimeline from '@/components/LiveVideoTimeline.vue';
import type { TimelineNumbers } from '@/utils/timelineBinding';

// The timeline reads the playing position itself. Passed down as values, the
// position made the editor re-render, and everything in it, on every tick.

const RECT = { width: 1000, height: 48, top: 400, left: 100, right: 1100, bottom: 448, x: 100, y: 400, toJSON() {} } as DOMRect;

function numbers(over: Partial<TimelineNumbers> = {}): TimelineNumbers {
  return { currentTime: 15, duration: 60, currentFrame: 375, totalFrames: 1500, fps: 25, isPlaying: false, ...over };
}

function mount(extra: Record<string, unknown> = {}) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const state = ref(numbers());
  const timeline = ref<InstanceType<typeof LiveVideoTimeline> | null>(null);
  let parentRenders = 0;
  const app = createApp(
    defineComponent({
      setup: () => {
        const read = () => state.value;
        return () => {
          parentRenders++;
          return h(LiveVideoTimeline, { ref: timeline, numbers: read, ...extra });
        };
      },
    })
  );
  app.mount(root);
  return {
    root,
    state,
    timeline,
    parentRenders: () => parentRenders,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

describe('LiveVideoTimeline', () => {
  it('shows the numbers it reads', async () => {
    const t = mount();
    await nextTick();
    expect(t.root.textContent).toMatch(/0:15/);
    expect(t.root.textContent).toMatch(/25fps/);
    t.unmount();
  });

  it('follows the position without its parent re-rendering', async () => {
    const t = mount();
    await nextTick();
    const renders = t.parentRenders();
    t.state.value = numbers({ currentTime: 42, currentFrame: 1050 });
    await nextTick();
    expect(t.root.textContent).toMatch(/0:42/);
    expect(t.parentRenders()).toBe(renders);
    t.unmount();
  });

  it('passes everything else through to the timeline, events included', async () => {
    const onSeek = vi.fn();
    const t = mount({ onSeekToTime: onSeek, annotations: [] });
    await nextTick();
    const bar = t.root.querySelector('.cursor-pointer.rounded.overflow-hidden') as HTMLElement;
    bar.getBoundingClientRect = () => RECT;
    bar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 600, clientY: 410, button: 0 }));
    // A drag along the bar scrubs, seeking as it goes.
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700, clientY: 410 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 700, clientY: 410 }));
    await new Promise((r) => setTimeout(r, 40));
    expect(onSeek).toHaveBeenCalled();
    t.unmount();
  });

  it("gives the timeline's playhead anchor, for Enter's quick pick", async () => {
    const t = mount();
    await nextTick();
    const bar = t.root.querySelector('.cursor-pointer.rounded.overflow-hidden') as HTMLElement;
    bar.getBoundingClientRect = () => RECT;
    expect(t.timeline.value?.playheadAnchor()).toEqual({ clientX: 350, clientY: 400 });
    t.unmount();
  });
});
