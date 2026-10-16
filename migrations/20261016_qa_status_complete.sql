-- QA status: staging and production are retired, complete takes their place.
--
-- Four values remain: not_started, in_review, failed, complete. Complete is
-- the terminal state and takes over production's filled pill on the frontend.
--
-- Three rows held a retired value when this was written (2 staging, 1
-- production). Both meant "passed QA", so all three become complete. This is a
-- relabel, not a review: "qaStatusUpdatedAt" and "qaStatusUpdatedBy" are left
-- alone so the attribution still names the person who actually set it.
--
-- Order is load-bearing:
--   1. drop the constraint, so the update is allowed to write 'complete';
--   2. remap the rows, so the new constraint does not fail on them;
--   3. add the constraint with the four values;
--   4. replace set_video_qa_status, whose own allow-list must match.
-- One transaction, so no reader sees the column unconstrained.
--
-- Deploy together with the frontend that offers 'complete'. Until then the
-- live client still offers staging and production, and the RPC rejects them
-- with 22023.
--
-- Idempotent: safe to run twice.

BEGIN;

ALTER TABLE public.videos
    DROP CONSTRAINT IF EXISTS videos_qa_status_check;

UPDATE public.videos
   SET "qaStatus" = 'complete'
 WHERE "qaStatus" IN ('staging', 'production');

ALTER TABLE public.videos
    ADD CONSTRAINT videos_qa_status_check
    CHECK ("qaStatus" IN ('not_started', 'in_review', 'failed', 'complete'));

-- Reproduced in full from migrations/20260903_rename_video.sql (the live
-- definition, verified with pg_get_functiondef on 2026-10-16). Only the status
-- list differs.
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
    IF p_status NOT IN ('not_started', 'in_review', 'failed', 'complete') THEN
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

COMMIT;
