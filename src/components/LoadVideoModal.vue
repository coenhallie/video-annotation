<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click="closeModal"
  >
    <div
      class="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden"
      @click.stop
    >
      <!-- Modal Header -->
      <div
        class="flex items-center justify-between p-6 border-b border-gray-200"
      >
        <h2 class="text-xl font-semibold text-gray-900">Load Previous Video</h2>
        <button
          @click="closeModal"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          </svg>
        </button>
      </div>

      <!-- Modal Content -->
      <div class="p-6 overflow-y-auto max-h-[60vh]">
        <!-- Loading State -->
        <div v-if="isLoading" class="flex items-center justify-center py-12">
          <div
            class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"
          ></div>
          <span class="ml-3 text-gray-600">Loading your videos...</span>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-12">
          <div class="text-red-600 mb-2">
            <svg
              class="w-12 h-12 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              ></path>
            </svg>
          </div>
          <p class="text-gray-600">{{ error }}</p>
          <button
            @click="loadVideos"
            class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>

        <!-- Empty State -->
        <div v-else-if="videos.length === 0" class="text-center py-12">
          <div class="text-gray-400 mb-4">
            <svg
              class="w-16 h-16 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              ></path>
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">
            No videos found
          </h3>
          <p class="text-gray-600">You haven't annotated any videos yet.</p>
        </div>

        <!-- Videos List -->
        <div v-else class="space-y-4">
          <div
            v-for="video in videos"
            :key="video.id"
            class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
            @click="selectVideo(video)"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <h3 class="font-medium text-gray-900 mb-2">
                  {{ video.title }}
                </h3>
                <div class="text-sm text-gray-600 space-y-1">
                  <p class="truncate">
                    <span class="font-medium">URL:</span> {{ video.url }}
                  </p>
                  <div class="flex items-center space-x-4">
                    <span>
                      <span class="font-medium">Duration:</span>
                      {{ formatDuration(video.duration) }}
                    </span>
                    <span>
                      <span class="font-medium">FPS:</span> {{ video.fps }}
                    </span>
                    <span>
                      <span class="font-medium">Frames:</span>
                      {{ video.total_frames.toLocaleString() }}
                    </span>
                  </div>
                  <div class="flex items-center space-x-4">
                    <span>
                      <span class="font-medium">Annotations:</span>
                      {{ getAnnotationCount(video.id) }}
                    </span>
                    <span>
                      <span class="font-medium">Created:</span>
                      {{ formatDate(video.created_at) }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="ml-4 flex-shrink-0">
                <button
                  @click="removeVideo(video, $event)"
                  class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all duration-200 group"
                  title="Remove video"
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    ></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div
        class="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50"
      >
        <button
          @click="closeModal"
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { VideoService } from '../services/videoService.ts';
import { AnnotationService } from '../services/annotationService.ts';
import { useAuth } from '../composables/useAuth.ts';

// Props
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false,
  },
});

// Emits
const emit = defineEmits(['close', 'video-selected', 'video-removed']);

// Composables
const { user } = useAuth();

// State
const videos = ref([]);
const annotationCounts = ref({});
const isLoading = ref(false);
const error = ref(null);

// Computed
const getAnnotationCount = computed(() => {
  return (videoId) => annotationCounts.value[videoId] || 0;
});

// Methods
const closeModal = () => {
  emit('close');
};

const loadVideos = async () => {
  if (!user.value) return;

  isLoading.value = true;
  error.value = null;

  try {
    console.log(
      '🎬 [LoadVideoModal] Loading videos for user:',
      user.value.email
    );
    const userVideos = await VideoService.getUserVideos(user.value.id);
    videos.value = userVideos || [];

    // Load annotation counts for each video
    const counts = {};
    for (const video of videos.value) {
      try {
        const annotations = await AnnotationService.getVideoAnnotations(
          video.id
        );
        counts[video.id] = annotations?.length || 0;
      } catch (err) {
        console.warn(`Failed to load annotations for video ${video.id}:`, err);
        counts[video.id] = 0;
      }
    }
    annotationCounts.value = counts;

    console.log('✅ [LoadVideoModal] Loaded videos:', videos.value.length);
  } catch (err) {
    console.error('❌ [LoadVideoModal] Error loading videos:', err);
    error.value = 'Failed to load videos. Please try again.';
  } finally {
    isLoading.value = false;
  }
};

const selectVideo = async (video) => {
  try {
    console.log(
      '🎬 [LoadVideoModal] Loading video and annotations:',
      video.title
    );

    // Load annotations for the selected video
    const annotations = await AnnotationService.getVideoAnnotations(video.id);

    // Emit the selected video and its annotations
    emit('video-selected', {
      video,
      annotations: annotations || [],
    });

    closeModal();
  } catch (err) {
    console.error('❌ [LoadVideoModal] Error loading video annotations:', err);
    error.value = 'Failed to load video annotations. Please try again.';
  }
};

const removeVideo = async (video, event) => {
  event.stopPropagation();

  if (
    !confirm(
      `Are you sure you want to remove "${video.title}"? This action cannot be undone.`
    )
  ) {
    return;
  }

  try {
    console.log('🗑️ [LoadVideoModal] Removing video:', video.title);

    // Remove video from Supabase
    await VideoService.deleteVideo(video.id);

    // Remove from local list
    videos.value = videos.value.filter((v) => v.id !== video.id);

    // Remove from annotation counts
    delete annotationCounts.value[video.id];

    // Emit removal event
    emit('video-removed', video);

    console.log('✅ [LoadVideoModal] Video removed successfully');
  } catch (err) {
    console.error('❌ [LoadVideoModal] Error removing video:', err);
    error.value = 'Failed to remove video. Please try again.';
  }
};

const formatDuration = (seconds) => {
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

const formatDate = (dateString) => {
  const date = new Date(dateString);
  return (
    date.toLocaleDateString() +
    ' ' +
    date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  );
};

// Watch for modal visibility changes
watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue && user.value) {
      loadVideos();
    }
  },
  { immediate: true }
);
</script>
