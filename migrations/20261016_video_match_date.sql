-- videos."matchDate": the day the match was played, for the dashboard's
-- match-date sort (2026-10-16).
--
-- A column, not a date parsed out of the title: about thirty titles carry a
-- date that is not a match date ("Video 30/07/2025" is the upload day), and a
-- title is free text anyone can rename.
--
-- Set from DALF's "Open in Perspecto" link, which carries `date=YYYY-MM-DD`
-- (see src/utils/pipelineTitle.ts). Null for everything DALF has not dated.
--
-- Idempotent: safe to run twice.

BEGIN;

ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS "matchDate" date;

-- Backfill only what DALF itself named: a pipeline video whose title is in
-- the link's format, "<home> vs <away> - <competition> - DD/MM/YYYY". On
-- 2026-10-16 that is one row (Manchester City vs PSG). The day and month
-- ranges in the pattern keep to_date from raising on an impossible date.
UPDATE public.videos
   SET "matchDate" = to_date(substring(title from '(\d{2}/\d{2}/\d{4})$'), 'DD/MM/YYYY')
 WHERE "videoId" LIKE 'aws:%'
   AND "matchDate" IS NULL
   AND title ~ ' vs .+ - (0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2])/[0-9]{4}$';

-- The write path. A function for the same reason as rename_video: the videos
-- UPDATE policy is owner-only, and DALF links are opened by whoever is on
-- duty, not by whoever first opened the pipeline output. Every video is
-- visible to every signed-in account (20261016_team_library_and_video_delete),
-- so the gate is "signed in, and the video exists".
CREATE OR REPLACE FUNCTION public.set_video_match_date(
    p_video_id uuid,
    p_match_date date
)
RETURNS public.videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row public.videos;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Setting a match date requires a signed-in user'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.videos v
       SET "matchDate" = p_match_date
     WHERE v.id = p_video_id
    RETURNING * INTO v_row;

    -- Not a no-op: a write that matched no row must not report success.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video % is not visible to the caller', p_video_id
            USING ERRCODE = '42501';
    END IF;

    RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_video_match_date(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_video_match_date(uuid, date) TO authenticated;

COMMIT;

-- Rollback:
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.set_video_match_date(uuid, date);
-- ALTER TABLE public.videos DROP COLUMN IF EXISTS "matchDate";
-- COMMIT;
