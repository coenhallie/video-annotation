# Dashboard Folders — Design

**Date:** 2026-07-03
**Status:** Approved (follow-up to the shared video dashboard).

## 1. Goal

Bring the folder **create / file / filter** flow — which previously lived in the
retired `ProjectManagementModal` — onto the new library `DashboardView`. Users can
create folders, file videos into them (drag-drop or a per-card menu), and filter the
dashboard to a folder's contents. Per the shared-dashboard direction, folders are
**personal (owner-scoped) collections that may contain any video**, including other
users' videos from the shared library.

The entire folder backend already exists and is reused unchanged: `FolderService`
(create/rename/delete/move, `getUserFolders`, `buildFolderTree`, `getProjectsInFolder`,
`addProjectToFolder`/`moveProjectToFolder`/`moveProjectsToFolder`) and the components
`FolderTree`, `FolderTreeItem`, `NewFolderDialog`, `MoveProjectsDialog`,
`MoveDialogFolderItem`. This work is UI wiring plus one bug fix.

## 2. Non-goals (YAGNI)

- Folder color/icon pickers (the schema has the fields; no UI this round).
- Sharing folders between users.
- Manual reordering of projects within a folder.
- Nested-folder drag reparenting beyond what `FolderTree` already emits.

## 3. Layout

`DashboardView` gains a **left folder sidebar** (`FolderTree`) with the video grid/list
to its right — the same shape as the old modal, now full-page. The sidebar holds the
tree, a **"+ New folder"** control, and an **"All videos"** (no-folder) root entry. The
existing top toolbar (scope toggle, search, grid/list, upload/create-comparison) stays
above the content area.

The sidebar is present in **both** scopes (folders can contain any video). On narrow
viewports the sidebar collapses (toggle button); not a priority but should not overflow.

## 4. Folder × scope behavior

- **No folder selected** → the `All Videos / My Videos` scope toggle governs the list
  (current behavior), composed with search + label filters.
- **A folder selected** → the list shows that folder's **contents across all owners**:
  `getProjectsInFolder(folderId)` returns the project ids (no owner filter), which are
  resolved against the full project set (load via `getAllProjects({ scope: 'all' })`)
  and shown with a breadcrumb. The scope toggle is not applied while a folder is
  selected (a curated collection is inherently cross-owner). Selecting **"All videos"**
  / clearing the folder returns to the flat scope view.

The selected folder id persists to `localStorage` (key `dashboardFolderId`), alongside
the existing `dashboardScope`.

## 5. Create / rename / delete

- **Create:** "+ New folder" → existing `NewFolderDialog` → `FolderService.createFolder`
  (parent = currently selected folder for nesting, else root). Reload the tree after.
- **Rename / delete:** folder context menu in `FolderTree` (existing emits) →
  `FolderService.updateFolder` / `deleteFolder`. Deleting a folder removes the folder +
  its `project_folders` rows (existing cascade) — the videos themselves are untouched and
  fall back to "uncategorized." Confirm deletion via the existing `DeleteConfirmationDialog`.

## 6. Filing a video into a folder

Two mechanisms (both requested):

1. **Drag-drop:** drag a `ProjectCard` / `ProjectListItem` onto a sidebar folder. Reuse
   the existing `DragData` shape (`{ type: 'project', id, sourceFolderId? }`) and the
   `FolderTree` drop handlers; on drop call `FolderService.moveProjectToFolder`
   (or `addProjectToFolder` when copying into a folder from the flat view).
2. **Per-card menu:** each card gains a **"⋮ → Add to folder"** action opening a small
   folder picker (reuse `MoveProjectsDialog` / `MoveDialogFolderItem`) → `moveProjectToFolder`.

Because folders may hold any video, filing a video you don't own is allowed (it stores a
`project_folders` reference only; it does not change ownership or the video).

## 7. Filter composition & data flow

Order applied to produce the visible list:

1. **Folder** (if selected) → restrict to `getProjectsInFolder(folderId)` ids over the
   full (`scope: 'all'`) project set; **else** apply the **scope** (mine/all) base load.
2. **Search** (title / owner name), then **label** filter (existing), then **pagination**.

Counts (`getProjectCountsBatched`) and labels (`getLabelsForProjects`) run over the
resulting visible set, as they do today.

## 8. Bug fix folded in

`FolderService.getProjectsInFolder(null, userId)` (the "uncategorized" branch) queries
`videos.owner_id`, but the column is `ownerId` (camelCase). Fix to `ownerId` so the
"no folder / uncategorized" filter returns the user's own un-filed videos correctly.
(The specific-folder branch is already correct and owner-agnostic.)

## 9. Files touched (anticipated)

**Modify**
- `src/views/DashboardView.vue` — add sidebar, folder state (`folders`, `folderTree`,
  `currentFolderId`, breadcrumbs), create/rename/delete handlers, drag-drop + per-card
  filing, folder-aware filter composition, localStorage persistence.
- `src/components/ProjectCard.vue` / `ProjectListItem.vue` — add the "⋮ → Add to folder"
  action and drag source wiring (they already emit `dragstart`).
- `src/services/folderService.ts` — fix `owner_id` → `ownerId` in the null-folder branch.

**Reuse unchanged**
- `FolderTree`, `FolderTreeItem`, `NewFolderDialog`, `MoveProjectsDialog`,
  `MoveDialogFolderItem`, `DeleteConfirmationDialog`, and the rest of `FolderService`.

## 10. Risks

- **Cross-owner folder contents at scale:** resolving a folder against the full `all`
  set is fine at current volume (~33 videos) but shares the dashboard's existing
  unbounded-load limitation (tracked separately). Acceptable for now.
- **`project_folders` table may be absent** in some environments — `FolderService`
  already tolerates the `42P01` (missing table) error by degrading gracefully; the
  dashboard must not hard-fail when folders can't load (show the flat list).
- **RLS (pending, tracked in the shared-dashboard spec §6):** `folders`/`project_folders`
  writes must be owner-gated when RLS lands; filing references are per-user.
