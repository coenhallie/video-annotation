-- Let any signed-in viewer fill in a missing video thumbnail (2026-08-20)
--
-- Why this exists: thumbnails for AWS pipeline videos are generated in the browser,
-- from the presigned URL, by whoever opens the video. The dashboard is a shared
-- library - everyone sees everyone's videos - but the `videos` UPDATE policy is
-- owner-gated, so only the owner's browser could ever store what it generated. A
-- video whose owner never reopens it therefore shows a blank card to everybody,
-- forever. That is the bug this closes.
--
-- Why a function rather than a second UPDATE policy: RLS policies are OR'd and apply
-- to the whole row, so a permissive "any authenticated user may update videos" policy
-- would also hand out title, url and isPublic. Column-level GRANTs cannot separate the
-- two cases either, because owner and non-owner are the same `authenticated` role.
-- SECURITY DEFINER is what lets one specific, checked write cross the policy without
-- widening it.
--
-- What it can do, exhaustively: set `thumbnailUrl` on one row, only when that row has
-- none, only for a signed-in caller, and only to a small base64 image data URL. It
-- cannot overwrite an existing thumbnail, so the worst a malicious caller achieves is
-- claiming the thumbnail of a video nobody has opened yet - and it can never touch any
-- other column.
--
-- Anonymous share-link viewers are deliberately excluded: they can watch a public
-- video, but letting an unauthenticated caller write an image into the library is a
-- wider door than this problem justifies.

CREATE OR REPLACE FUNCTION public.set_video_thumbnail(video_id uuid, thumbnail text)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  rows_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
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

  UPDATE public.videos
     SET "thumbnailUrl" = thumbnail
   WHERE id = video_id
     AND ("thumbnailUrl" IS NULL OR "thumbnailUrl" = '');

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  -- false is a normal outcome, not an error: another viewer's browser may have
  -- won the race, or the id may name a row that no longer exists.
  RETURN rows_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.set_video_thumbnail(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_video_thumbnail(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_video_thumbnail(uuid, text) TO authenticated;

-- Rollback:
--
-- DROP FUNCTION IF EXISTS public.set_video_thumbnail(uuid, text);
