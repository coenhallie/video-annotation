-- Server-side limits for uploads, and a visibility check on thumbnails (2026-09-19)
--
-- Applied to production 2026-09-20 and verified read-only afterwards.
--
-- 1. Upload limits on the `videos` bucket.
--
--    The 1000 MB cap and the list of accepted types lived only in the browser
--    (videoUploadService.ts). The storage INSERT policy checks the folder and
--    nothing else, so any signed-in account could PUT a file of any size and
--    any type straight to the signed upload URL. Storage enforces these two
--    columns itself, before the object is written.
--
--    Keep in step with ALLOWED_VIDEO_TYPES and MAX_SIZE_BYTES in
--    src/services/videoUploadService.ts. AVI is absent on purpose: no browser
--    decodes it.
--
--    Existing objects are untouched; the limits apply to new writes only.

UPDATE storage.buckets
   SET file_size_limit = 1048576000, -- 1000 * 1024 * 1024
       allowed_mime_types = ARRAY[
         'video/mp4',
         'video/webm',
         'video/ogg',
         'video/quicktime'
       ]
 WHERE id = 'videos';

-- 2. set_video_thumbnail only writes to a video the caller can see.
--
--    The function (20260820_set_video_thumbnail.sql) checked that the caller
--    was signed in and nothing about the row, so any account could put the
--    first thumbnail on a private video it could not otherwise read, by id.
--    The original header accepted that. It is cheap to close: the predicate
--    below is the same "what the caller can see" rule rename_video and
--    set_video_qa_status use (own, public, pipeline output, member of a public
--    comparison), so the three stay in step.
--
--    A row the caller cannot see returns false, the same as a row that already
--    has a thumbnail or does not exist: the function never told callers which,
--    and must not start confirming that a private id exists.
--
--    Also appends pg_temp to search_path, as every other SECURITY DEFINER
--    function here has it. Every reference is schema-qualified, so this is
--    consistency, not a fix for a known exploit.

CREATE OR REPLACE FUNCTION public.set_video_thumbnail(video_id uuid, thumbnail text)
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
    RAISE EXCEPTION 'set_video_thumbnail requires an authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF thumbnail IS NULL
     OR thumbnail !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' THEN
    RAISE EXCEPTION 'thumbnail must be a base64 image data URL'
      USING ERRCODE = '22023';
  END IF;

  -- A 320px JPEG lands around 8-12 KB of base64. This bounds what one call can
  -- write without being tight enough to reject a legitimate thumbnail.
  IF length(thumbnail) > 200000 THEN
    RAISE EXCEPTION 'thumbnail exceeds 200000 characters'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.videos v
     SET "thumbnailUrl" = thumbnail
   WHERE v.id = video_id
     AND (v."thumbnailUrl" IS NULL OR v."thumbnailUrl" = '')
     AND (
           v."ownerId" = v_caller
        OR v."isPublic" = true
        OR v."videoId" LIKE 'aws:%'
        OR v.id IN (
               SELECT c."videoAId" FROM public.comparison_videos c WHERE c."isPublic"
               UNION
               SELECT c."videoBId" FROM public.comparison_videos c WHERE c."isPublic"
           )
     );

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  -- false is a normal outcome, not an error: another viewer's browser may have
  -- won the race, the id may name a row that no longer exists, or the caller
  -- may not be able to see it.
  RETURN rows_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.set_video_thumbnail(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_video_thumbnail(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_video_thumbnail(uuid, text) TO authenticated;

-- Verify afterwards (read-only):
--   select file_size_limit, allowed_mime_types from storage.buckets where id = 'videos';
--   select proconfig from pg_proc where proname = 'set_video_thumbnail';
--
-- Rollback:
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'videos';
--   and re-run migrations/20260820_set_video_thumbnail.sql
