// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import PipelineOutputSurface from '@/components/PipelineOutputSurface.vue';
import type { PipelineReplay, ReplayState } from '@/composables/usePipelineReplay';
import { GOAL_SEQUENCE_MS } from '@/lib/vis/goalSequence';

/**
 * Declared through vi.hoisted because vi.mock is hoisted above the imports,
 * and plain const declarations would still be in their temporal dead zone
 * when the factory runs (see drawingCanvas.test.ts for the same pattern).
 */
const { renderFrame, useRenderer2D } = vi.hoisted(() => {
  const renderFrame = vi.fn();
  const invalidateCache = vi.fn();
  // Zoom and pan go through the renderer now, not a CSS transform on the
  // canvas, so the stub has to carry setView or mounting throws.
  const setView = vi.fn();
  const useRenderer2D = vi.fn(() => ({ renderFrame, invalidateCache, setView }));
  return { renderFrame, setView, useRenderer2D };
});

vi.mock('@/lib/vis/useRenderer2D', () => ({ useRenderer2D }));

function fakeReplay(state: ReplayState, message: string | null = null) {
  return {
    currentTime: ref(0),
    duration: ref(120),
    currentFrame: ref(457),
    totalFrames: ref(3000),
    fps: ref(25),
    isPlaying: ref(false),
    frame: ref(null),
    buffering: ref(false),
    state: ref(state),
    error: ref(message),
    load: vi.fn(async () => {}),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(async () => {}),
    whenIdle: vi.fn(async () => {}),
    dispose: vi.fn(),
  } as unknown as PipelineReplay;
}

function mount(replay: PipelineReplay) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({
      setup: () => () => h(PipelineOutputSurface, { replay }),
    })
  );
  app.mount(root);
  return {
    root,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

const at = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-testid="${id}"]`);

describe('PipelineOutputSurface', () => {
  beforeEach(() => {
    renderFrame.mockClear();
    useRenderer2D.mockClear();
    // jsdom has no 2D context. Give it a stub so renderer attachment is
    // observable; without this ensureRenderer bails and the tests cannot see
    // the bug it exists to catch.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as unknown as CanvasRenderingContext2D
    );
  });

  afterEach(() => {
    // Deliberately not vi.restoreAllMocks(): that calls mockRestore() on
    // every mock, and for a plain vi.fn() (as opposed to a vi.spyOn) restore
    // behaves like reset and wipes the implementation set at creation - which
    // would silently break useRenderer2D's mocked return value for every test
    // that runs after the first one that touches it. Undo only the spy.
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockRestore();
  });

  it('shows the loading state', async () => {
    const m = mount(fakeReplay('loading'));
    await nextTick();
    expect(at(m.root, 'pipeline-loading')).not.toBeNull();
    m.unmount();
  });

  it('shows the no-data state', async () => {
    const m = mount(fakeReplay('empty'));
    await nextTick();
    expect(at(m.root, 'pipeline-empty')).not.toBeNull();
    m.unmount();
  });

  it('shows the error state with its message', async () => {
    const m = mount(fakeReplay('error', 'range request failed'));
    await nextTick();
    const el = at(m.root, 'pipeline-error');
    expect(el?.textContent).toContain('range request failed');
    m.unmount();
  });

  /**
   * The overlay is where the drawing layer mounts, and strokes only land on the
   * right pitch positions if it covers exactly the canvas's rendered rect; the
   * HUD has to sit on the pitch the same way. All three are placed from one
   * computed box. Matching CSS clamps were not enough: a canvas and a div given
   * the same clamps resolve differently once the stage is wider than 16:9.
   *
   * jsdom does no layout, so the stage's rect and the resize notification are
   * supplied here.
   */
  describe('sizing', () => {
    let observed: Array<() => void> = [];
    const originalObserver = globalThis.ResizeObserver;
    const originalDpr = window.devicePixelRatio;

    beforeEach(() => {
      observed = [];
      globalThis.ResizeObserver = class {
        private readonly notify: () => void;
        constructor(cb: () => void) {
          this.notify = cb;
        }
        observe() {
          observed.push(this.notify);
        }
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
        function (this: HTMLElement) {
          return this.dataset.testid === 'pipeline-viewport'
            ? ({ left: 0, top: 0, width: 1096, height: 640 } as DOMRect)
            : ({ left: 0, top: 0, width: 0, height: 0 } as DOMRect);
        }
      );
    });

    afterEach(() => {
      globalThis.ResizeObserver = originalObserver;
      Object.defineProperty(window, 'devicePixelRatio', {
        value: originalDpr,
        configurable: true,
      });
      vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockRestore();
    });

    const box = (el: Element | null) => {
      const style = (el as HTMLElement | null)?.style;
      return [style?.left, style?.top, style?.width, style?.height];
    };

    it('places the canvas, the drawing overlay and the HUD in one box', async () => {
      const m = mount(fakeReplay('ready'));
      await nextTick();
      observed.forEach((notify) => notify());
      await nextTick();

      const canvasBox = box(at(m.root, 'pipeline-canvas'));
      expect(canvasBox[2]).toBe('1096px');
      expect(box(at(m.root, 'pipeline-overlay'))).toEqual(canvasBox);
      expect(box(at(m.root, 'pipeline-hud'))).toEqual(canvasBox);
      m.unmount();
    });

    it('gives the canvas one bitmap pixel per device pixel', async () => {
      const m = mount(fakeReplay('ready'));
      await nextTick();
      observed.forEach((notify) => notify());
      await nextTick();

      const canvas = at(m.root, 'pipeline-canvas') as HTMLCanvasElement;
      expect([canvas.width, canvas.height]).toEqual([2192, 1233]);
      m.unmount();
    });

    // Dragging the window to a display with another pixel ratio leaves its CSS
    // size alone, so no resize is reported. The resolution query is what says.
    it('resizes the bitmap when the device pixel ratio changes', async () => {
      const listeners: Array<() => void> = [];
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        media: query,
        addEventListener: (_: string, cb: () => void) => listeners.push(cb),
        removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
      try {
        const m = mount(fakeReplay('ready'));
        await nextTick();
        observed.forEach((notify) => notify());
        await nextTick();

        Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
        listeners.splice(0).forEach((cb) => cb());
        await nextTick();

        const canvas = at(m.root, 'pipeline-canvas') as HTMLCanvasElement;
        expect(canvas.width).toBe(3288);
        m.unmount();
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it('draws the current frame again once the bitmap is resized', async () => {
      // The order load() produces: mounted while loading, then a frame and
      // ready together, which is what attaches the renderer.
      const replay = fakeReplay('loading');
      const m = mount(replay);
      await nextTick();
      (replay.frame as unknown as { value: unknown }).value = {
        teams: [],
        balls: [],
        state: { actions: [] },
        frame_data: [{ frame_count: 1 }],
      };
      (replay.state as unknown as { value: string }).value = 'ready';
      await nextTick();
      renderFrame.mockClear();
      observed.forEach((notify) => notify());
      await nextTick();

      // Resizing a canvas clears it, so a paused replay would go blank.
      expect(renderFrame).toHaveBeenCalled();
      m.unmount();
    });
  });

  // Zoom and pan live in the renderer now. A transform on the element would put
  // the drawing layer in a different coordinate system from the pitch.
  it('leaves the canvas element free of a zoom or pan transform', async () => {
    const m = mount(fakeReplay('ready'));
    await nextTick();

    const canvas = at(m.root, 'pipeline-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas!.getAttribute('style') ?? '').not.toContain('scale(');

    m.unmount();
  });

  it('shows the canvas when ready', async () => {
    const m = mount(fakeReplay('ready'));
    await nextTick();
    expect(at(m.root, 'pipeline-canvas')).not.toBeNull();
    expect(at(m.root, 'pipeline-empty')).toBeNull();
    m.unmount();
  });

  // The replay holds its clock while it waits on data, and a playhead that
  // stops with nothing on screen saying why reads as a freeze.
  it('marks the frame label while the replay waits on data', async () => {
    const replay = fakeReplay('ready');
    const { root, unmount } = mount(replay);
    await nextTick();
    expect(at(root, 'pipeline-buffering')).toBeNull();

    (replay.buffering as unknown as { value: boolean }).value = true;
    await nextTick();
    expect(at(root, 'pipeline-buffering')?.getAttribute('role')).toBe('status');

    (replay.buffering as unknown as { value: boolean }).value = false;
    await nextTick();
    expect(at(root, 'pipeline-buffering')).toBeNull();
    unmount();
  });

  it('calls load on mount', async () => {
    const replay = fakeReplay('idle');
    const m = mount(replay);
    await nextTick();
    expect(replay.load).toHaveBeenCalledOnce();
    m.unmount();
  });

  it('disposes on unmount', async () => {
    const replay = fakeReplay('ready');
    const m = mount(replay);
    await nextTick();
    m.unmount();
    expect(replay.dispose).toHaveBeenCalledOnce();
  });

  it('emits context-menu instead of opening the browser menu', async () => {
    const replay = fakeReplay('ready');
    const seen: MouseEvent[] = [];
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(PipelineOutputSurface, {
            replay,
            onContextMenu: (e: MouseEvent) => seen.push(e),
          }),
      })
    );
    app.mount(root);
    await nextTick();

    const stage = root.querySelector('[data-testid="pipeline-stage"]')!;
    stage.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(seen).toHaveLength(1);

    app.unmount();
    root.remove();
  });

  it('attaches the renderer and draws when state flips to ready', async () => {
    const replay = fakeReplay('loading');
    const m = mount(replay);
    await nextTick();

    // Exactly what usePipelineReplay.load() does: set the frame, then the
    // state, synchronously in one tick.
    (replay.frame as unknown as { value: unknown }).value = {
      teams: [],
      balls: [],
      state: { actions: [] },
      frame_data: [{ frame_count: 1 }],
    };
    (replay.state as unknown as { value: string }).value = 'ready';
    await nextTick();

    expect(useRenderer2D).toHaveBeenCalledTimes(1);
    expect(renderFrame).toHaveBeenCalled();
    m.unmount();
  });

  it('draws immediately when state flips to ready and the frame was already set', async () => {
    // Covers the reverse ordering from usePipelineReplay: a case where
    // `frame` is already populated (e.g. left over from a prior load) by the
    // time `state` becomes 'ready'. The state watcher, not the frame watcher,
    // is what must pick this up.
    const replay = fakeReplay('loading');
    (replay.frame as unknown as { value: unknown }).value = {
      teams: [],
      balls: [],
      state: { actions: [] },
      frame_data: [{ frame_count: 1 }],
    };
    const m = mount(replay);
    await nextTick();

    (replay.state as unknown as { value: string }).value = 'ready';
    await nextTick();

    expect(useRenderer2D).toHaveBeenCalledTimes(1);
    expect(renderFrame).toHaveBeenCalled();
    m.unmount();
  });

  describe('transport', () => {
    /** The bar itself: the element the visibility classes are bound to. */
    const bar = (root: HTMLElement) =>
      at(root, 'pipeline-controls')?.firstElementChild as HTMLElement;

    const setPlaying = (replay: PipelineReplay, playing: boolean) => {
      (replay.isPlaying as unknown as { value: boolean }).value = playing;
    };

    it('starts playback and pauses it again from one button', async () => {
      const replay = fakeReplay('ready');
      const m = mount(replay);
      await nextTick();

      (at(m.root, 'pipeline-play-pause') as HTMLButtonElement).click();
      expect(replay.play).toHaveBeenCalledOnce();

      setPlaying(replay, true);
      await nextTick();
      expect(at(m.root, 'pipeline-play-pause')?.getAttribute('aria-label')).toBe(
        'Pause'
      );

      (at(m.root, 'pipeline-play-pause') as HTMLButtonElement).click();
      expect(replay.pause).toHaveBeenCalledOnce();
      m.unmount();
    });

    it('stays visible while paused, so the tab never looks control-less', async () => {
      const m = mount(fakeReplay('ready'));
      await nextTick();
      expect(bar(m.root).className).toContain('opacity-100');
      m.unmount();
    });

    it('hides during playback, and comes back on hover', async () => {
      const replay = fakeReplay('ready');
      const m = mount(replay);
      await nextTick();

      setPlaying(replay, true);
      await nextTick();
      expect(bar(m.root).className).toContain('opacity-0');
      // A hidden bar must not swallow pan drags that start over it. Checked
      // on the class list, since the focus-visible variant carries the same
      // utility name as a substring.
      expect(bar(m.root).classList.contains('pointer-events-auto')).toBe(false);

      at(m.root, 'pipeline-stage')?.dispatchEvent(new Event('pointerenter'));
      await nextTick();
      expect(bar(m.root).className).toContain('opacity-100');

      at(m.root, 'pipeline-stage')?.dispatchEvent(new Event('pointerleave'));
      await nextTick();
      expect(bar(m.root).className).toContain('opacity-0');
      m.unmount();
    });

    it('carries the focus-visible reveal rule', async () => {
      // Keyboard reveal is a CSS rule rather than a reactive flag, because a
      // focusin listener cannot distinguish the focus a mouse click leaves
      // behind from a real tab stop. jsdom does not evaluate :focus-visible,
      // so this asserts the rule is present; the behaviour itself is checked
      // against a real browser.
      const m = mount(fakeReplay('ready'));
      await nextTick();
      expect(bar(m.root).className).toContain('has-[:focus-visible]:opacity-100');
      m.unmount();
    });

    it('steps a frame either way, pausing first', async () => {
      const replay = fakeReplay('ready');
      // 10 s in at 25 fps: frame 250 on the grid the step snaps to.
      (replay.currentTime as unknown as { value: number }).value = 10;
      const m = mount(replay);
      await nextTick();

      // The millisecond over the grid position is the deliberate slack that
      // keeps a step off the record it is stepping away from.
      (at(m.root, 'pipeline-step-forward') as HTMLButtonElement).click();
      expect(replay.pause).toHaveBeenCalled();
      expect(vi.mocked(replay.seek).mock.calls[0]?.[0]).toBeCloseTo(
        251 / 25 + 0.001,
        4
      );

      (at(m.root, 'pipeline-step-back') as HTMLButtonElement).click();
      expect(vi.mocked(replay.seek).mock.calls[1]?.[0]).toBeCloseTo(
        249 / 25 + 0.001,
        4
      );
      m.unmount();
    });
  });

  /**
   * DrawingCanvas shows a drawing only where drawing.frame equals the frame it
   * is given. Pipeline drawings are stamped round(replayTime * fps), zero-based,
   * because the pipeline's own frame_count is not (see annotationStampFor). The
   * overlay used to hand the canvas frame_count, so a saved pipeline drawing
   * never came back on any export whose numbering does not start at zero.
   */
  it('gives the overlay the same frame number drawings are stamped with', async () => {
    const replay = fakeReplay('ready');
    replay.currentTime.value = 4;
    let seen: Record<string, unknown> | null = null;
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(PipelineOutputSurface, { replay }, {
            overlay: (slotProps: Record<string, unknown>) => {
              seen = slotProps;
              return null;
            },
          }),
      })
    );
    app.mount(root);
    await nextTick();

    // 4s at 25 fps. The record's own number, 457, is not what drawings carry.
    expect(seen).toMatchObject({ currentFrame: 100 });
    app.unmount();
    root.remove();
  });

  describe('goal sequence', () => {
    let queued: Array<(ms: number) => void> = [];
    let clockMs = 1000;
    const originalRaf = window.requestAnimationFrame;
    const originalCaf = window.cancelAnimationFrame;

    beforeEach(() => {
      queued = [];
      clockMs = 1000;
      renderFrame.mockClear();
      window.requestAnimationFrame = ((cb: (ms: number) => void) => {
        queued.push(cb);
        return queued.length;
      }) as typeof window.requestAnimationFrame;
      window.cancelAnimationFrame = (() => {
        queued = [];
      }) as typeof window.cancelAnimationFrame;
    });

    afterEach(() => {
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCaf;
    });

    async function animate(ms: number) {
      const end = clockMs + ms;
      while (clockMs < end) {
        clockMs += 1000 / 60;
        const cbs = queued;
        queued = [];
        cbs.forEach((cb) => cb(clockMs));
      }
      await nextTick();
    }

    function goalFrame(labels: string[], ball: { x: number; y: number } | null = { x: 30, y: 5 }) {
      return {
        pitch_dimensions: { length: 105, width: 68, goal_width: 7.32 },
        teams: [],
        balls: ball ? [{ projected_coordinates: ball }] : [],
        state: { actions: labels.map((action_type) => ({ action_type })) },
        frame_data: [{ frame_count: 1 }],
      };
    }

    type Writable = { value: unknown };
    const set = (r: unknown, v: unknown) => ((r as Writable).value = v);

    /** Mounted the way load() leaves it, then playing at 10 s. */
    async function playing() {
      const replay = fakeReplay('loading');
      const m = mount(replay);
      await nextTick();
      set(replay.currentTime, 10);
      set(replay.frame, goalFrame(['other']));
      set(replay.state, 'ready');
      set(replay.isPlaying, true);
      await nextTick();
      return { replay, m };
    }

    /** One playback tick: the clock moves on a frame and the next record shows. */
    async function tick(replay: PipelineReplay, frame: unknown, step = 0.04) {
      set(replay.currentTime, (replay.currentTime.value as number) + step);
      set(replay.frame, frame);
      await nextTick();
    }

    const lastOverlay = () => renderFrame.mock.calls.at(-1)?.[1];

    it('plays when playback runs into a GOAL label', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL']));
      await animate(1200);
      expect(lastOverlay()).toBeDefined();
      // Only the shot itself: no text over the pitch.
      expect(m.root.textContent).not.toMatch(/GOAL/);
      m.unmount();
    });

    it('ends by itself and goes back to the tracked ball', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL']));
      await animate(GOAL_SEQUENCE_MS + 200);
      expect(lastOverlay()).toBeUndefined();
      m.unmount();
    });

    // A seek is not a goal happening: it would replace the frame someone
    // jumped to look at with an animation.
    it('does not play when a seek lands on a GOAL label', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL']), 250);
      await animate(1200);
      expect(lastOverlay()).toBeUndefined();
      m.unmount();
    });

    it('does not play while paused, for example when stepping a frame', async () => {
      const { replay, m } = await playing();
      set(replay.isPlaying, false);
      await nextTick();
      await tick(replay, goalFrame(['GOAL']));
      await animate(1200);
      expect(lastOverlay()).toBeUndefined();
      m.unmount();
    });

    it('stops and shows the real frame the moment playback pauses', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL']));
      await animate(500);
      set(replay.isPlaying, false);
      await nextTick();
      expect(lastOverlay()).toBeUndefined();
      m.unmount();
    });

    it('stops on a seek made while it plays', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL']));
      await animate(500);
      await tick(replay, goalFrame(['other']), 120);
      expect(lastOverlay()).toBeUndefined();
      m.unmount();
    });

    // A drawing stamped on a frame whose ball is the animation's would record
    // something the pipeline never produced.
    it('stops the moment someone presses on the drawing layer', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL']));
      await animate(500);
      at(m.root, 'pipeline-overlay')!.dispatchEvent(
        new Event('pointerdown', { bubbles: true })
      );
      await nextTick();
      expect(lastOverlay()).toBeUndefined();
      m.unmount();
    });

    it('plays once per GOAL label, not again on its following frames', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL']));
      await animate(GOAL_SEQUENCE_MS + 200);
      await tick(replay, goalFrame(['GOAL']));
      await animate(300);
      expect(lastOverlay()).toBeUndefined();

      // A new label, after one without it, is a new goal.
      await tick(replay, goalFrame(['other']));
      await tick(replay, goalFrame(['GOAL']));
      await animate(300);
      expect(lastOverlay()).toBeDefined();
      m.unmount();
    });

    it('does not play without a ball to tell which goal it went in', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL'], null));
      await animate(500);
      expect(lastOverlay()).toBeUndefined();
      m.unmount();
    });
  });
});
