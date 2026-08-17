# Timeline drawing annotations

Date: 2026-08-18

## Problem

Two of the three annotation kinds already live in the timeline flow: click the
timeline, press a category letter and a label letter for a label, or press `C`
and type for a comment. Drawing is the odd one out. It still requires opening
the sidebar form, toggling "Add Drawing", drawing, and pressing Save, which
breaks the flow and pulls attention away from the surface we want to be
primary.

The goal is to make a drawing on a frame as cheap as a label or a comment:
click the timeline, press `D`, draw on the video, press Enter.

## What a drawing is

A drawing is an ordinary annotation with **no labels attached** and a
`drawingData` payload. Its `annotationType` is `'drawing'`, which
`buildAnnotationPayload` already sets whenever `drawingData` is present.

Like a comment, it is not a new row in the labels catalog, and a real label can
be attached to it later from the sidebar. Unlike a comment, its body is empty:
the strokes are the content.

No database work and no service work. The annotations table already stores
`drawing_data` and the sidebar path already writes it.

## Approach

Add a third mode to the existing `AnnotationQuickPick`, alongside `pick` and
`comment`, and reuse `useDrawingCoordinator` for everything that touches the
canvas.

Rejected alternatives:

- **A separate drawing overlay.** Duplicates the anchoring, viewport clamping,
  frame snapshotting and playback pausing that `AnnotationQuickPick` and
  `EditorView` already get right for comments.
- **A bare global `D` on the player, with no panel.** A second entry point with
  its own frame snapshot, its own permission checks and its own way of being in
  drawing mode, for a saving of one click. Rejected in favour of one flow.
- **Requiring a caption with every drawing.** Keeps `isSaveableAnnotation`
  untouched, but refuses a self-explanatory circle and makes the fast path
  slower.

## Component: AnnotationQuickPick

### Mode

The `mode` ref widens to `'pick' | 'comment' | 'draw'`.

### The drawing affordance

The pinned block at the foot of the left column gains a second row below
`C  COMMENT`, in the same keycap style:

```
  C   COMMENT
  D   DRAWING
```

`D` is accepted **only at the root**, for the same reason `C` is: the category
letters are `E`, `P`, `T`, `N`, `L`, `B`, so `D` is free there, but inside a
category `assignLabelShortcuts` may have handed `D` to a label and the label
has to win.

The root footer becomes `Letter to pick a category · C to comment · D to draw ·
Esc to close`.

### Giving the video surface back

This is the one structural difference from comment mode, and the thing the
design turns on. The panel's root is `fixed inset-0` with
`@click="emit('close')"`, so while it is mounted the user cannot touch the
drawing canvas at all. Comment mode never had to care.

In draw mode:

- the backdrop gets `pointer-events: none`; the toolbar itself sets
  `pointer-events: auto`. Clicks outside the toolbar reach the canvas.
- the backdrop's `@click` and `@contextmenu` close handlers are inert in draw
  mode. A click outside is a brush stroke, not a dismissal. `Esc` cancels.
- the two columns collapse to a single row about 48px tall.

### The toolbar

The header stays as it is (`● Annotate` on the left, `F00412 · 0:13` on the
right), so the frame being drawn on is always in sight. The body becomes one
row of controls in the panel's own keycap language:

| Control | Keys |
| --- | --- |
| Six colour swatches | `1`-`6` |
| Stroke width, three presets drawn as dots of increasing size | `[` and `]` |
| Undo last stroke | `U`, also `Cmd/Ctrl+Z` |
| Save | `Enter` |
| Cancel | `Esc` |

Footer: `Enter to save · U to undo · Esc to cancel`.

The six colours are drawn from the twelve-colour palette already in
`useDrawingCanvas`: red `#ef4444`, orange `#f97316`, amber `#fbbf24`, green
`#22c55e`, blue `#3b82f6`, white `#ffffff`. The three widths are 2, 4 and 8px.

The panel stays a dumb component. It takes `drawColor: string` and
`drawWidth: number` as props and emits `draw-color` and `draw-width`;
`EditorView` owns the coordinator, exactly as it already owns pause and resume
for comment mode. This keeps the panel testable without a canvas.

### Position

Unchanged: the same anchor-above-`props.y`, centre-on-`props.x`,
clamp-to-viewport logic, with the existing `watch(mode)` re-measuring after the
height change. From the timeline entry point that lands the toolbar in the
strip between the video's bottom edge and the timeline, which is where it
wants to be, because `VideoTimeline` hands over the timeline's own top edge as
`clientY`. From the dual-mode right-click entry it lands above the pointer.

This is the one part of the design to check against the real app rather than
trust. If the toolbar proves to sit over the drawing surface, it moves to a
fixed bottom-centre dock; that is a change to one computed property.

### Emits

- `(e: 'draw')` - commit. No payload: the strokes live on the canvas, and
  `EditorView` is the side that can reach it.
- `(e: 'draw-mode', active: boolean)` - fired `true` on entering draw mode and
  `false` on leaving it by any route, exactly like `comment-mode`. Every exit
  routes through a single `leaveDrawMode()`. A stranded flag is worse here than
  for comments: `openQuickPick` and `openQuickPickAtTime` both bail while
  `isDrawingMode` is true, so a stranded mode locks the user out of the whole
  flow, not just out of playback.
- `(e: 'draw-color', color: string)` and `(e: 'draw-width', width: number)`.

`resetToRoot()` gains `leaveDrawMode()` alongside `leaveCommentMode()`, so both
reset paths (`watch(() => props.open)` and `watch(() => [props.x, props.y])`)
clear draw mode too.

### The keyboard guard

`handleKeydown` is registered on `window` in capture phase and already owns
every A-Z character. Draw mode needs a branch of its own, placed beside the
comment branch:

- `Escape` cancels, `Enter` commits, `U` undoes, `1`-`6` set the colour, `[`
  and `]` step the width. All `preventDefault()` and `stopPropagation()`.
- **`Space`, `ArrowLeft` and `ArrowRight` are swallowed.** This is not
  cosmetic. `handleKeydown` returns without preventing them today (they are
  length-1 or non-letter and fail the `/[A-Z]/` test), so they reach
  `useVideoPlayer`'s document listener and move the frame.
  `DrawingCanvas.watch(currentFrame)` then calls `loadDrawingsForFrame()`,
  which does `canvas.clear()`, and `handlePathCreated` *replaces*
  `currentDrawingSession` whenever its frame no longer matches. The strokes are
  gone with no way back.
- `Cmd/Ctrl+Z` is the one modifier combination the handler acts on; every other
  modifier combination still returns early.

## Frame integrity

Playback pauses on entering draw mode and resumes on leaving it, reusing the
`commentModeWasPlaying` / `isPlaybackRunning()` mechanism already in
`EditorView` for comments. The swallowed `Space` and arrows above are the other
half of the same guarantee.

On save, the snapshot frame is stamped into the drawing data, overriding the
frame the canvas stamped:

- single mode: `drawingData.frame = snapshot.frame`
- dual mode: `drawingA.frame = snapshot.dual.videoAFrame`,
  `drawingB.frame = snapshot.dual.videoBFrame`

The canvas stamps `props.currentFrame`, which follows the player; the payload
uses `quickPickSnapshot.frame`, which is `Math.round(time * fps)` taken before
an asynchronous seek. Left alone, those can differ by a frame, and the marker
and the strokes would land on different frames.
`DrawingCanvas.loadDrawingsForFrame` matches on `drawing.frame ===
props.currentFrame`, and `EditorView`'s selected-annotation watcher drives the
canvas frame from `annotation.frame`, so the two must agree exactly or clicking
the annotation shows an empty canvas.

## EditorView

`handleQuickPickDrawing()` mirrors `handleQuickPickComment`:

1. Copy `quickPickSnapshot.value` into a local before anything can null it.
2. Read the in-progress session from the canvas refs it already passes to the
   sidebar (`unifiedVideoPlayerRef.singleDrawingCanvasRef`,
   `drawingCanvasARef`, `drawingCanvasBRef`).
3. No strokes means no annotation: return without closing, so `Enter` on an
   empty canvas is a no-op rather than a gray `Untitled` row.
4. `handleAddAnnotation(buildAnnotationPayload({ labels: quickPickLabels,
   labelIds: [], content: '', frame, fps, dual, drawingData }))`.
5. A `drawingSaving` guard blocks a second `Enter` while the first insert is in
   flight, cleared in `finally`, exactly like `commentSaving`.
6. Close only once the annotation is actually stored. A failed save leaves the
   toolbar open, the strokes on the canvas and the video paused, which is the
   state to press `Enter` again from. Strokes are far more expensive to redo
   than a keystroke.

### Do not complete the session

`useDrawingCoordinator.getDrawingData()` calls
`DrawingCanvas.completeDrawingSession()`, which emits `drawing-created`, which
`useVideoEventHandlers.handleDrawingCreated` forwards to
`annotationPanelRef.onDrawingCreated` and so into the **sidebar form's draft**.
Using it here would silently attach every timeline drawing to the sidebar's
next new annotation.

The quick-pick path therefore reads `getCurrentDrawingSession()` without
completing it, hands the drawing to the coordinator itself so the strokes stay
on screen without waiting for the annotations watcher, and then discards the
session.

### Cancel

`Esc` in draw mode discards the strokes and returns to the root screen; a
second `Esc` closes the panel, matching `back()`'s existing semantics.

Discarding must not take saved work with it.
`clearDrawingsWithRefs()` is the wrong tool: in single mode it also calls
`clearCurrentFrameDrawings()`, which deletes the frame's entry from the
composable's `drawings` map, so previously saved drawings on that frame
disappear until the next reload. `DrawingCanvas` gains a narrower
`discardCurrentSession()` instead, which drops `currentDrawingSession` and
calls `loadDrawingsForFrame(true)` to re-render exactly what is persisted.

## Shared code changes

Three small changes fall out of "a drawing alone is an annotation".

### buildAnnotationPayload

The title fallback becomes `primaryLabel?.name || content.slice(0, 50) ||
(drawingData ? 'Drawing' : 'Untitled')`. Without it a bare drawing reads as
`Untitled` everywhere the sidebar lists it.

### isSaveableAnnotation

Today it blocks a bare drawing by name, and its comment says so. It widens to
accept no label plus a drawing:

```
labelCount === 1
  || (labelCount === 0 && (content ?? '').trim().length > 0)
  || (labelCount === 0 && hasDrawing)
```

The input gains `drawingData`. Its only consumer is `AnnotationForm.vue:208`,
so this is a deliberate behaviour change to the sidebar: it can now save a
drawing with no label and no text. That is required, not incidental. Without
it the sidebar could not re-save a drawing it opened, which is exactly the bug
fixed in commit e378cc4 for comments.

### DrawingCanvas

Two additions to the exposed surface:

- `undoLastStroke()` - removes the last object from the fabric canvas and pops
  the last entry from `currentDrawingSession.paths`, re-rendering. Undo does
  not exist today in any form.
- `discardCurrentSession()` - as described under Cancel.

`useDrawingCoordinator` gains `setStrokeWidth(width)` (it already has
`setCustomColor` / `clearCustomColor`) plus thin wrappers for the two new
canvas methods, so `EditorView` keeps branching on single versus dual in one
place.

## Timeline marker

`isComment()` is `labels.length === 0`, so a label-less drawing would render as
the comment ring. Marker precedence in `VideoTimeline.vue` becomes:

1. **label** - filled dot in the severity colour (unchanged)
2. **drawing** - rounded square, gray border, transparent fill
3. **comment** - hollow ring (unchanged)

A shape difference reads better than a fill difference at 16px, and the square
keeps the same size, hit area and selected-state treatment as the other two.

A new `isDrawingAnnotation()` predicate joins `isCommentAnnotation()` in
`annotationPayload.ts`, matching on `annotationType === 'drawing'` with
`drawingData` present. `isComment()` in the timeline must exclude drawings, or
the two branches overlap.

The legend below the timeline gains a third non-severity entry, `Drawing`,
drawn as the same rounded square, next to the existing `Comment` ring.

## Canvas cleanup

Pre-existing sloppiness in `DrawingCanvas.vue` that becomes conspicuous once
drawing is a first-class flow. Fixed as part of this change, which touches the
sidebar drawing path too since both share the component:

- `.canvas-container` loses `min-width: 800px` and `min-height: 450px`. The
  container is `position: absolute; inset: 0` inside the video wrapper, so it
  already has the wrapper's size; the minimums only force the overlay larger
  than a small player.
- `.canvas-container` is declared twice, with the second block silently
  overriding part of the first. The two merge into one.
- `.drawing-canvas` goes from `height: 700px` to `height: 100%`.
- The always-on `background-color: rgba(255, 255, 255, 0.02)` wash goes.
- Drawing mode loses the 3px blue border, the blue background tint, the blue
  glow and the "Drawing Mode Active" debug badge. It is signalled instead by
  the crosshair cursor it already sets and a thin orange ring at the video's
  edge, in the app's own accent. The toolbar already says what mode you are in.

The 800x450 fallback inside `updateCanvasSize()` stays: that is a guard against
a zero-sized container, not styling.

### Reported, not in scope

The canvas overlay covers the whole video wrapper, including the control bar,
so drawing mode blocks play/pause and the volume controls underneath it. This
is pre-existing behaviour on the sidebar path and is not made worse here.
Excluding the controls from the overlay is a separate change.

## Testing

Unit:

- `buildAnnotationPayload`: drawing with no label and no content gets the title
  `Drawing`; a labelled drawing still takes the label's name.
- `isSaveableAnnotation`: no label plus a drawing is saveable; no label, no
  text and no drawing is still not.
- `isDrawingAnnotation`: true for a drawing, false for a comment and for a
  labelled annotation.

Component, `AnnotationQuickPick`:

- `D` enters draw mode at the root and emits `draw-mode(true)`; inside a
  category `D` addresses the label that holds it.
- The backdrop is click-through in draw mode and not in the other two.
- `Space`, `ArrowLeft` and `ArrowRight` are prevented in draw mode.
- `1`-`6` emit `draw-color`; `[` and `]` emit `draw-width` within 2-8.
- `Esc` emits `draw-mode(false)` and returns to the root; a second `Esc`
  closes.
- `Enter` emits `draw`; reopening at a new position resets the mode.

Component, `DrawingCanvas`:

- `undoLastStroke()` removes the last fabric object and the last session path,
  and is a no-op on an empty canvas.
- `discardCurrentSession()` drops the session and re-renders the persisted
  drawings for the frame rather than leaving the canvas blank.

End-to-end in the real app, single and dual:

- Click the timeline, press `D`, draw, press `Enter`. The marker lands on the
  snapshotted frame, the drawing is still on screen, and scrubbing away and
  back brings it up again.
- The annotation appears in the sidebar titled `Drawing` with no label, and can
  be re-saved from the sidebar without attaching one.
- Playback resumes on save and on cancel if it had been running.
- `Space` during drawing does not resume playback or clear the canvas.
- Opening the sidebar's add-annotation form after saving a timeline drawing
  shows an empty draft, with no drawing carried over.
- The toolbar does not sit over the part of the video the user needs to draw
  on.
