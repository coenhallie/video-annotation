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
        <h2 class="text-xl font-semibold text-gray-900">
          Load or Upload Video
        </h2>
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

      <!-- Tabs -->
      <div class="border-b border-gray-200">
        <nav class="flex space-x-8 px-6" aria-label="Tabs">
          <button
            @click="activeTab = 'previous'"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === 'previous'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ]"
          >
            Previous Videos
          </button>
          <button
            @click="activeTab = 'upload'"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === 'upload'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ]"
          >
            Upload New Video
          </button>
          <button
            @click="activeTab = 'compare'"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === 'compare'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ]"
          >
            Compare Videos
          </button>
        </nav>
      </div>

      <!-- Modal Content -->
      <div class="p-6 overflow-y-auto max-h-[60vh]">
        <!-- Previous Videos Tab -->
        <div v-if="activeTab === 'previous'">
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
                  <div class="flex items-center gap-2 mb-2">
                    <h3 class="font-medium text-gray-900">
                      {{ video.title }}
                    </h3>
                    <span
                      v-if="video.video_type === 'upload'"
                      class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
                    >
                      Uploaded
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      URL
                    </span>
                  </div>
                  <div class="text-sm text-gray-600 space-y-1">
                    <p class="truncate">
                      <span class="font-medium">
                        {{ video.video_type === 'upload' ? 'File:' : 'URL:' }}
                      </span>
                      {{
                        video.video_type === 'upload'
                          ? video.original_filename
                          : video.url
                      }}
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
                      <span
                        v-if="video.video_type === 'upload' && video.file_size"
                      >
                        <span class="font-medium">Size:</span>
                        {{ formatFileSize(video.file_size) }}
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

        <!-- Upload Tab -->
        <div v-else-if="activeTab === 'upload'">
          <VideoUpload
            @upload-success="handleUploadSuccess"
            @upload-error="handleUploadError"
          />
        </div>

        <!-- Compare Videos Tab -->
        <div v-else-if="activeTab === 'compare'">
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
            <p class="text-gray-600">You need at least 2 videos to compare.</p>
          </div>

          <!-- Dual Video Selection -->
          <div v-else-if="videos.length < 2" class="text-center py-12">
            <div class="text-yellow-500 mb-4">
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
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                ></path>
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">
              Not enough videos
            </h3>
            <p class="text-gray-600">
              You need at least 2 videos to compare. Upload more videos first.
            </p>
          </div>

          <!-- Video Selection Interface -->
          <div v-else class="space-y-6">
            <div class="text-center mb-6">
              <h3 class="text-lg font-medium text-gray-900 mb-2">
                Select Two Videos to Compare
              </h3>
              <p class="text-gray-600">
                Choose videos to view side-by-side for comparison.
              </p>
            </div>

            <!-- Video A Selection -->
            <div class="space-y-3">
              <label class="block text-sm font-medium text-gray-700">
                Video A (Left Side)
              </label>
              <div
                class="grid grid-cols-1 gap-3 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3"
              >
                <div
                  v-for="video in videos"
                  :key="`a-${video.id}`"
                  class="border border-gray-200 rounded-lg p-3 cursor-pointer transition-all"
                  :class="[
                    selectedVideoA?.id === video.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:border-blue-300 hover:shadow-sm',
                    selectedVideoB?.id === video.id
                      ? 'opacity-50 cursor-not-allowed'
                      : '',
                  ]"
                  @click="selectVideoA(video)"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-medium text-gray-900 text-sm">
                          {{ video.title }}
                        </h4>
                        <span
                          v-if="video.video_type === 'upload'"
                          class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                        >
                          Uploaded
                        </span>
                        <span
                          v-else
                          class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          URL
                        </span>
                      </div>
                      <div class="text-xs text-gray-600">
                        {{ formatDuration(video.duration) }} •
                        {{ video.fps }} FPS
                      </div>
                    </div>
                    <div v-if="selectedVideoA?.id === video.id" class="ml-2">
                      <svg
                        class="w-5 h-5 text-blue-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Video B Selection -->
            <div class="space-y-3">
              <label class="block text-sm font-medium text-gray-700">
                Video B (Right Side)
              </label>
              <div
                class="grid grid-cols-1 gap-3 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3"
              >
                <div
                  v-for="video in videos"
                  :key="`b-${video.id}`"
                  class="border border-gray-200 rounded-lg p-3 cursor-pointer transition-all"
                  :class="[
                    selectedVideoB?.id === video.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:border-blue-300 hover:shadow-sm',
                    selectedVideoA?.id === video.id
                      ? 'opacity-50 cursor-not-allowed'
                      : '',
                  ]"
                  @click="selectVideoB(video)"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-medium text-gray-900 text-sm">
                          {{ video.title }}
                        </h4>
                        <span
                          v-if="video.video_type === 'upload'"
                          class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                        >
                          Uploaded
                        </span>
                        <span
                          v-else
                          class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          URL
                        </span>
                      </div>
                      <div class="text-xs text-gray-600">
                        {{ formatDuration(video.duration) }} •
                        {{ video.fps }} FPS
                      </div>
                    </div>
                    <div v-if="selectedVideoB?.id === video.id" class="ml-2">
                      <svg
                        class="w-5 h-5 text-blue-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div
        class="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50"
      >
        <!-- Compare Button (only shown in compare tab when both videos are selected) -->
        <button
          v-if="activeTab === 'compare' && selectedVideoA && selectedVideoB"
          @click="confirmDualVideoSelection"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          Compare Selected Videos
        </button>
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
import VideoUpload from './VideoUpload.vue';

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
  'video-selected',
  'video-removed',
  'dual-videos-selected',
]);

// Composables
const { user } = useAuth();

// State
const videos = ref([]);
const annotationCounts = ref({});
const isLoading = ref(false);
const error = ref(null);
const activeTab = ref('previous');
const selectedVideoA = ref(null);
const selectedVideoB = ref(null);

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

  // Prevent multiple simultaneous loads
  if (isLoading.value) return;

  isLoading.value = true;
  error.value = null;

  try {
    console.log(
      '🎬 [LoadVideoModal] Loading videos for user:',
      user.value.email
    );

    // Clear videos array before loading new ones
    videos.value = [];
    annotationCounts.value = {};

    const userVideos = await VideoService.getUserVideos(user.value.id);

    // Add deduplication logic to prevent duplicate videos
    const uniqueVideos =
      userVideos?.filter(
        (video, index, arr) => arr.findIndex((v) => v.id === video.id) === index
      ) || [];

    videos.value = uniqueVideos;

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

    // Emit the selected video and its annotations with complete metadata
    emit('video-selected', {
      video,
      annotations: annotations || [],
      // Pass additional metadata for the annotation system
      videoMetadata: {
        existingVideo: video, // Pass the complete existing video record
        videoType: video.video_type, // Preserve the original video type
        title: video.title,
        fps: video.fps,
        duration: video.duration,
        totalFrames: video.total_frames,
      },
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
    // Remove video from Supabase
    await VideoService.deleteVideo(video.id);

    // Remove from local list
    videos.value = videos.value.filter((v) => v.id !== video.id);

    // Remove from annotation counts
    delete annotationCounts.value[video.id];

    // Emit removal event
    emit('video-removed', video);
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

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Upload handlers
const handleUploadSuccess = async (videoRecord) => {
  try {
    // Load annotations for the uploaded video (should be empty)
    const annotations = await AnnotationService.getVideoAnnotations(
      videoRecord.id
    );

    // Emit the uploaded video and its annotations with complete metadata
    emit('video-selected', {
      video: videoRecord,
      annotations: annotations || [],
      // Pass additional metadata for the annotation system
      videoMetadata: {
        existingVideo: videoRecord, // Pass the complete existing video record
        videoType: videoRecord.video_type, // Preserve the original video type (should be 'upload')
        title: videoRecord.title,
        fps: videoRecord.fps,
        duration: videoRecord.duration,
        totalFrames: videoRecord.total_frames,
      },
    });

    closeModal();
  } catch (err) {
    console.error(
      '❌ [LoadVideoModal] Error loading uploaded video annotations:',
      err
    );
    error.value = 'Failed to load video annotations. Please try again.';
  }
};

const handleUploadError = (uploadError) => {
  console.error('❌ [LoadVideoModal] Upload error:', uploadError);
  error.value = uploadError.message || 'Upload failed. Please try again.';
};

// Dual video selection methods
const selectVideoA = (video) => {
  if (selectedVideoB.value?.id === video.id) {
    return; // Can't select the same video for both A and B
  }
  selectedVideoA.value = video;
};

const selectVideoB = (video) => {
  if (selectedVideoA.value?.id === video.id) {
    return; // Can't select the same video for both A and B
  }
  selectedVideoB.value = video;
};

const confirmDualVideoSelection = async () => {
  if (!selectedVideoA.value || !selectedVideoB.value) {
    return;
  }

  try {
    console.log(
      '🎬 [LoadVideoModal] Loading dual videos and annotations:',
      selectedVideoA.value.title,
      'and',
      selectedVideoB.value.title
    );

    // 🐛 DEBUG: Log selected video objects before emitting
    console.log('🐛 [DEBUG] Selected VideoA:', {
      id: selectedVideoA.value.id,
      title: selectedVideoA.value.title,
      url: selectedVideoA.value.url,
      video_type: selectedVideoA.value.video_type,
      file_path: selectedVideoA.value.file_path,
      original_filename: selectedVideoA.value.original_filename,
    });
    console.log('🐛 [DEBUG] Selected VideoB:', {
      id: selectedVideoB.value.id,
      title: selectedVideoB.value.title,
      url: selectedVideoB.value.url,
      video_type: selectedVideoB.value.video_type,
      file_path: selectedVideoB.value.file_path,
      original_filename: selectedVideoB.value.original_filename,
    });

    // Load annotations for both selected videos
    const [annotationsA, annotationsB] = await Promise.all([
      AnnotationService.getVideoAnnotations(selectedVideoA.value.id),
      AnnotationService.getVideoAnnotations(selectedVideoB.value.id),
    ]);

    // Emit the dual video selection event
    emit('dual-videos-selected', {
      videoA: selectedVideoA.value,
      videoB: selectedVideoB.value,
      annotationsA: annotationsA || [],
      annotationsB: annotationsB || [],
    });

    closeModal();
  } catch (err) {
    console.error(
      '❌ [LoadVideoModal] Error loading dual video annotations:',
      err
    );
    error.value = 'Failed to load video annotations. Please try again.';
  }
};

const resetDualVideoSelection = () => {
  selectedVideoA.value = null;
  selectedVideoB.value = null;
};

// Watch for modal visibility changes
watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue && user.value) {
      // Only load videos if the array is empty or if it's the first time opening
      if (videos.value.length === 0) {
        loadVideos();
      }
      // Reset to previous videos tab when modal opens
      activeTab.value = 'previous';
      // Reset dual video selection
      resetDualVideoSelection();
    }
  },
  { immediate: true }
);
</script>
