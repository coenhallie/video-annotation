// @vitest-environment jsdom
//
// The surface driven by a REAL replay, seeked the way EditorView's
// `onTimelineSeek` seeks it. The other pipeline surface tests hand the
// component a fake replay, so none of them cover the chain that actually
// connects the timeline to what is drawn: seek -> record -> frame ref ->
// renderFrame.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import PipelineOutputSurface from '@/components/PipelineOutputSurface.vue';
import { usePipelineReplay } from '@/composables/usePipelineReplay';
import {
  taperedFile,
  recordAtTime,
  fetcherFor,
} from '@/lib/pipelineData/__tests__/taperedFixture';
import type { Frame } from '@/lib/vis/types';

const { renderFrame, useRenderer2D } = vi.hoisted(() => {
  const renderFrame = vi.fn();
  const invalidateCache = vi.fn();
  // Zoom and pan go through the renderer, so the stub has to carry setView or
  // mounting throws.
  const setView = vi.fn();
  const useRenderer2D = vi.fn(() => ({ renderFrame, invalidateCache, setView }));
  return { renderFrame, useRenderer2D };
});

vi.mock('@/lib/vis/useRenderer2D', () => ({ useRenderer2D }));

const FILE = { count: 500, fromBytes: 400, toBytes: 400 };

function mountWith(replay: ReturnType<typeof usePipelineReplay>) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({
      setup: () => () => h(PipelineOutputSurface, { replay }),
    })
  );
  app.mount(root);
  return {
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

/** The frame number of the last frame handed to the renderer. */
const lastDrawnFrame = () => {
  const call = renderFrame.mock.calls[renderFrame.mock.calls.length - 1];
  return (call?.[0] as Frame | undefined)?.frame_data?.[0]?.frame_count;
};

const newReplay = () =>
  usePipelineReplay({ openFetcher: async () => fetcherFor(taperedFile(FILE)) });

describe('the pipeline surface draws the position it is seeked to', () => {
  beforeEach(() => {
    renderFrame.mockClear();
    // jsdom has no 2D context. Give it a stub so renderer attachment is
    // observable; without this ensureRenderer bails and nothing is drawn.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as unknown as CanvasRenderingContext2D
    );
  });

  afterEach(() => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockRestore();
  });

  it('draws the seeked frame, not the one it was already showing', async () => {
    const replay = newReplay();
    const view = mountWith(replay);
    await replay.load();
    await nextTick();

    expect(replay.state.value).toBe('ready');
    expect(lastDrawnFrame()).toBe(457);

    const time = 4;
    await replay.seek(time);
    await nextTick();

    const expected = 457 + recordAtTime(time, FILE);
    expect(replay.currentFrame.value).toBe(expected);
    expect(lastDrawnFrame()).toBe(expected);

    view.unmount();
  });

  it('follows every position of a scrub, not just the first', async () => {
    const replay = newReplay();
    const view = mountWith(replay);
    await replay.load();
    await nextTick();

    const drawn: Array<number | undefined> = [];
    const times = [1, 2, 3, 4, 5];
    for (const time of times) {
      await replay.seek(time);
      await nextTick();
      drawn.push(lastDrawnFrame());
    }

    expect(drawn).toEqual(times.map((t) => 457 + recordAtTime(t, FILE)));

    view.unmount();
  });
});
