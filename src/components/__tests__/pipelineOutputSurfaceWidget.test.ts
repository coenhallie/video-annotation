// @vitest-environment jsdom
//
// The surface over the real match tracker widget, not a fake: what a press, a
// wheel and a double click on the transport do is the widget's behaviour (it
// leaves anything marked data-match-tracker-keep alone, and since 0.12.0 takes
// no zoom or pan by hand), so it is proved there.
// Only the canvas is stubbed, since jsdom has no 2D context.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import PipelineOutputSurface from '@/components/PipelineOutputSurface.vue';
import type { PipelineReplay } from '@/composables/usePipelineReplay';
import type { ReplayRecord } from '@/lib/pipelineData/frameWindow';
import type { MatchTrackerInstance } from '@coenhallie/match-tracker';

const { made, createMatchTracker } = vi.hoisted(() => {
  const made: unknown[] = [];
  return { made, createMatchTracker: vi.fn() };
});

vi.mock('@coenhallie/match-tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@coenhallie/match-tracker')>();
  createMatchTracker.mockImplementation((...args: Parameters<typeof actual.createMatchTracker>) => {
    const tracker = actual.createMatchTracker(...args);
    made.push(tracker);
    return tracker;
  });
  return { ...actual, createMatchTracker };
});

const capture = vi.fn();

beforeAll(() => {
  // A context that takes any call: the pitch is not what this file looks at.
  const context = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'canvas'
          ? undefined
          : key === 'measureText'
            ? () => ({ width: 0 })
            : () => ({ addColorStop: () => {} }),
      set: () => true,
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D
  );
  Element.prototype.setPointerCapture = capture;
  Element.prototype.releasePointerCapture = () => {};
});

afterEach(() => {
  made.length = 0;
  capture.mockClear();
  document.body.innerHTML = '';
});

const record: ReplayRecord = {
  frameCount: 457,
  t: 1000,
  frame: { teams: [], balls: [], frame_data: [{ frame_count: 457 }] } as unknown as ReplayRecord['frame'],
};

const replay = () =>
  ({
    currentTime: ref(0),
    duration: ref(120),
    currentFrame: ref(457),
    totalFrames: ref(3000),
    fps: ref(25),
    isPlaying: ref(false),
    record: shallowRef<ReplayRecord | null>(record),
    lookback: shallowRef<readonly ReplayRecord[]>([record]),
    buffering: ref(false),
    state: ref('ready'),
    error: ref(null),
    load: vi.fn(async () => {}),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(async () => {}),
    whenIdle: vi.fn(async () => {}),
    dispose: vi.fn(),
  }) as unknown as PipelineReplay;

async function mountReal(props: { drawing?: boolean } = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(defineComponent({ setup: () => () => h(PipelineOutputSurface, { replay: replay(), ...props }) }));
  app.mount(root);
  await nextTick();
  await nextTick();
  const tracker = made[0] as MatchTrackerInstance;
  const zooms: number[] = [];
  tracker.on('zoom', ({ zoom }) => zooms.push(zoom));
  const byId = (id: string) => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  return { app, root, tracker, zooms, byId };
}

const press = (el: Element) =>
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
const doubleClick = (el: Element) =>
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, composed: true }));

describe('PipelineOutputSurface on the real match tracker', () => {
  it('runs the real widget', async () => {
    const m = await mountReal();
    expect(m.tracker.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(m.tracker.overlay.contains(m.byId('pipeline-controls'))).toBe(true);
    m.app.unmount();
  });

  it('leaves a ctrl/⌘ + wheel and a double click, over the transport or the pitch, to the page: nothing zooms', async () => {
    const m = await mountReal();
    for (const el of [m.byId('pipeline-step-forward'), m.tracker.overlay]) {
      const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, ctrlKey: true, deltaY: -100 });
      el.dispatchEvent(wheel);
      expect(wheel.defaultPrevented).toBe(false);
      doubleClick(el);
    }
    expect(m.zooms).toEqual([]);
    m.app.unmount();
  });

  it('takes no pointer on a press on the transport or the pitch, and the click lands', async () => {
    const m = await mountReal();
    const button = m.byId('pipeline-step-forward');
    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    press(button);
    press(m.tracker.overlay);
    expect(capture).not.toHaveBeenCalled();

    button.click();
    expect(clicked).toHaveBeenCalledOnce();
    m.app.unmount();
  });

  it('keeps the transport inert while drawing', async () => {
    const m = await mountReal({ drawing: true });
    expect(m.byId('pipeline-controls').hasAttribute('inert')).toBe(true);
    m.app.unmount();
  });
});
