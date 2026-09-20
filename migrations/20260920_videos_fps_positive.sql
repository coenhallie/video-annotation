-- fps must be positive.
--
-- videos_fps_check allowed -1 as an "unknown" marker (fps = -1 OR fps > 0).
-- Nothing writes or reads that marker any more: the client falls back to 30
-- wherever a stored rate is not positive, and the player measures the real rate
-- at playback. Nine rows from July-November 2025 still held -1.
--
-- They are set to 30, the column default and the value the client already
-- assumed for them, so nothing changes on screen. totalFrames is left alone:
-- it was stored positive at the time and total_frames_positive already holds.
--
-- Idempotent: safe to run twice.

update public.videos set fps = 30 where fps <= 0;

alter table public.videos drop constraint if exists videos_fps_check;
alter table public.videos add constraint videos_fps_check check (fps > 0);
