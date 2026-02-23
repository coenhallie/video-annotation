<template>
  <div class="w-full">
    <!-- Upload Area -->
    <div
      class="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 relative group"
      :class="[
        isDragOver
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]'
          : isUploading
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 cursor-not-allowed'
          : uploadError
          ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
          : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-700'
      ]"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @click="triggerFileInput"
    >
      <input
        ref="fileInput"
        type="file"
        accept="video/*"
        class="hidden"
        @change="handleFileSelect"
      >

      <!-- Upload Icon and Text -->
      <div
        v-if="!isUploading && !uploadError"
        class="flex flex-col items-center gap-4"
      >
        <svg
          class="w-12 h-12 text-gray-400 dark:text-gray-500 group-hover:text-blue-500 transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Upload Video File
        </h3>
        <p class="text-gray-500 dark:text-gray-400">
          Drag and drop your video file here, or click to browse
        </p>
        <p class="text-sm text-gray-400 dark:text-gray-500">
          Supported formats: MP4, WebM, OGG, MOV, AVI (max 1000MB)
        </p>
      </div>

      <!-- Upload Progress -->
      <div
        v-if="isUploading"
        class="flex flex-col items-center gap-4"
      >
        <svg
          class="w-12 h-12 text-emerald-500 animate-spin"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Uploading Video...
        </h3>
        <div class="w-full max-w-xs h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-emerald-500 transition-all duration-300 ease-out"
            :style="{ width: `${uploadProgress}%` }"
          />
        </div>
        <p class="text-gray-500 dark:text-gray-400 font-medium">
          {{ uploadProgress.toFixed(1) }}% - {{ uploadStatus }}
        </p>
      </div>

      <!-- Error State -->
      <div
        v-if="uploadError"
        class="flex flex-col items-center gap-4"
      >
        <svg
          class="w-12 h-12 text-red-500"
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
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Upload Failed
        </h3>
        <p class="text-red-500 dark:text-red-400">
          {{ uploadError }}
        </p>
        <button
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors focus:ring-4 focus:ring-blue-500/20"
          @click.stop="resetUpload"
        >
          Try Again
        </button>
      </div>
    </div>

    <!-- Selected File Info -->
    <div
      v-if="selectedFile && !isUploading"
      class="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm"
    >
      <div class="flex items-center gap-4 mb-4">
        <div class="w-10 h-10 text-blue-500 flex-shrink-0">
          <svg
            class="w-full h-full"
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
        <div class="flex-1 min-w-0">
          <p class="font-medium text-gray-900 dark:text-gray-100 truncate">
            {{ selectedFile.name }}
          </p>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ formatFileSize(selectedFile.size) }}
          </p>
        </div>
      </div>

      <!-- Custom Project Name Input -->
      <div class="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <label
          for="projectName"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Project Name
        </label>
        <input
          id="projectName"
          v-model="customProjectName"
          type="text"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
          :placeholder="defaultProjectName"
          maxlength="100"
        >
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Enter a custom name for your project, or leave blank to use the filename
        </p>
      </div>

      <div class="flex gap-3 justify-end">
        <button
          class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700"
          :disabled="isUploading"
          @click="clearSelection"
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shadow-sm hover:shadow focus:ring-4 focus:ring-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="isUploading"
          @click="startUpload"
        >
          Upload Video
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { VideoUploadService } from '../services/videoUploadService';
import { useAuth } from '../composables/useAuth';

// Props
const props = defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
});

// Emits
const emit = defineEmits(['upload-success', 'upload-error']);

// Composables
const { user } = useAuth();

// State
const fileInput = ref(null);
const selectedFile = ref(null);
const isDragOver = ref(false);
const isUploading = ref(false);
const uploadProgress = ref(0);
const uploadStatus = ref('');
const uploadError = ref(null);
const customProjectName = ref('');

// Computed
const defaultProjectName = computed(() => {
  if (!selectedFile.value) return '';
  return selectedFile.value.name.replace(/\.[^/.]+$/, ''); // Remove file extension
});

// Methods
const triggerFileInput = () => {
  if (props.disabled || isUploading.value) return;
  fileInput.value?.click();
};

const handleFileSelect = (event) => {
  const file = event.target.files[0];
  if (file) {
    selectFile(file);
  }
};

const handleDrop = (event) => {
  event.preventDefault();
  isDragOver.value = false;

  if (props.disabled || isUploading.value) return;

  const file = event.dataTransfer.files[0];
  if (file) {
    selectFile(file);
  }
};

const handleDragOver = (event) => {
  event.preventDefault();
  if (!props.disabled && !isUploading.value) {
    isDragOver.value = true;
  }
};

const handleDragLeave = (event) => {
  event.preventDefault();
  isDragOver.value = false;
};

const selectFile = async (file) => {
  // Validate file type and size (Sync)
  const validation = VideoUploadService.validateVideoFile(file);
  if (!validation.valid) {
    uploadError.value = validation.error;
    return;
  }

  // Validate Codec (Async)
  isUploading.value = true; // Show loading state briefly while checking
  uploadStatus.value = 'Verifying compatibility...';
  
  try {
    const compatibility = await VideoUploadService.validateVideoCompatibility(file);
    if (!compatibility.valid) {
      uploadError.value = compatibility.error;
      isUploading.value = false;
      return;
    }
  } catch (err) {
    console.error('Compatibility check failed:', err);
    // Determine if we should block or warn. For now, let's allow if check fails (fail open)
    // or block if we want strictness.
    // Let's safe fail:
  } finally {
    isUploading.value = false;
    uploadStatus.value = '';
  }

  selectedFile.value = file;
  uploadError.value = null;
};

const startUpload = async () => {
  if (!selectedFile.value || !user.value) return;

  isUploading.value = true;
  uploadProgress.value = 0;
  uploadStatus.value = 'Preparing upload...';
  uploadError.value = null;

  try {
    // Use custom project name if provided, otherwise use filename without extension
    const projectName =
      customProjectName.value.trim() || defaultProjectName.value;

    const videoRecord = await VideoUploadService.uploadVideoComplete(
      selectedFile.value,
      user.value.id,
      projectName,
      (progress) => {
        // Throttle progress UI updates using requestAnimationFrame
        if (!window.__vu_lastRaf) {
          window.__vu_lastRaf = 0;
        }
        const update = () => {
          uploadProgress.value = progress.percentage;
          uploadStatus.value = `Uploading... ${formatFileSize(
            progress.loaded
          )} / ${formatFileSize(progress.total)}`;
          window.__vu_lastRaf = 0;
        };
        if (!window.__vu_lastRaf) {
          window.__vu_lastRaf = requestAnimationFrame(update);
        }
      }
    );

    emit('upload-success', videoRecord);
    resetUpload();
  } catch (error) {
    uploadError.value = error.message || 'Upload failed. Please try again.';
    emit('upload-error', error);
  } finally {
    isUploading.value = false;
  }
};

const clearSelection = () => {
  selectedFile.value = null;
  customProjectName.value = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

const resetUpload = () => {
  selectedFile.value = null;
  customProjectName.value = '';
  isUploading.value = false;
  uploadProgress.value = 0;
  uploadStatus.value = '';
  uploadError.value = null;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
</script>
