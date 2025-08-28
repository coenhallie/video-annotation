<template>
  <div
    :class="[
      'project-card relative group bg-white border rounded-lg overflow-hidden cursor-pointer transition-all',
      isSelected
        ? 'border-blue-500 ring-2 ring-blue-200'
        : 'border-gray-200 hover:border-gray-300 hover:shadow-md',
      isDragging && 'opacity-50',
    ]"
    draggable="true"
    @click="handleClick"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Selection Checkbox -->
    <div
      :class="[
        'absolute top-2 left-2 z-10 transition-opacity',
        isSelected || showCheckbox
          ? 'opacity-100'
          : 'opacity-0 group-hover:opacity-100',
      ]"
    >
      <input
        type="checkbox"
        :checked="isSelected"
        class="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
        @click.stop
        @change="toggleSelection"
      />
    </div>

    <!-- Thumbnail -->
    <div class="aspect-video bg-gray-100 relative overflow-hidden">
      <img
        v-if="project.thumbnailUrl"
        :src="project.thumbnailUrl"
        :alt="project.title"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <svg
          class="w-12 h-12 text-gray-400"
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

      <!-- Project Type Badge -->
      <div class="absolute top-2 left-12">
        <span
          v-if="project.projectType === 'dual'"
          class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
        >
          <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
            />
          </svg>
          Dual
        </span>
      </div>

      <!-- Duration Badge -->
      <div
        class="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-1.5 py-0.5 rounded"
      >
        {{ formatDuration(getDuration()) }}
      </div>
    </div>

    <!-- Content -->
    <div class="p-3">
      <h3 class="font-medium text-gray-900 truncate mb-1">
        {{ project.title }}
      </h3>
      <div class="flex items-center justify-between text-xs text-gray-500">
        <span>{{ formatDate(project.createdAt) }}</span>
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

    <!-- Actions Menu -->
    <div
      :class="[
        'actions-menu absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-30',
        isSelected && 'opacity-100',
      ]"
    >
      <button
        class="p-1.5 bg-white rounded-md shadow-md hover:bg-gray-50 relative z-30"
        @click.stop="toggleActions"
      >
        <svg
          class="w-4 h-4 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>

      <!-- Dropdown Menu -->
      <div
        v-if="showActions"
        class="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-50 py-1 border border-gray-200"
        @click.stop
      >
        <button
          class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          @click="openProject"
        >
          Open
        </button>
        <button
          class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          @click="shareProject"
        >
          Share
        </button>
        <hr class="my-1" />
        <button
          class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          @click.stop="deleteProject"
        >
          Delete
        </button>
      </div>
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
import { ref, onMounted, onUnmounted } from 'vue';
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
const showCheckbox = ref(false);
const showActions = ref(false);
const showShareModal = ref(false);

// Click outside handler
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  // Check if click is outside the actions menu
  if (showActions.value && !target.closest('.actions-menu')) {
    showActions.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

// Methods
const toggleActions = (event: Event) => {
  event.stopPropagation();
  showActions.value = !showActions.value;
};

const handleClick = (event: MouseEvent) => {
  // Don't open project if clicking on actions area
  const target = event.target as HTMLElement;
  if (target.closest('.actions-menu')) {
    return;
  }

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
  showActions.value = false;
  emit('open', props.project);
};

const shareProject = () => {
  showActions.value = false;
  showShareModal.value = true;
};

const closeShareModal = () => {
  showShareModal.value = false;
};

const getVideoIdForSharing = () => {
  if (props.project.projectType === 'single') {
    return props.project.video?.id;
  } else if (props.project.projectType === 'dual') {
    // For dual projects, we need to share the comparison video
    return props.project.id; // This should be the comparison video ID
  }
  return null;
};

const deleteProject = (event: Event) => {
  event.stopPropagation();
  console.log(
    '🗑️ ProjectCard: Delete button clicked for:',
    props.project.title
  );

  // Close the menu immediately but ensure event is emitted
  showActions.value = false;

  // Use nextTick to ensure the menu closes before emitting
  // This prevents any interference with event propagation
  Promise.resolve().then(() => {
    console.log(
      '🗑️ ProjectCard: Emitting delete event for:',
      props.project.title
    );
    emit('delete', props.project);
  });
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
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  }
};
</script>

<style scoped>
.project-card {
  transition: all 0.2s ease;
}
</style>
