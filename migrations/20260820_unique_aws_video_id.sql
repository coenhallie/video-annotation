-- Enforce one row per AWS pipeline video id (2026-08-20)
--
-- Why this exists: the storage proxy (netlify/functions/aws-storage.cjs) authorizes a
-- caller by asking PostgREST "does a `videos` row with this `videoId` exist that you can
-- SELECT". That row is created client-side: `VideoService.findOrCreateOutputVideo` inserts
-- `{ ownerId: self, videoId: 'aws:' + outputVideoId }`, and `outputVideoId` comes straight
-- off the `?outputVideo=` deep link. Without a uniqueness constraint, two different users
-- can each create their own row for the same `aws:` id. Row-level security then hides each
-- user's row from the other, so the second insert does not conflict with anything and
-- silently succeeds. Whichever of the two rows a given caller happens to own is the one
-- the visibility check answers for, which makes the check close to decorative once a video
-- has already been ingested by someone: a second, unrelated user can mint their own
-- "visible" row for the same id and be authorized by the proxy for that id's video.
--
-- What this index does: it makes an `aws:` videoId claimable exactly once, database-wide,
-- regardless of RLS. The first row inserted for a given id wins; every later insert for
-- the same id fails with a unique-violation, no matter who is inserting.
--
-- The tradeoff this introduces, accepted deliberately: an attacker who learns an
-- `outputVideoId` (e.g. by guessing or observing a deep link) before the legitimate owner
-- opens it can insert their own row for that id first. RLS hides the attacker's private row
-- from the owner, so when the owner's client later runs the same find-or-create insert, it
-- violates this constraint and fails outright - permanently breaking that owner's ingest for
-- that id. In other words, this trades a confidentiality hole (an attacker seeing a video
-- that was never theirs) for an availability hole (an attacker blocking an owner from ever
-- ingesting a specific video). That trade is intentional: a confidentiality break exposes
-- video content to someone who should never have seen it, while an availability break is
-- noisy, recoverable (a new pipeline run gets a new id), and does not leak anything. The
-- confidentiality hole is worse, so it is the one closed here.
--
-- This does not fully close the predicate-minting hole described above - only the AWS
-- pipeline itself knows who legitimately owns a given output, and neither the client nor
-- this proxy can verify that. See docs/superpowers/specs/2026-08-19-aws-proxy-auth-design.md
-- section 11 for the residual risk this migration mitigates rather than eliminates.
--
-- This CREATE UNIQUE INDEX will FAIL if duplicate `aws:` videoId values already exist in
-- the table. That failure is intentional, not a bug to work around: it surfaces existing
-- collisions (two rows already racing for the same id) instead of silently building an
-- index that ignores them. If it fails, find and resolve the duplicates first - do not
-- weaken the WHERE clause or add DISTINCT-style workarounds to force it through.

CREATE UNIQUE INDEX IF NOT EXISTS videos_aws_video_id_unique
  ON public.videos ("videoId")
  WHERE "videoId" LIKE 'aws:%';

-- Rollback:
--
-- DROP INDEX IF EXISTS public.videos_aws_video_id_unique;
