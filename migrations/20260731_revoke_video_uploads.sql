-- Revoke manual video uploads (2026-07-31)
--
-- Local upload was removed from the app; videos now enter only via the AWS
-- pipeline. This closes the server-side hole: without it, anyone holding the
-- anon key could still write to the bucket directly.
--
-- The 'videos' bucket is public, so getPublicUrl reads do not depend on the
-- SELECT policy. Dropping INSERT leaves the existing stored objects readable
-- and deletable.
--
-- Policies on storage.objects, all scoped to bucket_id = 'videos':
--   "Users can upload videos"          INSERT  -> dropped here
--   "Users can view videos"            SELECT  -> kept (playback)
--   "Users can delete their own videos" DELETE -> kept (VideoService.deleteVideo)

DROP POLICY IF EXISTS "Users can upload videos" ON storage.objects;

-- Rollback (restores the exact policy captured from pg_policies before the drop):
--
-- CREATE POLICY "Users can upload videos" ON storage.objects
--   FOR INSERT TO public
--   WITH CHECK (
--     (bucket_id = 'videos'::text)
--     AND ((auth.uid())::text = (storage.foldername(name))[1])
--   );
