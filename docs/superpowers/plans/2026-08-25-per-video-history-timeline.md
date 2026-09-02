# Per-Video History Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every video a History tab in the editor sidebar showing who added, edited or removed each annotation and who commented, as a vertical timeline.

**Architecture:** One append-only table, `public.activity_events`, written by two row triggers on `annotations` and `annotation_comments`. The database attributes each write itself with `auth.uid()`, so the log cannot disagree with the tables it describes and no client has to cooperate. The frontend is one pure phrasing module, one service that does three indexed reads, one timeline component, and a two-tab bar in the editor sidebar.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API), TypeScript, Tailwind v4, Supabase (PostgREST + PL/pgSQL), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-per-video-history-timeline-design.md`. Read it before Task 1. Where this plan and the spec disagree, the spec wins and the plan is wrong.

## Global Constraints

- **The log must never be able to fail a write it is only observing.** Triggers run inside the observed transaction. Any constraint `activity_events` can violate is a constraint that aborts an annotation write. This rules out an exclusive target CHECK, a foreign key on `entityId`, and any NOT NULL the trigger might not satisfy.
- The two entity types, exactly: `annotation`, `comment`. The three actions, exactly: `created`, `updated`, `deleted`. No others, no renames.
- Labels and comments only. Nothing may read `activity_events` to gate, filter, notify or trigger anything. Showing history is the entire feature.
- Migration goes to production **before** any frontend merges. The frontend selects from a table that must already exist.
- Applying the migration to production is the user's call, not the implementer's. Every SQL step before Task 2 runs inside `BEGIN ... ROLLBACK` and changes nothing.
- No em dash (`—`) in any prose, comment, commit message or doc. Use a plain dash.
- No `Co-Authored-By` trailer and no "Generated with Claude Code" footer on commits.
- No label events and no QA status events. Both are explicitly out of scope in the spec.
- Shared-link and anonymous viewers get no History tab. The RLS policy is `TO authenticated`, so the tab would be empty for them anyway, and an empty tab reads as a bug.
- No realtime subscription. The feed refetches when the tab gains focus.
- Meta token styling, copied verbatim where a token is rendered: `font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400`.
- Eyebrow heading styling, copied verbatim: `text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400`.
- Tests run with `npx vitest run <path>`. The whole suite is `npm test`.
- This repo has no CI. Every task ends with a green test run you executed yourself and read the output of.
- All work happens in the worktree at `.claude/worktrees/pipeline-output-tab` on branch `feat/pipeline-output-tab`.

## File Structure

| File | Responsibility |
| --- | --- |
| `migrations/20260825_activity_events.sql` | Create (Task 1). Table, indexes, grants, RLS, backfill, both trigger functions and their triggers, and a stated rollback. |
| `src/types/database.ts` | Modify (Task 3). Add the activity types. No other change. |
| `src/utils/activityPhrasing.ts` | Create (Task 3). Pure. Verb table, subject text, actor name resolution, day grouping. No Vue, no Supabase. |
| `src/utils/__tests__/activityPhrasing.test.ts` | Create (Task 3). |
| `src/services/activityService.ts` | Create (Task 4). `getActivity(target, limit)`: events, live-annotation ids, owner names. The only read path. |
| `src/services/__tests__/activityService.test.ts` | Create (Task 4). |
| `src/components/ActivityTimeline.vue` | Create (Task 5). The vertical timeline: day groups, entries, empty / loading / error states, seek on click. |
| `src/components/__tests__/activityTimeline.test.ts` | Create (Task 5). |
| `src/types/component-interfaces.ts` | Modify (Task 6). Add `SidebarTab`. A `<script setup>` block cannot carry named exports, and this file is where this codebase already keeps component-facing types. |
| `src/components/SidebarTabs.vue` | Create (Task 6). The two-tab bar for the editor sidebar. |
| `src/components/__tests__/sidebarTabs.test.ts` | Create (Task 6). |
| `src/views/EditorView.vue` | Modify (Task 6). Mount the tab bar in the `<aside>` and switch between `AnnotationPanel` and `ActivityTimeline`. |

`AnnotationPanel.vue` is deliberately untouched. It is already large, and a tab bar has no business living inside one of the panels it switches away from.

Phrasing is a separate pure module from the component for the same reason `qaStatus.ts` is separate from `QaStatusPill.vue`: the wording is the part worth testing exhaustively, and testing it should not require mounting anything.

---

### Task 1: The migration, written and verified in a rolled-back transaction

**Files:**
- Create: `migrations/20260825_activity_events.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.activity_events` with columns `id`, `videoId`, `comparisonVideoId`, `actorId`, `actorName`, `entityType`, `entityId`, `action`, `summary`, `createdAt`; `public.log_annotation_activity()` and `public.log_comment_activity()` and their triggers.

This task has no Vitest cycle. Its test is the assertion suite in Step 3, run against production inside a transaction that is rolled back. **Nothing in this task changes production.**

- [ ] **Step 1: Read the spec**

Read `docs/superpowers/specs/2026-08-25-per-video-history-timeline-design.md` end to end, in particular "The cascade problem". The parent-existence guard is the reason this feature is correct and the reason `DELETE FROM videos` keeps working; do not simplify it away.

- [ ] **Step 2: Write the migration**

Create `migrations/20260825_activity_events.sql`:

```sql
-- migrations/20260825_activity_events.sql
-- Per-video activity log: who added, edited or removed each annotation, and
-- who commented.
--
-- Written by triggers rather than by the app, so the log cannot disagree with
-- the tables it describes: the same transaction writes both. auth.uid()
-- resolves inside a trigger because PostgREST sets request.jwt.claims for the
-- request and the trigger runs in that transaction (probed 2026-08-25).
--
-- Design: docs/superpowers/specs/2026-08-25-per-video-history-timeline-design.md

BEGIN;

CREATE TABLE IF NOT EXISTS public.activity_events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "videoId"           uuid REFERENCES public.videos (id) ON DELETE CASCADE,
    "comparisonVideoId" uuid REFERENCES public.comparison_videos (id) ON DELETE CASCADE,
    -- SET NULL, not CASCADE. History about a departed user is still history.
    "actorId"           uuid REFERENCES public.users (id) ON DELETE SET NULL,
    -- Fallback name only, for the two cases with no id to resolve: an
    -- anonymous share-link commenter, and a deleted user. When "actorId" is
    -- present the client resolves the current name, so a rename propagates.
    "actorName"         text,
    "entityType"        text NOT NULL CHECK ("entityType" IN ('annotation', 'comment')),
    -- Deliberately no foreign key. The whole point of the row is to outlive
    -- what it describes; a foreign key would delete the delete event.
    "entityId"          uuid NOT NULL,
    action              text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
    summary             jsonb NOT NULL DEFAULT '{}'::jsonb,
    "createdAt"         timestamptz NOT NULL DEFAULT now(),
    -- Deliberately weak. The tempting version is exclusive:
    --   ("videoId" IS NULL) <> ("comparisonVideoId" IS NULL)
    -- All 205 annotations satisfy that today, but the trigger inserts here
    -- inside the annotating transaction, so any constraint this table can fail
    -- is a constraint that aborts the annotation. The day a dual annotation
    -- carries both ids, an exclusive check breaks annotating in dual mode. The
    -- trigger picks one target explicitly instead.
    CONSTRAINT activity_events_has_target CHECK (
        "videoId" IS NOT NULL OR "comparisonVideoId" IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS activity_events_video_idx
    ON public.activity_events ("videoId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS activity_events_comparison_idx
    ON public.activity_events ("comparisonVideoId", "createdAt" DESC);

-- Read-only to every client. The triggers are SECURITY DEFINER and run as the
-- function owner, so they do not need a grant here.
REVOKE ALL ON public.activity_events FROM anon, authenticated;
GRANT SELECT ON public.activity_events TO authenticated;

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Shape copied from the working policies in
-- migrations/20260817_open_annotations_to_all_users.sql: EXISTS subqueries with
-- inner joins. RLS applies to tables named inside a policy expression, so this
-- is not a stylistic choice.
--
-- TO authenticated, not anon. An anonymous share-link visitor can already read
-- the annotations, but the history names the staff who reviewed the video and
-- that does not belong to whoever holds the link.
DROP POLICY IF EXISTS "Users can view activity on visible videos" ON public.activity_events;

CREATE POLICY "Users can view activity on visible videos" ON public.activity_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.videos v
            WHERE v.id = activity_events."videoId"
              AND (v."isPublic" = true OR v."ownerId" = auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.comparison_videos cv
            WHERE cv.id = activity_events."comparisonVideoId"
              AND (cv."isPublic" = true OR cv."userId" = auth.uid())
        )
    );

-- No INSERT, UPDATE or DELETE policy. The table is append-only because there is
-- no policy under which anything else is possible.


-- Backfill, before the triggers exist so the two can never disagree about a row.
--
-- Only 'created' events. Past edits and deletes are unrecoverable, and
-- inventing them would put fiction in an audit log.
--
-- The guard is per entity type, not a bare NOT EXISTS over the whole table: an
-- INSERT ... SELECT reads a snapshot from the start of its own statement, so a
-- bare guard on the second statement would still see the rows the first
-- statement wrote and skip every comment.
INSERT INTO public.activity_events (
    "videoId", "comparisonVideoId", "actorId", "entityType", "entityId", action, summary, "createdAt"
)
SELECT
    CASE WHEN a."comparisonVideoId" IS NULL THEN a."videoId" END,
    a."comparisonVideoId",
    a."userId",
    'annotation',
    a.id,
    'created',
    jsonb_build_object('title', a.title, 'timestamp', a."timestamp"),
    COALESCE(a."createdAt", now())
FROM public.annotations a
WHERE (a."videoId" IS NOT NULL OR a."comparisonVideoId" IS NOT NULL)
  AND NOT EXISTS (
      SELECT 1 FROM public.activity_events e WHERE e."entityType" = 'annotation'
  );

INSERT INTO public.activity_events (
    "videoId", "comparisonVideoId", "actorId", "actorName", "entityType", "entityId", action, summary, "createdAt"
)
SELECT
    CASE WHEN a."comparisonVideoId" IS NULL THEN a."videoId" END,
    a."comparisonVideoId",
    c."userId",
    CASE WHEN c."userId" IS NULL THEN c."userDisplayName" END,
    'comment',
    c.id,
    'created',
    jsonb_build_object(
        'excerpt', left(c.content, 140),
        'annotationTitle', a.title,
        'annotationId', a.id,
        'timestamp', a."timestamp"
    ),
    COALESCE(c."createdAt", now())
FROM public.annotation_comments c
JOIN public.annotations a ON a.id = c."annotationId"
WHERE (a."videoId" IS NOT NULL OR a."comparisonVideoId" IS NOT NULL)
  AND NOT EXISTS (
      SELECT 1 FROM public.activity_events e WHERE e."entityType" = 'comment'
  );


CREATE OR REPLACE FUNCTION public.log_annotation_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row        public.annotations;
    v_action     text;
    v_actor      uuid := auth.uid();
    v_video      uuid;
    v_comparison uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_row := OLD;
        v_action := 'deleted';
    ELSIF TG_OP = 'UPDATE' THEN
        v_row := NEW;
        v_action := 'updated';
        -- Log only what a reader would notice. Without this, every bare
        -- updatedAt touch becomes a feed entry. drawingData is jsonb, so
        -- IS DISTINCT FROM compares it semantically and a re-serialised but
        -- identical drawing is correctly silent.
        IF NOT (
               NEW.content       IS DISTINCT FROM OLD.content
            OR NEW.title         IS DISTINCT FROM OLD.title
            OR NEW.severity      IS DISTINCT FROM OLD.severity
            OR NEW."timestamp"   IS DISTINCT FROM OLD."timestamp"
            OR NEW."drawingData" IS DISTINCT FROM OLD."drawingData"
        ) THEN
            RETURN NULL;
        END IF;
    ELSE
        v_row := NEW;
        v_action := 'created';
    END IF;

    -- One target, chosen here rather than by a constraint. Comparison wins so a
    -- dual annotation lands in one feed rather than two.
    v_comparison := v_row."comparisonVideoId";
    v_video := CASE WHEN v_comparison IS NULL THEN v_row."videoId" END;

    IF v_video IS NULL AND v_comparison IS NULL THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- Cascade guard. pg_trigger_depth() does NOT detect this: a
        -- cascade-deleted row fires its trigger at depth 1, exactly like a
        -- direct delete (probed 2026-08-25). Parent-row existence does detect
        -- it. Without this guard, deleting a video would try to log events
        -- referencing the video being deleted and fail the foreign key with
        -- 23503, aborting the delete.
        IF v_video IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.videos WHERE id = v_video) THEN
            RETURN NULL;
        END IF;
        IF v_comparison IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.comparison_videos WHERE id = v_comparison) THEN
            RETURN NULL;
        END IF;
        -- annotations."userId" cascades from users, so a vanished author means
        -- this delete came from deleting that user.
        IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_row."userId") THEN
            RETURN NULL;
        END IF;
    END IF;

    -- The author fallback is INSERT-only on purpose. On INSERT the RLS policy
    -- forces auth.uid() = "userId", so a null uid means a service-role insert
    -- and the row's own userId is the truthful actor. On DELETE the deleter is
    -- not assumed to be the author; an unattributable delete stays null.
    IF v_actor IS NULL AND TG_OP = 'INSERT' THEN
        v_actor := v_row."userId";
    END IF;

    INSERT INTO public.activity_events (
        "videoId", "comparisonVideoId", "actorId", "entityType", "entityId", action, summary
    ) VALUES (
        v_video,
        v_comparison,
        v_actor,
        'annotation',
        v_row.id,
        v_action,
        jsonb_build_object('title', v_row.title, 'timestamp', v_row."timestamp")
    );

    RETURN NULL;
END;
$$;


CREATE OR REPLACE FUNCTION public.log_comment_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row        public.annotation_comments;
    v_action     text;
    v_ann        RECORD;
    v_video      uuid;
    v_comparison uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_row := OLD;
        v_action := 'deleted';
    ELSE
        v_row := NEW;
        v_action := 'created';
    END IF;

    -- annotation_comments has no videoId of its own.
    SELECT a."videoId", a."comparisonVideoId", a.title, a."timestamp"
      INTO v_ann
      FROM public.annotations a
     WHERE a.id = v_row."annotationId";

    -- Cascade guard: the parent annotation is already gone, so this delete came
    -- from deleting the annotation. Logging it would read "Coen deleted Alice's
    -- comment" when Coen deleted his own annotation.
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_comparison := v_ann."comparisonVideoId";
    v_video := CASE WHEN v_comparison IS NULL THEN v_ann."videoId" END;

    IF v_video IS NULL AND v_comparison IS NULL THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.activity_events (
        "videoId", "comparisonVideoId", "actorId", "actorName",
        "entityType", "entityId", action, summary
    ) VALUES (
        v_video,
        v_comparison,
        auth.uid(),
        -- An anonymous share-link commenter has no uid and no users row. The
        -- display name they chose is the only name this entry will ever have.
        CASE WHEN v_row."userId" IS NULL THEN v_row."userDisplayName" END,
        'comment',
        v_row.id,
        v_action,
        jsonb_build_object(
            'excerpt', left(v_row.content, 140),
            'annotationTitle', v_ann.title,
            'annotationId', v_row."annotationId",
            'timestamp', v_ann."timestamp"
        )
    );

    RETURN NULL;
END;
$$;


DROP TRIGGER IF EXISTS log_annotation_activity ON public.annotations;
CREATE TRIGGER log_annotation_activity
    AFTER INSERT OR UPDATE OR DELETE ON public.annotations
    FOR EACH ROW EXECUTE FUNCTION public.log_annotation_activity();

DROP TRIGGER IF EXISTS log_comment_activity ON public.annotation_comments;
CREATE TRIGGER log_comment_activity
    AFTER INSERT OR DELETE ON public.annotation_comments
    FOR EACH ROW EXECUTE FUNCTION public.log_comment_activity();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Rollback:
--
-- DROP TRIGGER IF EXISTS log_annotation_activity ON public.annotations;
-- DROP TRIGGER IF EXISTS log_comment_activity ON public.annotation_comments;
-- DROP FUNCTION IF EXISTS public.log_annotation_activity();
-- DROP FUNCTION IF EXISTS public.log_comment_activity();
-- DROP TABLE IF EXISTS public.activity_events;
--
-- Nothing outside the new table and its two triggers is modified, so dropping
-- them restores the previous behaviour exactly.
```

- [ ] **Step 3: Write the assertion suite**

Create `/tmp/activity_assertions.sql`. This file is scratch, not committed. It runs after the migration body inside the same transaction and asserts on live behaviour. Every assertion raises on failure, so a green run means every line passed.

```sql
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
```

- [ ] **Step 4: Run the migration and the assertions inside a rolled-back transaction**

The migration file ends in `COMMIT`. Strip it for the dry run, append the assertions, and roll back instead. Never edit the committed file to do this.

```bash
cd /Users/coenhallie/Desktop/projects/video-annotation/.claude/worktrees/pipeline-output-tab
sed 's/^COMMIT;$/-- COMMIT deferred: dry run/' migrations/20260825_activity_events.sql > /tmp/activity_dryrun.sql
cat /tmp/activity_assertions.sql >> /tmp/activity_dryrun.sql
echo 'ROLLBACK;' >> /tmp/activity_dryrun.sql
supabase db query --linked -f /tmp/activity_dryrun.sql
```

Expected: a result row reading `ASSERTIONS PASSED`. Any `RAISE EXCEPTION` message means a real defect in the migration; fix the migration, not the assertion.

- [ ] **Step 5: Confirm production is unchanged**

```bash
echo "select to_regclass('public.activity_events') as tbl;" > /tmp/activity_check.sql
supabase db query --linked -f /tmp/activity_check.sql
```

Expected: `"tbl": null`. The dry run rolled back, so the table must not exist yet. If it is non-null, the transaction committed and you must run the rollback block from the bottom of the migration before continuing.

- [ ] **Step 6: Commit**

```bash
git add migrations/20260825_activity_events.sql
git commit -m "feat: activity_events table and triggers for the history timeline

Verified against production inside BEGIN ... ROLLBACK: all eight assertions
pass and the table does not exist yet. Applying it is a separate step."
```

---

### Task 2: Apply the migration to production

**Files:**
- None. This task runs SQL and commits nothing.

**Interfaces:**
- Consumes: `migrations/20260825_activity_events.sql` from Task 1.
- Produces: `public.activity_events` live in production, so Tasks 4 to 6 have something to read.

- [ ] **Step 1: Ask the user before touching production**

This is the only task in the plan that changes production data. Ask explicitly and wait for a yes:

> "Task 1's migration passed all assertions in a rolled-back transaction. Applying it to production creates `activity_events`, backfills 205 annotation and 16 comment events, and installs two triggers on `annotations` and `annotation_comments`. Shall I apply it?"

Do not proceed without an answer. If the user says no, stop here and report that Tasks 3 to 6 can be built and tested but not exercised against real data.

- [ ] **Step 2: Apply it**

```bash
cd /Users/coenhallie/Desktop/projects/video-annotation/.claude/worktrees/pipeline-output-tab
supabase db query --linked -f migrations/20260825_activity_events.sql
```

- [ ] **Step 3: Verify the live result, read-only**

```bash
cat > /tmp/activity_verify.sql <<'SQL'
SELECT
    (SELECT count(*) FROM public.activity_events) AS events,
    (SELECT count(*) FROM public.activity_events WHERE "entityType" = 'annotation') AS annotation_events,
    (SELECT count(*) FROM public.activity_events WHERE "entityType" = 'comment') AS comment_events,
    (SELECT count(*) FROM pg_trigger
      WHERE tgname IN ('log_annotation_activity', 'log_comment_activity')
        AND NOT tgisinternal) AS triggers,
    (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'activity_events') AS policies;
SQL
supabase db query --linked -f /tmp/activity_verify.sql
```

Expected, given today's data: `annotation_events` 205, `comment_events` 16, `triggers` 2, `policies` 1. A `policies` count above 1 means a write policy exists that should not; drop it.

- [ ] **Step 4: Re-run the behavioural assertions against the live schema**

```bash
printf 'BEGIN;\n' > /tmp/activity_live_assert.sql
cat /tmp/activity_assertions.sql >> /tmp/activity_live_assert.sql
printf 'ROLLBACK;\n' >> /tmp/activity_live_assert.sql
supabase db query --linked -f /tmp/activity_live_assert.sql
```

Expected: `ASSERTIONS PASSED`. This proves the deployed triggers behave as the dry run did, and it changes nothing because it rolls back.

- [ ] **Step 5: Report, do not commit**

Nothing to commit. Report to the user the five counts from Step 3 and that the assertions passed live.

---

### Task 3: Activity types and the phrasing module

**Files:**
- Modify: `src/types/database.ts`
- Create: `src/utils/activityPhrasing.ts`
- Test: `src/utils/__tests__/activityPhrasing.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - Types `ActivityEntityType`, `ActivityAction`, `ActivitySummary`, `DatabaseActivityEvent`, `ActivityEntry`.
  - `activityVerb(entry: ActivityEntry): string`
  - `activitySubject(entry: ActivityEntry): string`
  - `activityExcerpt(entry: ActivityEntry): string`
  - `activityDayKey(iso: string): string`
  - `activityDayLabel(key: string, now?: Date): string`
  - `groupActivityByDay(entries: ActivityEntry[], now?: Date): ActivityDayGroup[]`
  - `UNKNOWN_ACTOR: 'Unknown'`

- [ ] **Step 1: Add the types**

Append to `src/types/database.ts`, after the `DatabaseProjectOpen` interface:

```ts
// Activity log interfaces
export type ActivityEntityType = 'annotation' | 'comment';
export type ActivityAction = 'created' | 'updated' | 'deleted';

/**
 * Snapshot taken at event time. Every field is optional because the row has to
 * survive schema drift in both directions: a deleted annotation has no title
 * left to join to, and a future trigger may add fields this frontend predates.
 */
export interface ActivitySummary {
  title?: string;
  excerpt?: string;
  annotationTitle?: string;
  annotationId?: string;
  timestamp?: number;
}

export interface DatabaseActivityEvent {
  id: string;
  videoId: string | null;
  comparisonVideoId: string | null;
  actorId: string | null;
  actorName: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  summary: ActivitySummary;
  createdAt: string;
}

/** A row with its actor name resolved and its target's liveness decided. */
export interface ActivityEntry extends DatabaseActivityEvent {
  actor: string;
  /** The annotation this entry points at still exists, so clicking can seek. */
  live: boolean;
}

export interface ActivityDayGroup {
  key: string;
  label: string;
  entries: ActivityEntry[];
}
```

- [ ] **Step 2: Write the failing test**

Create `src/utils/__tests__/activityPhrasing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  activityVerb,
  activitySubject,
  activityExcerpt,
  activityDayKey,
  activityDayLabel,
  groupActivityByDay,
  UNKNOWN_ACTOR,
} from '@/utils/activityPhrasing';
import type {
  ActivityAction,
  ActivityEntityType,
  ActivityEntry,
} from '@/types/database';

function entry(over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'e1',
    videoId: 'v1',
    comparisonVideoId: null,
    actorId: 'u1',
    actorName: null,
    entityType: 'annotation',
    entityId: 'a1',
    action: 'created',
    summary: { title: 'Ball out of frame', timestamp: 12.5 },
    createdAt: '2026-08-25T10:00:00.000Z',
    actor: 'Alice',
    live: true,
    ...over,
  };
}

describe('activityVerb', () => {
  const cases: Array<[ActivityEntityType, ActivityAction, string]> = [
    ['annotation', 'created', 'added'],
    ['annotation', 'updated', 'edited'],
    ['annotation', 'deleted', 'removed'],
    ['comment', 'created', 'commented on'],
    ['comment', 'deleted', 'removed a comment on'],
  ];

  it.each(cases)('%s %s reads as "%s"', (entityType, action, verb) => {
    expect(activityVerb(entry({ entityType, action }))).toBe(verb);
  });

  // A comment update cannot happen: the trigger has no UPDATE branch. If one is
  // ever added, this must not render an empty verb.
  it('falls back to a readable verb for an unmodelled pair', () => {
    expect(activityVerb(entry({ entityType: 'comment', action: 'updated' })))
      .toBe('changed a comment on');
  });
});

describe('activitySubject', () => {
  it('uses the annotation title snapshot', () => {
    expect(activitySubject(entry())).toBe('Ball out of frame');
  });

  it('uses the parent title for a comment', () => {
    expect(
      activitySubject(
        entry({
          entityType: 'comment',
          summary: { annotationTitle: 'Offside call', excerpt: 'looks wrong' },
        })
      )
    ).toBe('Offside call');
  });

  it('falls back when the snapshot has no title', () => {
    expect(activitySubject(entry({ summary: {} }))).toBe('an annotation');
  });

  it('falls back when the title is an empty string', () => {
    expect(activitySubject(entry({ summary: { title: '' } }))).toBe(
      'an annotation'
    );
  });
});

describe('activityExcerpt', () => {
  it('returns the comment excerpt', () => {
    expect(
      activityExcerpt(
        entry({ entityType: 'comment', summary: { excerpt: 'looks wrong' } })
      )
    ).toBe('looks wrong');
  });

  it('returns nothing for an annotation', () => {
    expect(activityExcerpt(entry())).toBe('');
  });
});

describe('activityDayKey', () => {
  it('keys by local calendar day', () => {
    expect(activityDayKey('2026-08-25T10:00:00.000Z')).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    );
  });

  it('returns an empty key for an unparseable timestamp', () => {
    expect(activityDayKey('not a date')).toBe('');
  });
});

describe('activityDayLabel', () => {
  const now = new Date('2026-08-25T15:00:00.000Z');

  it('labels today', () => {
    expect(activityDayLabel(activityDayKey(now.toISOString()), now)).toBe(
      'TODAY'
    );
  });

  it('labels yesterday', () => {
    const yesterday = new Date('2026-08-24T15:00:00.000Z');
    expect(
      activityDayLabel(activityDayKey(yesterday.toISOString()), now)
    ).toBe('YESTERDAY');
  });

  it('falls back to a date for anything older', () => {
    const old = new Date('2026-07-01T15:00:00.000Z');
    const label = activityDayLabel(activityDayKey(old.toISOString()), now);
    expect(label).not.toBe('TODAY');
    expect(label).not.toBe('YESTERDAY');
    expect(label.length).toBeGreaterThan(0);
  });
});

describe('groupActivityByDay', () => {
  const now = new Date('2026-08-25T15:00:00.000Z');

  it('groups entries by day, newest day first', () => {
    const groups = groupActivityByDay(
      [
        entry({ id: 'a', createdAt: '2026-08-25T10:00:00.000Z' }),
        entry({ id: 'b', createdAt: '2026-08-24T10:00:00.000Z' }),
        entry({ id: 'c', createdAt: '2026-08-25T09:00:00.000Z' }),
      ],
      now
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('TODAY');
    expect(groups[0].entries.map((e) => e.id)).toEqual(['a', 'c']);
    expect(groups[1].label).toBe('YESTERDAY');
    expect(groups[1].entries.map((e) => e.id)).toEqual(['b']);
  });

  it('returns nothing for no entries', () => {
    expect(groupActivityByDay([], now)).toEqual([]);
  });

  it('keeps entries with an unparseable timestamp in their own group', () => {
    const groups = groupActivityByDay([entry({ createdAt: 'nonsense' })], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(1);
  });
});

describe('UNKNOWN_ACTOR', () => {
  it('is the single spelling of an unresolvable actor', () => {
    expect(UNKNOWN_ACTOR).toBe('Unknown');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/activityPhrasing.test.ts`
Expected: FAIL, "Failed to resolve import ... activityPhrasing".

- [ ] **Step 4: Write the implementation**

Create `src/utils/activityPhrasing.ts`:

```ts
import type {
  ActivityDayGroup,
  ActivityEntry,
  ActivityAction,
  ActivityEntityType,
} from '@/types/database';

/** The single spelling of an actor we could not resolve to a name. */
export const UNKNOWN_ACTOR = 'Unknown';

const FALLBACK_SUBJECT = 'an annotation';

/**
 * The verb table. Keyed "entityType:action" because the two dimensions do not
 * compose: a deleted annotation is "removed", a deleted comment is "removed a
 * comment on" the annotation it hung from, and the sentence has to keep naming
 * the annotation either way.
 */
const VERBS: Record<string, string> = {
  'annotation:created': 'added',
  'annotation:updated': 'edited',
  'annotation:deleted': 'removed',
  'comment:created': 'commented on',
  'comment:deleted': 'removed a comment on',
  // Unreachable today: the comment trigger has no UPDATE branch. Present so
  // that adding one later degrades to a readable sentence rather than a blank.
  'comment:updated': 'changed a comment on',
};

const verbKey = (t: ActivityEntityType, a: ActivityAction) => `${t}:${a}`;

export function activityVerb(entry: ActivityEntry): string {
  return VERBS[verbKey(entry.entityType, entry.action)] ?? 'changed';
}

/**
 * What the sentence is about, always the annotation. A comment entry names its
 * parent, so a reader scanning the feed sees one subject vocabulary rather than
 * annotations and comment bodies alternating.
 */
export function activitySubject(entry: ActivityEntry): string {
  const title =
    entry.entityType === 'comment'
      ? entry.summary.annotationTitle
      : entry.summary.title;
  return title && title.length > 0 ? title : FALLBACK_SUBJECT;
}

/** The comment body, shown under the sentence. Empty for annotations. */
export function activityExcerpt(entry: ActivityEntry): string {
  if (entry.entityType !== 'comment') return '';
  return entry.summary.excerpt ?? '';
}

/**
 * Local calendar day, not UTC. Grouping by UTC would put an evening's work
 * under tomorrow's heading for anyone west of Greenwich.
 */
export function activityDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function activityDayLabel(key: string, now: Date = new Date()): string {
  if (!key) return 'UNDATED';

  const today = activityDayKey(now.toISOString());
  if (key === today) return 'TODAY';

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  if (key === activityDayKey(yesterdayDate.toISOString())) return 'YESTERDAY';

  // Parsed as local midnight rather than through Date(key), which reads a bare
  // yyyy-mm-dd as UTC and can print the previous day.
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

/**
 * Entries arrive newest first from the service, so day order and within-day
 * order both fall out of insertion order. No sorting here: re-sorting would let
 * this module disagree with the query's ORDER BY.
 */
export function groupActivityByDay(
  entries: ActivityEntry[],
  now: Date = new Date()
): ActivityDayGroup[] {
  const groups: ActivityDayGroup[] = [];
  const byKey = new Map<string, ActivityDayGroup>();

  for (const entry of entries) {
    const key = activityDayKey(entry.createdAt);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: activityDayLabel(key, now), entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }

  return groups;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/activityPhrasing.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/utils/activityPhrasing.ts src/utils/__tests__/activityPhrasing.test.ts
git commit -m "feat: activity event types and phrasing"
```

---

### Task 4: The activity service

**Files:**
- Create: `src/services/activityService.ts`
- Test: `src/services/__tests__/activityService.test.ts`

**Interfaces:**
- Consumes: `ActivityEntry`, `DatabaseActivityEvent`, `UNKNOWN_ACTOR` from Task 3; `fetchOwners` from `@/services/ownerEnrichmentService`.
- Produces: `export type ActivityTarget = { videoId: string } | { comparisonVideoId: string }` and `export async function getActivity(target: ActivityTarget, limit?: number): Promise<ActivityEntry[]>`.

Three reads, all on indexed keys: the events for this target, the ids of the annotations those events name that still exist, and the actor names. The liveness read is a separate query rather than a PostgREST embed because `entityId` deliberately has no foreign key, so there is nothing for PostgREST to embed through. It is also why liveness cannot be answered from the annotations already loaded in the editor: those are filtered by the active surface, so a video-surface annotation would read as deleted while the pipeline tab is open.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/activityService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const fetchOwners = vi.fn();

vi.mock('@/composables/useSupabase', () => ({ supabase: { from } }));
vi.mock('@/services/ownerEnrichmentService', () => ({
  fetchOwners: (...args: unknown[]) => fetchOwners(...args),
}));

const loadService = async () => await import('@/services/activityService');

/** Terminal builder for the events read: .select().eq().order().limit() */
function eventsQuery(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve(result));
  return builder;
}

/** Terminal builder for the liveness read: .select().in() */
function livenessQuery(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.in = vi.fn(() => Promise.resolve(result));
  return builder;
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  videoId: 'v1',
  comparisonVideoId: null,
  actorId: 'u1',
  actorName: null,
  entityType: 'annotation',
  entityId: 'a1',
  action: 'created',
  summary: { title: 'Ball out of frame', timestamp: 12.5 },
  createdAt: '2026-08-25T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchOwners.mockResolvedValue({ u1: { id: 'u1', name: 'Alice' } });
});

describe('getActivity', () => {
  it('queries events for a single video, newest first', async () => {
    const events = eventsQuery({ data: [row()], error: null });
    const live = livenessQuery({ data: [{ id: 'a1' }], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    await getActivity({ videoId: 'v1' });

    expect(from).toHaveBeenCalledWith('activity_events');
    expect(events.eq).toHaveBeenCalledWith('videoId', 'v1');
    expect(events.order).toHaveBeenCalledWith('createdAt', { ascending: false });
    expect(events.limit).toHaveBeenCalledWith(100);
  });

  it('queries events for a comparison target on the comparison column', async () => {
    const events = eventsQuery({ data: [], error: null });
    from.mockReturnValue(events);

    const { getActivity } = await loadService();
    await getActivity({ comparisonVideoId: 'c9' });

    expect(events.eq).toHaveBeenCalledWith('comparisonVideoId', 'c9');
  });

  it('honours an explicit limit', async () => {
    const events = eventsQuery({ data: [], error: null });
    from.mockReturnValue(events);

    const { getActivity } = await loadService();
    await getActivity({ videoId: 'v1' }, 10);

    expect(events.limit).toHaveBeenCalledWith(10);
  });

  it('resolves actor names through fetchOwners', async () => {
    const events = eventsQuery({ data: [row()], error: null });
    const live = livenessQuery({ data: [{ id: 'a1' }], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(fetchOwners).toHaveBeenCalledWith(['u1']);
    expect(entries[0].actor).toBe('Alice');
  });

  it('prefers the snapshot name when there is no actor id', async () => {
    const events = eventsQuery({
      data: [row({ actorId: null, actorName: 'Visitor 7', entityType: 'comment' })],
      error: null,
    });
    const live = livenessQuery({ data: [], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries[0].actor).toBe('Visitor 7');
  });

  it('falls back to Unknown when neither an id nor a name resolves', async () => {
    const events = eventsQuery({
      data: [row({ actorId: 'gone', actorName: null })],
      error: null,
    });
    const live = livenessQuery({ data: [], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );
    fetchOwners.mockResolvedValue({ gone: { id: 'gone', name: 'Unknown' } });

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries[0].actor).toBe('Unknown');
  });

  it('marks an entry live when its annotation still exists', async () => {
    const events = eventsQuery({
      data: [row({ entityId: 'a1' }), row({ id: 'e2', entityId: 'a2' })],
      error: null,
    });
    const live = livenessQuery({ data: [{ id: 'a1' }], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries[0].live).toBe(true);
    expect(entries[1].live).toBe(false);
  });

  it('checks liveness against the comment parent, not the comment id', async () => {
    const events = eventsQuery({
      data: [
        row({
          entityType: 'comment',
          entityId: 'c1',
          summary: { annotationId: 'a1', excerpt: 'hi' },
        }),
      ],
      error: null,
    });
    const live = livenessQuery({ data: [{ id: 'a1' }], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(live.in).toHaveBeenCalledWith('id', ['a1']);
    expect(entries[0].live).toBe(true);
  });

  it('marks a deleted annotation as not live', async () => {
    const events = eventsQuery({
      data: [row({ action: 'deleted' })],
      error: null,
    });
    // The annotation is gone, so the liveness read cannot return it.
    const live = livenessQuery({ data: [], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries[0].live).toBe(false);
  });

  // Liveness is a fact about the target, not about the action. A removed
  // comment on a surviving annotation still has somewhere to seek to.
  it('keeps a comment-delete entry live when its parent annotation survives', async () => {
    const events = eventsQuery({
      data: [
        row({
          entityType: 'comment',
          entityId: 'c1',
          action: 'deleted',
          summary: { annotationId: 'a1', excerpt: 'gone now' },
        }),
      ],
      error: null,
    });
    const live = livenessQuery({ data: [{ id: 'a1' }], error: null });
    from.mockImplementation((table: string) =>
      table === 'activity_events' ? events : live
    );

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries[0].live).toBe(true);
  });

  it('returns an empty list and does not throw when the query errors', async () => {
    const events = eventsQuery({ data: null, error: { message: 'boom' } });
    from.mockReturnValue(events);

    const { getActivity } = await loadService();
    await expect(getActivity({ videoId: 'v1' })).resolves.toEqual([]);
  });

  it('skips the liveness and owner reads when there are no events', async () => {
    const events = eventsQuery({ data: [], error: null });
    from.mockReturnValue(events);

    const { getActivity } = await loadService();
    const entries = await getActivity({ videoId: 'v1' });

    expect(entries).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(fetchOwners).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/__tests__/activityService.test.ts`
Expected: FAIL, "Failed to resolve import ... activityService".

- [ ] **Step 3: Write the implementation**

Create `src/services/activityService.ts`:

```ts
import { supabase } from '@/composables/useSupabase';
import { fetchOwners } from '@/services/ownerEnrichmentService';
import { UNKNOWN_ACTOR } from '@/utils/activityPhrasing';
import type { ActivityEntry, DatabaseActivityEvent } from '@/types/database';

export type ActivityTarget = { videoId: string } | { comparisonVideoId: string };

/**
 * Safety bound on the read. The busiest video has 19 annotations today, so this
 * is far above anything real; it exists so a pathological row count can never
 * turn opening a tab into a big query. There is deliberately no pagination:
 * when a single video's history genuinely exceeds this, that is a real question
 * and answering it now would be guessing.
 */
const DEFAULT_LIMIT = 100;

const COLUMNS =
  'id, videoId, comparisonVideoId, actorId, actorName, entityType, entityId, action, summary, createdAt';

/**
 * The annotation an event points at. For a comment that is its parent, which
 * the trigger snapshots into the summary, because seeking to a comment means
 * seeking to the annotation it hangs from.
 */
function annotationIdFor(row: DatabaseActivityEvent): string | null {
  if (row.entityType === 'annotation') return row.entityId;
  return row.summary?.annotationId ?? null;
}

/**
 * This video's activity, newest first, with actor names resolved.
 *
 * Three reads, all on indexed keys. The liveness read is separate rather than a
 * PostgREST embed because "entityId" deliberately carries no foreign key, so
 * there is nothing to embed through. It also cannot be answered from the
 * annotations the editor already holds: those are filtered by the active
 * surface, so a video-surface annotation would read as deleted whenever the
 * pipeline tab is open.
 *
 * Failures are warned and swallowed, returning an empty list, matching
 * watchProgressService and recentOpensService. A history panel that cannot load
 * must not take the editor down with it.
 */
export async function getActivity(
  target: ActivityTarget,
  limit: number = DEFAULT_LIMIT
): Promise<ActivityEntry[]> {
  try {
    const isSingle = 'videoId' in target;
    const column = isSingle ? 'videoId' : 'comparisonVideoId';
    const value = isSingle ? target.videoId : target.comparisonVideoId;

    const { data, error } = await supabase
      .from('activity_events')
      .select(COLUMNS)
      .eq(column, value)
      .order('createdAt', { ascending: false })
      .limit(limit);

    if (error || !data) {
      if (error) console.warn('⚠️ [activity] getActivity error:', error);
      return [];
    }

    const rows = data as DatabaseActivityEvent[];
    if (rows.length === 0) return [];

    const annotationIds = [
      ...new Set(rows.map(annotationIdFor).filter((id): id is string => !!id)),
    ];

    const [liveIds, owners] = await Promise.all([
      fetchLiveAnnotationIds(annotationIds),
      fetchOwners(
        rows.map((r) => r.actorId).filter((id): id is string => !!id)
      ),
    ]);

    return rows.map((row) => {
      const annotationId = annotationIdFor(row);
      // Liveness is a fact about the target, not about the action. A deleted
      // annotation simply cannot come back from the liveness read, while a
      // removed comment on a surviving annotation still has somewhere to seek
      // to. Special-casing `action === 'deleted'` would break the second case.
      return {
        ...row,
        actor: resolveActor(row, owners),
        live: !!annotationId && liveIds.has(annotationId),
      };
    });
  } catch (err) {
    console.warn('⚠️ [activity] getActivity failed:', err);
    return [];
  }
}

async function fetchLiveAnnotationIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from('annotations')
    .select('id')
    .in('id', ids);

  if (error || !data) {
    if (error) console.warn('⚠️ [activity] liveness lookup error:', error);
    // Unknown liveness degrades to inert entries rather than to seeks that
    // silently do nothing.
    return new Set();
  }
  return new Set((data as Array<{ id: string }>).map((r) => r.id));
}

/**
 * The id wins when it resolves, so a rename propagates through the whole feed.
 * The snapshot name is the fallback for the two cases with no id: an anonymous
 * share-link commenter, and a deleted user.
 */
function resolveActor(
  row: DatabaseActivityEvent,
  owners: Record<string, { name: string }>
): string {
  if (row.actorId) {
    const name = owners[row.actorId]?.name;
    if (name && name !== 'Unknown') return name;
  }
  return row.actorName || UNKNOWN_ACTOR;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/__tests__/activityService.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/activityService.ts src/services/__tests__/activityService.test.ts
git commit -m "feat: activity service reading the per-video event log"
```

---

### Task 5: The timeline component

**Files:**
- Create: `src/components/ActivityTimeline.vue`
- Test: `src/components/__tests__/activityTimeline.test.ts`

**Interfaces:**
- Consumes: `getActivity`, `ActivityTarget` from Task 4; the phrasing module from Task 3; `formatTime` from `@/utils/formatters`; `formatRelativeTime` from `@/utils/relativeTime`.
- Produces: a component with props `{ target: ActivityTarget | null; active: boolean }` and one emit, `(e: 'select-annotation', annotationId: string, timestamp: number) => void`.

The component owns its own fetch rather than receiving entries as a prop: the sidebar's other panel does the same, and hoisting the fetch into `EditorView` would add a fourth loading state to a view that already has three.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/activityTimeline.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { ActivityEntry } from '@/types/database';

const getActivity = vi.fn();
vi.mock('@/services/activityService', () => ({
  getActivity: (...args: unknown[]) => getActivity(...args),
}));

import ActivityTimeline from '@/components/ActivityTimeline.vue';

function entry(over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'e1',
    videoId: 'v1',
    comparisonVideoId: null,
    actorId: 'u1',
    actorName: null,
    entityType: 'annotation',
    entityId: 'a1',
    action: 'created',
    summary: { title: 'Ball out of frame', timestamp: 12.5 },
    createdAt: new Date().toISOString(),
    actor: 'Alice',
    live: true,
    ...over,
  };
}

function mount(props: Record<string, unknown>) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const selected: Array<[string, number]> = [];
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(ActivityTimeline, {
          ...props,
          onSelectAnnotation: (id: string, t: number) => selected.push([id, t]),
        }),
    })
  );
  app.mount(root);
  return {
    root,
    selected,
    q: (sel: string) => root.querySelector<HTMLElement>(sel),
    all: (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel)),
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getActivity.mockResolvedValue([]);
});

describe('ActivityTimeline', () => {
  it('does not fetch while inactive', async () => {
    const w = mount({ target: { videoId: 'v1' }, active: false });
    await nextTick();
    expect(getActivity).not.toHaveBeenCalled();
    w.unmount();
  });

  it('fetches once when it becomes active', async () => {
    getActivity.mockResolvedValue([entry()]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    expect(getActivity).toHaveBeenCalledWith({ videoId: 'v1' });
    expect(w.all('[data-testid="activity-entry"]')).toHaveLength(1);
    w.unmount();
  });

  it('renders the sentence with actor, verb and subject', async () => {
    getActivity.mockResolvedValue([entry()]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    const text = w.q('[data-testid="activity-entry"]')?.textContent ?? '';
    expect(text).toContain('Alice');
    expect(text).toContain('added');
    expect(text).toContain('Ball out of frame');
    w.unmount();
  });

  it('renders a day heading', async () => {
    getActivity.mockResolvedValue([entry()]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    expect(w.q('[data-testid="activity-day"]')?.textContent).toContain('TODAY');
    w.unmount();
  });

  it('renders the comment excerpt under a comment entry', async () => {
    getActivity.mockResolvedValue([
      entry({
        entityType: 'comment',
        summary: { annotationTitle: 'Offside call', excerpt: 'looks wrong' },
      }),
    ]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    expect(w.q('[data-testid="activity-excerpt"]')?.textContent).toContain(
      'looks wrong'
    );
    w.unmount();
  });

  it('emits select-annotation with the snapshot timestamp when a live entry is clicked', async () => {
    getActivity.mockResolvedValue([entry()]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    w.q('[data-testid="activity-entry"]')?.click();
    expect(w.selected).toEqual([['a1', 12.5]]);
    w.unmount();
  });

  it('renders an entry whose target is gone as plain text, not a button, and emits nothing', async () => {
    getActivity.mockResolvedValue([entry({ live: false, action: 'deleted' })]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    const el = w.q('[data-testid="activity-entry"]');
    expect(el?.tagName).toBe('DIV');
    el?.click();
    expect(w.selected).toEqual([]);
    w.unmount();
  });

  it('renders a live entry as a button', async () => {
    getActivity.mockResolvedValue([entry()]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    expect(w.q('[data-testid="activity-entry"]')?.tagName).toBe('BUTTON');
    w.unmount();
  });

  it('shows an empty state when there is no activity', async () => {
    getActivity.mockResolvedValue([]);
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();

    expect(w.q('[data-testid="activity-empty"]')).not.toBeNull();
    w.unmount();
  });

  it('refetches when the target changes', async () => {
    const w = mount({ target: { videoId: 'v1' }, active: true });
    await nextTick();
    await nextTick();
    expect(getActivity).toHaveBeenCalledTimes(1);
    w.unmount();

    const w2 = mount({ target: { videoId: 'v2' }, active: true });
    await nextTick();
    await nextTick();
    expect(getActivity).toHaveBeenLastCalledWith({ videoId: 'v2' });
    w2.unmount();
  });

  it('renders nothing and does not fetch without a target', async () => {
    const w = mount({ target: null, active: true });
    await nextTick();
    expect(getActivity).not.toHaveBeenCalled();
    w.unmount();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/activityTimeline.test.ts`
Expected: FAIL, "Failed to resolve import ... ActivityTimeline.vue".

- [ ] **Step 3: Write the implementation**

Create `src/components/ActivityTimeline.vue`:

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { getActivity, type ActivityTarget } from '@/services/activityService';
import {
  activityVerb,
  activitySubject,
  activityExcerpt,
  groupActivityByDay,
} from '@/utils/activityPhrasing';
import { formatTime } from '@/utils/formatters';
import { formatRelativeTime } from '@/utils/relativeTime';
import type { ActivityEntry } from '@/types/database';

const props = defineProps<{
  target: ActivityTarget | null;
  /** The History tab is the one on screen. Nothing loads until it is. */
  active: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-annotation', annotationId: string, timestamp: number): void;
}>();

const entries = ref<ActivityEntry[]>([]);
const loading = ref(false);

/**
 * Guards against a stale response overwriting a newer one when the target
 * changes mid-flight, the same pattern VideoDetailsPanel uses for watch
 * progress.
 */
let request = 0;

const load = async () => {
  if (!props.active || !props.target) return;
  const reqId = ++request;
  loading.value = true;
  const rows = await getActivity(props.target);
  if (request !== reqId) return;
  entries.value = rows;
  loading.value = false;
};

watch(
  () => [props.active, props.target] as const,
  () => {
    void load();
  },
  { immediate: true }
);

const groups = computed(() => groupActivityByDay(entries.value));

const annotationIdOf = (entry: ActivityEntry) =>
  entry.entityType === 'annotation'
    ? entry.entityId
    : (entry.summary.annotationId ?? '');

const onEntryClick = (entry: ActivityEntry) => {
  if (!entry.live) return;
  const id = annotationIdOf(entry);
  if (!id) return;
  emit('select-annotation', id, entry.summary.timestamp ?? 0);
};
</script>

<template>
  <div
    class="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-gray-900"
  >
    <header class="flex shrink-0 items-baseline gap-2.5 px-4 pb-3 pt-4">
      <h2
        class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white"
      >
        History
      </h2>
      <span class="font-mono text-[11px] text-gray-500 dark:text-gray-500">
        {{ entries.length }}
      </span>
    </header>

    <div class="flex-1 overflow-y-auto px-4 pb-4">
      <p
        v-if="loading && entries.length === 0"
        class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400"
      >
        Loading
      </p>

      <p
        v-else-if="entries.length === 0"
        data-testid="activity-empty"
        class="text-[13px] text-gray-500 dark:text-gray-400"
      >
        Nothing has happened on this video yet.
      </p>

      <template v-else>
        <section v-for="group in groups" :key="group.key" class="mb-4">
          <h3
            data-testid="activity-day"
            class="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400"
          >
            {{ group.label }}
          </h3>

          <!-- The rule is a border on the list, not a pseudo-element per row,
               so it stays continuous through entries of different heights. -->
          <ul class="border-l border-gray-200 pl-3 dark:border-white/10">
            <li v-for="entry in group.entries" :key="entry.id" class="relative py-1.5">
              <!-- The dot sits on the rule, 1px of overlap on each side so it
                   reads as a node rather than a bullet floating beside it. -->
              <span
                class="absolute -left-[17px] top-[13px] h-1.5 w-1.5 rounded-full"
                :class="
                  entry.live
                    ? 'bg-gray-400 dark:bg-gray-500'
                    : 'bg-gray-300 dark:bg-gray-700'
                "
              />

              <!-- A dead entry is a div, never a button: a control that does
                   nothing when clicked is worse than plain text. It must not
                   take focus and must not show a pointer cursor. -->
              <component
                :is="entry.live ? 'button' : 'div'"
                :type="entry.live ? 'button' : undefined"
                data-testid="activity-entry"
                class="block w-full text-left"
                :class="
                  entry.live
                    ? 'cursor-pointer'
                    : 'cursor-default text-gray-400 dark:text-gray-600'
                "
                @click="onEntryClick(entry)"
              >
                <span
                  class="text-[13px]"
                  :class="
                    entry.live
                      ? 'text-gray-900 dark:text-gray-200'
                      : 'text-gray-400 dark:text-gray-600'
                  "
                >
                  <span class="font-semibold">{{ entry.actor }}</span>
                  {{ ' ' }}{{ activityVerb(entry) }}{{ ' ' }}
                  <span :class="entry.live ? '' : 'line-through'">
                    {{ activitySubject(entry) }}
                  </span>
                </span>

                <span
                  class="ml-2 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
                >
                  {{ formatTime(entry.summary.timestamp ?? 0) }}
                  ·
                  {{ formatRelativeTime(entry.createdAt) }}
                </span>

                <span
                  v-if="activityExcerpt(entry)"
                  data-testid="activity-excerpt"
                  class="mt-0.5 block truncate text-[12px] text-gray-500 dark:text-gray-400"
                >
                  {{ activityExcerpt(entry) }}
                </span>
              </component>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/activityTimeline.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ActivityTimeline.vue src/components/__tests__/activityTimeline.test.ts
git commit -m "feat: vertical activity timeline component"
```

---

### Task 6: The sidebar tab bar and the editor wiring

**Files:**
- Modify: `src/types/component-interfaces.ts`
- Create: `src/components/SidebarTabs.vue`
- Test: `src/components/__tests__/sidebarTabs.test.ts`
- Modify: `src/views/EditorView.vue` (the `<aside>` block, currently lines 1880 to 1967)

**Interfaces:**
- Consumes: `ActivityTimeline` from Task 5.
- Produces: `SidebarTab` in `src/types/component-interfaces.ts`, and `SidebarTabs` with props `{ modelValue: SidebarTab }`, emitting `update:modelValue`.

- [ ] **Step 1: Add the type**

`<script setup>` cannot carry named exports, and the one SFC in this codebase that exports a type does it through a second `<script lang="ts">` block that only re-exports from `src/types/component-interfaces.ts`. Follow that: the type lives in the types file and is imported everywhere.

Append to `src/types/component-interfaces.ts`:

```ts
/** Which panel the editor sidebar is showing. */
export type SidebarTab = 'annotations' | 'history';
```

- [ ] **Step 2: Write the failing test**

Create `src/components/__tests__/sidebarTabs.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, ref } from 'vue';
import SidebarTabs from '@/components/SidebarTabs.vue';
import type { SidebarTab } from '@/types/component-interfaces';

function mount(initial: SidebarTab) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const model = ref<SidebarTab>(initial);
  const changes: SidebarTab[] = [];
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(SidebarTabs, {
          modelValue: model.value,
          'onUpdate:modelValue': (v: SidebarTab) => {
            changes.push(v);
            model.value = v;
          },
        }),
    })
  );
  app.mount(root);
  return {
    changes,
    tab: (id: SidebarTab) =>
      root.querySelector<HTMLElement>(`[data-testid="sidebar-tab-${id}"]`),
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

describe('SidebarTabs', () => {
  it('renders both tabs', () => {
    const w = mount('annotations');
    expect(w.tab('annotations')).not.toBeNull();
    expect(w.tab('history')).not.toBeNull();
    w.unmount();
  });

  it('marks the active tab selected', () => {
    const w = mount('annotations');
    expect(w.tab('annotations')?.getAttribute('aria-selected')).toBe('true');
    expect(w.tab('history')?.getAttribute('aria-selected')).toBe('false');
    w.unmount();
  });

  it('emits when a different tab is clicked', () => {
    const w = mount('annotations');
    w.tab('history')?.click();
    expect(w.changes).toEqual(['history']);
    w.unmount();
  });

  // Every emit costs a refetch in ActivityTimeline's watcher.
  it('does not emit when the active tab is re-clicked', () => {
    const w = mount('annotations');
    w.tab('annotations')?.click();
    expect(w.changes).toEqual([]);
    w.unmount();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/sidebarTabs.test.ts`
Expected: FAIL, "Failed to resolve import ... SidebarTabs.vue".

- [ ] **Step 4: Write the tab bar**

Create `src/components/SidebarTabs.vue`:

```vue
<script setup lang="ts">
import type { SidebarTab } from '@/types/component-interfaces';

const props = defineProps<{ modelValue: SidebarTab }>();

const emit = defineEmits<{
  (e: 'update:modelValue', tab: SidebarTab): void;
}>();

const TABS: Array<{ id: SidebarTab; label: string }> = [
  { id: 'annotations', label: 'Annotations' },
  { id: 'history', label: 'History' },
];

/**
 * Re-clicking the active tab is a no-op on purpose. Every emit reaches
 * ActivityTimeline's watcher and costs a refetch.
 */
const select = (tab: SidebarTab) => {
  if (tab === props.modelValue) return;
  emit('update:modelValue', tab);
};
</script>

<template>
  <!-- Deliberately not styled like EditorSurfaceTabs, which sits above the
       player on black and switches what the video area shows. Two tab bars on
       one screen that look identical read as one control. This one lives on the
       sidebar's own surface and uses the panel's border colour. -->
  <div
    role="tablist"
    aria-label="Sidebar panel"
    class="flex shrink-0 items-center gap-1 border-b border-gray-200 px-3 dark:border-white/10"
  >
    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      role="tab"
      :data-testid="`sidebar-tab-${tab.id}`"
      :aria-selected="tab.id === modelValue ? 'true' : 'false'"
      class="relative -mb-px border-b-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
      :class="
        tab.id === modelValue
          ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
          : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
      "
      @click="select(tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/sidebarTabs.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Wire it into the editor**

In `src/views/EditorView.vue`, add to the imports near `import AnnotationPanel from '@/components/AnnotationPanel.vue';`:

```ts
import SidebarTabs from '@/components/SidebarTabs.vue';
import ActivityTimeline from '@/components/ActivityTimeline.vue';
import type { SidebarTab } from '@/types/component-interfaces';
import type { ActivityTarget } from '@/services/activityService';
```

Add to the script body, next to the other sidebar state (near `isChangelogModalOpen`):

```ts
const sidebarTab = ref<SidebarTab>('annotations');

/**
 * Null while the editor is still resolving a project, which keeps
 * ActivityTimeline from firing a query against an id that is about to change.
 */
const activityTarget = computed<ActivityTarget | null>(() => {
  if (currentComparisonId.value) {
    return { comparisonVideoId: currentComparisonId.value };
  }
  if (currentVideoId.value) return { videoId: currentVideoId.value };
  return null;
});

/**
 * Anonymous and shared-link viewers get no History tab. The RLS policy on
 * activity_events is TO authenticated, so the feed would be empty for them, and
 * an empty tab reads as a bug rather than as a permission.
 */
const showHistoryTab = computed(
  () => !!user.value && !isSharedVideo.value && !isSharedComparison.value
);

/**
 * The timeline seeks by the annotation's snapshotted timestamp, and selects it
 * when it is still in the loaded list. It does not go through
 * onAnnotationClick directly because that needs the Annotation object, which a
 * history entry does not carry.
 */
const onHistorySelect = (annotationId: string, timestamp: number) => {
  const annotation = (annotations.value || []).find(
    (a) => a.id === annotationId
  );
  if (annotation) {
    onAnnotationClick(annotation);
    return;
  }
  void handleSeekToTimeWithFade(timestamp);
};
```

Replace the sidebar's `<!-- Annotation Panel -->` wrapper (currently the `<div class="flex-1 overflow-hidden">` at line 1893 and its closing tag) with the tab bar plus the switch. The watch-coverage hint above it is unchanged.

```vue
        <SidebarTabs
          v-if="showHistoryTab"
          v-model="sidebarTab"
        />

        <!-- Annotation Panel -->
        <div v-show="sidebarTab === 'annotations'" class="flex-1 overflow-hidden">
          <AnnotationPanel
            v-if="drawingCanvas"
            :annotations="annotations || []"
            ... every existing prop and handler on this element stays byte for
            byte as it is today. The only change in this block is the wrapping
            div's `v-show`. Do not retype the prop list; edit the `<div>` line
            and leave the element between it and its closing tag untouched. ...
          />
        </div>

        <div v-if="showHistoryTab" v-show="sidebarTab === 'history'" class="flex-1 overflow-hidden">
          <ActivityTimeline
            :target="activityTarget"
            :active="sidebarTab === 'history'"
            @select-annotation="onHistorySelect"
          />
        </div>
```

`v-show` rather than `v-if` on the annotation panel: `AnnotationPanel` owns drawing-canvas wiring and form drafts that must survive a tab switch. `ActivityTimeline` gets `v-show` too so its loaded feed survives, and `:active` is what actually gates its fetching.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS. `EditorView` has existing tests under `src/views/__tests__/`; if any break, the wiring changed something it should not have.

- [ ] **Step 8: Verify in the running app**

```bash
npm run dev
```

Open a video that has annotations. Confirm, and fix anything that is not true:

1. The sidebar shows `ANNOTATIONS` and `HISTORY`; the annotations tab is active on load.
2. The History tab lists the backfilled `created` events with real names, newest first, under a day heading.
3. Adding an annotation and switching to History shows it, attributed to you.
4. Deleting that annotation and returning to History shows a `removed` entry, and the `added` entry is now struck through and inert.
5. Clicking a live entry seeks the video.
6. Clicking a dead entry does nothing, shows no pointer cursor, and cannot be focused with Tab.
7. Both light and dark themes read correctly. The rule, dots and inert-entry greys must all stay legible in both.
8. The sidebar tab bar is visually distinct from the surface tab bar above the player.
9. **Canvas geometry survives the switch.** `v-show` keeps `AnnotationPanel` mounted but sets `display: none` on its subtree, and a canvas inside a hidden subtree reports zero width and height. Switch to History, switch back, then draw an annotation on the video and confirm the drawing lands under the cursor rather than offset or scaled. If it does not, the wrapper needs its size preserved (`v-show` on a sibling overlay, or an explicit resize on tab activation) rather than a switch to `v-if`, which would lose the form draft.

- [ ] **Step 9: Commit**

```bash
git add src/types/component-interfaces.ts src/components/SidebarTabs.vue src/components/__tests__/sidebarTabs.test.ts src/views/EditorView.vue
git commit -m "feat: history tab in the editor sidebar"
```

---

## Self-Review Notes

Checked against the spec:

- Table, indexes, RLS, grants, backfill, both triggers, cascade guards, the weak target check, the INSERT-only actor fallback: Task 1.
- "Applying it is the user's call": Task 2 Step 1 is an explicit stop.
- Phrasing as a pure module, day grouping: Task 3.
- Three indexed reads, `fetchOwners` reuse, failures swallowed: Task 4.
- Vertical rule with dots, day groups, dimmed inert entries with no button role, seek on click, lazy load, no realtime, `limit` 100 with no pagination: Task 5.
- Tab hidden for shared and anonymous viewers, `AnnotationPanel` untouched, tab bar visually distinct from `EditorSurfaceTabs`: Task 6.

Known deviation from the spec's testing section: the spec lists "Insert attributes to the caller, not to the row's `userId`, when the two differ" as an SQL assertion. It is not constructible, since the annotations INSERT policy forces `auth.uid() = "userId"`. Task 1's assertion 5 covers the cross-user case that does exist, a comment deleted by the annotation's owner. The spec already says this in its own testing section.
