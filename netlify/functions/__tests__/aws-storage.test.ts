import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Handler = (event: unknown) => Promise<{ statusCode: number; body: string }>;

async function loadHandler(): Promise<Handler> {
  const { handler } = await import('../aws-storage.cjs');
  return handler as Handler;
}

function event(
  params: Record<string, string> | null,
  headers: Record<string, string> = {}
) {
  return { queryStringParameters: params, headers };
}

const VALID_ID = 'bc9ac890-942a-4052-9b55-25e38bf53d51';

const VIDEOS = 'https://sb.example.com/rest/v1/videos';
const LAMBDA = 'https://lambda.example.com';

// A JWT is three base64url segments; only the payload is read, and only for its
// `role` claim, so the signature can be anything.
function fakeKey(role: string): string {
  const payload = Buffer.from(JSON.stringify({ role }), 'utf8').toString('base64url');
  return `header.${payload}.signature`;
}

// One fetch mock that answers by URL. `videoVisible` decides what the anon
// visibility query returns; `tokenRejected` makes PostgREST answer 401 for a
// request carrying a caller token, which is how a forged or expired token
// presents. Records options so tests can assert on forwarded headers.
function routedFetch(
  opts: { videoVisible?: boolean; tokenRejected?: boolean; body?: unknown } = {}
) {
  return vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    if (url.startsWith(VIDEOS)) {
      const auth = init?.headers?.authorization ?? '';
      const isCallerToken =
        auth !== '' && auth !== `Bearer ${process.env.SUPABASE_ANON_KEY}`;
      if (isCallerToken && opts.tokenRejected) {
        return { ok: false, status: 401, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () =>
          'body' in opts ? opts.body : opts.videoVisible ? [{ id: 'v1' }] : [],
      };
    }
    if (url.startsWith(LAMBDA)) {
      return {
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => 'https://s3.example.com/presigned.mp4',
      };
    }
    throw new Error('unexpected fetch: ' + url);
  });
}

// Find calls by target rather than by index: Task 2 adds earlier calls, so
// mock.calls[0] is not stably the Lambda.
const lambdaCall = (m: ReturnType<typeof vi.fn>) =>
  m.mock.calls.find((c) => String(c[0]).startsWith(LAMBDA));
const videosCall = (m: ReturnType<typeof vi.fn>) =>
  m.mock.calls.find((c) => String(c[0]).startsWith(VIDEOS));

beforeEach(() => {
  process.env.AWS_STORAGE_API_KEY = 'test-key';
  process.env.AWS_STORAGE_API_URL = LAMBDA;
  // The authorization step reads these two. Setting them here keeps every
  // test in this file passing.
  process.env.SUPABASE_URL = 'https://sb.example.com';
  process.env.SUPABASE_ANON_KEY = fakeKey('anon');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('aws-storage: the caller cannot name a path', () => {
  it('rejects a missing outputVideoId without calling the Lambda', async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({}));

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a path separator', 'pipeline-output/other/streams/generated.mp4'],
    ['a traversal', '..'],
    ['an encoded separator', 'abc%2F..%2Fsecret'],
  ])('rejects %s without calling the Lambda', async (_label, id) => {
    const fetchMock = routedFetch();
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({ outputVideoId: id }));

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('builds the storage path itself and ignores any filepath parameter', async () => {
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(
      event({ outputVideoId: VALID_ID, filepath: 'secrets/private.mp4' })
    );

    expect(res.statusCode).toBe(200);
    const url = String(lambdaCall(fetchMock)?.[0]);
    expect(url).toContain(
      `pipeline-output%2F${VALID_ID}%2Fstreams%2Fgenerated.mp4`
    );
    expect(url).not.toContain('secrets');
  });

  it('returns 500 when the Lambda is not configured', async () => {
    delete process.env.AWS_STORAGE_API_KEY;
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({ outputVideoId: VALID_ID }));

    expect(res.statusCode).toBe(500);
    expect(lambdaCall(fetchMock)).toBeUndefined();
  });
});

describe('aws-storage: authorization', () => {
  it('allows a caller who can see the video, forwarding their own credentials', async () => {
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(
      event({ outputVideoId: VALID_ID }, { authorization: 'Bearer caller-token' })
    );

    expect(res.statusCode).toBe(200);
    expect(lambdaCall(fetchMock)).toBeDefined();
    const opts = videosCall(fetchMock)?.[1] as { headers: Record<string, string> };
    expect(opts.headers.authorization).toBe('Bearer caller-token');
    expect(opts.headers.apikey).toBe(process.env.SUPABASE_ANON_KEY);
  });

  it('denies a caller who cannot see the video, without calling the Lambda', async () => {
    const fetchMock = routedFetch({ videoVisible: false });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(
      event({ outputVideoId: VALID_ID }, { authorization: 'Bearer caller-token' })
    );

    expect(res.statusCode).toBe(403);
    expect(lambdaCall(fetchMock)).toBeUndefined();
  });

  it('allows an anonymous caller when the video is visible', async () => {
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({ outputVideoId: VALID_ID }));

    expect(res.statusCode).toBe(200);
    expect(lambdaCall(fetchMock)).toBeDefined();
  });

  it('denies an anonymous caller when the video is not visible', async () => {
    const fetchMock = routedFetch({ videoVisible: false });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({ outputVideoId: VALID_ID }));

    expect(res.statusCode).toBe(403);
    expect(lambdaCall(fetchMock)).toBeUndefined();
  });

  // Regression guard for share-link viewers: a lapsed session must degrade to
  // anonymous, not reject. Do not delete this test.
  it('retries as anonymous when the caller token is rejected', async () => {
    const fetchMock = routedFetch({ tokenRejected: true, videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(
      event({ outputVideoId: VALID_ID }, { authorization: 'Bearer expired' })
    );

    expect(res.statusCode).toBe(200);
    const videosCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith(VIDEOS)
    );
    expect(videosCalls).toHaveLength(2);
    expect(
      (videosCalls[1][1] as { headers: Record<string, string> }).headers.authorization
    ).toBe(`Bearer ${process.env.SUPABASE_ANON_KEY}`);
  });

  it('reads the Authorization header regardless of casing', async () => {
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    await handler(
      event({ outputVideoId: VALID_ID }, { AUTHORIZATION: 'Bearer caller-token' })
    );

    const opts = videosCall(fetchMock)?.[1] as { headers: Record<string, string> };
    expect(opts.headers.authorization).toBe('Bearer caller-token');
  });

  it('queries the video by its aws-prefixed videoId', async () => {
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    await handler(event({ outputVideoId: VALID_ID }));

    expect(String(videosCall(fetchMock)?.[0])).toContain(
      `videoId=eq.aws:${VALID_ID}`
    );
  });

  it('returns 403 for a non-array body, never an allow', async () => {
    const fetchMock = routedFetch({ body: { code: '42703' } });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({ outputVideoId: VALID_ID }));

    expect(res.statusCode).toBe(403);
    expect(lambdaCall(fetchMock)).toBeUndefined();
  });

  it('returns 502 when the visibility lookup throws', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith(VIDEOS)) throw new Error('ECONNREFUSED');
      throw new Error('unexpected fetch: ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({ outputVideoId: VALID_ID }));

    expect(res.statusCode).toBe(502);
    expect(lambdaCall(fetchMock)).toBeUndefined();
  });

  it('returns 500 when Supabase is not configured', async () => {
    delete process.env.SUPABASE_URL;
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({ outputVideoId: VALID_ID }));

    expect(res.statusCode).toBe(500);
    expect(lambdaCall(fetchMock)).toBeUndefined();
  });

  // A service_role key here would bypass RLS and authorize every request, and
  // the two keys sit in the same dashboard panel both labelled "key".
  it('returns 500 when the anon key is not actually an anon key', async () => {
    process.env.SUPABASE_ANON_KEY = fakeKey('service_role');
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({ outputVideoId: VALID_ID }));

    expect(res.statusCode).toBe(500);
    expect(lambdaCall(fetchMock)).toBeUndefined();
  });
});
