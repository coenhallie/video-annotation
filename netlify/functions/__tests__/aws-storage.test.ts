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

const AUTH_USER = 'https://sb.example.com/auth/v1/user';
const VIDEOS = 'https://sb.example.com/rest/v1/videos';
const LAMBDA = 'https://lambda.example.com';

// One fetch mock that answers by URL. `tokenValid` decides what Supabase auth
// says about a bearer token; `videoVisible` what the anon visibility query
// returns. Task 1's handler consults neither endpoint, but routing by URL now
// means these tests stay valid unchanged once Task 2 adds authorization.
function routedFetch(
  opts: { tokenValid?: boolean; videoVisible?: boolean } = {}
) {
  return vi.fn(async (url: string) => {
    if (url.startsWith(AUTH_USER)) {
      return { ok: !!opts.tokenValid, status: opts.tokenValid ? 200 : 401 };
    }
    if (url.startsWith(VIDEOS)) {
      return {
        ok: true,
        status: 200,
        json: async () => (opts.videoVisible ? [{ id: 'v1' }] : []),
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
  // Task 2's authorization step reads these two. Setting them here keeps every
  // test in this file passing once that lands.
  process.env.SUPABASE_URL = 'https://sb.example.com';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
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
