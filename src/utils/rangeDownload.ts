/**
 * Downloads for the two players that stream from S3: the video by fragment,
 * the replay by window. Both used to wait on a request for as long as it took,
 * and a connection that stopped delivering - a Wi-Fi hand-over, a laptop
 * waking, a VPN dropping - left the player waiting forever. And both gave up
 * on the first network error or 5xx, which stopped playback for something a
 * second attempt would have got through.
 *
 * So a request with no answer after RESPONSE_TIMEOUT_MS, or whose body stops
 * arriving for STALL_MS, is abandoned, and that, a network failure, or a 5xx
 * or 429 from S3 is tried again after each of RETRY_DELAYS_MS. A slow
 * download that keeps receiving bytes is never cut off: on a slow connection
 * a window takes most of a minute.
 */

/**
 * No answer for this long, and the request is abandoned. Generous, because
 * S3 speaks HTTP/1.1: the browser opens six connections to it, shared by both
 * players, and a request can wait its turn behind long downloads before it
 * is even sent.
 */
export const RESPONSE_TIMEOUT_MS = 60_000;
/** No bytes for this long part-way through a body, and it is abandoned as stalled. */
export const STALL_MS = 15_000;
/** Waits before each retry of a request that failed in passing. */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

/** A failure worth another attempt: no answer, a broken connection, or a 5xx/429. */
export class TransientDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientDownloadError';
  }
}

/** Whether a status is S3 failing in passing rather than refusing the request. */
export function transientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export interface Download {
  status: number;
  headers: Headers;
  /** The body, for a status `keep` accepted; null otherwise, without reading it. */
  data: ArrayBuffer | null;
}

/**
 * Fetch `url`, reading the body only for a status `keep` accepts. Rejects
 * with TransientDownloadError when the request fails or stalls, and with the
 * caller's own abort reason when `init.signal` aborts it.
 */
export async function download(
  url: string,
  init: RequestInit,
  keep: (status: number) => boolean,
  { responseMs = RESPONSE_TIMEOUT_MS, stallMs = STALL_MS } = {}
): Promise<Download> {
  const outer = init.signal ?? null;
  if (outer?.aborted) throw outer.reason;
  const controller = new AbortController();
  // Settles, rejected, the moment the request is stalled or the caller
  // aborts. Every wait below races it: aborting a fetch does not always
  // interrupt a read already waiting on the body.
  let interrupt!: (reason: unknown) => void;
  const interrupted = new Promise<never>((_, reject) => {
    interrupt = reject;
  });
  interrupted.catch(() => undefined);
  // The caller's abort is passed on as it is: the players tell a seek that
  // replaced a read from a real failure by its name.
  const onAbort = () => {
    controller.abort(outer?.reason);
    interrupt(outer?.reason);
  };
  outer?.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = (ms: number, what: string) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      controller.abort();
      interrupt(new TransientDownloadError(`Nothing for ${ms / 1000} s ${what}`));
    }, ms);
  };
  const failed = (e: unknown): unknown => {
    if (outer?.aborted) return outer.reason;
    if (e instanceof TransientDownloadError) return e;
    return new TransientDownloadError(e instanceof Error ? e.message : String(e));
  };

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    arm(responseMs, 'waiting for a response');
    let res: Response;
    try {
      res = await Promise.race([fetch(url, { ...init, signal: controller.signal }), interrupted]);
    } catch (e) {
      throw failed(e);
    }
    if (!keep(res.status)) {
      await res.body?.cancel().catch(() => undefined);
      return { status: res.status, headers: res.headers, data: null };
    }
    reader = res.body?.getReader();
    if (!reader) return { status: res.status, headers: res.headers, data: new ArrayBuffer(0) };
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      arm(stallMs, 'mid-download');
      let read: ReadableStreamReadResult<Uint8Array>;
      try {
        read = await Promise.race([reader.read(), interrupted]);
      } catch (e) {
        throw failed(e);
      }
      if (read.done) break;
      chunks.push(read.value);
      length += read.value.byteLength;
    }
    reader = undefined;
    const data = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      data.set(chunk, at);
      at += chunk.byteLength;
    }
    return { status: res.status, headers: res.headers, data: data.buffer };
  } finally {
    if (timer !== null) clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
    // Abandoned part-way: stop the body downloading.
    reader?.cancel().catch(() => undefined);
  }
}

/**
 * Run `attempt`, trying again after each of `delays` while it fails with a
 * TransientDownloadError. Anything else, an abort among them, ends it at once.
 */
export async function withRetries<T>(
  attempt: () => Promise<T>,
  signal?: AbortSignal | null,
  delays: readonly number[] = RETRY_DELAYS_MS
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (e) {
      const delay = delays[i];
      if (!(e instanceof TransientDownloadError) || delay === undefined) throw e;
      if (signal?.aborted) throw signal.reason;
      await wait(delay, signal);
    }
  }
}

function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
