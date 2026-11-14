// @vitest-environment jsdom
//
// The surface as a host of the match tracker widget. The widget itself is
// proved against this app's own recordings in its own repo, so here it is a
// fake that records what the surface hands it and lets a test say what it
// would report back: the moments it can play. Its overlay stops every moment
// on a press, as the widget's does, except inside an element marked
// data-match-tracker-keep.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import PipelineOutputSurface from '@/components/PipelineOutputSurface.vue';
import type { PipelineReplay, ReplayState } from '@/composables/usePipelineReplay';
import type { ReplayRecord } from '@/lib/pipelineData/frameWindow';
import type {
  MatchTrackerOptions,
  MomentAvailability,
  TrackerEvents,
} from '@coenhallie/match-tracker';

interface FakeTracker {
  host: HTMLElement;
  options: MatchTrackerOptions;
  overlay: HTMLElement;
  present: ReturnType<typeof vi.fn>;
  trigger: ReturnType<typeof vi.fn>;
  setOptions: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  /** The widget's stop path: what a press in its overlay calls. */
  stopAll: ReturnType<typeof vi.fn>;
  availability: () => MomentAvailability;
  on: ReturnType<typeof vi.fn>;
  /** Say `value` as the widget would, to every listener of `event`. */
  emit<K extends keyof TrackerEvents>(event: K, value: TrackerEvents[K]): void;
  /** What availability() answers. */
  available: MomentAvailability;
}

const NOTHING: MomentAvailability = {
  goal: false,
  attack: { 0: false, 1: false },
  corner: false,
  freeKick: false,
  throwIn: false,
  varCheck: false,
  goalDisallowed: false,
  halfTime: false,
  secondHalf: false,
  fullTime: false,
  foul: false,
  shotOnGoal: false,
  headerOnGoal: false,
  yellowCard: false,
  redCard: false,
  substitution: false,
  penalty: false,
  penaltyScored: false,
  penaltyMissed: false,
};

const { createMatchTracker, makeTracker, trackers } = vi.hoisted(() => {
  const trackers: FakeTracker[] = [];
  const makeTracker = (host: HTMLElement, options: MatchTrackerOptions) => {
    const overlay = document.createElement('div');
    overlay.slot = 'overlay';
    host.append(overlay);
    const listeners = new Map<string, Set<(value: unknown) => void>>();
    const stopAll = vi.fn();
    // The widget's rule (0.1.2): a press anywhere in the overlay stops every
    // moment, unless it is inside an element in the overlay marked
    // data-match-tracker-keep. Listened for in the capture phase, as there.
    overlay.addEventListener(
      'pointerdown',
      (event) => {
        const kept = (event.target as Element | null)?.closest('[data-match-tracker-keep]');
        if (kept && overlay.contains(kept)) return;
        stopAll();
      },
      { capture: true }
    );
    const tracker: FakeTracker = {
      host,
      options,
      overlay,
      available: { goal: false, attack: { 0: false, 1: false }, corner: false, freeKick: false, throwIn: false, varCheck: false, goalDisallowed: false, halfTime: false, secondHalf: false, fullTime: false, foul: false, shotOnGoal: false, headerOnGoal: false, yellowCard: false, redCard: false, substitution: false, penalty: false, penaltyScored: false, penaltyMissed: false },
      present: vi.fn(),
      trigger: vi.fn(() => true),
      setOptions: vi.fn(),
      destroy: vi.fn(() => overlay.remove()),
      stopAll,
      availability: () => structuredClone(tracker.available),
      on: vi.fn((event: string, listener: (value: unknown) => void) => {
        const set = listeners.get(event) ?? new Set();
        set.add(listener);
        listeners.set(event, set);
        return () => set.delete(listener);
      }),
      emit(event, value) {
        listeners.get(event)?.forEach((listener) => listener(value));
      },
    };
    trackers.push(tracker);
    return tracker;
  };
  const createMatchTracker = vi.fn(makeTracker);
  return { createMatchTracker, makeTracker, trackers };
});

vi.mock('@coenhallie/match-tracker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coenhallie/match-tracker')>()),
  createMatchTracker,
}));

const record = (frameCount: number, t = 1000): ReplayRecord => ({
  frameCount,
  t,
  frame: { teams: [], balls: [], frame_data: [{ frame_count: frameCount }] } as unknown as ReplayRecord['frame'],
});

function fakeReplay(state: ReplayState, message: string | null = null) {
  const first = record(457);
  return {
    currentTime: ref(0),
    duration: ref(120),
    currentFrame: ref(457),
    totalFrames: ref(3000),
    fps: ref(25),
    isPlaying: ref(false),
    record: shallowRef<ReplayRecord | null>(state === 'ready' ? first : null),
    lookback: shallowRef<readonly ReplayRecord[]>(state === 'ready' ? [first] : []),
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

/** Writable access to a replay's refs, which the type has as read-only. */
const set = <T>(r: unknown, value: T) => {
  (r as { value: T }).value = value;
};

/** What the surface exposes to the editor: playing its moments by hand. */
interface SurfaceExpose {
  triggerMoment: (moment: 'goal' | 'attack' | 'corner' | 'throwIn', team?: 0 | 1) => boolean;
  momentAvailability: MomentAvailability;
}

function mount(
  replay: PipelineReplay,
  props: { teamNames?: [string, string] | null; drawing?: boolean; debug?: boolean } = {},
  slots: Record<string, (slotProps: Record<string, unknown>) => unknown> = {}
) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const surface = ref<SurfaceExpose | null>(null);
  const teamNames = ref(props.teamNames);
  const drawing = ref(props.drawing);
  const debug = ref(props.debug);
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(
          PipelineOutputSurface,
          {
            ref: surface,
            replay,
            ...(teamNames.value !== undefined ? { teamNames: teamNames.value } : {}),
            ...(drawing.value !== undefined ? { drawing: drawing.value } : {}),
            ...(debug.value !== undefined ? { debug: debug.value } : {}),
          },
          slots
        ),
    })
  );
  app.mount(root);
  return {
    root,
    teamNames,
    drawing,
    debug,
    surface: () => surface.value as SurfaceExpose,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

const at = (root: ParentNode, id: string) => root.querySelector(`[data-testid="${id}"]`);

/** The tracker mounted last. */
const tracker = () => trackers[trackers.length - 1]!;

/** Until the tracker is made and the HUD and the overlay slot are teleported into its overlay. */
const settled = async () => {
  await nextTick();
  await nextTick();
};

/** A press as the browser starts one, bubbling from `el`. */
const press = (el: Element | null) =>
  el?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));

/** What the surface presented last. */
const lastPresented = () => tracker().present.mock.calls.at(-1)?.[0];

describe('PipelineOutputSurface', () => {
  beforeEach(() => {
    trackers.length = 0;
    createMatchTracker.mockClear();
  });

  it('shows the loading state', async () => {
    const m = mount(fakeReplay('loading'));
    await nextTick();
    expect(at(m.root, 'pipeline-loading')).not.toBeNull();
    expect(createMatchTracker).not.toHaveBeenCalled();
    m.unmount();
  });

  it('shows the no-data state', async () => {
    const m = mount(fakeReplay('empty'));
    await nextTick();
    expect(at(m.root, 'pipeline-empty')).not.toBeNull();
    expect(createMatchTracker).not.toHaveBeenCalled();
    m.unmount();
  });

  it('shows the error state with its message, and loads again on request', async () => {
    const replay = fakeReplay('error', 'range request failed');
    const m = mount(replay);
    await nextTick();
    const el = at(m.root, 'pipeline-error');
    expect(el?.textContent).toContain('range request failed');
    expect(createMatchTracker).not.toHaveBeenCalled();
    vi.mocked(replay.load).mockClear();
    (el?.querySelector('button') as HTMLButtonElement).click();
    expect(replay.load).toHaveBeenCalledOnce();
    m.unmount();
  });

  it('calls load on mount', async () => {
    const replay = fakeReplay('idle');
    const m = mount(replay);
    await nextTick();
    expect(replay.load).toHaveBeenCalledOnce();
    m.unmount();
  });

  it('disposes the replay and destroys the tracker on unmount', async () => {
    const replay = fakeReplay('ready');
    const m = mount(replay);
    await nextTick();
    const mounted = tracker();
    m.unmount();
    expect(replay.dispose).toHaveBeenCalledOnce();
    expect(mounted.destroy).toHaveBeenCalledOnce();
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

    const stage = at(root, 'pipeline-stage')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    stage.dispatchEvent(event);
    expect(seen).toHaveLength(1);
    expect(event.defaultPrevented).toBe(true);

    app.unmount();
    root.remove();
  });

  describe('the tracker', () => {
    it('mounts one replay tracker in the stage once the replay is ready', async () => {
      const m = mount(fakeReplay('ready'));
      await nextTick();
      expect(createMatchTracker).toHaveBeenCalledOnce();
      const { host, options } = tracker();
      expect(at(m.root, 'pipeline-tracker')).toBe(host);
      expect(options).toMatchObject({
        mode: 'replay',
        locale: 'en',
        // The key the replay's own layers menu kept its choice under, so
        // nobody loses theirs.
        layersStorageKey: 'perspecto.replayLayers',
      });
      m.unmount();
    });

    it('names the teams after the match, first-named as home', async () => {
      const m = mount(fakeReplay('ready'), { teamNames: ['Ajax', 'PSV'] });
      await nextTick();
      expect(tracker().options.teams).toEqual({ home: { name: 'Ajax' }, away: { name: 'PSV' } });
      m.unmount();
    });

    it('leaves the teams to the tracker when the match is not known', async () => {
      const m = mount(fakeReplay('ready'), { teamNames: null });
      await nextTick();
      expect(tracker().options.teams).toEqual({ home: {}, away: {} });
      m.unmount();
    });

    it('turns the tracker’s developer badge and AI labels on and off with Demo', async () => {
      const m = mount(fakeReplay('ready'));
      await nextTick();
      expect(tracker().options.debug).toBe(false);
      expect(tracker().options.aiLabels).toBe(false);
      m.debug.value = true;
      await nextTick();
      await nextTick();
      expect(tracker().setOptions).toHaveBeenLastCalledWith({ debug: true, aiLabels: true });
      m.unmount();

      const on = mount(fakeReplay('ready'), { debug: true });
      await nextTick();
      expect(tracker().options.debug).toBe(true);
      expect(tracker().options.aiLabels).toBe(true);
      on.unmount();
    });

    it('names the teams again when the match changes', async () => {
      const m = mount(fakeReplay('ready'), { teamNames: ['Ajax', 'PSV'] });
      await nextTick();
      m.teamNames.value = ['Feyenoord', 'AZ'];
      await nextTick();
      await nextTick();
      expect(tracker().setOptions).toHaveBeenLastCalledWith({
        teams: { home: { name: 'Feyenoord' }, away: { name: 'AZ' } },
      });
      m.unmount();
    });

    // The order load() produces: mounted while loading, then a record and
    // ready in one tick. The tracker only exists once the stage is drawn, so
    // the record already on screen must still reach it.
    it('presents the record on screen as soon as the tracker is mounted', async () => {
      const replay = fakeReplay('loading');
      const m = mount(replay);
      await nextTick();
      const first = record(457);
      set(replay.record, first);
      set(replay.lookback, [first]);
      set(replay.state, 'ready');
      await nextTick();
      await nextTick();

      expect(lastPresented()).toEqual({ time: 0, playing: false, record: first, lookback: [first] });
      m.unmount();
    });

    it('presents the replay on every tick of its clock', async () => {
      const replay = fakeReplay('ready');
      const m = mount(replay);
      await nextTick();

      const records = [record(457, 1000), record(458, 1000.04)];
      set(replay.isPlaying, true);
      set(replay.currentTime, 0.02);
      await nextTick();
      expect(lastPresented()).toMatchObject({ time: 0.02, playing: true });

      // A tick that brings no new record still moves the clock.
      set(replay.currentTime, 0.03);
      await nextTick();
      expect(lastPresented()).toMatchObject({ time: 0.03, playing: true });

      set(replay.currentTime, 0.05);
      set(replay.record, records[1]);
      set(replay.lookback, records);
      await nextTick();
      expect(lastPresented()).toEqual({ time: 0.05, playing: true, record: records[1], lookback: records });
      m.unmount();
    });

    // Pausing stops every moment in the tracker, and a pause does not move
    // the clock.
    it('presents a pause, though the clock stands still', async () => {
      const replay = fakeReplay('ready');
      set(replay.isPlaying, true);
      set(replay.currentTime, 3);
      const m = mount(replay);
      await nextTick();
      const calls = tracker().present.mock.calls.length;

      set(replay.isPlaying, false);
      await nextTick();
      expect(tracker().present.mock.calls.length).toBe(calls + 1);
      expect(lastPresented()).toMatchObject({ time: 3, playing: false });
      m.unmount();
    });

    it('destroys the tracker when the replay fails, and mounts a new one when it is back', async () => {
      const replay = fakeReplay('ready');
      const m = mount(replay);
      await nextTick();
      const first = tracker();

      set(replay.state, 'error');
      await nextTick();
      await nextTick();
      expect(first.destroy).toHaveBeenCalledOnce();

      set(replay.state, 'ready');
      await nextTick();
      await nextTick();
      expect(createMatchTracker).toHaveBeenCalledTimes(2);
      expect(tracker()).not.toBe(first);
      expect(lastPresented()).toMatchObject({ record: replay.record.value });
      m.unmount();
    });
  });

  describe('the overlay', () => {
    it('mounts the overlay slot in the tracker’s overlay', async () => {
      const m = mount(fakeReplay('ready'), {}, {
        overlay: () => h('div', { 'data-testid': 'drawing-layer' }),
      });
      await nextTick();
      await nextTick();
      const layer = at(document, 'drawing-layer');
      expect(layer).not.toBeNull();
      expect(layer?.parentElement).toBe(tracker().overlay);
      m.unmount();
    });

    /**
     * DrawingCanvas shows a drawing only where drawing.frame equals the frame
     * it is given. Pipeline drawings are stamped round(replayTime * fps),
     * zero-based, because the pipeline's own frame_count is not (see
     * annotationStampFor).
     */
    it('gives the overlay the same frame number drawings are stamped with', async () => {
      const replay = fakeReplay('ready');
      set(replay.currentTime, 4);
      let seen: Record<string, unknown> | null = null;
      const m = mount(replay, {}, {
        overlay: (slotProps) => {
          seen = slotProps;
          return null;
        },
      });
      await nextTick();
      await nextTick();

      // 4 s at 25 fps. The record's own number, 457, is not what drawings carry.
      expect(seen).toMatchObject({ currentFrame: 100 });
      m.unmount();
    });
  });

  describe('the HUD', () => {
    // The transport, the frame badge and the buffering spinner sit in the
    // tracker's overlay, which lies exactly over the pitch: on the pitch, not
    // in the black band it is letterboxed in, and under the widget's own HUD
    // (its layers menu) and the drawing layer, as on master.
    it('sits in the tracker’s overlay, marked to keep moments running', async () => {
      const m = mount(fakeReplay('ready'));
      await settled();
      const hud = at(m.root, 'pipeline-hud') as HTMLElement | null;
      expect(hud?.parentElement).toBe(tracker().overlay);
      expect(hud?.hasAttribute('data-match-tracker-keep')).toBe(true);
      for (const id of ['pipeline-controls', 'pipeline-frame', 'pipeline-play-pause']) {
        expect(tracker().overlay.contains(at(m.root, id))).toBe(true);
      }
      m.unmount();
    });

    it('fills the pitch box without placing itself on it', async () => {
      const m = mount(fakeReplay('ready'));
      await settled();
      const hud = at(m.root, 'pipeline-hud') as HTMLElement;
      expect(hud.classList.contains('absolute')).toBe(true);
      expect(hud.classList.contains('inset-0')).toBe(true);
      expect(hud.style.left).toBe('');
      expect(hud.style.width).toBe('');
      m.unmount();
    });

    // DrawingCanvas lifts itself with z-index (40, and 100 while drawing).
    // In the same stacking context as the HUD, which has none, the layer
    // after it in the overlay paints and takes presses over it either way.
    it('comes before the drawing layer, which stacks above it', async () => {
      const m = mount(fakeReplay('ready'), {}, {
        overlay: () => h('div', { 'data-testid': 'drawing-layer' }),
      });
      await settled();
      const children = [...tracker().overlay.children];
      const hud = at(m.root, 'pipeline-hud')!;
      const layer = at(m.root, 'drawing-layer')!;
      expect(children).toContain(hud);
      expect(children).toContain(layer);
      expect(hud.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(getComputedStyle(hud).zIndex).toMatch(/^(auto|)$/);
      m.unmount();
    });

    it('waits for the tracker', async () => {
      const m = mount(fakeReplay('loading'));
      await settled();
      expect(at(m.root, 'pipeline-hud')).toBeNull();
      m.unmount();
    });

    it('shows the frame on screen', async () => {
      const replay = fakeReplay('ready');
      const m = mount(replay);
      await settled();
      expect(at(m.root, 'pipeline-frame')?.textContent).toContain('F457');
      set(replay.currentFrame, 1203);
      await nextTick();
      expect(at(m.root, 'pipeline-frame')?.textContent).toContain('F1203');
      m.unmount();
    });

    // The replay holds its clock while it waits on data, and a playhead that
    // stops with nothing on screen saying why reads as a freeze.
    it('marks the frame label while the replay waits on data', async () => {
      const replay = fakeReplay('ready');
      const { root, unmount } = mount(replay);
      await settled();
      expect(at(root, 'pipeline-buffering')).toBeNull();

      set(replay.buffering, true);
      await nextTick();
      expect(at(root, 'pipeline-buffering')?.getAttribute('role')).toBe('status');

      set(replay.buffering, false);
      await nextTick();
      expect(at(root, 'pipeline-buffering')).toBeNull();
      unmount();
    });
  });

  describe('transport', () => {
    /** The bar itself: the element the visibility classes are bound to. */
    const bar = (root: HTMLElement) =>
      at(root, 'pipeline-controls')?.firstElementChild as HTMLElement;

    it('starts playback and pauses it again from one button', async () => {
      const replay = fakeReplay('ready');
      const m = mount(replay);
      await settled();

      (at(m.root, 'pipeline-play-pause') as HTMLButtonElement).click();
      expect(replay.play).toHaveBeenCalledOnce();

      set(replay.isPlaying, true);
      await nextTick();
      expect(at(m.root, 'pipeline-play-pause')?.getAttribute('aria-label')).toBe('Pause');

      (at(m.root, 'pipeline-play-pause') as HTMLButtonElement).click();
      expect(replay.pause).toHaveBeenCalledOnce();
      m.unmount();
    });

    it('stays visible while paused, so the tab never looks control-less', async () => {
      const m = mount(fakeReplay('ready'));
      await settled();
      expect(bar(m.root).className).toContain('opacity-100');
      m.unmount();
    });

    it('hides during playback, and comes back on hover', async () => {
      const replay = fakeReplay('ready');
      const m = mount(replay);
      await settled();

      set(replay.isPlaying, true);
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
      await settled();
      expect(bar(m.root).className).toContain('has-[:focus-visible]:opacity-100');
      m.unmount();
    });

    it('steps a frame either way, pausing first', async () => {
      const replay = fakeReplay('ready');
      // 10 s in at 25 fps: frame 250 on the grid the step snaps to.
      set(replay.currentTime, 10);
      const m = mount(replay);
      await settled();

      // The millisecond over the grid position is the deliberate slack that
      // keeps a step off the record it is stepping away from.
      (at(m.root, 'pipeline-step-forward') as HTMLButtonElement).click();
      expect(replay.pause).toHaveBeenCalled();
      expect(vi.mocked(replay.seek).mock.calls[0]?.[0]).toBeCloseTo(251 / 25 + 0.001, 4);

      (at(m.root, 'pipeline-step-back') as HTMLButtonElement).click();
      expect(vi.mocked(replay.seek).mock.calls[1]?.[0]).toBeCloseTo(249 / 25 + 0.001, 4);
      m.unmount();
    });

    // A moment played by hand while paused carries on when Play is pressed:
    // the demo-recording path. The drawing layer, in the same overlay, still
    // stops it, so what is drawn on is the data.
    it('leaves the tracker’s moments running when pressed, unlike the drawing layer', async () => {
      const m = mount(fakeReplay('ready'), {}, {
        overlay: () => h('div', { 'data-testid': 'drawing-layer' }),
      });
      await settled();
      for (const id of ['pipeline-play-pause', 'pipeline-step-forward', 'pipeline-step-back']) {
        press(at(m.root, id));
      }
      press(at(m.root, 'pipeline-frame'));
      expect(tracker().stopAll).not.toHaveBeenCalled();

      press(at(m.root, 'drawing-layer'));
      expect(tracker().stopAll).toHaveBeenCalledOnce();
      m.unmount();
    });

    // Zoom and pan leave an element marked data-match-tracker-keep alone
    // (match tracker 0.1.3), so the transport needs no stopPropagation of its
    // own: being inside the kept HUD is enough. What the widget then does with
    // a press or a double click on it is proved against the real widget in
    // pipelineOutputSurfaceWidget.test.ts.
    it('sits inside the kept HUD and stops nothing from reaching the widget', async () => {
      const m = mount(fakeReplay('ready'));
      await settled();
      const controls = at(m.root, 'pipeline-controls')!;
      expect(controls.closest('[data-match-tracker-keep]')).toBe(at(m.root, 'pipeline-hud'));
      expect(tracker().overlay.contains(controls)).toBe(true);

      const seen: string[] = [];
      for (const type of ['pointerdown', 'dblclick', 'wheel']) {
        tracker().host.addEventListener(type, () => seen.push(type));
      }
      const button = at(m.root, 'pipeline-step-forward')!;
      press(button);
      button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
      button.dispatchEvent(new WheelEvent('wheel', { bubbles: true, composed: true, ctrlKey: true, deltaY: -100 }));
      expect(seen).toEqual(['pointerdown', 'dblclick', 'wheel']);
      expect(tracker().stopAll).not.toHaveBeenCalled();
      m.unmount();
    });

    describe('while drawing', () => {
      // The drawing layer stacks above the transport, as on master. inert
      // also takes it out of the pointer's and the keyboard's reach, which
      // pointer-events alone cannot: the focus-visible rule turns them back
      // on, and a Tab would still reach it.
      it('is inert, and comes back when drawing stops', async () => {
        const m = mount(fakeReplay('ready'), { drawing: true });
        await settled();
        const controls = at(m.root, 'pipeline-controls') as HTMLElement;
        expect(controls.hasAttribute('inert')).toBe(true);

        m.drawing.value = false;
        await nextTick();
        expect(controls.hasAttribute('inert')).toBe(false);

        m.drawing.value = true;
        await nextTick();
        expect(controls.hasAttribute('inert')).toBe(true);
        m.unmount();
      });

      it('is not inert when the editor says nothing about drawing', async () => {
        const m = mount(fakeReplay('ready'));
        await settled();
        expect((at(m.root, 'pipeline-controls') as HTMLElement).hasAttribute('inert')).toBe(false);
        m.unmount();
      });
    });
  });

  describe('playing moments by hand', () => {
    it('says nothing can be played before the tracker is up', async () => {
      const m = mount(fakeReplay('loading'));
      await nextTick();
      expect(m.surface().momentAvailability).toEqual(NOTHING);
      expect(m.surface().triggerMoment('goal')).toBe(false);
      m.unmount();
    });

    it('says what the tracker can play, and follows it', async () => {
      createMatchTracker.mockImplementationOnce((host, options) => {
        const made = makeTracker(host, options);
        made.available = { goal: false, attack: { 0: true, 1: false }, corner: true, freeKick: true, throwIn: true, varCheck: true, goalDisallowed: true, halfTime: true, secondHalf: true, fullTime: true, foul: true, shotOnGoal: true, headerOnGoal: true, yellowCard: true, redCard: true, substitution: true, penalty: true, penaltyScored: true, penaltyMissed: true };
        return made;
      });
      const m = mount(fakeReplay('ready'));
      await nextTick();
      await nextTick();
      expect(m.surface().momentAvailability).toEqual({
        goal: false,
        attack: { 0: true, 1: false },
        corner: true,
        freeKick: true,
        throwIn: true,
        varCheck: true,
        goalDisallowed: true,
        halfTime: true,
        secondHalf: true,
        fullTime: true,
        foul: true,
        shotOnGoal: true,
        headerOnGoal: true,
        yellowCard: true,
        redCard: true,
        substitution: true,
        penalty: true,
        penaltyScored: true,
        penaltyMissed: true,
      });

      tracker().emit('availability', { goal: true, attack: { 0: true, 1: true }, corner: true, freeKick: true, throwIn: true, varCheck: true, goalDisallowed: true, halfTime: true, secondHalf: true, fullTime: true, foul: true, shotOnGoal: true, headerOnGoal: true, yellowCard: true, redCard: true, substitution: true, penalty: true, penaltyScored: true, penaltyMissed: true });
      await nextTick();
      expect(m.surface().momentAvailability).toEqual({
        goal: true,
        attack: { 0: true, 1: true },
        corner: true,
        freeKick: true,
        throwIn: true,
        varCheck: true,
        goalDisallowed: true,
        halfTime: true,
        secondHalf: true,
        fullTime: true,
        foul: true,
        shotOnGoal: true,
        headerOnGoal: true,
        yellowCard: true,
        redCard: true,
        substitution: true,
        penalty: true,
        penaltyScored: true,
        penaltyMissed: true,
      });
      m.unmount();
    });

    it('plays a moment through the tracker', async () => {
      const m = mount(fakeReplay('ready'));
      await nextTick();
      expect(m.surface().triggerMoment('attack', 1)).toBe(true);
      expect(tracker().trigger).toHaveBeenLastCalledWith('attack', 1);
      m.surface().triggerMoment('goal');
      expect(tracker().trigger).toHaveBeenLastCalledWith('goal', 0);
      m.unmount();
    });

    it('says nothing can be played once the tracker is gone', async () => {
      const replay = fakeReplay('ready');
      const m = mount(replay);
      await nextTick();
      tracker().emit('availability', { goal: true, attack: { 0: true, 1: true }, corner: true, freeKick: true, throwIn: true, varCheck: true, goalDisallowed: true, halfTime: true, secondHalf: true, fullTime: true, foul: true, shotOnGoal: true, headerOnGoal: true, yellowCard: true, redCard: true, substitution: true, penalty: true, penaltyScored: true, penaltyMissed: true });
      set(replay.state, 'error');
      await nextTick();
      await nextTick();
      expect(m.surface().momentAvailability).toEqual(NOTHING);
      m.unmount();
    });
  });
});
