<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isVisible"
        class="fixed inset-0 z-50 overflow-hidden"
        @keydown.esc="handleEscape"
      >
        <!-- Backdrop with blur -->
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity"
          @click="closeModal"
        />

        <!-- Modal Container -->
        <div class="absolute inset-0 flex items-center justify-center p-4">
          <div
            class="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
            @click.stop
          >
            <!-- Header with Progress -->
            <div class="relative">
              <!-- Progress Bar -->
              <div class="absolute top-0 left-0 right-0 h-1 bg-gray-100">
                <div
                  class="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
                  :style="{ width: progressPercentage + '%' }"
                />
              </div>

              <!-- Header Content -->
              <div class="px-8 py-6 border-b border-gray-100">
                <div class="flex items-center justify-between">
                  <div>
                    <h2 class="text-2xl font-bold text-gray-900">
                      Create Video Comparison
                    </h2>
                    <p class="mt-1 text-sm text-gray-500">
                      {{ stepDescription }}
                    </p>
                  </div>
                  <button
                    class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                    @click="closeModal"
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
                      />
                    </svg>
                  </button>
                </div>

                <!-- Step Indicators -->
                <div class="flex items-center mt-6 space-x-4">
                  <div
                    v-for="(step, index) in steps"
                    :key="step.id"
                    class="flex items-center"
                  >
                    <div
                      :class="[
                        'flex items-center justify-center w-10 h-10 rounded-full transition-all',
                        currentStepIndex === index
                          ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg scale-110'
                          : currentStepIndex > index
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-500',
                      ]"
                    >
                      <svg
                        v-if="currentStepIndex > index"
                        class="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      <span v-else class="font-semibold">{{ index + 1 }}</span>
                    </div>
                    <div
                      v-if="index < steps.length - 1"
                      :class="[
                        'w-24 h-0.5 ml-4 transition-all',
                        currentStepIndex > index
                          ? 'bg-green-500'
                          : 'bg-gray-200',
                      ]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Content Area -->
            <div class="flex-1 p-8 overflow-y-auto min-h-0">
              <!-- Loading State -->
              <div
                v-if="isLoading"
                class="flex flex-col items-center justify-center py-16"
              >
                <div class="relative">
                  <div
                    class="animate-spin rounded-full h-16 w-16 border-4 border-purple-200"
                  />
                  <div
                    class="absolute top-0 animate-spin rounded-full h-16 w-16 border-4 border-transparent border-t-purple-500"
                  />
                </div>
                <p class="mt-4 text-gray-600">Loading your videos...</p>
              </div>

              <!-- Error State -->
              <div
                v-else-if="error"
                class="flex flex-col items-center justify-center py-16"
              >
                <div class="text-red-500 mb-4">
                  <svg
                    class="w-16 h-16"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <p class="text-gray-900 font-medium">
                  {{ error }}
                </p>
                <button
                  class="mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  @click="loadVideos"
                >
                  Try Again
                </button>
              </div>

              <!-- Empty State -->
              <div
                v-else-if="availableVideos.length === 0"
                class="flex flex-col items-center justify-center py-16"
              >
                <div class="text-gray-300 mb-4">
                  <svg
                    class="w-20 h-20"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4"
                    />
                  </svg>
                </div>
                <h3 class="text-lg font-medium text-gray-900 mb-2">
                  No videos available
                </h3>
                <p class="text-gray-600 text-center max-w-md">
                  You need at least two videos to create a comparison. Upload
                  some videos first to get started.
                </p>
                <button
                  class="mt-6 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transform hover:scale-105 transition-all"
                  @click="$emit('upload-video')"
                >
                  Upload Videos
                </button>
              </div>

              <!-- Step 1: Select Video A -->
              <div v-else-if="currentStep === 'select-video-a'">
                <div class="mb-6">
                  <h3 class="text-lg font-semibold text-gray-900 mb-2">
                    Select the first video
                  </h3>
                  <p class="text-gray-600">
                    Choose the video you want to display on the left side of the
                    comparison
                  </p>
                </div>

                <!-- Search Bar -->
                <div class="mb-6">
                  <div class="relative">
                    <input
                      v-model="searchQuery"
                      type="text"
                      placeholder="Search videos..."
                      class="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                    />
                    <svg
                      class="absolute left-4 top-3.5 w-5 h-5 text-gray-400"
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
                  </div>
                </div>

                <!-- Video Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    v-for="video in filteredVideosForA"
                    :key="video.id"
                    class="group relative bg-white border-2 border-gray-200 rounded-xl overflow-hidden hover:border-purple-400 hover:shadow-xl transition-all cursor-pointer"
                    @click="selectVideoA(video)"
                  >
                    <!-- Thumbnail -->
                    <div
                      class="aspect-video bg-gray-100 relative overflow-hidden"
                    >
                      <img
                        v-if="video.thumbnailUrl"
                        :src="video.thumbnailUrl"
                        :alt="video.title"
                        class="w-full h-full object-cover"
                      />
                      <div
                        v-else
                        class="w-full h-full flex items-center justify-center"
                      >
                        <svg
                          class="w-16 h-16 text-gray-300"
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
                      <!-- Overlay on hover -->
                      <div
                        class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end"
                      >
                        <div class="p-4 text-white">
                          <p class="text-sm font-medium">Click to select</p>
                        </div>
                      </div>
                    </div>
                    <!-- Video Info -->
                    <div class="p-4">
                      <h4 class="font-semibold text-gray-900 truncate">
                        {{ video.title }}
                      </h4>
                      <div
                        class="flex items-center gap-4 mt-2 text-sm text-gray-500"
                      >
                        <span class="flex items-center gap-1">
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
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          {{ formatDuration(video.duration) }}
                        </span>
                        <span class="flex items-center gap-1">
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
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          {{ video.fps || '—' }} FPS
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Step 2: Select Video B -->
              <div v-else-if="currentStep === 'select-video-b'">
                <!-- Selected Video A Preview -->
                <div
                  class="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl"
                >
                  <div class="flex items-center gap-4">
                    <div class="flex-shrink-0">
                      <div
                        class="w-20 h-14 bg-white rounded-lg overflow-hidden shadow-md"
                      >
                        <img
                          v-if="selectedVideoA?.thumbnailUrl"
                          :src="selectedVideoA.thumbnailUrl"
                          :alt="selectedVideoA.title"
                          class="w-full h-full object-cover"
                        />
                        <div
                          v-else
                          class="w-full h-full flex items-center justify-center bg-gray-100"
                        >
                          <svg
                            class="w-8 h-8 text-gray-400"
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
                    </div>
                    <div class="flex-1">
                      <p class="text-sm font-medium text-purple-900">
                        Video A (Left)
                      </p>
                      <p class="text-purple-700 font-semibold">
                        {{ selectedVideoA?.title }}
                      </p>
                    </div>
                  </div>
                </div>

                <div class="mb-6">
                  <h3 class="text-lg font-semibold text-gray-900 mb-2">
                    Select the second video
                  </h3>
                  <p class="text-gray-600">
                    Choose the video you want to display on the right side of
                    the comparison
                  </p>
                </div>

                <!-- Search Bar -->
                <div class="mb-6">
                  <div class="relative">
                    <input
                      v-model="searchQuery"
                      type="text"
                      placeholder="Search videos..."
                      class="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                    />
                    <svg
                      class="absolute left-4 top-3.5 w-5 h-5 text-gray-400"
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
                  </div>
                </div>

                <!-- Video Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    v-for="video in filteredVideosForB"
                    :key="video.id"
                    class="group relative bg-white border-2 border-gray-200 rounded-xl overflow-hidden hover:border-purple-400 hover:shadow-xl transition-all cursor-pointer"
                    @click="selectVideoB(video)"
                  >
                    <!-- Thumbnail -->
                    <div
                      class="aspect-video bg-gray-100 relative overflow-hidden"
                    >
                      <img
                        v-if="video.thumbnailUrl"
                        :src="video.thumbnailUrl"
                        :alt="video.title"
                        class="w-full h-full object-cover"
                      />
                      <div
                        v-else
                        class="w-full h-full flex items-center justify-center"
                      >
                        <svg
                          class="w-16 h-16 text-gray-300"
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
                      <!-- Overlay on hover -->
                      <div
                        class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end"
                      >
                        <div class="p-4 text-white">
                          <p class="text-sm font-medium">Click to select</p>
                        </div>
                      </div>
                    </div>
                    <!-- Video Info -->
                    <div class="p-4">
                      <h4 class="font-semibold text-gray-900 truncate">
                        {{ video.title }}
                      </h4>
                      <div
                        class="flex items-center gap-4 mt-2 text-sm text-gray-500"
                      >
                        <span class="flex items-center gap-1">
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
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          {{ formatDuration(video.duration) }}
                        </span>
                        <span class="flex items-center gap-1">
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
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          {{ video.fps || '—' }} FPS
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Step 3: Details -->
              <div v-else-if="currentStep === 'details'">
                <!-- Selected Videos Preview -->
                <div class="grid grid-cols-2 gap-4 mb-8">
                  <div
                    class="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4"
                  >
                    <p class="text-sm font-medium text-purple-900 mb-2">
                      Video A (Left)
                    </p>
                    <div class="bg-white rounded-lg overflow-hidden shadow-md">
                      <div class="aspect-video bg-gray-100">
                        <img
                          v-if="selectedVideoA?.thumbnailUrl"
                          :src="selectedVideoA.thumbnailUrl"
                          :alt="selectedVideoA.title"
                          class="w-full h-full object-cover"
                        />
                      </div>
                      <div class="p-3">
                        <p class="font-semibold text-gray-900 text-sm truncate">
                          {{ selectedVideoA?.title }}
                        </p>
                        <p class="text-xs text-gray-500 mt-1">
                          {{ formatDuration(selectedVideoA?.duration || 0) }} •
                          {{ selectedVideoA?.fps || '—' }} FPS
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    class="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4"
                  >
                    <p class="text-sm font-medium text-blue-900 mb-2">
                      Video B (Right)
                    </p>
                    <div class="bg-white rounded-lg overflow-hidden shadow-md">
                      <div class="aspect-video bg-gray-100">
                        <img
                          v-if="selectedVideoB?.thumbnailUrl"
                          :src="selectedVideoB.thumbnailUrl"
                          :alt="selectedVideoB.title"
                          class="w-full h-full object-cover"
                        />
                      </div>
                      <div class="p-3">
                        <p class="font-semibold text-gray-900 text-sm truncate">
                          {{ selectedVideoB?.title }}
                        </p>
                        <p class="text-xs text-gray-500 mt-1">
                          {{ formatDuration(selectedVideoB?.duration || 0) }} •
                          {{ selectedVideoB?.fps || '—' }} FPS
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Form -->
                <div class="space-y-6">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                      Comparison Title *
                    </label>
                    <input
                      v-model="comparisonTitle"
                      type="text"
                      placeholder="Enter a descriptive title for this comparison"
                      class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                      @keydown.enter="createComparison"
                    />
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                      Description (Optional)
                    </label>
                    <textarea
                      v-model="comparisonDescription"
                      rows="3"
                      placeholder="Add notes about what you're comparing..."
                      class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none"
                    />
                  </div>
                </div>
              </div>

              <!-- Creating State -->
              <div v-else-if="currentStep === 'creating'">
                <div class="flex flex-col items-center justify-center py-16">
                  <div class="relative mb-8">
                    <div class="animate-pulse">
                      <svg
                        class="w-24 h-24 text-purple-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                  </div>
                  <h3 class="text-xl font-semibold text-gray-900 mb-2">
                    Creating your comparison...
                  </h3>
                  <p class="text-gray-600">This will just take a moment</p>
                </div>
              </div>
            </div>

            <!-- Footer Actions -->
            <div
              class="flex-shrink-0 px-8 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl"
            >
              <div class="flex items-center justify-between">
                <button
                  v-if="
                    currentStep !== 'select-video-a' &&
                    currentStep !== 'creating'
                  "
                  class="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  @click="goBack"
                >
                  ← Back
                </button>
                <div v-else />

                <div class="flex items-center gap-3">
                  <button
                    class="px-6 py-2.5 text-gray-500 hover:text-gray-700 transition-colors"
                    @click="closeModal"
                  >
                    Cancel
                  </button>
                  <button
                    v-if="currentStep === 'details'"
                    :disabled="!comparisonTitle.trim() || isCreating"
                    class="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    @click="createComparison"
                  >
                    <span v-if="!isCreating">Create Comparison</span>
                    <span v-else class="flex items-center gap-2">
                      <svg
                        class="animate-spin h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                        />
                        <path
                          class="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Creating...
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { VideoService } from '../services/videoService';
import { ComparisonVideoService } from '../services/comparisonVideoService';
import { useAuth } from '../composables/useAuth';
import { useNotifications } from '../composables/useNotifications';

// Props
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false,
  },
});

// Emits
const emit = defineEmits(['close', 'comparison-created', 'upload-video']);

// Auth
const { user } = useAuth();
const { addNotification } = useNotifications();

// State
const currentStep = ref('select-video-a');
const selectedVideoA = ref<any>(null);
const selectedVideoB = ref<any>(null);
const comparisonTitle = ref('');
const comparisonDescription = ref('');
const searchQuery = ref('');
const isLoading = ref(false);
const isCreating = ref(false);
const error = ref<string | null>(null);
const availableVideos = ref<any[]>([]);

// Steps configuration
const steps = [
  { id: 'select-video-a', label: 'Select Video A' },
  { id: 'select-video-b', label: 'Select Video B' },
  { id: 'details', label: 'Details' },
];

// Computed
const currentStepIndex = computed(() => {
  return steps.findIndex((step) => step.id === currentStep.value);
});

const progressPercentage = computed(() => {
  if (currentStep.value === 'creating') return 100;
  return ((currentStepIndex.value + 1) / steps.length) * 100;
});

const stepDescription = computed(() => {
  switch (currentStep.value) {
    case 'select-video-a':
      return 'Choose the first video for your comparison';
    case 'select-video-b':
      return 'Choose the second video for your comparison';
    case 'details':
      return 'Add details about your comparison';
    case 'creating':
      return 'Setting up your comparison...';
    default:
      return '';
  }
});

const filteredVideosForA = computed(() => {
  if (!searchQuery.value) return availableVideos.value;

  const query = searchQuery.value.toLowerCase();
  return availableVideos.value.filter((video: any) =>
    video.title.toLowerCase().includes(query)
  );
});

const filteredVideosForB = computed(() => {
  // Exclude the selected video A from the list
  const videos = selectedVideoA.value
    ? availableVideos.value.filter((v: any) => v.id !== selectedVideoA.value.id)
    : availableVideos.value;

  if (!searchQuery.value) return videos;

  const query = searchQuery.value.toLowerCase();
  return videos.filter((video: any) =>
    video.title.toLowerCase().includes(query)
  );
});

// Methods
const handleEscape = () => {
  if (!isCreating.value) {
    closeModal();
  }
};

const closeModal = () => {
  // Reset state
  currentStep.value = 'select-video-a';
  selectedVideoA.value = null;
  selectedVideoB.value = null;
  comparisonTitle.value = '';
  comparisonDescription.value = '';
  searchQuery.value = '';
  error.value = null;
  emit('close');
};

const loadVideos = async () => {
  if (!user.value) return;

  isLoading.value = true;
  error.value = null;

  try {
    const videos = await VideoService.getUserVideos(user.value.id);
    availableVideos.value = videos || [];

    if (availableVideos.value.length < 2) {
      error.value = 'You need at least two videos to create a comparison.';
    }
  } catch (err: any) {
    console.error('Error loading videos:', err);
    error.value = err.message || 'Failed to load videos';
  } finally {
    isLoading.value = false;
  }
};

const selectVideoA = (video: any) => {
  selectedVideoA.value = video;
  currentStep.value = 'select-video-b';
  searchQuery.value = '';
};

const selectVideoB = async (video: any) => {
  selectedVideoB.value = video;
  searchQuery.value = '';

  // Check if this comparison already exists
  if (user.value) {
    try {
      const existing = await ComparisonVideoService.findExistingComparison(
        selectedVideoA.value.id,
        video.id,
        user.value.id
      );

      if (existing) {
        // Show warning but still allow them to proceed (they might want different title/description)
        addNotification({
          type: 'info',
          title: 'Comparison Already Exists',
          message: `A comparison between these videos already exists: "${existing.title}". You can still create a new one with a different title if needed.`,
          duration: 6000,
        });
      }
    } catch (err) {
      console.warn('Error checking for existing comparison:', err);
      // Don't block the user if the check fails
    }
  }

  currentStep.value = 'details';

  // Auto-generate title if empty
  if (!comparisonTitle.value) {
    comparisonTitle.value = `${selectedVideoA.value.title} vs ${selectedVideoB.value.title}`;
  }
};

const goBack = () => {
  if (currentStep.value === 'select-video-b') {
    currentStep.value = 'select-video-a';
    selectedVideoB.value = null;
  } else if (currentStep.value === 'details') {
    currentStep.value = 'select-video-b';
  }
};

const createComparison = async () => {
  if (
    !comparisonTitle.value.trim() ||
    !selectedVideoA.value ||
    !selectedVideoB.value
  ) {
    return;
  }

  isCreating.value = true;
  currentStep.value = 'creating';

  try {
    const comparison = await ComparisonVideoService.createComparisonVideo({
      title: comparisonTitle.value.trim(),
      description: comparisonDescription.value.trim() || null,
      videoAId: selectedVideoA.value.id,
      videoBId: selectedVideoB.value.id,
      userId: user.value?.id || null,
      videoA: selectedVideoA.value,
      videoB: selectedVideoB.value,
    });

    addNotification({
      type: 'success',
      title: 'Comparison Created',
      message: 'Your video comparison has been created successfully.',
    });

    emit('comparison-created', comparison);
    closeModal();
  } catch (err: any) {
    console.error('Error creating comparison:', err);

    // Handle duplicate comparison error specially
    if (err.code === 'DUPLICATE_COMPARISON') {
      const existingTitle =
        err.existingComparison?.title || 'Untitled Comparison';

      addNotification({
        type: 'warning',
        title: 'Comparison Already Exists',
        message: `A comparison between these videos already exists: "${existingTitle}". You can find it in your projects list.`,
        duration: 8000, // Show for longer since it's important information
      });

      // If we have the existing comparison, we could emit it to open it
      if (err.existingComparison) {
        emit('comparison-created', err.existingComparison);
      }
      closeModal();
    } else {
      // Handle other errors normally
      addNotification({
        type: 'error',
        title: 'Creation Failed',
        message: err.message || 'Failed to create comparison',
      });
      currentStep.value = 'details';
    }
  } finally {
    isCreating.value = false;
  }
};

const formatDuration = (seconds: number) => {
  if (!seconds || seconds === 0) return '0:00';

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

// Load videos when modal opens
watch(
  () => props.isVisible,
  (newVal) => {
    if (newVal && user.value) {
      loadVideos();
    }
  }
);

// Load videos on mount if modal is visible
onMounted(() => {
  if (props.isVisible && user.value) {
    loadVideos();
  }
});
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
