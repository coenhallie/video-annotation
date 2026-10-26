import { describe, it, expect, vi, afterEach } from 'vitest';
import { httpRangeFetcher, RENEW_AFTER_MS } from '@/lib/pipelineData/rangeFetcher';

const URL = 'https://s3.example.com/presigned.jsonl?sig=1';

function mockFetch(status: number, body = '') {
  return vi.fn(async (_url: string, _init?: { headers?: Record<string, string> }) =>
    new Response(body, { status })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('httpRangeFetcher', () => {
  it('head() returns the size and acceptsRanges it was constructed with, without a network call', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const fetcher = httpRangeFetcher(URL, { size: 1234, acceptsRanges: true });
    await expect(fetcher.head()).resolves.toEqual({ size: 1234, acceptsRanges: true });
    expect(f).not.toHaveBeenCalled();
  });

  it('sends a Range header and returns the body on a 206 when ranges are supported', async () => {
    const f = mockFetch(206, 'hello');
    vi.stubGlobal('fetch', f);
    const fetcher = httpRangeFetcher(URL, { size: 100, acceptsRanges: true });
    await expect(fetcher.range(10, 20)).resolves.toBe('hello');
    const init = f.mock.calls[0]?.[1] as { headers?: Record<string, string> };
    expect(init?.headers?.Range).toBe('bytes=10-20');
  });

  // A seek a newer one has replaced cancels its reads, so the request has to
  // carry the signal through to fetch() for the browser to stop downloading.
  it('cancels a request in flight when the abort signal fires', async () => {
    let sent: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            sent = init?.signal ?? undefined;
            sent?.addEventListener('abort', () => reject(sent?.reason));
          })
      )
    );
    const fetcher = httpRangeFetcher(URL, { size: 100, acceptsRanges: true });
    const controller = new AbortController();
    const read = fetcher.range(10, 20, controller.signal).catch((e) => e);
    await vi.waitFor(() => expect(sent).toBeDefined());
    controller.abort();
    expect(((await read) as Error).name).toBe('AbortError');
    expect(sent?.aborted).toBe(true);
  });

  it('rejects a 200 answer to a ranged request rather than treating it as the slice', async () => {
    const f = mockFetch(200, 'the whole object');
    vi.stubGlobal('fetch', f);
    const fetcher = httpRangeFetcher(URL, { size: 100, acceptsRanges: true });
    await expect(fetcher.range(10, 20)).rejects.toThrow(/ignored the range/i);
  });

  it('reads the whole object without a Range header when ranges are unsupported', async () => {
    const f = mockFetch(200, 'the whole object');
    vi.stubGlobal('fetch', f);
    const fetcher = httpRangeFetcher(URL, { size: 16, acceptsRanges: false });
    await expect(fetcher.range(0, 15)).resolves.toBe('the whole object');
    const init = f.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(init?.headers?.Range).toBeUndefined();
  });

  // Regression guard: without this check, a caller asking for a narrower
  // window than the full object would silently get the whole object back and
  // misread it as the requested slice - the exact corruption the 206-check
  // above prevents at the response end, here happening at the request end.
  it('rejects a narrower range when ranges are unsupported, without making a network call', async () => {
    const f = mockFetch(200, 'the whole object');
    vi.stubGlobal('fetch', f);
    const fetcher = httpRangeFetcher(URL, { size: 100, acceptsRanges: false });
    await expect(fetcher.range(10, 20)).rejects.toThrow(/does not support ranged reads/i);
    expect(f).not.toHaveBeenCalled();
  });

  it('throws when the underlying request fails', async () => {
    const f = mockFetch(404);
    vi.stubGlobal('fetch', f);
    const fetcher = httpRangeFetcher(URL, { size: 100, acceptsRanges: true });
    await expect(fetcher.range(0, 10)).rejects.toThrow(/request failed/i);
  });

  // The replay stays open for a whole match; S3 signs a URL for 900 s.
  describe('presigned URL renewal', () => {
    const FRESH = 'https://s3.example.com/presigned.jsonl?sig=2';

    function byUrl(replies: Record<string, number[]>) {
      const calls: string[] = [];
      const f = vi.fn(async (url: string) => {
        calls.push(url);
        const status = replies[url]?.shift() ?? 404;
        return new Response(status === 206 ? 'data' : '', { status });
      });
      vi.stubGlobal('fetch', f);
      return calls;
    }

    it('renews the URL when S3 refuses it, and reads the same range again', async () => {
      const calls = byUrl({ [URL]: [403], [FRESH]: [206] });
      const renewUrl = vi.fn(async () => FRESH);
      const fetcher = httpRangeFetcher(URL, { size: 100, acceptsRanges: true }, { renewUrl });
      await expect(fetcher.range(0, 10)).resolves.toBe('data');
      expect(calls).toEqual([URL, FRESH]);
      expect(renewUrl).toHaveBeenCalledTimes(1);
    });

    it('renews ahead of the expiry, without a refused read first', async () => {
      const calls = byUrl({ [URL]: [206], [FRESH]: [206] });
      let clock = 0;
      const fetcher = httpRangeFetcher(
        URL,
        { size: 100, acceptsRanges: true },
        { renewUrl: async () => FRESH, now: () => clock }
      );
      await fetcher.range(0, 10);
      clock = RENEW_AFTER_MS;
      await fetcher.range(0, 10);
      expect(calls).toEqual([URL, FRESH]);
    });

    it('shares one renewal between reads made together', async () => {
      byUrl({ [URL]: [403, 403], [FRESH]: [206, 206] });
      let release!: (url: string) => void;
      const renewUrl = vi.fn(() => new Promise<string>((r) => (release = r)));
      const fetcher = httpRangeFetcher(URL, { size: 100, acceptsRanges: true }, { renewUrl });
      const a = fetcher.range(0, 1);
      const b = fetcher.range(2, 3);
      await vi.waitFor(() => expect(renewUrl).toHaveBeenCalledTimes(1));
      release(FRESH);
      await expect(Promise.all([a, b])).resolves.toEqual(['data', 'data']);
      expect(renewUrl).toHaveBeenCalledTimes(1);
    });

    it('reports the refusal when no fresh URL can be had, or one for another object', async () => {
      for (const fresh of [null, 'https://elsewhere.example/other.jsonl?sig=1']) {
        byUrl({ [URL]: [403] });
        const fetcher = httpRangeFetcher(
          URL,
          { size: 100, acceptsRanges: true },
          { renewUrl: async () => fresh }
        );
        await expect(fetcher.range(0, 10)).rejects.toThrow('Pipeline data request failed (403)');
      }
    });
  });

  it('tries a 5xx again after a pause', async () => {
    vi.useFakeTimers();
    try {
      const statuses = [503, 206];
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          const status = statuses.shift() as number;
          return new Response(status === 206 ? 'data' : '', { status });
        })
      );
      const read = httpRangeFetcher(URL, { size: 100, acceptsRanges: true }).range(0, 10);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(read).resolves.toBe('data');
    } finally {
      vi.useRealTimers();
    }
  });
});

