# Per-video history timeline

Date: 2026-08-25
Status: approved, not yet implemented

## Problem

Nothing in the product says who did what to a video. Annotations carry a
`userId`, but no surface renders it, so a reviewer looking at 19 annotations on
a match cannot tell whether one person made them all or four people split the
work. Deleted annotations leave no trace at all: `annotations` has no soft
delete, so a removed annotation and an annotation that never existed are
indistinguishable.

That gap is what breaks the manager story. `VideoDetailsPanel` already shows a
QA status with an attribution line, but the name it prints is the video's owner,
not whoever set the status, because there is no name lookup keyed on
`qaStatusUpdatedBy`. The panel admits this in a comment. A manager checking "has
this been reviewed" is shown a plausible wrong name.

## Scope

In scope:

- An append-only event log, written by the database, covering annotations
  created / edited / deleted and comments created / deleted.
- A `History` tab in the editor sidebar rendering those events as a vertical
  timeline, attributed by name and time.
- Backfill of `created` events from existing rows so the tab is populated on
  day one.

Out of scope, deliberately:

- Label attach / detach events. Labels change constantly during review and
  would drown the annotations underneath them. A third trigger is cheap to add
  later if the feed proves too quiet, which is the easier direction to correct.
- QA status change events. Fixing the QA attribution line properly is a
  separate change to `QaStatusSelect` and its name lookup, and folding it in
  here would couple two features that ship independently.
- Diffs. An edit event says the content changed, not what it changed from.
  Storing before / after doubles the table for a workflow that has not asked
  for it.
- Any history surface on the dashboard. The editor sidebar is where the work
  happens.
- Realtime. The tab refetches when it gains focus.

## Why the database writes the log

Three sources were considered.

**Derived from existing rows.** Rejected on accuracy, not on completeness.
`annotations."userId"` is the creator and `updatedAt` is a single timestamp, so
an annotation Alice created and Bob edited yields exactly one derivable event
and it names Alice. That is a wrong attribution in an attribution feature, and
it is wrong silently. Deletions being invisible is the second, better-known
problem.

**Written by the service layer** next to each mutation in
`AnnotationService` / `CommentService`. Rejected because the log is then only as
honest as its callers. Every future write path has to remember, deletes issued
from the SQL console or a maintenance script are invisible, and a client that
skips the second write leaves no evidence that it did.

**Written by row triggers.** Chosen. The log cannot disagree with the tables it
describes, because the same transaction writes both. `auth.uid()` resolves
inside a trigger (PostgREST sets `request.jwt.claims` for the request, and the
trigger runs in that transaction), so the database attributes the write itself
with no client cooperation. Verified against production on 2026-08-25 with a
temp-table probe: a trigger reading `auth.uid()` returned the caller's id.

## The cascade problem

`annotation_comments."annotationId"`, `annotation_labels."annotationId"`,
`annotations."videoId"` and `annotations."userId"` are all `ON DELETE CASCADE`
(verified: `pg_constraint.confdeltype = 'c'`). So deleting one annotation also
deletes its comments, and a naive row trigger logs each of those as a delete
performed by whoever deleted the annotation. The feed would read "Coen deleted
Alice's comment" when Coen deleted his own annotation. In a feature whose only
job is attribution, that is the worst available failure.

`pg_trigger_depth()` does not detect this. Probed against production: a
cascade-deleted child fires its trigger with `pg_trigger_depth() = 1`, exactly
as a direct delete does.

The rule that does work, also probed: **in the delete trigger, look up the
parent row; if it is already gone, the delete was a cascade, so log nothing.**

| Case | Parent visible in trigger | Logged |
| --- | --- | --- |
| `delete from annotation_comments where id = X` | yes | yes |
| `delete from annotations where id = P` (cascades to X) | no | no, for X |
| `delete from annotations where id = P` | yes (video) | yes, for P |
| `delete from videos where id = V` (cascades to P) | no | no |

This is not only a correctness guard, it is load-bearing for video deletion.
`activity_events."videoId"` references `videos`, so inserting an event for an
annotation whose video is being deleted in the same statement fails the foreign
key check and aborts the delete. Probed on 2026-08-25 with an unguarded trigger:
the cascade delete fails with `23503 insert or update ... violates foreign key
constraint`. The guard is what keeps `DELETE FROM videos` working.

The same rule applies to the second parent. `annotations."userId"` cascades
from `users`, so deleting a user deletes their annotations. Checking that the
author's `users` row still exists distinguishes that case too.

## Schema

```sql
create table if not exists public.activity_events (
  id                  uuid primary key default gen_random_uuid(),
  "videoId"           uuid references public.videos (id) on delete cascade,
  "comparisonVideoId" uuid references public.comparison_videos (id) on delete cascade,
  "actorId"           uuid references public.users (id) on delete set null,
  "actorName"         text,
  "entityType"        text not null check ("entityType" in ('annotation', 'comment')),
  "entityId"          uuid not null,
  action              text not null check (action in ('created', 'updated', 'deleted')),
  summary             jsonb not null default '{}'::jsonb,
  "createdAt"         timestamptz not null default now(),
  constraint activity_events_one_target check (
    ("videoId" is null) <> ("comparisonVideoId" is null)
  )
);

create index if not exists activity_events_video_idx
  on public.activity_events ("videoId", "createdAt" desc);
create index if not exists activity_events_comparison_idx
  on public.activity_events ("comparisonVideoId", "createdAt" desc);
```

Four decisions in that table are deliberate:

**`entityId` has no foreign key.** The whole point of the row is to outlive
what it describes. A foreign key would delete the delete event.

**`summary` snapshots the title and the video timestamp at event time.** A
deleted annotation has no title left to join to, so "Alice deleted 'Ball out of
frame' at 1:23" has to come from the log itself. For comments the snapshot is a
140-character excerpt plus the parent annotation's title.

**`actorId` is `on delete set null`, not cascade.** History about a departed
user is still history. `actorName` is the fallback the timeline prints when the
id no longer resolves.

**`actorName` is a fallback, never the primary source.** When `actorId` is
present the client resolves the current name through `fetchOwners`, so a rename
propagates through the whole feed. The column exists for the two cases where
there is no id to resolve: an anonymous share-link commenter, who has only
`userDisplayName`, and a deleted user.

The `one_target` check mirrors how annotations already work, where exactly one
of `videoId` / `comparisonVideoId` is set.

## Triggers

Both functions are `security definer` with `set search_path = public, pg_temp`,
following the precedent set by `set_video_thumbnail` in
`migrations/20260820_set_video_thumbnail.sql`. `security definer` is what lets
them write to a table that has RLS enabled and no write policy at all, which is
the point: the log is unwritable by any client, including the one that caused
the event.

### `log_annotation_activity()` on `annotations`

`after insert or update or delete for each row`.

- **Insert.** Actor is `coalesce(auth.uid(), new."userId")`. The fallback
  matters only for backfill-adjacent paths; a normal insert has a uid, and the
  RLS policy already forces `auth.uid() = "userId"`.
- **Update.** Logged only when something a reader would notice changed:

  ```sql
  new.content    is distinct from old.content
  or new.title      is distinct from old.title
  or new.severity   is distinct from old.severity
  or new."timestamp" is distinct from old."timestamp"
  or new."drawingData" is distinct from old."drawingData"
  ```

  Without this filter every `updatedAt` touch becomes a feed entry.
  `drawingData` is `jsonb`, so `is distinct from` compares it semantically
  rather than by text, and a re-serialised but identical drawing is correctly
  silent.
- **Delete.** Returns early, logging nothing, when the parent video (or
  comparison video) no longer exists, or when the author's `users` row no
  longer exists. Otherwise logs with actor `auth.uid()`, which is the deleter
  and is not assumed to be the author.

### `log_comment_activity()` on `annotation_comments`

`after insert or delete for each row`. Comment edits are out of scope, so there
is no update branch.

The comment table has no `videoId`; the trigger reads `"videoId"`,
`"comparisonVideoId"` and `title` from the parent annotation in one lookup.

- **Insert.** Actor is `auth.uid()`, which is null for an anonymous share-link
  commenter. In that case `actorName` takes `new."userDisplayName"` so the
  entry still reads.
- **Delete.** Returns early when the parent annotation is gone, which is the
  cascade case. Otherwise logs.

## Row-level security

```sql
alter table public.activity_events enable row level security;

create policy "Users can view activity on visible videos"
  on public.activity_events
  for select to authenticated
  using (
    exists (
      select 1 from public.videos v
      where v.id = activity_events."videoId"
        and (v."isPublic" = true or v."ownerId" = auth.uid())
    )
    or exists (
      select 1 from public.comparison_videos cv
      where cv.id = activity_events."comparisonVideoId"
        and (cv."isPublic" = true or cv."userId" = auth.uid())
    )
  );
```

Shape copied from the working policies in
`migrations/20260817_open_annotations_to_all_users.sql`: two `exists`
subqueries with inner joins rather than one subquery with left joins. RLS
applies to tables named inside a policy expression, so this is not a stylistic
choice.

`to authenticated`, not to `anon`. An anonymous visitor on a share link can
already read the annotations, but the history names the staff who reviewed the
video, and that does not belong to whoever holds the link. The History tab is
correspondingly hidden for shared and anonymous viewers, so the UI matches what
the policy would return rather than showing an empty tab.

No `insert`, `update` or `delete` policy is created. The table is append-only
because there is no policy under which anything else is possible.

## Backfill

Inserted in the same migration, before the triggers are created, guarded by
`not exists (select 1 from public.activity_events)` so re-running the file
cannot double it. One statement per table, taking `createdAt` and `userId` from
the existing row and building the same `summary` shape the triggers build.

Only `created` events. Past edits and deletes are unrecoverable, and inventing
them would put fiction in an audit log. A reader seeing a video whose history
starts at its first annotation is reading something true.

Current volume: 205 annotations, 16 comments, 171 videos, at most 19
annotations on any one video.

## Decomposition

| File | Responsibility |
| --- | --- |
| `migrations/20260825_activity_events.sql` | New. Table, indexes, RLS, the two trigger functions and their triggers, backfill, and a stated rollback. |
| `src/services/activityService.ts` | New. `getActivity(target, limit)`: one indexed query, one batched `fetchOwners` call, returns newest-first rows with resolved actor names. |
| `src/utils/activityPhrasing.ts` | New. Pure. Turns a row into its sentence and its verb. Holds the entity / action wording table. |
| `src/components/ActivityTimeline.vue` | New. The vertical timeline: day groups, entries, empty and loading states, seek-on-click. |
| `src/components/SidebarTabs.vue` | New. The two-tab bar for the editor sidebar. |
| `src/views/EditorView.vue` | The `<aside>` gains the tab bar and renders `AnnotationPanel` or `ActivityTimeline`. |

`AnnotationPanel.vue` is deliberately untouched. It is already a large file, it
is modified in the working tree on another branch, and the tab bar has no
reason to live inside the panel it switches away from.

Phrasing is a separate pure module from the component for the same reason
`qaStatus.ts` is separate from `QaStatusPill.vue`: the wording is the part worth
testing exhaustively, and it should not require mounting anything.

## The timeline

A vertical rule down the left with a dot per event. Entries grouped under day
headers. Each entry is one line: actor, verb, quoted excerpt, and the video
timestamp, with the wall-clock time right-aligned in mono.

Typography follows `VideoDetailsPanel`: 10px uppercase tracked labels for the
day headers, mono at 11px for times, 13px for the sentence. Nothing about this
panel should look like it came from a different product than the one three
inches to its left.

Clicking an entry whose annotation still exists seeks the video to
`summary.timestamp` and selects the annotation. Entries for deleted
annotations, and every comment entry whose parent is gone, are inert and
rendered dimmed. Inert entries are not buttons; they must not take focus or
show a pointer cursor, because a control that does nothing when clicked is
worse than plain text.

The feed loads lazily on first activation of the tab and refetches when the tab
regains focus. `limit` defaults to 100, which is far above the current
per-video ceiling of 19 annotations. There is no pagination and no "load more";
when a single video's history genuinely exceeds 100 events that becomes a real
question, and answering it now would be guessing.

No realtime subscription. `useRealtimeAnnotations` already opens two channels
per editor session, and a panel consulted occasionally does not justify a
third.

## Testing

Vitest:

- `activityPhrasing`: every entity / action pair, the anonymous-commenter
  fallback, the deleted-user fallback, excerpt truncation, and the inert
  classification.
- `activityService`: query shape for both single and comparison targets, owner
  resolution including an unresolvable id, ordering, and the empty case.
- `ActivityTimeline.vue`: renders entries, groups by day, empty state, loading
  state, seek emitted only for live entries, no button role on inert ones.
- `SidebarTabs.vue`: selection, re-click is a no-op, tab hidden for shared and
  anonymous viewers.

SQL, run against the linked database inside `begin ... rollback` using the same
`supabase db query --linked -f` harness the probes used:

- Insert attributes to the caller, not to the row's `userId`, when the two
  differ.
- Direct comment delete writes exactly one event.
- Deleting an annotation with comments writes exactly one event, for the
  annotation.
- Deleting a video writes nothing and does not error.
- An update touching only `updatedAt` writes nothing.
- An update to `content` writes one event.
- An anonymous comment insert stores `actorName` and a null `actorId`.
- A second user cannot insert, update or delete a row in `activity_events`.

## Known limits

- Anonymous commenters are attributed by a self-chosen display name that is not
  unique and not verified.
- A write made outside PostgREST, such as a service-role script or the SQL
  console, logs `actorId = null` and renders as "Unknown".
- Deleting a user cascades away their annotations. Those deletions are
  suppressed by the parent-row guard, so the feed loses the annotations without
  recording who removed them. The alternative, a burst of unattributed delete
  events, is worse, and user deletion is a Keycloak-side operation that has not
  yet happened in this system.
- Edit events state that content changed, not what it changed from.

## Rollback

```sql
drop trigger if exists log_annotation_activity on public.annotations;
drop trigger if exists log_comment_activity on public.annotation_comments;
drop function if exists public.log_annotation_activity();
drop function if exists public.log_comment_activity();
drop table if exists public.activity_events;
```

Nothing outside the new table and its two triggers is modified, so dropping
them restores the previous behaviour exactly.
