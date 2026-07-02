# Shared Video Dashboard — Design

**Date:** 2026-07-02
**Status:** Design approved. Backend RLS state resolved empirically (see §6):
the database currently has **no effective access control** — reads *and* writes are
open to the anonymous key. Branch A confirmed; owner-gated write policies are now a
required part of this work (and fix a pre-existing security hole).

## 1. Goal

Today every user only sees videos they own. The video list lives inside
`ProjectManagementModal.vue`, auto-opened after login, and is filtered strictly
by `ownerId === current user`.

We want a **shared library**: any authenticated user can browse **all videos from
all users** — regular uploads, URL videos, and AWS/pipeline videos — together with
their associated labels, and toggle a filter to narrow to **just their own**.
Selecting a video opens the existing annotation workspace.

**Access model (confirmed):** everyone sees everything; a user can **view** any
video and add their **own** annotations, labels, and comments to it; a user may
**delete/rename only videos they own**.

## 2. Non-goals (YAGNI)

- Teams, organizations, or roles.
- Per-video permission granularity or sharing rules beyond "flat shared library".
- Editing/deleting other users' annotations or videos.
- Following, favoriting, or activity feeds.

## 3. Navigation & routing (confirmed)

The app moves from "single screen + modal" to "library landing page → editor".

| Path         | View             | Purpose                                             |
| ------------ | ---------------- | --------------------------------------------------- |
| `/`          | `DashboardView`  | Library: browse, filter own/all, labels, search     |
| `/video/:id` | `EditorView`     | The current annotation workspace                    |
| `/login`     | `Login`          | Unchanged                                           |

- The current `DashboardView.vue` (the annotation workspace) is **renamed/split into
  `EditorView.vue`**. Its logic — player, timeline, annotation panel, AWS load/refresh,
  shared-link handling — moves there largely unchanged.
- A new, lean `DashboardView.vue` becomes the library.
- `ProjectManagementModal.vue` is **retired**. Its presentation pieces
  (`ProjectCard`, `ProjectListItem`, `FolderTree`, search box, grid/list toggle,
  pagination) are **lifted out and reused** by the new dashboard rather than rewritten.
- Router guard, shared-link (`?share=`, `?shareComparison=`) and AWS (`?outputVideo=`)
  entry handling are preserved, but now navigate into `/video/:id` instead of opening
  a modal. The post-login "auto-open modal" behavior is removed; login lands on `/`.

## 4. UI

The dashboard reuses the existing card/list/folder UI with two additions:

- **Scope toggle:** `My Videos | All Videos`. Default: **All Videos** (the point of
  the feature). Selection persisted to `localStorage`.
- **Owner chip:** each card shows the owning user (name/avatar). For AWS videos the
  owner is "whoever loaded the link first" — shown honestly (owner name, or a
  "Pipeline" badge) rather than implying authorship.
- **Video-type badges:** existing `dual` badge for comparisons; add an AWS/pipeline badge.
- **Label filter:** filter visible videos by label(s), drawing from the labels present
  across *all* visible videos (see §5).
- Existing annotation-count / comment-count badges are kept.

Folders remain owner-scoped and are only meaningful in `My Videos` scope. In
`All Videos` scope the folder sidebar is hidden (folders are a personal organization
layer, not shared).

## 5. Data layer

### 5.1 Fetching projects by scope

Add `ProjectService.getAllProjects({ scope, filters, page })` alongside the existing
`getUserProjects(userId)`:

- `scope: 'mine' | 'all'`.
  - `'mine'` → `VideoService.getUserVideos(userId)` /
    `ComparisonVideoService.getUserComparisonVideos(userId)` unchanged
    (keep `.eq('ownerId'|'userId', …)`).
  - `'all'` → parallel variants that **drop the owner filter**, ordered by
    `createdAt desc`, paginated (existing 20/page).
- Result shape stays the unified `Project` (`projectType: 'single' | 'dual'`), so
  `ProjectCard` / `ProjectListItem` render unchanged.

### 5.2 Owner enrichment

The shared view must show whose video each is. Enrich results with the `users` table
(`fullName`, `email`, `avatarUrl`) via a single batched lookup keyed by the set of
owner IDs on the page (not per-row). Add an `owner` field to the `Project` view model.

### 5.3 AWS/pipeline videos

No dedup work needed: `findVideoByOutputVideoId` already looks up **globally** by
`videoId = 'aws:{outputVideoId}'` (no owner filter, `maybeSingle`), so there is exactly
**one row per pipeline output**; the first loader owns it and everyone reuses it.
They appear in the shared list like any other video, flagged with a badge, and use the
existing presigned-URL refresh when opened.

### 5.4 Counts (performance)

`ProjectService.getProjectCounts` currently issues **per-project** annotation/comment
count queries (N+1). Fine for one user's list; unacceptable across all users. Replace
with **grouped aggregate queries** — one query returning annotation counts keyed by
`videoId`/`comparisonVideoId`, one for comment counts — scoped to the visible page's IDs.
Pagination bounds the working set.

### 5.5 Label filtering across users

`LabelService.getLabels(userId, projectId)` returns "defaults + the user's own labels",
which is wrong for a cross-user filter. Add a fetch for the **distinct set of labels
actually attached to the visible videos** (join through `annotation_labels`), so the
filter offers labels that exist in the shared library regardless of who created them.

## 6. Backend access control — RESOLVED (Branch A) + pre-existing security hole

**Empirical finding (2026-07-02).** Probed the live Supabase REST API with the public
`anon` key, unauthenticated, using non-destructive count-only reads and zero-row-match
writes:

- **Reads are fully open.** anon `SELECT count` returned all rows on every table
  tested: `videos` 33, `annotations` 98, `labels` 7, `annotation_comments` 14
  (`HTTP 200`, `content-range: 0-0/N`). No login required.
- **Writes are ungated.** anon `PATCH` and `DELETE` on `videos` (filtered to a
  non-existent id, so zero rows changed) returned `HTTP 204`, not `401/403`. Because
  Postgres requires table-level `UPDATE`/`DELETE` privilege to execute at all, a `204`
  (rather than "permission denied") means the **anon role holds write/delete grants and
  RLS is not restricting them**.

**Conclusion:** the database currently has **no effective access control**. The `anon`
key — which ships publicly in the frontend bundle — can read, modify, and delete any
user's data. This is a **pre-existing vulnerability**, independent of this feature.

**Implication for this feature — Branch A confirmed:**

- The **read side** ("all videos" for any user) needs **zero backend change** — the
  data is already globally readable. We simply drop the client `ownerId` filter.
- The **access model** (everyone view + annotate; only owners delete/rename) is
  currently **unenforceable** and must be made real with RLS. This is now in-scope
  because the feature deliberately exposes the list of everyone's videos in the UI,
  turning the latent hole into an obvious one.

**Required policy set (to add):**

1. Enable RLS on `videos`, `comparison_videos`, `annotations`, `annotation_labels`,
   `annotation_comments`, `labels`, `folders`, `project_folders`.
2. `SELECT`: allow authenticated users to read all rows (matches the shared-library
   goal). Keep public/anon read only where the share-link flow needs it
   (`videos.isPublic = true`), or gate anon behind the existing share checks.
3. `INSERT`/`UPDATE` on `annotations`, `annotation_labels`, `annotation_comments`,
   `labels`: allow any authenticated user (collaboration), with row author recorded.
4. `UPDATE`/`DELETE` on `videos`, `comparison_videos`, `folders`, `project_folders`:
   **restricted to the owner** (`ownerId`/`userId`/`owner_id` = caller identity).
5. Revoke the anon role's write grants; scope anon strictly to the share-link read path.

**Identity caveat (must be validated during implementation):** ownership IDs are
**Keycloak** UUIDs (post-migration). Supabase's `auth.uid()` reflects the JWT `sub` the
Supabase client presents — which after the Keycloak migration may **not** equal the
stored `ownerId`. Before writing owner-gated policies we must confirm what identity claim
the client's JWT actually carries and key the policies on that (a custom claim, a mapping
table, or a Netlify service-role write layer if the JWT can't be matched directly).
This validation is the first task of the backend phase.

**Severity note:** because the current state is exploitable today, the backend hardening
(steps 1–5) should land **with or before** the read side ships — the design must not
merely surface the existing hole more prominently without closing it.

## 7. Files touched (anticipated)

**New**
- `src/views/EditorView.vue` — extracted current annotation workspace.
- (Router) new `/video/:id` route + updated guard/redirects.
- `supabase/policies/*.sql` (or documented dashboard policies) — the §6 policy set.

**Rewritten / relocated**
- `src/views/DashboardView.vue` — becomes the library landing page.
- Presentation components lifted from `ProjectManagementModal.vue`
  (`ProjectCard`, `ProjectListItem`, `FolderTree`, search/toggle/pagination).

**Modified**
- `src/services/projectService.ts` — `getAllProjects`, batched counts, owner enrichment.
- `src/services/videoService.ts` / `comparisonVideoService.ts` — scope-aware
  (owner-filter-optional) list queries.
- `src/services/labelService.ts` — cross-user label set for filtering.
- `src/router/index.ts` — routes, guard, shared-link/AWS redirects into `/video/:id`.

**Retired**
- `src/components/ProjectManagementModal.vue` and its modal wiring in `DashboardModals`.

## 8. Risks

- **Security (highest):** if we ship the read side without the §6 write policies, we
  expose a bulk-delete-anything surface. §6 must land with (or before) the read side.
- **Performance:** unbounded "all videos" list — mitigated by pagination + batched counts.
- **Owner semantics for AWS videos** are inherently weak ("first loader"); the UI must
  not overstate authorship.
