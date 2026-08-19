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

1. Require `outputVideoId`. Reject any value containing `/`, `..`, or `%`, or that is not a
   plain identifier. `400` on failure.
2. If an `Authorization: Bearer` header is present, treat the caller as signed in and allow.
3. Otherwise, resolve visibility through PostgREST with plain `fetch`:
   `GET {SUPABASE_URL}/rest/v1/videos?select=id&videoId=eq.aws:{outputVideoId}`
   with `apikey` and `Authorization` both set to the anon key. RLS decides. A returned row
   means the video is public or inside a public comparison. Empty array → `403`.
4. Build the path server-side and call the Lambda with the API key, exactly as today.

Step 3 uses `fetch` rather than `@supabase/supabase-js`. The dependency exists in the app, but
this function is a 52-line `.cjs` with no imports, and a single REST call keeps it that way.

Requires two new Netlify environment variables: `SUPABASE_URL` and `SUPABASE_ANON_KEY`
(non-`VITE_` copies of values that already exist).

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
- `403` anonymous caller whose `outputVideoId` resolves to no visible video
- `500` / `502` unchanged (missing configuration, upstream failure)

Accepted behaviour, not introduced here: `refreshAwsVideoUrl` writes the refreshed URL back
with `.update()` on `videos`, which is owner-gated, so an anonymous viewer's write already
no-ops silently today. Playback still works because the function returns the URL directly.

## 10. Testing

Unit tests for the handler, mocking `fetch`:

- signed-in caller (bearer header present) is allowed without a visibility query
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
