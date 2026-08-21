-- migrations/20260821_annotation_surface.sql
-- Which surface of a match an annotation belongs to.
--
-- A match arrives as one `videos` row (videoId 'aws:<outputVideoId>'), and the
-- editor now shows two tabs over it: the rendered video, and the pipeline's
-- data output. Annotations on one must never appear on the other.
--
-- Deliberately a column and not a second `videos` row. A sibling row would be a
-- real dashboard project, showing up as a duplicate in the project list, in
-- recent-opens, in thumbnails and in share links; and it would carry a second
-- projectId, which splits the (userId, projectId) label vocabulary the two tabs
-- are meant to share.
--
-- NOT NULL DEFAULT 'video' is the load-bearing part: every existing annotation
-- backfills to 'video' and keeps appearing in the only tab that should show it.
-- A nullable column would make them all vanish.
--
-- Comparison annotations (videoId NULL, comparisonVideoId set) also take
-- 'video'. The value is meaningless for them: comparison loading scopes by
-- comparisonVideoId and never filters on surface, and the editor hides the tab
-- bar in dual mode.
--
-- Design: docs/superpowers/specs/2026-08-21-pipeline-output-tab-design.md

ALTER TABLE public.annotations
    ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'video';

ALTER TABLE public.annotations
    DROP CONSTRAINT IF EXISTS annotations_surface_check;

ALTER TABLE public.annotations
    ADD CONSTRAINT annotations_surface_check
    CHECK (surface IN ('video', 'pipeline'));

-- Every read of a single video's annotations now carries this predicate
-- alongside "videoId". Composite so the planner can satisfy both from one
-- index rather than filtering a whole video's annotations in memory.
CREATE INDEX IF NOT EXISTS idx_annotations_video_surface
    ON public.annotations ("videoId", surface);
