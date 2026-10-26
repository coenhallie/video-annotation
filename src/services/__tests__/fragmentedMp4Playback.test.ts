import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openFragmentedMp4, type FragmentedMp4Source } from '../fragmentedMp4Source';
import { fragmentedFile, type FixtureFragment } from '@/utils/__tests__/mp4Fixture';

/**
 * The streaming source played end to end against a fake Media Source: a
 * SourceBuffer that keeps the time ranges of the fragments it is handed, the
 * way a browser's does, and a video element whose playhead the test moves.
 *
 * The fake follows the parts of the MSE spec the source relies on: an append
 * or a seek on an ended MediaSource opens it again and fires `sourceopen`
 * again, and a second SourceBuffer cannot be added once one has media.
 */

type Range = [number, number];

class FakeTimeRanges {
  constructor(private readonly ranges: Range[]) {}
  get length() {
    return this.ranges.length;
  }
  start(i: number) {
    return (this.ranges[i] as Range)[0];
  }
  end(i: number) {
    return (this.ranges[i] as Range)[1];
  }
}

const EPS = 1e-6;

/** The fragment a moof belongs to: its mfhd sequence number (see mp4Fixture). */
function fragmentOf(data: ArrayBuffer): number | null {
  const view = new DataView(data);
  const type = String.fromCharCode(...new Uint8Array(data, 4, 4));
  return type === 'moof' ? view.getUint32(20) : null;
}

class FakeSourceBuffer extends EventTarget {
  mode = 'segments';
  updating = false;
  ranges: Range[] = [];
  appended: number[] = [];
  private pending: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ms: FakeMediaSource,
    private readonly fragments: FixtureFragment[]
  ) {
    super();
  }

  get buffered() {
    return new FakeTimeRanges(this.ranges.map((r) => [...r] as Range));
  }

  appendBuffer(data: ArrayBuffer) {
    if (this.updating) throw new DOMException('busy', 'InvalidStateError');
    this.ms.reopenIfEnded();
    this.updating = true;
    const id = fragmentOf(data);
    this.pending = setTimeout(() => {
      this.pending = null;
      if (id !== null) {
        const f = this.fragments[id] as FixtureFragment;
        this.add([f.time, f.time + f.duration]);
        this.appended.push(id);
      }
      this.updating = false;
      this.dispatchEvent(new Event('updateend'));
    }, 0);
  }

  abort() {
    if (!this.updating) return;
    if (this.pending) clearTimeout(this.pending);
    this.pending = null;
    this.updating = false;
    this.dispatchEvent(new Event('abort'));
    this.dispatchEvent(new Event('updateend'));
  }

  remove(start: number, end: number) {
    this.updating = true;
    setTimeout(() => {
      this.ranges = this.ranges.flatMap(([a, b]): Range[] => {
        if (b <= start || a >= end) return [[a, b]];
        const out: Range[] = [];
        if (a < start) out.push([a, start]);
        if (b > end) out.push([end, b]);
        return out;
      });
      this.updating = false;
      this.dispatchEvent(new Event('updateend'));
    }, 0);
  }

  private add([a, b]: Range) {
    const all = [...this.ranges, [a, b] as Range].sort((x, y) => x[0] - y[0]);
    const merged: Range[] = [];
    for (const r of all) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + EPS) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r] as Range);
    }
    this.ranges = merged;
  }
}

class FakeMediaSource extends EventTarget {
  static fragments: FixtureFragment[] = [];
  static instances: FakeMediaSource[] = [];
  static isTypeSupported() {
    return true;
  }
  readyState: 'closed' | 'open' | 'ended' = 'closed';
  duration = NaN;
  sourceBuffers: FakeSourceBuffer[] = [];
  ends = 0;

  constructor() {
    super();
    FakeMediaSource.instances.push(this);
  }

  addSourceBuffer() {
    if (this.sourceBuffers.some((sb) => sb.appended.length > 0 || sb.ranges.length > 0)) {
      throw new DOMException('cannot add a SourceBuffer now', 'QuotaExceededError');
    }
    const sb = new FakeSourceBuffer(this, FakeMediaSource.fragments);
    this.sourceBuffers.push(sb);
    return sb;
  }

  endOfStream() {
    if (this.readyState !== 'open') throw new DOMException('not open', 'InvalidStateError');
    this.readyState = 'ended';
    this.ends++;
  }

  open() {
    this.readyState = 'open';
    queueMicrotask(() => this.dispatchEvent(new Event('sourceopen')));
  }

  /** MSE: appending to, or seeking on, an ended MediaSource opens it again. */
  reopenIfEnded() {
    if (this.readyState === 'ended') this.open();
  }
}

const objectUrls = new Map<string, FakeMediaSource>();

class FakeVideo extends EventTarget {
  private time = 0;
  private srcUrl = '';
  private ms: FakeMediaSource | null = null;

  get src() {
    return this.srcUrl;
  }
  set src(url: string) {
    this.srcUrl = url;
    this.ms = objectUrls.get(url) ?? null;
    this.ms?.open();
  }
  get currentTime() {
    return this.time;
  }
  /** A seek, as the user makes one. */
  set currentTime(t: number) {
    this.time = t;
    this.ms?.reopenIfEnded();
    this.dispatchEvent(new Event('seeking'));
  }
  /** Playback moving the playhead on, as the element does between timeupdates. */
  playTo(t: number) {
    this.time = t;
    this.dispatchEvent(new Event('timeupdate'));
  }
}

const URL_ = 'https://bucket.s3.eu-west-2.amazonaws.com/x/streams/generated.mp4?X-Amz-Signature=1';

function serve(buffer: ArrayBuffer) {
  const total = buffer.byteLength;
  return vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const range = new Headers(init?.headers).get('Range') ?? '';
    const [a, b] = range.replace('bytes=', '').split('-').map(Number) as [number, number];
    const end = Math.min(b, total - 1);
    return new Response(buffer.slice(a, end + 1), {
      status: 206,
      headers: { 'Content-Range': `bytes ${a}-${end}/${total}` },
    });
  });
}

const realFetch = globalThis.fetch;
const realMediaSource = (globalThis as { MediaSource?: unknown }).MediaSource;
const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;

beforeEach(() => {
  FakeMediaSource.instances = [];
  objectUrls.clear();
  (globalThis as { MediaSource?: unknown }).MediaSource = FakeMediaSource;
  let n = 0;
  URL.createObjectURL = ((ms: FakeMediaSource) => {
    const url = `blob:fake-${++n}`;
    objectUrls.set(url, ms);
    return url;
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = () => {};
});

afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as { MediaSource?: unknown }).MediaSource = realMediaSource;
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
});

/** Let every fetch, append and event in flight run to the end. */
async function settle() {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
}

async function play(seconds: number[]) {
  const file = fragmentedFile(seconds);
  FakeMediaSource.fragments = file.fragments;
  globalThis.fetch = serve(file.buffer) as unknown as typeof globalThis.fetch;
  const video = new FakeVideo();
  const onError = vi.fn();
  const source = (await openFragmentedMp4(video as unknown as HTMLVideoElement, URL_, {
    onError,
  })) as FragmentedMp4Source;
  expect(source).not.toBeNull();
  source.attach();
  await settle();
  const ms = FakeMediaSource.instances[0] as FakeMediaSource;
  return { file, video, source, onError, ms, sb: () => ms.sourceBuffers[0] as FakeSourceBuffer };
}

/** Whether the buffer holds the whole of [from, to]. */
function holds(sb: FakeSourceBuffer, from: number, to: number) {
  return sb.ranges.some(([a, b]) => a <= from + EPS && b >= to - EPS);
}

describe('fragmented MP4 playback', () => {
  it('streams the fragments ahead of the playhead', async () => {
    const { sb, onError } = await play(new Array(20).fill(10));
    expect(holds(sb(), 0, 30)).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  // Reviewers jump back to the same moment again and again. Each time it has
  // been trimmed from behind the playhead in the meantime, so each time it is
  // fetched and appended again - as often as they go back.
  it('fetches a moment again however many times it is gone back to', async () => {
    const { video, sb, onError } = await play(new Array(80).fill(10));
    const spots = [100, 200, 100, 300, 100, 400, 100, 500, 100];
    for (const t of spots) {
      video.currentTime = t;
      await settle();
      expect(holds(sb(), t, t + 30)).toBe(true);
    }
    expect(onError).not.toHaveBeenCalled();
  });

  // The pipeline closes its stream mid-fragment, so the last one can be a
  // fraction of a second long: 0.08 s on the Manchester City vs PSG output.
  it('fetches a last fragment shorter than the buffer tolerance, and ends the stream', async () => {
    const { video, sb, ms, file, onError } = await play([10, 10, 10, 10, 0.08]);
    video.currentTime = 25;
    await settle();
    expect(holds(sb(), 25, file.duration)).toBe(true);
    // Playing on into the last fragment ends the stream, so the element can
    // finish rather than wait for more.
    video.playTo(file.duration - 0.01);
    await settle();
    expect(ms.readyState).toBe('ended');
    expect(onError).not.toHaveBeenCalled();
  });

  it('ends the stream once everything left to play is buffered', async () => {
    const { video, ms, file } = await play([10, 10, 10, 10, 0.08]);
    video.currentTime = 25;
    await settle();
    video.playTo(39.9);
    await settle();
    expect(ms.readyState).toBe('ended');
    expect(file.duration).toBeCloseTo(40.08, 6);
  });

  // An ended MediaSource opens again on a seek or an append, and fires
  // sourceopen again: that must not set the stream up a second time.
  it('plays on after seeking back from the end of the stream', async () => {
    const { video, sb, ms, onError } = await play([10, 10, 10, 10, 0.08]);
    video.currentTime = 25;
    await settle();
    video.playTo(40);
    await settle();
    expect(ms.readyState).toBe('ended');

    video.currentTime = 0;
    await settle();
    expect(onError).not.toHaveBeenCalled();
    expect(ms.sourceBuffers).toHaveLength(1);
    expect(holds(sb(), 0, 30)).toBe(true);
  });
});
