<template>
  <div
    :class="[
      'project-list-item group flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border rounded-lg cursor-pointer transition-all',
      isSelected || isInspected
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700',
      isDragging && 'opacity-50',
    ]"
    draggable="true"
    @click="handleClick"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Thumbnail -->
    <div
      class="w-20 h-12 bg-gray-100 dark:bg-gray-900 rounded overflow-hidden flex-shrink-0"
    >
      <img
        v-if="project.thumbnailUrl"
        :src="project.thumbnailUrl"
        :alt="project.title"
        class="w-full h-full object-cover"
      >
      <div
        v-else
        class="w-full h-full flex items-center justify-center"
      >
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
        <h3 class="font-medium text-gray-900 dark:text-white truncate">
          {{ project.title }}
        </h3>
        <!-- Project Type Badge -->
        <span
          v-if="project.projectType === 'dual'"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300"
        >
          Dual
        </span>
        <!-- Team watch coverage -->
        <span
          v-if="watchPercent !== undefined"
          class="ml-auto shrink-0 text-xs text-gray-500 dark:text-gray-400"
          title="Watched"
        >
          {{ Math.round(watchPercent) }}%
        </span>
      </div>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
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
            class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300"
          >
            <svg
              class="w-3 h-3"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
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
            class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300"
          >
            <svg
              class="w-3 h-3"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
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
  </div>
</template>

<script setup lang="ts">
import type { Project } from '../types/project';

// Props
const props = defineProps<{
  project: Project;
  isSelected: boolean;
  isInspected?: boolean;
  isDragging: boolean;
  commentCount?: number;
  annotationCount?: number;
  watchPercent?: number;
}>();

// Emits
const emit = defineEmits<{
  select: [project: Project, event: MouseEvent];
  inspect: [project: Project];
  dragstart: [project: Project, event: DragEvent];
  dragend: [event: DragEvent];
}>();

// Methods
const handleClick = (event: MouseEvent) => {
  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    emit('select', props.project, event);
  } else {
    // Plain click now opens the details panel (not the editor).
    emit('inspect', props.project);
  }
};

const handleDragStart = (event: DragEvent) => {
  emit('dragstart', props.project, event);
};

const handleDragEnd = (event: DragEvent) => {
  emit('dragend', event);
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
