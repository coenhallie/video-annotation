// @vitest-environment jsdom
//
// The surface driven by a REAL replay and the REAL match tracker, seeked the
// way EditorView's `onTimelineSeek` seeks it. The other pipeline surface
// tests hand the component a fake replay and a fake tracker, so none of them
// cover the chain that actually connects the timeline to what is drawn:
// seek -> record -> present -> the tracker's frame on screen.
//
// jsdom lays nothing out and has no 2D context, so the tracker draws nothing
// here. What it is given is watched on the way in, and what it took is read
// back through its own API: a moment it can play needs a frame on screen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import PipelineOutputSurface from '@/components/PipelineOutputSurface.vue';
import { usePipelineReplay } from '@/composables/usePipelineReplay';
import {
  taperedFile,
  recordAtTime,
  fetcherFor,
} from '@/lib/pipelineData/__tests__/taperedFixture';
import type { MatchTrackerInstance, ReplayState } from '@coenhallie/match-tracker';

const { mounted } = vi.hoisted(() => ({
  mounted: [] as Array<{ tracker: MatchTrackerInstance; presented: ReplayState[] }>,
}));

// The real tracker, with what it is presented recorded on the way in.
vi.mock('@coenhallie/match-tracker', async (importOriginal) => {
  const real = await importOriginal<typeof import('@coenhallie/match-tracker')>();
  return {
    ...real,
    createMatchTracker: (...args: Parameters<typeof real.createMatchTracker>) => {
      const tracker = real.createMatchTracker(...args);
      const presented: ReplayState[] = [];
      const present = tracker.present.bind(tracker);
      tracker.present = (state) => {
        presented.push(state);
        present(state);
      };
      mounted.push({ tracker, presented });
      return tracker;
    },
  };
});

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

const last = () => mounted[mounted.length - 1]!;

/** The frame number of the last record presented to the tracker. */
const lastPresentedFrame = () => last().presented.at(-1)?.record?.frameCount;

/** Let the tracker's animation frame run, which takes in what it was presented. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const newReplay = () =>
  usePipelineReplay({ openFetcher: async () => fetcherFor(taperedFile(FILE)) });

describe('the pipeline surface presents the position it is seeked to', () => {
  beforeEach(() => {
    // jsdom has no 2D context, and says so on every call unless the canvas
    // package is installed. The tracker takes a null context as nothing to
    // draw on.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockRestore();
    mounted.length = 0;
  });

  it('presents the seeked record, not the one it was already showing', async () => {
    const replay = newReplay();
    const view = mountWith(replay);
    await replay.load();
    await nextTick();
    await nextTick();

    expect(replay.state.value).toBe('ready');
    expect(lastPresentedFrame()).toBe(457);

    const time = 4;
    await replay.seek(time);
    await nextTick();

    const expected = 457 + recordAtTime(time, FILE);
    expect(replay.currentFrame.value).toBe(expected);
    expect(lastPresentedFrame()).toBe(expected);
    expect(last().presented.at(-1)).toMatchObject({ time, playing: false });
    expect(last().presented.at(-1)?.lookback.at(-1)?.frameCount).toBe(expected);

    view.unmount();
  });

  it('follows every position of a scrub, not just the first', async () => {
    const replay = newReplay();
    const view = mountWith(replay);
    await replay.load();
    await nextTick();
    await nextTick();

    const presented: Array<number | undefined> = [];
    const times = [1, 2, 3, 4, 5];
    for (const time of times) {
      await replay.seek(time);
      await nextTick();
      presented.push(lastPresentedFrame());
    }

    expect(presented).toEqual(times.map((t) => 457 + recordAtTime(t, FILE)));

    view.unmount();
  });

  it('puts the record on the tracker’s screen', async () => {
    const replay = newReplay();
    const view = mountWith(replay);
    await replay.load();
    await nextTick();
    await nextTick();

    const { tracker } = last();
    // Nothing before its first frame: a corner can be played on any frame.
    expect(tracker.availability().corner).toBe(false);
    await nextFrame();
    expect(tracker.availability().corner).toBe(true);

    view.unmount();
    // Unmounting takes the tracker down with the surface.
    expect(tracker.availability().corner).toBe(false);
  });
});
