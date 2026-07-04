# Watch Progress Tracking — Design

**Date:** 2026-07-04
**Status:** Approved

## Purpose

Measure how much of a video each user has actually watched, as a percentage of
unique coverage, so that collaborators can see whether a video has been
reviewed enough before annotations are added (e.g. "only 10% watched — needs
more viewing"). The indicator is informational only; it does not block
annotation.

## Approach

**Watched-seconds bitmap / merged ranges.** The video is treated as 1-second
buckets. While the video plays, each `time-update` event marks the current
second as seen. Percentage = unique seconds seen ÷ video duration. Seeking
does not fill the gap it jumps over, and rewatching the same segment does not
inflate the number. Approaches rejected: furthest-position watermark (jumping
to the end reads as 100%) and total-play-time counter (rewatching inflates,
can exceed 100%).

## Data model

New table `video_watch_progress`, one row per user per video:

| column            | type        | notes                                          |
| ----------------- | ----------- | ---------------------------------------------- |
| `id`              | uuid PK     | default `gen_random_uuid()`                    |
| `user_id`         | uuid        | FK → `auth.users`, part of unique constraint   |
| `video_id`        | uuid        | FK → `videos(id)` on delete cascade            |
| `watched_ranges`  | jsonb       | array of `[startSec, endSec]` merged intervals |
| `percent_watched` | numeric     | 0–100, computed client-side on write           |
| `updated_at`      | timestamptz | default `now()`                                |

Unique constraint on `(user_id, video_id)` so writes are upserts.

Comparison videos are tracked per underlying video: watching video A of a
comparison updates the row for A's `video_id`, video B updates B's. No
separate comparison-level row.

Migration file: `migrations/20260704_watch_progress.sql` (same convention as
`migrations/20260107_auth_migration.sql`, applied manually to Supabase).

**RLS caveat:** consistent with the rest of the schema today, this table has
no RLS; anyone with the anon key can read/write it. To be revisited in the
pending RLS phase (see shared-video-dashboard Phase 1).

## Components

### `src/services/watchProgressService.ts`

- `getProgress(videoId, userId)` → row or null.
- `getProgressForVideo(videoId)` → all users' rows (for the collaborator
  list), enriched with owner/user display info via the existing
  `ownerEnrichmentService` pattern.
- `upsertProgress(videoId, ranges, percent)` → upsert on
  `(user_id, video_id)`.
- Pure helpers (exported for tests): `mergeRanges(ranges)`,
  `addSecond(ranges, sec)`, `percentFromRanges(ranges, duration)`.

### `src/composables/useWatchProgress.ts`

`useWatchProgress(videoId, duration)`:

- Loads existing ranges on mount and merges new watching into them, so
  progress accumulates across sessions.
- `onTimeUpdate(currentTime)` — called from the editor's existing
  `handleTimeUpdate`; marks the current second only while playing (guarded by
  play/pause state so paused scrubbing doesn't count).
- Persists via `upsertProgress`, throttled to every 10 s of playback, plus
  flush on pause and on `beforeunload` / component unmount.
- Exposes reactive `percentWatched` for the UI.

### Display

1. **Editor (`EditorView.vue`)** — subtle own-progress hint near the
   annotation panel: "You've watched 12% of this video". In comparison mode,
   show the lower of the two videos' percentages, with a tooltip breaking down
   video A and video B individually.
2. **Dashboard video details sidebar (`VideoDetailsPanel.vue`)** — a
   per-collaborator list: user name + watch percentage (small progress bar),
   fetched via `getProgressForVideo` when the panel opens.

## Edge cases

- Playback-rate changes: buckets are marked by `currentTime`, not wall clock —
  correct by construction.
- Seeks: create a new range; the skipped gap stays unwatched.
- Videos shorter than a few seconds: per-second buckets still work; percent is
  clamped to 100.
- Duration unknown/zero (metadata not loaded yet): tracking is deferred until
  a positive duration is available.
- Unauthenticated/anonymous viewers: no tracking (no `user_id` to attribute).

## Testing

- Unit tests (Vitest, alongside existing `src/services/__tests__/`) for the
  pure helpers: range merging, percent computation, seek gaps, clamping.
- Composable test for throttle/flush behavior with a mocked service.
- Manual verification in the running app: watch a portion, reload, confirm
  accumulation and sidebar display.
