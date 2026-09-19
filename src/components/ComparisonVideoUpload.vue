<template>
  <div>
    <input
      ref="fileInput"
      type="file"
      :accept="ACCEPT"
      class="hidden"
      @change="onPick"
    >

    <!-- At rest: a row in the same shape as the video rows above it. -->
    <button
      v-if="!isUploading"
      type="button"
      data-testid="comparison-upload-button"
      class="flex w-full items-center gap-3 rounded px-2 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
      @click="fileInput?.click()"
    >
      <span
        class="flex h-9 w-16 shrink-0 items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 dark:border-white/15 dark:text-gray-500"
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
            d="M12 16V4m0 0 4 4m-4-4-4 4M4 20h16"
          />
        </svg>
      </span>
      <span class="min-w-0 flex-1">
        <span
          class="block truncate text-[13px] font-medium tracking-tight text-gray-900 dark:text-white"
        >Upload a video</span>
        <span
          class="mt-1 block font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
        >MP4, WebM, OGG or MOV up to 1000MB</span>
      </span>
    </button>

    <!-- Uploading: the same row, with the progress where the duration goes. -->
    <div
      v-else
      class="flex w-full items-center gap-3 rounded px-2 py-2"
    >
      <span
        class="relative h-9 w-16 shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-white/5"
      >
        <span
          class="absolute inset-y-0 left-0 bg-gray-900/15 transition-[width] duration-200 dark:bg-white/15"
          :style="{ width: `${progress}%` }"
        />
      </span>
      <span class="min-w-0 flex-1">
        <span
          class="block truncate text-[13px] font-medium tracking-tight text-gray-900 dark:text-white"
        >{{ fileName }}</span>
        <span
          class="mt-1 block font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
        >{{ statusLine }}</span>
      </span>
      <!-- An upload can be a gigabyte; it has to be stoppable. -->
      <button
        type="button"
        class="shrink-0 rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
        @click="cancel"
      >
        Cancel
      </button>
    </div>

    <!-- Sits under the title column, not under the thumbnail. -->
    <p
      v-if="error"
      class="mt-0.5 pb-1 pl-[84px] pr-2 text-[11px] text-red-600 dark:text-red-400"
    >
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  VideoUploadService,
  ALLOWED_VIDEO_TYPES,
} from '../services/videoUploadService';
import { useAuth } from '../composables/useAuth';
import type { Video } from '../types/database';

// From the service's list, so the picker can never offer what validation rejects.
const ACCEPT = ALLOWED_VIDEO_TYPES.join(',');

const emit = defineEmits<{
  uploaded: [video: Video];
  /** True while a file is being checked, uploaded or saved. */
  busy: [busy: boolean];
}>();

const { user } = useAuth();

const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const fileName = ref('');
const progress = ref(0);
const phase = ref<'checking' | 'uploading' | 'saving'>('checking');
const error = ref<string | null>(null);

// The host uses this to disable whatever would unmount the uploader mid-way.
watch(isUploading, (busy) => emit('busy', busy));

let controller: AbortController | null = null;
const cancel = () => controller?.abort();

// Vue drops emits from an unmounted instance, so an upload left running here
// would finish, insert its row, and never be selected or listed anywhere.
onBeforeUnmount(cancel);

const statusLine = computed(() => {
  if (phase.value === 'uploading') {
    return `Uploading… ${Math.floor(progress.value)}%`;
  }
  return phase.value === 'saving' ? 'Saving…' : 'Checking file…';
});

const reset = () => {
  isUploading.value = false;
  fileName.value = '';
  progress.value = 0;
  phase.value = 'checking';
  // Clear the input so picking the same file again fires change.
  if (fileInput.value) fileInput.value.value = '';
};

const onPick = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !user.value) return;

  error.value = null;

  const validation = VideoUploadService.validateVideoFile(file);
  if (!validation.valid) {
    error.value = validation.error;
    reset();
    return;
  }

  isUploading.value = true;
  fileName.value = file.name;
  phase.value = 'checking';
  controller = new AbortController();
  const { signal } = controller;

  try {
    const compatibility =
      await VideoUploadService.validateVideoCompatibility(file);
    if (!compatibility.valid) {
      error.value = compatibility.error;
      return;
    }

    phase.value = 'uploading';
    const video = await VideoUploadService.uploadVideoComplete(
      file,
      user.value.id,
      {
        signal,
        onProgress: (p) => {
          progress.value = p.percentage;
          if (p.percentage >= 100) phase.value = 'saving';
        },
      }
    );
    emit('uploaded', video);
  } catch (err) {
    // Cancelling is the user's own action, not a failure to report.
    if (signal.aborted) return;
    error.value = `Upload failed: ${
      err instanceof Error ? err.message : 'please try again.'
    }`;
  } finally {
    controller = null;
    reset();
  }
};
</script>
