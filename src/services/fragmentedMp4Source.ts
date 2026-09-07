/**
 * Streams a fragmented MP4 into a `<video>` through Media Source Extensions,
 * fetching fragments by byte range as playback needs them.
 *
 * See utils/fragmentedMp4.ts for why: Chrome's `<video src>` demuxer walks
 * every fragment of the file before it paints anything, which on the
 * pipeline's multi-gigabyte outputs is minutes. Through MSE the same file
 * paints after the init segment, the `mfra` index and one fragment.
 *
 * `openFragmentedMp4` probes the URL and returns null whenever the object is
 * not something this can play - not a fragmented MP4, no `mfra`, unsupported
 * codec, no MSE - and the caller assigns `video.src` as before. Nothing about
 * the fallback path changes.
 *
 * Presigned URLs expire mid-session (900 s on S3, against two-hour videos).
 * A 401/403 on any fetch asks `refreshUrl` for a replacement and retries in
 * place: the element, its buffer and the playhead are untouched.
 */
import {
  buildFragmentIndex,
  findFragment,
  fragmentDuration,
  mfraSizeFromMfro,
  parseInitSegment,
  parseMfra,
  sameObject,
  type FragmentIndexEntry,
} from '@/utils/fragmentedMp4';

/** Returns a fresh URL for the same object as `staleUrl`, or null to give up. */
export type RefreshVideoUrl = (staleUrl: string) => Promise<string | null>;

export interface FragmentedMp4SourceOptions {
  refreshUrl?: RefreshVideoUrl | undefined;
  /** Fatal failure after the source is attached; the caller shows its error state. */
  onError?: ((error: Error) => void) | undefined;
  /** Fragments to keep buffered ahead of the playhead. */
  lookahead?: number | undefined;
  /** Seconds of buffer to keep behind the playhead before trimming. */
  backBuffer?: number | undefined;
}

export interface FragmentedMp4Source {
  readonly url: string;
  /** False once a fatal error or `destroy()` has retired this source. */
  readonly alive: boolean;
  readonly duration: number;
  readonly fragmentCount: number;
  /** Swap credentials for the same object; see `sameObject`. */
  setUrl(url: string): void;
  /**
   * Point the element at this source and start streaming. Separate from
   * `openFragmentedMp4` so a caller whose URL changed during the probe can
   * discard the result without it ever touching the element.
   */
  attach(): void;
  destroy(): void;
}

/** Bytes fetched to find the init segment, and to read a `moof` header. */
const PROBE_BYTES = 65536;
/** Slack when matching fragment bounds against `SourceBuffer.buffered`. */
const RANGE_TOLERANCE = 0.15;
const DEFAULT_LOOKAHEAD = 3;
const DEFAULT_BACK_BUFFER = 60;
/** Appends of the same fragment before it is written off as unbufferable. */
const MAX_APPENDS_PER_FRAGMENT = 3;

export class RangeRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Range request failed with HTTP ${status}`);
    this.name = 'RangeRequestError';
  }
}

/** One object's URL plus the single-flight refresh that replaces it on 401/403. */
export class RangeClient {
  private renewing: Promise<boolean> | null = null;

  constructor(
    public url: string,
    private readonly refreshUrl: RefreshVideoUrl | undefined
  ) {}

  async fetch(
    start: number,
    end: number,
    signal?: AbortSignal
  ): Promise<{ data: ArrayBuffer; total: number }> {
    for (let attempt = 0; ; attempt++) {
      const init: RequestInit = { headers: { Range: `bytes=${start}-${end}` }, cache: 'no-store' };
      if (signal) init.signal = signal;
      const res = await fetch(this.url, init);
      if (res.status === 206) {
        const total = Number(res.headers.get('Content-Range')?.split('/')[1] ?? NaN);
        return { data: await res.arrayBuffer(), total };
      }
      // Do not pull a 200 of the whole object through the pipe.
      await res.body?.cancel().catch(() => undefined);
      const rejected = res.status === 401 || res.status === 403;
      if (rejected && attempt === 0 && (await this.renew())) continue;
      throw new RangeRequestError(res.status);
    }
  }

  private renew(): Promise<boolean> {
    if (!this.refreshUrl) return Promise.resolve(false);
    if (!this.renewing) {
      const stale = this.url;
      this.renewing = this.refreshUrl(stale)
        .then((fresh) => {
          if (!fresh || !sameObject(fresh, stale)) return false;
          this.url = fresh;
          return true;
        })
        .catch(() => false)
        .finally(() => {
          this.renewing = null;
        });
    }
    return this.renewing;
  }
}

/**
 * Probe `url` and, if it is a fragmented MP4 with an `mfra` index that MSE
 * can play here, return a source ready to `attach()` to `video`. Resolves
 * null when the caller should fall back to `video.src = url`.
 */
export async function openFragmentedMp4(
  video: HTMLVideoElement,
  url: string,
  options: FragmentedMp4SourceOptions = {}
): Promise<FragmentedMp4Source | null> {
  if (typeof MediaSource === 'undefined' || !/^https?:/i.test(url)) return null;
  const client = new RangeClient(url, options.refreshUrl);

  let head: { data: ArrayBuffer; total: number };
  try {
    head = await client.fetch(0, PROBE_BYTES - 1);
  } catch {
    // No ranges, unreachable, or rejected and unrefreshable: the native path
    // will surface whatever the real error is.
    return null;
  }
  if (!Number.isFinite(head.total) || head.total <= PROBE_BYTES) return null;

  const init = parseInitSegment(head.data);
  if (!init) return null;
  const mime = `video/mp4; codecs="${init.codec}"`;
  if (!MediaSource.isTypeSupported(mime)) return null;

  let index: FragmentIndexEntry[];
  try {
    const tail = await client.fetch(head.total - 16, head.total - 1);
    const mfraSize = mfraSizeFromMfro(tail.data);
    if (mfraSize === null || mfraSize > head.total) return null;
    const mfraStart = head.total - mfraSize;
    const mfra = await client.fetch(mfraStart, head.total - 1);
    index = buildFragmentIndex(parseMfra(mfra.data, init.timescale), mfraStart);
  } catch {
    return null;
  }
  if (index.length === 0) return null;

  // The index gives every fragment's start; only the last one's length is
  // unknown. Read its moof for the exact figure so the timeline ends where
  // the video does, and settle for an estimate if that read fails.
  const last = index[index.length - 1] as FragmentIndexEntry;
  const prev = index[index.length - 2];
  let duration = last.time + (prev ? last.time - prev.time : 10);
  try {
    let moof = (await client.fetch(last.start, Math.min(last.start + PROBE_BYTES - 1, last.end))).data;
    const moofSize = new DataView(moof).getUint32(0);
    if (moofSize > moof.byteLength && last.start + moofSize - 1 <= last.end) {
      moof = (await client.fetch(last.start, last.start + moofSize - 1)).data;
    }
    const lastDuration = fragmentDuration(moof, init.defaultSampleDuration, init.timescale);
    if (lastDuration !== null) duration = last.time + lastDuration;
  } catch {
    // keep the estimate
  }

  return new Source(video, client, head.data.slice(0, init.initLength), mime, index, duration, options);
}

class Source implements FragmentedMp4Source {
  alive = true;
  private readonly mediaSource = new MediaSource();
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl = '';
  private readonly lookahead: number;
  private readonly backBuffer: number;
  /** Bumped on seek and destroy; a pump loop from an older generation stops. */
  private generation = 0;
  private abort = new AbortController();
  private pumping = false;
  private readonly appends = new Map<number, number>();
  private readonly listeners: Array<[EventTarget, string, EventListener]> = [];

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly client: RangeClient,
    private readonly init: ArrayBuffer,
    private readonly mime: string,
    private readonly index: FragmentIndexEntry[],
    public duration: number,
    private readonly options: FragmentedMp4SourceOptions
  ) {
    this.lookahead = options.lookahead ?? DEFAULT_LOOKAHEAD;
    this.backBuffer = options.backBuffer ?? DEFAULT_BACK_BUFFER;
  }

  get url(): string {
    return this.client.url;
  }

  get fragmentCount(): number {
    return this.index.length;
  }

  setUrl(url: string): void {
    this.client.url = url;
  }

  attach(): void {
    this.on(this.mediaSource, 'sourceopen', () => void this.onSourceOpen());
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    this.video.src = this.objectUrl;
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.generation++;
    this.abort.abort();
    for (const [target, type, fn] of this.listeners) target.removeEventListener(type, fn);
    this.listeners.length = 0;
    try {
      if (this.sourceBuffer?.updating && this.mediaSource.readyState === 'open') {
        this.sourceBuffer.abort();
      }
    } catch {
      // already detached
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }

  private on(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private async onSourceOpen(): Promise<void> {
    if (!this.alive) return;
    try {
      const sb = this.mediaSource.addSourceBuffer(this.mime);
      sb.mode = 'segments';
      this.sourceBuffer = sb;
      await this.append(this.init);
      this.mediaSource.duration = this.duration;
      this.on(this.video, 'seeking', () => this.onSeeking());
      this.on(this.video, 'timeupdate', () => void this.pump());
      this.on(this.video, 'waiting', () => void this.pump());
      void this.pump();
    } catch (e) {
      this.fail(e);
    }
  }

  private onSeeking(): void {
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    try {
      if (this.sourceBuffer?.updating && this.mediaSource.readyState === 'open') {
        this.sourceBuffer.abort();
      }
    } catch {
      // nothing in flight
    }
    void this.pump();
  }

  /**
   * Keep `lookahead` fragments buffered past the playhead. One loop runs at a
   * time; a seek retires it (via `generation`) and starts a fresh one from
   * the new position.
   */
  private async pump(): Promise<void> {
    if (!this.alive || this.pumping || !this.sourceBuffer) return;
    this.pumping = true;
    const generation = this.generation;
    try {
      while (this.alive && generation === this.generation) {
        const i = this.nextFragment();
        if (i < 0) break;
        const fragment = this.index[i] as FragmentIndexEntry;
        const { data } = await this.client.fetch(fragment.start, fragment.end, this.abort.signal);
        if (!this.alive || generation !== this.generation) break;
        await this.appendFragment(i, data);
      }
      if (this.alive && generation === this.generation) this.maybeEndOfStream();
    } catch (e) {
      if (this.alive && generation === this.generation) this.fail(e);
    } finally {
      this.pumping = false;
      if (this.alive && generation !== this.generation) void this.pump();
    }
  }

  private nextFragment(): number {
    const current = findFragment(this.index, this.video.currentTime);
    const end = Math.min(current + this.lookahead, this.index.length);
    for (let i = current; i < end; i++) if (!this.isBuffered(i)) return i;
    return -1;
  }

  private fragmentBounds(i: number): [number, number] {
    const fragment = this.index[i] as FragmentIndexEntry;
    const next = this.index[i + 1];
    return [fragment.time, next ? next.time : this.duration];
  }

  private isBuffered(i: number): boolean {
    if ((this.appends.get(i) ?? 0) >= MAX_APPENDS_PER_FRAGMENT) return true;
    const sb = this.sourceBuffer;
    if (!sb) return false;
    const [from, to] = this.fragmentBounds(i);
    const start = from + RANGE_TOLERANCE;
    const end = to - RANGE_TOLERANCE;
    if (end <= start) return true;
    const ranges = sb.buffered;
    for (let k = 0; k < ranges.length; k++) {
      if (ranges.start(k) <= start && ranges.end(k) >= end) return true;
    }
    return false;
  }

  private async appendFragment(i: number, data: ArrayBuffer): Promise<void> {
    this.appends.set(i, (this.appends.get(i) ?? 0) + 1);
    await this.trimBackBuffer();
    for (let attempt = 0; ; attempt++) {
      try {
        await this.append(data);
        break;
      } catch (e) {
        const quota = e instanceof DOMException && e.name === 'QuotaExceededError';
        if (!quota || attempt >= 2) throw e;
        await this.evict(attempt);
      }
    }
    if (i === this.index.length - 1) this.settleDuration();
  }

  /**
   * If the last fragment's estimated length overshot, the buffer now says
   * where the video really ends. Pull the timeline in to match, otherwise
   * that fragment would never count as buffered.
   */
  private settleDuration(): void {
    const sb = this.sourceBuffer;
    if (!sb) return;
    const last = this.index[this.index.length - 1] as FragmentIndexEntry;
    const ranges = sb.buffered;
    for (let k = 0; k < ranges.length; k++) {
      if (ranges.start(k) <= last.time + RANGE_TOLERANCE && ranges.end(k) >= last.time) {
        const end = ranges.end(k);
        if (end < this.duration - RANGE_TOLERANCE) {
          this.duration = end;
          if (this.mediaSource.readyState === 'open') this.mediaSource.duration = end;
        }
        return;
      }
    }
  }

  /** Signal the end once the playhead is inside a fully buffered last fragment. */
  private maybeEndOfStream(): void {
    const lastIndex = this.index.length - 1;
    if (
      this.mediaSource.readyState === 'open' &&
      !this.sourceBuffer?.updating &&
      findFragment(this.index, this.video.currentTime) === lastIndex &&
      this.isBuffered(lastIndex)
    ) {
      // A later append past this point reopens the MediaSource by itself.
      this.mediaSource.endOfStream();
    }
  }

  private async trimBackBuffer(): Promise<void> {
    const sb = this.sourceBuffer;
    if (!sb || sb.buffered.length === 0) return;
    const keepFrom = this.video.currentTime - this.backBuffer;
    if (sb.buffered.start(0) < keepFrom - 1) await this.remove(0, keepFrom);
  }

  private async evict(attempt: number): Promise<void> {
    const t = this.video.currentTime;
    await this.remove(0, Math.max(0, t - 10));
    if (attempt >= 1) {
      const current = findFragment(this.index, t);
      const ahead = this.index[Math.min(current + this.lookahead, this.index.length - 1)];
      if (ahead && ahead.time > t) await this.remove(ahead.time, Number.POSITIVE_INFINITY);
    }
  }

  private async remove(start: number, end: number): Promise<void> {
    const sb = this.sourceBuffer;
    if (!sb || end <= start || this.mediaSource.readyState !== 'open') return;
    sb.remove(start, end);
    await this.updateEnd(sb);
  }

  private async append(data: ArrayBuffer): Promise<void> {
    const sb = this.sourceBuffer;
    if (!sb) throw new Error('SourceBuffer is not attached');
    sb.appendBuffer(data);
    await this.updateEnd(sb);
  }

  private updateEnd(sb: SourceBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = () => {
        sb.removeEventListener('updateend', done);
        sb.removeEventListener('error', failed);
        resolve();
      };
      const failed = () => {
        sb.removeEventListener('updateend', done);
        sb.removeEventListener('error', failed);
        reject(new Error('SourceBuffer append failed'));
      };
      sb.addEventListener('updateend', done);
      sb.addEventListener('error', failed);
    });
  }

  private fail(e: unknown): void {
    if (!this.alive) return;
    const error = e instanceof Error ? e : new Error(String(e));
    this.destroy();
    this.options.onError?.(error);
  }
}
