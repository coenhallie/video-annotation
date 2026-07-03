# Video Details Sidebar — Design

**Date:** 2026-07-03
**Branch:** feature/shared-video-dashboard (or a new feature branch)
**Status:** Approved, pending implementation plan

## Summary

Add a right-hand details panel to the dashboard. Clicking a video card opens the
panel showing that video's metadata, summary stats, labels, and a full list of its
annotations. Clicking an annotation deep-links into the editor at that annotation's
frame. The editor is opened only from an explicit "Open" button inside the panel.

## Goals

- Let users inspect a video's details (annotation count, comment count, labels, and
  the full annotation list) without leaving the dashboard.
- Make annotations navigable: clicking one jumps straight to its timestamp in the editor.
- Keep the summary instant (reuse already-fetched counts); fetch the heavy annotation
  list lazily and cache it.

## Non-goals

- Editing annotations from the panel (read-only inspection only).
- Label-based dashboard filtering (a separate, already-documented follow-up).
- Changing the editor's internal annotation UI beyond accepting a seek-on-load target.

## Interaction model

- **Single-click a card** → selects it (selected ring via the card's existing
  `isSelected` style hook) and opens the details panel. It no longer navigates to the
  editor.
- **Open the editor** only from the **"Open" button inside the panel**. The existing
  `⋯ → Open` menu item on the card is **kept** as a secondary explicit path.
- **Click an annotation row** in the panel → navigate to the editor at that
  annotation's frame.
- **Close the panel** via the `✕` in its header, clicking the already-selected card
  again, or pressing `Esc`.
- **No double-click-to-open** behavior.

## Layout & component structure

- New component: `src/components/VideoDetailsPanel.vue`.
- Rendered by `DashboardView.vue` as a right-hand region of the existing
  `flex gap-6` row (alongside the folder `<aside>` and the grid column).
- **Desktop (`lg`+):** docked column, width `w-80`–`w-96`. The grid column shrinks;
  its existing responsive `grid-cols-2/3/4` reflows to fewer columns automatically.
- **Mobile / narrow:** `Teleport`-to-body fixed overlay drawer sliding in from the
  right with a backdrop — same pattern already used for the upload modal in
  `DashboardView.vue`.
- Selection state (`selectedProject: Project | null`) lives in `DashboardView.vue`,
  passed to `ProjectCard`/`ProjectListItem` (for the ring) and to the panel.

## Panel content (top → bottom)

1. **Header:** thumbnail, title, type badge (single/dual), owner, created date,
   duration, `✕` close button.
2. **Stat row:** annotation count · comment count · label count — prominent numbers.
3. **Labels:** distinct label chips used across this video's annotations, each with an
   occurrence count, colored via `label.color`.
4. **Annotations list (scrollable):** one row per annotation:
   - severity color dot (`annotation.color` / `severity`)
   - title, with a content snippet
   - timestamp formatted `m:ss` (from `annotation.timestamp`)
   - the annotation's label chips
   - Combined list for dual/comparison projects (video A + B merged, sorted by
     timestamp).
   - Row click → deep-link to editor at that frame.
5. **Actions:** **Open editor** (primary) · Share · Add to folder — reusing existing
   emits/modals already wired on the dashboard.

## Data flow & efficiency

- **Summary (instant):** annotation count and comment count come from the dashboard's
  already-loaded `annotationCounts` / `commentCounts`, so the header/stat row renders
  with no spinner on click.
- **Annotation list (lazy):** fetched only when a video is selected:
  - single: `AnnotationService.getVideoAnnotations`
  - dual: `AnnotationService.getAllComparisonVideoAnnotations`
  - Show a small skeleton/loading state in the list area only while it loads.
- **Label resolution:** map the `labelId`s on each annotation to `Label` records
  (name + color) via `LabelService`, reusing labels already available on the dashboard
  where possible.
- **Cache:** store fetched annotations per project id in a `Map` so re-selecting a
  video is instant and avoids refetching.
- Extract fetch-and-cache logic into a `useVideoDetails` composable to keep
  `VideoDetailsPanel.vue` focused on presentation.

## Deep-link into the editor

- Annotation row click → `router.push({ name, params: { id }, query: { frame } })`
  (frame, or annotation id, as the seek target).
- `EditorView.vue` reads the query in its existing `loadFromRoute` flow and calls the
  existing `seekTo` once the video/player is ready. The seek primitive already exists;
  this adds reading a query param and seeking after load.

## Components & responsibilities

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `VideoDetailsPanel.vue` | Presentation: header, stats, labels, annotation list, actions. Emits open/share/add-to-folder/annotation-click. | props (project, counts), `useVideoDetails` |
| `useVideoDetails.ts` (composable) | Lazy fetch + per-project cache of annotations; single vs dual merge/sort; label mapping. | `AnnotationService`, `LabelService` |
| `DashboardView.vue` (modify) | Owns `selectedProject`; renders panel (docked/drawer); routes panel actions to existing handlers; deep-link navigation. | `VideoDetailsPanel` |
| `ProjectCard.vue` / `ProjectListItem.vue` (modify) | Single-click emits `select` (open panel) instead of `open`; show selected ring. | — |
| `EditorView.vue` (modify) | Read seek-target query param and `seekTo` after load. | existing `seekTo` |

## Testing

- **`useVideoDetails`:** lazy fetch, caching (no refetch on re-select), single vs dual
  merge/sort by timestamp, label mapping.
- **`VideoDetailsPanel`:** renders summary from props; loads list on select; emits
  `open` / `share` / `add-to-folder` / `annotation-click`.
- **`DashboardView`:** clicking a card selects it and opens the panel and does **not**
  navigate; annotation-click triggers navigation with the seek query.

## Open items / follow-ups

- Label-based dashboard filtering remains a separate follow-up.
- Panel is read-only in v1; inline annotation editing is out of scope.
