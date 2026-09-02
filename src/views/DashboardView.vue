<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useNotifications } from '@/composables/useNotifications';
import { ProjectService } from '@/services/projectService';
import { LabelService } from '@/services/labelService';
import type { Project } from '@/types/project';
import type { Label } from '@/types/labels';
import type { QaStatus, Video } from '@/types/database';
import {
  QA_STATUSES,
  toQaStatus,
  mergeQaStatusUpdate,
  qaStatusLabel,
} from '@/utils/qaStatus';
import {
  filterByQaStatus,
  countByQaStatus,
  qaStatusHiddenByFilter,
} from '@/utils/qaStatusFilter';
import QaStatusPill from '@/components/QaStatusPill.vue';
import AppHeader from '@/components/AppHeader.vue';
import ProjectListItem from '@/components/ProjectListItem.vue';
import CreateComparisonModal from '@/components/CreateComparisonModal.vue';
import FolderTree from '@/components/FolderTree.vue';
import NewFolderDialog from '@/components/NewFolderDialog.vue';
import DeleteConfirmationDialog from '@/components/DeleteConfirmationDialog.vue';
import VideoDetailsPanel from '@/components/VideoDetailsPanel.vue';
import ShareModal from '@/components/ShareModal.vue';
import ChangelogModal from '@/components/ChangelogModal.vue';
import {
  useVideoDetails,
  type PanelAnnotation,
} from '@/composables/useVideoDetails';
import type { FolderTreeNode, Folder, DragData } from '@/types/folder';
import { useDashboardFolders } from '@/composables/useDashboardFolders';
import type { ComparisonCreatedEvent } from '@/types/component-interfaces';
import { getMergedRangesForVideos } from '@/services/watchProgressService';
import { percentFromRanges } from '@/utils/watchedRanges';
import { getRecentOpens } from '@/services/recentOpensService';
import { sortByRecentOpens } from '@/utils/projectOrdering';

const router = useRouter();
const { user, signOut } = useAuth();
const { error: notifyError, success: notifySuccess } = useNotifications();

const dashFolders = useDashboardFolders(() => user.value?.id);

const showComparisonModal = ref(false);
const showNewFolder = ref(false);
const newFolderParent = ref<Folder | null>(null);
const pendingDeleteFolder = ref<FolderTreeNode | null>(null);

function onComparisonCreated(comparison: ComparisonCreatedEvent) {
  showComparisonModal.value = false;
  router.push({ name: 'editor-dual', params: { id: comparison.id } });
}
const scope = ref<'mine' | 'all'>(
  (localStorage.getItem('dashboardScope') as 'mine' | 'all') || 'all'
);
const searchQuery = ref('');
const isLoading = ref(false);
const projects = ref<Project[]>([]);
const annotationCounts = ref<Record<string, number>>({});
const commentCounts = ref<Record<string, number>>({});
// Per-project team watch coverage (union across users), keyed by project id.
const watchCoverage = ref<Record<string, number>>({});
// This user's own "last opened" times, keyed by project id. Per user by
// construction: the query filters on userId and RLS enforces it independently,
// so scope 'all' still reorders by YOUR opens only.
const recentOpens = ref<Record<string, string>>({});
const currentPage = ref(1);
const itemsPerPage = ref(20);
// Labels across the loaded projects: power the filter dropdown and resolve
// per-annotation chips in the details panel.
const availableLabels = ref<Label[]>([]);
// project key (video id / comparison id) → label ids used on that project.
const labelIdsByProject = ref<Record<string, string[]>>({});
const activeLabelIds = ref<Set<string>>(new Set());
const activeQaStatuses = ref<Set<QaStatus>>(new Set());
const showLabelFilter = ref(false);

// The panel's project is derived from the list, never stored alongside it.
//
// loadData() replaces every object in `projects` with a freshly fetched copy,
// and it can run while the panel is open - a Supabase token refresh reassigns
// `user`, and the watcher at the bottom of this file reloads on that. A stored
// object would go on pointing at the previous copy, and since the two QA
// controls stay in step only by sharing one object, the panel and the row would
// each be editing a project the other cannot see.
//
// Deriving it also closes the panel by itself when the selected project is no
// longer in the list at all (deleted, or filtered out by a reload under a
// narrower scope), which is the right outcome and one less thing to remember.
const selectedProjectId = ref<string | null>(null);
const selectedProject = computed<Project | null>(
  () => projects.value.find((p) => p.id === selectedProjectId.value) ?? null
);
const videoDetails = useVideoDetails();
const shareTarget = ref<Project | null>(null);
const showChangelog = ref(false);

// Fast lookup for resolving annotation label ids → label name/color.
const labelMap = computed(() => {
  const m = new Map<string, Label>();
  for (const l of availableLabels.value) m.set(l.id, l);
  return m;
});

function inspectProject(project: Project) {
  // Toggle off if the same card is clicked again.
  if (selectedProjectId.value === project.id) {
    closeDetails();
    return;
  }
  selectedProjectId.value = project.id;
  videoDetails.selectProject(project);
}

// A reload can drop the selected project out of the list. The panel is already
// gone at that point (selectedProject is null), so this just retires the state
// behind it rather than leaving a selection that would resurrect the panel on
// the next reload that happens to return the project again.
//
// Only the null transition is handled: a reload that returns the project again
// hands the panel a new object, but not a new id, and useVideoDetails keys its
// fetch and its cache on the id alone - so the annotations it loaded at open
// time are still this project's annotations. Re-selecting would refetch nothing
// and reset the panel's scroll for no reason.
watch(selectedProject, (project) => {
  if (!project && selectedProjectId.value !== null) closeDetails();
});

// The list row and the details panel reference the same project object -
// `projects` is not cloned on the way to either, and the panel derives its
// project from that array rather than keeping one - so one merge updates both
// surfaces. mergeQaStatusUpdate merges only the QA fields, never the whole
// returned row; the id check below is this handler's own guard, not a repeat
// of one inside the composable.
function onProjectQaStatusUpdated(project: Project, updated: Video) {
  if (project.projectType !== 'single') return;
  // Not reachable today - useQaStatusWrite already compares ids before
  // emitting - but this handler should not depend on that invariant holding
  // in a caller it does not control. If it ever mismatched, the row on screen
  // did not actually change, so there is nothing to merge or to explain.
  if (project.video.id !== updated.id) return;
  const merged = mergeQaStatusUpdate(project.video, updated);
  if (!merged) return; // narrows Partial<Video> | null; project.video is never null here
  Object.assign(project.video, merged);

  // Silent on success everywhere except here: the row is about to disappear
  // from a list the user is looking at, because of something they just did.
  if (qaStatusHiddenByFilter(updated.qaStatus, activeQaStatuses.value)) {
    notifySuccess(
      `Marked ${qaStatusLabel(updated.qaStatus).toLowerCase()}`,
      'Hidden by the current filter.'
    );
  }
}

function closeDetails() {
  selectedProjectId.value = null;
  videoDetails.clear();
}

// `a` is what the editor selects on arrival, so the sidebar highlights the row
// that was clicked here; `t` is the fallback seek for a link whose annotation no
// longer exists.
function openAnnotation(project: Project, annotation: PanelAnnotation) {
  const name = project.projectType === 'single' ? 'editor-single' : 'editor-dual';
  router.push({
    name,
    params: { id: project.id },
    query: { a: annotation.id, t: String(annotation.timestamp ?? 0) },
  });
}

// Close the panel on Escape.
function onKeydown(e: KeyboardEvent) {
  if (shareTarget.value) return; // let the Share modal handle its own Escape
  // On the id, not the derived project: between a reload dropping the project
  // and the watcher above retiring the selection, the two disagree, and the
  // state still worth clearing is the id.
  if (e.key === 'Escape' && selectedProjectId.value) closeDetails();
}

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
    const [counts, opens] = await Promise.all([
      ProjectService.getProjectCountsBatched(projects.value),
      getRecentOpens(user.value.id),
    ]);
    recentOpens.value = opens;
    annotationCounts.value = counts.annotationCounts;
    commentCounts.value = counts.commentCounts;
    const videoIds = projects.value
      .filter((p) => p.projectType === 'single')
      .map((p) => (p as Extract<Project, { projectType: 'single' }>).video.id);
    const comparisonIds = projects.value
      .filter((p) => p.projectType === 'dual')
      .map((p) => p.id);
    const labelData = await LabelService.getProjectLabelData(
      videoIds,
      comparisonIds
    );
    availableLabels.value = labelData.labels;
    labelIdsByProject.value = labelData.labelIdsByProject;

    // Team coverage per project: one batched query over every video id, then
    // union percent per video (dual = lower of the two sides, as elsewhere).
    const allVideoIds = projects.value.flatMap((p) =>
      p.projectType === 'single' ? [p.video.id] : [p.videoA.id, p.videoB.id]
    );
    const mergedRanges = await getMergedRangesForVideos(allVideoIds);
    const coverage: Record<string, number> = {};
    for (const p of projects.value) {
      coverage[p.id] =
        p.projectType === 'single'
          ? percentFromRanges(
              mergedRanges[p.video.id] ?? [],
              p.video.duration
            )
          : Math.min(
              percentFromRanges(
                mergedRanges[p.videoA.id] ?? [],
                p.videoA.duration
              ),
              percentFromRanges(
                mergedRanges[p.videoB.id] ?? [],
                p.videoB.duration
              )
            );
    }
    watchCoverage.value = coverage;
  } finally {
    isLoading.value = false;
  }
}

// Persist scope and reload data when it changes.
watch(scope, (s) => {
  localStorage.setItem('dashboardScope', s);
  loadData();
});

// Reset to page 1 whenever the result set changes, so we never strand the
// user on an out-of-range (and thus empty, hidden-pagination) page. Also
// close the details panel so it never points at a project that scrolled
// out of the current folder/scope.
watch(
  [scope, searchQuery, dashFolders.currentFolderId, activeLabelIds, activeQaStatuses],
  () => {
    currentPage.value = 1;
    closeDetails();
  }
);

// Reload whenever the selected folder changes.
// (`currentFolderId` is persisted inside the composable via `selectFolder`.)
watch(dashFolders.currentFolderId, () => {
  loadData();
});

// Annotations reference single projects by video id and dual projects by
// comparison id — same keying as `labelIdsByProject`.
function projectLabelKey(p: Project): string {
  return p.projectType === 'single' ? p.video.id : p.id;
}

// Dual projects have no qaStatus: the column is on `videos` only. Null here is
// what makes them fall out of a status filter and out of every count.
//
// The single-project case is normalised through toQaStatus rather than read as
// a bare property: a frontend running ahead of the videos.qaStatus migration
// gets `undefined` here at runtime despite the Video type calling the field
// required (see toQaStatus/ABSENT_FALLBACK in qaStatus.ts, and the comment on
// QaStatusPill). QaStatusPill already renders that undefined as UNREVIEWED, so
// the counts and the filter must agree with what the pill shows - otherwise
// selecting UNREVIEWED would hide rows the user can see labelled UNREVIEWED.
// Do not simplify this back to `p.video.qaStatus`.
const statusOfProject = (p: Project): QaStatus | null =>
  p.projectType === 'single' ? toQaStatus(p.video.qaStatus) : null;

// Everything except the status filter. The counts are computed against this,
// so selecting FAILED does not drop the other four statuses to zero and make
// the panel useless exactly when it is being used.
const projectsBeforeQaFilter = computed(() => {
  let list = dashFolders.filterByFolder(projects.value);
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        !!p.owner?.name.toLowerCase().includes(q)
    );
  }
  if (activeLabelIds.value.size > 0) {
    // OR semantics: keep videos that carry at least one selected label.
    list = list.filter((p) =>
      (labelIdsByProject.value[projectLabelKey(p)] ?? []).some((id) =>
        activeLabelIds.value.has(id)
      )
    );
  }
  return list;
});

const qaStatusCounts = computed(() =>
  countByQaStatus(projectsBeforeQaFilter.value, statusOfProject)
);

const filteredProjects = computed(() =>
  filterByQaStatus(
    projectsBeforeQaFilter.value,
    activeQaStatuses.value,
    statusOfProject
  )
);

// Recency ordering lives here, not in ProjectService.mapToProjects: that is a
// private static shared by getUserProjects and getAllProjects with no user
// context, and it keeps owning created-date order as the stable base.
const orderedProjects = computed(() =>
  sortByRecentOpens(filteredProjects.value, recentOpens.value)
);

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredProjects.value.length / itemsPerPage.value))
);

// Filtering is not the only thing that can shrink the list out from under the
// current page: an inline QA status edit (onProjectQaStatusUpdated) removes a
// row from filteredProjects without touching any of the refs the watcher above
// resets on. Clamping on totalPages itself, rather than enumerating more
// sources for that watcher, covers that case and any future one by
// construction - the pager's own visibility condition (v-if="totalPages > 1")
// is driven by the same value. Deliberately not closing the details panel
// here: unlike the other watcher's filter/scope changes, an inline edit does
// not put the panel out of context.
watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages;
});

const paginatedProjects = computed(() =>
  orderedProjects.value.slice(
    (currentPage.value - 1) * itemsPerPage.value,
    currentPage.value * itemsPerPage.value
  )
);

const activeFilterCount = computed(
  () => activeLabelIds.value.size + activeQaStatuses.value.size
);

function toggleLabelFilter(id: string) {
  const next = new Set(activeLabelIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  activeLabelIds.value = next; // new Set so the watchers fire
}

function toggleQaStatusFilter(status: QaStatus) {
  const next = new Set(activeQaStatuses.value);
  if (next.has(status)) next.delete(status);
  else next.add(status);
  activeQaStatuses.value = next; // new Set so the watchers fire
}

function clearAllFilters() {
  activeLabelIds.value = new Set();
  activeQaStatuses.value = new Set();
}

function openProject(project: Project) {
  if (project.projectType === 'single') {
    router.push({ name: 'editor-single', params: { id: project.id } });
  } else {
    router.push({ name: 'editor-dual', params: { id: project.id } });
  }
}

function openNewFolder(parent: FolderTreeNode | null) {
  // NewFolderDialog wants a Folder|null parent; find the matching Folder record.
  newFolderParent.value = parent
    ? dashFolders.folders.value.find((f) => f.id === parent.id) ?? null
    : null;
  showNewFolder.value = true;
}
async function onCreateFolder(name: string, parentId: string | null) {
  try {
    await dashFolders.createFolder(name, parentId);
    showNewFolder.value = false;
  } catch (err) {
    notifyError('Could not create folder', folderErrorMessage(err));
  }
}
async function onRenameFolder(node: FolderTreeNode, newName: string) {
  try {
    await dashFolders.renameFolder(node, newName);
  } catch (err) {
    notifyError('Could not rename folder', folderErrorMessage(err));
  }
}
function requestDeleteFolder(node: FolderTreeNode) {
  pendingDeleteFolder.value = node;
}
async function confirmDeleteFolder() {
  if (pendingDeleteFolder.value) {
    try {
      await dashFolders.deleteFolder(pendingDeleteFolder.value);
      pendingDeleteFolder.value = null;
      await loadData();
    } catch (err) {
      notifyError('Could not delete folder', folderErrorMessage(err));
    }
  }
}

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
  let data: DragData;
  try {
    data = JSON.parse(raw) as DragData;
  } catch {
    return; // not our payload
  }
  if (data.type !== 'project' || Array.isArray(data.id)) return;
  try {
    await dashFolders.fileProject(data.id, node?.id ?? null);
  } catch (err) {
    notifyError('Could not move video to folder', folderErrorMessage(err));
  }
}

// Turn a Supabase/RLS error into a friendly message.
function folderErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/row-level security|violates row-level/i.test(msg)) {
    return 'You must be signed in to organize folders. (Folder changes require a real login — the local dev bypass cannot write to folders.)';
  }
  return msg;
}

onMounted(() => {
  loadData();
  dashFolders.loadFolders();
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
watch(user, (u) => {
  if (u) {
    loadData();
    dashFolders.loadFolders();
  }
});
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900">
    <AppHeader
      @open-changelog="showChangelog = true"
      @sign-out="signOut"
    >
      <button
        type="button"
        class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        @click="showComparisonModal = true"
      >
        Create comparison
      </button>
    </AppHeader>

    <main class="max-w-7xl mx-auto p-6">
      <div class="flex gap-6">
        <aside class="w-60 shrink-0">
          <button
            type="button"
            class="mb-3 w-full rounded px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
            @click="openNewFolder(null)"
          >
            + New folder
          </button>
          <FolderTree
            :folders="dashFolders.folderTree.value"
            :selected-folder-id="dashFolders.currentFolderId.value"
            :drag-over-folder-id="dashFolders.dragOverFolderId.value"
            @select="dashFolders.selectFolder"
            @create="openNewFolder"
            @rename="onRenameFolder"
            @delete="requestDeleteFolder"
            @drop="onFolderDrop"
            @dragover="onFolderDragOver"
            @dragleave="onFolderDragLeave"
          />
        </aside>

        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-3 mb-4">
            <!-- Same pill shape as the annotation panel's category filter -
                 both are "narrow this list to one facet". -->
            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                class="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
                :class="
                  scope === 'all'
                    ? 'bg-gray-900 text-white dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
                "
                @click="scope = 'all'"
              >
                All
              </button>
              <button
                type="button"
                class="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
                :class="
                  scope === 'mine'
                    ? 'bg-gray-900 text-white dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
                "
                @click="scope = 'mine'"
              >
                Mine
              </button>
            </div>

            <input
              v-model="searchQuery"
              placeholder="Search videos or owners…"
              class="min-w-[12rem] flex-1 rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
            >

            <!-- Label filter -->
            <div class="relative">
              <!-- Active count as a mono token, not a badge: the darkened
                   label is already saying the filter is on. -->
              <button
                type="button"
                class="flex items-center gap-1.5 rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
                :class="
                  activeFilterCount > 0 || showLabelFilter
                    ? 'text-gray-900 dark:text-gray-200'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
                "
                @click="showLabelFilter = !showLabelFilter"
              >
                <svg
                  class="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                Filter
                <span
                  v-if="activeFilterCount > 0"
                  class="font-mono text-[10px] tracking-wider"
                >
                  {{ activeFilterCount }}
                </span>
              </button>

              <div
                v-if="showLabelFilter"
                class="fixed inset-0 z-40"
                @click="showLabelFilter = false"
              />
              <!-- Same card as the annotation form's label picker. -->
              <div
                v-if="showLabelFilter"
                class="absolute right-0 z-50 mt-2 w-64 rounded border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-gray-900"
              >
                <div
                  class="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-white/10"
                >
                  <span
                    class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
                  >
                    Filter
                  </span>
                  <button
                    v-if="activeFilterCount > 0"
                    type="button"
                    class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
                    @click="clearAllFilters"
                  >
                    Clear
                  </button>
                </div>
                <div class="border-b border-gray-200 py-1 dark:border-white/10">
                  <div
                    class="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
                  >
                    QA status
                  </div>
                  <!-- All five always render, zeros included. The vocabulary is
                       fixed, so hiding empty ones would make the panel's
                       contents shift as data changes, and "nothing is in
                       staging" is itself an answer. -->
                  <button
                    v-for="status in QA_STATUSES"
                    :key="status"
                    type="button"
                    :data-testid="`qa-filter-${status}`"
                    class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                    @click="toggleQaStatusFilter(status)"
                  >
                    <QaStatusPill :status="status" />
                    <span class="flex-1 text-right font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400">
                      {{ qaStatusCounts[status] }}
                    </span>
                    <!-- Fixed-width slot, always present, so the count above
                         never shifts when a status is toggled on or off. Only
                         the svg inside comes and goes. -->
                    <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      <svg
                        v-if="activeQaStatuses.has(status)"
                        class="h-3.5 w-3.5 text-gray-900 dark:text-white"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m5 13 4 4L19 7"
                        />
                      </svg>
                    </span>
                  </button>
                </div>
                <div class="py-1">
                  <div
                    class="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
                  >
                    Labels
                  </div>
                  <div
                    v-if="availableLabels.length === 0"
                    class="px-3 py-6 text-center text-[12px] text-gray-600 dark:text-gray-400"
                  >
                    No labels in use yet.
                  </div>
                  <div
                    v-else
                    class="max-h-64 overflow-y-auto py-1"
                  >
                    <button
                      v-for="label in availableLabels"
                      :key="label.id"
                      type="button"
                      class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                      @click="toggleLabelFilter(label.id)"
                    >
                      <span
                        class="h-2 w-2 shrink-0 rounded-full"
                        :style="{ backgroundColor: label.color }"
                      />
                      <span
                        class="flex-1 truncate text-[12px]"
                        :class="
                          activeLabelIds.has(label.id)
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-700 dark:text-gray-200'
                        "
                      >{{ label.name }}</span>
                      <!-- Fixed-width slot, always present, same as the QA rows
                           above, so toggling a label does not move where the
                           name truncates. -->
                      <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                        <svg
                          v-if="activeLabelIds.has(label.id)"
                          class="h-3.5 w-3.5 text-gray-900 dark:text-white"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="m5 13 4 4L19 7"
                          />
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="isLoading"
            class="px-4 py-12 text-center text-[12px] text-gray-600 dark:text-gray-400"
          >
            Loading…
          </div>
          <div
            v-else-if="paginatedProjects.length === 0"
            class="px-4 py-12 text-center text-[12px] text-gray-600 dark:text-gray-400"
          >
            No videos found.
          </div>

          <div
            v-else
            class="-mx-3 flex flex-col"
          >
            <ProjectListItem
              v-for="project in paginatedProjects"
              :key="project.id"
              :project="project"
              :is-selected="false"
              :is-inspected="selectedProjectId === project.id"
              :is-dragging="false"
              :annotation-count="annotationCounts[project.id] ?? 0"
              :comment-count="commentCounts[project.id] ?? 0"
              :watch-percent="watchCoverage[project.id] ?? 0"
              :opened-at="recentOpens[project.id] ?? ''"
              @inspect="inspectProject"
              @dragstart="onCardDragStart"
              @qa-status-updated="onProjectQaStatusUpdated"
            />
          </div>

          <div
            v-if="totalPages > 1"
            class="mt-6 flex items-center justify-center gap-4"
          >
            <button
              type="button"
              :disabled="currentPage === 1"
              class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-500 dark:hover:text-gray-300"
              @click="currentPage--"
            >
              Prev
            </button>
            <span class="font-mono text-[11px] tracking-wider text-gray-500 dark:text-gray-400">
              {{ currentPage }} / {{ totalPages }}
            </span>
            <button
              type="button"
              :disabled="currentPage === totalPages"
              class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-500 dark:hover:text-gray-300"
              @click="currentPage++"
            >
              Next
            </button>
          </div>
        </div>

        <!-- Desktop docked details panel -->
        <aside
          v-if="selectedProject"
          class="hidden lg:block w-96 shrink-0 self-start sticky top-6 h-[calc(100vh-6rem)]"
        >
          <VideoDetailsPanel
            :project="selectedProject"
            :annotations="videoDetails.annotations.value"
            :loading="videoDetails.loading.value"
            :label-map="labelMap"
            :annotation-count="annotationCounts[selectedProject.id] ?? 0"
            :comment-count="commentCounts[selectedProject.id] ?? 0"
            @close="closeDetails"
            @open="openProject"
            @share="(p) => (shareTarget = p)"
            @annotation-click="openAnnotation"
            @qa-status-updated="onProjectQaStatusUpdated"
          />
        </aside>
      </div>
    </main>

    <CreateComparisonModal
      :is-visible="showComparisonModal"
      @close="showComparisonModal = false"
      @comparison-created="onComparisonCreated"
    />

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
      :item-count="0"
      @confirm="confirmDeleteFolder"
      @cancel="pendingDeleteFolder = null"
    />
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="selectedProject"
          class="lg:hidden fixed inset-0 z-50 flex justify-end"
        >
          <div
            class="absolute inset-0 bg-black/50"
            @click="closeDetails"
          />
          <div class="relative w-[90%] max-w-sm h-full">
            <VideoDetailsPanel
              :project="selectedProject"
              :annotations="videoDetails.annotations.value"
              :loading="videoDetails.loading.value"
              :label-map="labelMap"
              :annotation-count="annotationCounts[selectedProject.id] ?? 0"
              :comment-count="commentCounts[selectedProject.id] ?? 0"
              @close="closeDetails"
              @open="openProject"
              @share="(p) => (shareTarget = p)"
              @annotation-click="openAnnotation"
              @qa-status-updated="onProjectQaStatusUpdated"
            />
          </div>
        </div>
      </Transition>
    </Teleport>

    <ShareModal
      v-if="shareTarget"
      :is-visible="true"
      :video-id="shareTarget.projectType === 'single' ? shareTarget.video?.id : ''"
      :comparison-id="shareTarget.projectType === 'dual' ? shareTarget.comparisonVideo?.id : ''"
      :share-type="shareTarget.projectType === 'single' ? 'video' : 'comparison'"
      @close="shareTarget = null"
    />

    <ChangelogModal
      :is-visible="showChangelog"
      @close="showChangelog = false"
    />
  </div>
</template>

<style scoped>
/* Modal transition styles (copied from DashboardModals.vue) */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.3s ease;
}

.modal-enter-from .relative {
  transform: scale(0.95);
}

.modal-leave-to .relative {
  transform: scale(0.95);
}
</style>
