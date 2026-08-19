# AWS Storage Proxy Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `netlify/functions/aws-storage.cjs` from accepting a caller-supplied filepath, and require callers to be either a verified signed-in user or an anonymous visitor who can already see the video.

**Architecture:** The function takes an `outputVideoId` and builds the storage path itself, so no caller can name a path. Authorization is delegated to the database rather than reimplemented: a bearer token is verified against Supabase auth, and an unauthenticated caller must resolve to a `videos` row that RLS lets the anon role read.

**Tech Stack:** Netlify Functions v1 (`.cjs`, `exports.handler`), plain `fetch` against Supabase PostgREST and GoTrue, Vitest, TypeScript client in `src/services`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-aws-proxy-auth-design.md`. Read it first.
- The function must never construct a storage path from caller input. The path is always
  `pipeline-output/{outputVideoId}/streams/generated.mp4`, built inside the handler.
- A bearer token grants access only after it verifies against `GET /auth/v1/user`. Treating a
  header's presence as proof of a session reintroduces the exact hole this work closes.
- An invalid or expired token must fall through to the anonymous visibility check, not `401`.
  A share-link viewer whose session lapsed must still be able to play a public video.
- Verified against the live database on 2026-08-19 and safe to rely on: every `aws:*`
  `videos.videoId` carries a UUID, so `^[A-Za-z0-9_-]+$` rejects no valid id; and
  `?videoId=eq.aws:<uuid>` works against PostgREST with the colon unquoted.
- No em dashes in code, comments, docs prose, or commit messages. Use a plain dash.
- Run the full suite with `npm test` (`vitest run`).
- **No task may leave the deployed app broken.** Task 1 changes the client and the function
  together because they are one interface.

## Deviation from the spec, already decided

Spec §8 says `getPresignedUrl(filepath)` becomes `getPresignedUrlForProject(outputVideoId)` and
that two call sites in `videoService.ts` change. That is more churn than needed.
`AwsStorageService.getVideoUrlForProject(outputVideoId)` already takes exactly the right
argument and is the only caller of `getPresignedUrl`. So:

- `getVideoUrlForProject(outputVideoId)` keeps its name and signature; only its body changes.
- The private `getPresignedUrl(filepath)` is deleted.
- `buildFilepath` stays: `videoService.ts:588` still uses it to write `filePath` onto the row.
- **`videoService.ts` is not modified at all**, and `outputVideoThumbnail.test.ts`'s existing
  mock of `AwsStorageService` keeps working untouched.

---

### Task 1: Stop accepting a caller-supplied filepath

**Files:**
- Modify: `vitest.config.ts` (the `include` array)
- Modify: `netlify/functions/aws-storage.cjs` (whole handler)
- Modify: `src/services/awsStorageService.ts:43-74` (`getPresignedUrl`, `getVideoUrlForProject`)
- Create: `netlify/functions/__tests__/aws-storage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `GET /.netlify/functions/aws-storage?outputVideoId=<id>`. The `filepath` parameter is gone.
  - `AwsStorageService.getVideoUrlForProject(outputVideoId: string): Promise<string>` -
    unchanged signature, new request shape. Task 2 adds an auth header to this same method.

This task closes the arbitrary-path hole. The endpoint is still unauthenticated after it; Task
2 handles that. Splitting this way means each task is separately reviewable and neither leaves
the app in a broken state.

- [ ] **Step 1: Let Vitest collect tests next to the function**

`vitest.config.ts` currently collects only `src/**/*.test.ts`, so a test beside the Netlify
function would silently never run. Change the `include` line to:

```ts
    include: ['src/**/*.test.ts', 'netlify/**/*.test.ts'],
```

- [ ] **Step 2: Write the failing tests**

Create `netlify/functions/__tests__/aws-storage.test.ts`. Importing the `.cjs` handler by named
export works in Vitest; this was verified, so do not add an interop fallback.

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run netlify/functions/__tests__/aws-storage.test.ts`
Expected: FAIL. The current handler reads `filepath`, so the path-building test fails on the
asserted URL and the rejection tests fail with `400` for the wrong reason (missing `filepath`)
or reach the Lambda.

- [ ] **Step 4: Rewrite the handler**

Replace the whole of `netlify/functions/aws-storage.cjs` with:

```js
// Netlify Function (v1 format): proxies requests to the AWS Lambda storage API.
// Using .cjs + exports.handler for maximum compatibility.
//
// The caller names a pipeline project, never a storage path. Accepting a
// caller-supplied filepath let anyone with the endpoint fetch any object the
// Lambda's API key could reach.
//
// Design: docs/superpowers/specs/2026-08-19-aws-proxy-auth-design.md

// An allowlist, not a blacklist: this excludes '/', '..', '%' and every other
// path-bearing character by construction. Every aws:* video id in the database
// is a UUID, so this rejects no valid id.
const OUTPUT_VIDEO_ID = /^[A-Za-z0-9_-]+$/;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  const outputVideoId =
    event.queryStringParameters && event.queryStringParameters.outputVideoId;

  if (!outputVideoId || !OUTPUT_VIDEO_ID.test(outputVideoId)) {
    return json(400, { error: 'Missing or invalid outputVideoId parameter' });
  }

  const apiKey = process.env.AWS_STORAGE_API_KEY;
  const lambdaBaseUrl = process.env.AWS_STORAGE_API_URL;

  if (!apiKey || !lambdaBaseUrl) {
    return json(500, {
      error:
        'AWS storage API not configured. Set AWS_STORAGE_API_KEY and AWS_STORAGE_API_URL in Netlify env vars.',
    });
  }

  // Built here from a validated id. Never taken from the caller.
  const filepath = 'pipeline-output/' + outputVideoId + '/streams/generated.mp4';
  const targetUrl =
    lambdaBaseUrl + '/api/v1/storage/' + encodeURIComponent(filepath) + '/no-redirect';

  try {
    const res = await fetch(targetUrl, {
      headers: { 'x-api-key': apiKey },
    });

    const body = await res.text();

    return {
      statusCode: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store',
      },
      body: body,
    };
  } catch (err) {
    return json(502, { error: 'Proxy error: ' + err.message });
  }
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run netlify/functions/__tests__/aws-storage.test.ts`
Expected: PASS, 6 tests (the `it.each` contributes three).

- [ ] **Step 6: Update the client to send an id**

In `src/services/awsStorageService.ts`, delete the `getPresignedUrl` method entirely and
replace `getVideoUrlForProject` with the version below. The error-handling block is carried
over unchanged from the deleted method; do not simplify it.

```ts
  /**
   * Get a presigned video URL for a pipeline project.
   *
   * Sends the project id, not a path: the Netlify Function builds the storage
   * path itself so no caller can name an arbitrary object. See
   * docs/superpowers/specs/2026-08-19-aws-proxy-auth-design.md.
   */
  static async getVideoUrlForProject(outputVideoId: string): Promise<string> {
    const url = `/.netlify/functions/aws-storage?outputVideoId=${encodeURIComponent(outputVideoId)}`;

    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let message = `Failed to get presigned URL: ${res.status}`;
      try {
        const err = JSON.parse(body);
        if (err.error) message = err.error;
      } catch {
        if (body) message = body;
      }
      throw new Error(message);
    }

    const text = await res.text();
    return this.extractUrl(text);
  }
```

`buildFilepath` stays exactly as it is: `videoService.ts:588` still calls it to write `filePath`
onto the video row. Do not delete it, and do not modify `videoService.ts`.

- [ ] **Step 7: Confirm nothing still requests a filepath**

```bash
grep -rn "filepath=" src netlify
```

Expected: no output. `buildFilepath` and `filePath` (the column) will still appear elsewhere;
only the query parameter should be gone.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS. `src/services/__tests__/outputVideoThumbnail.test.ts` mocks `AwsStorageService`
wholesale, so it is unaffected.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts netlify/functions/aws-storage.cjs netlify/functions/__tests__/aws-storage.test.ts src/services/awsStorageService.ts
git commit -m "fix: build the storage path in the proxy instead of trusting the caller"
```

---

### Task 2: Authorize the caller

**Files:**
- Modify: `netlify/functions/aws-storage.cjs`
- Modify: `netlify/functions/__tests__/aws-storage.test.ts` (append a describe block)
- Modify: `src/services/awsStorageService.ts` (`getVideoUrlForProject`)

**Interfaces:**
- Consumes: the handler and client from Task 1.
- Produces: the endpoint now requires either a verified Supabase session or a video the anon
  role can read. Two new Netlify environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

- [ ] **Step 1: Write the failing tests**

Append to `netlify/functions/__tests__/aws-storage.test.ts`. Task 1 already defined
`loadHandler`, `event`, `VALID_ID`, `routedFetch`, `lambdaCall`, `videosCall` and set the
Supabase env vars in the shared `beforeEach`, so this block only adds cases. Do not redefine
any of them, and do not modify Task 1's tests: they were written to survive this change.

```ts
describe('aws-storage: authorization', () => {
  it('allows a caller whose bearer token verifies, without a visibility query', async () => {
    const fetchMock = routedFetch({ tokenValid: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(
      event({ outputVideoId: VALID_ID }, { authorization: 'Bearer good-token' })
    );

    expect(res.statusCode).toBe(200);
    expect(lambdaCall(fetchMock)).toBeDefined();
    expect(videosCall(fetchMock)).toBeUndefined();
  });

  // The regression guard for the mistake this design was corrected for: header
  // presence is not a session. Do not delete this test.
  it('does not trust a forged bearer token, and denies a non-visible video', async () => {
    const fetchMock = routedFetch({ tokenValid: false, videoVisible: false });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(
      event({ outputVideoId: VALID_ID }, { authorization: 'Bearer forged' })
    );

    expect(res.statusCode).toBe(403);
    expect(lambdaCall(fetchMock)).toBeUndefined();
  });

  it('falls back to the visibility check for an expired token on a public video', async () => {
    const fetchMock = routedFetch({ tokenValid: false, videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const res = await handler(
      event({ outputVideoId: VALID_ID }, { authorization: 'Bearer expired' })
    );

    expect(res.statusCode).toBe(200);
    expect(lambdaCall(fetchMock)).toBeDefined();
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

  it('queries the video by its aws-prefixed videoId', async () => {
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    await handler(event({ outputVideoId: VALID_ID }));

    expect(String(videosCall(fetchMock)?.[0])).toContain(
      `videoId=eq.aws:${VALID_ID}`
    );
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run netlify/functions/__tests__/aws-storage.test.ts`
Expected: the Task 1 tests still pass; the new ones fail because the handler performs no
authorization yet, so the 403 and 500 cases return 200 and the Lambda is always called.

- [ ] **Step 3: Add the authorization helper**

In `netlify/functions/aws-storage.cjs`, add above `exports.handler`:

```js
/**
 * Decide whether this caller may fetch the given project's video.
 *
 * A verified Supabase session is allowed outright: every signed-in user can
 * already see every video, and the ingest path fetches the presigned URL before
 * the `videos` row exists, so a lookup-for-everyone rule would break it.
 *
 * Everyone else must resolve to a `videos` row that RLS lets the anon role read,
 * which is exactly "public, or inside a public comparison". Delegating to the
 * policy means this cannot drift from the rest of the app.
 */
async function isAuthorized(event, outputVideoId, supabaseUrl, anonKey) {
  const headers = event.headers || {};
  const authHeader = headers.authorization || headers.Authorization || '';

  // The header must be VERIFIED, not merely present. Trusting its presence would
  // let any caller send `Authorization: Bearer anything` and be waved through,
  // which is the hole this function exists to close.
  if (authHeader.startsWith('Bearer ')) {
    const verified = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { apikey: anonKey, authorization: authHeader },
    });
    if (verified.ok) return true;
    // Absent, malformed, expired or forged: fall through to the anonymous check
    // rather than returning 401, so a share-link viewer whose session lapsed can
    // still play a public video.
  }

  const lookup = await fetch(
    supabaseUrl +
      '/rest/v1/videos?select=id&videoId=eq.aws:' +
      outputVideoId,
    { headers: { apikey: anonKey, authorization: 'Bearer ' + anonKey } }
  );
  if (!lookup.ok) return false;

  const rows = await lookup.json();
  return Array.isArray(rows) && rows.length > 0;
}
```

The `outputVideoId` is safe to interpolate into the query string because the handler already
validated it against `^[A-Za-z0-9_-]+$`. The colon after `aws` needs no quoting: PostgREST
splits a filter on its first `.` only.

- [ ] **Step 4: Wire it into the handler**

Extend the configuration guard to cover the two new variables, and call the helper after
validation and before the Lambda request. The config block becomes:

```js
  const apiKey = process.env.AWS_STORAGE_API_KEY;
  const lambdaBaseUrl = process.env.AWS_STORAGE_API_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!apiKey || !lambdaBaseUrl) {
    return json(500, {
      error:
        'AWS storage API not configured. Set AWS_STORAGE_API_KEY and AWS_STORAGE_API_URL in Netlify env vars.',
    });
  }

  if (!supabaseUrl || !anonKey) {
    return json(500, {
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify env vars.',
    });
  }

  if (!(await isAuthorized(event, outputVideoId, supabaseUrl, anonKey))) {
    return json(403, { error: 'Not authorized for this video' });
  }
```

Missing configuration returns 500 rather than failing closed as 403, so a deployment mistake is
distinguishable from a denied request.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run netlify/functions/__tests__/aws-storage.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Send the session token from the client**

In `src/services/awsStorageService.ts`, add the import at the top of the file (it currently has
none):

```ts
import { getOptimizedSession } from '@/composables/useSupabase';
```

Then, inside `getVideoUrlForProject`, replace the single `fetch` line with:

```ts
    // Anonymous share-link viewers have no session; the function falls back to
    // an RLS visibility check for them, so sending no header is a valid case.
    const session = await getOptimizedSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const res = await fetch(url, { cache: 'no-store', headers });
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS. `outputVideoThumbnail.test.ts` mocks `AwsStorageService` wholesale and does not
exercise the new import.

- [ ] **Step 8: Typecheck the files this task touched**

```bash
npx vue-tsc --noEmit 2>&1 | grep -E "awsStorageService|aws-storage"
```

Expected: no output. Do not attempt to fix the roughly 95 pre-existing errors in other files.

- [ ] **Step 9: Commit**

```bash
git add netlify/functions/aws-storage.cjs netlify/functions/__tests__/aws-storage.test.ts src/services/awsStorageService.ts
git commit -m "fix: require a verified session or a visible video to fetch a presigned URL"
```

---

### Task 3: Deployment configuration and end-to-end verification

**Files:** none. Configuration and verification only.

**Interfaces:**
- Consumes: Tasks 1 and 2.

The function reads `SUPABASE_URL` and `SUPABASE_ANON_KEY`, which do not exist in Netlify today.
Deploying the code without them returns 500 on every request and AWS video playback stops.

- [ ] **Step 1: Add the environment variables before deploying**

In the Netlify dashboard, under Site configuration -> Environment variables, add:

- `SUPABASE_URL` - the same value as `VITE_SUPABASE_URL` in `.env`
- `SUPABASE_ANON_KEY` - the same value as `VITE_SUPABASE_ANON_KEY` in `.env`

The non-`VITE_` names are deliberate: `VITE_`-prefixed variables are inlined into the client
bundle at build time, and these are read at runtime by the function.

This step is the human operator's, not the implementer's. Report it as outstanding rather than
attempting it.

- [ ] **Step 2: Confirm the old attack no longer works**

Against the deployed site, with no credentials at all:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<site>/.netlify/functions/aws-storage?filepath=pipeline-output/anything/streams/generated.mp4"
```

Expected: `400`. Before this change it returned `200` with a presigned URL.

- [ ] **Step 3: Confirm an anonymous caller cannot fetch a non-visible video**

Pick an `aws:*` video that is NOT public and not inside a public comparison, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<site>/.netlify/functions/aws-storage?outputVideoId=<that-id>"
```

Expected: `403`.

If every `aws:*` video in the database happens to be public, this check cannot be run as
written. Say so rather than reporting it as passed.

- [ ] **Step 4: Confirm a shared AWS video still plays signed out**

Open a share link for a public AWS video in a private window with no session. The video must
play. This is the regression this design most risks: an over-tight rule breaks anonymous
sharing, and no unit test covers the real RLS policy.

- [ ] **Step 5: Confirm ingest still works signed in**

Signed in, open an AWS pipeline project via the `?outputVideo=<id>` deep link for a project
that has no `videos` row yet. The video must load. This exercises the reason signed-in callers
skip the visibility check: on first ingest the row does not exist.

- [ ] **Step 6: Report**

State which of steps 2 to 5 were actually observed and which were not. If the environment
variables were not set, say so plainly: the code is inert without them.
