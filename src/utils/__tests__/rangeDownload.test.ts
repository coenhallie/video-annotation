import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  download,
  withRetries,
  RESPONSE_TIMEOUT_MS,
  STALL_MS,
  TransientDownloadError,
} from '../rangeDownload';

const URL_ = 'https://bucket.example/object';

/** A fetch that answers `make()`, or never answers, and honours its signal. */
function fetchAnswering(make: (() => Response) | null) {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new DOMException('aborted', 'AbortError')));
      if (make) resolve(make());
    });
  });
}

/** A body that sends `chunks`, one per `everyMs`, then ends, or hangs when `hang`. */
function slowBody(chunks: number[][], everyMs: number, hang = false) {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      return new Promise<void>((resolve) => {
        if (i >= chunks.length) {
          if (!hang) controller.close();
          if (!hang) resolve();
          return;
        }
        setTimeout(() => {
          controller.enqueue(Uint8Array.from(chunks[i++] as number[]));
          resolve();
        }, everyMs);
      });
    },
  });
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});

describe('download', () => {
  it('reads the body for a status it keeps', async () => {
    globalThis.fetch = fetchAnswering(() => new Response(Uint8Array.from([1, 2, 3]), { status: 206 })) as unknown as typeof fetch;
    const got = await download(URL_, {}, (s) => s === 206);
    expect(got.status).toBe(206);
    expect([...new Uint8Array(got.data as ArrayBuffer)]).toEqual([1, 2, 3]);
  });

  it('leaves the body unread for a status it does not keep', async () => {
    globalThis.fetch = fetchAnswering(() => new Response('whole object', { status: 200 })) as unknown as typeof fetch;
    const got = await download(URL_, {}, (s) => s === 206);
    expect(got).toMatchObject({ status: 200, data: null });
  });

  it('gives up on a request that gets no answer for RESPONSE_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    globalThis.fetch = fetchAnswering(null) as unknown as typeof fetch;
    const caught = download(URL_, {}, () => true).catch((e) => e);
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 1);
    expect(await caught).toBeInstanceOf(TransientDownloadError);
  });

  // S3 speaks HTTP/1.1, so a request can wait for one of the browser's six
  // connections to the bucket behind long downloads before it is even sent.
  it('waits for an answer longer than it waits on a stalled body', async () => {
    vi.useFakeTimers();
    let answer!: (r: Response) => void;
    globalThis.fetch = vi.fn(
      () => new Promise<Response>((resolve) => (answer = resolve))
    ) as unknown as typeof fetch;
    const got = download(URL_, {}, () => true);
    await vi.advanceTimersByTimeAsync(STALL_MS * 2);
    answer(new Response(Uint8Array.from([4]), { status: 206 }));
    const done = await got;
    expect([...new Uint8Array(done.data as ArrayBuffer)]).toEqual([4]);
  });

  it('gives up on a download that stops arriving mid-body', async () => {
    vi.useFakeTimers();
    globalThis.fetch = fetchAnswering(
      () => new Response(slowBody([[1], [2]], 100, true), { status: 206 })
    ) as unknown as typeof fetch;
    const caught = download(URL_, {}, () => true).catch((e) => e);
    await vi.advanceTimersByTimeAsync(STALL_MS + 500);
    expect(await caught).toBeInstanceOf(TransientDownloadError);
  });

  // A slow connection is not a stalled one: a window can take most of a minute.
  it('never cuts off a slow download that keeps receiving bytes', async () => {
    vi.useFakeTimers();
    const chunks = Array.from({ length: 6 }, (_, i) => [i]);
    globalThis.fetch = fetchAnswering(
      () => new Response(slowBody(chunks, STALL_MS - 1000), { status: 206 })
    ) as unknown as typeof fetch;
    const got = download(URL_, {}, () => true);
    await vi.advanceTimersByTimeAsync(6 * STALL_MS);
    const done = await got;
    expect([...new Uint8Array(done.data as ArrayBuffer)]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('passes the caller’s abort on as it is, not as a failure to retry', async () => {
    globalThis.fetch = fetchAnswering(null) as unknown as typeof fetch;
    const controller = new AbortController();
    const caught = download(URL_, { signal: controller.signal }, () => true).catch((e) => e);
    controller.abort();
    const err = await caught;
    expect(err).not.toBeInstanceOf(TransientDownloadError);
    expect((err as Error).name).toBe('AbortError');
  });

  it('reports a network failure as one worth retrying', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(download(URL_, {}, () => true)).rejects.toBeInstanceOf(TransientDownloadError);
  });
});

describe('withRetries', () => {
  it('tries again after each delay while the failure is transient', async () => {
    let calls = 0;
    const got = await withRetries(
      async () => {
        if (++calls < 3) throw new TransientDownloadError('blip');
        return 'ok';
      },
      null,
      [0, 0, 0]
    );
    expect(got).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up once the delays run out', async () => {
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls++;
        throw new TransientDownloadError('down');
      }, null, [0, 0])
    ).rejects.toBeInstanceOf(TransientDownloadError);
    expect(calls).toBe(3);
  });

  it('does not retry anything else', async () => {
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls++;
        throw new Error('403');
      }, null, [0, 0])
    ).rejects.toThrow('403');
    expect(calls).toBe(1);
  });

  it('stops waiting to retry when the caller aborts', async () => {
    const controller = new AbortController();
    const caught = withRetries(
      async () => {
        throw new TransientDownloadError('blip');
      },
      controller.signal,
      [60_000]
    ).catch((e) => e);
    controller.abort();
    expect(((await caught) as Error).name).toBe('AbortError');
  });
});
