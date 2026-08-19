# Shared Folders - Design

**Date:** 2026-08-19
**Status:** Approved.
**Supersedes:** the "folders are personal" position in
`2026-07-03-dashboard-folders-design.md` §2 and `2026-07-02-shared-video-dashboard-design.md` §4.

## 1. Goal

Folders become a **single shared workspace**. Every signed-in user sees every folder and
can create, rename, delete and reparent any of them, and file any video into any of them.
There is one folder tree for the whole app, not one per user.

This is option (a) of the two collaborative models considered. Per-folder membership with
invites (option (b)) was rejected as unnecessary for a single-tenant deployment.

## 2. Why the current behaviour is owner-scoped

Not because the database hides folders. `FolderService.getUserFolders()` applies
`.eq('owner_id', userId)`, and that client-side filter is the only thing scoping the tree.
`getFolderWithContents()` and `searchFolders()` carry the same filter but have no callers.

## 3. Discovered state of the database

Probed live on 2026-08-19 with the anon key.

- `GET /rest/v1/folders` as anon returns every row across every `owner_id`. Same for
  `project_folders`.
- Eight owner-scoped policies exist on the two tables (captured verbatim in the migration's
  rollback block). The `folders` SELECT policy is `auth.uid() = owner_id`, which returns zero
  rows for an anonymous caller.

Those two facts are only consistent with **RLS being disabled on both tables**, leaving all
eight policies inert. RLS is per-table rather than per-command, so writes are open too, but
that follows from the inference rather than from direct observation: the write probe was
blocked by tooling. **Open item: confirm `pg_tables.rowsecurity` is `false` for both tables
before applying the migration.**

Consequence either way: this change is a security improvement, not a relaxation. Today the
anon key, which ships in the client bundle, reads every folder in the deployment.

## 4. Data model

No schema change.

`folders.owner_id` stays and is still written on create, but demotes to **attribution only**.
Nothing filters on it. `project_folders` is untouched.

One shared tree makes single-folder membership coherent, so the existing "delete every
`project_folders` row for this project, then insert one" logic in `moveProjectToFolder`
becomes correct semantics rather than a cross-user clobber. No change is needed there.

## 5. Client changes

- `FolderService.getUserFolders(userId)` becomes `getAllFolders()`: drop the `owner_id`
  filter, keep the `sort_order` ordering.
- Drop the `owner_id` filter from `getFolderWithContents()` and `searchFolders()` as well.
  Both are dead code, but leaving a second, contradictory scoping rule in the file invites
  exactly the class of bug this spec exists to fix.
- `useDashboardFolders.loadFolders()` calls `getAllFolders()` with no uid, but keeps its
  `if (!uid) return` guard: a session is still required, because reads become
  `authenticated`-only.
- `createFolder` keeps passing uid as `owner_id`.
- Delete the unreachable `row-level security` branch of `DashboardView.folderErrorMessage()`.
  It can only fire on a 42501, which the new flat policies never produce.

Nothing else needs touching. `loadData` already switches to `scope: 'all'` when a folder is
selected, `VideoService.getAllVideos()` has no owner filter, and
`getProjectsInFolder(folderId)` was always owner-agnostic.

## 6. RLS migration

`migrations/20260819_shared_folders.sql`.

Enable RLS on `folders` and `project_folders`, drop all eight existing policies, and create
flat replacements scoped `TO authenticated`:

| table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `folders` | `true` | `auth.uid() = owner_id` | `true` | `true` |
| `project_folders` | `true` | `true` | `true` | `true` |

The INSERT check on `folders` keeps attribution honest without gating anything. Every
UPDATE policy spells out both `USING` and `WITH CHECK` explicitly rather than relying on
Postgres defaulting the check to the `USING` expression. `owner_id` therefore stays
rewritable by anyone, which is acceptable because it carries no authority.

The eight old policies are **dropped, not kept as an OR'd fallback**. The `20260817`
migration kept its superseded policies as a safety net, but that precedent does not apply
here: these policies have never been in effect, so there is no working behaviour to fall
back to.

The replacement policies are flat `true` and reference no other table. This deliberately
sidesteps the hazard called out in `20260817`, where RLS applies to tables named inside a
policy expression. The old `project_folders` policies reached into `videos.ownerId`; the new
ones do not need to.

Restricting SELECT to `authenticated` closes the anon read hole. Verified safe: the only path
to either table is `folderService.ts` -> `useDashboardFolders` -> `DashboardView`, which
requires a session. No anonymous share-link path resolves folder membership.

Rollback: `DISABLE ROW LEVEL SECURITY` on both tables plus the eight `CREATE POLICY`
statements reconstructed verbatim from the captured `pg_policies` output.

## 7. Deploy sequencing

**The migration goes first, then the client. They are not atomic; deploys here are manual.**

The new flat policies are strictly more permissive than what the unmodified client asks for,
so the current app keeps working the moment the migration lands. Shipping the client first
would put the old owner-scoped policies in force while the client requests everyone's
folders.

## 8. Bundled fixes

**Stale selected folder.** `currentFolderId` is restored from localStorage but never
reconciled against the loaded tree. Once folders are shared, another user deleting the folder
you had selected is routine, and the result is an empty grid with nothing highlighted. After
`loadFolders` resolves, reset `currentFolderId` to `null` and clear the localStorage key when
the id is absent from the loaded set. The existing `watch(currentFolderId)` then fires
`loadData` on its own, so the grid recovers with no extra wiring.

**Swallowed load errors.** `loadFolders` catches everything into an empty tree with a
`console.warn`, so a botched RLS rollout would be indistinguishable from "you have no
folders". Add a `foldersError` ref, set it in the catch, and render it in the sidebar.

## 9. Non-goals

- No realtime. Another user's new folder appears on your next load, not live.
- No per-folder permissions, membership or invites.
- No creator attribution in the folder sidebar.
- No folder-reparenting UI, so `moveFolder` and its missing descendant/cycle guard stay dead.
- No removal of the other unused `FolderService` methods or of `MoveProjectsDialog.vue` /
  `MoveDialogFolderItem.vue`.

## 10. Testing

Unit:
- `getAllFolders` issues no `owner_id` filter.
- Stale `currentFolderId` is reset to `null` when absent from the loaded folders.
- A failing `loadFolders` sets `foldersError` rather than silently emptying the tree.

End to end, against the dev app with two real accounts:
- A folder created by account A appears in account B's sidebar.
- B can rename and delete A's folder.
- B can file a video A owns into a folder A created, and A sees it there.
- Anon (no session) can no longer read `folders` or `project_folders` over REST.

## 11. Known issues left open

Reported and deliberately not fixed here:

- `moveFolder()` has no descendant check, so reparenting a folder under its own child would
  make `buildFolderTree` drop the subtree and `getAllSubfolders` recurse forever. Dead code.
- `getProjectsInFolder(null, uid)` excludes videos filed in any folder, with no owner scoping.
  Unreachable, because `refreshFolderContents` early-returns on a null folder, but it has a
  test and so reads as live.
- `2026-07-03-dashboard-folders-design.md` §6 promises a per-card "Add to folder" menu that
  was never built. Only drag-drop exists.
