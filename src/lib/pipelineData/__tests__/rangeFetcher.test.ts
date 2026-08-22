import { describe, it, expect, vi, afterEach } from 'vitest';
import { httpRangeFetcher } from '@/lib/pipelineData/rangeFetcher';

const URL = 'https://s3.example.com/presigned.jsonl?sig=1';

function mockFetch(status: number, body = '') {
  return vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => ({
    ok: status < 400,
    status,
    headers: { get: () => null },
    text: async () => body,
    // Expose what was sent so tests can assert on the Range header.
    __init: init,
  }));
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
    const f = mockFetch(500);
    vi.stubGlobal('fetch', f);
    const fetcher = httpRangeFetcher(URL, { size: 100, acceptsRanges: true });
    await expect(fetcher.range(0, 10)).rejects.toThrow(/request failed/i);
  });
});
