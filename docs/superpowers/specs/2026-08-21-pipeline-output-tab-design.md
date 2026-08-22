# Video / pipeline output tabs in the editor

Date: 2026-08-21
Status: approved, not yet implemented

## Problem

A match reaches the app as an `outputVideoId` (the DALF-supplied id, arriving as
`?outputVideo=` or `sessionStorage.pendingOutputVideo`). Today that id resolves to
exactly one thing: the rendered video at
`pipeline-output/<id>/streams/generated.mp4`. The same pipeline run also produces
data output, and that output needs its own place in the labeling dashboard, with
its own annotations.

This round builds the container only. The pipeline tab is empty; fetching and
rendering pipeline data is a later change.

## Scope

In scope:

- A tab bar above the video player with two tabs: Video and Pipeline output.
- Annotations scoped per tab, so the two surfaces never show each other's work.
- An empty state on the pipeline tab.

Out of scope, deliberately:

- Fetching pipeline data. No change to `netlify/functions/aws-storage.cjs`.
- Rendering pipeline data in any form.
- Drawing annotations on the pipeline tab (see Limitations).

## Data model

Add one column to `annotations`:

```sql
ALTER TABLE annotations
  ADD COLUMN surface text NOT NULL DEFAULT 'video'
  CHECK (surface IN ('video', 'pipeline'));
```

The `NOT NULL DEFAULT 'video'` is the load-bearing part. Existing annotations
backfill to `'video'` and keep appearing in the Video tab. A nullable column, or
a default added after the fact, makes every existing annotation vanish from the
only tab that should show it.

### Why not a second videos row

Modelling the pipeline output as its own `videos` row (`videoId =
'aws-pipeline:<id>'`) would separate annotations for free, since annotations
already scope by `videoId`. Two things rule it out:

1. Rows created through `findOrCreateOutputVideo` are real dashboard projects.
   A sibling row shows up as a duplicate project in the project list, in
   recent-opens, in thumbnails and in share links.
2. Labels are scoped `(userId, projectId)` with null-project labels acting as
   global. A second row carries a different `projectId`, which splits the label
   vocabulary. The two tabs are meant to share one vocabulary.

One video row plus a discriminator keeps the project single and the labels
shared.

### What comes along unchanged

- Row-level security: same video row, same policy. A new column does not change
  row visibility.
- `canCreateAnnotations`: unchanged, it reads the video's permission state.
- The label catalog: `useLabelCatalog(userId, projectId)` is keyed on values
  neither tab changes.

## Layout

The tab bar sits inside the black video `<section>` of `EditorView`, directly
above the player, and nothing else moves. The timeline below and the annotation
rail on the right stay mounted in both tabs, so the pipeline tab still has a
playhead and an annotation panel.

```
+---------------------------------------------+
| EditorHeader                                |
+------------------------------+--------------+
| [ Video ] [ Pipeline output ]|              |
| +--------------------------+ |  Annotation  |
| |                          | |    Panel     |
| |     player / empty       | |              |
| |                          | |   (stays)    |
| +--------------------------+ |              |
+------------------------------+              |
| Timeline  (stays)            |              |
+------------------------------+--------------+
```

### Visibility gate

The tab bar renders for every single-mode, non-shared video:

```ts
Boolean(currentVideoObject) && playerMode === 'single' && !isSharedVideo
```

An earlier round gated this on `VideoService.isAwsVideo(currentVideoObject)`, so
the tab bar only appeared on AWS pipeline videos. That was dropped on 2026-08-22:
it hid the tabs on every hand-uploaded project, which is most of them, and on the
dev account it hid them on all of them. The pipeline tab now says it is empty,
which is the honest answer both for a plain upload and for a pipeline video whose
output has not landed yet.

Share views are still excluded. `loadAnnotations` returns early for a share link
and takes its annotations from `ShareService.getSharedVideoWithCommentPermissions`,
which calls `getVideoAnnotations` (`shareService.ts:88`) with no surface argument
and therefore returns both surfaces. Rather than thread surfaces through the
share path in a round that renders no pipeline content, a shared project shows no
tab bar and behaves exactly as it does today. See Limitations.

The gate decides only whether the tab bar renders. It does not scope the
annotation flow below: `useVideoAnnotations` defaults `surface` to `'video'` and
passes it unconditionally, so every single-video read filters on the column and
every single-video insert stamps it, AWS pipeline video or not. That is
deliberate, and it is why the migration has to be in place before this frontend
is. See Deploy ordering.

Dual mode is excluded on purpose: comparison annotations scope by
`comparisonVideoId` and bypass `videoId`, so `surface` does not apply cleanly
there, and a single pipeline output for a two-match comparison is incoherent.

### Tab state

A component-local `ref` in `EditorView`, defaulting to `'video'` and resetting to
`'video'` on mount. Not in the URL, not in the layout store. Nothing about the
pipeline tab is worth deep-linking to while it is empty.

## Annotation flow

An `activeSurface` ref threads through three sites:

1. **Fetch.** `AnnotationService.getVideoAnnotations(videoId, projectId, ...)`
   gains a `surface` argument and filters on it when one is given. Omitted means
   no filter, never a default of `'video'`: 17 of its 18 call sites, including
   every comparison and share path, ask about no surface at all and must keep
   seeing every row. The single-video path in `useVideoAnnotations` is the one
   caller that passes the argument, and it passes it on every project, not only
   AWS ones. Switching tabs reloads.
2. **Create.** The insert path stamps `surface` with the active tab, again on
   every single-video project rather than only AWS ones.
3. **Realtime.** `useRealtimeAnnotations` currently filters only on
   `videoId=eq.<id>` and pushes every insert into the shared `annotations` ref.
   It must drop inserts whose `surface` differs from the active one. Without
   this, another client's pipeline annotation appends into the Video tab's list.

One `annotations` ref feeds the annotation panel, the timeline markers
(`VideoTimeline :annotations`) and the quick pick, so all three follow a tab
switch with no further work.

## Deploy ordering

**The migration goes first. The frontend second. Never the reverse.**

Because the read filter and the insert stamp are unconditional, this frontend
against a database without the `surface` column breaks annotations everywhere,
not only on AWS pipeline videos:

- Reads answer `400` with PostgREST code `42703`, unknown column `surface`, so
  every project's annotation list comes back empty and the timeline loses every
  marker.
- Inserts answer `400` with `PGRST204`, column not found in the schema cache, so
  nobody can create an annotation on anything.

Deploys on this project are manual and production runs behind the branch, so the
two can drift apart by days. Apply the migration to the target database and
confirm the column is exposed over PostgREST before the build that contains this
change goes out. The reverse order is a full outage of the annotation feature,
for every user and every project, until the migration lands.

## Limitations of this round

**Share views get no tab bar.** The share path loads annotations through
`ShareService`, which does not filter by surface, so a shared pipeline project
would show both surfaces' annotations in both tabs. The gate excludes
`isSharedVideo` until the share path is surface-aware. A viewer following a share
link sees today's behaviour, unchanged.

**Drawing annotations are Video-tab only.** There is no video element on the
pipeline tab for the drawing canvas to mount on, and `openQuickPick` is bound to
`@contextmenu` on the player container, which the pipeline tab's empty state
replaces. Annotations on the pipeline tab are created from the timeline's
`@open-quick-pick` path and are text-only. Now that the tab bar is on every
single-video project, this applies to all of them rather than to AWS ones only.
When the pipeline surface gets real content, that is the point to revisit.

**Playback can run behind the empty pipeline tab.** Switching to the pipeline tab
pauses the player, but the timeline's own play control still owns playback on
both tabs, so pressing play while on the pipeline tab plays audio with no
picture. That was a deliberate call - the timeline is shared - and it used to be
reachable only on AWS pipeline videos. On every single-video project it is worth
revisiting when the pipeline surface gets real content.

## Testing

Unit:

- `surface` is stamped on create for each tab.
- `getVideoAnnotations` returns only the requested surface.
- The realtime insert handler drops an annotation whose surface differs from the
  active one, and accepts one that matches.

Migration:

- Count annotations before and after. The counts match and no row has a null
  `surface`.

Manual, on a single-video project:

- Add an annotation on the Video tab, switch to Pipeline output, confirm the
  panel and the timeline markers are both empty.
- Add one on Pipeline output, switch back, confirm the Video tab shows only its
  own.
- Confirm a plain uploaded video shows the tab bar too, and that its existing
  annotations survive a round trip through the pipeline tab and back.
- Confirm dual mode and share views show no tab bar.

## Assumptions

- Tab labels are "Video" and "Pipeline output".
- The migration is applied manually with `supabase db query --linked -f`, as the
  recent-opens migration was. This CLI has no `db execute`.

## Open question, not blocking

The codebase has no notion of DALF or a game id. What exists is `outputVideoId`.
This design assumes the DALF game id is the `outputVideoId` verbatim. If DALF
resolves a game id into an `outputVideoId` through a lookup, that changes the
fetch design in the next round, not this one.
