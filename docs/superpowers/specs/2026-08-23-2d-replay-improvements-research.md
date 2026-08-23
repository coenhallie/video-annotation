# Improving the 2D pipeline replay

Written 2026-08-23, after the replay's first real run. Research, except for the
two items marked SHIPPED below.

**Shipped 2026-08-23:** A1 (pitch markings) and the fallback half of A2 (team
colours). A dimension the frame does not state is now drawn dashed and dimmed
rather than as a measured line, and a team the frame reports no colour for is
drawn with a neutral dashed marker rather than an invented red or blue. The
identity-channel half of A2 was deliberately left out of that pass, so in the
16.6% of frames with no detected colour the two teams are now equally neutral
and cannot be told apart on the pitch. That is the known cost of not inventing
one, and it is what the identity channel in A2 is for.

## The governing constraint: display, do not correct

The surface exists to show what the pipeline produced so a reviewer can judge
it. It must not clean, smooth, stabilise or complete that output. Anything the
display invents is a defect the reviewer cannot see, and anything the display
smooths is a defect the reviewer will not report.

That has a sharp consequence, and it cuts against the obvious instinct: **where
the pipeline output looks bad, the display's job is to show it looking bad.**
Flicker, jitter, jumps and gaps are the product under test.

An earlier draft of this document violated that. It recommended resolving team
colours once per clip and enforcing a minimum separation between the two teams.
That is data correction, it would hide a real pipeline signal, and it is
withdrawn. See "Withdrawn" below.

Everything is therefore sorted into three groups:

- **A. Fidelity defects** - the display currently shows something the data does
  not say, or hides something it does. These come first now.
- **B. Faithful additions** - show more of the data, unaltered.
- **C. Withdrawn or rejected** - things that would improve the picture by
  degrading its truthfulness.

The secondary filter is unchanged: every candidate must make at least one of the
22 defect labels in `migrations/20260709_replace_default_labels.sql` easier to
see. That is why there are no heatmaps, Voronoi cells or pass networks here.

## What the port is

Not a stale copy. `src/lib/vis/useRenderer2D.ts` diffs clean against
`datalabelling-frontend/src/lib/vis/useRenderer2D.ts` (2026-06-03) apart from the
two deltas its header documents. That upstream file is the newest 2D renderer
that exists: every `src/lib/vis/` commit in DALF since is three.js work. The copy
in `football-visualisation` (2026-02-28) is the same code pre-refactor. There is
no better 2D implementation to sync to, so everything below is new work.

## Evidence

Measured against `football-visualisation/data.jsonl`, a real export in the same
JSONL shape `frameWindow.ts` parses. **Every figure is a full pass over all
121,371 frames** unless marked as a sample. An earlier draft quoted
head-of-file numbers; three were wrong by a wide margin because the first ~40
lines are a warm-up burst. Corrected here.

Provenance caveat: February 2026, one match. Field *population* may have moved
since; the *shape* has not.

| Measured over the full match | Value |
| --- | --- |
| Distinct `track_id`s | **6,092**, for ~25 people on the pitch |
| Per-frame steps over 2 m (≥50 m/s at 25fps) | **35,563 / 2,967,257** (**1.20%**) |
| Largest per-frame displacement | **91.7 m/frame** |
| Team entries with no usable `ordered_colors` | 40,338 / 242,742 (**16.6%**) |
| Frames carrying `center_circle_radius` or `penalty_mark_distance` | **0** |
| Player points outside the pitch rectangle | 243,449 / 3,023,917 (**8.05%**) |
| Player points off the 1280x720 canvas, drawn nowhere | **904** (0.03%) |
| `is_high_ball` true | **0 of 121,371** |
| Ball `z` greater than 0 | **0** (2 occurrences of `"z": null`) |
| Players per frame | median **25**, p5 25, p95 25 |
| Frames with no usable ball | 42 (**0.03%**), all in the first 42 lines |
| Non-`other` events | 3,612 (Throw in 2,712, Corner 326, Kick off 305, Free kick 226, Goal kick 43) |
| `occlusion`, `number_probability` populated | never (always 0) |
| Of frames using detected colours, fill AND outline < 60 RGB units apart | **91.8%** (3,000-frame sample) |

The headline: identity churn and impossible motion are what this data actually
contains, and none of it is visible in a single-frame render.

---

## A. Fidelity defects

### A1. The pitch markings are partly invented — SHIPPED

**Defect classes: PITCH LINES MISMATCH, PITCH PROJECTION OFF.**

`buildPitchCache` defaults `center_circle_radius` to 9.15 m and
`penalty_mark_distance` to 11.0 m when absent (`pitchGeometry.ts:82-83`).
**Neither key appears in a single one of the 121,371 frames.** So the centre
circle and both penalty spots on screen are always drawn from FIFA constants,
never from pipeline output.

PITCH LINES MISMATCH asks the reviewer whether the projected pitch lines align
with the real lines in the video. Two of those markings are not projections at
all. If the pipeline's pitch model is wrong in that respect, the display cannot
show it, and if it is right, the agreement is not evidence.

Shipped: `resolvePitchDimensions()` now reports, per dimension, whether the
frame stated it. `buildPitchCache` draws each marking through a `marking()`
helper that dashes and dims it when any dimension it rests on was substituted,
including the pitch extent every marking is positioned from. All nine
dimensions are covered, not just the two this export omits.

### A2. Team colours are invented on 16.6% of team entries — FALLBACK SHIPPED

**Defect classes: TEAM COLOR WRONG, TEAM ASSIGN WRONG.**

When `ordered_colors` is missing or shorter than 3, `resolveTeamColors` falls
through to hard-coded red for `team_id` 0 and blue for `team_id` 1. That happens
on **16.6% of team entries**, and the substitution is silent: a confident,
saturated colour appears where the pipeline detected nothing at all. Roughly one
frame in six, both teams change colour and change back.

Under the constraint, the flicker itself is not the bug to fix. The bug is that
**absence is rendered as a confident value**. "No colour detected" should look
like no colour detected.

There is a second, separate problem that the constraint reframes rather than
solves. Where colours *are* detected, the two teams are nearly identical: fill
and outline are each within 60 RGB units in **91.8%** of sampled frames, both
near-white. So the reviewer often cannot tell the teams apart. The correct
response is **not** to adjust the colours, but to notice that the renderer is
using one channel for two different data items:

- `team_id`, a structural fact about which team the pipeline assigned a player
  to, and
- the detected shirt colour, a separate pipeline claim that legitimately varies
  per frame.

Shipped, the absence half: `resolveTeamColors` no longer keys a colour off
`team_id`. When nothing in the frame reports one it returns a single neutral
`UNDETECTED` set, identical for every team, carrying `detected: false`, and
`draw2DPlayer` dashes that player's outline. The goalkeeper and official
branches stay solid, because those colours are keyed on `person_type`, which the
frame does state.

Still open, the identity half: give `team_id` a stable channel that is obviously
the application's own (marker shape, or a fixed slot colour presented as a legend
key, not as a claim about the shirt), and show the detected colour as its own
explicit mark that is free to flicker, because the flicker is data. Until that
lands, the two teams are indistinguishable in the 16.6% of frames with no
detected colour: the honest rendering of "nothing was reported", but a real loss
of legibility measured against what the invented colours used to convey.

Cost: moderate, since it touches the legend as well as the renderer.

### A3. Ball height shows an inference, not the datum

**Defect class: BALL HIGH MISCLASS.**

`draw2DBall` derives radius and tint from `projected_coordinates.z`. Across the
entire file `z` is never a positive number, so that cue is inert and every ball
renders as the same 4 px white dot. Meanwhile the payload carries an explicit
`is_high_ball` boolean and a `probability`, and the renderer reads neither.
Neither is declared in `types.ts`, whose `Ball` has only
`projected_coordinates`. Also undeclared and unread: `bounding_box`, and on
players `is_agent`, `occlusion`, `number_probability`.

So the reviewer is asked to judge a high-ball call that is not displayed, while
the thing that *is* displayed is the renderer's own inference from a dead field.

Fix: render `is_high_ball` as what it is, a stated boolean, and stop deriving
appearance from `z` unless `z` is populated.

Caveat that keeps this mid-order: `is_high_ball` is false in all 121,371 frames
of this export, so this makes a silent claim visible rather than fixing a
visibly wrong one. Confirm against a current export first.

Cost: estimated small.

### A4. Data that exists but is drawn nowhere

**Defect class: PITCH PROJECTION OFF.**

**904 player points fall outside the 1280x720 canvas and are silently dropped.**
The vertical margin is 40 px, which at this transform is about 4.25 m beyond the
touchline, so a player projected further out than that simply vanishes.

PITCH PROJECTION OFF is defined as players appearing "in the stands". The most
extreme instances of exactly that defect are the ones the display discards. The
8.05% of points that land outside the pitch rectangle but inside the canvas do
render, which is right.

Fix: never drop a point silently. Clamp to the canvas edge with a marker that
says "off-surface, actual position beyond", or scale the view to include
outliers, or at minimum count them in view. The requirement is that the reviewer
learns the point existed.

Cost: estimated small.

### A5. The pitch cache is built once and never rebuilt

`transform2d` and `pitchCache` are built lazily on first render and cleared only
by `invalidateCache()`, which **nothing in `src/` ever calls** outside the
renderer's own definition. If `pitch_dimensions` ever changed mid-clip, the
display would keep drawing the first frame's pitch.

No impact on this export, where `pitch_dimensions` is byte-identical in all
121,371 frames. Recorded as latent, because a changing pitch model is itself
something a reviewer would want to see rather than have hidden.

Cost: trivial. Call it when the dimensions change.

---

## B. Faithful additions

### B1. Trails

**Defect classes: PLR ID SWITCH, PLR TELEPORT, BALL TRAJ IMPLAUSIBLE.**

Each is a statement about motion between frames, and a single-frame renderer
cannot show any of them. The data says this is where the defects are: **6,092
track IDs for ~25 people**, and **1.20% of transitions exceed 2 m in one frame**,
up to 91.7 m.

Drawing the last N recorded positions of each track adds no information the data
does not contain. An ID switch reads as two trails crossing and swapping; a
teleport as a straight line across the pitch.

Two fidelity rules for the implementation, both load-bearing:

- **Plot recorded positions only.** No interpolation, no smoothing, no curve
  fitting between samples.
- **Draw gaps as gaps.** If a track is absent for a stretch, the line must break.
  Bridging it would fabricate motion that the pipeline never produced, in exactly
  the situation the reviewer is trying to detect.

Feasibility, verified: `usePipelineReplay` already holds the surrounding records
in memory (`windows[].records`, each carrying a full `frame`), so this needs **no
new fetching**. But `windows` is a closure local and the composable returns only
`frame`, so it needs a small API addition: a `recentRecords(n)` accessor. It must
search **across** `windows`, not read `windows[0]`, because right after a
prefetch crosses a boundary the preceding frames sit in the previous window.

Cost: estimated moderate. Best value-to-cost ratio in this document.

### B2. Resolution and zoom

**Not a feature. The display is currently a blurred copy of its own output.**

The canvas bitmap is fixed at 1280x720 and zoom is a CSS `transform: scale()` on
that bitmap, up to 6x, with no `devicePixelRatio` handling. Measured in the real
editor stage at a 1512x950 viewport, `devicePixelRatio` 2:

| Zoom | Displayed | Device px | Bitmap | Upscale |
| --- | --- | --- | --- | --- |
| 1 | 1080 px wide | 2160 | 1280 | **1.69x** |
| 2 | 2160 | 4320 | 1280 | **3.38x** |
| 6 | 6480 | 12960 | 1280 | **10.13x** |

Soft at rest on any Retina display, before anyone zooms. Zoom adds no detail; it
magnifies the same bitmap. `PipelineOutputSurface.vue:13` says inspecting a
cluster of players is the common QA gesture, and that gesture currently returns
blur. This is squarely within the constraint: same data, shown accurately.

Fix: size the backing store to `CSS size x devicePixelRatio x zoom` and
re-render.

**Architectural note.** This, the frame-count label that had to be pulled out of
the bitmap because CSS zoom slid it off-screen, and text that grows 6x instead of
staying legible are one root cause: zoom is a CSS transform on a fixed bitmap
instead of a parameter of the render. Folding zoom and pan into `Transform2D`
fixes all three, with the pitch cache keyed per zoom level.

The cost to weigh: `useRenderer2D.ts` and `pitchGeometry.ts` carry "keep edits
minimal so the two copies stay diffable" headers, and `build2DTransform` is
exactly what changes. Either accept the divergence and document it as the
existing deltas are, or add a thin wrapper that leaves the vendored files
untouched. That is a judgement call, not a technical one.

Cost: estimated moderate for DPR alone; larger if zoom is folded in.

### B3. Event markers on the timeline

**Defect classes: EVT MISSED, EVT FALSE, EVT TYPE WRONG, EVT TIME ERROR.**

All four are about *when* an event fired. `draw2DOverlay` prints
`state.actions[].action_type` in the corner of the current frame, and that is the
entire event UI. EVT TIME ERROR is defined as off by at least 2 seconds, which is
50 frames, so the error is never on screen at any single moment.

There is a real vocabulary to review: 3,612 non-`other` events, plus per-team
`actions` arrays the renderer ignores entirely. Placing them on the timeline
displays recorded timestamps unchanged.

Feasibility, verified: `VideoTimeline` accepts only `annotations` for markers
(`VideoTimeline.vue:48`) and renders one marker layer from it (line 401). This is
a component change plus a new prop, not a binding, and events must be collected
across the window rather than read from the current frame.

Cost: estimated moderate. The largest item here.

---

## C. Withdrawn or rejected

**Colour stabilisation - withdrawn.** An earlier draft recommended resolving each
team's colour once per clip via mode or median, and enforcing a minimum
perceptual separation between the two teams. Both are data correction: the first
hides genuine per-frame instability in the pipeline's colour detection, the
second displays a colour the pipeline never produced. What survives is A2, which
fixes only the fabricated fallback and separates identity from the colour claim.

**Interpolation - rejected.** DALF's `frameInterpolation.ts` would smooth 25 Hz
data to 60 Hz playback. It smooths precisely the discontinuities that PLR
TELEPORT and BALL TRAJ IMPLAUSIBLE exist to catch, which on this data is the
1.20% of transitions that matter most. If ever added: explicit toggle, off by
default, reason written beside it.

**Tracked-count readout - dropped on evidence.** Looked obvious; the data killed
it. Player count is median 25, p5 25, p95 25, flat across the match, with
zero-player frames confined to the first 40 lines. A readout of a constant helps
nobody.

**Derived defect candidates - kept only as a clearly separate layer.** Flagging
transitions over a threshold as PLR TELEPORT candidates, or co-located tracks as
PLR DUPLICATE candidates, is arithmetic over records already in memory, and it
would fire on real data. But it is the *tool's* judgement, not pipeline output,
so it must never be drawn into the data layer or styled like it. Two further
cautions: 35,563 flags across 81 minutes is about 7 per second, so the threshold
needs calibration and flags want aggregating into incidents; and some fraction
will be track-ID reuse rather than genuine motion, which is a different defect
worth distinguishing. Treat as optional, after B1.

## Already decided elsewhere, not re-opened

Recorded in `2026-08-22-pipeline-2d-replay-design.md` with reasons, listed so
they are not mistaken for new findings: the DALF `/start` squad join for real
player names; drawing annotations on the pitch; the share-view tab bar; the
raw-JSON inspector (an open question, not a decision); and the frame-numbering
mismatch between HUD and sidebar. A scrubber is likewise not needed:
`VideoTimeline` is already shared across both surfaces.

## Suggested order

Fidelity defects first, because until they are fixed the reviewer is judging a
picture that is partly the renderer's invention.

1. ~~**A1 pitch markings** and **A2 colour fallback**~~ - shipped 2026-08-23.
2. **A4 dropped off-canvas points** - small, and it hides the extreme cases of
   PITCH PROJECTION OFF.
3. **B1 trails** - moderate, unblocks the classes this data actually exhibits.
4. **B2 resolution** - decide the vendoring question first.
5. **A3 ball height** - confirm `is_high_ball` against a current export first.
6. **A5 cache invalidation** - trivial, latent.
7. **B3 event markers** - largest.

## What is not verified

- All data measurements come from a **February 2026 export of one match**. Field
  population may have changed; the shape has not. Two figures are 3,000-frame
  samples and are marked as such.
- The blur measurement recreated the ready-state canvas element, with its own
  classes and attributes, inside the real stage. A live capture was not possible:
  pipeline data is unreachable in this environment and the tab resolves to
  `empty`, consistent with the AWS access note in this branch's memory. Sizing is
  a layout property independent of the data, but it is a reconstruction.
- No performance profiling. Trails over thousands of track IDs and a per-zoom
  re-render both have an unmeasured cost.
- The 2 m/frame threshold is a first guess, not calibrated.
- A2's split of identity from detected colour is a design direction, not a
  validated one. It needs a reviewer to confirm the two channels read correctly
  before it is built.

Sources consulted outside the repo confirmed the framing (minimap rendering,
trajectory continuity, occlusion handling, ID association) but produced nothing
that beats the measurements above:
[SoccerNet Game State Reconstruction](https://arxiv.org/html/2404.11335v1),
[FOOTBALLTrace](https://www.scitepress.org/Papers/2023/122268/122268.pdf).
