<template>
  <div
    :class="[
      'group flex cursor-pointer items-center gap-3 rounded px-3 py-2.5 transition-colors',
      isSelected || isInspected
        ? 'bg-gray-100 dark:bg-white/[0.06]'
        : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]',
      isDragging && 'opacity-50',
    ]"
    draggable="true"
    @click="handleClick"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Thumbnail -->
    <div
      class="h-11 w-[4.5rem] shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-white/5"
    >
      <img
        v-if="project.thumbnailUrl"
        :src="project.thumbnailUrl"
        :alt="project.title"
        class="h-full w-full object-cover"
      >
      <div
        v-else
        class="flex h-full w-full items-center justify-center"
      >
        <svg
          class="h-4 w-4 text-gray-400 dark:text-gray-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </div>
    </div>

    <!-- Project Info. Everything below the title is one mono meta line - the
         same token style the annotation rows use - so the row has a single
         reading order instead of pills competing along both edges. -->
    <div class="min-w-0 flex-1">
      <h3 class="truncate text-[13px] font-medium tracking-tight text-gray-900 dark:text-white">
        {{ project.title }}
      </h3>
      <div
        class="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
      >
        <span v-if="project.projectType === 'dual'">DUAL</span>
        <span>{{ formatDuration(getDuration()) }}</span>
        <span v-if="project.projectType === 'single' && project.video.fps">
          {{ project.video.fps }}FPS
        </span>
        <span>{{ formatDate(project.createdAt) }}</span>

        <!-- Per-user: this is when YOU opened it, not the team. It also
             explains why the row sits where it does in the list. -->
        <span
          v-if="openedLabel"
          title="You last opened this"
        >OPENED {{ openedLabel }}</span>

        <span
          v-if="annotationCount && annotationCount > 0"
          :title="`${annotationCount} annotation${annotationCount !== 1 ? 's' : ''}`"
        >
          {{ annotationCount }}A
        </span>
        <span
          v-if="commentCount && commentCount > 0"
          :title="`${commentCount} comment${commentCount !== 1 ? 's' : ''}`"
        >
          {{ commentCount }}C
        </span>
      </div>
    </div>

    <!-- Team watch coverage. Suppressed at 0: DashboardView passes `?? 0` while
         coverage is still loading, so an always-on chip would print "0%" on
         every row - and an unwatched video is better said by no mark at all. -->
    <span
      v-if="watchedPercentLabel !== null"
      class="shrink-0 font-mono text-[11px] tracking-wider text-gray-500 dark:text-gray-400"
      title="Watched by the team"
    >
      {{ watchedPercentLabel }}%
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Project } from '../types/project';
import { formatRelativeTime } from '@/utils/relativeTime';

// Props
const props = defineProps<{
  project: Project;
  isSelected: boolean;
  isInspected?: boolean;
  isDragging: boolean;
  commentCount?: number;
  annotationCount?: number;
  watchPercent?: number;
  openedAt?: string;
}>();

// Emits
const emit = defineEmits<{
  select: [project: Project, event: MouseEvent];
  inspect: [project: Project];
  dragstart: [project: Project, event: DragEvent];
  dragend: [event: DragEvent];
}>();

/**
 * Rounded coverage, or null when there is nothing to say. A video nobody has
 * watched and a video whose coverage has not loaded yet both arrive here as 0,
 * and neither earns a token in the row.
 */
const watchedPercentLabel = computed((): number | null => {
  if (props.watchPercent === undefined) return null;
  const rounded = Math.round(props.watchPercent);
  return rounded > 0 ? rounded : null;
});

/**
 * "5M AGO" for a project this user has opened, empty otherwise. Empty covers
 * both never-opened and an unparseable timestamp, and the template renders no
 * token in either case - same suppression rule the coverage chip uses.
 */
const openedLabel = computed(() =>
  props.openedAt ? formatRelativeTime(props.openedAt) : ''
);

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
