// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import PipelineOutputSurface from '@/components/PipelineOutputSurface.vue';
import type { PipelineReplay, ReplayState } from '@/composables/usePipelineReplay';
import { GOAL_SEQUENCE_MS } from '@/lib/vis/goalSequence';
import {
  THROW_IN_SETTLE_S,
  THROW_IN_OUT_MS,
  THROW_IN_REPEAT_S,
  THROW_IN_ZOOM,
} from '@/lib/vis/throwInSequence';
import { PERSON_COLORS, POSSESSION_FADE_IN_S, RING_FADE_S } from '@/lib/vis/constants';
import { UPRIGHT } from '@/lib/vis/football';
import { CHEVRON_FLOW_PERIOD_S } from '@/lib/vis/attackGlow';

/**
 * Declared through vi.hoisted because vi.mock is hoisted above the imports,
 * and plain const declarations would still be in their temporal dead zone
 * when the factory runs (see drawingCanvas.test.ts for the same pattern).
 */
const { renderFrame, setView, useRenderer2D } = vi.hoisted(() => {
  const renderFrame = vi.fn();
  const invalidateCache = vi.fn();
  // Zoom and pan go through the renderer now, not a CSS transform on the
  // canvas, so the stub has to carry setView or mounting throws.
  const setView = vi.fn();
  const useRenderer2D = vi.fn(() => ({ renderFrame, invalidateCache, setView }));
  return { renderFrame, setView, useRenderer2D };
});

// Only the renderer is stubbed: the surface also uses the module's pure
// helpers (nearbyTrackIds), which work without a canvas.
vi.mock('@/lib/vis/useRenderer2D', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/vis/useRenderer2D')>()),
  useRenderer2D,
}));

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
    phase: ref(null),
    ballTrail: ref(null),
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

function mount(replay: PipelineReplay, props: { teamNames?: [string, string] | null | undefined } = {}) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(PipelineOutputSurface, {
          replay,
          ...(props.teamNames !== undefined ? { teamNames: props.teamNames } : {}),
        }),
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
      // 1096x640, less the 40 px row kept above the pitch for the team labels.
      expect(canvasBox[2]).toBe('1066.5px');
      expect(box(at(m.root, 'pipeline-overlay'))).toEqual(canvasBox);
      expect(box(at(m.root, 'pipeline-hud'))).toEqual(canvasBox);
      m.unmount();
    });

    // The labels sit above the pitch, never over it: anything standing on the
    // near touchline would otherwise be hidden under them.
    it('keeps a row above the pitch for the team labels', async () => {
      const m = mount(fakeReplay('ready'));
      await nextTick();
      observed.forEach((notify) => notify());
      await nextTick();

      const style = (at(m.root, 'pipeline-canvas') as HTMLElement).style;
      expect(parseFloat(style.top)).toBeGreaterThanOrEqual(40);
      expect(parseFloat(style.top) + parseFloat(style.height)).toBeLessThanOrEqual(640);
      m.unmount();
    });

    it('gives the canvas one bitmap pixel per device pixel', async () => {
      const m = mount(fakeReplay('ready'));
      await nextTick();
      observed.forEach((notify) => notify());
      await nextTick();

      const canvas = at(m.root, 'pipeline-canvas') as HTMLCanvasElement;
      expect([canvas.width, canvas.height]).toEqual([2133, 1200]);
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
        expect(canvas.width).toBe(3200);
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

  describe('team phase labels', () => {
    type Phase = PipelineReplay['phase']['value'];
    async function withPhase(phase: Phase, teamNames?: [string, string] | null) {
      const replay = fakeReplay('ready');
      (replay.phase as unknown as { value: Phase }).value = phase;
      const m = mount(replay, { teamNames });
      await nextTick();
      return m;
    }
    const label = (root: HTMLElement, team: 0 | 1) =>
      root.querySelector(`[data-testid="pipeline-phase-team-${team}"]`) as HTMLElement | null;

    it('shows each team with its state', async () => {
      const m = await withPhase({
        possession: 0,
        attacks: { 0: 1, 1: -1 },
        states: { 0: 'attacking', 1: 'defending' },
      });
      expect(label(m.root, 0)?.textContent).toMatch(/Red\s*Attacking/i);
      expect(label(m.root, 1)?.textContent).toMatch(/Defending\s*Blue/i);
      expect(label(m.root, 0)?.dataset.state).toBe('attacking');
      expect(label(m.root, 1)?.dataset.state).toBe('defending');
      m.unmount();
    });

    it('fills the label of the team with the ball in its colour', async () => {
      const m = await withPhase({
        possession: 1,
        attacks: { 0: 1, 1: -1 },
        states: { 0: 'defending', 1: 'attacking' },
      });
      expect(label(m.root, 1)?.style.backgroundColor).not.toBe('');
      expect(label(m.root, 0)?.style.backgroundColor).toBe('');
      m.unmount();
    });

    // A team keeping the ball for less than the attack hold is not attacking,
    // and a filled label would say it was.
    it('does not fill the label of a team that has the ball but is not attacking yet', async () => {
      const m = await withPhase({
        possession: 1,
        attacks: { 0: 1, 1: -1 },
        states: { 0: null, 1: null },
      });
      expect(label(m.root, 1)?.style.backgroundColor).toBe('');
      expect(label(m.root, 1)?.textContent?.trim()).toMatch(/^Blue$/i);
      m.unmount();
    });

    // A third of real frames have nobody clearly in possession: say nothing
    // rather than guess.
    it('shows both teams without a state when nobody is in possession', async () => {
      const m = await withPhase({
        possession: null,
        attacks: { 0: 1, 1: -1 },
        states: { 0: null, 1: null },
      });
      expect(label(m.root, 0)?.textContent?.trim()).toMatch(/^Red$/i);
      expect(label(m.root, 1)?.textContent?.trim()).toMatch(/^Blue$/i);
      expect(label(m.root, 0)?.dataset.state).toBe('none');
      m.unmount();
    });

    it('describes the phase for screen readers', async () => {
      const m = await withPhase({
        possession: 0,
        attacks: { 0: 1, 1: -1 },
        states: { 0: 'attacking', 1: 'defending' },
      });
      expect(at(m.root, 'pipeline-phase')?.getAttribute('aria-label')).toBe(
        'Red attacking, Blue defending'
      );
      m.unmount();
    });

    // Team 0 is taken to be the first team the match title names (see
    // pipelineTeamNames): the export itself names neither team.
    it('names the teams when the match is known, first-named as Red', async () => {
      const m = await withPhase(
        { possession: 0, attacks: { 0: 1, 1: -1 }, states: { 0: 'attacking', 1: 'defending' } },
        ['Manchester City', 'PSG']
      );
      expect(label(m.root, 0)?.textContent).toMatch(/Manchester City\s*Attacking/i);
      expect(label(m.root, 1)?.textContent).toMatch(/Defending\s*PSG/i);
      expect(at(m.root, 'pipeline-phase')?.getAttribute('aria-label')).toBe(
        'Manchester City attacking, PSG defending'
      );
      m.unmount();
    });

    it('keeps the colours for the names', async () => {
      const m = await withPhase(
        { possession: 1, attacks: { 0: 1, 1: -1 }, states: { 0: 'defending', 1: 'attacking' } },
        ['Manchester City', 'PSG']
      );
      expect(label(m.root, 0)?.style.borderColor).toBe(PERSON_COLORS.home.fill);
      // jsdom reports a background as rgb(), so compare it the same way.
      const probe = document.createElement('div');
      probe.style.backgroundColor = PERSON_COLORS.away.fill;
      expect(label(m.root, 1)?.style.backgroundColor).toBe(probe.style.backgroundColor);
      m.unmount();
    });

    // A long name is cut short on screen, so the whole of it goes on hover.
    it('shows a team name in full on hover', async () => {
      const m = await withPhase(
        { possession: null, attacks: { 0: 1, 1: -1 }, states: { 0: null, 1: null } },
        ['Borussia Mönchengladbach', 'PSG']
      );
      expect(label(m.root, 0)?.getAttribute('title')).toBe('Borussia Mönchengladbach');
      m.unmount();
    });

    it('falls back to the colours when the match is not known', async () => {
      const m = await withPhase(
        { possession: null, attacks: { 0: 1, 1: -1 }, states: { 0: null, 1: null } },
        null
      );
      expect(label(m.root, 0)?.textContent?.trim()).toMatch(/^Red$/i);
      expect(label(m.root, 1)?.textContent?.trim()).toMatch(/^Blue$/i);
      m.unmount();
    });

    it('shows nothing before the first frame has a phase', async () => {
      const m = await withPhase(null);
      expect(at(m.root, 'pipeline-phase')).toBeNull();
      m.unmount();
    });
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

    const lastOverlay = () => renderFrame.mock.calls.at(-1)?.[1]?.goal;

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

    const lastView = () =>
      setView.mock.calls.at(-1)?.[0] as { zoom: number; panX: number; panY: number } | undefined;

    it('zooms in on the goal while the sequence plays', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL']));
      await animate(1000);
      expect(lastView()!.zoom).toBeGreaterThanOrEqual(1.4);
      m.unmount();
    });

    it('eases back out to the view it started from', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL']));
      await animate(GOAL_SEQUENCE_MS + 200);
      expect(lastView()).toMatchObject({ zoom: 1, panX: 0, panY: 0 });
      m.unmount();
    });

    it('snaps back to the view it started from the moment playback pauses', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL']));
      await animate(800);
      set(replay.isPlaying, false);
      await nextTick();
      expect(lastView()).toMatchObject({ zoom: 1, panX: 0, panY: 0 });
      m.unmount();
    });

    it('hands the view over, and leaves it, when the user scrolls during it', async () => {
      const { replay, m } = await playing();
      await tick(replay, goalFrame(['GOAL']));
      await animate(800);
      const zoomed = lastView()!.zoom;
      at(m.root, 'pipeline-viewport')!.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
      );
      await nextTick();
      const own = lastView()!.zoom;
      expect(own).toBeCloseTo(zoomed + 0.15, 6);

      await animate(GOAL_SEQUENCE_MS);
      expect(lastView()!.zoom).toBeCloseTo(own, 6);
      // The shot itself still finished.
      expect(lastOverlay()).toBeUndefined();
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

  describe('attack glow', () => {
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

    type Writable = { value: unknown };
    const set = (r: unknown, v: unknown) => ((r as Writable).value = v);
    const FRAME = {
      pitch_dimensions: { length: 105, width: 68 },
      teams: [],
      balls: [{ projected_coordinates: { x: 10, y: 0 } }],
      state: { actions: [] },
      frame_data: [{ frame_count: 1 }],
    };
    const BLUE_ATTACKING = {
      possession: 1,
      attacks: { 0: 1, 1: -1 },
      states: { 0: 'defending', 1: 'attacking' },
    };
    const NOBODY = { possession: null, attacks: { 0: 1, 1: -1 }, states: { 0: null, 1: null } };

    async function ready() {
      const replay = fakeReplay('loading');
      const m = mount(replay);
      await nextTick();
      set(replay.currentTime, 10);
      set(replay.frame, { ...FRAME });
      set(replay.phase, NOBODY);
      set(replay.state, 'ready');
      await nextTick();
      return { replay, m };
    }

    /** A new frame and phase, arrived at by playback (step s) or a seek. */
    async function arrive(replay: PipelineReplay, phase: unknown, step = 0.04) {
      set(replay.currentTime, (replay.currentTime.value as number) + step);
      set(replay.frame, { ...FRAME });
      set(replay.phase, phase);
      await nextTick();
    }

    const lastGlow = () =>
      renderFrame.mock.calls.at(-1)?.[1]?.glow as
        | { color: string; direction: number; intensity: number; flow?: number }
        | undefined;

    it('glows for the attacking team, toward the goal it attacks', async () => {
      const { replay, m } = await ready();
      await arrive(replay, BLUE_ATTACKING, 30);
      expect(lastGlow()).toMatchObject({
        color: PERSON_COLORS.away.fill,
        team: 1,
        direction: -1,
        intensity: 1,
      });
      m.unmount();
    });

    it('shows no glow while nobody is attacking', async () => {
      const { replay, m } = await ready();
      await arrive(replay, NOBODY, 30);
      expect(lastGlow()).toBeUndefined();
      m.unmount();
    });

    it('shows no glow when the attacking direction is unknown', async () => {
      const { replay, m } = await ready();
      await arrive(replay, { ...BLUE_ATTACKING, attacks: { 0: null, 1: null } }, 30);
      expect(lastGlow()).toBeUndefined();
      m.unmount();
    });

    it('fades in during playback, rather than appearing at once', async () => {
      const { replay, m } = await ready();
      set(replay.isPlaying, true);
      await nextTick();
      await arrive(replay, BLUE_ATTACKING);
      await animate(300);
      const partway = lastGlow()!.intensity;
      expect(partway).toBeGreaterThan(0);
      expect(partway).toBeLessThan(1);
      await animate(1200);
      expect(lastGlow()!.intensity).toBe(1);
      m.unmount();
    });

    it('fades out when the attack ends during playback, in the attacking colour', async () => {
      const { replay, m } = await ready();
      await arrive(replay, BLUE_ATTACKING, 30);
      set(replay.isPlaying, true);
      await nextTick();
      await arrive(replay, NOBODY);
      await animate(300);
      const fading = lastGlow()!;
      expect(fading.color).toBe(PERSON_COLORS.away.fill);
      expect(fading.intensity).toBeGreaterThan(0);
      expect(fading.intensity).toBeLessThan(1);
      await animate(1200);
      expect(lastGlow()).toBeUndefined();
      m.unmount();
    });

    // The chevrons flow with the replay's own clock: still while paused, and
    // the same at a given moment however the replay got there.
    it('flows the chevrons with the replay clock', async () => {
      const { replay, m } = await ready();
      await arrive(replay, BLUE_ATTACKING, 30);
      const t = replay.currentTime.value as number;
      expect(lastGlow()!.flow).toBeCloseTo((t / CHEVRON_FLOW_PERIOD_S) % 1, 6);
      m.unmount();
    });

    it('draws the same chevrons a whole flow period later', async () => {
      const { replay, m } = await ready();
      await arrive(replay, BLUE_ATTACKING, 30);
      const before = lastGlow()!.flow!;
      await arrive(replay, BLUE_ATTACKING, CHEVRON_FLOW_PERIOD_S * 4);
      expect(lastGlow()!.flow).toBeCloseTo(before, 6);
      m.unmount();
    });

    // The clock ticks at display rate, records arrive at the data's rate:
    // painting only on new records would move the chevrons in steps.
    it('repaints on every tick of the clock while a glow is showing', async () => {
      const { replay, m } = await ready();
      await arrive(replay, BLUE_ATTACKING, 30);
      const before = lastGlow()!.flow!;
      const calls = renderFrame.mock.calls.length;
      set(replay.currentTime, (replay.currentTime.value as number) + 0.016);
      await nextTick();
      expect(renderFrame.mock.calls.length).toBe(calls + 1);
      expect(lastGlow()!.flow).toBeGreaterThan(before);
      m.unmount();
    });

    it('does not repaint on the clock alone when there is no glow', async () => {
      const { replay, m } = await ready();
      await arrive(replay, NOBODY, 30);
      const calls = renderFrame.mock.calls.length;
      set(replay.currentTime, (replay.currentTime.value as number) + 0.016);
      await nextTick();
      expect(renderFrame.mock.calls.length).toBe(calls);
      m.unmount();
    });

    it('paints a new record once, not again for the clock that brought it', async () => {
      const { replay, m } = await ready();
      await arrive(replay, BLUE_ATTACKING, 30);
      const calls = renderFrame.mock.calls.length;
      await arrive(replay, BLUE_ATTACKING);
      expect(renderFrame.mock.calls.length).toBe(calls + 1);
      m.unmount();
    });

    it('holds the chevrons still under reduced motion', async () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
      try {
        const { replay, m } = await ready();
        await arrive(replay, BLUE_ATTACKING, 30);
        const first = lastGlow()!.flow;
        await arrive(replay, BLUE_ATTACKING, 0.3);
        expect(lastGlow()!.flow).toBe(first);
        m.unmount();
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    // A paused frame is looked at, and shows its own state, not a fade.
    it('settles at once when playback pauses partway through a fade', async () => {
      const { replay, m } = await ready();
      set(replay.isPlaying, true);
      await nextTick();
      await arrive(replay, BLUE_ATTACKING);
      await animate(300);
      set(replay.isPlaying, false);
      await nextTick();
      expect(lastGlow()!.intensity).toBe(1);
      m.unmount();
    });
  });
  describe('ring fade', () => {
    type Writable = { value: unknown };
    const set = (r: unknown, v: unknown) => ((r as Writable).value = v);
    const person = (track_id: number, x: number, ball = false) => ({
      track_id,
      person_type: 'PersonType.PLAYER',
      projected_coordinates: { x, y: 0 },
      in_possession: ball,
    });
    /**
     * Red's carrier (track 1) at x = 0, and track 2 at `x`: ringed within
     * 15 m. Without `carrier`, nobody has the ball.
     */
    const frameWith = (x: number, carrier = true) => ({
      pitch_dimensions: { length: 105, width: 68 },
      teams: [{ team_id: 0, players: [person(1, 0, carrier), person(2, x)] }],
      balls: [{ projected_coordinates: { x: 0, y: 0 } }],
      state: { actions: [] },
      frame_data: [{ frame_count: 1 }],
    });
    const NEAR = 10;
    const FAR = 30;

    async function ready(x: number) {
      const replay = fakeReplay('loading');
      const m = mount(replay);
      await nextTick();
      set(replay.currentTime, 10);
      set(replay.frame, frameWith(x));
      set(replay.state, 'ready');
      await nextTick();
      return { replay, m };
    }

    /** One step of playback, `step` seconds on, showing a fresh record. */
    async function step(replay: PipelineReplay, x: number, by = 0.04, carrier = true) {
      set(replay.currentTime, (replay.currentTime.value as number) + by);
      set(replay.frame, frameWith(x, carrier));
      await nextTick();
    }

    type Rings = { nearby: Map<number, number>; possession: Map<number, number> };
    const rings = () => renderFrame.mock.calls.at(-1)?.[1]?.rings as Rings | undefined;
    /** The white ring's strength on track `id`. */
    const ring = (id: number) => rings()?.nearby.get(id) ?? 0;
    /** The possession ring's strength on track `id`. */
    const held = (id: number) => rings()?.possession.get(id) ?? 0;

    beforeEach(() => renderFrame.mockClear());

    it('shows the rings at once on a frame reached by a seek', async () => {
      const { replay, m } = await ready(FAR);
      await step(replay, NEAR, 30);
      expect(ring(2)).toBe(1);
      expect(ring(1)).toBe(1);
      m.unmount();
    });

    // Possession changes many times a minute, and rings that snapped on and
    // off with it were jarring.
    it('fades a ring in during playback', async () => {
      const { replay, m } = await ready(FAR);
      set(replay.isPlaying, true);
      await nextTick();
      await step(replay, NEAR);
      expect(ring(2)).toBeGreaterThan(0);
      expect(ring(2)).toBeLessThan(1);
      for (let t = 0; t < RING_FADE_S; t += 0.04) await step(replay, NEAR);
      expect(ring(2)).toBe(1);
      m.unmount();
    });

    it('fades a ring out during playback when its player leaves the area', async () => {
      const { replay, m } = await ready(NEAR);
      set(replay.isPlaying, true);
      await nextTick();
      await step(replay, FAR);
      expect(ring(2)).toBeGreaterThan(0);
      expect(ring(2)).toBeLessThan(1);
      for (let t = 0; t < RING_FADE_S; t += 0.04) await step(replay, FAR);
      expect(ring(2)).toBe(0);
      m.unmount();
    });

    // The clock ticks faster than records arrive: a fade that moved only on
    // new records would move in steps.
    it('moves a fade on with the clock between records', async () => {
      const { replay, m } = await ready(FAR);
      set(replay.isPlaying, true);
      await nextTick();
      await step(replay, NEAR);
      const before = ring(2);
      set(replay.currentTime, (replay.currentTime.value as number) + 0.016);
      await nextTick();
      expect(ring(2)).toBeGreaterThan(before);
      m.unmount();
    });

    it('settles at once when playback pauses partway through a fade', async () => {
      const { replay, m } = await ready(FAR);
      set(replay.isPlaying, true);
      await nextTick();
      await step(replay, NEAR);
      set(replay.isPlaying, false);
      await nextTick();
      expect(ring(2)).toBe(1);
      m.unmount();
    });

    // The data loses the carrier for a frame or two at a time, and the
    // possession ring blinked with it.
    it('fades the possession ring out when nobody has the ball, and back in', async () => {
      const { replay, m } = await ready(NEAR);
      expect(held(1)).toBe(1);
      set(replay.isPlaying, true);
      await nextTick();
      await step(replay, NEAR, 0.04, false);
      expect(held(1)).toBeGreaterThan(0);
      expect(held(1)).toBeLessThan(1);
      const dipped = held(1);
      await step(replay, NEAR, 0.04, true);
      expect(held(1)).toBeGreaterThan(dipped);
      for (let t = 0; t < RING_FADE_S; t += 0.04) await step(replay, NEAR);
      expect(held(1)).toBe(1);
      m.unmount();
    });

    it('shows the possession ring at once on a frame reached by a seek', async () => {
      const { replay, m } = await ready(NEAR);
      await step(replay, NEAR, 30, false);
      expect(held(1)).toBe(0);
      await step(replay, NEAR, 30, true);
      expect(held(1)).toBe(1);
      m.unmount();
    });

    it('settles the possession ring at once when playback pauses', async () => {
      const { replay, m } = await ready(NEAR);
      set(replay.isPlaying, true);
      await nextTick();
      await step(replay, NEAR, 0.04, false);
      set(replay.isPlaying, false);
      await nextTick();
      expect(held(1)).toBe(0);
      m.unmount();
    });

    // The data flags the carrier in bursts of a few frames: faded in over
    // RING_FADE_S, most of them never got past a fifth of full strength.
    it('brings the possession ring in quickly, and fades it out slowly', async () => {
      const { replay, m } = await ready(NEAR);
      set(replay.isPlaying, true);
      await nextTick();
      for (let t = 0; t <= RING_FADE_S; t += 0.04) await step(replay, NEAR, 0.04, false);
      expect(held(1)).toBe(0);
      for (let t = 0; t < POSSESSION_FADE_IN_S - 1e-9; t += 0.04) await step(replay, NEAR);
      expect(held(1)).toBeCloseTo(1, 9);
      // It still fades out over RING_FADE_S.
      await step(replay, NEAR, 0.04, false);
      expect(held(1)).toBeCloseTo(1 - 0.04 / RING_FADE_S);
      m.unmount();
    });

    it('does not fade under reduced motion', async () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
      try {
        const { replay, m } = await ready(FAR);
        set(replay.isPlaying, true);
        await nextTick();
        await step(replay, NEAR);
        expect(ring(2)).toBe(1);
        m.unmount();
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });
  });
  describe('ball roll', () => {
    type Writable = { value: unknown };
    const set = (r: unknown, v: unknown) => ((r as Writable).value = v);
    const frameWith = (ballX: number) => ({
      pitch_dimensions: { length: 105, width: 68 },
      teams: [],
      balls: [{ projected_coordinates: { x: ballX, y: 0 } }],
      state: { actions: [] },
      frame_data: [{ frame_count: 1 }],
    });
    const spin = () => renderFrame.mock.calls.at(-1)?.[1]?.ballSpin;

    async function ready() {
      const replay = fakeReplay('loading');
      const m = mount(replay);
      await nextTick();
      set(replay.currentTime, 10);
      set(replay.frame, frameWith(0));
      set(replay.state, 'ready');
      await nextTick();
      return { replay, m };
    }
    async function step(replay: PipelineReplay, ballX: number, by = 0.04) {
      set(replay.currentTime, (replay.currentTime.value as number) + by);
      set(replay.frame, frameWith(ballX));
      await nextTick();
    }
    async function playing() {
      const r = await ready();
      set(r.replay.isPlaying, true);
      await nextTick();
      return r;
    }

    beforeEach(() => renderFrame.mockClear());

    it('rolls the ball as it moves during playback, and only then', async () => {
      const { replay, m } = await playing();
      expect(spin()).toEqual(UPRIGHT);
      await step(replay, 0.5);
      const turned = spin();
      expect(turned).not.toEqual(UPRIGHT);
      // Still: the clock moves, the ball does not.
      set(replay.currentTime, (replay.currentTime.value as number) + 0.02);
      await nextTick();
      expect(spin()).toEqual(turned);
      m.unmount();
    });

    it('keeps the ball as it was across a seek, or a step while paused', async () => {
      const { replay, m } = await ready();
      await step(replay, 0.5);
      expect(spin()).toEqual(UPRIGHT);
      set(replay.isPlaying, true);
      await nextTick();
      await step(replay, 5, 30);
      expect(spin()).toEqual(UPRIGHT);
      m.unmount();
    });

    it('does not roll the ball across a jump in its tracking', async () => {
      const { replay, m } = await playing();
      await step(replay, 20);
      expect(spin()).toEqual(UPRIGHT);
      m.unmount();
    });

    it('does not roll the ball under reduced motion', async () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
      try {
        const { replay, m } = await playing();
        await step(replay, 0.5);
        expect(spin()).toEqual(UPRIGHT);
        m.unmount();
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });
  });
  describe('throw-in sequence', () => {
    let queued: Array<(ms: number) => void> = [];
    let clockMs = 1000;
    const originalRaf = window.requestAnimationFrame;
    const originalCaf = window.cancelAnimationFrame;

    beforeEach(() => {
      queued = [];
      clockMs = 1000;
      renderFrame.mockClear();
      setView.mockClear();
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

    type Writable = { value: unknown };
    const set = (r: unknown, v: unknown) => ((r as Writable).value = v);

    /**
     * A frame of the match: two tracked players and the ball, unless a test
     * says otherwise. A cutaway tracks nobody.
     */
    function matchFrame({
      labels = [] as string[],
      ball = { x: 10, y: -30 } as { x: number; y: number } | null,
      players = 2,
    } = {}) {
      return {
        pitch_dimensions: { length: 105, width: 68 },
        teams: [
          {
            team_id: 0,
            players: Array.from({ length: players }, (_, i) => ({
              track_id: i + 1,
              person_type: 'PersonType.PLAYER',
              projected_coordinates: { x: i * 3, y: 0 },
            })),
          },
        ],
        balls: ball ? [{ projected_coordinates: ball }] : [],
        state: { actions: labels.map((action_type) => ({ action_type })) },
        frame_data: [{ frame_count: 1 }],
      };
    }
    const THROW_IN = () => matchFrame({ labels: ['Throw in'] });
    const PLAY = () => matchFrame();

    async function playing() {
      const replay = fakeReplay('loading');
      const m = mount(replay);
      await nextTick();
      set(replay.currentTime, 10);
      set(replay.frame, PLAY());
      set(replay.state, 'ready');
      set(replay.isPlaying, true);
      await nextTick();
      return { replay, m };
    }

    /** One playback tick: the clock moves on and, unless null, a new record shows. */
    async function tick(replay: PipelineReplay, frame: unknown, step = 0.04) {
      set(replay.currentTime, (replay.currentTime.value as number) + step);
      if (frame !== null) set(replay.frame, frame);
      await nextTick();
    }

    /** `ms` of playback in 40 ms ticks, new records from `next` (null: none come). */
    async function play(replay: PipelineReplay, ms: number, next: (() => unknown) | null) {
      for (let t = 0; t < ms; t += 40) {
        await tick(replay, next ? next() : null);
        await animate(40);
      }
    }

    const lastView = () =>
      setView.mock.calls.at(-1)?.[0] as { zoom: number; panX: number; panY: number } | undefined;
    const lastPulse = () =>
      renderFrame.mock.calls.at(-1)?.[1]?.ballPulse as
        | { x: number; y: number; phase: number }
        | undefined;

    it('zooms in on the ball, with a pulse around it, when playback runs into one', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, 800, THROW_IN);
      expect(lastView()!.zoom).toBeCloseTo(THROW_IN_ZOOM, 6);
      // On the touchline, level with the ball at (10, -30).
      expect(lastPulse()).toMatchObject({ x: 10, y: -34 });
      m.unmount();
    });

    // The spot is fixed, wherever the tracked ball goes while it plays.
    it('keeps the ring on the throw-in spot as the ball moves', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, 400, () => matchFrame({ labels: ['Throw in'], ball: { x: 14, y: -20 } }));
      expect(lastPulse()).toMatchObject({ x: 10, y: -34 });
      m.unmount();
    });

    it('pulses: the ring moves on with the clock', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await animate(200);
      const a = lastPulse()!.phase;
      await animate(300);
      expect(lastPulse()!.phase).not.toBeCloseTo(a, 3);
      m.unmount();
    });

    it('stays in while the label is on', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, 4000, THROW_IN);
      expect(lastView()!.zoom).toBeCloseTo(THROW_IN_ZOOM, 6);
      m.unmount();
    });

    // The broadcast cut away: no records arrive while the clock runs on.
    it('stays in through a gap in the data, however long', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, 8000, null);
      expect(lastView()!.zoom).toBeCloseTo(THROW_IN_ZOOM, 6);
      expect(lastPulse()).toBeDefined();
      m.unmount();
    });

    it('stays in through frames that track nobody', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, 4000, () => matchFrame({ players: 0, ball: null }));
      expect(lastView()!.zoom).toBeCloseTo(THROW_IN_ZOOM, 6);
      m.unmount();
    });

    it('eases back out to the view it started from once valid frames flow again', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, 2000, THROW_IN);
      await play(replay, 3000, null);
      // play() runs the animation clock a quarter ahead of the replay's, so
      // the zoom out has run for a little over 300 of its ms here.
      await play(replay, THROW_IN_SETTLE_S * 1000 + 250, PLAY);
      const partway = lastView()!.zoom;
      expect(partway).toBeGreaterThan(1);
      expect(partway).toBeLessThan(THROW_IN_ZOOM);
      await play(replay, THROW_IN_OUT_MS, PLAY);
      expect(lastView()).toMatchObject({ zoom: 1, panX: 0, panY: 0 });
      expect(lastPulse()).toBeUndefined();
      m.unmount();
    });

    it('stays in until play has been back on for the settle time', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, THROW_IN_SETTLE_S * 1000 - 400, PLAY);
      expect(lastView()!.zoom).toBeCloseTo(THROW_IN_ZOOM, 6);
      await play(replay, 400 + THROW_IN_OUT_MS + 200, PLAY);
      expect(lastView()!.zoom).toBe(1);
      m.unmount();
    });

    // Measured on a full match: the same throw-in is often labelled again a
    // couple of seconds after its label goes off.
    it('stays in when the throw-in is labelled again soon after', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, 2000, PLAY);
      await play(replay, 1000, THROW_IN);
      await play(replay, 2000, PLAY);
      expect(lastView()!.zoom).toBeCloseTo(THROW_IN_ZOOM, 6);
      m.unmount();
    });

    it('eases back in when the throw-in is labelled again while it eases out', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, THROW_IN_SETTLE_S * 1000 + 250, PLAY);
      const turning = lastView()!.zoom;
      expect(turning).toBeLessThan(THROW_IN_ZOOM);
      expect(turning).toBeGreaterThan(1);
      await play(replay, 80, THROW_IN);
      expect(lastView()!.zoom).toBeGreaterThan(turning);
      await play(replay, 1000, THROW_IN);
      expect(lastView()!.zoom).toBeCloseTo(THROW_IN_ZOOM, 6);
      m.unmount();
    });

    it('zooms in on where the ball was last seen when the label frame has none', async () => {
      const { replay, m } = await playing();
      await tick(replay, matchFrame({ ball: { x: -20, y: 31 } }));
      await tick(replay, matchFrame({ labels: ['Throw in'], ball: null }));
      await animate(800);
      expect(lastPulse()).toMatchObject({ x: -20, y: 34 });
      m.unmount();
    });

    it('does not start on a seek', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN(), 30);
      await animate(800);
      expect(lastView()?.zoom ?? 1).toBe(1);
      expect(lastPulse()).toBeUndefined();
      m.unmount();
    });

    it('does not start while paused', async () => {
      const { replay, m } = await playing();
      set(replay.isPlaying, false);
      await nextTick();
      await tick(replay, THROW_IN());
      await animate(800);
      expect(lastPulse()).toBeUndefined();
      m.unmount();
    });

    it('snaps back to the view it started from the moment playback pauses', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, 800, THROW_IN);
      set(replay.isPlaying, false);
      await nextTick();
      expect(lastView()).toMatchObject({ zoom: 1, panX: 0, panY: 0 });
      expect(lastPulse()).toBeUndefined();
      m.unmount();
    });

    it('stops the moment someone presses on the drawing layer', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, 800, THROW_IN);
      at(m.root, 'pipeline-overlay')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await nextTick();
      expect(lastView()).toMatchObject({ zoom: 1, panX: 0, panY: 0 });
      expect(lastPulse()).toBeUndefined();
      m.unmount();
    });

    // The same throw-in is often labelled again a few seconds later.
    it('does not start again for a label soon after the last one ended', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, THROW_IN_SETTLE_S * 1000 + THROW_IN_OUT_MS + 200, PLAY);
      expect(lastView()!.zoom).toBe(1);
      await play(replay, 1000, THROW_IN);
      expect(lastPulse()).toBeUndefined();

      // Long enough after, a label is a new throw-in.
      await play(replay, THROW_IN_REPEAT_S * 1000, PLAY);
      await play(replay, 800, THROW_IN);
      expect(lastPulse()).toBeDefined();
      m.unmount();
    });

    // The clock can go back: a seek to just before a throw-in already seen
    // must play it again.
    it('plays again after a seek back to just before it', async () => {
      const { replay, m } = await playing();
      await tick(replay, THROW_IN());
      await play(replay, THROW_IN_SETTLE_S * 1000 + THROW_IN_OUT_MS + 200, PLAY);
      expect(lastView()!.zoom).toBe(1);
      set(replay.currentTime, 9);
      set(replay.frame, PLAY());
      await nextTick();
      await play(replay, 200, PLAY);
      await play(replay, 800, THROW_IN);
      expect(lastPulse()).toBeDefined();
      m.unmount();
    });

    it('does not move the view under reduced motion, but still marks the ball', async () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
      try {
        const { replay, m } = await playing();
        await tick(replay, THROW_IN());
        await play(replay, 800, THROW_IN);
        expect(lastView()?.zoom ?? 1).toBe(1);
        expect(lastPulse()).toBeDefined();
        m.unmount();
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });
  });
  describe('layers menu', () => {
    let queued: Array<(ms: number) => void> = [];
    let clockMs = 1000;
    const originalRaf = window.requestAnimationFrame;
    const originalCaf = window.cancelAnimationFrame;

    beforeEach(() => {
      localStorage.clear();
      queued = [];
      clockMs = 1000;
      renderFrame.mockClear();
      setView.mockClear();
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
      localStorage.clear();
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

    type Writable = { value: unknown };
    const set = (r: unknown, v: unknown) => ((r as Writable).value = v);
    const person = (track_id: number, x: number, ball = false) => ({
      track_id,
      person_type: 'PersonType.PLAYER',
      projected_coordinates: { x, y: 0 },
      in_possession: ball,
    });
    /** Red's carrier at x = 0 and a teammate at x = 10, with optional labels. */
    const frameWith = (labels: string[] = [], ball = { x: 0, y: -30 }) => ({
      pitch_dimensions: { length: 105, width: 68, goal_width: 7.32 },
      teams: [{ team_id: 0, players: [person(1, 0, true), person(2, 10)] }],
      balls: [{ projected_coordinates: ball }],
      state: { actions: labels.map((action_type) => ({ action_type })) },
      frame_data: [{ frame_count: 1 }],
    });
    const BLUE_ATTACKING = {
      possession: 1,
      attacks: { 0: 1, 1: -1 },
      states: { 0: 'defending', 1: 'attacking' },
    };

    async function ready() {
      const replay = fakeReplay('loading');
      const m = mount(replay);
      await nextTick();
      set(replay.currentTime, 10);
      set(replay.frame, frameWith());
      set(replay.phase, BLUE_ATTACKING);
      set(replay.state, 'ready');
      await nextTick();
      return { replay, m };
    }

    async function tick(replay: PipelineReplay, frame: unknown, step = 0.04) {
      set(replay.currentTime, (replay.currentTime.value as number) + step);
      set(replay.frame, frame);
      await nextTick();
    }

    const layersOf = () => renderFrame.mock.calls.at(-1)?.[1];
    const lastView = () =>
      setView.mock.calls.at(-1)?.[0] as { zoom: number; panX: number; panY: number } | undefined;

    async function open(root: HTMLElement) {
      (at(root, 'pipeline-layers-toggle') as HTMLElement).click();
      await nextTick();
    }
    const option = (root: HTMLElement, key: string) =>
      root.querySelector(`[data-testid="pipeline-layer-option"][data-layer="${key}"]`) as HTMLElement;
    async function toggle(root: HTMLElement, key: string) {
      if (!at(root, 'pipeline-layers-menu')) await open(root);
      option(root, key).click();
      await nextTick();
    }

    it('lists every layer, all shown by default', async () => {
      const { m } = await ready();
      await open(m.root);
      const options = [...m.root.querySelectorAll('[data-testid="pipeline-layer-option"]')];
      expect(options).toHaveLength(9);
      expect(options.every((o) => o.getAttribute('aria-checked') === 'true')).toBe(true);
      m.unmount();
    });

    it('hides the attacking and defending labels', async () => {
      const { m } = await ready();
      expect(at(m.root, 'pipeline-phase')).not.toBeNull();
      await toggle(m.root, 'phaseLabels');
      expect(at(m.root, 'pipeline-phase')).toBeNull();
      expect(option(m.root, 'phaseLabels').getAttribute('aria-checked')).toBe('false');
      m.unmount();
    });

    it('hides the shading and the arrows separately, and the glow once both are off', async () => {
      const { m } = await ready();
      await toggle(m.root, 'attackShading');
      expect(layersOf()?.glow).toMatchObject({ shading: false, arrows: true });
      await toggle(m.root, 'attackArrows');
      expect(layersOf()?.glow).toBeUndefined();
      m.unmount();
    });

    it('draws far players solid when their fade is off', async () => {
      const { m } = await ready();
      expect(layersOf()?.fadeFar).toBe(true);
      await toggle(m.root, 'farFade');
      expect(layersOf()?.fadeFar).toBe(false);
      m.unmount();
    });

    it('draws the ball trail the replay reports, and none when it is off', async () => {
      const { replay, m } = await ready();
      const trail = { runs: [[{ x: -5, y: -30, age: 1 }, { x: 0, y: -30, age: 0 }]], turns: [] };
      set(replay.ballTrail, trail);
      await nextTick();
      expect(layersOf()?.trail).toEqual(trail);
      await toggle(m.root, 'ballTrail');
      expect(layersOf()?.trail).toBeUndefined();
      m.unmount();
    });

    it('repaints when the trail changes without a new frame', async () => {
      const { replay, m } = await ready();
      const calls = renderFrame.mock.calls.length;
      set(replay.ballTrail, { runs: [[{ x: 1, y: 2, age: 1 }, { x: 2, y: 2, age: 0 }]], turns: [] });
      await nextTick();
      expect(renderFrame.mock.calls.length).toBe(calls + 1);
      m.unmount();
    });

    it('drops the white rings, and only them', async () => {
      const { m } = await ready();
      expect(layersOf()?.rings.nearby.size).toBeGreaterThan(0);
      await toggle(m.root, 'nearbyRings');
      expect(layersOf()?.rings.nearby.size).toBe(0);
      expect(layersOf()?.rings.possession.get(1)).toBe(1);
      m.unmount();
    });

    it('snaps the rings during playback when smooth changes are off', async () => {
      const { replay, m } = await ready();
      await toggle(m.root, 'ringFades');
      set(replay.isPlaying, true);
      await nextTick();
      await tick(replay, { ...frameWith(), teams: [{ team_id: 0, players: [person(1, 0, true), person(2, 30)] }] });
      expect(layersOf()?.rings.nearby.get(2)).toBeUndefined();
      await tick(replay, frameWith());
      expect(layersOf()?.rings.nearby.get(2)).toBe(1);
      m.unmount();
    });

    it('does not play the goal animation when it is off', async () => {
      const { replay, m } = await ready();
      await toggle(m.root, 'goal');
      set(replay.isPlaying, true);
      await nextTick();
      await tick(replay, frameWith(['GOAL'], { x: 30, y: 5 }));
      await animate(1000);
      expect(layersOf()?.goal).toBeUndefined();
      m.unmount();
    });

    it('stops a goal animation that is playing when it is switched off, view and all', async () => {
      const { replay, m } = await ready();
      set(replay.isPlaying, true);
      await nextTick();
      await tick(replay, frameWith(['GOAL'], { x: 30, y: 5 }));
      await animate(800);
      expect(layersOf()?.goal).toBeDefined();
      await toggle(m.root, 'goal');
      expect(layersOf()?.goal).toBeUndefined();
      expect(lastView()).toMatchObject({ zoom: 1, panX: 0, panY: 0 });
      m.unmount();
    });

    it('does not zoom in on a throw-in when it is off', async () => {
      const { replay, m } = await ready();
      await toggle(m.root, 'throwIn');
      set(replay.isPlaying, true);
      await nextTick();
      await tick(replay, frameWith(['Throw in']));
      await animate(800);
      expect(layersOf()?.ballPulse).toBeUndefined();
      m.unmount();
    });

    it('stops a throw-in zoom that is playing when it is switched off, view and all', async () => {
      const { replay, m } = await ready();
      set(replay.isPlaying, true);
      await nextTick();
      await tick(replay, frameWith(['Throw in']));
      await animate(800);
      expect(layersOf()?.ballPulse).toBeDefined();
      await toggle(m.root, 'throwIn');
      expect(layersOf()?.ballPulse).toBeUndefined();
      expect(lastView()).toMatchObject({ zoom: 1, panX: 0, panY: 0 });
      m.unmount();
    });

    it('remembers the choice for the next time the replay opens', async () => {
      const first = await ready();
      await toggle(first.m.root, 'throwIn');
      first.m.unmount();
      const second = await ready();
      await open(second.m.root);
      expect(option(second.m.root, 'throwIn').getAttribute('aria-checked')).toBe('false');
      expect(option(second.m.root, 'goal').getAttribute('aria-checked')).toBe('true');
      second.m.unmount();
    });

    it('closes on Escape, and on a click outside it', async () => {
      const { m } = await ready();
      await open(m.root);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await nextTick();
      expect(at(m.root, 'pipeline-layers-menu')).toBeNull();
      await open(m.root);
      (at(m.root, 'pipeline-layers-backdrop') as HTMLElement).click();
      await nextTick();
      expect(at(m.root, 'pipeline-layers-menu')).toBeNull();
      m.unmount();
    });
  });
});

