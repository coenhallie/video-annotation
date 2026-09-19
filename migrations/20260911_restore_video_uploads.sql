-- Restore manual video uploads for the comparison wizard (2026-09-11)
--
-- 20260731_revoke_video_uploads.sql dropped the INSERT policy on the `videos`
-- bucket when local upload left the app. Upload is back, reachable only from
-- the "New comparison" modal (ComparisonVideoUpload.vue via
-- videoUploadService.ts), so the policy comes back in the same shape it had:
-- a signed-in user may write objects under a folder named after their own
-- user id, and nowhere else. The client writes `${userId}/${timestamp}_${name}`.
--
-- SELECT ("Users can view videos") and DELETE ("Users can delete their own
-- videos") were never dropped and are untouched here. The bucket is public,
-- so playback reads never depended on the SELECT policy anyway.
--
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "Users can upload videos" ON storage.objects;

CREATE POLICY "Users can upload videos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'videos'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- Rollback:
--
-- DROP POLICY IF EXISTS "Users can upload videos" ON storage.objects;
