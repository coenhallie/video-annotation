# Replay on the Match Tracker Widget: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make video-annotation's 2D replay run on the published `@coenhallie/match-tracker` widget in replay mode, so this app and accio-match-share share one versioned visualisation. After this change, `src/lib/vis/` is deleted.

**Architecture:**
- `usePipelineReplay` keeps loading, the clock and seeking. Instead of working out phase and trail itself, it exposes the record on screen and its lookback window.
- `PipelineOutputSurface.vue` becomes a thin host of the widget, which it feeds through `present()` on every tick. It keeps only what the widget leaves to hosts:
  - the transport bar
  - the `F{n}` frame badge
  - the buffering, loading, empty and error panels
  - the drawing overlay slot
  - the context-menu emit
- `ReplayMomentTriggers` calls `trigger()`.

**Tech stack:** Vue 3, TypeScript, Vitest, and `@coenhallie/match-tracker` (GitHub Packages, version pinned exactly).

**Spec:** `/Users/coenhallie/Desktop/projects/accio-match-share/docs/superpowers/specs/2026-11-02-match-tracker-widget-design.md`, section "Phase 2". The widget's README documents the API, under "Replay".

## Global Constraints

- **Package:**
  - `@coenhallie/match-tracker`, exactly `0.1.1`, with no `^`.
  - `.npmrc` contains `@coenhallie:registry=https://npm.pkg.github.com`. The token goes in the user's `~/.npmrc` and is never committed.
- **Widget options:**
  - `mode: 'replay'`
  - `locale: 'en'`
  - `layersStorageKey: 'perspecto.replayLayers'`, so users keep their layer choices
  - `teams` taken from `pipelineTeamNames(title)`
- **Behaviour:**
  - Behaviour must stay the same as today's replay. The widget was proved call for call against this app's own golden recordings (branch `test/match-tracker-goldens`).
  - The two deliberate changes, which apply to this app too:
    - zoom needs ctrl/cmd + wheel, and pinch works on touch;
    - Escape closes the layers menu only when focus is inside the widget.
- **Style:** semicolons and eslint, as in this repo. `npm run check` must pass.
- **Commits:** no agent attribution and no em dashes. Do not deploy.

## Review Focus

1. **Overlay alignment.** The drawing overlay mounted in `tracker.overlay` must stay aligned with the pitch through resize, dpr changes, zoom and pan.
2. **Seeking and scrubbing.** No moment may play after a seek. The widget's playback rule must match `lastStepWasPlayback`.
3. **Pause, then step.** The frame-step buttons must still show the exact record.
4. **One-frame lag.** `present()` queues a frame, so the widget can trail the host by one frame (final review A7). Annotations drawn on the overlay must not visibly lag the pitch. If they do, add a synchronous present option to the widget (0.1.1) rather than working around it here.
5. **Switching projects or videos.** The tracker is destroyed and rebuilt, or reset, and nothing leaks.

---

### Task 1: Expose the replay window from `usePipelineReplay`

**Files:** `src/composables/usePipelineReplay.ts` and its test. `src/lib/pipelineData/frameWindow.ts` changes only if needed.

- [ ] Add `record: Ref<TrackerRecord | null>` (`{ t, frameCount, frame }`) and `lookback: Ref<readonly TrackerRecord[]>`. `lookback` is the same `recent` array `setHistory` builds today, in the same order.
- [ ] Remove `phase` and `ballTrail`, together with their computation and tests, because the widget derives both now. Keep every load, seek, buffering and prefetch test.
- [ ] Keep `frame` until Task 2 lands. Then remove it if nothing else uses it.
- [ ] Do not commit yet. The surface still reads `phase` and `ballTrail` until Task 2, so Tasks 1 and 2 land together as one commit, "Draw the replay with the match tracker widget".

### Task 2: Host the widget in `PipelineOutputSurface.vue`

**Files:**
- `.npmrc`, `package.json` and the lockfile;
- `src/components/PipelineOutputSurface.vue`;
- `src/components/ReplayMomentTriggers.vue`;
- `src/views/EditorView.vue`, only where props or events change;
- `src/components/__tests__/pipelineOutputSurface.test.ts` and `src/components/__tests__/pipelineTimelineSeek.test.ts`.

- [ ] Install with `npm install @coenhallie/match-tracker@0.1.1 --save-exact`.
- [ ] Mount `createMatchTracker(host, options)` in the stage, or use `MatchTracker` from `@coenhallie/match-tracker/vue`. On every replay tick, call `present({ time: currentTime, playing: isPlaying, record, lookback })`.
- [ ] Mount the `overlay` slot content in `tracker.overlay`, still passing the slot prop `current-frame`. In 0.1.1 this is a light-DOM element slotted over the pitch, so the app's own CSS applies to it.
- [ ] Anchor the frame badge and the transport bar to `tracker.box`, and follow its `box` event.
- [ ] Drive the demo buttons' disabled state from `tracker.availability()` and its `availability` event.
- [ ] Pass `lookback` as the records within `REPLAY_LOOKBACK_S` of the record on screen.
- [ ] Keep these exactly as they are today:
  - the transport bar
  - the frame badge
  - the buffering spinner
  - the loading, empty and error panels
  - the `context-menu` emit
- [ ] Delete from the surface:
  - its own phase row
  - the layers menu
  - the zoom and pan handlers
  - sizing and dpr handling
  - font and icon loading
  - every moment, ring and roll state

  The widget now owns all of these.
- [ ] Make `ReplayMomentTriggers` call `tracker.trigger(moment, team)` through the exposed surface ref.
- [ ] Rewrite `pipelineOutputSurface.test.ts` around the thin host. Mock the package and assert:
  - `present` receives the replay state on each tick;
  - the overlay slot is mounted in `tracker.overlay`;
  - the transport, frame badge and state panels behave as before;
  - the triggers reach `trigger`.
- [ ] Keep `pipelineTimelineSeek.test.ts` running against the real widget.
- [ ] Run `npm run check` and commit with the message "Draw the replay with the match tracker widget".

### Task 3: Delete the old visualisation

**Files:** `src/lib/vis/**` and its tests, `src/components/__tests__/goldens/**`, plus any imports that remain.

- [ ] Delete `src/lib/vis/` and its tests. Point the remaining type imports (`Frame` and the others) at the package.
- [ ] Delete the golden harness from this branch. Its fixtures live in the widget repo now.
- [ ] Run `npm run check`.
- [ ] Run `grep -rn "lib/vis" src`. The expected result is no matches.
- [ ] Commit with the message "Remove the replay's own 2D visualisation, now in the match tracker".

### Task 4: Check it in the running app

- [ ] Run `npm run dev` with `VITE_DEV_AUTH_BYPASS=true` in the local `.env`.
- [ ] Open a project that has pipeline data and check each of these:
  - play, pause, step and seek;
  - each moment plays on its label, and from the demo controls;
  - zoom and pan;
  - the layers menu, with choices kept from before;
  - the drawing overlay stays aligned while zoomed;
  - a resize keeps everything in place;
  - there are no console errors.
- [ ] If no project data can be loaded locally, say so, and list exactly what Coen should check.
- [ ] Add a changelog entry in the app's own versioning, following the existing "Beta vX.YZ" docs commits.
