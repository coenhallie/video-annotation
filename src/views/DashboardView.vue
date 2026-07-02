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

const router = useRouter();
const { user, signOut } = useAuth();

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
    projects.value = await ProjectService.getAllProjects({
      scope: scope.value,
      userId: user.value.id,
    });
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

// Load once auth resolves (initAuth is async and may settle after mount).
watch(user, (u) => {
  if (u) loadData();
});

const filteredProjects = computed(() => {
  let list = projects.value;
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

onMounted(loadData);
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
    </main>
  </div>
</template>
