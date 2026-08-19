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

### 4a. Correction, 2026-08-19: signed-in users do NOT see every video

An earlier draft of section 5 justified letting verified signed-in callers skip the visibility
check with "every signed-in user can already see every video." Measured with a real session
against the live database, that is false:

```
videos visible only when signed in:   6
  owned by the signed-in user:        6
  owned by SOMEONE ELSE:              0
```

A signed-in user sees public videos, videos inside public comparisons, and their own. They see
zero private videos belonging to other owners. Allowing a verified caller outright would
therefore have granted more than the app itself does. Section 5 below is the corrected rule.

## 5. Authorization rule

**Every caller is checked the same way: can you see this video?** There is no signed-in
shortcut. The proxy forwards the caller's own credentials to PostgREST and lets the `videos`
SELECT policy answer, so the proxy's rule is exactly the app's rule and cannot drift from it.

The reason an asymmetry was ever considered: `findOrCreateOutputVideo` fetched the presigned URL
**before** the `videos` row existed, so on first ingest there was nothing to be visible. With
only the anon key the function cannot tell "no row exists" apart from "a row exists that you
may not see" - both return `[]`.

That is resolved in the client rather than in the policy: **the `videos` row is created before
the presigned URL is fetched.** See section 8. Once the row exists, the owner can see it, the
uniform check passes, and the asymmetry disappears.

## 6. Interface

```
GET /.netlify/functions/aws-storage?outputVideoId=<id>
    Authorization: Bearer <supabase access token>    // present when signed in, absent for share links
```

`filepath` is removed. The function builds
`pipeline-output/{outputVideoId}/streams/generated.mp4` itself. Path traversal and path
guessing stop being expressible, for every caller, authenticated or not.

## 7. Function logic

1. Require `outputVideoId` and require it to match `^[A-Za-z0-9_-]+$`. That rejects `/`, `..`,
   `%` and every other path-bearing character by construction rather than by blacklist. `400`
   on failure.
2. Resolve visibility through PostgREST with plain `fetch`:
   `GET {SUPABASE_URL}/rest/v1/videos?select=id&videoId=eq.aws:{outputVideoId}`
   with `apikey: {SUPABASE_ANON_KEY}` and `Authorization` set to the caller's own header when
   one is present, or to the anon key when it is not. PostgREST validates the JWT and applies
   RLS. A returned row means the caller may see this video.
3. If that request comes back non-ok (a forged, malformed or expired token makes PostgREST
   answer `401`), retry once with the anon key in place of the caller's header. This is what
   lets a share-link viewer whose session lapsed keep playing a public video, instead of being
   rejected outright.
4. Empty array, or a non-array body, means `403`. Any network or parse failure in steps 2 and 3
   means `502`, never a silent allow.
5. Build the path server-side and call the Lambda with the API key, exactly as today.

No separate `GET /auth/v1/user` call is needed. PostgREST verifies the token itself as part of
answering the query, so one request does authentication and authorization together. This is
both simpler and stricter than verifying the token and then trusting it.

Requires two new Netlify environment variables: `SUPABASE_URL` and `SUPABASE_ANON_KEY`
(non-`VITE_` copies of values that already exist).

**`SUPABASE_ANON_KEY` must be the anon key, not the service_role key.** They sit in the same
dashboard panel and are both labelled "key". A service_role key bypasses RLS, which would make
step 2 return a row for every request and silently authorize everyone. The handler asserts the
key's `role` claim is `anon` and returns `500` if it is not.

Both details in step 1 and step 2 were checked against the live database on 2026-08-19:

- Every `videos.videoId` of the form `aws:*` carries a UUID, which satisfies
  `^[A-Za-z0-9_-]+$`. The regex will not reject a valid id. It is deliberately looser than a
  strict UUID pattern in case the pipeline ever emits a non-UUID id; it only needs to exclude
  path characters.
- `GET /rest/v1/videos?select=id&videoId=eq.aws:<uuid>` returns the row with the colon
  unquoted. PostgREST splits on the first `.` only, so no extra quoting is needed.

## 8. Client changes

**`src/services/awsStorageService.ts`**

- `getVideoUrlForProject(outputVideoId)` keeps its name and signature. Its body sends
  `?outputVideoId=` instead of `?filepath=`, and attaches the current Supabase session's access
  token as a bearer header when one exists. Anonymous share-link viewers have no session, and
  sending no header is a valid case that the function handles.
- The private `getPresignedUrl(filepath)` is deleted.

**`src/services/videoService.ts` - `findOrCreateOutputVideo`**

The order changes. Today it fetches the presigned URL first and creates the row afterwards.
It must create the row first, because a row that does not exist is not visible to anyone and
the proxy now authorizes on visibility:

1. Look up the existing record by output video id.
2. If there is none, insert it now, with `url: ''`. The insert no longer carries a thumbnail.
3. Fetch the presigned URL. **If this throws and the row was created in step 2, delete that row
   before rethrowing**, so a failed ingest does not leave a permanently blank video in the
   library.
4. Generate the thumbnail if the record has none, unchanged, including the existing 15 second
   timeout race.
5. Update the row with the presigned URL and the thumbnail if one was produced, and return it.

This collapses the previous insert-or-update fork into a single update, since step 2 guarantees
a row exists.

Also delete the dead local at `videoService.ts:588`: it assigns
`AwsStorageService.buildFilepath(outputVideoId)` to a variable that is never read, and the
inserted row is never given a `filePath` at all. Leave `buildFilepath` itself in place; it then
has no callers, which is recorded in section 11 rather than fixed here.

## 9. Error handling

- `400` malformed or missing `outputVideoId`
- `403` any caller whose `outputVideoId` resolves to no video they can see
- `502` the visibility lookup failed at the network or parse level. Never a silent allow.
- `500` / `502` unchanged (missing configuration, upstream failure)

Accepted behaviour, not introduced here: `refreshAwsVideoUrl` writes the refreshed URL back
with `.update()` on `videos`, which is owner-gated, so an anonymous viewer's write already
no-ops silently today. Playback still works because the function returns the URL directly.

## 10. Testing

Unit tests for the handler, mocking `fetch`:

- a caller whose token resolves to a visible video is allowed
- a caller whose token resolves to no visible video gets `403`, and the Lambda is never called
- an anonymous caller whose video is visible is allowed
- an anonymous caller whose video is not visible gets `403`
- a forged or expired token makes the lookup answer non-ok, and the handler retries with the
  anon key rather than rejecting. This is the regression guard for share-link viewers.
- the caller's own `Authorization` header is forwarded on the first lookup, and `apikey` is
  always sent
- missing `outputVideoId` gets `400`
- an `outputVideoId` containing a path separator or `..` gets `400` and never reaches the Lambda
- the Lambda is called with the server-built path, never with caller input
- a thrown network error in the lookup gets `502`, and the Lambda is never called
- a non-array PostgREST body gets `403`, and the Lambda is never called
- a `SUPABASE_ANON_KEY` whose `role` claim is not `anon` gets `500`

Unit test for the client reorder:

- when no record exists, the row is inserted before the presigned URL is fetched
- when the presigned URL fetch throws on a freshly created row, that row is deleted

Manual: open a shared AWS video while signed out and confirm playback; run the AWS pipeline
ingest while signed in and confirm the video still loads and is not left blank.

## 11. Non-goals, logged

- The `videos` storage bucket is `public = true`, so anyone holding a URL can fetch the file
  regardless of this change. Separate work.
- A presigned URL, once issued, remains valid until it expires. Revoking a share does not
  recall URLs already handed out. Not fixable here.
- No rate limiting.
- `AwsStorageService.buildFilepath` has no callers once the dead local in `videoService.ts` is
  removed. Left in place because it is mocked by
  `src/services/__tests__/outputVideoThumbnail.test.ts`, and removing it would churn a test
  this change has no other reason to touch.
