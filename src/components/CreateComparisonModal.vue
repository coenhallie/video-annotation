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
          class="absolute inset-0 bg-black/50"
          @click="closeModal"
        />

        <!-- Modal Container -->
        <div class="absolute inset-0 flex items-center justify-center p-4">
          <div
            class="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
            @click.stop
          >
            <!-- Header. The step is a mono token ("2 / 3") instead of a
                 gradient progress bar plus a row of numbered circles. -->
            <div
              class="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10"
            >
              <div class="min-w-0">
                <div class="flex items-baseline gap-2">
                  <h2 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
                    New comparison
                  </h2>
                  <span
                    v-if="currentStep !== 'creating'"
                    class="font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
                  >
                    {{ currentStepIndex + 1 }} / {{ steps.length }}
                  </span>
                </div>
                <p class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {{ stepDescription }}
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                @click="closeModal"
              >
                <svg
                  class="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M18 6 6 18M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <!-- Content Area -->
            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <!-- Loading State -->
              <p
                v-if="isLoading"
                class="py-10 text-center text-[12px] text-gray-600 dark:text-gray-400"
              >
                Loading your videos…
              </p>

              <!-- Error State -->
              <div
                v-else-if="error"
                class="py-10 text-center"
              >
                <p class="text-[12px] text-red-600 dark:text-red-400">
                  {{ error }}
                </p>
                <button
                  type="button"
                  class="mt-4 rounded bg-gray-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
                  @click="loadVideos"
                >
                  Try again
                </button>
              </div>

              <!-- Empty State -->
              <div
                v-else-if="availableVideos.length === 0"
                class="py-10 text-center"
              >
                <p class="text-[12px] text-gray-600 dark:text-gray-400">
                  No videos available
                </p>
                <p class="mx-auto mt-1.5 max-w-xs text-[11px] text-gray-500 dark:text-gray-500">
                  You need at least two videos to create a comparison. Videos appear
                  here once they have been processed by the pipeline.
                </p>
              </div>

              <!-- Step 1: Select Video A -->
              <div v-else-if="currentStep === 'select-video-a'">
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search videos…"
                  class="mb-2 w-full rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
                >

                <!-- Same row shape as the dashboard's video list. -->
                <button
                  v-for="video in filteredVideosForA"
                  :key="video.id"
                  type="button"
                  class="flex w-full items-center gap-3 rounded px-2 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  @click="selectVideoA(video)"
                >
                  <span class="h-9 w-16 shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-white/5">
                    <img
                      v-if="video.thumbnailUrl"
                      :src="video.thumbnailUrl"
                      :alt="video.title"
                      class="h-full w-full object-cover"
                    >
                  </span>
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-[13px] font-medium tracking-tight text-gray-900 dark:text-white"
                    >{{ video.title }}</span>
                    <span
                      class="mt-1 block font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {{ formatDuration(video.duration) }} {{ video.fps || '—' }}FPS
                    </span>
                  </span>
                </button>
              </div>

              <!-- Step 2: Select Video B -->
              <div v-else-if="currentStep === 'select-video-b'">
                <!-- Selected Video A Preview -->
                <div
                  class="mb-3 flex items-center gap-2 border-b border-gray-200 pb-3 dark:border-white/10"
                >
                  <span
                    class="font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
                  >A</span>
                  <span class="truncate text-[12px] text-gray-700 dark:text-gray-200">
                    {{ selectedVideoA?.title }}
                  </span>
                </div>

                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search videos…"
                  class="mb-2 w-full rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
                >

                <button
                  v-for="video in filteredVideosForB"
                  :key="video.id"
                  type="button"
                  class="flex w-full items-center gap-3 rounded px-2 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  @click="selectVideoB(video)"
                >
                  <span class="h-9 w-16 shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-white/5">
                    <img
                      v-if="video.thumbnailUrl"
                      :src="video.thumbnailUrl"
                      :alt="video.title"
                      class="h-full w-full object-cover"
                    >
                  </span>
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-[13px] font-medium tracking-tight text-gray-900 dark:text-white"
                    >{{ video.title }}</span>
                    <span
                      class="mt-1 block font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {{ formatDuration(video.duration) }} {{ video.fps || '—' }}FPS
                    </span>
                  </span>
                </button>
              </div>

              <!-- Step 3: Details -->
              <div v-else-if="currentStep === 'details'">
                <!-- Selected Videos Preview -->
                <div class="grid grid-cols-2 gap-3">
                  <div
                    v-for="side in [
                      { key: 'A', video: selectedVideoA },
                      { key: 'B', video: selectedVideoB },
                    ]"
                    :key="side.key"
                  >
                    <p
                      class="mb-1.5 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
                    >
                      {{ side.key }}
                    </p>
                    <div class="aspect-video overflow-hidden rounded bg-gray-100 dark:bg-white/5">
                      <img
                        v-if="side.video?.thumbnailUrl"
                        :src="side.video.thumbnailUrl"
                        :alt="side.video.title"
                        class="h-full w-full object-cover"
                      >
                    </div>
                    <p
                      class="mt-1.5 truncate text-[12px] font-medium tracking-tight text-gray-900 dark:text-white"
                    >
                      {{ side.video?.title }}
                    </p>
                    <p class="mt-1 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400">
                      {{ formatDuration(side.video?.duration || 0) }}
                      {{ side.video?.fps || '—' }}FPS
                    </p>
                  </div>
                </div>

                <!-- Form -->
                <div class="mt-5 space-y-4">
                  <div>
                    <label
                      class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
                    >
                      Title *
                    </label>
                    <input
                      v-model="comparisonTitle"
                      type="text"
                      placeholder="Describe this comparison"
                      class="w-full rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
                      @keydown.enter="createComparison"
                    >
                  </div>

                  <div>
                    <label
                      class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
                    >
                      Description
                    </label>
                    <textarea
                      v-model="comparisonDescription"
                      rows="3"
                      placeholder="Optional"
                      class="w-full resize-y rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
                    />
                  </div>
                </div>
              </div>

              <!-- Creating State -->
              <p
                v-else-if="currentStep === 'creating'"
                class="py-10 text-center text-[12px] text-gray-600 dark:text-gray-400"
              >
                Creating your comparison…
              </p>
            </div>

            <!-- Footer Actions -->
            <div
              class="flex shrink-0 items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-white/10"
            >
              <button
                v-if="currentStep !== 'select-video-a' && currentStep !== 'creating'"
                type="button"
                class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
                @click="goBack"
              >
                Back
              </button>
              <div v-else />

              <div class="flex items-center gap-3">
                <button
                  type="button"
                  class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
                  @click="closeModal"
                >
                  Cancel
                </button>
                <button
                  v-if="currentStep === 'details'"
                  type="button"
                  :disabled="!comparisonTitle.trim() || isCreating"
                  class="rounded bg-gray-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-700 dark:hover:bg-gray-600"
                  @click="createComparison"
                >
                  {{ isCreating ? 'Creating…' : 'Create' }}
                </button>
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
const emit = defineEmits(['close', 'comparison-created']);

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
