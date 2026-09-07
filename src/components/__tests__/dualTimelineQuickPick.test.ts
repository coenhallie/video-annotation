// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import DualTimeline from '@/components/DualTimeline.vue';

// DualTimeline is one VideoTimeline per video. Each bar already turns a plain
// click into an open-quick-pick with the time under the pointer; before this
// the wrapper dropped that event on the floor, so a comparison had no way to
// open the label picker from its timeline at all.

const ANNOTATION_A = {
  id: 'a1',
  title: 'ON A',
  timestamp: 10,
  severity: 'low',
  labels: ['l1'],
  annotationType: 'text',
};
const ANNOTATION_B = { ...ANNOTATION_A, id: 'b1', title: 'ON B', videoContext: 'B' };

function mountDual(onOpenQuickPick: (payload: unknown) => void) {
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
            annotations: [ANNOTATION_A, ANNOTATION_B],
            onOpenQuickPick,
          });
      },
    })
  );
  app.mount(root);
  return { root, unmount: () => { app.unmount(); root.remove(); } };
}

/** The clickable bar inside the n-th timeline container, with a laid-out rect. */
function bar(root: HTMLElement, index: number, width = 1000) {
  const container = root.querySelectorAll('.timeline-container')[index] as HTMLElement;
  const el = container.querySelector('[data-annotation-marker]')?.parentElement as HTMLElement;
  el.getBoundingClientRect = () =>
    ({ width, height: 48, top: 100 + index * 200, left: 0, right: width, bottom: 148, x: 0, y: 100, toJSON() {} }) as DOMRect;
  return el;
}

const click = (el: HTMLElement, clientX: number) => {
  el.dispatchEvent(new MouseEvent('mousedown', { clientX, clientY: 124, bubbles: true, cancelable: true }));
  document.dispatchEvent(new MouseEvent('mouseup', { clientX, clientY: 124, bubbles: true, cancelable: true }));
};

describe('DualTimeline quick pick', () => {
  it('forwards a click on bar A as an open-quick-pick for video A, and selects that bar', async () => {
    const picks: any[] = [];
    const t = mountDual((p) => picks.push(p));
    await nextTick();
    // Start on B so the selection change is observable.
    (t.root.querySelectorAll('.timeline-container')[1] as HTMLElement).click();
    await nextTick();

    click(bar(t.root, 0), 500);
    await nextTick();

    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ video: 'A', time: 30, clientX: 500 });
    expect(t.root.textContent).toContain('Video A');
    expect(t.root.textContent).toMatch(/Selected:\s*Video A/);
    t.unmount();
  });

  it('forwards a click on bar B with that video\'s own timebase', async () => {
    const picks: any[] = [];
    const t = mountDual((p) => picks.push(p));
    await nextTick();

    click(bar(t.root, 1), 250);
    await nextTick();

    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ video: 'B', time: 30, clientX: 250 });
    expect(t.root.textContent).toMatch(/Selected:\s*Video B/);
    t.unmount();
  });

  it('does not open the quick pick for a scrub', async () => {
    const picks: unknown[] = [];
    const t = mountDual((p) => picks.push(p));
    await nextTick();

    const a = bar(t.root, 0);
    a.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 124, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 124, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 400, clientY: 124, bubbles: true }));
    await nextTick();

    expect(picks).toHaveLength(0);
    t.unmount();
  });
});
