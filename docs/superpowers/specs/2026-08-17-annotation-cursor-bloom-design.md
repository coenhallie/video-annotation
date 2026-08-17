# Annotation cursor bloom - design

Date: 2026-08-17
Status: approved, ready for implementation planning

## Problem

Adding an annotation today means moving to the sidebar, opening the annotation
form, opening the label dropdown, and searching for the label. For data
annotators labelling many events per video, that round trip dominates the work.

## Goal

A radial "cursor bloom" opened at the mouse position over the video, showing
label categories first and then the labels inside the chosen category. Clicking
a label creates the annotation immediately at the frame that was showing when
the bloom opened.

The existing sidebar flow stays intact and remains the full-featured path
(text, drawing, editing).

## Non-goals

- Drawings from the bloom. The sidebar keeps that.
- Comments/text from the bloom. Deferred.
- Custom (non-prefixed) labels in the bloom. Deferred.
- Editing or deleting annotations from the bloom.
- A `category` column on the labels table.

## Decisions

### Categories are derived from the label name prefix

Labels are named with a category prefix - `EVT`, `PITCH`, `TEAM`, `NPL`, `PLR`,
`BALL` - established in `src/types/labels.ts` (`DEFAULT_LABELS`) and normalised
by `migrations/20260817_rename_ply_player_labels.sql`.

No schema change and no new migration. Deploys and migrations here are applied
manually, so adding another unapplied migration on top of existing ones is a
liability, and the prefix already carries the information.

Labels whose first token is not one of the six known prefixes are **excluded
from the bloom**. They remain fully usable from the sidebar. This covers custom
labels (explicitly out of scope) and, on a database where the `PLY` -> `PLR`
rename has not been applied, the old `PLY` labels. Excluding rather than
bucketing keeps the bloom to a fixed, learnable set of six categories.

### Selecting a label creates the annotation immediately

No intermediate form, no confirmation. One right-click plus two clicks produces
a saved annotation.

### A comment is no longer required to save an annotation

`AnnotationForm`'s save gate currently requires a label **and** (text or
drawing). The text requirement is dropped, in the sidebar as well as the bloom,
so both paths agree on what a valid annotation is. A label remains required.

### The frame is captured when the bloom opens

The video keeps playing while the bloom is open. Reading the current frame at
click time would place every annotation one to several seconds late. The frame
(and, in dual mode, the per-video frames) is snapshotted at open and used at
commit.

## Components

### `src/utils/labelCategories.ts` (new, pure)

```
CATEGORY_ORDER: readonly category keys, fixed display order
categoryKeyForLabel(label): 'EVT' | ... | 'BALL' | null
groupLabelsByCategory(labels): Array<{ key, name, labels }>
labelShortName(label): name with the category prefix stripped
```

- `categoryKeyForLabel` returns `null` for unrecognised prefixes.
- `groupLabelsByCategory` drops unrecognised labels, drops categories that end
  up empty, and returns categories in `CATEGORY_ORDER`.
- Labels within a category keep the order they arrive in.

Unit tested: known prefixes map correctly, unknown prefixes are dropped, empty
categories are omitted, ordering is stable, prefix stripping is correct.

### `src/composables/useLabelCatalog.ts` (new)

`AnnotationPanel` loads labels itself today (`AnnotationPanel.vue:201`). The
bloom needs the same list. Rather than a second fetch and a second source of
truth, that load moves into a composable whose state is shared per
`userId::projectId` key.

Exposes `labels`, `labelsById`, `loading`, `reload()`.

`AnnotationPanel` is refactored onto it with no behavioural change: it still
loads on mount, still reloads after `LabelManagement` mutates labels, and a
label created there appears in the bloom without a reload.

### `src/components/AnnotationBloom.vue` (new)

Props: `open: boolean`, `x: number`, `y: number`, `labels: Label[]`.
Emits: `select(label: Label)`, `close()`.

Behaviour:

- Full-viewport fixed overlay; the ring is positioned at `(x, y)` and clamped so
  it never renders partly off-screen near a viewport edge.
- **Stage 1** - one segment per non-empty category, in `CATEGORY_ORDER`.
- **Stage 2** - one segment per label in the chosen category, each tinted with
  that label's own `color`.
- Stage 2 segment text uses `labelShortName`, so `BALL TRAJ IMPLAUSIBLE` reads
  as `TRAJ IMPLAUSIBLE`. The full name and the label description appear on
  hover.
- Centre hub: back to stage 1 from stage 2; cancel from stage 1.
- `Escape` cancels from either stage. Click outside the ring cancels.
- Rendered as SVG arcs. No new dependency.

The component is presentational: it does not know about annotations, frames, or
services. It receives labels and reports a selection.

### `src/utils/annotationPayload.ts` (new, extracted)

The mapping from a draft to the saved annotation - primary label to `color`,
primary label to `title`, `timestamp` from frame and fps, dual-mode
`videoAFrame`/`videoBFrame` - currently lives inside
`AnnotationForm.handleSubmit` (`AnnotationForm.vue`, around line 410-445).

It is extracted, behaviour-preserving, so the form and the bloom produce
identical payloads instead of duplicating the rules. `AnnotationForm` is changed
to call it; its observable behaviour is unchanged.

Unit tested for the label-only case, the text case, and the dual-mode case.

### `EditorView.vue` (modified)

- A `contextmenu` handler on the video stage container opens the bloom at the
  event coordinates and calls `preventDefault()` to suppress the browser menu.
- The handler snapshots `currentFrame`, `videoACurrentFrame`, `videoBCurrentFrame`
  and `fps` at that moment.
- The bloom is **not** opened when the annotation panel is read-only (shared
  video or comparison without comment permission) or while a drawing session is
  active on the fabric canvas, so it does not fight the drawing tool.
- On `select`, it builds the payload from the snapshot plus the chosen label and
  calls the existing `handleAddAnnotation`. No new service or persistence path.

## Data flow

```
right-click on video stage
  -> EditorView snapshots frame/fps, opens AnnotationBloom at cursor
  -> bloom stage 1: categories from groupLabelsByCategory(labels)
  -> user picks a category
  -> bloom stage 2: that category's labels
  -> user picks a label
  -> EditorView builds payload (snapshot frame + label) via annotationPayload
  -> handleAddAnnotation -> useVideoAnnotations.addAnnotation -> AnnotationService
  -> annotation appears in the sidebar and on the timeline
```

## Error handling

- No labels in a category, or no recognised labels at all: the bloom does not
  open and nothing happens on right-click. It never renders an empty ring.
- Annotation creation failure surfaces through the existing error path used by
  the sidebar. The bloom closes on selection regardless; it does not hold state
  waiting on the save.
- Read-only or unauthenticated: right-click falls through to the default browser
  behaviour, exactly as today.

## Testing

Unit:

- `labelCategories`: mapping, exclusion of unknown prefixes, ordering, prefix
  stripping.
- `annotationPayload`: label-only, with-text, and dual-mode payloads.
- Existing suites (`labelSet.test.ts`, `commentPermissions.test.ts`) stay green.

Runtime, in the real app:

- Open a video, **start playback**, right-click mid-playback, pick a category
  and a label. The annotation must appear in the sidebar with the right label
  name and colour, at the frame that was showing when the bloom opened, not the
  frame at click time.
- Right-click near each viewport edge over the video: the ring stays fully
  visible.
- Escape and click-outside both cancel without creating anything.
- The sidebar flow still creates annotations, and now saves with a label and no
  text.
- Right-click while drawing mode is active does not open the bloom.
