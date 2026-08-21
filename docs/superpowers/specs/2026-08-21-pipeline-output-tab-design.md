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

The tab bar renders only when `isAwsVideo && playerMode === 'single'`. Every
other video keeps today's layout with no tab bar at all.

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
   gains a `surface` argument and filters on it. Switching tabs reloads.
2. **Create.** The insert path stamps `surface` with the active tab.
3. **Realtime.** `useRealtimeAnnotations` currently filters only on
   `videoId=eq.<id>` and pushes every insert into the shared `annotations` ref.
   It must drop inserts whose `surface` differs from the active one. Without
   this, another client's pipeline annotation appends into the Video tab's list.

One `annotations` ref feeds the annotation panel, the timeline markers
(`VideoTimeline :annotations`) and the quick pick, so all three follow a tab
switch with no further work.

## Limitations of this round

**Drawing annotations are Video-tab only.** There is no video element on the
pipeline tab for the drawing canvas to mount on, and `openQuickPick` is bound to
`@contextmenu` on the player container, which the pipeline tab's empty state
replaces. Annotations on the pipeline tab are created from the timeline's
`@open-quick-pick` path and are text-only. When the pipeline surface gets real
content, that is the point to revisit.

## Testing

Unit:

- `surface` is stamped on create for each tab.
- `getVideoAnnotations` returns only the requested surface.
- The realtime insert handler drops an annotation whose surface differs from the
  active one, and accepts one that matches.

Migration:

- Count annotations before and after. The counts match and no row has a null
  `surface`.

Manual, on a real AWS pipeline video:

- Add an annotation on the Video tab, switch to Pipeline output, confirm the
  panel and the timeline markers are both empty.
- Add one on Pipeline output, switch back, confirm the Video tab shows only its
  own.
- Confirm a non-AWS video shows no tab bar and behaves exactly as before.
- Confirm dual mode shows no tab bar.

## Assumptions

- Tab labels are "Video" and "Pipeline output".
- The migration is applied manually with `supabase db query --linked -f`, as the
  recent-opens migration was. This CLI has no `db execute`.

## Open question, not blocking

The codebase has no notion of DALF or a game id. What exists is `outputVideoId`.
This design assumes the DALF game id is the `outputVideoId` verbatim. If DALF
resolves a game id into an `outputVideoId` through a lookup, that changes the
fetch design in the next round, not this one.
