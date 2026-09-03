# Renaming a video

Date: 2026-09-03

## Problem

A pipeline output opened from a DALF deep link is called
`Pipeline Output - 1b30b3cc`. That name is minted client-side in
`VideoService.findOrCreateOutputVideo` (src/services/videoService.ts:616) from the
first eight characters of the output id, because the deep link carries an id and
nothing else. Nobody can change it.

Three separate things stand between that and a video everyone knows by a real
name:

1. **There is no rename.** `videos.title` has no write path except the
   `auth.uid() = "ownerId"` UPDATE policy, and no UI anywhere in the app.
2. **Nobody but the first opener can see a pipeline output.** The row is created
   `isPublic: false`, owned by whoever followed the link first. The three SELECT
   policies on `videos` are own, public, and member of a public comparison, so a
   second person's `findVideoByOutputVideoId` returns nothing, their insert hits
   `videos_aws_video_id_unique`, and they are told the video is *"already claimed
   by another account"*. Of the 33 `aws:` rows in production, 31 are private.
3. **The history has no vocabulary for it.** `activity_events.entityType` is
   `CHECK ("entityType" IN ('annotation', 'comment'))`, and
   `src/utils/activityPhrasing.ts` can only build sentences about annotations and
   comments.

"Every user sees the new name" is unreachable while (2) holds, which is why this
document changes visibility as well as adding a rename.

## Scope

In:

- Pipeline outputs become visible to every signed-in account: readable,
  openable, annotatable, commentable, renameable.
- A `rename_video()` function that lets anyone who can see a video rename it.
- A rename entry in the per-video history, written by a trigger, naming who did
  it and what the name was before.
- A rename dialog on the dashboard, on the project row and in the details panel.

Out, and deliberately so:

- **Having DALF pass a real name through the deep link.** That is the better fix
  for the default name and it is a different feature: it needs a change on the
  DALF side and a decision about what happens when the two names disagree. The
  `?outputVideo=` link stays id-only here.
- Renaming comparison videos. Their title lives on `comparison_videos` and has
  its own owner column; nothing here touches it.
- Showing the video title in the editor header. The header renders no title
  today, so putting one there is a visual change of its own.
- The team boundary. There is no team or org table; "team-visible" below means
  every row in `public.users`. Anonymous share-link visitors stay excluded.

## Who may rename, and who can see

Anyone who can see a video may rename it. For an ordinary private upload that is
the owner and nobody else, so nothing changes there. For a pipeline output it is
every signed-in account, because of the visibility change below.

The security delta, stated plainly: **after this change every signed-in account
can list, open, watch, annotate, comment on and rename every pipeline output in
the database.** `migrations/20260820_unique_aws_video_id.sql` reasons at length
about the confidentiality of these videos, and its conclusion - that an
`outputVideoId` is a weak secret and a confidentiality break is worse than an
availability break - was written when a pipeline output belonged to one account.
That is no longer the posture. The new posture is that a pipeline output is
shared working material for everyone with an account, and knowing the id no
longer gains an outsider anything the ordinary library does not already give an
insider. The unique index stays: it still stops two rows racing for one id.

## Row-level security

Every policy below is **added**, never edited. Permissive policies are OR'd, so
adding one cannot narrow anything that works today, and rewriting the six live
policies to thread one new clause through them would put six working expressions
at risk to express one idea.

The predicate is `"videoId" LIKE 'aws:%'`, the same one
`videos_aws_video_id_unique` uses. It is stringly typed and that is deliberate:
`aws:` is already how this codebase says "pipeline output", in the index, in
`VideoService.isAwsVideo`, and in the storage proxy's PostgREST query. A marker
column would be a second source of truth that has to be kept in step with the
first.

Every new policy is `TO authenticated`. The five existing `videos` policies are
role `public`, which is why flipping `isPublic = true` on these rows was never an
option: it would hand pipeline outputs to `anon` as well.

```sql
CREATE POLICY "Signed-in users can view pipeline outputs" ON public.videos
    FOR SELECT TO authenticated
    USING ("videoId" LIKE 'aws:%');
```

That one policy is not enough on its own. Four more tables gate on the video's
owner *inside their own expressions*, so a reader who can now see the video would
still find it empty and read-only:

```sql
CREATE POLICY "Signed-in users can view annotations on pipeline outputs"
    ON public.annotations
    FOR SELECT TO authenticated
    USING (
        annotations."videoId" IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.videos v
            WHERE v.id = annotations."videoId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

CREATE POLICY "Signed-in users can annotate pipeline outputs"
    ON public.annotations
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = annotations."userId"
        AND annotations."videoId" IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.videos v
            WHERE v.id = annotations."videoId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

CREATE POLICY "Signed-in users can read comments on pipeline outputs"
    ON public.annotation_comments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.annotations a
            JOIN public.videos v ON v.id = a."videoId"
            WHERE a.id = annotation_comments."annotationId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

CREATE POLICY "Signed-in users can comment on pipeline outputs"
    ON public.annotation_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND annotation_comments."userId" = auth.uid()
        AND annotation_comments."isAnonymous" = false
        AND EXISTS (
            SELECT 1 FROM public.annotations a
            JOIN public.videos v ON v.id = a."videoId"
            WHERE a.id = annotation_comments."annotationId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

CREATE POLICY "Signed-in users can view activity on pipeline outputs"
    ON public.activity_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.videos v
            WHERE v.id = activity_events."videoId"
              AND v."videoId" LIKE 'aws:%'
        )
    );
```

The `activity_events` one is needed for a reason worth spelling out, because it
looks redundant: that table's existing policy already joins `videos`, so it is
tempting to assume the new `videos` policy makes it start matching. It does not.
The existing expression is `v."isPublic" = true OR v."ownerId" = auth.uid()` -
it re-states the ownership test itself rather than deferring to whether the row
is visible, so widening `videos` leaves it exactly as strict as it was.

No client change is needed to list these. The dashboard's All/Mine toggle already
calls `ProjectService.getAllProjects({ scope: 'all' })`, which reaches
`VideoService.getAllVideos()` - a bare `select('*')` with no owner filter that
leans entirely on RLS (src/services/videoService.ts:240). Team-visible rows
appear in the All scope the moment the policy exists.

Update and delete are untouched. Only the owner may delete a pipeline output or
change any column other than `title`, and `title` moves through the function
below rather than through a policy.

## The write path

```sql
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

    -- SECURITY DEFINER bypasses RLS, so this predicate is the only gate on the
    -- write. It mirrors the SELECT policies on public.videos as they stand after
    -- this migration: own, public, pipeline output, member of a public
    -- comparison. If those policies change, this function changes in the same
    -- migration.
    UPDATE public.videos v
       SET title = v_title
     WHERE v.id = p_video_id
       AND (
             v."ownerId" = v_caller
          OR v."isPublic" = true
          OR v."videoId" LIKE 'aws:%'
          OR v.id IN (
                 SELECT c."videoAId" FROM public.comparison_videos c WHERE c."isPublic"
                 UNION
                 SELECT c."videoBId" FROM public.comparison_videos c WHERE c."isPublic"
             )
       )
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video % is not visible to the caller', p_video_id
            USING ERRCODE = '42501';
    END IF;

    RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rename_video(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rename_video(uuid, text) TO authenticated;
```

This is `set_video_qa_status` (migrations/20260821_video_qa_status.sql:42) with a
different column, down to the `IF NOT FOUND` guard, and for the same reasons that
migration records: RLS is row level, so a permissive UPDATE policy would hand out
`url`, `isPublic` and `ownerId` along with `title`, and column GRANTs cannot
separate owner from non-owner because both are the `authenticated` role. There is
a third reason specific to this table: revoking table-level UPDATE so that column
GRANTs bite would break the presigned-URL refresh, which writes `url` on every
open.

`updatedAt` is not set here. `update_videos_updated_at`, a BEFORE UPDATE trigger,
already maintains it.

`IF NOT FOUND` is what makes a denied rename an error. A policy-gated UPDATE that
matches no row returns 2xx with zero rows, which a client cannot distinguish from
success - the failure mode this function shape exists to avoid.

Client side, `VideoService.renameVideo(videoId, title)` calls the RPC and throws
on error, exactly as `setQaStatus` does (src/services/videoService.ts:841).

### Keeping `set_video_qa_status()` in lockstep

That function's own comment states an invariant: it mirrors the SELECT policies
on `videos`, and *"if those policies change, this function changes in the same
migration."* The visibility section changes those policies, so the same migration
adds `OR v."videoId" LIKE 'aws:%'` to its predicate. Without that, a non-owner
could rename a pipeline output but not set its QA status, which is incoherent.

## History

`entityType` gains a third value:

```sql
ALTER TABLE public.activity_events
    DROP CONSTRAINT IF EXISTS "activity_events_entityType_check";
ALTER TABLE public.activity_events
    ADD CONSTRAINT "activity_events_entityType_check"
    CHECK ("entityType" IN ('annotation', 'comment', 'video'));
```

The event is written by a trigger, not by the app, for the same reason the other
two are: the log is written in the transaction that does the thing, so it cannot
disagree with it, and a rename through any future path is logged without that
path having to remember to log it.

```sql
CREATE OR REPLACE FUNCTION public.log_video_rename_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor uuid := auth.uid();
BEGIN
    -- Same degrade-to-NULL as log_annotation_activity(): "actorId" references
    -- public.users, and this table must never fail a write it is only observing.
    IF v_actor IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN
        v_actor := NULL;
    END IF;

    INSERT INTO public.activity_events (
        "videoId", "actorId", "entityType", "entityId", action, summary
    ) VALUES (
        NEW.id, v_actor, 'video', NEW.id, 'updated',
        jsonb_build_object('from', OLD.title, 'to', NEW.title)
    );

    RETURN NULL;
END;
$$;

CREATE TRIGGER log_video_rename_activity
    AFTER UPDATE ON public.videos
    FOR EACH ROW
    WHEN (NEW.title IS DISTINCT FROM OLD.title)
    EXECUTE FUNCTION public.log_video_rename_activity();
```

**The `WHEN` clause is the load-bearing part of this trigger.** Both
`findOrCreateOutputVideo` and `refreshAwsVideoUrl` write `url` on every single
open of a pipeline output, and `ensureAwsThumbnail` writes `thumbnailUrl` on
some. Anything looser than a title comparison turns every DALF click into a
history entry. A `WHEN` clause is stricter than an `IF` in the body because the
trigger does not fire at all, and it cannot be defeated by a later edit to the
function.

`entityId` is the video's own id. The other two entity types point at something
that can outlive its parent, which is why `entityId` carries no foreign key; a
video event points at the video itself, so the `ON DELETE CASCADE` on `"videoId"`
takes the row with it. No cascade guard is needed: the trigger is UPDATE-only,
and a deleted video cannot be updated.

`log_annotation_activity` needs a fallback actor for service-role inserts.
This one does not: `rename_video` refuses a null `auth.uid()`, so an unattributed
rename cannot reach the trigger from the app, and an unattributed rename that
arrives some other way is genuinely unattributed and should say so.

### Rendering it

- `src/types/database.ts`: `'video'` joins the `entityType` union, and the
  summary type gains optional `from` and `to`.
- `src/utils/activityPhrasing.ts`: `VERBS` gains `'video:updated': 'renamed'`.
  `activitySubject` gains a video branch returning `summary.from`, falling back
  to `'this video'`. `activityExcerpt` gains a video branch returning
  `Now "<to>"`.

The sentence reads "Coen renamed Pipeline Output - 1b30b3cc" with
`Now "Serve trial 3"` under it: the old name in the sentence, the new one below,
so the feed reads chronologically rather than asking the reader to work backwards
from the current name.

`annotationIdFor` returns null for a video event, so `live` is false and there is
nothing to seek to. `ActivityTimeline` must render that as a deliberate,
non-interactive entry - not as a row that looks like a disabled annotation - and
`@select-annotation` must not fire from it.

## The presigned-URL write this breaks

Visibility has a consequence inside `findOrCreateOutputVideo` that must be fixed
in the same change.

Today a second user's `findVideoByOutputVideoId` returns nothing, so they take
the insert path and land on the `23505` branch. After this change it **succeeds**:
they find the first user's row, skip the insert entirely, and fall through to

```ts
.update({ url: presignedUrl }).eq('id', record.id).select().single()
```

`videos` UPDATE is still owner-gated, so that matches zero rows and `.single()`
raises `PGRST116`. The second user's open fails, in a new way.

The fix is to skip the write when the caller does not own the row, and return the
record with the fresh presigned URL attached in memory:

```ts
if (record.ownerId !== ownerId) {
  return { ...record, url: presignedUrl };
}
```

Nothing downstream needs the URL persisted. `loadVideo` reads
`getVideoUrl(video)` off the object it is handed (src/views/EditorView.vue:1349),
and every dashboard open of an `aws:` video calls `refreshAwsVideoUrl` first
(src/views/EditorView.vue:1397-1401), so the stored `url` is a cache that is refetched
before use, not the source of truth.

`refreshAwsVideoUrl` gets the same treatment. Its write is already a silent no-op
for a non-owner - it does not `.select()`, so zero rows returns 2xx - but firing
a write that can never land on every open of someone else's video is noise, and
the skip documents why it can be skipped.

One path becomes unreachable as a result: the `!winner` case inside the `23505`
branch, which raises *"already claimed by another account"*. With `aws:` rows
visible to every signed-in caller, a lost insert race can always read the winner
back. The branch stays as a defensive guard and the comment says it is now
unreachable for `aws:` ids rather than pretending it is live.

## The dialog

The rename is a modal, not an inline edit. On a shared library a rename is
visible to everybody and lands in the history under your name, so it should take
a deliberate action rather than a stray double-click on a list row.

One dialog, not two. `RenameVideoDialog.vue` follows `NewFolderDialog.vue`
exactly - `Teleport to="body"`, overlay, header, one labelled input, a footer
with Cancel and the action - with the input prefilled with the current name and
selected, plus a line naming the consequence:

> Everyone sees this name. The change is recorded in this video's history.

Opening the dialog and pressing **Rename** is the confirmation. Stacking a second
"are you sure" modal on top of an explicit rename button would be ceremony
without safety: the user has already typed the new name and pressed a button
labelled with the verb.

- **Rename is disabled** when the field is empty or unchanged, so Enter on an
  untouched dialog does nothing.
- **Escape and the overlay cancel**, matching `NewFolderDialog`.
- **The server's title wins.** `rename_video` returns the row; the list takes
  `title` from the response rather than trusting an optimistic value, so a
  trimmed name shows as it was actually stored.
- **On failure** the old name stays and `notifyError` reports it, matching
  `onRenameFolder` (src/views/DashboardView.vue:407).

Two entry points, both places the title already appears: the project row
(`ProjectListItem.vue:50`) and the details panel heading
(`VideoDetailsPanel.vue:9`). Single projects only.

## Decomposition

1. **Migration** - the six policies, the `set_video_qa_status` predicate, the
   `entityType` constraint, `rename_video`, `log_video_rename_activity` and its
   trigger. One file, because a policy change and the function that mirrors it
   must not be separable.
2. **Service** - `VideoService.renameVideo`, the non-owner skips in
   `findOrCreateOutputVideo` and `refreshAwsVideoUrl`.
3. **History rendering** - types, phrasing, `ActivityTimeline`'s non-seekable
   entry.
4. **Dialog** - `RenameVideoDialog.vue` and the two entry points.

Steps 2 to 4 are independent of each other once step 1 exists.

## Testing

Unit, with Vitest, following the files already in place:

- `activityPhrasing`: the verb, the subject falling back to `'this video'` when
  `from` is null, and the `Now "<to>"` excerpt.
- `activityService`: a `'video'` row maps to an entry with `live: false` and a
  resolved actor.
- `videoService`: `renameVideo` throws on an RPC error;
  `findOrCreateOutputVideo` does not write `url` when the record is owned by
  someone else, and does when it is the caller's.
- A dashboard test in the shape of `dashboardQaStatusSync.test.ts`: a successful
  rename updates the row from the server's response, a failed one leaves the old
  title and notifies.

Against the live database, by probe rather than automation, since RLS is not
covered by any test in this repo:

- A non-owner renames a pipeline output: succeeds.
- A non-owner renames someone else's private non-`aws:` video: raises 42501.
- An anonymous caller selects an `aws:` video: no rows.
- Opening a pipeline output twice, as two different users, writes no history row
  - the url refresh must stay silent.
- A rename writes exactly one row, with the right actor, `from` and `to`.

## Applying the migration

Written to `migrations/20260903_rename_video.sql` and **not applied**. Deploys
here are manual and production lags the branch. Applying it is a separate,
explicit step, run with:

```
supabase db query --linked -f migrations/20260903_rename_video.sql
```

Nothing is pushed and nothing is deployed to Netlify.

## Known limits

- **Labels stay owner-gated.** `labels` SELECT is still restricted to the owner,
  so another user's custom label renders as a generic chip on a shared pipeline
  output. Pre-existing, and this change makes it more visible because more people
  will look at the same video. Not fixed here.
- **The default name is still minted from the id.** Until DALF passes a name
  through the deep link, every pipeline output starts as
  `Pipeline Output - <8 chars>` and someone has to rename it by hand.
- **No rename history for comparison videos.** `activity_events` can carry a
  `comparisonVideoId`, but nothing writes a video event for one.
- **No undo.** The history records what the name was, so a rename is reversible
  by hand, but there is no button for it.
- **Visibility is all or nothing.** Every signed-in account sees every pipeline
  output. There is no team boundary to scope it to and this change does not
  invent one.

## Rollback

```sql
DROP TRIGGER IF EXISTS log_video_rename_activity ON public.videos;
DROP FUNCTION IF EXISTS public.log_video_rename_activity();
DROP FUNCTION IF EXISTS public.rename_video(uuid, text);

DROP POLICY IF EXISTS "Signed-in users can view pipeline outputs" ON public.videos;
DROP POLICY IF EXISTS "Signed-in users can view annotations on pipeline outputs" ON public.annotations;
DROP POLICY IF EXISTS "Signed-in users can annotate pipeline outputs" ON public.annotations;
DROP POLICY IF EXISTS "Signed-in users can read comments on pipeline outputs" ON public.annotation_comments;
DROP POLICY IF EXISTS "Signed-in users can comment on pipeline outputs" ON public.annotation_comments;
DROP POLICY IF EXISTS "Signed-in users can view activity on pipeline outputs" ON public.activity_events;
```

Two things do not come back on their own. The `entityType` constraint cannot be
narrowed again while `'video'` rows exist, so those rows have to be deleted first
if the constraint is being restored. And `set_video_qa_status` has to be restored
to its previous four-clause predicate by re-running its own migration, since the
rollback of a policy change has to roll back the function that mirrors it.
