<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click="closeModal"
  >
    <div
      class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
      @click.stop
    >
      <!-- Modal Header -->
      <div
        class="flex items-center justify-between p-6 border-b border-gray-200"
      >
        <h2 class="text-xl font-semibold text-gray-900">
          {{ modalTitle }}
        </h2>
        <button
          class="text-gray-400 hover:text-gray-600 transition-colors"
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

      <!-- Modal Content -->
      <div class="p-6">
        <!-- Loading State -->
        <div
          v-if="isGenerating"
          class="text-center py-8"
        >
          <div
            class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"
          />
          <p class="text-gray-600">
            Generating shareable link...
          </p>
        </div>

        <!-- Error State -->
        <div
          v-else-if="error"
          class="text-center py-8"
        >
          <div class="text-red-600 mb-4">
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
              />
            </svg>
          </div>
          <p class="text-gray-600 mb-4">
            {{ error }}
          </p>
          <button
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            @click="generateShareLink"
          >
            Try Again
          </button>
        </div>

        <!-- Success State -->
        <div
          v-else-if="shareUrl"
          class="space-y-4"
        >
          <div class="text-center mb-4">
            <div class="text-green-600 mb-2">
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
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">
              Share Link Generated!
            </h3>
            <p class="text-sm text-gray-600">
              {{ shareDescription }}
            </p>
          </div>

          <!-- Share URL Display -->
          <div class="bg-gray-50 rounded-lg p-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Shareable Link
            </label>
            <div class="flex items-center space-x-2">
              <input
                ref="shareUrlInput"
                :value="shareUrl"
                readonly
                class="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                @focus="logger.debug('[ShareModal] input focus')"
              >
              <button
                class="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors flex items-center space-x-1"
                :class="{ 'bg-green-600 hover:bg-green-700': copied }"
                @click="copyShareUrl"
              >
                <svg
                  v-if="!copied"
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <svg
                  v-else
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>{{ copied ? 'Copied!' : 'Copy' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Initial State -->
        <div
          v-else
          class="text-center py-8"
        >
          <div class="text-blue-600 mb-4">
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
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
              />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">
            {{ modalTitle }}
          </h3>
          <p class="text-gray-600 mb-6">
            {{ shareDescription }}
          </p>
          <button
            class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            @click="generateShareLink"
          >
            Generate Share Link
          </button>
        </div>
      </div>

      <!-- Modal Footer -->
      <div
        class="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50"
      >
        <button
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          @click="closeModal"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { logger } from '../utils/logger';
import { ref, computed } from 'vue';
// normalize TS import without extension to avoid TS plugin confusion
import { ShareService } from '../services/shareService.ts';

// Props
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false,
  },
  videoId: {
    type: String,
    default: '',
  },
  comparisonId: {
    type: String,
    default: '',
  },
  shareType: {
    type: String,
    default: 'video',
    // Use plain JS validator to satisfy ESLint/TS parser
    validator: (value) => ['video', 'comparison'].includes(String(value)),
  },
});

// Emits
const emit = defineEmits(['close']);

// State
const shareUrl = ref('');
const isGenerating = ref(false);
const error = ref<string | null>(null);
const copied = ref(false);
const shareUrlInput = ref<HTMLInputElement | null>(null);

// Computed properties
const modalTitle = computed(() => {
  return props.shareType === 'comparison'
    ? 'Share Comparison Video'
    : 'Share Video';
});

const shareDescription = computed(() => {
  return props.shareType === 'comparison'
    ? 'Anyone with this link can view your comparison video and all annotations.'
    : 'Anyone with this link can view your video and all annotations.';
});

// Methods
const closeModal = () => {
  emit('close');
  // Reset state when closing
  shareUrl.value = '';
  error.value = null;
  copied.value = false;
};

const generateShareLink = async () => {
  if (props.shareType === 'comparison') {
    if (!props.comparisonId) {
      error.value = 'No comparison video selected to share';
      return;
    }

    isGenerating.value = true;
    error.value = null;

    try {
      const url = await ShareService.createComparisonShareableLink(
        props.comparisonId
      );
      shareUrl.value = url;
    } catch (err) {
      error.value =
        'Failed to generate comparison share link. Please try again.';
    } finally {
      isGenerating.value = false;
    }
  } else {
    if (!props.videoId) {
      error.value = 'No video selected to share';
      return;
    }

    isGenerating.value = true;
    error.value = null;

    try {
      const url = await ShareService.createShareableLink(props.videoId);
      shareUrl.value = url;
    } catch (err) {
      error.value = 'Failed to generate share link. Please try again.';
    } finally {
      isGenerating.value = false;
    }
  }
};

const copyShareUrl = async () => {
  try {
    await ShareService.copyToClipboard(shareUrl.value);
    copied.value = true;

    // Reset copied state after 2 seconds
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    // Fallback: select the text for manual copying
    if (shareUrlInput.value) {
      shareUrlInput.value.select();
      shareUrlInput.value.setSelectionRange(0, 99999); // For mobile devices
    }
  }
};
</script>
