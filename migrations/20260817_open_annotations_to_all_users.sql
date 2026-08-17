-- Let any signed-in user annotate any video they can see (2026-08-17)
--
-- Until now the `annotations` INSERT policies accepted a row only from the
-- owner of the video/comparison, or on a share created with
-- `allowAnnotations = true`. Since `allowAnnotations` defaults to false and was
-- false on every row in production, annotating anything you did not own failed
-- with `42501 new row violates row-level security policy for table
-- "annotations"` - while the dashboard happily offered the annotation UI.
--
-- The product decision is that annotating is open: ownership and the
-- view-only/can-annotate share permission no longer restrict it.
--
-- Two things this deliberately does NOT change:
--   * `auth.uid()` is still required. Anonymous share-link visitors can comment
--     on a public video but still cannot create annotations.
--   * "Any video" means any video the caller can already SELECT - public, or
--     their own. Inserting against rows you cannot see stays impossible.
--
-- The three existing INSERT policies are left in place. Permissive policies OR
-- together, so they are now fully subsumed by the policy added here and have no
-- effect; they stay as a fallback until this change has been verified in
-- production, and should be dropped in a follow-up:
--   "Users can insert their own annotations"
--   "Users can insert annotations on their videos and comparison vid"
--   "Authenticated users can insert annotations on shared videos"

DROP POLICY IF EXISTS "Authenticated users can annotate visible videos" ON public.annotations;

CREATE POLICY "Authenticated users can annotate visible videos" ON public.annotations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = "userId"
    AND (
      ("videoId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.videos v
        WHERE v.id = annotations."videoId"
          AND (v."isPublic" = true OR v."ownerId" = auth.uid())
      ))
      OR
      ("comparisonVideoId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.comparison_videos cv
        WHERE cv.id = annotations."comparisonVideoId"
          AND (cv."isPublic" = true OR cv."userId" = auth.uid())
      ))
    )
  );


-- `annotation_labels` SELECT was gated on owning the annotation
-- (`a."userId" = auth.uid()`), while `annotations` SELECT lets you read other
-- people's annotations on public videos. `AnnotationService.getVideoAnnotations`
-- embeds `annotation_labels (labelId)`, so every annotation you do not own came
-- back with an empty labels array - no label name, no colour.
--
-- That was cosmetic while only owners could annotate. Now that everyone
-- annotates everything, it would mean nobody sees anyone else's labels, so it
-- has to widen with the INSERT policy. The condition below mirrors the
-- "Users can view annotations on shared content" SELECT policy.
--
-- The narrower "Users can view annotation labels" policy is left in place for
-- the same reason as above: permissive policies OR together, so it is now
-- redundant rather than restrictive.

DROP POLICY IF EXISTS "Users can view labels on visible annotations" ON public.annotation_labels;

-- Shape deliberately copied from the working "Users can read comments on
-- accessible annotations" policy on annotation_comments: two EXISTS subqueries
-- with inner joins, rather than one subquery with LEFT JOINs. Row-level security
-- applies to tables referenced inside a policy expression, so this is not a
-- neutral stylistic choice - it stays with the form already proven against these
-- tables.

CREATE POLICY "Users can view labels on visible annotations" ON public.annotation_labels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.annotations a
      JOIN public.videos v ON a."videoId" = v.id
      WHERE a.id = annotation_labels."annotationId"
        AND (
          v."isPublic" = true
          OR v."ownerId" = auth.uid()
          OR a."userId" = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.annotations a
      JOIN public.comparison_videos cv ON a."comparisonVideoId" = cv.id
      WHERE a.id = annotation_labels."annotationId"
        AND (
          cv."isPublic" = true
          OR cv."userId" = auth.uid()
          OR a."userId" = auth.uid()
        )
    )
  );

-- Rollback:
--
-- DROP POLICY IF EXISTS "Authenticated users can annotate visible videos" ON public.annotations;
-- DROP POLICY IF EXISTS "Users can view labels on visible annotations" ON public.annotation_labels;
--
-- The pre-existing policies are untouched, so dropping these two restores the
-- previous behaviour exactly.
