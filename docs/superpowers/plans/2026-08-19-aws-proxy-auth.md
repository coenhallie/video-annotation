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
- `buildFilepath` stays, but not because anything in `videoService.ts` writes `filePath` onto
  the row from it: no call site ever did that. It stays because it is mocked by
  `outputVideoThumbnail.test.ts`, and removing it would churn a test this task has no other
  reason to touch.
- **`videoService.ts` is not modified at all**, and `outputVideoThumbnail.test.ts`'s existing
  mock of `AwsStorageService` keeps working untouched.

## Revision, 2026-08-19: the authorization rule changed after Task 2 shipped

Task 2 was implemented and committed against a rule that has since been corrected, so its
committed code is an intermediate state that Task 4 replaces. Do not treat the handler at that
commit as the target.

What changed and why: the spec justified letting a verified signed-in caller skip the
visibility check with "every signed-in user can already see every video." Measured against the
live database with a real session, that is false. A signed-in user sees public videos, videos
in public comparisons, and their own, and zero private videos belonging to other owners. The
shortcut therefore granted more than the app itself does.

The corrected rule is uniform: every caller is asked the same question, "can you see this
video", by forwarding their own credentials to PostgREST. The reason the shortcut existed - no
`videos` row exists yet on first ingest - is fixed in the client instead, by creating the row
before fetching the URL.

Task ordering matters and is deliberate. Task 3 (the client reorder) lands before Task 4 (the
stricter check), because the reorder is safe under the current permissive handler while the
reverse order would break first ingest.

See `docs/superpowers/specs/2026-08-19-aws-proxy-auth-design.md` sections 4a, 5, 7 and 8.

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

### Task 3: Create the video row before fetching its URL

**Files:**
- Modify: `src/services/videoService.ts:585-656` (`findOrCreateOutputVideo`)
- Modify: `src/services/__tests__/outputVideoThumbnail.test.ts`

**Interfaces:**
- Consumes: `AwsStorageService.getVideoUrlForProject(outputVideoId)` from Task 1.
- Produces: after this task, a `videos` row for an AWS project always exists **before** its
  presigned URL is requested. Task 4 depends on that: it authorizes on visibility, and a row
  that does not exist is visible to nobody.

**Why the order is wrong today:** `findOrCreateOutputVideo` fetches the presigned URL on its
first line and inserts the row afterwards. Task 4 makes the proxy ask "can you see this video",
which on first ingest would be answered against a row that does not exist yet.

This task is safe on its own: the handler is still permissive, so reordering breaks nothing.

- [ ] **Step 1: Update the existing tests to the new placement**

The thumbnail currently rides along on the INSERT. After the reorder the insert happens before
the URL exists, so the thumbnail necessarily lands on the UPDATE instead. In
`src/services/__tests__/outputVideoThumbnail.test.ts`, change the two assertions that read
`state.inserted` for thumbnail fields to read `state.updated`:

```ts
    expect(state.updated.thumbnailUrl).toBe('data:image/jpeg;base64,abc');
```

and, in the test that asserts no thumbnail is written when generation returns null:

```ts
    expect(state.updated.thumbnailUrl).toBeUndefined();
```

Leave every other assertion, the mock, and `generateSmallThumbnail` alone. Read the file and
adjust only the assertions whose subject moved from the insert to the update.

- [ ] **Step 2: Add a test for the new ordering and the failure cleanup**

Append to the same file. The supabase stub in this file records the last insert and update; add
a `deleted` field to `state` and a `delete` method to the stub so the cleanup path can be
observed:

```ts
// Extend the existing `state` object with:
//   deleted: null as any,
// and add this alongside `insert` and `update` in the supabase `from()` stub:
//   delete: () => ({ eq: (_col: string, id: string) => { state.deleted = id; return Promise.resolve({ error: null }); } }),

describe('findOrCreateOutputVideo ordering', () => {
  beforeEach(() => {
    state.existing = null;
    state.inserted = null;
    state.updated = null;
    state.deleted = null;
    generateSmallThumbnail.mockReset();
    getVideoUrlForProject.mockReset();
  });

  it('inserts the row before requesting the presigned URL', async () => {
    // The proxy authorizes on visibility, so the row has to exist first.
    getVideoUrlForProject.mockImplementation(async () => {
      expect(state.inserted).not.toBeNull();
      return 'https://s3.example.com/presigned.mp4';
    });
    generateSmallThumbnail.mockResolvedValue(null);

    await callFindOrCreate();

    expect(state.inserted).not.toBeNull();
    expect(state.inserted.url).toBe('');
    expect(state.updated.url).toBe('https://s3.example.com/presigned.mp4');
  });

  it('deletes a row it just created when the presigned URL fetch fails', async () => {
    getVideoUrlForProject.mockRejectedValue(new Error('403 Not authorized for this video'));

    await expect(callFindOrCreate()).rejects.toThrow('Not authorized');

    expect(state.deleted).toBe('v1');
  });

  it('does not delete a pre-existing row when the fetch fails', async () => {
    state.existing = { id: 'existing-1', thumbnailUrl: 'data:image/jpeg;base64,old' };
    getVideoUrlForProject.mockRejectedValue(new Error('boom'));

    await expect(callFindOrCreate()).rejects.toThrow('boom');

    expect(state.deleted).toBeNull();
  });
});
```

Note that the existing `getVideoUrlForProject` mock at the top of the file is declared as
`vi.fn(async () => 'https://s3.example.com/presigned.mp4')`. Calling `mockReset()` on it clears
that implementation, so the earlier `describe` block must keep working: add
`getVideoUrlForProject.mockResolvedValue('https://s3.example.com/presigned.mp4')` to that
block's existing `beforeEach` so it is restored for those tests.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/services/__tests__/outputVideoThumbnail.test.ts`
Expected: FAIL. The ordering test fails because the URL is fetched before any insert, and the
two cleanup tests fail because no delete happens.

- [ ] **Step 4: Reorder the implementation**

Replace the body of `findOrCreateOutputVideo` in `src/services/videoService.ts` with:

```ts
  static async findOrCreateOutputVideo(outputVideoId: string, ownerId: string): Promise<Video> {
    // The row must exist before the presigned URL is requested. The storage proxy
    // authorizes by asking whether the caller can see this video, and a row that
    // does not exist yet is visible to nobody, so fetching first would 403 the
    // first ingest of every project. Created with an empty url, filled in below.
    let record = await this.findVideoByOutputVideoId(outputVideoId);
    const createdHere = !record;

    if (!record) {
      const { data, error } = await supabase
        .from('videos')
        .insert({
          ownerId,
          url: '',
          title: `Pipeline Output - ${outputVideoId.substring(0, 8)}`,
          videoType: 'url',
          videoId: `aws:${outputVideoId}`,
          isPublic: false,
          fps: 30,
          duration: 1,
          totalFrames: 30,
        })
        .select()
        .single();

      if (error) {
        handleServiceError('VideoService.findOrCreateOutputVideo', error);
        throw error;
      }
      record = data;
    }

    let presignedUrl: string;
    try {
      presignedUrl = await AwsStorageService.getVideoUrlForProject(outputVideoId);
    } catch (error) {
      // A row we just created and cannot fill in is a permanently blank video in
      // the library. A pre-existing row keeps whatever url it already had.
      if (createdHere) {
        await supabase.from('videos').delete().eq('id', record.id);
      }
      throw error;
    }

    // Generate a thumbnail whenever the record has none yet: new records, plus
    // backfill for AWS videos created before thumbnails existed. Requires CORS
    // on the S3 bucket; failure is non-fatal and leaves the video without one.
    let thumbnailUrl: string | null = null;
    if (!record.thumbnailUrl) {
      try {
        // Race against a timeout: generateSmallThumbnail can stall forever on a
        // hung media load (no error event fires), and this await sits on the
        // deep-link open path behind the app loading screen.
        const THUMBNAIL_TIMEOUT_MS = 15_000;
        thumbnailUrl = await Promise.race([
          ThumbnailGenerator.generateSmallThumbnail(presignedUrl),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), THUMBNAIL_TIMEOUT_MS)
          ),
        ]);
      } catch (error) {
        console.warn('⚠️ Failed to generate thumbnail for AWS video:', error);
      }
    }

    const { data, error } = await supabase
      .from('videos')
      .update({
        url: presignedUrl,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      })
      .eq('id', record.id)
      .select()
      .single();

    if (error) {
      handleServiceError('VideoService.findOrCreateOutputVideo', error);
      return record;
    }
    return data;
  }
```

This also removes the dead local that assigned `AwsStorageService.buildFilepath(outputVideoId)`
to a variable that was never read. The inserted row never carried a `filePath`. Leave
`buildFilepath` itself in place: it then has no callers, but it is mocked by this test file and
removing it would churn a test for no reason.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/services/__tests__/outputVideoThumbnail.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/videoService.ts src/services/__tests__/outputVideoThumbnail.test.ts
git commit -m "fix: create the AWS video row before requesting its presigned URL"
```

---

### Task 4: Check every caller the same way

**Files:**
- Modify: `netlify/functions/aws-storage.cjs`
- Modify: `netlify/functions/__tests__/aws-storage.test.ts`

**Interfaces:**
- Consumes: Task 1's validated `outputVideoId` and server-built path; Task 3's guarantee that
  the `videos` row exists before the URL is requested.
- Produces: the final authorization rule. No signed-in shortcut.

This task **replaces** the authorization logic committed in Task 2. That code verified a bearer
token against `GET /auth/v1/user` and then allowed the caller outright. Delete
`isAuthorized` and its `/auth/v1/user` call entirely; do not layer on top of it.

Why the replacement is simpler as well as stricter: PostgREST validates the JWT itself while
answering the query, so a single request does authentication and authorization together, and
the answer is by construction the same one the app would get.

- [ ] **Step 1: Rewrite the test block**

In `netlify/functions/__tests__/aws-storage.test.ts`, delete the entire
`describe('aws-storage: authorization', ...)` block added by Task 2 and replace it with the
block below. Leave Task 1's `describe('aws-storage: the caller cannot name a path', ...)` and
all the shared helpers untouched.

`routedFetch` needs one change so the new tests can assert on forwarded headers and simulate a
401: replace Task 1's version with this one, keeping its name and position.

```ts
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
      const isCallerToken = auth !== '' && auth !== 'Bearer anon-key';
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
```

`AUTH_USER` is no longer used and should be deleted along with it.

`SUPABASE_ANON_KEY` must now be a JWT whose `role` claim is `anon`, because the handler asserts
it. In the shared `beforeEach`, replace the placeholder with a real-shaped token. Add this
helper beside the other helpers:

```ts
// A JWT is three base64url segments; only the payload is read, and only for its
// `role` claim, so the signature can be anything.
function fakeKey(role: string): string {
  const payload = Buffer.from(JSON.stringify({ role }), 'utf8').toString('base64url');
  return `header.${payload}.signature`;
}
```

and in the shared `beforeEach`:

```ts
  process.env.SUPABASE_ANON_KEY = fakeKey('anon');
```

Task 1's tests are unaffected by this: they assert 400 and 500 paths, or supply a visible video.
Update Task 1's "builds the storage path itself" test only if it fails, and say so in your
report if you had to.

Now the new authorization block:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run netlify/functions/__tests__/aws-storage.test.ts`
Expected: FAIL. The handler still verifies a token against `/auth/v1/user`, which
`routedFetch` no longer routes, so those paths throw; the casing, non-array, 502 and
service_role tests all fail against the old logic.

- [ ] **Step 3: Replace the authorization logic**

In `netlify/functions/aws-storage.cjs`, delete `isAuthorized` entirely and add these three
helpers in its place:

```js
/**
 * Netlify lowercases event headers, but nothing in the contract guarantees it,
 * and here a missed header degrades a signed-in caller to anonymous.
 */
function headerValue(headers, name) {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === target) return headers[key];
  }
  return undefined;
}

/**
 * A JWT is three base64url segments. Only the payload's `role` claim is read,
 * and only as a configuration sanity check, so no signature verification is
 * needed or attempted here.
 */
function keyRole(key) {
  try {
    const payload = JSON.parse(
      Buffer.from(String(key).split('.')[1], 'base64url').toString('utf8')
    );
    return payload.role;
  } catch (err) {
    return null;
  }
}

/**
 * Ask the database one question: can this caller see this video?
 *
 * The caller's own credentials are forwarded, so PostgREST verifies the JWT and
 * applies the `videos` SELECT policy. The answer is by construction the same one
 * the app would get, which is why this cannot drift from the rest of the product.
 *
 * There is no signed-in shortcut. `findOrCreateOutputVideo` creates the row
 * before requesting the URL precisely so this check works on first ingest.
 *
 * Returns 'allow', 'deny' or 'error'. Throws only on a network or parse failure,
 * which the caller turns into 502.
 */
async function checkVisibility(outputVideoId, supabaseUrl, anonKey, authHeader) {
  const url =
    supabaseUrl + '/rest/v1/videos?select=id&videoId=eq.aws:' + outputVideoId;
  const ask = (auth) =>
    fetch(url, { headers: { apikey: anonKey, authorization: auth } });

  let res = await ask(authHeader || 'Bearer ' + anonKey);

  // A forged, malformed or expired token makes PostgREST answer 401. Retry as
  // anonymous rather than rejecting, so a share-link viewer whose session lapsed
  // can still play a public video.
  if (!res.ok && authHeader) {
    res = await ask('Bearer ' + anonKey);
  }
  if (!res.ok) return 'error';

  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? 'allow' : 'deny';
}
```

- [ ] **Step 4: Wire it into the handler**

Replace the Task 2 configuration and authorization block with:

```js
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return json(500, {
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify env vars.',
    });
  }

  // A service_role key here would bypass RLS and quietly authorize every
  // request. The two keys sit in the same dashboard panel, both labelled "key".
  if (keyRole(anonKey) !== 'anon') {
    return json(500, {
      error:
        'SUPABASE_ANON_KEY is not an anon key. A service_role key here would bypass RLS.',
    });
  }

  let visibility;
  try {
    visibility = await checkVisibility(
      outputVideoId,
      supabaseUrl,
      anonKey,
      headerValue(event.headers, 'authorization')
    );
  } catch (err) {
    return json(502, { error: 'Authorization check failed: ' + err.message });
  }

  if (visibility === 'error') {
    return json(502, { error: 'Authorization check failed' });
  }
  if (visibility === 'deny') {
    return json(403, { error: 'Not authorized for this video' });
  }
```

Keep the existing `AWS_STORAGE_API_KEY` / `AWS_STORAGE_API_URL` guard where it is, before this
block.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run netlify/functions/__tests__/aws-storage.test.ts`
Expected: PASS, 16 tests (Task 1's 6 plus these 10).

- [ ] **Step 6: Run the full suite and typecheck**

```bash
npm test
npx vue-tsc --noEmit 2>&1 | grep -E "awsStorageService|aws-storage|videoService"
```

Expected: tests PASS; the grep returns nothing. Do not attempt to fix pre-existing errors in
other files.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/aws-storage.cjs netlify/functions/__tests__/aws-storage.test.ts
git commit -m "fix: authorize every caller by asking whether they can see the video"
```

---

### Task 5: Deployment configuration and end-to-end verification

**Files:** none. Configuration and verification only.

**Interfaces:**
- Consumes: Tasks 1, 3 and 4.

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
