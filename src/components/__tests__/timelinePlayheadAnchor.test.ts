// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import VideoTimeline from '@/components/VideoTimeline.vue';
import DualTimeline from '@/components/DualTimeline.vue';

// Enter opens the quick pick with no pointer to anchor it to, so each timeline
// says where its playhead is. The panel opens upward from the y it is given,
// so the anchor is the top of the bar, the same as a click on it.

const RECT = (top: number, left = 100, width = 1000) =>
  ({ width, height: 48, top, left, right: left + width, bottom: top + 48, x: left, y: top, toJSON() {} }) as DOMRect;

function mount(component: unknown, props: Record<string, unknown>) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const instance = ref<any>(null);
  const app = createApp(
    defineComponent({ setup: () => () => h(component as any, { ...props, ref: instance }) })
  );
  app.mount(root);
  return { root, instance, unmount: () => { app.unmount(); root.remove(); } };
}

/** The clickable bar inside a VideoTimeline: the parent of its playhead. */
function bars(root: HTMLElement) {
  return [...root.querySelectorAll('.cursor-pointer.rounded.overflow-hidden')] as HTMLElement[];
}

describe('VideoTimeline playheadAnchor', () => {
  it('is the top of the bar, at the playhead', async () => {
    const t = mount(VideoTimeline, { currentTime: 15, duration: 60, fps: 30 });
    await nextTick();
    bars(t.root)[0]!.getBoundingClientRect = () => RECT(400);
    expect(t.instance.value.playheadAnchor()).toEqual({ clientX: 350, clientY: 400 });
    t.unmount();
  });

  it('has no anchor before the duration is known', async () => {
    const t = mount(VideoTimeline, { currentTime: 0, duration: 0, fps: 30 });
    await nextTick();
    expect(t.instance.value.playheadAnchor()).toBeNull();
    t.unmount();
  });
});

describe('DualTimeline playheadAnchor', () => {
  const props = {
    videoACurrentTime: 30,
    videoADuration: 60,
    videoAFps: 30,
    videoBCurrentTime: 90,
    videoBDuration: 120,
    videoBFps: 25,
  };

  it('anchors to the selected bar and says which video that is', async () => {
    const t = mount(DualTimeline, props);
    await nextTick();
    const [a, b] = bars(t.root);
    a!.getBoundingClientRect = () => RECT(400);
    b!.getBoundingClientRect = () => RECT(600);

    expect(t.instance.value.playheadAnchor()).toEqual({ video: 'A', clientX: 600, clientY: 400 });

    // ArrowDown selects B, the way the hint above the bars says.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await nextTick();
    expect(t.instance.value.playheadAnchor()).toEqual({ video: 'B', clientX: 850, clientY: 600 });
    t.unmount();
  });
});
