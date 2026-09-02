-- Let an AWS pipeline-output row exist before its presigned URL is known (2026-09-02)
--
-- What broke: `findOrCreateOutputVideo` inserts the row with `url: ''` and fills the
-- URL in a moment later. `check_video_url_or_path` required a non-empty url for every
-- `videoType = 'url'` row, so that insert was rejected outright and opening a video
-- from the pipeline frontend failed with:
--
--   new row for relation "videos" violates check constraint "check_video_url_or_path"
--
-- Why the code inserts an empty url rather than the real one: the storage proxy
-- authorizes by asking PostgREST whether the caller can see this video, and a row that
-- does not exist yet is visible to nobody. Fetching the URL first would therefore 403
-- the first ingest of every project. The row has to exist first, which means it has to
-- exist for a moment with no URL. See
-- docs/superpowers/specs/2026-08-19-aws-proxy-auth-design.md, step 2.
--
-- Why widening the constraint is the right fix rather than inserting a placeholder
-- URL: for an `aws:` row the url is not the locator, it is a cache. The locator is
-- `videoId`, and the url holds a presigned URL that expires and is re-fetched on every
-- open. The old constraint asserted "a row can always locate its media", which is still
-- true here - just through `videoId` rather than `url`. A placeholder would have
-- satisfied the letter of the constraint by writing something into `url` that is not a
-- URL, which is the same invariant broken more quietly.
--
-- Scope: this widens nothing for ordinary rows. A non-aws `videoType = 'url'` row still
-- needs a non-empty url, and `upload` is untouched. `url IS NOT NULL` is kept on the new
-- branch so the column stays a string for every row - the sibling constraint
-- `video_type_consistency` already requires `url IS NOT NULL` when videoType = 'url',
-- and nothing downstream is prepared for a null there.
--
-- Existing rows: all 63 `aws:%` rows in production carry a non-empty url (they predate
-- this code path), so they satisfy the new constraint under its first branch. The ALTER
-- revalidates the whole table and is expected to pass without rewriting anything.

ALTER TABLE public.videos
  DROP CONSTRAINT IF EXISTS check_video_url_or_path;

ALTER TABLE public.videos
  ADD CONSTRAINT check_video_url_or_path CHECK (
    (
      "videoType" = 'url'
      AND url IS NOT NULL
      AND url <> ''
    )
    OR (
      "videoType" = 'upload'
      AND (
        (url IS NOT NULL AND url <> '')
        OR ("filePath" IS NOT NULL AND "filePath" <> '')
      )
    )
    OR (
      -- An AWS pipeline output is located by videoId; url is a refreshed cache.
      "videoType" = 'url'
      AND "videoId" LIKE 'aws:%'
      AND url IS NOT NULL
    )
  );

-- Rollback:
--
-- ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS check_video_url_or_path;
-- ALTER TABLE public.videos
--   ADD CONSTRAINT check_video_url_or_path CHECK (
--     (("videoType" = 'url') AND (url IS NOT NULL) AND (url <> ''))
--     OR (("videoType" = 'upload') AND (((url IS NOT NULL) AND (url <> ''))
--         OR (("filePath" IS NOT NULL) AND ("filePath" <> ''))))
--   );
