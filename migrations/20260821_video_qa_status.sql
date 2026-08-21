-- migrations/20260821_video_qa_status.sql
-- QA completion status per video.
--
-- Five values, ordered as the work flows. `failed` exists because a QA control
-- with no way to say "this did not pass" forces reviewers to leave the video in
-- a state that lies. `not_started` exists because it is what all 171 existing
-- rows are.
--
-- Labels only. Nothing reads this column to gate, filter or trigger anything.
--
-- Design: docs/superpowers/specs/2026-08-21-video-qa-status-design.md

ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS "qaStatus" text NOT NULL DEFAULT 'not_started';

ALTER TABLE public.videos
    DROP CONSTRAINT IF EXISTS videos_qa_status_check;

ALTER TABLE public.videos
    ADD CONSTRAINT videos_qa_status_check
    CHECK ("qaStatus" IN ('not_started', 'in_review', 'failed', 'staging', 'production'));

-- NOT NULL DEFAULT is the load-bearing part, same as annotations.surface: every
-- existing row backfills to a real value. A nullable column renders the control
-- empty on every row and makes each read site invent a fallback.
ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS "qaStatusUpdatedAt" timestamptz;

-- SET NULL, not CASCADE. Deleting a user must never delete the video they last
-- touched.
ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS "qaStatusUpdatedBy" uuid
        REFERENCES public.users(id) ON DELETE SET NULL;

-- The write path.
--
-- Direct UPDATE on videos is auth.uid() = "ownerId". QA is done by people who
-- are not the uploader, and row-level security is row level, not column level:
-- opening the UPDATE policy to `authenticated` would also let any account
-- rename, re-URL or unpublish any video in the system. So the UPDATE policy is
-- left alone and the write goes through this function instead.
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
    -- write. It mirrors the three SELECT policies on public.videos as they stand
    -- today: own, public, and member of a public comparison. If those policies
    -- change, this function changes in the same migration.
    UPDATE public.videos v
       SET "qaStatus" = p_status,
           "qaStatusUpdatedAt" = now(),
           "qaStatusUpdatedBy" = v_caller,
           "updatedAt" = now()
     WHERE v.id = p_video_id
       AND (
             v."ownerId" = v_caller
          OR v."isPublic" = true
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
    --
    -- FOUND is the right test and was verified against this database, not
    -- assumed: an UPDATE ... RETURNING * INTO that matches no row leaves FOUND
    -- false. Do not "simplify" this to v_row.id IS NULL without re-running that
    -- probe.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video % is not visible to the caller', p_video_id
            USING ERRCODE = '42501';
    END IF;

    RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_video_qa_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_video_qa_status(uuid, text) TO authenticated;
