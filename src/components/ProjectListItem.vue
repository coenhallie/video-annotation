<template>
  <div
    :class="[
      'project-list-item group flex items-center gap-4 p-3 bg-white border rounded-lg cursor-pointer transition-all',
      isSelected
        ? 'border-blue-500 bg-blue-50'
        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
      isDragging && 'opacity-50',
    ]"
    draggable="true"
    @click="handleClick"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Selection Checkbox -->
    <input
      type="checkbox"
      :checked="isSelected"
      class="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
      @click.stop
      @change="toggleSelection"
    />

    <!-- Thumbnail -->
    <div class="w-20 h-12 bg-gray-100 rounded overflow-hidden flex-shrink-0">
      <img
        v-if="project.thumbnailUrl"
        :src="project.thumbnailUrl"
        :alt="project.title"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <svg
          class="w-6 h-6 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </div>
    </div>

    <!-- Project Info -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <h3 class="font-medium text-gray-900 truncate">
          {{ project.title }}
        </h3>
        <!-- Project Type Badge -->
        <span
          v-if="project.projectType === 'dual'"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
        >
          Dual
        </span>
      </div>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4 text-sm text-gray-500">
          <span>{{ formatDuration(getDuration()) }}</span>
          <span v-if="project.projectType === 'single' && project.video.fps">
            {{ project.video.fps }} FPS
          </span>
          <span>{{ formatDate(project.createdAt) }}</span>
        </div>
        <div class="flex items-center gap-1">
          <!-- Annotation count pill -->
          <span
            v-if="annotationCount && annotationCount > 0"
            class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
          >
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            {{ annotationCount }}
          </span>

          <!-- Comment count pill -->
          <span
            v-if="commentCount && commentCount > 0"
            class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
          >
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                clip-rule="evenodd"
              />
            </svg>
            {{ commentCount }}
          </span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div
      class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0"
      style="min-width: 140px"
    >
      <button
        class="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
        title="Open"
        @click.stop="openProject"
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
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
      </button>
      <button
        class="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
        title="Share"
        @click.stop="shareProject"
      >
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
      </button>
      <button
        class="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
        title="Delete"
        @click.stop="deleteProject"
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
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  </div>

  <!-- Share Modal -->
  <ShareModal
    :is-visible="showShareModal"
    :video-id="
      props.project.projectType === 'single' ? props.project.video?.id : ''
    "
    :comparison-id="
      props.project.projectType === 'dual'
        ? props.project.comparisonVideo?.id
        : ''
    "
    :share-type="
      props.project.projectType === 'single' ? 'video' : 'comparison'
    "
    @close="closeShareModal"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Project } from '../types/project';
import ShareModal from './ShareModal.vue';

// Props
const props = defineProps<{
  project: Project;
  isSelected: boolean;
  isDragging: boolean;
  commentCount?: number;
  annotationCount?: number;
}>();

// Emits
const emit = defineEmits<{
  select: [project: Project, event: MouseEvent];
  open: [project: Project];
  delete: [project: Project];
  dragstart: [project: Project, event: DragEvent];
  dragend: [event: DragEvent];
}>();

// State
const showShareModal = ref(false);

// Methods
const handleClick = (event: MouseEvent) => {
  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    emit('select', props.project, event);
  } else {
    emit('open', props.project);
  }
};

const toggleSelection = () => {
  const event = new MouseEvent('click', { ctrlKey: true });
  emit('select', props.project, event);
};

const handleDragStart = (event: DragEvent) => {
  emit('dragstart', props.project, event);
};

const handleDragEnd = (event: DragEvent) => {
  emit('dragend', event);
};

const openProject = () => {
  emit('open', props.project);
};

const shareProject = () => {
  showShareModal.value = true;
};

const closeShareModal = () => {
  showShareModal.value = false;
};

const deleteProject = () => {
  emit('delete', props.project);
};

const getDuration = () => {
  if (props.project.projectType === 'single') {
    return props.project.video.duration;
  } else {
    // For dual projects, return the longer duration
    return Math.max(
      props.project.videoA?.duration || 0,
      props.project.videoB?.duration || 0
    );
  }
};

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
};
</script>

<style scoped>
.project-list-item {
  transition: all 0.2s ease;
}
</style>
