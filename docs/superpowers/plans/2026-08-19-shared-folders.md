# Shared Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn folders from per-user private collections into one shared workspace that every
Keycloak-authenticated user can see and edit, and close the anonymous read/write hole on
`folders` and `project_folders` at the same time.

**Architecture:** The client-side `owner_id` filter in `FolderService` is the only thing that
scopes folders today; removing it is the whole feature. Enforcement moves to the database,
where RLS is switched on for the first time and the existing (inert) owner-gated policies are
replaced with flat policies scoped `TO authenticated`. `owner_id` survives as attribution and
is filtered on nowhere.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Supabase (PostgREST + RLS), Vitest,
Tailwind. Migrations are plain SQL files applied by hand through the Supabase SQL editor.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-shared-folders-design.md`. Read it first.
- **Task 1 (the migration) must be applied to the database before the client changes from
  Tasks 2-5 are deployed.** The new policies are strictly more permissive than what the
  current client asks for, so the unmodified app keeps working the moment the migration lands.
  The reverse order puts owner-gated policies in force while the client requests everyone's
  folders. Deploys here are manual and not atomic.
- `owner_id` is attribution only. No query anywhere may filter on it after this change.
- No em dashes in prose, code comments, or commit messages. Use a plain dash.
- Run the full suite with `npm test` (`vitest run`). Test files live in `__tests__/`
  directories beside their subject and are named `*.test.ts`.
- Tests needing `localStorage` must carry a `/** @vitest-environment jsdom */` docblock; the
  Vitest default environment for this repo is `node`.

---

### Task 1: RLS migration

**Files:**
- Create: `migrations/20260819_shared_folders.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `folders` and `project_folders` become readable and writable by role
  `authenticated` only, with no owner scoping. Tasks 2-5 depend on this being applied.

**Background the implementer needs:** RLS is currently **disabled** on both tables. Each
already carries four owner-gated policies, but they have never been in effect, so there is no
working behaviour to preserve. That is why they are dropped outright rather than kept as an
OR'd fallback the way `migrations/20260817_open_annotations_to_all_users.sql` did. The
replacement policies are flat `true` and reference no other table, which deliberately avoids
the hazard called out in that migration's comments: RLS applies to tables named inside a
policy expression, and the old `project_folders` policies reached into `videos`.

- [ ] **Step 1: Write the migration**

```sql
-- Folders become a single shared workspace (2026-08-19)
--
-- Until now folders were per-user, but only in the client: FolderService applied
-- `.eq('owner_id', userId)` and nothing else scoped them. RLS was never switched
-- on for either table, so `folders` and `project_folders` were readable AND
-- writable by anyone holding the anon key, which ships in the client bundle.
--
-- Both tables already carry four owner-gated policies apiece. They have never
-- been in effect. `migrations/20260817_open_annotations_to_all_users.sql` kept
-- its superseded policies as an OR'd fallback, but that precedent does not apply
-- here: there is no working behaviour to fall back to, so these are dropped.
--
-- The product decision is that folders are one shared tree. Any signed-in user
-- sees every folder and may create, rename, delete and reparent any of them, and
-- file any video into any of them. `owner_id` is retained as attribution and is
-- filtered on nowhere.
--
-- Scoping every policy TO authenticated (the old ones were TO public, which
-- includes anon) is what closes the anonymous hole. Verified safe: the only path
-- to either table is FolderService -> useDashboardFolders -> DashboardView, which
-- requires a session. No anonymous share-link path resolves folder membership.
--
-- The replacement policies are flat `true` and reference no other table. That is
-- deliberate, not laziness: RLS applies to tables named inside a policy
-- expression, which is why the old project_folders policies had to reach into
-- `videos` with EXISTS subqueries. These do not, so the hazard disappears.
--
-- Design: docs/superpowers/specs/2026-08-19-shared-folders-design.md

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can create their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;

DROP POLICY IF EXISTS "Users can view project-folder associations for their projects" ON public.project_folders;
DROP POLICY IF EXISTS "Users can create project-folder associations for their projects" ON public.project_folders;
DROP POLICY IF EXISTS "Users can update project-folder associations for their projects" ON public.project_folders;
DROP POLICY IF EXISTS "Users can delete project-folder associations for their projects" ON public.project_folders;

-- folders

DROP POLICY IF EXISTS "Signed-in users can view all folders" ON public.folders;
CREATE POLICY "Signed-in users can view all folders" ON public.folders
  FOR SELECT TO authenticated
  USING (true);

-- The only non-trivial check in the migration. It does not gate anything: it
-- keeps a folder's attribution honest by stopping a client from claiming the row
-- was created by somebody else.
DROP POLICY IF EXISTS "Signed-in users can create folders" ON public.folders;
CREATE POLICY "Signed-in users can create folders" ON public.folders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- USING and WITH CHECK are both spelled out rather than letting Postgres default
-- the check to the USING expression. owner_id therefore stays rewritable by
-- anyone, which is acceptable because it carries no authority.
DROP POLICY IF EXISTS "Signed-in users can update any folder" ON public.folders;
CREATE POLICY "Signed-in users can update any folder" ON public.folders
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Signed-in users can delete any folder" ON public.folders;
CREATE POLICY "Signed-in users can delete any folder" ON public.folders
  FOR DELETE TO authenticated
  USING (true);

-- project_folders

DROP POLICY IF EXISTS "Signed-in users can view all folder contents" ON public.project_folders;
CREATE POLICY "Signed-in users can view all folder contents" ON public.project_folders
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Signed-in users can file any video into any folder" ON public.project_folders;
CREATE POLICY "Signed-in users can file any video into any folder" ON public.project_folders
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Signed-in users can update any folder filing" ON public.project_folders;
CREATE POLICY "Signed-in users can update any folder filing" ON public.project_folders
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Signed-in users can unfile any video" ON public.project_folders;
CREATE POLICY "Signed-in users can unfile any video" ON public.project_folders
  FOR DELETE TO authenticated
  USING (true);

-- Rollback. Restores the exact pre-change state: RLS off, plus the eight policies
-- captured verbatim from pg_policies on 2026-08-19 before the drop.
--
-- DROP POLICY IF EXISTS "Signed-in users can view all folders" ON public.folders;
-- DROP POLICY IF EXISTS "Signed-in users can create folders" ON public.folders;
-- DROP POLICY IF EXISTS "Signed-in users can update any folder" ON public.folders;
-- DROP POLICY IF EXISTS "Signed-in users can delete any folder" ON public.folders;
-- DROP POLICY IF EXISTS "Signed-in users can view all folder contents" ON public.project_folders;
-- DROP POLICY IF EXISTS "Signed-in users can file any video into any folder" ON public.project_folders;
-- DROP POLICY IF EXISTS "Signed-in users can update any folder filing" ON public.project_folders;
-- DROP POLICY IF EXISTS "Signed-in users can unfile any video" ON public.project_folders;
--
-- ALTER TABLE public.folders DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.project_folders DISABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Users can view their own folders" ON public.folders
--   FOR SELECT TO public USING (auth.uid() = owner_id);
-- CREATE POLICY "Users can create their own folders" ON public.folders
--   FOR INSERT TO public WITH CHECK (auth.uid() = owner_id);
-- CREATE POLICY "Users can update their own folders" ON public.folders
--   FOR UPDATE TO public USING (auth.uid() = owner_id);
-- CREATE POLICY "Users can delete their own folders" ON public.folders
--   FOR DELETE TO public USING (auth.uid() = owner_id);
--
-- CREATE POLICY "Users can view project-folder associations for their projects" ON public.project_folders
--   FOR SELECT TO public USING (EXISTS (
--     SELECT 1 FROM videos
--      WHERE videos.id = project_folders.project_id AND videos."ownerId" = auth.uid()));
-- CREATE POLICY "Users can create project-folder associations for their projects" ON public.project_folders
--   FOR INSERT TO public WITH CHECK (
--     EXISTS (SELECT 1 FROM videos
--              WHERE videos.id = project_folders.project_id AND videos."ownerId" = auth.uid())
--     AND EXISTS (SELECT 1 FROM folders
--                  WHERE folders.id = project_folders.folder_id AND folders.owner_id = auth.uid()));
-- CREATE POLICY "Users can update project-folder associations for their projects" ON public.project_folders
--   FOR UPDATE TO public USING (EXISTS (
--     SELECT 1 FROM videos
--      WHERE videos.id = project_folders.project_id AND videos."ownerId" = auth.uid()));
-- CREATE POLICY "Users can delete project-folder associations for their projects" ON public.project_folders
--   FOR DELETE TO public USING (EXISTS (
--     SELECT 1 FROM videos
--      WHERE videos.id = project_folders.project_id AND videos."ownerId" = auth.uid()));
```

- [ ] **Step 2: Commit the migration**

```bash
git add migrations/20260819_shared_folders.sql
git commit -m "feat: enable RLS on folders and project_folders as a shared workspace"
```

- [ ] **Step 3: Hand the migration to the user to apply**

Do not attempt to apply it yourself. Ask the user to paste the file into the Supabase SQL
editor and run it, then report back. Tell them explicitly that this is the change that starts
enforcing access on these two tables for the first time, and that the client changes must not
be deployed before it lands.

- [ ] **Step 4: Verify the anonymous hole is closed**

This probe is read-only and needs only the anon key already in `.env`. Both commands must
print `[]`. Before the migration they print rows.

```bash
set -a; . ./.env; set +a
for t in folders project_folders; do
  printf "%s: " "$t"
  curl -s "$VITE_SUPABASE_URL/rest/v1/$t?select=*&limit=3" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
  echo
done
```

Expected: `[]` twice. If rows still come back, RLS did not enable; stop and report.

`select=*` is deliberate: `folders` has no `folder_id` column, so a per-column select returns a
42703 error rather than an empty array, and PostgREST raises that before RLS is ever consulted.
An error is not evidence either way; only `[]` is.

- [ ] **Step 5: Verify RLS shows as enabled**

Ask the user to reload Supabase dashboard -> Authentication -> Policies. Both tables must now
offer a **Disable RLS** button and must no longer carry the banner "This table can be accessed
by anyone via the Data API as RLS is disabled." Each must list exactly four policies, all
applied to `authenticated`.

---

### Task 2: Drop owner scoping from FolderService

**Files:**
- Modify: `src/services/folderService.ts` (`getUserFolders`, `getFolderWithContents`, `searchFolders`)
- Modify: `src/composables/useDashboardFolders.ts:23` (the one call site)
- Create: `src/services/__tests__/getAllFolders.test.ts`

**Interfaces:**
- Consumes: Task 1's policies.
- Produces:
  - `FolderService.getAllFolders(): Promise<Folder[]>` replacing
    `getUserFolders(userId: string)`. Its single call site in
    `useDashboardFolders.loadFolders` is updated in this same task, so no commit here
    leaves the app calling a method that does not exist.
  - `FolderService.getFolderWithContents(folderId: string): Promise<FolderWithContents>` (the
    `userId` parameter is removed).
  - `FolderService.searchFolders(searchTerm: string): Promise<Folder[]>` (the `userId`
    parameter is removed).

`getFolderWithContents` and `searchFolders` have no callers. They are still updated, because
leaving a second contradictory scoping rule in the file is exactly the trap this change
exists to remove. Their now-unused `userId` parameters go with the filters.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/getAllFolders.test.ts`. Note the shape: this repo's service
tests stub the Supabase query builder as a self-returning chain object and assert on which
builder methods were called. `folderProjects.test.ts` is the existing example.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const row = (id: string, ownerId: string) => ({
  id,
  name: id,
  parent_id: null,
  owner_id: ownerId,
  color: null,
  icon: null,
  sort_order: 0,
  created_at: '2026-08-19T00:00:00Z',
  updated_at: '2026-08-19T00:00:00Z',
});

const foldersChain: Record<string, ReturnType<typeof vi.fn>> = {
  select: vi.fn(() => foldersChain),
  eq: vi.fn(() => foldersChain),
  order: vi.fn(() =>
    Promise.resolve({ data: [row('f1', 'u1'), row('f2', 'u2')], error: null })
  ),
};
const fromMock = vi.fn(() => foldersChain);
vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (t: string) => fromMock(t) },
}));

beforeEach(() => {
  fromMock.mockClear();
  foldersChain.select.mockClear();
  foldersChain.eq.mockClear();
  foldersChain.order.mockClear();
});

describe('FolderService.getAllFolders', () => {
  it('returns folders from every owner', async () => {
    const { FolderService } = await import('@/services/folderService');
    const folders = await FolderService.getAllFolders();
    expect(fromMock).toHaveBeenCalledWith('folders');
    expect(folders.map((f) => f.ownerId)).toEqual(['u1', 'u2']);
  });

  it('never filters by owner_id', async () => {
    const { FolderService } = await import('@/services/folderService');
    await FolderService.getAllFolders();
    // owner_id is attribution only. Any .eq() here would re-privatise the tree.
    expect(foldersChain.eq).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/__tests__/getAllFolders.test.ts`
Expected: FAIL, `FolderService.getAllFolders is not a function`.

- [ ] **Step 3: Replace `getUserFolders` with `getAllFolders`**

In `src/services/folderService.ts`, replace the whole `getUserFolders` method with:

```ts
  /**
   * Get every folder in the workspace.
   *
   * Folders are one shared tree: any signed-in user sees and may edit all of
   * them. `owner_id` is retained as attribution and is deliberately not filtered
   * on. Access is enforced in the database by the `authenticated`-scoped policies
   * in migrations/20260819_shared_folders.sql, not here.
   */
  static async getAllFolders(): Promise<Folder[]> {
    try {
      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return (data || []).map(this.mapDatabaseToFolder);
    } catch (error) {
      console.error('❌ [FolderService] Error loading folders:', error);
      throw error;
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/__tests__/getAllFolders.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Drop the owner filter from `getFolderWithContents`**

Change the signature and remove both `.eq('owner_id', userId)` calls and the `userId` argument
in the recursive call. The method becomes:

```ts
  static async getFolderWithContents(
    folderId: string
  ): Promise<FolderWithContents> {
    try {
      // Get the folder
      const { data: folderData, error: folderError } = await supabase
        .from('folders')
        .select('*')
        .eq('id', folderId)
        .single();

      if (folderError) throw folderError;

      // Get subfolders
      const { data: subfolders, error: subfoldersError } = await supabase
        .from('folders')
        .select('*')
        .eq('parent_id', folderId)
        .order('sort_order', { ascending: true });

      if (subfoldersError) throw subfoldersError;

      // Get project count for this folder
      const { count: projectCount, error: countError } = await supabase
        .from('project_folders')
        .select('*', { count: 'exact', head: true })
        .eq('folder_id', folderId);

      if (countError) throw countError;

      // Recursively get contents for subfolders
      const subfoldersWithContents = await Promise.all(
        (subfolders || []).map((subfolder) =>
          this.getFolderWithContents(subfolder.id)
        )
      );

      // Calculate total project count (including nested folders)
      const totalProjectCount =
        (projectCount || 0) +
        subfoldersWithContents.reduce(
          (sum, subfolder) => sum + subfolder.totalProjectCount,
          0
        );

      return {
        ...this.mapDatabaseToFolder(folderData),
        subfolders: subfoldersWithContents,
        projectCount: projectCount || 0,
        totalProjectCount,
      };
    } catch (error) {
      console.error('❌ [FolderService] Error loading folder contents:', error);
      throw error;
    }
  }
```

- [ ] **Step 6: Drop the owner filter from `searchFolders`**

```ts
  static async searchFolders(searchTerm: string): Promise<Folder[]> {
    try {
      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .ilike('name', `%${searchTerm}%`)
        .order('name', { ascending: true });

      if (error) throw error;

      return (data || []).map(this.mapDatabaseToFolder);
    } catch (error) {
      console.error('❌ [FolderService] Error searching folders:', error);
      throw error;
    }
  }
```

- [ ] **Step 7: Update the one call site**

In `src/composables/useDashboardFolders.ts`, inside `loadFolders`, change:

```ts
      folders.value = await FolderService.getUserFolders(uid);
```

to:

```ts
      folders.value = await FolderService.getAllFolders();
```

`uid` is still read above and the `if (!uid) return` guard stays: reads now require a session,
so firing the query without one would only produce an empty tree.

- [ ] **Step 8: Confirm nothing still calls the old names**

```bash
grep -rn "getUserFolders" src
```

Expected: no output. `getFolderWithContents` and `searchFolders` should also show no callers
outside `folderService.ts` itself.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS. `src/composables/__tests__/useDashboardFolders.test.ts` still passes because
it only exercises `filterByFolder`, which does not touch `FolderService`.

- [ ] **Step 10: Commit**

```bash
git add src/services/folderService.ts src/services/__tests__/getAllFolders.test.ts src/composables/useDashboardFolders.ts
git commit -m "feat: load every folder instead of only the current user's"
```

---

### Task 3: Reconcile a stale folder selection

**Files:**
- Modify: `src/composables/useDashboardFolders.ts`
- Modify: `src/composables/__tests__/useDashboardFolders.test.ts`

**Interfaces:**
- Consumes: `FolderService.getAllFolders()` from Task 2.
- Produces: `loadFolders()` now resets, on success only, `currentFolderId` to `null` when the
  stored id names no loaded folder. The switch to `getAllFolders()` already happened in Task 2.
- Produces: a `folder(id)` test helper in `useDashboardFolders.test.ts` that Task 4 reuses.

**Why this is needed:** `currentFolderId` is restored from `localStorage` on construction but
has never been checked against the folders that actually loaded. In a shared workspace another
user deleting the folder you had selected is routine, and the result today is an empty grid
with nothing highlighted in the sidebar and no explanation. Resetting to `null` is enough on
its own: `DashboardView` already runs `watch(dashFolders.currentFolderId, () => loadData())`,
so the unfiltered list reloads with no extra wiring.

**Reconcile on success only.** A failed load leaves `folders` empty, and reconciling against
an empty list would throw away the user's selection on any transient network blip.

- [ ] **Step 1: Replace the mock at the top of the existing test file**

`src/composables/__tests__/useDashboardFolders.test.ts` currently stubs
`FolderService` as `{}`. Replace that single `vi.mock` line with the block below, leaving the
two existing `filterByFolder` tests untouched. The factory reaches the outer `vi.fn()`s
lazily through arrow functions, which is what makes this safe under `vi.mock` hoisting.

```ts
const getAllFolders = vi.fn();
const buildFolderTree = vi.fn(() => []);
vi.mock('@/services/folderService', () => ({
  FolderService: {
    getAllFolders: (...args: unknown[]) => getAllFolders(...args),
    buildFolderTree: (...args: unknown[]) => buildFolderTree(...args),
  },
}));
```

Add `beforeEach` to the imports from `vitest` on line 6.

- [ ] **Step 2: Write the failing tests**

Append to `src/composables/__tests__/useDashboardFolders.test.ts`:

```ts
const folder = (id: string) => ({
  id,
  name: id,
  parentId: null,
  ownerId: 'u1',
  sortOrder: 0,
  createdAt: '2026-08-19T00:00:00Z',
  updatedAt: '2026-08-19T00:00:00Z',
});

describe('useDashboardFolders.loadFolders - stale selection', () => {
  beforeEach(() => {
    localStorage.clear();
    getAllFolders.mockReset();
    buildFolderTree.mockReset();
    buildFolderTree.mockReturnValue([]);
  });

  it('forgets a stored folder id that no longer exists', async () => {
    localStorage.setItem('dashboardFolderId', 'gone');
    getAllFolders.mockResolvedValue([folder('f1')]);
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');
    expect(f.currentFolderId.value).toBe('gone');

    await f.loadFolders();

    expect(f.currentFolderId.value).toBeNull();
    expect(localStorage.getItem('dashboardFolderId')).toBeNull();
  });

  it('keeps a stored folder id that still exists', async () => {
    localStorage.setItem('dashboardFolderId', 'f1');
    getAllFolders.mockResolvedValue([folder('f1')]);
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');

    await f.loadFolders();

    expect(f.currentFolderId.value).toBe('f1');
    expect(localStorage.getItem('dashboardFolderId')).toBe('f1');
  });

  it('keeps the selection when the load fails, rather than reconciling against nothing', async () => {
    localStorage.setItem('dashboardFolderId', 'f1');
    getAllFolders.mockRejectedValue(new Error('permission denied for table folders'));
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');

    await f.loadFolders();

    expect(f.currentFolderId.value).toBe('f1');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/composables/__tests__/useDashboardFolders.test.ts`
Expected: the first test FAILS with `expected 'gone' to be null`. The second and third pass
already (they assert current behaviour), which is fine.

- [ ] **Step 4: Implement**

In `src/composables/useDashboardFolders.ts`, replace `loadFolders` and add `reconcileSelection`
directly beneath it:

```ts
  async function loadFolders() {
    const uid = getUserId();
    if (!uid) return;
    try {
      folders.value = await FolderService.getAllFolders();
      folderTree.value = FolderService.buildFolderTree(folders.value);
      reconcileSelection();
    } catch (err) {
      // Missing folders table etc. - degrade to no folders, never hard-fail.
      console.warn('[useDashboardFolders] loadFolders failed', err);
      folders.value = [];
      folderTree.value = [];
    }
  }

  // A folder id restored from localStorage can name a folder that no longer
  // exists; in a shared workspace another user deleting it is routine. Left
  // alone it filters the grid down to nothing with no folder highlighted, which
  // reads as a broken dashboard. Falling back to "All Projects" is enough on its
  // own: DashboardView watches currentFolderId and reloads on the change.
  //
  // Only called after a successful load. Reconciling against the empty list left
  // behind by a failed one would discard the selection on any transient blip.
  function reconcileSelection() {
    const id = currentFolderId.value;
    if (id === null) return;
    if (!folders.value.some((f) => f.id === id)) {
      currentFolderId.value = null;
      persist();
    }
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/useDashboardFolders.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/composables/useDashboardFolders.ts src/composables/__tests__/useDashboardFolders.test.ts
git commit -m "fix: forget a selected folder that no longer exists"
```

---

### Task 4: Surface folder load failures

**Files:**
- Modify: `src/composables/useDashboardFolders.ts`
- Modify: `src/views/DashboardView.vue` (sidebar `<aside>`, around line 353-371)
- Modify: `src/composables/__tests__/useDashboardFolders.test.ts`

**Interfaces:**
- Consumes: `loadFolders` from Task 3, and the `folder(id)` helper Task 3 added to
  `useDashboardFolders.test.ts`. Task 4's tests are appended below Task 3's in that same file.
- Produces: `foldersError: Ref<string | null>` on the object returned by
  `useDashboardFolders`, consumed by `DashboardView`'s template.

**Why:** `loadFolders` currently swallows every failure into an empty tree plus a
`console.warn`. After Task 1 a misapplied policy would look exactly like "you have no
folders", which is the one failure mode this change is capable of introducing.

- [ ] **Step 1: Write the failing tests**

Append to `src/composables/__tests__/useDashboardFolders.test.ts`:

```ts
describe('useDashboardFolders.loadFolders - error reporting', () => {
  beforeEach(() => {
    localStorage.clear();
    getAllFolders.mockReset();
    buildFolderTree.mockReset();
    buildFolderTree.mockReturnValue([]);
  });

  it('exposes the failure instead of silently showing an empty tree', async () => {
    getAllFolders.mockRejectedValue(new Error('permission denied for table folders'));
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');

    await f.loadFolders();

    expect(f.foldersError.value).toBe('permission denied for table folders');
    expect(f.folders.value).toEqual([]);
  });

  it('clears a previous error once a load succeeds', async () => {
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');

    getAllFolders.mockRejectedValue(new Error('boom'));
    await f.loadFolders();
    expect(f.foldersError.value).toBe('boom');

    getAllFolders.mockReset();
    getAllFolders.mockResolvedValue([folder('f1')]);
    await f.loadFolders();
    expect(f.foldersError.value).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/composables/__tests__/useDashboardFolders.test.ts`
Expected: FAIL, `Cannot read properties of undefined (reading 'value')` on `f.foldersError`.

- [ ] **Step 3: Add the ref and set it**

In `src/composables/useDashboardFolders.ts`, declare alongside the other refs:

```ts
  // Non-null when the last folder load failed. Rendered in the sidebar so an RLS
  // or network failure cannot masquerade as "you have no folders".
  const foldersError: Ref<string | null> = ref(null);
```

Then update `loadFolders`:

```ts
  async function loadFolders() {
    const uid = getUserId();
    if (!uid) return;
    try {
      folders.value = await FolderService.getAllFolders();
      folderTree.value = FolderService.buildFolderTree(folders.value);
      foldersError.value = null;
      reconcileSelection();
    } catch (err) {
      console.warn('[useDashboardFolders] loadFolders failed', err);
      folders.value = [];
      folderTree.value = [];
      foldersError.value = err instanceof Error ? err.message : String(err);
    }
  }
```

Add `foldersError` to the returned object, next to `folders`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/useDashboardFolders.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Render it in the sidebar**

In `src/views/DashboardView.vue`, immediately after the closing `/>` of the `<FolderTree>`
element and before `</aside>`, add:

```html
          <p
            v-if="dashFolders.foldersError.value"
            class="mt-3 text-[11px] leading-relaxed text-red-600 dark:text-red-400"
          >
            Could not load folders: {{ dashFolders.foldersError.value }}
          </p>
```

`text-[11px] text-red-600 dark:text-red-400` is this codebase's established inline-error
style; do not invent a new one.

- [ ] **Step 6: Verify it renders**

Run `npm run dev`, open the dashboard, and in the browser console force a failure to confirm
the message appears in the sidebar and the tree is empty behind it. Then reload and confirm
the message is gone and folders are listed. Check both light and dark theme.

- [ ] **Step 7: Commit**

```bash
git add src/composables/useDashboardFolders.ts src/composables/__tests__/useDashboardFolders.test.ts src/views/DashboardView.vue
git commit -m "fix: show folder load failures instead of an empty tree"
```

---

### Task 5: Correct the RLS error message

**Files:**
- Modify: `src/views/DashboardView.vue:311-317` (`folderErrorMessage`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Copy fix only.

**Why:** the branch is unreachable today, because with RLS off no write returns 42501. Task 1
makes it reachable, on an expired session. Its main sentence is then correct. Its parenthetical
is not: it claims the local dev bypass cannot write to folders, but `applyDevAuthBypass` signs
in with real credentials (`src/composables/useAuth.ts:39`), so it can and always could. Keep
the branch, drop the false claim.

- [ ] **Step 1: Edit the message**

Replace the returned string:

```ts
function folderErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/row-level security|violates row-level/i.test(msg)) {
    // Reachable once folders enforce RLS: an expired session drops the caller to
    // the `anon` role, which the authenticated-scoped policies exclude.
    return 'Your session has expired. Sign in again to organize folders.';
  }
  return msg;
}
```

- [ ] **Step 2: Verify nothing else asserts the old copy**

```bash
grep -rn "dev bypass cannot write" src
```

Expected: no output.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "fix: correct the folder RLS error message"
```

---

### Task 6: End-to-end verification

**Files:** none. Verification only.

**Interfaces:**
- Consumes: everything above, with Task 1 applied to the database.

Do not report the feature working on unit tests alone. Every check below must be observed.

- [ ] **Step 1: Confirm the anonymous path is closed**

```bash
set -a; . ./.env; set +a
for t in folders project_folders; do
  printf "%s: " "$t"
  curl -s "$VITE_SUPABASE_URL/rest/v1/$t?select=*&limit=3" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
  echo
done
```

Expected: `[]` twice.

- [ ] **Step 2: Two-account walkthrough**

Run `npm run dev`. This needs two real Keycloak accounts, so use two browser profiles or one
normal plus one private window. The dev bypass signs in as a single fixed account, so it
cannot stand in for the second user.

As account A:
1. Create a folder named `Shared check`.
2. Drag one of A's videos onto it. Confirm the video appears when the folder is selected.

As account B, in the second profile:
3. Confirm `Shared check` appears in B's sidebar. This is the feature.
4. Select it and confirm A's video is listed.
5. Drag one of B's own videos onto `Shared check`.
6. Rename `Shared check` to `Renamed by B`.

Back as account A:
7. Reload. Confirm the folder now reads `Renamed by B` and holds both videos.

- [ ] **Step 3: Stale selection recovery**

With account A sitting on `Renamed by B` selected, delete that folder as account B, then
reload A's dashboard. Expected: A lands on "All Projects" with the full video list, not an
empty grid. `localStorage.dashboardFolderId` should be gone.

- [ ] **Step 4: Pixel check on the sidebar**

Confirm the folder tree is unchanged visually from before this work, in both light and dark
theme, at a narrow viewport as well as wide. Nothing in this change should move a pixel except
the error message, which should only be present when there is an error.

- [ ] **Step 5: Full suite and typecheck**

```bash
npm test
npx vue-tsc --noEmit
```

Both must pass. `vue-tsc` is already a devDependency, so no install is needed.

- [ ] **Step 6: Report**

State plainly which of steps 1-5 were observed and which were not. If the two-account
walkthrough could not be run for want of a second Keycloak account, say so explicitly rather
than implying the feature was verified.
