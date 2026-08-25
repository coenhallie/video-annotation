-- Behavioural assertions for migrations/20260825_activity_events.sql
--
-- Run AFTER applying that migration, to prove the deployed triggers behave as
-- the dry run did. It is read-only in effect: wrap it and roll back.
--
--   printf 'BEGIN;\n' > /tmp/assert.sql
--   cat migrations/20260825_activity_events_assertions.sql >> /tmp/assert.sql
--   printf 'ROLLBACK;\n' >> /tmp/assert.sql
--   supabase db query --linked -f /tmp/assert.sql
--
-- Expect a single row reading ASSERTIONS PASSED. Every check raises on failure,
-- so a green run means all ten passed. Note this CLI has no `db execute`, and
-- RAISE NOTICE does not surface in its JSON output, which is why the checks
-- raise rather than print.
--
-- Ten assertions: actor attribution on insert; a no-op update logging nothing;
-- a content change logging once; an anonymous comment storing a display name
-- with a null actor; a comment deleted by someone other than its author
-- attributing to the deleter; an annotation delete logging once and its
-- cascaded comments logging nothing; a video delete raising nothing and
-- leaving nothing; cascade guard 2 (comparison video) proving it cascaded
-- before checking events; cascade guard 3 (deleted author); and the backfill
-- count.

-- Fixtures. A brand new video, so nothing pre-existing is touched even in the
-- rolled-back transaction, and two distinct real users.
CREATE TEMP TABLE fx AS
SELECT
    (SELECT id FROM public.users ORDER BY id ASC  LIMIT 1) AS author,
    (SELECT id FROM public.users ORDER BY id DESC LIMIT 1) AS moderator;

DO $$
DECLARE
    f               RECORD;
    v_video         uuid;
    v_ann           uuid;
    v_comment       uuid;
    v_anon_comment  uuid;
    n               int;
    v_actor         uuid;
BEGIN
    SELECT * INTO f FROM fx;
    IF f.author = f.moderator THEN
        RAISE EXCEPTION 'fixture needs two distinct users';
    END IF;

    INSERT INTO public.videos ("ownerId", title, url, "videoId", duration, "totalFrames")
    VALUES (f.author, 'activity probe', 'https://example.invalid/probe.mp4',
            'activity-probe-' || gen_random_uuid()::text, 10, 300)
    RETURNING id INTO v_video;

    -- Act as the author.
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', f.author, 'role', 'authenticated')::text, true);

    -- 1. INSERT logs one 'created' event attributed to the caller.
    INSERT INTO public.annotations ("videoId", "userId", content, title, "timestamp", "startFrame")
    VALUES (v_video, f.author, 'body', 'Ball out of frame', 12.5, 375)
    RETURNING id INTO v_ann;

    SELECT count(*) INTO n FROM public.activity_events
     WHERE "entityId" = v_ann AND action = 'created';
    IF n <> 1 THEN RAISE EXCEPTION 'expected 1 created event, got %', n; END IF;

    SELECT "actorId" INTO v_actor FROM public.activity_events
     WHERE "entityId" = v_ann AND action = 'created';
    IF v_actor <> f.author THEN RAISE EXCEPTION 'created event actor wrong'; END IF;

    IF (SELECT summary->>'title' FROM public.activity_events
         WHERE "entityId" = v_ann AND action = 'created') <> 'Ball out of frame' THEN
        RAISE EXCEPTION 'created event did not snapshot the title';
    END IF;

    -- 2. A bare updatedAt touch logs nothing.
    UPDATE public.annotations SET "updatedAt" = now() WHERE id = v_ann;
    SELECT count(*) INTO n FROM public.activity_events
     WHERE "entityId" = v_ann AND action = 'updated';
    IF n <> 0 THEN RAISE EXCEPTION 'no-op update logged % events', n; END IF;

    -- 3. A content change logs exactly one 'updated' event.
    UPDATE public.annotations SET content = 'body, revised' WHERE id = v_ann;
    SELECT count(*) INTO n FROM public.activity_events
     WHERE "entityId" = v_ann AND action = 'updated';
    IF n <> 1 THEN RAISE EXCEPTION 'content update logged % events', n; END IF;

    -- 4. An anonymous comment stores the display name and a null actor.
    --    Clearing the claims is enough: auth.uid() on this database is
    --    nullif(current_setting(...), '')::jsonb->>'sub', so a claims value
    --    with no "sub" yields NULL rather than raising (verified 2026-08-25).
    -- sessionId is required here by the pre-existing "valid_user_identification"
    -- CHECK on annotation_comments (userId XOR sessionId), unrelated to this
    -- migration: it predates activity_events and this migration's triggers
    -- never read sessionId, so it does not affect what is being asserted.
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    INSERT INTO public.annotation_comments ("annotationId", content, "userDisplayName", "isAnonymous", "sessionId")
    VALUES (v_ann, 'anon says hello', 'Visitor 7', true, 'anon-session-' || gen_random_uuid()::text)
    RETURNING id INTO v_anon_comment;

    IF (SELECT "actorId" FROM public.activity_events WHERE "entityId" = v_anon_comment) IS NOT NULL THEN
        RAISE EXCEPTION 'anonymous comment got an actorId';
    END IF;
    IF (SELECT "actorName" FROM public.activity_events WHERE "entityId" = v_anon_comment) <> 'Visitor 7' THEN
        RAISE EXCEPTION 'anonymous comment did not snapshot the display name';
    END IF;

    -- 5. A comment deleted by someone other than its author attributes to the
    --    deleter. This is the only cross-user case the policies allow today,
    --    so the comment must have a real author who is NOT the deleter: an
    --    anonymous comment has "userId" IS NULL, which would make any uid
    --    trivially "not the author" and prove nothing.
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', f.author, 'role', 'authenticated')::text, true);
    INSERT INTO public.annotation_comments ("annotationId", content, "userId")
    VALUES (v_ann, 'authored by the annotation owner', f.author)
    RETURNING id INTO v_comment;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', f.moderator, 'role', 'authenticated')::text, true);
    DELETE FROM public.annotation_comments WHERE id = v_comment;

    SELECT "actorId" INTO v_actor FROM public.activity_events
     WHERE "entityId" = v_comment AND action = 'deleted';
    IF v_actor IS DISTINCT FROM f.moderator THEN
        RAISE EXCEPTION 'comment delete attributed to %, expected the deleter %',
            v_actor, f.moderator;
    END IF;
    IF v_actor = f.author THEN
        RAISE EXCEPTION 'comment delete attributed to the author, not the deleter';
    END IF;

    -- 6. Deleting an annotation that still has comments logs exactly one event,
    --    for the annotation, and nothing for either cascaded comment.
    INSERT INTO public.annotation_comments ("annotationId", content, "userId")
    VALUES (v_ann, 'cascade me', f.author)
    RETURNING id INTO v_comment;

    DELETE FROM public.annotations WHERE id = v_ann;

    SELECT count(*) INTO n FROM public.activity_events
     WHERE "entityId" = v_ann AND action = 'deleted';
    IF n <> 1 THEN RAISE EXCEPTION 'annotation delete logged % events', n; END IF;

    SELECT count(*) INTO n FROM public.activity_events
     WHERE "entityId" IN (v_comment, v_anon_comment) AND action = 'deleted';
    IF n <> 0 THEN RAISE EXCEPTION 'cascaded comments logged % delete events', n; END IF;

    -- 7. Deleting a video with annotations does not error and leaves no events.
    INSERT INTO public.annotations ("videoId", "userId", content, title, "timestamp", "startFrame")
    VALUES (v_video, f.author, 'body', 'second', 1, 30)
    RETURNING id INTO v_ann;

    DELETE FROM public.videos WHERE id = v_video;

    SELECT count(*) INTO n FROM public.activity_events WHERE "videoId" = v_video;
    IF n <> 0 THEN RAISE EXCEPTION 'video delete left % events behind', n; END IF;

    RAISE NOTICE 'all assertions passed';
END $$;

-- 8. Backfill produced one created event per existing annotation.
DO $$
DECLARE
    n_ann int;
    n_evt int;
BEGIN
    SELECT count(*) INTO n_ann FROM public.annotations
     WHERE "videoId" IS NOT NULL OR "comparisonVideoId" IS NOT NULL;
    SELECT count(*) INTO n_evt FROM public.activity_events
     WHERE "entityType" = 'annotation' AND action = 'created';
    IF n_evt < n_ann THEN
        RAISE EXCEPTION 'backfill produced % events for % annotations', n_evt, n_ann;
    END IF;
END $$;

-- 9. Guard 2: an annotation logged against a comparison video lands in
--    "comparisonVideoId", and deleting that comparison video does not error.
--    videoAId and videoBId must differ (comparison_videos_different_videos),
--    so this needs two probe videos, not one reused for both sides.
DO $$
DECLARE
    f        RECORD;
    v_va     uuid;
    v_vb     uuid;
    v_cv     uuid;
    v_ann    uuid;
    v_target uuid;
    n        int;
BEGIN
    SELECT * INTO f FROM fx;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', f.author, 'role', 'authenticated')::text, true);

    INSERT INTO public.videos ("ownerId", title, url, "videoId", duration, "totalFrames")
    VALUES (f.author, 'activity probe A', 'https://example.invalid/probe-a.mp4',
            'activity-probe-a-' || gen_random_uuid()::text, 10, 300)
    RETURNING id INTO v_va;

    INSERT INTO public.videos ("ownerId", title, url, "videoId", duration, "totalFrames")
    VALUES (f.author, 'activity probe B', 'https://example.invalid/probe-b.mp4',
            'activity-probe-b-' || gen_random_uuid()::text, 10, 300)
    RETURNING id INTO v_vb;

    INSERT INTO public.comparison_videos (title, "videoAId", "videoBId", "userId")
    VALUES ('activity probe comparison', v_va, v_vb, f.author)
    RETURNING id INTO v_cv;

    INSERT INTO public.annotations ("comparisonVideoId", "userId", content, title, "timestamp", "startFrame")
    VALUES (v_cv, f.author, 'body', 'comparison probe', 1, 30)
    RETURNING id INTO v_ann;

    SELECT "comparisonVideoId" INTO v_target FROM public.activity_events
     WHERE "entityId" = v_ann AND action = 'created';
    IF v_target IS DISTINCT FROM v_cv THEN
        RAISE EXCEPTION 'comparison annotation logged against %, expected comparisonVideoId %', v_target, v_cv;
    END IF;

    -- The proof here is that this DELETE does not raise 23503, the same as
    -- assertion 7. The zero-count check below is auxiliary, not conclusive:
    -- activity_events."comparisonVideoId" is itself ON DELETE CASCADE, so any
    -- event that had been logged during the delete would be swept away with
    -- the comparison video regardless of whether the guard fired.
    DELETE FROM public.comparison_videos WHERE id = v_cv;

    -- Prove guard 2 was actually entered rather than trusting a schema fact
    -- that lives outside this suite: annotations."comparisonVideoId" is
    -- ON DELETE CASCADE (verified 2026-08-25), so the comparison delete must
    -- have deleted this annotation too. If it were ON DELETE SET NULL instead,
    -- the annotation would just be orphaned, no DELETE trigger would fire, and
    -- the event count below would pass trivially even with guard 2 removed.
    SELECT count(*) INTO n FROM public.annotations WHERE id = v_ann;
    IF n <> 0 THEN
        RAISE EXCEPTION 'guard 2 never ran: the comparison delete did not cascade to the annotation';
    END IF;

    SELECT count(*) INTO n FROM public.activity_events WHERE "comparisonVideoId" = v_cv;
    IF n <> 0 THEN RAISE EXCEPTION 'comparison video delete left % events behind', n; END IF;
END $$;

-- 10. Guard 3: deleting the annotation author's public.users row (the same
--     shape a users-cascading-from-auth.users delete produces) cascades the
--     annotation and logs no delete event for it. A synthetic auth.users row
--     gives handle_new_user() something to provision, so the trigger sees a
--     real, then vanished, public.users row rather than one that was never
--     satisfied by any FK in the first place.
DO $$
DECLARE
    f       RECORD;
    v_video uuid;
    v_synth uuid;
    v_ann   uuid;
    n       int;
BEGIN
    SELECT * INTO f FROM fx;

    INSERT INTO public.videos ("ownerId", title, url, "videoId", duration, "totalFrames")
    VALUES (f.author, 'activity probe guard3', 'https://example.invalid/probe-guard3.mp4',
            'activity-probe-guard3-' || gen_random_uuid()::text, 10, 300)
    RETURNING id INTO v_video;

    INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(), 'probe-' || gen_random_uuid()::text || '@example.invalid')
    RETURNING id INTO v_synth;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_synth, 'role', 'authenticated')::text, true);

    INSERT INTO public.annotations ("videoId", "userId", content, title, "timestamp", "startFrame")
    VALUES (v_video, v_synth, 'body', 'synthetic author probe', 1, 30)
    RETURNING id INTO v_ann;

    -- annotations."userId" is ON DELETE CASCADE from users, so this deletes
    -- the annotation in the same statement, exactly as a users-row deletion
    -- caused by deleting the underlying auth.users row would.
    DELETE FROM public.users WHERE id = v_synth;

    SELECT count(*) INTO n FROM public.activity_events
     WHERE "entityId" = v_ann AND action = 'deleted';
    IF n <> 0 THEN
        RAISE EXCEPTION 'annotation delete for a vanished author logged % events', n;
    END IF;
END $$;

SELECT 'ASSERTIONS PASSED' AS result;
