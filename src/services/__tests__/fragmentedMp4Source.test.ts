import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RangeClient, RangeRequestError } from '../fragmentedMp4Source';

const OBJECT = 'https://bucket.s3.eu-west-2.amazonaws.com/storage/x/streams/generated.mp4';
const STALE = `${OBJECT}?X-Amz-Signature=stale`;
const FRESH = `${OBJECT}?X-Amz-Signature=fresh`;

type Reply = { status: number; total?: number; body?: number[] };

/** A fetch that answers by exact URL and records what it was asked. */
function fakeFetch(replies: Record<string, Reply | Reply[]>) {
  const calls: { url: string; range: string | undefined }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, range: headers.get('Range') ?? undefined });
    const queued = replies[url];
    const reply = Array.isArray(queued) ? queued.shift() : queued;
    if (!reply) throw new TypeError(`no reply for ${url}`);
    const body = Uint8Array.from(reply.body ?? []);
    const h: Record<string, string> = {};
    if (reply.status === 206) h['Content-Range'] = `bytes 0-${body.length - 1}/${reply.total ?? body.length}`;
    return new Response(body, { status: reply.status, headers: h });
  });
  return { fetch, calls };
}

describe('RangeClient', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('returns the bytes and the object size on 206', async () => {
    const { fetch, calls } = fakeFetch({ [STALE]: { status: 206, total: 5000, body: [1, 2, 3] } });
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    const client = new RangeClient(STALE, undefined);
    const { data, total } = await client.fetch(0, 2);
    expect([...new Uint8Array(data)]).toEqual([1, 2, 3]);
    expect(total).toBe(5000);
    expect(calls[0]?.range).toBe('bytes=0-2');
  });

  it('refreshes the URL once on 403 and retries the same range', async () => {
    const { fetch, calls } = fakeFetch({
      [STALE]: { status: 403 },
      [FRESH]: { status: 206, total: 5000, body: [9] },
    });
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    const refresh = vi.fn(async () => FRESH);
    const client = new RangeClient(STALE, refresh);
    const { data } = await client.fetch(10, 10);
    expect([...new Uint8Array(data)]).toEqual([9]);
    expect(refresh).toHaveBeenCalledWith(STALE);
    expect(calls.map((c) => c.url)).toEqual([STALE, FRESH]);
    expect(calls.every((c) => c.range === 'bytes=10-10')).toBe(true);
    expect(client.url).toBe(FRESH);
  });

  it('shares one refresh between concurrent 403s', async () => {
    const { fetch } = fakeFetch({
      [STALE]: [{ status: 403 }, { status: 403 }],
      [FRESH]: [{ status: 206, body: [1] }, { status: 206, body: [2] }],
    });
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    let release!: (url: string) => void;
    const refresh = vi.fn(() => new Promise<string>((r) => (release = r)));
    const client = new RangeClient(STALE, refresh);
    const a = client.fetch(0, 0);
    const b = client.fetch(1, 1);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    release(FRESH);
    await Promise.all([a, b]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('gives up when the refresh returns nothing, or a different object', async () => {
    for (const fresh of [null, 'https://elsewhere.example/other.mp4?sig=1']) {
      const { fetch } = fakeFetch({ [STALE]: { status: 403 } });
      globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
      const client = new RangeClient(STALE, async () => fresh);
      await expect(client.fetch(0, 0)).rejects.toMatchObject({ name: 'RangeRequestError', status: 403 });
      expect(client.url).toBe(STALE);
    }
  });

  it('does not refresh for statuses other than 401/403', async () => {
    const { fetch } = fakeFetch({ [STALE]: { status: 200, body: [1, 2, 3] } });
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    const refresh = vi.fn(async () => FRESH);
    const client = new RangeClient(STALE, refresh);
    await expect(client.fetch(0, 0)).rejects.toBeInstanceOf(RangeRequestError);
    expect(refresh).not.toHaveBeenCalled();
  });
});
