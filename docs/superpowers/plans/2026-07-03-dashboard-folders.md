# Dashboard Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the folder create / file / filter flow onto the new library `DashboardView`, reusing the existing `FolderService` and folder components, with folders as cross-owner personal collections.

**Architecture:** A new `useDashboardFolders` composable owns all folder state (tree, selection, membership) and `FolderService` calls; `DashboardView` renders the existing `FolderTree` in a left sidebar and composes a folder filter into its project list. Selecting a folder loads the full (`scope: 'all'`) project set and restricts to the folder's member ids (cross-owner); with no folder selected the existing scope toggle governs. Filing is drag-drop onto the tree plus a per-card "Add to folder" action.

**Tech Stack:** Vue 3 (`<script setup>`), Pinia, Vue Router 4, Supabase JS v2, Tailwind v4, Vite 7, TypeScript, Vitest.

## Global Constraints

- Supabase client is the singleton from `@/composables/useSupabase`; never construct a new one.
- Folder tables use **snake_case** columns: `folders.owner_id`/`parent_id`/`sort_order`, `project_folders.project_id`/`folder_id`. The `videos` table uses **camelCase** `ownerId`. Copy these exactly.
- Current user id comes from `useAuth()` → `user.value.id` (module singleton; no Pinia auth store).
- The `Project` view model (`src/types/project.ts`) is used as-is; a project's `id` equals its video id (single) or comparison id (dual). `project_folders.project_id` holds that same id.
- Reuse existing components unchanged: `FolderTree`, `FolderTreeItem`, `NewFolderDialog`, `MoveProjectsDialog`, `MoveDialogFolderItem`, `DeleteConfirmationDialog`. Do NOT rewrite them.
- `FolderService` tolerates a missing `project_folders`/`folders` table (Postgres `42P01`) by degrading gracefully; the dashboard must never hard-fail when folders can't load — show the flat list.
- Path alias `@/` maps to `src/`. Commit after each task with a `feat:`/`fix:`/`chore:` prefixed message ending with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Existing contracts (reference — do not redefine)

- `FolderService.getUserFolders(userId): Promise<Folder[]>`
- `FolderService.buildFolderTree(folders: Folder[]): FolderTreeNode[]`
- `FolderService.getProjectsInFolder(folderId: string | null, userId): Promise<string[]>` (specific folder → all member project ids, owner-agnostic; `null` → the user's own un-filed video ids)
- `FolderService.createFolder(name, ownerId, parentId=null): Promise<Folder>`
- `FolderService.updateFolder(folderId, { name?, color?, icon?, sortOrder? }): Promise<Folder>`
- `FolderService.deleteFolder(folderId): Promise<void>`
- `FolderService.moveProjectToFolder(projectId, fromFolderId: string|null, toFolderId: string|null): Promise<void>` (removes the project from all folders first, then adds to `toFolderId`)
- `FolderTree` props `{ folders: FolderTreeNode[]; selectedFolderId: string|null; dragOverFolderId: string|null }`; emits `select [FolderTreeNode|null]`, `create [FolderTreeNode|null]`, `rename [FolderTreeNode, string]`, `delete [FolderTreeNode]`, `drop [FolderTreeNode|null, DragEvent]`, `dragover [FolderTreeNode|null, DragEvent]`, `dragleave []`.
- `NewFolderDialog` props `{ parentFolder: Folder|null }`; emits `create [name: string, parentId: string|null]`, `close []`.
- `MoveProjectsDialog` props `{ projects: string[]; folders: FolderTreeNode[]; currentFolderId: string|null }`; emits `move [targetFolderId: string|null]`, `close []`.
- `ProjectCard`/`ProjectListItem`: props include `project`, `annotationCount?`, `commentCount?`, `isSelected`, `isDragging`; emit `open [project]`, `dragstart [project, DragEvent]` (already present).

---

## Task 1: Fix the `getProjectsInFolder` uncategorized-branch column bug

**Files:**
- Modify: `src/services/folderService.ts` (the `folderId === null` branch, ~line 452)
- Test: `src/services/__tests__/folderProjects.test.ts`

**Interfaces:**
- Produces: `getProjectsInFolder(null, userId)` correctly queries `videos.ownerId` (was `owner_id`, which does not exist on `videos`).

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/folderProjects.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const videosChain = { select: vi.fn(() => videosChain), eq: vi.fn(() => Promise.resolve({ data: [{ id: 'v1' }, { id: 'v2' }], error: null })) };
const pfChain = { select: vi.fn(() => Promise.resolve({ data: [{ project_id: 'v2' }], error: null })) };
const fromMock = vi.fn((t: string) => (t === 'videos' ? videosChain : pfChain));
vi.mock('@/composables/useSupabase', () => ({ supabase: { from: (t: string) => fromMock(t) } }));

beforeEach(() => { fromMock.mockClear(); videosChain.eq.mockClear(); });

describe('getProjectsInFolder(null, userId) — uncategorized', () => {
  it('filters the videos table by the camelCase ownerId column', async () => {
    const { FolderService } = await import('@/services/folderService');
    const ids = await FolderService.getProjectsInFolder(null, 'u1');
    // queried videos by ownerId (NOT owner_id), and excluded v2 (already in a folder)
    expect(videosChain.eq).toHaveBeenCalledWith('ownerId', 'u1');
    expect(ids).toEqual(['v1']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- folderProjects`
Expected: FAIL — `eq` was called with `'owner_id'`, not `'ownerId'`.

- [ ] **Step 3: Fix the column name**

In `src/services/folderService.ts`, the `folderId === null` branch, change:
```ts
        const { data: allProjects, error: allError } = await supabase
          .from('videos')
          .select('id')
          .eq('owner_id', userId);
```
to use `ownerId`:
```ts
        const { data: allProjects, error: allError } = await supabase
          .from('videos')
          .select('id')
          .eq('ownerId', userId);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- folderProjects`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/folderService.ts src/services/__tests__/folderProjects.test.ts
git commit -m "fix: getProjectsInFolder uncategorized branch uses ownerId column"
```

---

## Task 2: `useDashboardFolders` composable

**Files:**
- Create: `src/composables/useDashboardFolders.ts`
- Test: `src/composables/__tests__/useDashboardFolders.test.ts`

**Interfaces:**
- Consumes: `FolderService` (Task 1's fix), `Folder`/`FolderTreeNode` from `@/types/folder`, `Project` from `@/types/project`.
- Produces: `useDashboardFolders(getUserId: () => string | undefined)` returning:
  - state refs: `folders: Ref<Folder[]>`, `folderTree: Ref<FolderTreeNode[]>`, `currentFolderId: Ref<string|null>`, `dragOverFolderId: Ref<string|null>`, `folderProjectIds: Ref<Set<string>|null>` (null = no folder filter active)
  - methods: `loadFolders()`, `refreshFolderContents()`, `selectFolder(node: FolderTreeNode|null)`, `createFolder(name: string, parentId: string|null)`, `renameFolder(node: FolderTreeNode, newName: string)`, `deleteFolder(node: FolderTreeNode)`, `fileProject(projectId: string, toFolderId: string|null)`, and the pure helper `filterByFolder(list: Project[]): Project[]`.

- [ ] **Step 1: Write the failing test (pure filter logic)**

Create `src/composables/__tests__/useDashboardFolders.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/folderService', () => ({ FolderService: {} }));

describe('useDashboardFolders.filterByFolder', () => {
  it('returns the list unchanged when no folder is selected (folderProjectIds null)', async () => {
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');
    const list = [{ id: 'a' }, { id: 'b' }] as any;
    expect(f.filterByFolder(list)).toEqual(list);
  });

  it('restricts the list to the folder member ids when a folder is active', async () => {
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');
    f.folderProjectIds.value = new Set(['b']);
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as any;
    expect(f.filterByFolder(list).map((p: any) => p.id)).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- useDashboardFolders`
Expected: FAIL — cannot find module `useDashboardFolders`.

- [ ] **Step 3: Implement the composable**

Create `src/composables/useDashboardFolders.ts`:
```ts
import { ref } from 'vue';
import type { Ref } from 'vue';
import { FolderService } from '@/services/folderService';
import type { Folder, FolderTreeNode } from '@/types/folder';
import type { Project } from '@/types/project';

const FOLDER_KEY = 'dashboardFolderId';

export function useDashboardFolders(getUserId: () => string | undefined) {
  const folders: Ref<Folder[]> = ref([]);
  const folderTree: Ref<FolderTreeNode[]> = ref([]);
  const currentFolderId: Ref<string | null> = ref(
    localStorage.getItem(FOLDER_KEY) || null
  );
  const dragOverFolderId: Ref<string | null> = ref(null);
  // null = no folder filter; a Set = restrict to these project ids.
  const folderProjectIds: Ref<Set<string> | null> = ref(null);

  async function loadFolders() {
    const uid = getUserId();
    if (!uid) return;
    try {
      folders.value = await FolderService.getUserFolders(uid);
      folderTree.value = FolderService.buildFolderTree(folders.value);
    } catch (err) {
      // Missing folders table etc. — degrade to no folders, never hard-fail.
      console.warn('[useDashboardFolders] loadFolders failed', err);
      folders.value = [];
      folderTree.value = [];
    }
  }

  async function refreshFolderContents() {
    const uid = getUserId();
    if (!uid || currentFolderId.value === null) {
      folderProjectIds.value = null;
      return;
    }
    try {
      const ids = await FolderService.getProjectsInFolder(currentFolderId.value, uid);
      folderProjectIds.value = new Set(ids);
    } catch (err) {
      console.warn('[useDashboardFolders] refreshFolderContents failed', err);
      folderProjectIds.value = new Set();
    }
  }

  function persist() {
    if (currentFolderId.value) localStorage.setItem(FOLDER_KEY, currentFolderId.value);
    else localStorage.removeItem(FOLDER_KEY);
  }

  function selectFolder(node: FolderTreeNode | null) {
    currentFolderId.value = node?.id ?? null;
    persist();
  }

  async function createFolder(name: string, parentId: string | null) {
    const uid = getUserId();
    if (!uid) return;
    await FolderService.createFolder(name, uid, parentId);
    await loadFolders();
  }

  async function renameFolder(node: FolderTreeNode, newName: string) {
    await FolderService.updateFolder(node.id, { name: newName });
    await loadFolders();
  }

  async function deleteFolder(node: FolderTreeNode) {
    await FolderService.deleteFolder(node.id);
    if (currentFolderId.value === node.id) selectFolder(null);
    await loadFolders();
  }

  async function fileProject(projectId: string, toFolderId: string | null) {
    await FolderService.moveProjectToFolder(projectId, null, toFolderId);
    await refreshFolderContents();
  }

  function filterByFolder(list: Project[]): Project[] {
    const ids = folderProjectIds.value;
    if (!ids) return list;
    return list.filter((p) => ids.has(p.id));
  }

  return {
    folders,
    folderTree,
    currentFolderId,
    dragOverFolderId,
    folderProjectIds,
    loadFolders,
    refreshFolderContents,
    selectFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    fileProject,
    filterByFolder,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- useDashboardFolders`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useDashboardFolders.ts src/composables/__tests__/useDashboardFolders.test.ts
git commit -m "feat: add useDashboardFolders composable"
```

---

## Task 3: Folder sidebar — browse & filter (read side)

**Files:**
- Modify: `src/views/DashboardView.vue`

**Interfaces:**
- Consumes: `useDashboardFolders` (Task 2), `FolderTree` component.
- Produces: a left folder sidebar; selecting a folder filters the visible projects to that folder's contents (cross-owner); persistence + reload wiring. No create/file yet.

- [ ] **Step 1: Import and instantiate**

In `src/views/DashboardView.vue` `<script setup>`, add imports and instantiate the composable near the other setup:
```ts
import FolderTree from '@/components/FolderTree.vue';
import type { FolderTreeNode } from '@/types/folder';
import { useDashboardFolders } from '@/composables/useDashboardFolders';

const dashFolders = useDashboardFolders(() => user.value?.id);
```

- [ ] **Step 2: Make `loadData` folder-aware**

Replace the body of `loadData` so that when a folder is selected it loads the full (`all`) set and refreshes folder membership; otherwise it loads per scope:
```ts
async function loadData() {
  if (!user.value) return;
  isLoading.value = true;
  try {
    const effectiveScope =
      dashFolders.currentFolderId.value !== null ? 'all' : scope.value;
    projects.value = await ProjectService.getAllProjects({
      scope: effectiveScope,
      userId: user.value.id,
    });
    await dashFolders.refreshFolderContents();
    const counts = await ProjectService.getProjectCountsBatched(projects.value);
    annotationCounts.value = counts.annotationCounts;
    commentCounts.value = counts.commentCounts;
    const videoIds = projects.value
      .filter((p) => p.projectType === 'single')
      .map((p) => (p as Extract<Project, { projectType: 'single' }>).video.id);
    availableLabels.value = await LabelService.getLabelsForProjects(videoIds);
  } finally {
    isLoading.value = false;
  }
}
```

- [ ] **Step 3: Fold the folder filter into `filteredProjects` and reset page on folder change**

Update the `filteredProjects` computed to apply the folder filter first:
```ts
const filteredProjects = computed(() => {
  let list = dashFolders.filterByFolder(projects.value);
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        !!p.owner?.name.toLowerCase().includes(q)
    );
  }
  return list;
});
```
Add a watch so selecting a folder reloads and resets to page 1:
```ts
watch(dashFolders.currentFolderId, () => {
  currentPage.value = 1;
  loadData();
});
```
(`currentFolderId` is persisted inside the composable via `selectFolder`.) Load the folder tree on mount and when the user resolves — extend the existing hooks:
```ts
onMounted(() => {
  loadData();
  dashFolders.loadFolders();
});
watch(user, (u) => {
  if (u) {
    loadData();
    dashFolders.loadFolders();
  }
});
```
(Replace the existing `onMounted(loadData)` and the existing `watch(user, ...)` with these.)

- [ ] **Step 4: Render the sidebar**

In the template, wrap the existing content area in a flex row with the sidebar on the left. Add above/around the grid:
```vue
<div class="flex gap-6">
  <aside class="w-60 shrink-0">
    <FolderTree
      :folders="dashFolders.folderTree.value"
      :selected-folder-id="dashFolders.currentFolderId.value"
      :drag-over-folder-id="dashFolders.dragOverFolderId.value"
      @select="dashFolders.selectFolder"
    />
  </aside>
  <div class="flex-1 min-w-0">
    <!-- existing toolbar + grid/list + pagination move here -->
  </div>
</div>
```
(Keep the existing toolbar, grid/list, and pagination markup inside the `flex-1` column. The other `FolderTree` emits — create/rename/delete/drop — are wired in Tasks 4 and 5; leaving them unbound for now is fine.)

- [ ] **Step 5: Verify + commit**

Run: `npm run build` (must pass) and `npx vue-tsc --noEmit` (no NEW errors vs the pre-existing baseline).
Manual QA (deferred): selecting a folder shows only its videos (including others' videos filed into it); "All videos" root clears the filter; selection persists across reload.
```bash
git add src/views/DashboardView.vue
git commit -m "feat: add folder sidebar with browse/filter to dashboard"
```

---

## Task 4: Create / rename / delete folders

**Files:**
- Modify: `src/views/DashboardView.vue`

**Interfaces:**
- Consumes: `NewFolderDialog`, `DeleteConfirmationDialog`, `dashFolders.createFolder/renameFolder/deleteFolder`, `FolderTree` `create`/`rename`/`delete` emits.

- [ ] **Step 1: Import dialogs + add dialog state**

```ts
import NewFolderDialog from '@/components/NewFolderDialog.vue';
import DeleteConfirmationDialog from '@/components/DeleteConfirmationDialog.vue';
import type { Folder } from '@/types/folder';

const showNewFolder = ref(false);
const newFolderParent = ref<Folder | null>(null);
const pendingDeleteFolder = ref<FolderTreeNode | null>(null);
```

- [ ] **Step 2: Add handlers**

```ts
function openNewFolder(parent: FolderTreeNode | null) {
  // NewFolderDialog wants a Folder|null parent; find the matching Folder record.
  newFolderParent.value = parent
    ? dashFolders.folders.value.find((f) => f.id === parent.id) ?? null
    : null;
  showNewFolder.value = true;
}
async function onCreateFolder(name: string, parentId: string | null) {
  await dashFolders.createFolder(name, parentId);
  showNewFolder.value = false;
}
async function onRenameFolder(node: FolderTreeNode, newName: string) {
  await dashFolders.renameFolder(node, newName);
}
function requestDeleteFolder(node: FolderTreeNode) {
  pendingDeleteFolder.value = node;
}
async function confirmDeleteFolder() {
  if (pendingDeleteFolder.value) {
    await dashFolders.deleteFolder(pendingDeleteFolder.value);
    pendingDeleteFolder.value = null;
    await loadData();
  }
}
```

- [ ] **Step 3: Wire the FolderTree emits + a "New folder" button + dialogs**

On the `<FolderTree>` element add:
```vue
      @create="openNewFolder"
      @rename="onRenameFolder"
      @delete="requestDeleteFolder"
```
Add a "+ New folder" button in the sidebar above/below the tree:
```vue
<button class="w-full mb-2 px-3 py-1.5 border rounded-lg text-sm" @click="openNewFolder(null)">
  + New folder
</button>
```
Render the dialogs (near the other modals at the end of the template):
```vue
<NewFolderDialog
  v-if="showNewFolder"
  :parent-folder="newFolderParent"
  @create="onCreateFolder"
  @close="showNewFolder = false"
/>
<DeleteConfirmationDialog
  v-if="pendingDeleteFolder"
  item-type="folder"
  :item-name="pendingDeleteFolder.name"
  :item-count="1"
  @confirm="confirmDeleteFolder"
  @cancel="pendingDeleteFolder = null"
/>
```
(`DeleteConfirmationDialog` contract, verified: props `itemType: 'project'|'folder'|'projects'`, `itemName: string`, `itemCount: number`; emits `confirm []`, `cancel []`.)

- [ ] **Step 4: Verify + commit**

Run: `npm run build` and `npx vue-tsc --noEmit` (no new errors).
Manual QA (deferred): create a root folder and a nested one; rename; delete (confirming) — tree updates each time.
```bash
git add src/views/DashboardView.vue
git commit -m "feat: create/rename/delete folders from the dashboard sidebar"
```

---

## Task 5: File videos into folders via drag-drop

**Files:**
- Modify: `src/views/DashboardView.vue`

**Interfaces:**
- Consumes: `ProjectCard`/`ProjectListItem` `dragstart` emit, `FolderTree` `drop`/`dragover`/`dragleave` emits, `dashFolders.fileProject`, the `DragData` type.

- [ ] **Step 1: Add drag source + drop handlers**

```ts
import type { DragData } from '@/types/folder';

function onCardDragStart(project: Project, event: DragEvent) {
  const payload: DragData = { type: 'project', id: project.id };
  event.dataTransfer?.setData('application/json', JSON.stringify(payload));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function onFolderDragOver(node: FolderTreeNode | null) {
  dashFolders.dragOverFolderId.value = node?.id ?? null;
}
function onFolderDragLeave() {
  dashFolders.dragOverFolderId.value = null;
}
async function onFolderDrop(node: FolderTreeNode | null, event: DragEvent) {
  dashFolders.dragOverFolderId.value = null;
  const raw = event.dataTransfer?.getData('application/json');
  if (!raw) return;
  const data = JSON.parse(raw) as DragData;
  if (data.type !== 'project' || Array.isArray(data.id)) return;
  await dashFolders.fileProject(data.id, node?.id ?? null);
}
```

- [ ] **Step 2: Wire card dragstart and FolderTree drop emits**

On `<ProjectCard>` and `<ProjectListItem>` add `@dragstart="onCardDragStart"`. On `<FolderTree>` add:
```vue
      @drop="onFolderDrop"
      @dragover="onFolderDragOver"
      @dragleave="onFolderDragLeave"
```

- [ ] **Step 3: Verify + commit**

Run: `npm run build` and `npx vue-tsc --noEmit` (no new errors).
Manual QA (deferred): drag a card onto a folder → it's filed there; open that folder → the video appears; dragging onto the "All videos" root removes it from folders.
```bash
git add src/views/DashboardView.vue
git commit -m "feat: file videos into folders via drag-drop on the dashboard"
```

---

## Task 6: File videos via a per-card "Add to folder" action

**Files:**
- Modify: `src/views/DashboardView.vue`
- Modify: `src/components/ProjectCard.vue` and `src/components/ProjectListItem.vue` (add an "Add to folder" action that emits an event)

**Interfaces:**
- Consumes: `MoveProjectsDialog`, `dashFolders.fileProject`.
- Produces: `ProjectCard`/`ProjectListItem` emit `add-to-folder [project]`; DashboardView opens `MoveProjectsDialog` for that one project.

- [ ] **Step 1: Add the emit + control to the cards**

In `src/components/ProjectCard.vue`, add `add-to-folder: [project: Project]` to its `defineEmits`, and add a small button/menu item in the card's action area:
```vue
<button
  class="p-1 text-gray-400 hover:text-gray-600"
  title="Add to folder"
  @click.stop="emit('add-to-folder', props.project)"
>
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </svg>
</button>
```
Repeat the same emit + control in `src/components/ProjectListItem.vue`. Match each file's existing action-area markup and icon sizing; keep the emit name identical: `add-to-folder`. Use an inline SVG (as above), not an emoji.

- [ ] **Step 2: Add dialog state + handler in DashboardView**

```ts
import MoveProjectsDialog from '@/components/MoveProjectsDialog.vue';

const moveDialogProjectIds = ref<string[] | null>(null);

function openAddToFolder(project: Project) {
  moveDialogProjectIds.value = [project.id];
}
async function onMoveConfirmed(targetFolderId: string | null) {
  const ids = moveDialogProjectIds.value ?? [];
  for (const id of ids) {
    await dashFolders.fileProject(id, targetFolderId);
  }
  moveDialogProjectIds.value = null;
}
```

- [ ] **Step 3: Wire the emit + render the dialog**

On `<ProjectCard>`/`<ProjectListItem>` add `@add-to-folder="openAddToFolder"`. Render:
```vue
<MoveProjectsDialog
  v-if="moveDialogProjectIds"
  :projects="moveDialogProjectIds"
  :folders="dashFolders.folderTree.value"
  :current-folder-id="dashFolders.currentFolderId.value"
  @move="onMoveConfirmed"
  @close="moveDialogProjectIds = null"
/>
```

- [ ] **Step 4: Verify + commit**

Run: `npm run build` and `npx vue-tsc --noEmit` (no new errors).
Manual QA (deferred): click a card's "Add to folder" → pick a folder → the video is filed; verify by opening that folder.
```bash
git add src/views/DashboardView.vue src/components/ProjectCard.vue src/components/ProjectListItem.vue
git commit -m "feat: per-card add-to-folder action on the dashboard"
```

---

## Final verification

- [ ] **Run the unit suite**

Run: `npm test`
Expected: all tests pass (Task 1 + Task 2 additions included).

- [ ] **Typecheck + build**

Run: `npx vue-tsc --noEmit && npm run build`
Expected: no NEW type errors vs the pre-existing baseline; build clean.

- [ ] **End-to-end manual pass**

1. Sidebar shows the folder tree; "All videos" root selected by default.
2. Create a folder (and a nested one); rename; delete.
3. Drag a video card onto a folder → filed; open the folder → it appears (including a video owned by someone else, filed from All Videos).
4. Use a card's "Add to folder" action → pick a folder → filed.
5. Selecting a folder shows its cross-owner contents; clearing returns to the scope (all/mine) view; selection persists across reload.
6. Search + label chips still compose within a selected folder.
