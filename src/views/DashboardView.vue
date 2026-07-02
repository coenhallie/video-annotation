<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { ProjectService } from '@/services/projectService';
import { LabelService } from '@/services/labelService';
import type { Project } from '@/types/project';
import type { Label } from '@/types/labels';
import ThemeToggle from '@/components/ThemeToggle.vue';
import ProjectCard from '@/components/ProjectCard.vue';
import ProjectListItem from '@/components/ProjectListItem.vue';
import CreateComparisonModal from '@/components/CreateComparisonModal.vue';
import VideoUpload from '@/components/VideoUpload.vue';
import FolderTree from '@/components/FolderTree.vue';
import type { FolderTreeNode } from '@/types/folder';
import { useDashboardFolders } from '@/composables/useDashboardFolders';
import type {
  ComparisonCreatedEvent,
  VideoUploadResult,
} from '@/types/component-interfaces';

const router = useRouter();
const { user, signOut } = useAuth();

const dashFolders = useDashboardFolders(() => user.value?.id);

const showComparisonModal = ref(false);
const showUploadModal = ref(false);

function onComparisonCreated(comparison: ComparisonCreatedEvent) {
  showComparisonModal.value = false;
  router.push({ name: 'editor-dual', params: { id: comparison.id } });
}
function onUploadSuccess(videoRecord: VideoUploadResult) {
  showUploadModal.value = false;
  router.push({ name: 'editor-single', params: { id: videoRecord.id } });
}
function onUploadError(err: Error) {
  console.error('[DashboardView] upload failed', err);
}

const scope = ref<'mine' | 'all'>(
  (localStorage.getItem('dashboardScope') as 'mine' | 'all') || 'all'
);
const viewMode = ref<'grid' | 'list'>('grid');
const searchQuery = ref('');
const isLoading = ref(false);
const projects = ref<Project[]>([]);
const annotationCounts = ref<Record<string, number>>({});
const commentCounts = ref<Record<string, number>>({});
const currentPage = ref(1);
const itemsPerPage = ref(20);
// Label filtering is a documented follow-up: chips are rendered as a visual
// element only. `activeLabelIds` drives selected styling but is intentionally
// NOT referenced in `filteredProjects` yet.
const activeLabelIds = ref<Set<string>>(new Set());
const availableLabels = ref<Label[]>([]);

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

// Persist scope and reload data when it changes.
watch(scope, (s) => {
  localStorage.setItem('dashboardScope', s);
  loadData();
});

// Reset to page 1 whenever the result set changes, so we never strand the
// user on an out-of-range (and thus empty, hidden-pagination) page.
watch([scope, searchQuery], () => {
  currentPage.value = 1;
});

// Reload and reset to page 1 whenever the selected folder changes.
// (`currentFolderId` is persisted inside the composable via `selectFolder`.)
watch(dashFolders.currentFolderId, () => {
  currentPage.value = 1;
  loadData();
});

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

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredProjects.value.length / itemsPerPage.value))
);
const paginatedProjects = computed(() =>
  filteredProjects.value.slice(
    (currentPage.value - 1) * itemsPerPage.value,
    currentPage.value * itemsPerPage.value
  )
);

function toggleLabel(id: string) {
  // Visual-only for now (label-based project filtering is a follow-up).
  if (activeLabelIds.value.has(id)) activeLabelIds.value.delete(id);
  else activeLabelIds.value.add(id);
  activeLabelIds.value = new Set(activeLabelIds.value);
}

function openProject(project: Project) {
  if (project.projectType === 'single') {
    router.push({ name: 'editor-single', params: { id: project.id } });
  } else {
    router.push({ name: 'editor-dual', params: { id: project.id } });
  }
}

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
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Minimal inline library header (intentionally NOT the editor's DashboardHeader) -->
    <header
      class="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
    >
      <h1 class="text-lg font-semibold text-gray-900 dark:text-white">
        Perspecto
      </h1>
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 border rounded-lg text-sm border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          @click="showUploadModal = true"
        >
          Upload video
        </button>
        <button
          class="px-3 py-1.5 border rounded-lg text-sm border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          @click="showComparisonModal = true"
        >
          Create comparison
        </button>
        <ThemeToggle />
        <button
          class="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </header>

    <main class="max-w-7xl mx-auto p-6">
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

            <button
              class="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              @click="viewMode = viewMode === 'grid' ? 'list' : 'grid'"
            >
              {{ viewMode === 'grid' ? 'List' : 'Grid' }}
            </button>
          </div>

          <!-- Label chips (visual only — label-based filtering is a follow-up) -->
          <div
            v-if="availableLabels.length > 0"
            class="flex flex-wrap gap-2 mb-4"
          >
            <button
              v-for="label in availableLabels"
              :key="label.id"
              class="px-2 py-0.5 rounded-full text-xs font-medium border transition-colors"
              :class="
                activeLabelIds.has(label.id)
                  ? 'text-white border-transparent'
                  : 'text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
              :style="
                activeLabelIds.has(label.id)
                  ? { backgroundColor: label.color }
                  : {}
              "
              @click="toggleLabel(label.id)"
            >
              {{ label.name }}
            </button>
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
            v-else-if="viewMode === 'grid'"
            class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            <div
              v-for="project in paginatedProjects"
              :key="project.id"
              class="relative"
            >
              <ProjectCard
                :project="project"
                :is-selected="false"
                :is-dragging="false"
                :annotation-count="annotationCounts[project.id] ?? 0"
                :comment-count="commentCounts[project.id] ?? 0"
                @open="openProject"
              />
              <span
                v-if="project.owner"
                class="absolute bottom-2 left-2 z-20 text-xs px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none"
              >
                {{ project.owner.name }}
              </span>
            </div>
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
              :is-dragging="false"
              :annotation-count="annotationCounts[project.id] ?? 0"
              :comment-count="commentCounts[project.id] ?? 0"
              @open="openProject"
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
      </div>
    </main>

    <CreateComparisonModal
      :is-visible="showComparisonModal"
      @close="showComparisonModal = false"
      @comparison-created="onComparisonCreated"
      @upload-video="showUploadModal = true; showComparisonModal = false"
    />
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showUploadModal"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            @click="showUploadModal = false"
          />
          <div
            class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto p-6"
            @click.stop
          >
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                Upload Video
              </h2>
              <button
                class="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                @click="showUploadModal = false"
              >
                ✕
              </button>
            </div>
            <VideoUpload
              @upload-success="onUploadSuccess"
              @upload-error="onUploadError"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
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
