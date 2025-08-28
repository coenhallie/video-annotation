<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isVisible"
        class="fixed inset-0 z-50 overflow-hidden"
        @keydown.esc="handleEscape"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm"
          @click="closeModal"
        />

        <!-- Modal Container -->
        <div class="absolute inset-4 md:inset-8 lg:inset-12 flex flex-col">
          <div
            class="relative bg-white rounded-xl shadow-2xl flex flex-col h-full overflow-hidden"
            @click.stop
          >
            <!-- Header -->
            <div class="flex-shrink-0 border-b border-gray-200">
              <div class="flex items-center justify-between px-6 py-4">
                <h2 class="text-xl font-semibold text-gray-900">
                  Project Manager
                </h2>
                <div class="flex items-center gap-2">
                  <!-- View Toggle -->
                  <div class="flex items-center bg-gray-100 rounded-lg p-1">
                    <button
                      :class="[
                        'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                        viewMode === 'grid'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900',
                      ]"
                      @click="viewMode = 'grid'"
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
                          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                        />
                      </svg>
                    </button>
                    <button
                      :class="[
                        'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                        viewMode === 'list'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900',
                      ]"
                      @click="viewMode = 'list'"
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
                          d="M4 6h16M4 12h16M4 18h16"
                        />
                      </svg>
                    </button>
                  </div>

                  <!-- Close Button -->
                  <button
                    class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    @click="closeModal"
                  >
                    <svg
                      class="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Search and Actions Bar -->
              <div class="px-6 pb-4 flex items-center gap-4">
                <!-- Search Input -->
                <div class="flex-1 relative">
                  <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Search projects and folders..."
                    class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    @input="handleSearch"
                  />
                  <svg
                    class="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <button
                    v-if="searchQuery"
                    class="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    @click="clearSearch"
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center gap-2">
                  <!-- New Folder Button -->
                  <button
                    class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                    @click="showNewFolderDialog"
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
                        d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                      />
                    </svg>
                    New Folder
                  </button>

                  <!-- Create Comparison Button -->
                  <button
                    class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                    @click="showCreateComparisonDialog"
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
                        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                      />
                    </svg>
                    Create Comparison
                  </button>

                  <!-- Upload Button -->
                  <button
                    class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    @click="showUploadDialog"
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
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    Upload Video
                  </button>
                </div>
              </div>

              <!-- Breadcrumb Navigation -->
              <div
                v-if="breadcrumbs.length > 0"
                class="px-6 pb-3 flex items-center gap-2 text-sm"
              >
                <button
                  class="text-gray-600 hover:text-gray-900 font-medium"
                  @click="navigateToRoot"
                >
                  All Projects
                </button>
                <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id">
                  <svg
                    class="w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <button
                    :class="[
                      'hover:text-gray-900 font-medium',
                      index === breadcrumbs.length - 1
                        ? 'text-gray-900'
                        : 'text-gray-600',
                    ]"
                    @click="navigateToFolder(crumb)"
                  >
                    {{ crumb.name }}
                  </button>
                </template>
              </div>
            </div>

            <!-- Main Content Area -->
            <div class="flex-1 flex overflow-hidden">
              <!-- Sidebar - Folder Tree -->
              <div
                class="w-64 border-r border-gray-200 bg-gray-50 overflow-y-auto"
              >
                <div class="p-4">
                  <h3
                    class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3"
                  >
                    Folders
                  </h3>
                  <FolderTree
                    :folders="folderTree"
                    :selected-folder-id="currentFolderId"
                    :drag-over-folder-id="dragOverFolderId"
                    @select="selectFolder"
                    @create="createFolder"
                    @rename="renameFolder"
                    @delete="deleteFolder"
                    @drop="handleFolderDrop"
                    @dragover="handleFolderDragOver"
                    @dragleave="handleFolderDragLeave"
                  />
                </div>
              </div>

              <!-- Project List/Grid -->
              <div class="flex-1 overflow-y-auto p-6">
                <!-- Bulk Actions Bar -->
                <div
                  v-if="selectedProjects.size > 0"
                  class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between"
                >
                  <div class="flex items-center gap-3">
                    <span class="text-sm font-medium text-blue-900">
                      {{ selectedProjects.size }} project{{
                        selectedProjects.size !== 1 ? 's' : ''
                      }}
                      selected
                    </span>
                    <button
                      class="text-sm text-blue-600 hover:text-blue-800"
                      @click="clearSelection"
                    >
                      Clear selection
                    </button>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      class="px-3 py-1.5 text-sm bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                      @click="moveSelectedProjects"
                    >
                      Move to...
                    </button>
                    <button
                      class="px-3 py-1.5 text-sm bg-white text-red-600 border border-red-300 rounded-md hover:bg-red-50"
                      @click="deleteSelectedProjects"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <!-- Error Message -->
                <div
                  v-if="error"
                  class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
                >
                  <div class="flex items-center">
                    <svg
                      class="w-5 h-5 mr-2 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <span>{{ error }}</span>
                    <button
                      class="ml-auto text-red-500 hover:text-red-700"
                      @click="error = null"
                    >
                      <svg
                        class="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Empty State -->
                <div
                  v-if="filteredProjects.length === 0 && !isLoading"
                  class="flex flex-col items-center justify-center h-full text-center"
                >
                  <svg
                    class="w-16 h-16 text-gray-300 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  <h3 class="text-lg font-medium text-gray-900 mb-2">
                    {{ searchQuery ? 'No results found' : 'No projects yet' }}
                  </h3>
                  <p class="text-gray-600 mb-4">
                    {{
                      searchQuery
                        ? 'Try adjusting your search terms'
                        : 'Upload a video to get started'
                    }}
                  </p>
                  <button
                    v-if="!searchQuery"
                    class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    @click="showUploadDialog"
                  >
                    Upload Your First Video
                  </button>
                </div>

                <!-- Loading State -->
                <div
                  v-if="isLoading"
                  class="flex items-center justify-center h-full"
                >
                  <div class="text-center">
                    <div
                      class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"
                    />
                    <p class="text-gray-600">Loading projects...</p>
                  </div>
                </div>

                <!-- Grid View -->
                <div
                  v-if="
                    viewMode === 'grid' &&
                    filteredProjects.length > 0 &&
                    !isLoading
                  "
                  class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                >
                  <ProjectCard
                    v-for="project in paginatedProjects"
                    :key="project.id"
                    :project="project"
                    :is-selected="selectedProjects.has(project.id)"
                    :is-dragging="draggingProjectId === project.id"
                    :annotation-count="annotationCounts[project.id] || 0"
                    :comment-count="commentCounts[project.id] || 0"
                    @select="selectProject"
                    @open="openProject"
                    @delete="deleteProject"
                    @dragstart="handleProjectDragStart"
                    @dragend="handleProjectDragEnd"
                  />
                </div>

                <!-- List View -->
                <div
                  v-if="
                    viewMode === 'list' &&
                    filteredProjects.length > 0 &&
                    !isLoading
                  "
                  class="space-y-2"
                >
                  <ProjectListItem
                    v-for="project in paginatedProjects"
                    :key="project.id"
                    :project="project"
                    :is-selected="selectedProjects.has(project.id)"
                    :is-dragging="draggingProjectId === project.id"
                    :annotation-count="annotationCounts[project.id] || 0"
                    :comment-count="commentCounts[project.id] || 0"
                    @select="selectProject"
                    @open="openProject"
                    @delete="deleteProject"
                    @dragstart="handleProjectDragStart"
                    @dragend="handleProjectDragEnd"
                  />
                </div>

                <!-- Pagination -->
                <div
                  v-if="totalPages > 1"
                  class="mt-6 flex items-center justify-center gap-2"
                >
                  <button
                    :disabled="currentPage === 1"
                    class="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    @click="goToPage(currentPage - 1)"
                  >
                    <svg
                      class="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <div class="flex items-center gap-1">
                    <button
                      v-for="page in visiblePageNumbers"
                      :key="page"
                      :class="[
                        'px-3 py-1 rounded-lg text-sm font-medium transition-colors',
                        page === currentPage
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100',
                      ]"
                      @click="goToPage(page)"
                    >
                      {{ page }}
                    </button>
                  </div>
                  <button
                    :disabled="currentPage === totalPages"
                    class="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    @click="goToPage(currentPage + 1)"
                  >
                    <svg
                      class="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Status Bar -->
            <div
              class="flex-shrink-0 border-t border-gray-200 px-6 py-3 bg-gray-50"
            >
              <div
                class="flex items-center justify-between text-sm text-gray-600"
              >
                <div>
                  {{ filteredProjects.length }} project{{
                    filteredProjects.length !== 1 ? 's' : ''
                  }}
                  {{ searchQuery ? 'found' : 'total' }}
                </div>
                <div class="flex items-center gap-4">
                  <span>
                    Press
                    <kbd
                      class="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs"
                      >⌘K</kbd
                    >
                    for quick search
                  </span>
                  <span>
                    <kbd
                      class="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs"
                      >⌘A</kbd
                    >
                    to select all
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Dialogs -->
    <NewFolderDialog
      v-if="showNewFolder"
      :parent-folder="currentFolder"
      @create="handleCreateFolder"
      @close="showNewFolder = false"
    />

    <MoveProjectsDialog
      v-if="showMoveDialog"
      :projects="Array.from(selectedProjects)"
      :folders="folderTree"
      :current-folder-id="currentFolderId"
      @move="handleMoveProjects"
      @close="showMoveDialog = false"
    />
  </Teleport>

  <!-- Delete Confirmation Dialog (separate teleport) -->
  <Teleport to="body">
    <DeleteConfirmationDialog
      v-if="showDeleteConfirmation"
      :item-type="deleteItemType"
      :item-name="deleteItemName"
      :item-count="deleteItemCount"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAuth } from '../composables/useAuth';
import { ProjectService } from '../services/projectService';
import { FolderService } from '../services/folderService';
import type { Project } from '../types/project';
import type {
  Folder,
  FolderTreeNode,
  BreadcrumbItem,
  DragData,
} from '../types/folder';
import FolderTree from './FolderTree.vue';
import ProjectCard from './ProjectCard.vue';
import ProjectListItem from './ProjectListItem.vue';
import NewFolderDialog from './NewFolderDialog.vue';
import MoveProjectsDialog from './MoveProjectsDialog.vue';
import DeleteConfirmationDialog from './DeleteConfirmationDialog.vue';

// Props
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false,
  },
});

// Emits
const emit = defineEmits([
  'close',
  'project-selected',
  'upload-video',
  'open-load-modal',
]);

// Composables
const { user } = useAuth();

// State
const viewMode = ref<'grid' | 'list'>('grid');
const searchQuery = ref('');
const isLoading = ref(false);
const error = ref<string | null>(null);

// Projects
const projects = ref<Project[]>([]);
const filteredProjects = ref<Project[]>([]);
const selectedProjects = ref<Set<string>>(new Set());

// Project counts
const annotationCounts = ref<Record<string, number>>({});
const commentCounts = ref<Record<string, number>>({});

// Folders
const folders = ref<Folder[]>([]);
const folderTree = ref<FolderTreeNode[]>([]);
const currentFolderId = ref<string | null>(null);
const currentFolder = ref<Folder | null>(null);
const breadcrumbs = ref<BreadcrumbItem[]>([]);

// Drag and Drop
const draggingProjectId = ref<string | null>(null);
const dragOverFolderId = ref<string | null>(null);
const dragData = ref<DragData | null>(null);

// Pagination
const currentPage = ref(1);
const itemsPerPage = ref(20);

// Dialogs
const showNewFolder = ref(false);
const showMoveDialog = ref(false);
const showDeleteConfirmation = ref(false);
const deleteItemType = ref<'project' | 'folder' | 'projects'>('project');
const deleteItemName = ref('');
const deleteItemCount = ref(1);
const deleteCallback = ref<(() => void) | null>(null);
const isDeleting = ref(false);

// Computed
const totalPages = computed(() =>
  Math.ceil(filteredProjects.value.length / itemsPerPage.value)
);

const paginatedProjects = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;
  return filteredProjects.value.slice(start, end);
});

const visiblePageNumbers = computed(() => {
  const pages: number[] = [];
  const maxVisible = 5;
  const halfVisible = Math.floor(maxVisible / 2);

  let start = Math.max(1, currentPage.value - halfVisible);
  let end = Math.min(totalPages.value, start + maxVisible - 1);

  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return pages;
});

// Methods
const loadData = async () => {
  if (!user.value) return;

  console.log('🔄 [ProjectManagementModal] Loading data...');
  isLoading.value = true;
  error.value = null;

  try {
    // Load projects first (critical data)
    const userProjects = await ProjectService.getUserProjects(user.value.id);
    console.log(
      '📦 [ProjectManagementModal] Loaded projects:',
      userProjects.length,
      'projects'
    );
    console.log(
      '📋 [ProjectManagementModal] Project details:',
      userProjects.map((p) => ({
        id: p.id,
        title: p.title,
        type: p.projectType,
        createdAt: p.createdAt,
        hasThumbnail: !!p.thumbnailUrl,
      }))
    );
    projects.value = userProjects;

    // Load annotation and comment counts for projects
    if (userProjects.length > 0) {
      try {
        console.log('📊 [ProjectManagementModal] Loading project counts...');
        const counts = await ProjectService.getProjectCounts(userProjects);
        annotationCounts.value = counts.annotationCounts;
        commentCounts.value = counts.commentCounts;
        console.log('📊 [ProjectManagementModal] Loaded counts:', {
          annotations: Object.keys(counts.annotationCounts).length,
          comments: Object.keys(counts.commentCounts).length,
        });
      } catch (countError: any) {
        console.warn('⚠️ Failed to load project counts:', countError?.message);
        // Initialize empty counts if loading fails
        annotationCounts.value = {};
        commentCounts.value = {};
      }
    }

    // Try to load folders, but don't fail if they're not available
    try {
      const userFolders = await FolderService.getUserFolders(user.value.id);
      folders.value = userFolders;
      folderTree.value = FolderService.buildFolderTree(userFolders);
    } catch (folderError: any) {
      console.warn(
        '⚠️ Folders not available, showing all projects:',
        folderError?.message
      );
      // Initialize empty folders if the table doesn't exist
      folders.value = [];
      folderTree.value = [];
      // Show a non-blocking warning
      if (folderError?.code === '42P01') {
        console.info(
          'ℹ️ Folder organization feature not yet configured. All projects will be shown.'
        );
      }
    }

    // Filter projects for current folder
    await filterProjectsForFolder();
  } catch (err) {
    console.error('Error loading data:', err);
    error.value = 'Failed to load projects';
  } finally {
    isLoading.value = false;
  }
};

const filterProjectsForFolder = async () => {
  if (!user.value) return;

  // If folders are not available, show all projects
  if (folders.value.length === 0) {
    filteredProjects.value = projects.value;
    return;
  }

  if (currentFolderId.value === null) {
    // Show all projects when at root
    filteredProjects.value = projects.value;
  } else {
    // Get projects in current folder
    try {
      const projectIds = await FolderService.getProjectsInFolder(
        currentFolderId.value,
        user.value.id
      );
      filteredProjects.value = projects.value.filter((p) =>
        projectIds.includes(p.id)
      );
    } catch (error) {
      console.warn('Error filtering projects for folder:', error);
      // Fall back to showing all projects if folder filtering fails
      filteredProjects.value = projects.value;
    }
  }

  // Apply search filter if active
  if (searchQuery.value) {
    handleSearch();
  }
};

const handleSearch = () => {
  const query = searchQuery.value.toLowerCase().trim();

  if (!query) {
    filterProjectsForFolder();
    return;
  }

  filteredProjects.value = projects.value.filter((project) => {
    const titleMatch = project.title.toLowerCase().includes(query);
    // You can add more search criteria here (annotations, etc.)
    return titleMatch;
  });

  // Reset to first page when searching
  currentPage.value = 1;
};

const clearSearch = () => {
  searchQuery.value = '';
  filterProjectsForFolder();
};

const selectFolder = async (folder: FolderTreeNode | null) => {
  currentFolderId.value = folder?.id || null;
  currentFolder.value = folder
    ? folders.value.find((f) => f.id === folder.id) || null
    : null;

  // Update breadcrumbs
  if (folder) {
    breadcrumbs.value = folder.path.map((name, index) => ({
      id: folder.id, // This is simplified, you'd need proper IDs
      name,
      path: folder.path.slice(0, index + 1),
    }));
  } else {
    breadcrumbs.value = [];
  }

  await filterProjectsForFolder();
  currentPage.value = 1;
};

const navigateToRoot = () => {
  selectFolder(null);
};

const navigateToFolder = (crumb: BreadcrumbItem) => {
  const folder = findFolderInTree(folderTree.value, crumb.id);
  if (folder) {
    selectFolder(folder);
  }
};

const findFolderInTree = (
  nodes: FolderTreeNode[],
  id: string
): FolderTreeNode | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findFolderInTree(node.children, id);
    if (found) return found;
  }
  return null;
};

const showNewFolderDialog = () => {
  showNewFolder.value = true;
};

const showUploadDialog = () => {
  // Emit event to trigger video upload
  emit('upload-video');
  // Close the project management modal
  emit('close');
};

const showCreateComparisonDialog = () => {
  // Emit event to open LoadVideoModal on create comparison tab
  emit('open-load-modal', 'create');
  // Close the project management modal
  emit('close');
};

const generateThumbnails = async () => {
  try {
    const { runThumbnailGeneration } = await import(
      '../utils/generateExistingThumbnails'
    );
    await runThumbnailGeneration();
    // Reload projects to show new thumbnails
    await loadData();
  } catch (error) {
    console.error('Error generating thumbnails:', error);
    alert(
      'Failed to generate thumbnails. Please check the console for details.'
    );
  }
};

const handleCreateFolder = async (name: string, parentId: string | null) => {
  if (!user.value) return;

  try {
    await FolderService.createFolder(name, user.value.id, parentId);
    await loadData();
    showNewFolder.value = false;
  } catch (err) {
    console.error('Error creating folder:', err);
  }
};

const renameFolder = async (folder: FolderTreeNode, newName: string) => {
  try {
    await FolderService.updateFolder(folder.id, { name: newName });
    await loadData();
  } catch (err) {
    console.error('Error renaming folder:', err);
  }
};

const deleteFolder = (folder: FolderTreeNode) => {
  deleteItemType.value = 'folder';
  deleteItemName.value = folder.name;
  deleteItemCount.value = folder.totalProjectCount;
  deleteCallback.value = async () => {
    try {
      await FolderService.deleteFolder(folder.id);
      await loadData();
    } catch (err) {
      console.error('Error deleting folder:', err);
    }
  };
  showDeleteConfirmation.value = true;
};

const selectProject = (project: Project, event: MouseEvent) => {
  if (event.shiftKey && selectedProjects.value.size > 0) {
    // Shift-click: select range
    const lastSelectedIndex = filteredProjects.value.findIndex((p) =>
      selectedProjects.value.has(p.id)
    );
    const currentIndex = filteredProjects.value.findIndex(
      (p) => p.id === project.id
    );
    const start = Math.min(lastSelectedIndex, currentIndex);
    const end = Math.max(lastSelectedIndex, currentIndex);

    for (let i = start; i <= end; i++) {
      const project = filteredProjects.value[i];
      if (project) {
        selectedProjects.value.add(project.id);
      }
    }
  } else if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd-click: toggle selection
    if (selectedProjects.value.has(project.id)) {
      selectedProjects.value.delete(project.id);
    } else {
      selectedProjects.value.add(project.id);
    }
  } else {
    // Regular click: single selection
    selectedProjects.value.clear();
    selectedProjects.value.add(project.id);
  }

  // Force reactivity
  selectedProjects.value = new Set(selectedProjects.value);
};

const clearSelection = () => {
  selectedProjects.value.clear();
  selectedProjects.value = new Set();
};

const openProject = (project: Project) => {
  emit('project-selected', project);
  closeModal();
};

const deleteProject = (project: Project) => {
  console.log(
    '🗑️ ProjectManagementModal: Delete event received for:',
    project.title
  );

  deleteItemType.value = 'project';
  deleteItemName.value = project.title;
  deleteItemCount.value = 1;

  deleteCallback.value = async () => {
    try {
      console.log(
        '🗑️ ProjectManagementModal: Executing deletion for:',
        project.title
      );
      await ProjectService.deleteProject(project);
      console.log(
        '✅ ProjectManagementModal: Project deleted successfully:',
        project.title
      );

      // Remove from selected projects if it was selected
      if (selectedProjects.value.has(project.id)) {
        selectedProjects.value.delete(project.id);
        selectedProjects.value = new Set(selectedProjects.value);
      }

      await loadData();
    } catch (err) {
      console.error('❌ ProjectManagementModal: Error deleting project:', err);
      error.value = `Failed to delete project: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
    }
  };

  console.log('🗑️ ProjectManagementModal: Showing delete confirmation dialog');
  showDeleteConfirmation.value = true;
};

const moveSelectedProjects = () => {
  showMoveDialog.value = true;
};

const deleteSelectedProjects = () => {
  deleteItemType.value = 'projects';
  deleteItemName.value = `${selectedProjects.value.size} projects`;
  deleteItemCount.value = selectedProjects.value.size;
  deleteCallback.value = async () => {
    try {
      const projectsToDelete = projects.value.filter((p) =>
        selectedProjects.value.has(p.id)
      );
      await Promise.all(
        projectsToDelete.map((p) => ProjectService.deleteProject(p))
      );
      await loadData();
      clearSelection();
    } catch (err) {
      console.error('Error deleting projects:', err);
    }
  };
  showDeleteConfirmation.value = true;
};

const handleMoveProjects = async (targetFolderId: string | null) => {
  try {
    await FolderService.moveProjectsToFolder(
      Array.from(selectedProjects.value),
      targetFolderId
    );
    await loadData();
    clearSelection();
    showMoveDialog.value = false;
  } catch (err) {
    console.error('Error moving projects:', err);
  }
};

const confirmDelete = async () => {
  console.log('🗑️ ProjectManagementModal: Delete confirmed');
  if (deleteCallback.value && !isDeleting.value) {
    isDeleting.value = true;
    try {
      await deleteCallback.value();
      console.log(
        '✅ ProjectManagementModal: Delete callback executed successfully'
      );
    } catch (err) {
      console.error(
        '❌ ProjectManagementModal: Error in delete callback:',
        err
      );
    } finally {
      isDeleting.value = false;
      showDeleteConfirmation.value = false;
      deleteCallback.value = null;
    }
  }
};

const cancelDelete = () => {
  showDeleteConfirmation.value = false;
  deleteCallback.value = null;
};

// Drag and Drop handlers
const handleProjectDragStart = (project: Project, event: DragEvent) => {
  draggingProjectId.value = project.id;

  // Set drag data
  const data: DragData = {
    type:
      selectedProjects.value.has(project.id) && selectedProjects.value.size > 1
        ? 'projects'
        : 'project',
    id:
      selectedProjects.value.has(project.id) && selectedProjects.value.size > 1
        ? Array.from(selectedProjects.value)
        : project.id,
    ...(currentFolderId.value && { sourceFolderId: currentFolderId.value }),
  };

  dragData.value = data;
  event.dataTransfer!.effectAllowed = 'move';
  event.dataTransfer!.setData('application/json', JSON.stringify(data));
};

const handleProjectDragEnd = () => {
  draggingProjectId.value = null;
  dragData.value = null;
};

const handleFolderDrop = async (
  folder: FolderTreeNode | null,
  event: DragEvent
) => {
  event.preventDefault();
  dragOverFolderId.value = null;

  if (!folder) return;

  const data = JSON.parse(
    event.dataTransfer!.getData('application/json')
  ) as DragData;

  if (data.type === 'project' && typeof data.id === 'string') {
    await FolderService.moveProjectToFolder(
      data.id,
      data.sourceFolderId || null,
      folder.id
    );
  } else if (data.type === 'projects' && Array.isArray(data.id)) {
    await FolderService.moveProjectsToFolder(data.id, folder.id);
  }

  await loadData();
};

const handleFolderDragOver = (
  folder: FolderTreeNode | null,
  event: DragEvent
) => {
  event.preventDefault();
  if (folder) {
    dragOverFolderId.value = folder.id;
    event.dataTransfer!.dropEffect = 'move';
  }
};

const handleFolderDragLeave = () => {
  dragOverFolderId.value = null;
};

// Pagination
const goToPage = (page: number) => {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value));
};

// Keyboard shortcuts
const handleEscape = () => {
  if (showNewFolder.value) {
    showNewFolder.value = false;
  } else if (showMoveDialog.value) {
    showMoveDialog.value = false;
  } else if (showDeleteConfirmation.value) {
    cancelDelete();
  } else {
    closeModal();
  }
};

const handleKeyboardShortcuts = (event: KeyboardEvent) => {
  // Cmd/Ctrl + K for quick search
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
    event.preventDefault();
    const searchInput = document.querySelector(
      'input[type="text"]'
    ) as HTMLInputElement;
    searchInput?.focus();
  }

  // Cmd/Ctrl + A to select all
  if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
    event.preventDefault();
    if (filteredProjects.value.length > 0) {
      selectedProjects.value = new Set(filteredProjects.value.map((p) => p.id));
    }
  }

  // Delete key to delete selected
  if (event.key === 'Delete' && selectedProjects.value.size > 0) {
    deleteSelectedProjects();
  }
};

const closeModal = () => {
  emit('close');
};

const createFolder = async (parentFolder: FolderTreeNode | null) => {
  showNewFolder.value = true;
  currentFolder.value = parentFolder
    ? folders.value.find((f) => f.id === parentFolder.id) || null
    : null;
};

// Lifecycle
onMounted(() => {
  loadData();
  document.addEventListener('keydown', handleKeyboardShortcuts);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyboardShortcuts);
});

// Watch for visibility changes
watch(
  () => props.isVisible,
  (newVal) => {
    if (newVal) {
      loadData();
    }
  }
);
</script>

<style scoped>
/* Modal transition */
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
  transform: scale(0.95) translateY(20px);
}

.modal-leave-to .relative {
  transform: scale(0.95) translateY(20px);
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
