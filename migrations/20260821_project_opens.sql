-- migrations/20260821_project_opens.sql
-- Per-user "last opened" record, one row per (user, project). Drives the
-- dashboard's recency ordering: what YOU opened floats to the top of YOUR
-- list, and nobody else's opens move anything for you.
--
-- Shaped like `annotations` (nullable "videoId" + nullable "comparisonVideoId"),
-- which is this schema's existing way to point a row at either project type.
-- `video_watch_progress` could not be reused: its "videoId" is NOT NULL and
-- REFERENCES videos, so it structurally cannot record an opened comparison.

CREATE TABLE IF NOT EXISTS public.project_opens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" uuid NOT NULL,
    "videoId" uuid REFERENCES public.videos (id) ON DELETE CASCADE,
    "comparisonVideoId" uuid REFERENCES public.comparison_videos (id) ON DELETE CASCADE,
    "openedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_opens_one_target
        CHECK (num_nonnulls("videoId", "comparisonVideoId") = 1),
    -- Plain unique constraints, deliberately NOT partial unique indexes.
    -- Postgres treats NULLs as distinct, so dual rows ("videoId" NULL) never
    -- collide on the first constraint and single rows never collide on the
    -- second. A partial index would look tidier and would break the write:
    -- ON CONFLICT cannot infer a partial index unless the statement repeats
    -- the predicate, which PostgREST does not emit.
    CONSTRAINT project_opens_user_video_key UNIQUE ("userId", "videoId"),
    CONSTRAINT project_opens_user_comparison_key UNIQUE ("userId", "comparisonVideoId")
);

CREATE INDEX IF NOT EXISTS idx_project_opens_user_recent
    ON public.project_opens ("userId", "openedAt" DESC);

-- RLS from the start. This is per-user visibility data by definition, so it
-- does not inherit the "no RLS, pending RLS phase" note on
-- migrations/20260704_watch_progress.sql.
ALTER TABLE public.project_opens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own opens" ON public.project_opens;
CREATE POLICY "Users can read their own opens" ON public.project_opens
    FOR SELECT TO authenticated
    USING (auth.uid() = "userId");

DROP POLICY IF EXISTS "Users can record their own opens" ON public.project_opens;
CREATE POLICY "Users can record their own opens" ON public.project_opens
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = "userId");

-- UPDATE is required as well as INSERT: the write is an upsert, so the second
-- open of the same project updates the existing row.
DROP POLICY IF EXISTS "Users can update their own opens" ON public.project_opens;
CREATE POLICY "Users can update their own opens" ON public.project_opens
    FOR UPDATE TO authenticated
    USING (auth.uid() = "userId")
    WITH CHECK (auth.uid() = "userId");
