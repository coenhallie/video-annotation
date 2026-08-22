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
// What routedFetch's LAMBDA branch answers with. For kind=data the handler
// then probes this exact URL with a ranged GET, so it needs its own route.
const PRESIGNED = 'https://s3.example.com/presigned.mp4';

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
  opts: {
    videoVisible?: boolean;
    tokenRejected?: boolean;
    body?: unknown;
    // Controls the answer to the ranged GET the handler sends the presigned
    // URL for kind=data. Defaults to a plain 206 with a 12345-byte object.
    probe?: { status?: number; headers?: Record<string, string> };
  } = {}
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
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => PRESIGNED,
      };
    }
    if (url === PRESIGNED) {
      const status = opts.probe?.status ?? 206;
      const headers: Record<string, string> = {
        'content-range': 'bytes 0-0/12345',
        ...opts.probe?.headers,
      };
      return {
        ok: status < 400,
        status,
        headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      };
    }
    throw new Error('unexpected fetch: ' + url);
  });
}

// Find calls by target rather than by index: the authorization check makes a
// `videos` call before the Lambda is ever reached, so mock.calls[0] is not
// stably the Lambda.
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

  // The thrown error's message (e.g. a DNS or TLS failure string) must never
  // reach the response body: it is parsed out by awsStorageService, rethrown by
  // findOrCreateOutputVideo, and rendered in a user-facing notifyError toast by
  // EditorView. Pin the generic message so that detail cannot leak back in.
  it('returns 502 with a generic message when the visibility lookup throws, never the raw error', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith(VIDEOS)) throw new Error('ECONNREFUSED something-sensitive.internal');
      throw new Error('unexpected fetch: ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({ outputVideoId: VALID_ID }));

    expect(res.statusCode).toBe(502);
    expect(lambdaCall(fetchMock)).toBeUndefined();
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Authorization check failed');
    expect(body.error).not.toContain('ECONNREFUSED');
    expect(body.error).not.toContain('something-sensitive.internal');
  });

  // Same leak, different catch block: the call to the Lambda itself can throw
  // (DNS, TLS, connection refused), and that error's message must not reach the
  // response body either, for the identical reason as the authorization-check
  // case above - awsStorageService parses `error` out of the body and it ends
  // up in a user-facing notifyError toast.
  it('returns 502 with a generic message when the Lambda call throws, never the raw error', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith(VIDEOS)) {
        return { ok: true, status: 200, json: async () => [{ id: 'v1' }] };
      }
      if (url.startsWith(LAMBDA)) {
        throw new Error('ETIMEDOUT something-sensitive.internal');
      }
      throw new Error('unexpected fetch: ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({ outputVideoId: VALID_ID }));

    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Storage request failed');
    expect(body.error).not.toContain('ETIMEDOUT');
    expect(body.error).not.toContain('something-sensitive.internal');
    expect(body.error).not.toContain('Proxy error');
  });

  // Regression guard: retrying as anonymous on any non-ok status, rather than
  // specifically 401, would turn a transient PostgREST 5xx during a legitimate
  // first ingest into a false 403 for the video's own owner (the client then
  // deletes the row it just created reacting to that 403). Only a real 401 -
  // what a forged, malformed or expired token produces - should trigger a retry.
  it('does not retry on a non-401 non-ok response, and returns 502 without calling the Lambda', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith(VIDEOS)) {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      throw new Error('unexpected fetch: ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(
      event({ outputVideoId: VALID_ID }, { authorization: 'Bearer caller-token' })
    );

    expect(res.statusCode).toBe(502);
    expect(lambdaCall(fetchMock)).toBeUndefined();
    const videosCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith(VIDEOS)
    );
    expect(videosCalls).toHaveLength(1);
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

  // A correctly configured sb_publishable_* key is not a JWT, so it fails the
  // same check as a service_role key. The message must say a JWT-format anon
  // key is expected, not just warn about service_role, or whoever hits this
  // with a valid publishable key goes hunting for the wrong problem.
  it('returns 500 with a JWT-format hint when the anon key is a non-JWT publishable key', async () => {
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_abc123';
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(event({ outputVideoId: VALID_ID }));

    expect(res.statusCode).toBe(500);
    expect(lambdaCall(fetchMock)).toBeUndefined();
    const body = JSON.parse(res.body);
    expect(body.error).toContain('JWT');
  });
});

describe('kind parameter', () => {
  afterEach(() => {
    delete process.env.AWS_PIPELINE_DATA_KEY;
  });

  it('defaults to the video key when kind is absent', async () => {
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    await handler(event({ outputVideoId: VALID_ID }));
    const url = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(url).toContain(encodeURIComponent('streams/generated.mp4'));
  });

  it('uses the configured data key template for kind=data', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    await handler(event({ outputVideoId: VALID_ID, kind: 'data' }));
    // Not .at(-1): kind=data probes the presigned URL after calling the
    // Lambda, so the Lambda call is no longer necessarily the last one.
    const url = String(lambdaCall(fetchMock)?.[0]);
    expect(url).toContain(
      encodeURIComponent(`pipeline-output/${VALID_ID}/data/${VALID_ID}.jsonl`)
    );
  });

  it('replaces every {id} placeholder with the validated id, ignoring any other query parameter', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    const res = await handler(
      event({ outputVideoId: VALID_ID, kind: 'data', filepath: 'secrets/private.jsonl' })
    );
    expect(res.statusCode).toBe(200);
    const url = String(lambdaCall(fetchMock)?.[0]);
    expect(url).toContain(
      encodeURIComponent(`pipeline-output/${VALID_ID}/data/${VALID_ID}.jsonl`)
    );
    expect(url).not.toContain('secrets');
  });

  it('answers 501 for kind=data when no template is configured', async () => {
    delete process.env.AWS_PIPELINE_DATA_KEY;
    vi.stubGlobal('fetch', routedFetch({ videoVisible: true }));
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID, kind: 'data' }));
    expect(res.statusCode).toBe(501);
  });

  it('rejects an unknown kind', async () => {
    vi.stubGlobal('fetch', routedFetch({ videoVisible: true }));
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID, kind: 'secrets' }));
    expect(res.statusCode).toBe(400);
  });

  it('still authorises before touching the data key', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    vi.stubGlobal('fetch', routedFetch({ videoVisible: false }));
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID, kind: 'data' }));
    expect(res.statusCode).toBe(403);
  });

  // Renamed from "substitutes only the validated id, never caller text": this
  // trips the pre-existing OUTPUT_VIDEO_ID regex before keyFor ever runs, so
  // it is a regression guard that the id check also applies when kind=data,
  // not a test of the template-substitution logic itself. The substitution
  // guarantee (keyFor only ever receives the regex-validated id) is verified
  // by code inspection plus the "replaces every {id} placeholder" case above.
  it('rejects a path-like id for kind=data too, via the existing id regex', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    const res = await handler(
      event({ outputVideoId: '../../etc/passwd', kind: 'data' })
    );
    expect(res.statusCode).toBe(400);
  });

  it('kind=data with a ranged probe returns {url, size, acceptsRanges: true}', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    const fetchMock = routedFetch({
      videoVisible: true,
      probe: { headers: { 'content-range': 'bytes 0-0/4096' } },
    });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID, kind: 'data' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.url).toBeTruthy();
    expect(body.size).toBe(4096);
    expect(body.acceptsRanges).toBe(true);
  });

  it('kind=data where the server ignores Range reports acceptsRanges: false, size from content-length', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    const fetchMock = routedFetch({
      videoVisible: true,
      probe: { status: 200, headers: { 'content-length': '9000' } },
    });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID, kind: 'data' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.size).toBe(9000);
    expect(body.acceptsRanges).toBe(false);
  });

  it('kind=data with a content-encoding on the probe reports acceptsRanges: false even on a 206', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    const fetchMock = routedFetch({
      videoVisible: true,
      probe: {
        headers: { 'content-range': 'bytes 0-0/4096', 'content-encoding': 'gzip' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID, kind: 'data' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.acceptsRanges).toBe(false);
  });

  it('kind=data answers 502 when the probe is unreachable', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    const fetchMock = routedFetch({ videoVisible: true, probe: { status: 500 } });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID, kind: 'data' }));
    expect(res.statusCode).toBe(502);
  });

  // The likeliest real-world state until the pipeline team confirms the key:
  // AWS_PIPELINE_DATA_KEY is set but wrong, so the Lambda itself answers
  // non-ok (a 404, say) before this function ever gets a URL to probe. That
  // response is proxied through unchanged, same as any other kind=video
  // failure - no probe is attempted, since there is no URL yet to probe.
  it('kind=data proxies a non-ok Lambda response unchanged, without attempting a probe', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith(VIDEOS)) {
        return { ok: true, status: 200, json: async () => [{ id: 'v1' }] };
      }
      if (url.startsWith(LAMBDA)) {
        return {
          ok: false,
          status: 404,
          headers: { get: () => 'application/json' },
          text: async () => JSON.stringify({ error: 'not found' }),
        };
      }
      // A call to PRESIGNED here would mean the handler tried to probe with
      // no URL to probe, which is exactly what this test guards against.
      throw new Error('unexpected fetch: ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID, kind: 'data' }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'not found' });
  });

  it('kind=video is unchanged: proxies the Lambda body directly and never probes', async () => {
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(PRESIGNED);
    // Exactly the videos-visibility check and the Lambda call. No probe.
    expect(fetchMock.mock.calls).toHaveLength(2);
  });
});
