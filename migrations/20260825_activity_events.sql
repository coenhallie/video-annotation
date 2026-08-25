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
    jsonb_build_object('title', a.title, 'timestamp', a."timestamp", 'surface', a.surface),
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
        'timestamp', a."timestamp",
        'surface', a.surface
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

    -- "actorId" references public.users, ON DELETE SET NULL, so a departed
    -- user already degrades gracefully once they're gone. But nothing stops
    -- v_actor from naming a users row that never existed or was removed in
    -- this same transaction (e.g. auth.uid() outliving its public.users row
    -- some other way than the ordinary auth.users cascade). This table must
    -- never fail a write it is only observing, the same rule that keeps
    -- "entityId" unconstrained and the target CHECK weak, so degrade to NULL
    -- here rather than let the FK raise 23503 and abort the annotation write.
    IF v_actor IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN
        v_actor := NULL;
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
        jsonb_build_object('title', v_row.title, 'timestamp', v_row."timestamp", 'surface', v_row.surface)
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
    v_actor      uuid := auth.uid();
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_row := OLD;
        v_action := 'deleted';
    ELSE
        v_row := NEW;
        v_action := 'created';
    END IF;

    -- annotation_comments has no videoId of its own. surface is read here too:
    -- a comment has no surface of its own, it inherits the one its parent
    -- annotation lives on.
    SELECT a."videoId", a."comparisonVideoId", a.title, a."timestamp", a.surface
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

    -- Same degrade-to-NULL as log_annotation_activity(): "actorId" references
    -- public.users, and this table must never fail a write it is only
    -- observing. auth.uid() outliving its public.users row is not reachable
    -- today, but nothing here should depend on that staying true.
    IF v_actor IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN
        v_actor := NULL;
    END IF;

    INSERT INTO public.activity_events (
        "videoId", "comparisonVideoId", "actorId", "actorName",
        "entityType", "entityId", action, summary
    ) VALUES (
        v_video,
        v_comparison,
        v_actor,
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
            'timestamp', v_ann."timestamp",
            'surface', v_ann.surface
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
