-- annotations.frame: backfill three legacy rows, then NOT NULL (2026-09-20)
--
-- Applied to production 2026-09-20 and verified (is_nullable = NO, 0 nulls);
-- types regenerated and the temporary override removed the same day.
--
-- Why: every code path treats an annotation's frame as a number - the timeline
-- sorts on it, and the drawing canvas matches drawings on strict frame
-- equality - but the column allows null. Three rows hold one (checked
-- read-only on 2026-09-20, 3 of 217): text annotations created on 2025-07-21,
-- before the column was populated. Each has "startFrame" set, which is the
-- same number every newer row stores in both columns, so the backfill takes it
-- from there.
--
-- The UPDATE only touches rows where frame is null and startFrame is not. If a
-- null frame with no startFrame ever appears, SET NOT NULL fails and changes
-- nothing, which is the right outcome: that row needs a human decision.

UPDATE public.annotations
   SET frame = "startFrame"
 WHERE frame IS NULL
   AND "startFrame" IS NOT NULL;

ALTER TABLE public.annotations ALTER COLUMN frame SET NOT NULL;

-- Rollback:
--   ALTER TABLE public.annotations ALTER COLUMN frame DROP NOT NULL;
--   (the backfilled values are correct and need no undoing)
