# Remove local video upload — design

**Date:** 2026-07-31
**Branch:** `v3.8`
**Goal:** Users can no longer upload videos manually. Videos enter the system only
via the AWS pipeline.

## Context

On 3.8, local upload is the only user-facing way a video enters the app. The other
paths are:

- **AWS pipeline** — `VideoService.findOrCreateOutputVideo()` creates a video row when
  a pipeline deep-link is opened. Unaffected by this change.
- **`VideoService.createUrlVideo()`** — exists but has no UI referencing it.
  Unreachable; left alone.

After this change, videos arrive only through the pipeline. Existing uploaded videos
(84 objects in storage) keep playing and can still be deleted.

## Scope decisions

| Decision | Choice |
|---|---|
| Removal depth | Delete the UI *and* strip the service |
| `videoUploadService.ts` | Delete the file; move `deleteUploadedVideo` into `videoService.ts` |
| Server-side enforcement | Yes — drop the storage INSERT policy |
| Migration application | Apply to the live database |

## 1. Code removal

**Deleted files**

- `src/components/VideoUpload.vue` — file picker / drag-drop UI
- `src/services/videoUploadService.ts` — entire file

Seven of its eight methods are upload-only: `validateVideoFile`,
`validateVideoCompatibility`, `extractVideoMetadata`, `uploadVideo`,
`uploadWithProgress`, `createUploadedVideoRecord`, `uploadVideoComplete`.

**`src/services/videoService.ts`**

Drop the `VideoUploadService` import. Inline the storage cleanup into `deleteVideo`,
which is `deleteUploadedVideo`'s only caller. Behaviour is preserved: the row is
always deleted, the storage object is removed only for uploaded videos, and a storage
failure stays non-fatal.

**`src/stores/layout.ts`**

Remove `isVideoUploadModalOpen`, `openVideoUploadModal`, `closeVideoUploadModal`.

**`src/views/DashboardView.vue`**

Remove the `VideoUpload` import, the modal block, the handlers `openVideoUpload`,
`closeVideoUpload`, `handleVideoUploadSuccess`, `handleVideoUploadError`, and both
`@upload-video` bindings.

**`src/components/CreateComparisonModal.vue`**

Remove the `upload-video` emit and the "Upload Videos" button.

**`src/components/ProjectManagementModal.vue`**

Remove the `upload-video` emit, `showUploadDialog()`, the toolbar "Upload Video"
button, and the "Upload Your First Video" button.

### Must NOT be removed

`video.videoType === 'upload'` is the **playback** path for the 84 existing objects,
not an upload affordance. These stay untouched:

- `src/views/DashboardView.vue:80` — `videoType === 'upload' && filePath` → `getPublicUrl`
- `src/services/videoService.ts:64` — same branch when resolving a video URL
- the storage `SELECT` and `DELETE` policies

Rule for the diff: remove only what *creates* an upload; keep everything that *reads
or deletes* one.

## 2. Empty-state copy

Screens that currently instruct users to upload need rewording, or they read as
broken once the buttons are gone.

| Location | Before | After |
|---|---|---|
| `ProjectManagementModal` | "No projects yet" / "Upload a video to get started" | "No videos yet" / "Videos appear here once they've been processed by the pipeline." |
| `CreateComparisonModal` | "You need at least two videos to create a comparison. Upload some videos first to get started." | "You need at least two videos to create a comparison." |

## 3. Storage lockdown

`migrations/20260731_revoke_video_uploads.sql`

Live `storage.objects` has three policies, all scoped to `bucket_id = 'videos'`:

| Policy | Command | Fate |
|---|---|---|
| `Users can upload videos` | INSERT | dropped |
| `Users can view videos` | SELECT | kept — playback |
| `Users can delete their own videos` | DELETE | kept — delete cleanup |

`videos` is the only bucket and is `public = true`, so `getPublicUrl` reads do not
depend on the SELECT policy. Dropping INSERT does not touch the 84 stored objects.

The migration file carries its own rollback DDL as a comment, so returning to 3.9
does not require reconstructing the policy from scratch.

**Blast radius:** the database is shared with the live production 3.8 deploy, so the
lockdown takes effect there as soon as it is applied — not at next deploy. It also
disables upload on the `master` (3.9) branch.

## 4. Sequencing

Code removal first, verified, then the migration. While the INSERT policy is still
live, verification runs against a database in its known-good state.

## 5. Verification

3.8 has no test script — vitest arrived in 3.9. So:

1. `npm run build` completes clean.
2. `git grep -n "VideoUpload\|isVideoUploadModalOpen\|openVideoUploadModal\|closeVideoUploadModal\|upload-video\|showUploadDialog" src/`
   returns nothing. `vite build` does not type-check templates, so a stale template
   reference to a removed store member would otherwise build green and fail at runtime.
3. Dev server boots; dashboard loads with no upload affordance anywhere.
4. An existing uploaded video still plays.
5. Deleting an uploaded video still removes its storage object.
