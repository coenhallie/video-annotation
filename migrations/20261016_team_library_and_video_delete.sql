-- The whole video library is shared with the team, and any teammate can delete
-- any video (2026-10-16).
--
-- Requested so a colleague can clear out the library. Before this, a private
-- upload was visible to its owner only - 76 of 149 videos, 64 of them on one
-- account - so nobody else could see it, let alone delete it. The user chose to
-- share every video with every signed-in account rather than keep those
-- private.
--
-- Comparisons are NOT widened: comparison_videos stays visible to its creator
-- (or everyone, when shared by link). A comparison is deleted with any video it
-- uses, through the existing ON DELETE CASCADE.
--
-- Share-link visitors (role anon) are unchanged throughout: every policy below
-- is TO authenticated.
--
-- Sections:
--   1. Every video, with its annotations, comments, labels and activity, is
--      visible to every signed-in account, which can annotate and comment.
--   2. Any signed-in account can delete any video.
--   3. Uploaded files can be removed once no video refers to them.
--   4. The functions whose predicates mirrored the old visibility follow it.
--   5. video_delete_impact, for the confirmation dialog.
--
-- Idempotent: safe to run twice.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The library is shared.
-- ---------------------------------------------------------------------------
--
-- Same approach as the pipeline-output policies in
-- migrations/20260903_rename_video.sql: every policy here is added, never
-- edited. Permissive policies are OR'd, so an added policy cannot narrow
-- anything that works today. The older owner, public and pipeline policies
-- become redundant for signed-in users and are left in place.
--
-- Annotations, comments and labels are limited to single-video annotations
-- ("comparisonVideoId" IS NULL), because a comparison annotation can carry a
-- videoId too and comparisons stay private.

DROP POLICY IF EXISTS "Signed-in users can view every video" ON public.videos;
CREATE POLICY "Signed-in users can view every video" ON public.videos
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Signed-in users can view annotations on every video" ON public.annotations;
CREATE POLICY "Signed-in users can view annotations on every video" ON public.annotations
    FOR SELECT TO authenticated
    USING (annotations."videoId" IS NOT NULL AND annotations."comparisonVideoId" IS NULL);

DROP POLICY IF EXISTS "Signed-in users can annotate every video" ON public.annotations;
CREATE POLICY "Signed-in users can annotate every video" ON public.annotations
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = annotations."userId"
        AND annotations."videoId" IS NOT NULL
        AND annotations."comparisonVideoId" IS NULL
    );

DROP POLICY IF EXISTS "Signed-in users can read comments on every video" ON public.annotation_comments;
CREATE POLICY "Signed-in users can read comments on every video" ON public.annotation_comments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.annotations a
             WHERE a.id = annotation_comments."annotationId"
               AND a."videoId" IS NOT NULL
               AND a."comparisonVideoId" IS NULL
        )
    );

DROP POLICY IF EXISTS "Signed-in users can comment on every video" ON public.annotation_comments;
CREATE POLICY "Signed-in users can comment on every video" ON public.annotation_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND annotation_comments."userId" = auth.uid()
        AND annotation_comments."isAnonymous" = false
        AND EXISTS (
            SELECT 1 FROM public.annotations a
             WHERE a.id = annotation_comments."annotationId"
               AND a."videoId" IS NOT NULL
               AND a."comparisonVideoId" IS NULL
        )
    );

-- The existing label policies restate ownership in their own expressions, so
-- widening videos does not reach them. This one also covers labels on
-- teammates' pipeline-output annotations, which no policy granted before.
DROP POLICY IF EXISTS "Signed-in users can view labels on every video" ON public.annotation_labels;
CREATE POLICY "Signed-in users can view labels on every video" ON public.annotation_labels
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.annotations a
             WHERE a.id = annotation_labels."annotationId"
               AND a."videoId" IS NOT NULL
               AND a."comparisonVideoId" IS NULL
        )
    );

-- Same reason: the existing activity policy restates ownership itself.
DROP POLICY IF EXISTS "Signed-in users can view activity on every video" ON public.activity_events;
CREATE POLICY "Signed-in users can view activity on every video" ON public.activity_events
    FOR SELECT TO authenticated
    USING (activity_events."videoId" IS NOT NULL AND activity_events."comparisonVideoId" IS NULL);

-- ---------------------------------------------------------------------------
-- 2. Any signed-in account can delete any video.
-- ---------------------------------------------------------------------------
--
-- Everything hanging off the video goes with it through the existing
-- ON DELETE CASCADE foreign keys: annotations (with their comments and
-- labels), watch progress, sessions, folder placement, recent opens, activity,
-- and every comparison that uses the video, with that comparison's
-- annotations. Referential actions are not subject to RLS, so a comparison its
-- creator kept private goes too, as requested. The activity triggers on
-- annotations and comments already skip logging when the parent video is gone
-- (probed against this database before applying).
--
-- The owner-only policy stays; this one is OR'd with it.

DROP POLICY IF EXISTS "Signed-in users can delete any video" ON public.videos;
CREATE POLICY "Signed-in users can delete any video" ON public.videos
    FOR DELETE TO authenticated
    USING (true);

-- ---------------------------------------------------------------------------
-- 3. Uploaded files.
-- ---------------------------------------------------------------------------
--
-- The storage policies only let an uploader read and delete their own folder,
-- so a teammate's delete would leave the file behind. These admit a file in the
-- videos bucket once no video row refers to it, which is exactly its state
-- right after its row is deleted. Both are needed: Storage's remove() reads
-- the object before deleting it, and without the SELECT policy the removal
-- comes back as an empty list rather than an error.
--
-- The lookup is SECURITY DEFINER so that what counts as "referenced" never
-- depends on what the caller's RLS lets them see.
--
-- Known gap, accepted: the comparison modal uploads a file before it inserts
-- the row, so for that moment the new file is unreferenced too.

CREATE OR REPLACE FUNCTION public.video_file_is_referenced(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (SELECT 1 FROM public.videos v WHERE v."filePath" = p_name);
$$;

REVOKE EXECUTE ON FUNCTION public.video_file_is_referenced(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.video_file_is_referenced(text) TO authenticated;

DROP POLICY IF EXISTS "Signed-in users can see unreferenced video files" ON storage.objects;
CREATE POLICY "Signed-in users can see unreferenced video files" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'videos' AND NOT public.video_file_is_referenced(name));

DROP POLICY IF EXISTS "Signed-in users can delete unreferenced video files" ON storage.objects;
CREATE POLICY "Signed-in users can delete unreferenced video files" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'videos' AND NOT public.video_file_is_referenced(name));

-- ---------------------------------------------------------------------------
-- 4. Functions that mirrored the old visibility.
-- ---------------------------------------------------------------------------
--
-- set_video_qa_status, rename_video and set_video_thumbnail each restated the
-- SELECT policies as their only gate, and promise to change with them. Every
-- video is now visible to every signed-in account, so the gate reduces to
-- "signed in, and the video exists". Each is reproduced in full from its live
-- definition (pg_get_functiondef, 2026-10-16); only the predicate changes.

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

    -- Every video is visible to every signed-in account, so a signed-in caller
    -- may set the status of any video that exists. If the videos SELECT
    -- policies narrow again, this function narrows in the same migration.
    UPDATE public.videos v
       SET "qaStatus" = p_status,
           "qaStatusUpdatedAt" = now(),
           "qaStatusUpdatedBy" = v_caller,
           "updatedAt" = now()
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
    -- trigger on this table, already maintains it. Any signed-in caller may
    -- rename any video: see set_video_qa_status above.
    UPDATE public.videos v
       SET title = v_title
     WHERE v.id = p_video_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video % is not visible to the caller', p_video_id
            USING ERRCODE = '42501';
    END IF;

    RETURN v_row;
END;
$$;

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

  -- Any signed-in caller may fill in a missing thumbnail on any video: see
  -- set_video_qa_status above.
  UPDATE public.videos v
     SET "thumbnailUrl" = thumbnail
   WHERE v.id = video_id
     AND (v."thumbnailUrl" IS NULL OR v."thumbnailUrl" = '');

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  -- false is a normal outcome, not an error: another viewer's browser may have
  -- won the race, or the id may name a row that no longer exists.
  RETURN rows_updated > 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. What a delete would remove, for the confirmation dialog.
-- ---------------------------------------------------------------------------
--
-- A function because comparisons are visible only to their creator, so
-- counting them through RLS would understate what goes.

CREATE OR REPLACE FUNCTION public.video_delete_impact(p_video_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Deleting a video requires a signed-in user'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.videos v WHERE v.id = p_video_id) THEN
        RAISE EXCEPTION 'Video % does not exist', p_video_id
            USING ERRCODE = 'P0002';
    END IF;

    RETURN json_build_object(
        'annotations', (
            SELECT count(*) FROM public.annotations a WHERE a."videoId" = p_video_id
        ),
        'comments', (
            SELECT count(*)
              FROM public.annotation_comments ac
              JOIN public.annotations a ON a.id = ac."annotationId"
             WHERE a."videoId" = p_video_id
        ),
        'comparisons', (
            SELECT count(*)
              FROM public.comparison_videos c
             WHERE c."videoAId" = p_video_id OR c."videoBId" = p_video_id
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.video_delete_impact(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.video_delete_impact(uuid) TO authenticated;

COMMIT;

-- Rollback (section 4 needs the previous function bodies from
-- migrations/20261016_qa_status_complete.sql and migrations/20260903_rename_video.sql,
-- and set_video_thumbnail from migrations/20260919_harden_uploads_and_thumbnails.sql):
--
-- BEGIN;
-- DROP POLICY IF EXISTS "Signed-in users can view every video" ON public.videos;
-- DROP POLICY IF EXISTS "Signed-in users can view annotations on every video" ON public.annotations;
-- DROP POLICY IF EXISTS "Signed-in users can annotate every video" ON public.annotations;
-- DROP POLICY IF EXISTS "Signed-in users can read comments on every video" ON public.annotation_comments;
-- DROP POLICY IF EXISTS "Signed-in users can comment on every video" ON public.annotation_comments;
-- DROP POLICY IF EXISTS "Signed-in users can view labels on every video" ON public.annotation_labels;
-- DROP POLICY IF EXISTS "Signed-in users can view activity on every video" ON public.activity_events;
-- DROP POLICY IF EXISTS "Signed-in users can delete any video" ON public.videos;
-- DROP POLICY IF EXISTS "Signed-in users can see unreferenced video files" ON storage.objects;
-- DROP POLICY IF EXISTS "Signed-in users can delete unreferenced video files" ON storage.objects;
-- DROP FUNCTION IF EXISTS public.video_file_is_referenced(text);
-- DROP FUNCTION IF EXISTS public.video_delete_impact(uuid);
-- COMMIT;
