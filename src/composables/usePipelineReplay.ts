import { computed, ref, type Ref } from 'vue';
import type { Frame } from '@/lib/vis/types';
import { parseWindowAt, type ReplayRecord } from '@/lib/pipelineData/frameWindow';
import { samePhase, teamPhaseAt, PHASE_LOOKBACK_S, type TeamPhase } from '@/lib/vis/teamPhase';
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
  /**
   * True while the pitch is waiting on data: a seek has not found its frame
   * yet, or playback has run into a stretch that is still loading and is
   * holding the clock until it arrives.
   */
  buffering: Readonly<Ref<boolean>>;
  /**
   * Who is attacking and who is defending at the frame on screen, derived from
   * the frames up to PHASE_LOOKBACK_S before it (see teamPhase.ts). Null until
   * a frame is shown.
   */
  phase: Ref<TeamPhase | null>;
  state: Ref<ReplayState>;
  error: Ref<string | null>;
  load(): Promise<void>;
  play(): void;
  pause(): void;
  seek(t: number): Promise<void>;
  /** Resolves once every read in flight has settled. */
  whenIdle(): Promise<void>;
  dispose(): void;
}

interface LoadedWindow {
  /** Byte the window's first whole record starts at. */
  firstOffset: number;
  /**
   * Byte the record after the window's last whole one starts at, which is
   * where the window after this one picks up. The file size at EOF.
   */
  nextOffset: number;
  records: ReplayRecord[];
}

/** One range read, parsed, with the byte positions that bound it. */
interface WindowRead {
  from: number;
  end: number;
  first: ReplayRecord;
  last: ReplayRecord;
  firstOffset: number;
  lastOffset: number;
  win: LoadedWindow;
}

/**
 * The reads being made on the user's behalf: a seek, the first frame of a
 * load, or playback that ran out of loaded data. There is only ever one, and
 * a newer seek aborts it, so a scrub cannot stack up downloads nobody will
 * look at.
 */
interface Foreground {
  controller: AbortController;
  /**
   * Absolute time of the first record of the window being filled, once the
   * seek has found it. Null while it is still looking.
   */
  fillFrom: number | null;
  promise: Promise<void>;
}

const DEFAULT_WINDOW_SECONDS = 30;
const DEFAULT_LRU = 4;
/** How close to the end of the loaded window playback may get before the next
 *  one is fetched. Without this the pitch freezes at every window boundary
 *  while the range request is in flight. */
const PREFETCH_SECONDS = 8;
/**
 * Bytes a seek reads at a time while it looks for its record.
 *
 * Deliberately far smaller than a window: a seek only has to find one record
 * to draw, and on a real export a window is 5.7 MB, which is most of a second
 * on a fast connection spent downloading 30 seconds of data to show one
 * frame. The window around the record is read after it is on screen.
 */
const SEEK_PROBE_BYTES = 65536;

/**
 * Probes a seek sends at once, per round trip.
 *
 * One is aimed by interpolation, which on a well-learned stretch of the file
 * lands first time; the rest split the bounds evenly, so a round that misses
 * still cuts them to a quarter. On the real 918 MB export that took the slowest
 * tenth of seeks from about seven round trips with one probe at a time to four.
 * Four rather than more because a browser opens six connections per host, and
 * playback's prefetch needs one of the others.
 */
const SEEK_PROBES_PER_ROUND = 4;

/**
 * Round trips one seek may make before giving up.
 *
 * Every round cuts the bounds to at most a quarter, so a gigabyte narrows to
 * one probe in about seven. The budget sits above that because a seek that
 * runs out shows nothing at all.
 */
const MAX_SEEK_ROUNDS = 16;

function isAbort(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === 'AbortError';
}

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

  // The two halves of `buffering`, kept apart because they clear at different
  // moments: a seek's wait ends when its frame is drawn, playback's when the
  // clock can move again.
  const awaitingFrame = ref(false);
  const held = ref(false);
  const buffering = computed(() => awaitingFrame.value || held.value);
  const phase = ref<TeamPhase | null>(null);
  // The record on screen, so its phase can be worked out again when the frames
  // before it arrive after it does.
  let shown: ReplayRecord | null = null;

  let fetcher: RangeFetcher | null = null;
  let index: JsonlIndex | null = null;
  let windows: LoadedWindow[] = [];
  let rafHandle: number | null = null;
  let lastTickMs: number | null = null;
  let foreground: Foreground | null = null;
  let prefetching: Promise<unknown> | null = null;
  let prefetchController: AbortController | null = null;

  // Bumped only by dispose() and by a fresh load(). Async reads compare the
  // epoch they started under after each await: a mismatch means the replay was
  // torn down or reloaded underneath them, so they must not touch `index`, the
  // window cache, or any reactive state.
  let epoch = 0;

  // Bumped by every seek and by every frame playback draws. It decides which
  // record is allowed to reach the screen: a seek whose read resolves after a
  // newer position was drawn must not paint over it.
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

  /** The cached record for a time, and the window holding it. */
  function findCached(
    target: number
  ): { win: LoadedWindow; record: ReplayRecord } | null {
    for (const win of windows) {
      const record = findIn(win, target);
      if (record) return { win, record };
    }
    // A time after one window's last record but before the next window's
    // first belongs to that last record. Neither window's own range covers
    // it, but a prefetched window starts at exactly the byte the one before
    // it ends at, so nothing in the file lies between the two. Without this,
    // playback would stall for a frame at every window boundary.
    for (const win of windows) {
      const last = win.records[win.records.length - 1];
      if (!last || target <= last.t) continue;
      const following = windows.find((w) => w.firstOffset === win.nextOffset);
      const next = following?.records[0];
      if (next && target < next.t) return { win, record: last };
    }
    return null;
  }

  function touch(win: LoadedWindow): void {
    // Playback touches the window it is reading from on every frame.
    if (windows[0] === win) return;
    windows =[win, ...windows.filter((w) => w !== win)].slice(0, lruSize);
  }

  /**
   * Read one byte range, and cache it as a window when `cache` is set.
   *
   * `start` is the byte the window should BEGIN at, which is not the byte
   * requested. A non-BOF range always has its first line discarded as a
   * partial, so a range beginning exactly on a record boundary would throw a
   * whole record away and that record would be unreachable. Backing up one
   * byte puts the preceding newline first, which makes the discarded fragment
   * provably empty - the invariant parseWindow documents.
   *
   * Offsets are taken from string positions, which equal byte positions
   * because the export is ASCII JSON.
   */
  async function readWindow(
    start: number,
    bytes: number,
    startEpoch: number,
    signal: AbortSignal,
    cache: boolean
  ): Promise<WindowRead | null> {
    if (!index || !fetcher) return null;
    const from = start <= 0 ? 0 : start - 1;
    const end = Math.min(index.size, from + bytes) - 1;
    const text = await fetcher.range(from, end, signal);
    // A dispose (or a fresh load) happened while this range was in flight,
    // or a newer seek no longer needs it. `index`/`fetcher` may already be
    // null, so bail before touching them.
    if (startEpoch !== epoch || !index || signal.aborted) return null;
    const endsAtEof = end === index.size - 1;
    const parsed = parseWindowAt(text, { startsAtBof: from === 0, endsAtEof });
    const first = parsed.records[0];
    const last = parsed.records[parsed.records.length - 1];
    const firstAt = parsed.offsets[0];
    const lastAt = parsed.offsets[parsed.offsets.length - 1];
    if (!first || !last || firstAt === undefined || lastAt === undefined) {
      return null;
    }

    const firstOffset = from + firstAt;
    const lastOffset = from + lastAt;
    // Feed the true offsets back so the next estimate in this region is better.
    insertEntry(index, { offset: firstOffset, frameCount: first.frameCount, t: first.t });
    insertEntry(index, { offset: lastOffset, frameCount: last.frameCount, t: last.t });

    const win: LoadedWindow = {
      firstOffset,
      nextOffset: endsAtEof ? index.size : from + parsed.next,
      records: parsed.records,
    };
    if (cache) {
      touch(win);
      // A window that arrives after its frame was shown may hold the history
      // that frame's phase was missing.
      if (shown) setPhase(phaseFor(shown));
    }
    return { from, end, first, last, firstOffset, lastOffset, win };
  }

  /**
   * Find the record for a time with probe-sized reads, without caching them.
   *
   * Byte bounds proven to bracket the target narrow with every read that does
   * not hold it: its record starts at or after `lo` and before `hi`.
   *
   * Each round sends one probe aimed by interpolation and the rest splitting
   * the bounds evenly, all at once. Interpolation is what makes most seeks a
   * single round: every read feeds the positions of its first and last records
   * back into the index, so estimates get sharper wherever the user has been.
   * It cannot be relied on alone, though. Time per byte is nowhere near
   * uniform across a real export - on a 918 MB one, equal 102 MB spans covered
   * anywhere between 576 and 1598 seconds - and an estimate made across such a
   * step can creep towards the target a probe at a time. The even split is
   * what bounds the worst case.
   */
  async function locate(
    target: number,
    startEpoch: number,
    signal: AbortSignal
  ): Promise<{ record: ReplayRecord; read: WindowRead } | null> {
    if (!index) return null;
    const probeBytes = Math.max(SEEK_PROBE_BYTES, index.meanRecordBytes * 2);
    let lo = 0;
    let hi = index.size;

    for (let round = 0; round < MAX_SEEK_ROUNDS; round++) {
      const span = hi - lo;
      // Once the bounds are within a probe of each other, one read from `lo`
      // must hold the target. It is given a probe's worth of slack beyond
      // them, so a record straddling the far bound is read whole rather than
      // discarded as a trailing partial.
      const closing = span <= probeBytes;
      const starts: number[] = [];
      if (closing) {
        starts.push(lo);
      } else {
        // Centred on the estimate. That also keeps the very end reachable:
        // `index.last.offset` is the FILE SIZE, not the last record's start
        // byte (see the note on JsonlIndex.last), so the estimate for the
        // final record is one past it, and a read centred there still ends
        // at EOF and therefore still contains it.
        const estimate = estimateOffset(index, target) - Math.round(probeBytes / 2);
        starts.push(Math.min(hi - 1, Math.max(lo, estimate)));
        // A time the index holds an entry for is no estimate at all - the
        // first frame of a load always is one - so splitting the bounds
        // around it would only spend reads.
        const known = index.entries.some((e) => e.t === target);
        for (let i = 1; i < SEEK_PROBES_PER_ROUND && !known; i++) {
          const at = lo + Math.floor((span * i) / SEEK_PROBES_PER_ROUND);
          // A probe overlapping one already planned would only read the same
          // records twice.
          if (starts.every((s) => Math.abs(s - at) >= probeBytes)) starts.push(at);
        }
      }

      const reads = await Promise.all(
        starts.map((at) =>
          readWindow(at, closing ? span + probeBytes : probeBytes, startEpoch, signal, false)
        )
      );

      const before = [lo, hi];
      for (const [i, read] of reads.entries()) {
        const at = starts[i];
        if (!read || at === undefined) {
          // Torn down or superseded, rather than a read that found nothing.
          if (startEpoch !== epoch || signal.aborted) return null;
          continue;
        }
        const hit = findIn(read.win, target);
        if (hit) return { record: hit, read };

        if (target < read.first.t) {
          // Nothing earlier exists to look at, so the file's first record is
          // the closest thing to the target there is.
          if (read.from === 0) return { record: read.first, read };
          // Every record starting at or after `at` begins at or after this
          // read's first whole record, and that record is already past the
          // target - so the one being looked for starts before `at`.
          hi = Math.min(hi, at);
        } else {
          if (read.end >= index.size - 1) return { record: read.last, read };
          // The target is at or after this read's last record, which may
          // still turn out to be the record itself once the one after it is
          // read.
          lo = Math.max(lo, read.lastOffset);
        }
      }
      // A round that moved neither bound would be made again, identically, on
      // every remaining attempt. It takes a record longer than a probe for
      // that to happen, which is not a shape this format produces - but
      // repeating reads until the budget runs out is an expensive way to
      // fail, so stop instead.
      if (lo === before[0] && hi === before[1]) return null;
    }
    return null;
  }

  /**
   * Make the window around a time resident: find its record, hand it to
   * `onLocated` as soon as it is found, then read the window that starts
   * there so playback can carry on from it.
   *
   * Replaces whatever foreground read was in flight, aborting it.
   */
  function bring(
    target: number,
    startEpoch: number,
    onLocated?: (record: ReplayRecord) => void
  ): Foreground {
    foreground?.controller.abort();
    const controller = new AbortController();
    const fg: Foreground = { controller, fillFrom: null, promise: Promise.resolve() };
    fg.promise = (async () => {
      if (index && !index.acceptsRanges) {
        // The only read a server without range support can answer is the
        // whole object. buildIndex has already refused one too large for
        // that, and once it is cached it holds every frame there is, so no
        // other window is ever read to evict it.
        const whole = await readWindow(0, index.size, startEpoch, controller.signal, true);
        if (!whole || controller.signal.aborted || startEpoch !== epoch) return;
        onLocated?.(
          findIn(whole.win, target) ??
            (target < whole.first.t ? whole.first : whole.last)
        );
        return;
      }
      const found = await locate(target, startEpoch, controller.signal);
      if (!found || controller.signal.aborted || startEpoch !== epoch) return;
      onLocated?.(found.record);
      fg.fillFrom = found.read.first.t;
      // Started far enough back to hold the lookback the team phase reads, so
      // a frame reached by a seek has the same history as one reached by
      // playing into it. The mean record size is the largest sampled, which
      // keeps this on the generous side.
      const lookback = index
        ? Math.round(fps.value * index.meanRecordBytes * (PHASE_LOOKBACK_S + 1))
        : 0;
      const fillFrom = Math.max(0, found.read.firstOffset - lookback);
      await readWindow(
        fillFrom,
        windowBytes() + (found.read.firstOffset - fillFrom),
        startEpoch,
        controller.signal,
        true
      );
    })().finally(() => {
      if (foreground === fg) foreground = null;
    });
    foreground = fg;
    return fg;
  }

  /** The cached records up to PHASE_LOOKBACK_S before this one, then its phase. */
  function phaseFor(record: ReplayRecord): TeamPhase {
    const from = record.t - PHASE_LOOKBACK_S;
    const byFrame = new Map<number, ReplayRecord>([[record.frameCount, record]]);
    for (const win of windows) {
      for (const r of win.records) {
        if (r.t >= from && r.t <= record.t) byFrame.set(r.frameCount, r);
      }
    }
    const recent = [...byFrame.values()].sort((a, b) => a.t - b.t);
    // By frame number: a cached window holds its own copy of the record shown.
    return teamPhaseAt(
      recent,
      recent.findIndex((r) => r.frameCount === record.frameCount)
    );
  }

  /**
   * Replace the phase only when it says something new. It is worked out for
   * every record but holds for seconds at a time, and every replacement
   * re-renders and repaints whatever shows it.
   */
  function setPhase(next: TeamPhase): void {
    if (!phase.value || !samePhase(phase.value, next)) phase.value = next;
  }

  function show(record: ReplayRecord): void {
    // The clock ticks at display rate, faster than records arrive, so most
    // ticks show the record already on screen: nothing about it has changed.
    // When the history behind it does, readWindow works the phase out again.
    if (record === shown) return;
    shown = record;
    frame.value = record.frame;
    currentFrame.value = record.frameCount;
    setPhase(phaseFor(record));
  }

  function fail(err: unknown): void {
    error.value = err instanceof Error ? err.message : String(err);
    state.value = 'error';
    awaitingFrame.value = false;
    pause();
  }

  /**
   * Pull the next window in while the playing one still has room.
   *
   * Fire and forget: playback must not wait on it. One at a time, because
   * every rAF tick asks and a boundary is many ticks wide. It reads on from
   * the exact byte the playing window ends at rather than estimating where
   * the next stretch of time starts, so nothing already cached is downloaded
   * again.
   */
  function maybePrefetch(current: LoadedWindow): void {
    if (prefetching || foreground || !index) return;
    const lastT = current.records[current.records.length - 1]?.t;
    if (lastT === undefined) return;
    if (abs(currentTime.value) < lastT - PREFETCH_SECONDS) return;
    const from = current.nextOffset;
    if (from >= index.size) return;
    if (windows.some((w) => w.firstOffset <= from && from < w.nextOffset)) return;

    const controller = new AbortController();
    prefetchController = controller;
    prefetching = readWindow(from, windowBytes(), epoch, controller.signal, true)
      .catch(() => null)
      .finally(() => {
        prefetching = null;
      });
  }

  /** Resolves once every read in flight has settled. For tests. */
  async function whenIdle(): Promise<void> {
    while (prefetching || foreground) {
      await Promise.allSettled([prefetching, foreground?.promise]);
    }
  }

  function abortReads(): void {
    foreground?.controller.abort();
    foreground = null;
    prefetchController?.abort();
    prefetchController = null;
  }

  async function load(): Promise<void> {
    state.value = 'loading';
    error.value = null;
    const startEpoch = ++epoch;
    abortReads();
    try {
      const openedFetcher = await opts.openFetcher();
      // Capture into a local and check BEFORE assigning. A stale load whose
      // continuation resolves after a newer one would otherwise clobber the
      // live fetcher, and readWindow's guard tests `fetcher` for truthiness,
      // not identity, so it could never notice.
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
      const seq = ++seekSeq;
      // Ready as soon as the first frame is found, not once the window around
      // it has arrived: the spinner has nothing left to wait for by then.
      await bring(index.first.t, startEpoch, (record) => {
        if (seq === seekSeq) show(record);
        state.value = 'ready';
      }).promise;
      if (startEpoch !== epoch) return;
      if (state.value === 'loading') state.value = 'ready';
    } catch (err) {
      if (startEpoch !== epoch) return;
      // A seek made once the first frame was up replaced the rest of the load.
      if (isAbort(err) && state.value === 'ready') return;
      fail(err);
    }
  }

  async function seek(t: number): Promise<void> {
    if (state.value !== 'ready' || !index) return;
    const startEpoch = epoch;
    const seq = ++seekSeq;
    const clamped = Math.min(Math.max(0, t), duration.value);
    currentTime.value = clamped;
    const target = abs(clamped);
    const current = () => startEpoch === epoch && seq === seekSeq;

    const cached = findCached(target);
    if (cached) {
      touch(cached.win);
      show(cached.record);
      awaitingFrame.value = false;
      return;
    }

    awaitingFrame.value = true;
    try {
      // Stepping a frame or two on from a seek whose window is still arriving
      // lands inside that window. Waiting for it beats aborting it only to
      // read the same bytes again. Half a window of margin, because the time
      // a window spans is only known once it is read.
      const pending = foreground;
      if (
        pending?.fillFrom != null &&
        target >= pending.fillFrom &&
        target <= pending.fillFrom + windowSeconds / 2
      ) {
        await pending.promise;
        if (!current()) return;
        const hit = findCached(target);
        if (hit) {
          touch(hit.win);
          show(hit.record);
          return;
        }
      }
      if (!current()) return;
      await bring(target, startEpoch, (record) => {
        if (!current()) return;
        show(record);
        awaitingFrame.value = false;
      }).promise;
    } catch (err) {
      // An abort means a newer seek took over, and it owns the screen now.
      if (startEpoch !== epoch || isAbort(err)) return;
      fail(err);
    } finally {
      if (current()) awaitingFrame.value = false;
    }
  }

  /**
   * Advance playback by one animation frame.
   *
   * Reads only from the cache. When the record for the next position is not
   * loaded yet, the clock holds where it is rather than running on ahead of a
   * frame that has not been drawn, and at most one read is started to fetch
   * it. Everything a tick would otherwise kick off - a fresh read per frame
   * for as long as one is in flight - is exactly what used to turn a single
   * seek during playback into hundreds of window downloads.
   */
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

    const target = abs(next);
    const hit = findCached(target);
    if (hit) {
      held.value = false;
      awaitingFrame.value = false;
      currentTime.value = next;
      seekSeq++;
      touch(hit.win);
      show(hit.record);
      maybePrefetch(hit.win);
    } else {
      held.value = true;
      // Whatever is already on its way - a seek's window or a prefetch - is
      // the most likely thing to hold this record, so wait for it first.
      if (!foreground && !prefetching) {
        const startEpoch = epoch;
        bring(target, startEpoch)
          .promise.then(() => {
            // A read that settled without bringing the record in would be
            // made again on the very next frame, and on every one after it.
            if (startEpoch === epoch && isPlaying.value && !findCached(target)) {
              pause();
            }
          })
          .catch((err) => {
            if (startEpoch !== epoch || isAbort(err)) return;
            fail(err);
          });
      }
    }
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
    held.value = false;
    lastTickMs = null;
    if (rafHandle !== null) {
      caf(rafHandle);
      rafHandle = null;
    }
  }

  function dispose(): void {
    pause();
    // Invalidate every in-flight read, so nothing resolves into a torn-down
    // replay, and cancel them so they stop downloading.
    epoch++;
    abortReads();
    windows = [];
    index = null;
    fetcher = null;
    shown = null;
    phase.value = null;
    awaitingFrame.value = false;
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
    buffering,
    phase,
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
