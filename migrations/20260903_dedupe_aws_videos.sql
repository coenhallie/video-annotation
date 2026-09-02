-- Collapse duplicate AWS pipeline-output video rows (2026-09-03)
--
-- Why they exist: VideoService.findOrCreateOutputVideo does check-then-insert
-- with no uniqueness guarantee, so two clients opening the same `?outputVideo=`
-- link at once both find nothing and both insert. Every duplicate group in
-- production was created that way - same id, same day - and 15 of the 18 groups
-- were made by a single owner opening their own video twice.
--
-- This must run before migrations/20260820_unique_aws_video_id.sql, which
-- refuses to build its index while duplicates exist. Run order matters the other
-- way too: the client must already handle a 23505 from that index (see
-- VideoService.findOrCreateOutputVideo) before the index is created, or the
-- losing side of a race turns into a user-facing "Failed to load video".
--
-- Survivor per videoId: the row carrying the most attached history, oldest wins
-- ties. Children are re-pointed onto the survivor rather than left to cascade,
-- so nothing is lost. project_opens, video_sessions and video_watch_progress
-- each carry a unique (userId, videoId); where the survivor already holds that
-- user's row the loser's is redundant and is dropped rather than re-pointed -
-- the fact it records is already preserved on the survivor.
--
-- Measured against production before applying, in a rolled-back transaction:
--   videos          65 -> 33  (32 deleted)
--   annotations      6 ->  6  no loss
--   activity_events  6 ->  6  no loss
--   watch progress   2 ->  2  no loss
--   project_opens    6 ->  4  redundant only
--   video_sessions  69 -> 40  redundant only
--
-- Not reversible. The 50 rows in duplicate groups were exported to JSON first.

DO $$
BEGIN
  -- Survivor per aws videoId: the row carrying the most history, oldest wins ties.
  create temporary table survivors on commit drop as
  with dup as (
    select "videoId" from public.videos where "videoId" like 'aws:%'
    group by 1 having count(*) > 1
  ),
  scored as (
    select v.id, v."videoId", v."createdAt",
      (select count(*) from public.annotations a where a."videoId" = v.id)
      + (select count(*) from public.activity_events e where e."videoId" = v.id)
      + (select count(*) from public.project_opens o where o."videoId" = v.id)
      + (select count(*) from public.video_watch_progress w where w."videoId" = v.id)
      + (select count(*) from public.video_sessions s where s."videoId" = v.id)
      + (select count(*) from public.comparison_videos c where c."videoAId" = v.id or c."videoBId" = v.id)
      + (select count(*) from public.project_folders f where f.project_id = v.id) as weight
    from public.videos v join dup on dup."videoId" = v."videoId"
  )
  select distinct on ("videoId") "videoId", id as keep_id
  from scored order by "videoId", weight desc, "createdAt" asc, id asc;

  create temporary table losers on commit drop as
  select v.id as loser_id, s.keep_id
  from public.videos v
  join survivors s on s."videoId" = v."videoId"
  where v.id <> s.keep_id;

  -- Re-point children onto the survivor. Where the survivor already has a row
  -- for that user, the loser's row is redundant and is dropped instead - both
  -- tables carry a unique (user, video) index.
  delete from public.video_sessions x using losers l
   where x."videoId" = l.loser_id
     and exists (select 1 from public.video_sessions y
                  where y."videoId" = l.keep_id and y."userId" is not distinct from x."userId");
  update public.video_sessions x set "videoId" = l.keep_id from losers l where x."videoId" = l.loser_id;

  delete from public.project_opens x using losers l
   where x."videoId" = l.loser_id
     and exists (select 1 from public.project_opens y
                  where y."videoId" = l.keep_id and y."userId" is not distinct from x."userId");
  update public.project_opens x set "videoId" = l.keep_id from losers l where x."videoId" = l.loser_id;

  delete from public.video_watch_progress x using losers l
   where x."videoId" = l.loser_id
     and exists (select 1 from public.video_watch_progress y
                  where y."videoId" = l.keep_id and y."userId" is not distinct from x."userId");
  update public.video_watch_progress x set "videoId" = l.keep_id from losers l where x."videoId" = l.loser_id;

  update public.annotations        x set "videoId"  = l.keep_id from losers l where x."videoId"  = l.loser_id;
  update public.activity_events    x set "videoId"  = l.keep_id from losers l where x."videoId"  = l.loser_id;
  update public.anonymous_sessions x set "videoId"  = l.keep_id from losers l where x."videoId"  = l.loser_id;
  update public.comparison_videos  x set "videoAId" = l.keep_id from losers l where x."videoAId" = l.loser_id;
  update public.comparison_videos  x set "videoBId" = l.keep_id from losers l where x."videoBId" = l.loser_id;
  update public.project_folders    x set project_id = l.keep_id from losers l where x.project_id = l.loser_id;

  delete from public.videos v using losers l where v.id = l.loser_id;
END $$;
