<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useNotifications } from '@/composables/useNotifications';
import { ProjectService } from '@/services/projectService';
import { LabelService } from '@/services/labelService';
import type { Project } from '@/types/project';
import type { Label } from '@/types/labels';
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

const router = useRouter();
const { user, signOut } = useAuth();
const { error: notifyError } = useNotifications();

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
const currentPage = ref(1);
const itemsPerPage = ref(20);
// Labels across the loaded projects: power the filter dropdown and resolve
// per-annotation chips in the details panel.
const availableLabels = ref<Label[]>([]);
// project key (video id / comparison id) → label ids used on that project.
const labelIdsByProject = ref<Record<string, string[]>>({});
const activeLabelIds = ref<Set<string>>(new Set());
const showLabelFilter = ref(false);

const selectedProject = ref<Project | null>(null);
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
  if (selectedProject.value?.id === project.id) {
    closeDetails();
    return;
  }
  selectedProject.value = project;
  videoDetails.selectProject(project);
}

function closeDetails() {
  selectedProject.value = null;
  videoDetails.clear();
}

function openAnnotation(project: Project, annotation: PanelAnnotation) {
  const name = project.projectType === 'single' ? 'editor-single' : 'editor-dual';
  router.push({
    name,
    params: { id: project.id },
    query: { t: String(annotation.timestamp ?? 0) },
  });
}

// Close the panel on Escape.
function onKeydown(e: KeyboardEvent) {
  if (shareTarget.value) return; // let the Share modal handle its own Escape
  if (e.key === 'Escape' && selectedProject.value) closeDetails();
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
    const counts = await ProjectService.getProjectCountsBatched(projects.value);
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
  [scope, searchQuery, dashFolders.currentFolderId, activeLabelIds],
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

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredProjects.value.length / itemsPerPage.value))
);
const paginatedProjects = computed(() =>
  filteredProjects.value.slice(
    (currentPage.value - 1) * itemsPerPage.value,
    currentPage.value * itemsPerPage.value
  )
);

function toggleLabelFilter(id: string) {
  const next = new Set(activeLabelIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  activeLabelIds.value = next; // new Set so the watchers fire
}

function clearLabelFilter() {
  activeLabelIds.value = new Set();
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
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <AppHeader
      @open-changelog="showChangelog = true"
      @sign-out="signOut"
    >
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 border rounded-md text-sm border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          @click="showComparisonModal = true"
        >
          Create comparison
        </button>
      </div>
    </AppHeader>

    <main class="max-w-7xl mx-auto p-6">
      <div class="flex gap-6">
        <aside class="w-60 shrink-0">
          <button
            class="w-full mb-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
            <div
              class="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden"
            >
              <button
                class="px-3 py-1.5 text-sm transition-colors"
                :class="
                  scope === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                "
                @click="scope = 'all'"
              >
                All Videos
              </button>
              <button
                class="px-3 py-1.5 text-sm transition-colors"
                :class="
                  scope === 'mine'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                "
                @click="scope = 'mine'"
              >
                My Videos
              </button>
            </div>

            <input
              v-model="searchQuery"
              placeholder="Search videos or owners…"
              class="flex-1 min-w-[12rem] px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >

            <!-- Label filter -->
            <div class="relative">
              <button
                class="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm transition-colors"
                :class="
                  activeLabelIds.size > 0
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                "
                @click="showLabelFilter = !showLabelFilter"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                Filter
                <span
                  v-if="activeLabelIds.size > 0"
                  class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-blue-600 text-white text-xs"
                >
                  {{ activeLabelIds.size }}
                </span>
              </button>

              <div
                v-if="showLabelFilter"
                class="fixed inset-0 z-40"
                @click="showLabelFilter = false"
              />
              <div
                v-if="showLabelFilter"
                class="absolute right-0 mt-2 w-72 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
              >
                <div
                  class="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700"
                >
                  <span
                    class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                  >
                    Filter by label
                  </span>
                  <button
                    v-if="activeLabelIds.size > 0"
                    class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    @click="clearLabelFilter"
                  >
                    Clear
                  </button>
                </div>
                <div
                  v-if="availableLabels.length === 0"
                  class="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
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
                    class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
                    @click="toggleLabelFilter(label.id)"
                  >
                    <span
                      class="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-500 shrink-0"
                      :style="{ backgroundColor: label.color }"
                    />
                    <span class="flex-1 truncate">{{ label.name }}</span>
                    <svg
                      v-if="activeLabelIds.has(label.id)"
                      class="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="isLoading"
            class="text-center text-gray-500 py-12"
          >
            Loading…
          </div>
          <div
            v-else-if="paginatedProjects.length === 0"
            class="text-center text-gray-500 py-12"
          >
            No videos found.
          </div>

          <div
            v-else
            class="flex flex-col gap-2"
          >
            <ProjectListItem
              v-for="project in paginatedProjects"
              :key="project.id"
              :project="project"
              :is-selected="false"
              :is-inspected="selectedProject?.id === project.id"
              :is-dragging="false"
              :annotation-count="annotationCounts[project.id] ?? 0"
              :comment-count="commentCounts[project.id] ?? 0"
              :watch-percent="watchCoverage[project.id] ?? 0"
              @inspect="inspectProject"
              @dragstart="onCardDragStart"
            />
          </div>

          <div
            v-if="totalPages > 1"
            class="flex justify-center items-center gap-2 mt-6"
          >
            <button
              :disabled="currentPage === 1"
              class="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-200 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              @click="currentPage--"
            >
              Prev
            </button>
            <span class="px-2 py-1 text-sm text-gray-600 dark:text-gray-300">
              {{ currentPage }} / {{ totalPages }}
            </span>
            <button
              :disabled="currentPage === totalPages"
              class="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-200 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
