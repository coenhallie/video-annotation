import { ref, type Ref } from 'vue';
import type { Frame } from '@/lib/vis/types';
import { parseWindow, type ReplayRecord } from '@/lib/pipelineData/frameWindow';
import {
  buildIndex,
  estimateOffset,
  insertEntry,
  type JsonlIndex,
  type RangeFetcher,
} from '@/lib/pipelineData/jsonlIndex';

export type ReplayState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface PipelineReplay {
  currentTime: Ref<number>;
  duration: Ref<number>;
  currentFrame: Ref<number>;
  totalFrames: Ref<number>;
  fps: Ref<number>;
  isPlaying: Ref<boolean>;
  frame: Ref<Frame | null>;
  state: Ref<ReplayState>;
  error: Ref<string | null>;
  load(): Promise<void>;
  play(): void;
  pause(): void;
  seek(t: number): Promise<void>;
  /** Resolves once any background prefetch has settled. */
  whenIdle(): Promise<void>;
  dispose(): void;
}

interface LoadedWindow {
  startOffset: number;
  records: ReplayRecord[];
}

const DEFAULT_WINDOW_SECONDS = 30;
const DEFAULT_LRU = 4;
/** How close to the end of the loaded window playback may get before the next
 *  one is fetched. Without this the pitch freezes at every window boundary
 *  while the range request is in flight. */
const PREFETCH_SECONDS = 8;
/**
 * Bytes read to learn the time at one point in the file.
 *
 * A read that exists only to narrow a seek's bounds has to yield a single
 * whole record and nothing more, so it is deliberately far smaller than a
 * window. That is what makes halving the bounds cheap enough to be the answer
 * to a missed estimate rather than a last resort.
 */
const SEEK_PROBE_BYTES = 65536;

/**
 * Reads one seek may make before giving up.
 *
 * A log2 budget, not a linear one: every read that misses halves the bytes
 * still in question, so what a file needs is the log of its size over one
 * window - eight reads for a gigabyte narrowed to a 5 MB window. Set well
 * above that because the reads doing the narrowing are small and a seek that
 * runs out of them shows nothing at all. In practice a seek takes one read,
 * or a handful in a region the index has not learned yet.
 */
const MAX_SEEK_READS = 32;

/**
 * Replay the pipeline's frame JSONL on its own clock.
 *
 * Deliberately independent of the video element. The two surfaces never have to
 * agree on a position, which is why replay time is measured from the first
 * record in the file rather than mapped onto video time.
 */
export function usePipelineReplay(opts: {
  openFetcher: () => Promise<RangeFetcher | null>;
  raf?: (cb: (ms: number) => void) => number;
  caf?: (handle: number) => void;
  windowSeconds?: number;
  lruSize?: number;
}): PipelineReplay {
  const raf =
    opts.raf ?? ((cb: (ms: number) => void) => requestAnimationFrame(cb));
  const caf = opts.caf ?? ((h: number) => cancelAnimationFrame(h));
  const windowSeconds = opts.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const lruSize = opts.lruSize ?? DEFAULT_LRU;

  const currentTime = ref(0);
  const duration = ref(0);
  const currentFrame = ref(0);
  const totalFrames = ref(0);
  const fps = ref(25);
  const isPlaying = ref(false);
  const frame = ref<Frame | null>(null);
  const state = ref<ReplayState>('idle');
  const error = ref<string | null>(null);

  let fetcher: RangeFetcher | null = null;
  let index: JsonlIndex | null = null;
  let windows: LoadedWindow[] = [];
  let rafHandle: number | null = null;
  let lastTickMs: number | null = null;
  let prefetching: Promise<unknown> | null = null;

  // Bumped only by dispose() and by a fresh load(). Async reads compare the
  // epoch they started under after each await: a mismatch means the replay was
  // torn down or reloaded underneath them, so they must not touch `index`, the
  // window cache, or any reactive state.
  let epoch = 0;

  // Bumped by every seek. This governs one thing only: which record is allowed
  // to reach show(). It deliberately does NOT invalidate fetches, because
  // tick() seeks on every animation frame, and a fetch cancelled by an ordinary
  // playback tick would mean no window is ever cached under real latency.
  let seekSeq = 0;

  /** Absolute file time for a replay time. */
  const abs = (t: number) => (index ? index.first.t + t : t);

  function windowBytes(): number {
    if (!index) return 0;
    const perSecond = fps.value * index.meanRecordBytes;
    return Math.max(index.meanRecordBytes * 2, Math.round(perSecond * windowSeconds));
  }

  function findIn(win: LoadedWindow, target: number): ReplayRecord | null {
    const records = win.records;
    const firstRecord = records[0];
    const lastRecord = records[records.length - 1];
    if (!firstRecord || !lastRecord) return null;
    if (target < firstRecord.t || target > lastRecord.t) return null;
    let lo = 0;
    let hi = records.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const midRecord = records[mid];
      if (midRecord && midRecord.t <= target) lo = mid;
      else hi = mid - 1;
    }
    // `?? null` reports "no record here", which is already this function's way
    // of saying so. Nothing is substituted for a record the window lacks.
    return records[lo] ?? null;
  }

  function touch(win: LoadedWindow): void {
    windows = [win, ...windows.filter((w) => w !== win)].slice(0, lruSize);
  }

  /**
   * Read one byte range and turn it into a cached window.
   *
   * `start` is the byte the window should BEGIN at, which is not the byte
   * requested. A non-BOF range always has its first line discarded as a
   * partial, so a range beginning exactly on a record boundary would throw a
   * whole record away and that record would be unreachable. Backing up one
   * byte puts the preceding newline first, which makes the discarded fragment
   * provably empty - the invariant parseWindow documents.
   *
   * `firstOffset` is where the window's first whole record actually starts,
   * which is what makes it usable as a seek bound: it is a real record start,
   * not an arbitrary byte.
   */
  async function readWindow(
    start: number,
    bytes: number,
    startEpoch: number
  ): Promise<{
    from: number;
    end: number;
    first: ReplayRecord;
    last: ReplayRecord;
    firstOffset: number;
    win: LoadedWindow;
  } | null> {
    if (!index || !fetcher) return null;
    const from = start <= 0 ? 0 : start - 1;
    const end = Math.min(index.size, from + bytes) - 1;
    const text = await fetcher.range(from, end);
    // A dispose (or a fresh load) happened while this range was in flight.
    // `index`/`fetcher` may already be null, so bail before touching them.
    if (startEpoch !== epoch || !index) return null;
    const records = parseWindow(text, {
      startsAtBof: from === 0,
      endsAtEof: end === index.size - 1,
    });
    const first = records[0];
    const last = records[records.length - 1];
    if (!first || !last) return null;

    const firstOffset = from === 0 ? 0 : from + text.indexOf('\n') + 1;
    // Feed the true offset back so the next estimate in this region is better.
    insertEntry(index, {
      offset: firstOffset,
      frameCount: first.frameCount,
      t: first.t,
    });

    const win: LoadedWindow = { startOffset: from, records };
    touch(win);
    return { from, end, first, last, firstOffset, win };
  }

  async function recordAt(target: number, startEpoch: number): Promise<ReplayRecord | null> {
    if (!index || !fetcher || startEpoch !== epoch) return null;

    for (const win of windows) {
      const hit = findIn(win, target);
      if (hit) {
        touch(win);
        return hit;
      }
    }

    const span = windowBytes();
    const probeBytes = Math.max(SEEK_PROBE_BYTES, index.meanRecordBytes * 2);

    // Start a quarter of a window before the estimate. Two reasons, and the
    // second one is load-bearing rather than an optimisation:
    //
    //  1. Interpolation can overshoot, and landing early costs part of a window
    //     rather than a whole retry.
    //  2. `index.last.offset` is the FILE SIZE, not the last record's start
    //     byte (see the note on JsonlIndex.last). So seeking to the very end
    //     makes estimateOffset return a byte one past the last record. Backing
    //     off means the window still ENDS at EOF and therefore still contains
    //     that record. Remove this backoff and the final frame silently
    //     disappears from the replay.
    const estimate = Math.max(
      0,
      estimateOffset(index, target) - Math.round(span / 4)
    );

    // Byte bounds proven to bracket the target: its record starts at or after
    // `lo` and before `hi`. They begin as the whole file and narrow with every
    // read that turns out not to hold it.
    let lo = 0;
    let hi = index.size;

    for (let attempt = 0; attempt < MAX_SEEK_READS; attempt++) {
      // Once the bounds are closer together than a window, a window read at
      // `lo` must contain the target, so that is the read to make. Until then
      // the bounds are halved by reading the byte halfway between them, and
      // that read only has to yield the TIME there - one whole record - so it
      // is a small one rather than a window.
      //
      // What this replaces stepped one window along on a miss and gave up
      // after three, which could only ever correct an error of about a window.
      // Time per byte is nowhere near uniform across a real export - on a
      // 918 MB one, equal 102 MB spans covered anywhere between 576 and 1598
      // seconds, because stretches holding fewer detections pack far more
      // records into their share of the bytes. An estimate interpolated across
      // such a stretch is out by megabytes, and a scrub to one of those spots
      // simply returned null. Nothing was drawn, so the pitch sat on its
      // previous frame while the timeline's playhead moved on without it.
      const narrowed = hi - lo < span;
      const at =
        attempt === 0 ? estimate : narrowed ? lo : Math.floor((lo + hi) / 2);
      // The closing read is given a record's worth of slack beyond the window
      // it needs, so a record straddling the far end of the bounds is read
      // whole rather than discarded as a trailing partial.
      const bytes =
        attempt === 0 ? span : narrowed ? span + probeBytes : probeBytes;

      const read = await readWindow(at, bytes, startEpoch);
      if (!read) return null;

      const hit = findIn(read.win, target);
      if (hit) return hit;

      if (target < read.first.t) {
        // Nothing earlier exists to look at, so the file's first record is the
        // closest thing to the target there is.
        if (read.from === 0) return read.first;
        // Every record starting at or after `at` begins at or after this
        // read's first whole record, and that record is already past the
        // target - so the one being looked for starts before `at`.
        hi = at;
      } else {
        if (read.end >= index.size - 1) return read.last;
        // A closing read that cannot advance its own lower bound would ask for
        // the same bytes again on every remaining attempt. It takes a record
        // longer than the slack above for that to happen, which is not a shape
        // this format produces - but repeating a window-sized read until the
        // budget runs out is an expensive way to fail, so stop instead.
        if (narrowed && read.firstOffset <= lo) return null;
        lo = read.firstOffset;
      }
    }
    return null;
  }

  function show(record: ReplayRecord): void {
    frame.value = record.frame;
    currentFrame.value = record.frameCount;
  }

  /**
   * Pull the next window in while the current one still has room.
   *
   * Fire and forget: playback must not wait on it. One at a time, because
   * every rAF tick asks and a boundary is many ticks wide.
   */
  function maybePrefetch(): void {
    if (prefetching || !index) return;
    const newest = windows[0];
    if (!newest) return;
    const records = newest.records;
    const lastT = records[records.length - 1]?.t;
    if (lastT === undefined) return;
    if (abs(currentTime.value) < lastT - PREFETCH_SECONDS) return;
    if (lastT >= index.last.t) return;

    const startEpoch = epoch;
    prefetching = recordAt(lastT + 1e-6, startEpoch)
      .catch(() => null)
      .finally(() => {
        prefetching = null;
      });
  }

  /** Resolves once any background prefetch has settled. For tests. */
  async function whenIdle(): Promise<void> {
    while (prefetching) await prefetching;
  }

  async function load(): Promise<void> {
    state.value = 'loading';
    error.value = null;
    const startEpoch = ++epoch;
    try {
      const openedFetcher = await opts.openFetcher();
      // Capture into a local and check BEFORE assigning. A stale load whose
      // continuation resolves after a newer one would otherwise clobber the
      // live fetcher, and recordAt's guard tests `fetcher` for truthiness, not
      // identity, so it could never notice.
      if (startEpoch !== epoch) return;
      fetcher = openedFetcher;
      if (!fetcher) {
        state.value = 'empty';
        return;
      }
      const builtIndex = await buildIndex(fetcher);
      if (startEpoch !== epoch) return;
      index = builtIndex;
      duration.value = Math.max(0, index.last.t - index.first.t);
      totalFrames.value = index.last.frameCount - index.first.frameCount + 1;
      if (duration.value > 0 && totalFrames.value > 1) {
        fps.value = Math.max(
          1,
          Math.round((totalFrames.value - 1) / duration.value)
        );
      }
      currentTime.value = 0;
      const first = await recordAt(index.first.t, startEpoch);
      if (startEpoch !== epoch) return;
      if (first) show(first);
      state.value = 'ready';
    } catch (err) {
      if (startEpoch !== epoch) return;
      error.value = err instanceof Error ? err.message : String(err);
      state.value = 'error';
    }
  }

  async function seek(t: number): Promise<void> {
    if (state.value !== 'ready' || !index) return;
    const startEpoch = epoch;
    const seq = ++seekSeq;
    const clamped = Math.min(Math.max(0, t), duration.value);
    currentTime.value = clamped;
    try {
      const record = await recordAt(abs(clamped), startEpoch);
      if (startEpoch !== epoch) return;
      // A newer seek started while this one was in flight, so its frame is the
      // one that belongs on screen. The window this read cached stays cached
      // either way, which is the point of separating the two counters.
      if (seq !== seekSeq) return;
      if (record) show(record);
    } catch (err) {
      if (startEpoch !== epoch) return;
      error.value = err instanceof Error ? err.message : String(err);
      state.value = 'error';
      pause();
    }
  }

  function tick(ms: number): void {
    if (!isPlaying.value) return;
    if (lastTickMs === null) {
      lastTickMs = ms;
      rafHandle = raf(tick);
      return;
    }
    const delta = (ms - lastTickMs) / 1000;
    lastTickMs = ms;

    const next = currentTime.value + delta;
    if (next >= duration.value) {
      currentTime.value = duration.value;
      // seek() handles its own failures (catches and moves to 'error'), so
      // nothing here needs to observe the rejection.
      void seek(duration.value);
      pause();
      return;
    }
    currentTime.value = next;
    // seek() handles its own failures (catches and moves to 'error'), so
    // nothing here needs to observe the rejection.
    void seek(next);
    maybePrefetch();
    rafHandle = raf(tick);
  }

  function play(): void {
    if (state.value !== 'ready' || isPlaying.value) return;
    // tick() pauses as soon as it reaches the end and leaves currentTime there,
    // so pressing play again would arm the clock only for the next tick to hit
    // that same branch and pause. Rewind first, the way a video element does.
    //
    // The tolerance is a frame wide rather than an exact comparison because
    // scrubbing to the very end of the bar lands a hair short of `duration`,
    // and playing the remaining few milliseconds looks identical to the button
    // doing nothing at all.
    if (currentTime.value >= duration.value - 1 / fps.value) {
      currentTime.value = 0;
      // seek() handles its own failures (catches and moves to 'error'), so
      // nothing here needs to observe the rejection.
      void seek(0);
    }
    isPlaying.value = true;
    lastTickMs = null;
    rafHandle = raf(tick);
  }

  function pause(): void {
    isPlaying.value = false;
    lastTickMs = null;
    if (rafHandle !== null) {
      caf(rafHandle);
      rafHandle = null;
    }
  }

  function dispose(): void {
    pause();
    // Invalidate every in-flight read, so nothing resolves into a torn-down
    // replay.
    epoch++;
    windows = [];
    index = null;
    fetcher = null;
    // Not just bookkeeping: play() guards on state === 'ready', so leaving it
    // there would let a stray play() after unmount re-arm the clock over no
    // data at all.
    state.value = 'idle';
  }

  return {
    currentTime,
    duration,
    currentFrame,
    totalFrames,
    fps,
    isPlaying,
    frame,
    state,
    error,
    load,
    play,
    pause,
    seek,
    whenIdle,
    dispose,
  };
}
