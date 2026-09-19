-- Let the first viewer store a pipeline video's real duration and fps (2026-09-20)
--
-- NOT APPLIED YET. Apply with:
--   supabase db query --linked -f migrations/20260920_set_video_media_info.sql
--   npm run gen:types
--
-- Why: a pipeline output's row has to exist before its file can be requested
-- (the storage proxy authorises by asking whether the caller can see the row),
-- so findOrCreateOutputVideo inserts it with a placeholder: duration 1,
-- fps 30, totalFrames 30. Nothing ever replaced it. On 2026-09-20 all 37
-- `aws:` rows still held duration = 1. Two visible effects:
--   - the library shows "0:01" for every pipeline output;
--   - watch coverage is measured against the stored duration, so a two-hour
--     match reads "100% watched" after its first second.
--
-- Why a function: the same reason as set_video_thumbnail. The `videos` UPDATE
-- policy is owner-gated, pipeline outputs are opened by the whole team, and a
-- permissive UPDATE policy would hand out every column. This crosses the policy
-- for one checked write only.
--
-- What it can do, exhaustively: on one `aws:` row (pipeline outputs are visible
-- to every signed-in account, so signed-in is the whole visibility check), and
-- only while that row still holds the placeholder duration, set duration, fps and
-- totalFrames (derived here, not supplied). It cannot change a video whose
-- duration has been set, so the worst a caller can do is be the first to
-- measure a video, which is the intended use. It touches no other column.
--
-- Returns true when it wrote, false otherwise (already set, not visible, not a
-- pipeline video, or gone). false is a normal outcome: two viewers race to be
-- first, and the function must not confirm that a private id exists.

CREATE OR REPLACE FUNCTION public.set_video_media_info(
    p_video_id uuid,
    p_duration numeric,
    p_fps numeric
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  rows_updated integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'set_video_media_info requires an authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Bounds a browser could plausibly report: over the placeholder and under
  -- a day; between 1 and 240 frames a second.
  IF p_duration IS NULL OR p_duration <= 1 OR p_duration > 86400 THEN
    RAISE EXCEPTION 'duration must be between 1 and 86400 seconds'
      USING ERRCODE = '22023';
  END IF;
  IF p_fps IS NULL OR p_fps < 1 OR p_fps > 240 THEN
    RAISE EXCEPTION 'fps must be between 1 and 240'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.videos v
     SET duration = p_duration,
         fps = p_fps,
         "totalFrames" = round(p_duration * p_fps)::integer,
         "updatedAt" = now()
   WHERE v.id = p_video_id
     AND v."videoId" LIKE 'aws:%'
     AND v.duration <= 1;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.set_video_media_info(uuid, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_video_media_info(uuid, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_video_media_info(uuid, numeric, numeric) TO authenticated;

-- Verify afterwards (read-only):
--   select proname, proconfig from pg_proc where proname = 'set_video_media_info';
-- and, after opening a pipeline video in the app:
--   select count(*) filter (where duration <= 1) from public.videos where "videoId" like 'aws:%';
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.set_video_media_info(uuid, numeric, numeric);
