-- migrations/20260704_watch_progress.sql
-- Per-user video watch coverage. One row per (user, video).
-- "watchedRanges" is a JSONB array of [startSec, endSec) intervals, merged client-side.
-- NOTE: no RLS, consistent with the rest of the schema (pending RLS phase).

CREATE TABLE IF NOT EXISTS public.video_watch_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" uuid NOT NULL,
    "videoId" uuid NOT NULL REFERENCES public.videos (id) ON DELETE CASCADE,
    "watchedRanges" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "percentWatched" numeric NOT NULL DEFAULT 0,
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT video_watch_progress_user_video_key UNIQUE ("userId", "videoId")
);

CREATE INDEX IF NOT EXISTS idx_video_watch_progress_video
    ON public.video_watch_progress ("videoId");
