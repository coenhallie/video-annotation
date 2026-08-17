// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import VideoTimeline from '@/components/VideoTimeline.vue';

const LABELLED = {
  id: 'annotation-labelled',
  title: 'BALL MISSED',
  timestamp: 10,
  severity: 'high',
  labels: ['label-ball-missed'],
};

const COMMENT = {
  id: 'annotation-comment',
  title: 'keeper off his line early',
  timestamp: 20,
  labels: [] as string[],
};

// What useRealtimeAnnotations pushes: a raw annotations row, with no labels
// property at all because the join was never resolved. Its labels are unknown,
// not empty, so it must not be mistaken for a comment.
const UNHYDRATED = {
  id: 'annotation-unhydrated',
  title: 'BALL MISSED',
  timestamp: 30,
  severity: 'low',
};

function mountTimeline(selectedAnnotation?: object) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(VideoTimeline, {
            currentTime: 0,
            duration: 60,
            currentFrame: 0,
            totalFrames: 1800,
            fps: 30,
            annotations: [LABELLED, COMMENT, UNHYDRATED],
            ...(selectedAnnotation ? { selectedAnnotation } : {}),
          });
      },
    })
  );
  app.mount(root);
  return { root, unmount: () => { app.unmount(); root.remove(); } };
}

const dotFor = (root: HTMLElement, id: string) =>
  root
    .querySelector(`[data-annotation-marker][data-annotation-id="${id}"]`)
    ?.firstElementChild as HTMLElement | undefined;

describe('VideoTimeline markers', () => {
  it('fills a labelled marker with its severity colour', async () => {
    const t = mountTimeline();
    await nextTick();

    const dot = dotFor(t.root, 'annotation-labelled');
    expect(dot).toBeDefined();
    expect(dot!.style.backgroundColor).toBe('rgb(239, 68, 68)'); // high => #ef4444
    expect(dot!.className).toContain('border-white');
    t.unmount();
  });

  it('draws a comment marker as a hollow ring', async () => {
    const t = mountTimeline();
    await nextTick();

    const dot = dotFor(t.root, 'annotation-comment');
    expect(dot).toBeDefined();
    expect(dot!.style.backgroundColor).toBe('');
    expect(dot!.className).toContain('bg-transparent');
    expect(dot!.className).not.toContain('border-white');
    t.unmount();
  });

  it('fills a marker whose labels were never hydrated rather than ringing it', async () => {
    const t = mountTimeline();
    await nextTick();

    const dot = dotFor(t.root, 'annotation-unhydrated');
    expect(dot).toBeDefined();
    expect(dot!.style.backgroundColor).toBe('rgb(52, 211, 153)'); // low => #34d399
    expect(dot!.className).toContain('border-white');
    expect(dot!.className).not.toContain('bg-transparent');
    t.unmount();
  });

  it('shows a selected comment marker with the selection border and no comment border', async () => {
    const t = mountTimeline(COMMENT);
    await nextTick();

    const dot = dotFor(t.root, 'annotation-comment');
    expect(dot).toBeDefined();
    expect(dot!.className).toContain('border-yellow-400');
    expect(dot!.className).not.toContain('border-gray-300');
    expect(dot!.style.backgroundColor).toBe('');
    t.unmount();
  });

  it('shows a selected labelled marker with the selection border and no default border', async () => {
    const t = mountTimeline(LABELLED);
    await nextTick();

    const dot = dotFor(t.root, 'annotation-labelled');
    expect(dot).toBeDefined();
    expect(dot!.className).toContain('border-yellow-400');
    expect(dot!.className).not.toContain('border-white');
    t.unmount();
  });
});
