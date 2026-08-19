<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click="closeModal"
  >
    <div
      class="w-full max-w-sm rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
      @click.stop
    >
      <!-- Modal Header -->
      <div
        class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10"
      >
        <h2 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
          {{ modalTitle }}
        </h2>
        <button
          type="button"
          class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
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

      <!-- Modal Content. The four states used to be announced by a big
           coloured glyph each; the words already say which one you are in. -->
      <div class="px-4 py-4">
        <!-- Loading State -->
        <p
          v-if="isGenerating"
          class="py-6 text-center text-[12px] text-gray-600 dark:text-gray-400"
        >
          Generating shareable link…
        </p>

        <!-- Error State -->
        <div v-else-if="error">
          <p class="text-[12px] leading-relaxed text-red-600 dark:text-red-400">
            {{ error }}
          </p>
          <button
            type="button"
            class="mt-4 rounded bg-gray-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
            @click="generateShareLink"
          >
            Try again
          </button>
        </div>

        <!-- Success State -->
        <div v-else-if="shareUrl">
          <p class="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400">
            {{ shareDescription }}
          </p>

          <!-- Share URL Display -->
          <label
            class="mb-1.5 mt-4 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
          >
            Shareable link
          </label>
          <div class="flex items-center gap-2">
            <input
              ref="shareUrlInput"
              :value="shareUrl"
              readonly
              class="min-w-0 flex-1 rounded border border-gray-200 bg-transparent px-2.5 py-1.5 font-mono text-[11px] tracking-wider text-gray-900 outline-none transition-colors focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:focus:border-white/25"
              @focus="logger.debug('[ShareModal] input focus')"
            >
            <button
              type="button"
              class="shrink-0 rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
              :class="
                copied
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
              "
              @click="copyShareUrl"
            >
              {{ copied ? 'Copied' : 'Copy' }}
            </button>
          </div>
        </div>

        <!-- Initial State -->
        <div v-else>
          <p class="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400">
            Configure sharing permissions for your
            {{ shareType === 'comparison' ? 'comparison video' : 'video' }}.
          </p>

          <!-- Annotation Permission Options -->
          <p
            class="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
          >
            Annotation permissions
          </p>
          <div class="space-y-1">
            <!-- View-only option -->
            <label
              class="flex cursor-pointer items-start gap-2.5 rounded px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
            >
              <input
                v-model="allowAnnotations"
                type="radio"
                :value="false"
                class="mt-0.5 h-3.5 w-3.5 shrink-0 accent-gray-900 dark:accent-gray-400"
              >
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline gap-2">
                  <span class="text-[12px] font-medium text-gray-900 dark:text-white">
                    View-only access
                  </span>
                  <span
                    class="font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
                  >DEFAULT</span>
                </span>
                <span class="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">
                  Anyone with the link can view without signing in. No annotation
                  capabilities.
                </span>
              </span>
            </label>

            <!-- Annotation-enabled option -->
            <label
              class="flex cursor-pointer items-start gap-2.5 rounded px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
            >
              <input
                v-model="allowAnnotations"
                type="radio"
                :value="true"
                class="mt-0.5 h-3.5 w-3.5 shrink-0 accent-gray-900 dark:accent-gray-400"
              >
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline gap-2">
                  <span class="text-[12px] font-medium text-gray-900 dark:text-white">
                    Allow annotations
                  </span>
                  <!-- The sign-in requirement is the consequence people miss,
                       so it stays a token rather than a padlock glyph. -->
                  <span
                    class="font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
                  >SIGN-IN</span>
                </span>
                <span class="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">
                  Recipients must sign in to view and can add annotations.
                </span>
              </span>
            </label>
          </div>

          <!-- Generate Button -->
          <button
            type="button"
            class="mt-5 w-full rounded bg-gray-900 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
            @click="generateShareLink"
          >
            Generate share link
          </button>
        </div>
      </div>

      <!-- Modal Footer -->
      <div
        class="flex items-center justify-end border-t border-gray-200 px-4 py-3 dark:border-white/10"
      >
        <button
          type="button"
          class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
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
const allowAnnotations = ref(false);

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
  allowAnnotations.value = false;
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
        props.comparisonId,
        allowAnnotations.value
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
      const url = await ShareService.createShareableLink(
        props.videoId,
        allowAnnotations.value
      );
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
