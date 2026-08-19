# AWS Storage Proxy Authorization - Design

**Date:** 2026-08-19
**Status:** Approved.

## 1. Goal

`netlify/functions/aws-storage.cjs` accepts a caller-supplied `filepath` and returns a
presigned S3 URL, using a server-side API key, with no authentication and no authorization.
Close both holes without breaking anonymous share-link viewers.

## 2. Current state

```js
const filepath = event.queryStringParameters.filepath;      // caller names any path
const res = await fetch(lambdaBaseUrl + '/api/v1/storage/' + encodedFilepath + '/no-redirect',
                        { headers: { 'x-api-key': apiKey } });
```

Two distinct defects:

1. **No authentication.** Anyone who finds the endpoint gets a presigned URL.
2. **No authorization on the path.** The caller names the file. Adding a session check alone
   would still let any signed-in user fetch any path they can guess or read from the API.

## 3. What the call graph actually is

Verified by reading, because it constrains the fix:

- The proxy has exactly one client: `AwsStorageService.getPresignedUrl`, reached only through
  `getVideoUrlForProject(outputVideoId)`, which always builds
  `pipeline-output/{outputVideoId}/streams/generated.mp4` (`awsStorageService.ts:5-7`).
  **No caller has ever passed a free-form path.**
- Two entry points: `VideoService.findOrCreateOutputVideo` (AWS pipeline ingest, from
  `EditorView.vue:1304`) and `VideoService.refreshAwsVideoUrl` (presigned URL refresh, from
  `EditorView.vue:783,787,1139` and `useVideoEventHandlers.ts:237`).
- **Anonymous callers are legitimate.** `router/index.ts:100` admits `isAuthenticated ||
  isSharedLink`, so `EditorView` mounts for share-link visitors, and it calls
  `refreshAwsVideoUrl` for AWS videos. Requiring a session outright would break anonymous
  viewing of a shared AWS video.

## 4. What is NOT wrong (investigated and cleared)

An earlier reading of this suggested `videos` SELECT was open to the anon key, which would
have made fixing the proxy pointless. That was wrong. Measured with the anon key:

```
videos anon can see:                                    34
  of which isPublic = false:                             6
  private ones NOT in an anon-visible public comparison: 0
```

All six are members of public comparisons, which is the "Videos in public comparisons are
viewable" policy behaving as designed: a shared comparison cannot render without its two
videos. `comparison_videos` is likewise correct (anon sees its public rows, zero non-public).

Evidence limit: without an authenticated session the total video count is unknown, so this
does not exhibit a private video being correctly hidden. It does show the policy is not
blanket-permissive, since no private video unconnected to a comparison is visible.

This matters to the design: the `videos` SELECT policy is trustworthy, so the proxy can
delegate its authorization decision to it instead of duplicating the rule.

## 5. Authorization rule

**Anonymous callers must resolve to a video they can already see. Signed-in callers are
allowed.**

The asymmetry is deliberate, for two reasons:

- `findOrCreateOutputVideo` fetches the presigned URL **before** `findVideoByOutputVideoId`
  runs (`videoService.ts:587-591`). On first ingest no `videos` row exists yet, so a
  lookup-for-everyone rule would 403 the ingest path.
- Gating a signed-in user gains nothing: every signed-in user can already see every video.
  What a signed-in caller loses under this design is the ability to name an arbitrary path,
  which is the actual hole.

## 6. Interface

```
GET /.netlify/functions/aws-storage?outputVideoId=<id>
    Authorization: Bearer <supabase access token>    // present when signed in, absent for share links
```

`filepath` is removed. The function builds
`pipeline-output/{outputVideoId}/streams/generated.mp4` itself. Path traversal and path
guessing stop being expressible, for every caller, authenticated or not.

## 7. Function logic

1. Require `outputVideoId` and require it to match `^[A-Za-z0-9_-]+$`. That rejects `/`,
   `..`, `%` and every other path-bearing character by construction rather than by blacklist.
   `400` on failure.
2. If an `Authorization: Bearer <token>` header is present, **verify it**:
   `GET {SUPABASE_URL}/auth/v1/user` with `apikey: {SUPABASE_ANON_KEY}` and the caller's
   `Authorization` header forwarded. HTTP 200 means the caller holds a valid Supabase
   session; allow. Any non-200 means the token is absent, malformed, expired or forged, and
   the caller is NOT treated as signed in: fall through to step 3.
3. Unauthenticated path. Resolve visibility through PostgREST with plain `fetch`:
   `GET {SUPABASE_URL}/rest/v1/videos?select=id&videoId=eq.aws:{outputVideoId}`
   with `apikey` and `Authorization` both set to the anon key. RLS decides. A returned row
   means the video is public or inside a public comparison. Empty array → `403`.
4. Build the path server-side and call the Lambda with the API key, exactly as today.

Step 2 must be a real verification, not a header-presence check. Trusting the presence of an
`Authorization` header would reintroduce the exact hole this design exists to close: any
caller could send `Authorization: Bearer anything` and be waved through.

Falling through on an invalid token rather than returning `401` is deliberate. A share-link
viewer whose session expired while the tab was open should still be able to play a public
video, exactly as a signed-out visitor can.

Steps 2 and 3 use `fetch` rather than `@supabase/supabase-js`. The dependency exists in the app, but
this function is a 52-line `.cjs` with no imports, and a single REST call keeps it that way.

Requires two new Netlify environment variables: `SUPABASE_URL` and `SUPABASE_ANON_KEY`
(non-`VITE_` copies of values that already exist).

Both details in step 1 and step 3 were checked against the live database on 2026-08-19:

- Every `videos.videoId` of the form `aws:*` carries a UUID, which satisfies
  `^[A-Za-z0-9_-]+$`. The regex will not reject a valid id. It is deliberately looser than a
  strict UUID pattern in case the pipeline ever emits a non-UUID id; it only needs to exclude
  path characters.
- `GET /rest/v1/videos?select=id&videoId=eq.aws:<uuid>` returns the row with the colon
  unquoted. PostgREST splits on the first `.` only, so no extra quoting is needed.

## 8. Client changes

- `AwsStorageService.getPresignedUrl(filepath)` becomes
  `getPresignedUrlForProject(outputVideoId)`: sends `outputVideoId`, and attaches the current
  Supabase session's access token as a bearer header when one exists.
- `getVideoUrlForProject` collapses into it.
- `buildFilepath` stays: it is no longer used to build the request, but `videoService.ts:588`
  still writes `filePath` onto the video row.
- Two call sites in `videoService.ts` (lines 587 and 668) change.

## 9. Error handling

- `400` malformed or missing `outputVideoId`
- `403` unauthenticated caller (no token, or an invalid one) whose `outputVideoId` resolves
  to no visible video
- `500` / `502` unchanged (missing configuration, upstream failure)

Accepted behaviour, not introduced here: `refreshAwsVideoUrl` writes the refreshed URL back
with `.update()` on `videos`, which is owner-gated, so an anonymous viewer's write already
no-ops silently today. Playback still works because the function returns the URL directly.

## 10. Testing

Unit tests for the handler, mocking `fetch`:

- caller with a VALID bearer token is allowed without a visibility query
- caller with a forged or expired bearer token is NOT treated as signed in: it falls through
  to the visibility check and is denied for a non-visible video. This is the regression guard
  for the header-presence mistake and must exist.
- anonymous caller whose video is visible is allowed
- anonymous caller whose video is not visible gets `403`
- missing `outputVideoId` gets `400`
- an `outputVideoId` containing a path separator or `..` gets `400` and never reaches the Lambda
- the Lambda is called with the server-built path, never with caller input

Manual: open a shared AWS video while signed out and confirm playback; run the AWS pipeline
ingest while signed in and confirm the video still loads.

## 11. Non-goals, logged

- The `videos` storage bucket is `public = true`, so anyone holding a URL can fetch the file
  regardless of this change. Separate work.
- A presigned URL, once issued, remains valid until it expires. Revoking a share does not
  recall URLs already handed out. Not fixable here.
- No rate limiting.
