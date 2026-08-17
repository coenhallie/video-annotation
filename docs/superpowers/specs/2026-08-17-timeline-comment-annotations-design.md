# Timeline comment annotations

Date: 2026-08-17

## Problem

Annotating from the timeline is already fast: left-click the timeline, press a
category letter, press a label letter, done. Adding a free-text note to a frame
is not. It still requires the sidebar form, which breaks the flow and pulls
attention away from the surface we want to make primary.

The goal is to make a text comment on a frame as cheap as a label, without
making the timeline flow itself more complicated. Picking a specific label such
as `WRONG POS` stays a sidebar job when it needs to be combined with text; the
timeline path stays two or three keystrokes.

## What a comment is

A comment is an ordinary annotation with **no labels attached**. Its text is the
annotation's content, it gets its own marker on the timeline, and a real label
can be attached to it later from the sidebar.

It is explicitly *not* a new row in the labels catalog. Free text in the catalog
would pollute the quick pick's category columns and the label filter.

This means **no database work and no service work**. `buildAnnotationPayload`
(`src/utils/annotationPayload.ts`) already handles an empty `labelIds`:

- `title` falls back to `content.slice(0, 50)`
- `color` falls back to `DEFAULT_ANNOTATION_COLOR` (gray-500)
- `annotationType` stays `'text'`

## Approach

Add a mode to the existing `AnnotationQuickPick`, rather than building a second
popover.

Rejected alternatives:

- **A separate comment popover.** Duplicates the anchoring, viewport clamping,
  focus handling and frame snapshotting that `AnnotationQuickPick` already gets
  right.
- **Inline edit on a freshly created marker.** Create a blank annotation, then
  type into it. Leaves junk rows behind whenever the user bails, and costs a
  second save round-trip.

## Component: AnnotationQuickPick

### Mode

A `mode` ref of type `'pick' | 'comment'`, defaulting to `'pick'`.

### The comment affordance

The root screen (no category selected) gains a `C  Comment` row pinned below the
category list, separated by a divider, drawn in the same keycap style as the
category rows. It is clickable as well as typable, so the shortcut is
discoverable rather than folklore.

`C` is accepted **only at the root**. The category letters are `E`, `P`, `T`,
`N`, `L`, `B`, so `C` is free there. Inside a category, `assignLabelShortcuts`
may have handed `C` to a label, so the key keeps its label meaning once a
category is active.

### Comment screen

In comment mode the two columns are replaced by a single-line text input. The
header (`F00412 · 0:13`) stays visible, so the frame being pinned is always in
sight. The footer reads `Enter to save · Esc to go back`.

- **Enter** commits, via the input's own `@keydown.enter` binding.
- **Escape** returns to the category screen and discards the text. A second
  Escape closes the panel, matching the existing `back()` semantics.
- Empty or whitespace-only text does not commit.

### The keyboard guard

`handleKeydown` is registered on `window` in **capture phase**
(`AnnotationQuickPick.vue:148`) and calls `preventDefault()` on every single
A-Z character. Adding a text input without changing this handler means the
input receives no keystrokes at all.

`handleKeydown` gets an explicit early return at the top:

```
if (mode === 'comment') {
  // Escape only; everything else must reach the input.
  ...
  return
}
```

placed before the letter logic. The panel's own `@keydown` binding calls the
same function, so one guard covers both delivery paths.

### Measurement and reset

- `mode` needs a `watch` that calls `measure()` after `nextTick`. The panel is
  anchored **upward** from `props.y`, so a height change without re-measuring
  mispositions it.
- Entering comment mode focuses the input after `nextTick`.
- Both reset paths, `watch(() => props.open)` and `watch(() => [props.x,
  props.y])`, currently clear `activeCategory` only. They must also clear `mode`
  and the comment text. Extract a single `resetToRoot()` and call it from both,
  or a half-typed comment reappears on the next open.

### Emit

Two new emits:

- `(e: 'comment', text: string)` - commit. Not a widened `select` union: the two
  paths carry different payloads and have different guards.
- `(e: 'comment-mode', active: boolean)` - fired `true` on entering comment mode
  and `false` on leaving it by any route (Escape, commit, or the panel closing),
  so the playback restore below can never be stranded.

## Opening the panel with no categories

Today both open handlers in `EditorView.vue` bail on `quickPickHasCategories`,
and the panel's root `v-if` requires `categories.length > 0`.

A comment needs no labels at all, so as written a user whose catalog carries no
recognised category prefix could never comment from the timeline. That gate is
removed:

- `quickPickHasCategories` is dropped from `openQuickPick` and
  `openQuickPickAtTime`. The permission checks stay: `canAnnotate`, signed in,
  not in drawing mode, not on `.video-controls`.
- The panel's root `v-if` reduces to `open`.
- The categories column renders an empty state when there are no categories.

The comment row means the panel always has something to show, so right-click no
longer risks suppressing the native context menu for an empty panel.

## EditorView

`handleQuickPickComment(text: string)` mirrors `handleQuickPickSelect`:

1. Copy `quickPickSnapshot.value` into a local **before** calling
   `closeQuickPick()`, which nulls it.
2. `trim()` the text; return early if empty, so no gray `Untitled` row is ever
   created.
3. `handleAddAnnotation(buildAnnotationPayload({ labels: quickPickLabels,
   labelIds: [], content: trimmed, frame, fps, dual }))`.
4. Same `notifyError` handling on failure.

### Playback

On `comment-mode(true)`, `EditorView` records the current `isPlaying` and calls
`unifiedVideoPlayerRef.value?.pause()`. On `comment-mode(false)` it calls
`play()` again only if it had been playing, then clears the recorded state. The
frame is already snapshotted at open time, so this is purely about what the user
sees while typing.

### Dual mode

The timeline entry point exists only in single mode (`VideoTimeline` emits
`open-quick-pick`; `DualTimeline` does not). In dual mode the panel opens via
right-click on the player, which does capture per-video frames. A
timeline-created comment carries `dual: null`, exactly as a timeline-created
label does today. No change either way.

## Timeline marker

A comment is identified by `!annotation.labels?.length`. Loaded annotations
carry a `labels` array of label ids from `annotationService`, and a comment
never has one written (`useVideoAnnotations` only sets `labels` on the created
object when the array is non-empty).

In `VideoTimeline.vue`, a comment marker renders as a hollow ring - gray border,
transparent fill - instead of the filled severity dot. Same size, same hit area,
same selected-state treatment. Label markers are untouched, so the existing
severity legend below the timeline stays accurate.

### Reported, not in scope

`VideoTimeline.vue:355` colours every marker by `getSeverityColor(annotation.severity)`,
but the quick pick never sets `severity`, so every quick-pick annotation renders
amber regardless of its label's colour. Colouring markers by label colour and
replacing the severity legend is a larger visual change affecting every existing
marker; it is deliberately out of scope here and left as a separate decision.

## Testing

- `annotationPayload` unit tests gain a case for empty `labelIds`: content-derived
  title, default colour, `labels: []`.
- Component tests for `AnnotationQuickPick`: `C` enters comment mode at the root
  but not inside a category; keystrokes reach the input in comment mode; Escape
  returns to the category screen and discards text; Enter emits `comment` with
  the trimmed text; whitespace-only does not emit; reopening at a new position
  resets mode and text.
- End-to-end in the real app: seek, click the timeline, press `c`, type, press
  Enter. Confirm the marker lands on the snapshotted frame, the annotation
  appears in the sidebar with its text and no label, the marker is visually
  distinct, and playback resumes if it was playing.
