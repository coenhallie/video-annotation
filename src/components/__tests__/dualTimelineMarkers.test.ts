// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import DualTimeline from '@/components/DualTimeline.vue';

// Every annotation created in a comparison is stored with videoContext
// 'comparison' and a frame per video, and the service tags the two videos'
// own annotations 'video_a' / 'video_b'. The bars used to look for 'A' and
// 'B', which nothing ever writes, so a comparison timeline never showed a
// marker at all. Each bar now shows what belongs on it, positioned by that
// video's own frame and fps, which is also how clicking a marker seeks.

const base = { severity: 'low', labels: ['l1'], annotationType: 'text' };
const COMPARISON = {
  ...base,
  id: 'c1',
  title: 'BOTH',
  videoContext: 'comparison',
  timestamp: 10, // A's time at creation; B's must not reuse it
  videoAFrame: 300, // 10 s at 30 fps
  videoBFrame: 50, // 2 s at 25 fps
};
const ONLY_A = { ...base, id: 'a1', title: 'ON A', videoContext: 'video_a', timestamp: 30 };
const ONLY_B = { ...base, id: 'b1', title: 'ON B', videoContext: 'video_b', timestamp: 60 };
const LEGACY = { ...base, id: 'l1', title: 'NO CONTEXT', timestamp: 15 };

function mount(annotations: unknown[]) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(DualTimeline, {
            videoADuration: 60,
            videoAFps: 30,
            videoBDuration: 120,
            videoBFps: 25,
            annotations,
          });
      },
    })
  );
  app.mount(root);
  return { root, unmount: () => { app.unmount(); root.remove(); } };
}

/** id -> left offset (% of the bar) for the markers on the n-th bar. */
function markers(root: HTMLElement, index: number): Record<string, number> {
  const bar = root.querySelectorAll('.timeline-container')[index] as HTMLElement;
  const out: Record<string, number> = {};
  for (const el of bar.querySelectorAll<HTMLElement>('[data-annotation-marker]')) {
    out[el.dataset.annotationId as string] = parseFloat(el.style.left);
  }
  return out;
}

describe('DualTimeline markers', () => {
  it('places a comparison annotation on both bars, each at its own video frame', async () => {
    const t = mount([COMPARISON]);
    await nextTick();

    // 300 frames / 30 fps = 10 s of 60 s; 50 frames / 25 fps = 2 s of 120 s.
    expect(markers(t.root, 0)).toEqual({ c1: expect.closeTo(100 * 10 / 60, 3) });
    expect(markers(t.root, 1)).toEqual({ c1: expect.closeTo(100 * 2 / 120, 3) });
    t.unmount();
  });

  it("shows each video's own annotations on its bar only, by their timestamp", async () => {
    const t = mount([ONLY_A, ONLY_B]);
    await nextTick();

    expect(markers(t.root, 0)).toEqual({ a1: expect.closeTo(50, 3) });
    expect(markers(t.root, 1)).toEqual({ b1: expect.closeTo(50, 3) });
    t.unmount();
  });

  it('keeps an annotation with no context on bar A at its timestamp', async () => {
    const t = mount([LEGACY]);
    await nextTick();

    expect(markers(t.root, 0)).toEqual({ l1: expect.closeTo(25, 3) });
    expect(markers(t.root, 1)).toEqual({});
    t.unmount();
  });
});
