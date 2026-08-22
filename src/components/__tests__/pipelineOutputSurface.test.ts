// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import PipelineOutputSurface from '@/components/PipelineOutputSurface.vue';
import type { PipelineReplay, ReplayState } from '@/composables/usePipelineReplay';

/**
 * Declared through vi.hoisted because vi.mock is hoisted above the imports,
 * and plain const declarations would still be in their temporal dead zone
 * when the factory runs (see drawingCanvas.test.ts for the same pattern).
 */
const { renderFrame, useRenderer2D } = vi.hoisted(() => {
  const renderFrame = vi.fn();
  const invalidateCache = vi.fn();
  const useRenderer2D = vi.fn(() => ({ renderFrame, invalidateCache }));
  return { renderFrame, useRenderer2D };
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

  it('shows the canvas when ready', async () => {
    const m = mount(fakeReplay('ready'));
    await nextTick();
    expect(at(m.root, 'pipeline-canvas')).not.toBeNull();
    expect(at(m.root, 'pipeline-empty')).toBeNull();
    m.unmount();
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
});
