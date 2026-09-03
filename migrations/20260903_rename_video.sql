-- migrations/20260903_rename_video.sql
-- Renaming a video, and pipeline outputs as shared material (2026-09-03)
--
-- Three things in one file because they cannot be separated safely: the
-- policies that decide who can see a pipeline output, the function whose
-- predicate mirrors those policies, and the trigger that logs what the function
-- does. Splitting them would leave a window in which set_video_qa_status
-- disagrees with the policies it documents itself as mirroring.
--
-- Design: docs/superpowers/specs/2026-09-03-rename-video-design.md

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Pipeline outputs become visible to every signed-in account.
-- ---------------------------------------------------------------------------
--
-- Every policy here is added, never edited. Permissive policies are OR'd, so an
-- added policy cannot narrow anything that works today, while threading a new
-- clause through the six live expressions would put six working policies at
-- risk to express one idea.
--
-- The predicate is `"videoId" LIKE 'aws:%'`, the same one
-- videos_aws_video_id_unique uses. It is stringly typed deliberately: `aws:` is
-- already how this codebase says "pipeline output" - in that index, in
-- VideoService.isAwsVideo, and in the storage proxy's PostgREST query. A marker
-- column would be a second source of truth to keep in step with the first.
--
-- TO authenticated, never role public. The five existing SELECT policies on
-- videos are role public, which is why `isPublic = true` was not an option
-- here: it would hand pipeline outputs to anon as well.

DROP POLICY IF EXISTS "Signed-in users can view pipeline outputs" ON public.videos;
CREATE POLICY "Signed-in users can view pipeline outputs" ON public.videos
    FOR SELECT TO authenticated
    USING ("videoId" LIKE 'aws:%');

-- The videos policy alone is not enough. The four policies below gate on the
-- video's owner inside their own expressions, so a reader who can now see the
-- video would still find it empty and read-only.

DROP POLICY IF EXISTS "Signed-in users can view annotations on pipeline outputs" ON public.annotations;
CREATE POLICY "Signed-in users can view annotations on pipeline outputs"
    ON public.annotations
    FOR SELECT TO authenticated
    USING (
        annotations."videoId" IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.videos v
            WHERE v.id = annotations."videoId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

DROP POLICY IF EXISTS "Signed-in users can annotate pipeline outputs" ON public.annotations;
CREATE POLICY "Signed-in users can annotate pipeline outputs"
    ON public.annotations
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = annotations."userId"
        AND annotations."videoId" IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.videos v
            WHERE v.id = annotations."videoId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

DROP POLICY IF EXISTS "Signed-in users can read comments on pipeline outputs" ON public.annotation_comments;
CREATE POLICY "Signed-in users can read comments on pipeline outputs"
    ON public.annotation_comments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.annotations a
            JOIN public.videos v ON v.id = a."videoId"
            WHERE a.id = annotation_comments."annotationId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

DROP POLICY IF EXISTS "Signed-in users can comment on pipeline outputs" ON public.annotation_comments;
CREATE POLICY "Signed-in users can comment on pipeline outputs"
    ON public.annotation_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND annotation_comments."userId" = auth.uid()
        AND annotation_comments."isAnonymous" = false
        AND EXISTS (
            SELECT 1 FROM public.annotations a
            JOIN public.videos v ON v.id = a."videoId"
            WHERE a.id = annotation_comments."annotationId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

-- This one looks redundant and is not. activity_events' existing policy already
-- joins videos, so it is tempting to assume a wider videos policy makes it
-- start matching. It does not: that expression re-states the ownership test
-- itself (`v."isPublic" = true OR v."ownerId" = auth.uid()`) rather than
-- deferring to whether the row is visible, so widening videos leaves it exactly
-- as strict as it was.
DROP POLICY IF EXISTS "Signed-in users can view activity on pipeline outputs" ON public.activity_events;
CREATE POLICY "Signed-in users can view activity on pipeline outputs"
    ON public.activity_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.videos v
            WHERE v.id = activity_events."videoId"
              AND v."videoId" LIKE 'aws:%'
        )
    );


-- ---------------------------------------------------------------------------
-- 2. set_video_qa_status keeps its promise.
-- ---------------------------------------------------------------------------
--
-- That function's comment states an invariant: it mirrors the SELECT policies
-- on public.videos, and if those policies change it changes in the same
-- migration. Section 1 changed them. Without this, a non-owner could rename a
-- pipeline output but not set its QA status, which nobody could predict.
--
-- Reproduced in full rather than patched, because there is no way to alter one
-- clause of a function body in place.

CREATE OR REPLACE FUNCTION public.set_video_qa_status(
    p_video_id uuid,
    p_status text
)
RETURNS public.videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_row public.videos;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'QA status requires a signed-in user'
            USING ERRCODE = '42501';
    END IF;

    -- The CHECK constraint would catch this too, but as a constraint violation
    -- rather than something the caller can act on.
    IF p_status NOT IN ('not_started', 'in_review', 'failed', 'staging', 'production') THEN
        RAISE EXCEPTION 'Unknown QA status: %', p_status
            USING ERRCODE = '22023';
    END IF;

    -- SECURITY DEFINER bypasses RLS, so this predicate is the only gate on the
    -- write. It mirrors the SELECT policies on public.videos as they stand
    -- after this migration: own, public, pipeline output, and member of a
    -- public comparison. If those policies change, this function changes in the
    -- same migration.
    UPDATE public.videos v
       SET "qaStatus" = p_status,
           "qaStatusUpdatedAt" = now(),
           "qaStatusUpdatedBy" = v_caller,
           "updatedAt" = now()
     WHERE v.id = p_video_id
       AND (
             v."ownerId" = v_caller
          OR v."isPublic" = true
          OR v."videoId" LIKE 'aws:%'
          OR v.id IN (
                 SELECT c."videoAId" FROM public.comparison_videos c WHERE c."isPublic"
                 UNION
                 SELECT c."videoBId" FROM public.comparison_videos c WHERE c."isPublic"
             )
       )
    RETURNING * INTO v_row;

    -- Not a no-op. A denied write that returns success is the failure mode this
    -- whole function exists to avoid: a policy-gated UPDATE matching no row
    -- returns 2xx with zero rows, which the frontend cannot tell from success.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video % is not visible to the caller', p_video_id
            USING ERRCODE = '42501';
    END IF;

    RETURN v_row;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. The rename.
-- ---------------------------------------------------------------------------
--
-- A function rather than a policy, for the three reasons
-- migrations/20260820_set_video_thumbnail.sql and
-- migrations/20260821_video_qa_status.sql already record between them:
--
--  * RLS is row level, so a permissive UPDATE policy would hand out url,
--    isPublic and ownerId along with title.
--  * Column GRANTs cannot separate owner from non-owner, because both are the
--    same `authenticated` role.
--  * Column GRANTs only bite once table-level UPDATE is revoked, and revoking
--    it would break the presigned-URL refresh, which writes url on every open.
--
-- The predicate deliberately reaches past pipeline outputs to public videos and
-- members of public comparisons: it mirrors what the caller can see, exactly as
-- set_video_qa_status does. Splitting the two, so that a video's QA status is
-- editable by the team but its name is not, would be an inconsistency nobody
-- could predict from the outside. The recovery for a rename by the wrong person
-- is the history entry written below, which records the previous name and who
-- changed it.

CREATE OR REPLACE FUNCTION public.rename_video(p_video_id uuid, p_title text)
RETURNS public.videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_title  text := btrim(coalesce(p_title, ''));
    v_row    public.videos;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Renaming a video requires a signed-in user'
            USING ERRCODE = '42501';
    END IF;

    IF v_title = '' THEN
        RAISE EXCEPTION 'A video name cannot be empty'
            USING ERRCODE = '22023';
    END IF;

    IF length(v_title) > 200 THEN
        RAISE EXCEPTION 'A video name cannot be longer than 200 characters'
            USING ERRCODE = '22023';
    END IF;

    -- "updatedAt" is not set here. update_videos_updated_at, a BEFORE UPDATE
    -- trigger on this table, already maintains it.
    UPDATE public.videos v
       SET title = v_title
     WHERE v.id = p_video_id
       AND (
             v."ownerId" = v_caller
          OR v."isPublic" = true
          OR v."videoId" LIKE 'aws:%'
          OR v.id IN (
                 SELECT c."videoAId" FROM public.comparison_videos c WHERE c."isPublic"
                 UNION
                 SELECT c."videoBId" FROM public.comparison_videos c WHERE c."isPublic"
             )
       )
    RETURNING * INTO v_row;

    -- Not a no-op. A policy-gated UPDATE that matches no row returns 2xx with
    -- zero rows, which the frontend cannot tell from success. FOUND is the right
    -- test and was verified against this database for set_video_qa_status: an
    -- UPDATE ... RETURNING * INTO that matches no row leaves FOUND false.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video % is not visible to the caller', p_video_id
            USING ERRCODE = '42501';
    END IF;

    RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rename_video(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rename_video(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. The rename lands in the video's history.
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_events
    DROP CONSTRAINT IF EXISTS "activity_events_entityType_check";
ALTER TABLE public.activity_events
    ADD CONSTRAINT "activity_events_entityType_check"
    CHECK ("entityType" IN ('annotation', 'comment', 'video'));

CREATE OR REPLACE FUNCTION public.log_video_rename_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor uuid := auth.uid();
BEGIN
    -- Same degrade-to-NULL as log_annotation_activity(): "actorId" references
    -- public.users, and this table must never fail a write it is only
    -- observing. Letting the foreign key raise 23503 here would abort the
    -- rename over a log entry.
    IF v_actor IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN
        v_actor := NULL;
    END IF;

    -- No fallback actor, unlike log_annotation_activity(). rename_video refuses
    -- a null auth.uid(), so an unattributed rename cannot reach here from the
    -- app; one that arrives some other way is genuinely unattributed and should
    -- say so rather than name a plausible owner.
    --
    -- "entityId" is the video's own id. The other two entity types point at
    -- something that can outlive its parent, which is why "entityId" carries no
    -- foreign key; a video event points at the video itself, so the
    -- ON DELETE CASCADE on "videoId" takes this row with it.
    INSERT INTO public.activity_events (
        "videoId", "actorId", "entityType", "entityId", action, summary
    ) VALUES (
        NEW.id, v_actor, 'video', NEW.id, 'updated',
        jsonb_build_object('from', OLD.title, 'to', NEW.title)
    );

    RETURN NULL;
END;
$$;

-- The WHEN clause is the load-bearing part of this trigger.
-- VideoService.findOrCreateOutputVideo and VideoService.refreshAwsVideoUrl both
-- write `url` on every single open of a pipeline output, and ensureAwsThumbnail
-- writes `thumbnailUrl` on some. Anything looser than a title comparison turns
-- every DALF click into a history entry.
--
-- A WHEN clause rather than an IF in the body: the trigger does not fire at all,
-- and it cannot be defeated by a later edit to the function.
--
-- No cascade guard, unlike log_annotation_activity(). This trigger is
-- UPDATE-only, and a deleted video cannot be updated.
DROP TRIGGER IF EXISTS log_video_rename_activity ON public.videos;
CREATE TRIGGER log_video_rename_activity
    AFTER UPDATE ON public.videos
    FOR EACH ROW
    WHEN (NEW.title IS DISTINCT FROM OLD.title)
    EXECUTE FUNCTION public.log_video_rename_activity();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Rollback:
--
-- DROP TRIGGER IF EXISTS log_video_rename_activity ON public.videos;
-- DROP FUNCTION IF EXISTS public.log_video_rename_activity();
-- DROP FUNCTION IF EXISTS public.rename_video(uuid, text);
--
-- DROP POLICY IF EXISTS "Signed-in users can view pipeline outputs" ON public.videos;
-- DROP POLICY IF EXISTS "Signed-in users can view annotations on pipeline outputs" ON public.annotations;
-- DROP POLICY IF EXISTS "Signed-in users can annotate pipeline outputs" ON public.annotations;
-- DROP POLICY IF EXISTS "Signed-in users can read comments on pipeline outputs" ON public.annotation_comments;
-- DROP POLICY IF EXISTS "Signed-in users can comment on pipeline outputs" ON public.annotation_comments;
-- DROP POLICY IF EXISTS "Signed-in users can view activity on pipeline outputs" ON public.activity_events;
--
-- Two things do not come back on their own. The "entityType" constraint cannot
-- be narrowed again while 'video' rows exist, so delete those rows first if the
-- constraint is being restored. And set_video_qa_status has to be restored to
-- its previous four-clause predicate by re-running
-- migrations/20260821_video_qa_status.sql, since rolling back a policy change
-- has to roll back the function that mirrors it.
