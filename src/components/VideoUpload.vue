<template>
  <div class="video-upload">
    <!-- Upload Area -->
    <div
      class="upload-area"
      :class="{
        'drag-over': isDragOver,
        uploading: isUploading,
        error: uploadError,
      }"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @click="triggerFileInput"
    >
      <input
        ref="fileInput"
        type="file"
        accept="video/*"
        @change="handleFileSelect"
        class="hidden"
      />

      <!-- Upload Icon and Text -->
      <div v-if="!isUploading && !uploadError" class="upload-content">
        <svg
          class="upload-icon"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          ></path>
        </svg>
        <h3 class="upload-title">Upload Video File</h3>
        <p class="upload-description">
          Drag and drop your video file here, or click to browse
        </p>
        <p class="upload-formats">
          Supported formats: MP4, WebM, OGG, MOV, AVI (max 200MB)
        </p>
      </div>

      <!-- Upload Progress -->
      <div v-if="isUploading" class="upload-progress">
        <svg
          class="progress-icon animate-spin"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          ></path>
        </svg>
        <h3 class="upload-title">Uploading Video...</h3>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${uploadProgress}%` }"
          ></div>
        </div>
        <p class="upload-description">
          {{ uploadProgress.toFixed(1) }}% - {{ uploadStatus }}
        </p>
      </div>

      <!-- Error State -->
      <div v-if="uploadError" class="upload-error">
        <svg
          class="error-icon"
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
        <h3 class="upload-title">Upload Failed</h3>
        <p class="upload-description">{{ uploadError }}</p>
        <button @click="resetUpload" class="retry-button">Try Again</button>
      </div>
    </div>

    <!-- Selected File Info -->
    <div v-if="selectedFile && !isUploading" class="file-info">
      <div class="file-details">
        <div class="file-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            ></path>
          </svg>
        </div>
        <div class="file-text">
          <p class="file-name">{{ selectedFile.name }}</p>
          <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
        </div>
      </div>
      <div class="file-actions">
        <button
          @click="startUpload"
          class="upload-button"
          :disabled="isUploading"
        >
          Upload Video
        </button>
        <button
          @click="clearSelection"
          class="cancel-button"
          :disabled="isUploading"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
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

const selectFile = (file) => {
  // Validate file
  const validation = VideoUploadService.validateVideoFile(file);
  if (!validation.valid) {
    uploadError.value = validation.error;
    return;
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
    const videoRecord = await VideoUploadService.uploadVideoComplete(
      selectedFile.value,
      user.value.id,
      (progress) => {
        uploadProgress.value = progress.percentage;
        uploadStatus.value = `Uploading... ${formatFileSize(
          progress.loaded
        )} / ${formatFileSize(progress.total)}`;
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
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

const resetUpload = () => {
  selectedFile.value = null;
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

<style scoped>
.video-upload {
  width: 100%;
}

.upload-area {
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  padding: 3rem 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background-color: #f9fafb;
}

.upload-area:hover {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.upload-area.drag-over {
  border-color: #3b82f6;
  background-color: #dbeafe;
  transform: scale(1.02);
}

.upload-area.uploading {
  border-color: #10b981;
  background-color: #ecfdf5;
  cursor: not-allowed;
}

.upload-area.error {
  border-color: #ef4444;
  background-color: #fef2f2;
}

.hidden {
  display: none;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.upload-icon {
  width: 3rem;
  height: 3rem;
  color: #6b7280;
}

.upload-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.upload-description {
  color: #6b7280;
  margin: 0;
}

.upload-formats {
  font-size: 0.875rem;
  color: #9ca3af;
  margin: 0;
}

.upload-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.progress-icon {
  width: 3rem;
  height: 3rem;
  color: #10b981;
}

.progress-bar {
  width: 100%;
  max-width: 300px;
  height: 8px;
  background-color: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: #10b981;
  transition: width 0.3s ease;
}

.upload-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.error-icon {
  width: 3rem;
  height: 3rem;
  color: #ef4444;
}

.retry-button {
  padding: 0.5rem 1rem;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.retry-button:hover {
  background-color: #2563eb;
}

.file-info {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background-color: white;
}

.file-details {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.file-icon {
  width: 2.5rem;
  height: 2.5rem;
  color: #3b82f6;
}

.file-icon svg {
  width: 100%;
  height: 100%;
}

.file-text {
  flex: 1;
}

.file-name {
  font-weight: 500;
  color: #111827;
  margin: 0 0 0.25rem 0;
}

.file-size {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
}

.file-actions {
  display: flex;
  gap: 0.75rem;
}

.upload-button {
  padding: 0.5rem 1rem;
  background-color: #10b981;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.upload-button:hover:not(:disabled) {
  background-color: #059669;
}

.upload-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-button {
  padding: 0.5rem 1rem;
  background-color: #6b7280;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.cancel-button:hover:not(:disabled) {
  background-color: #4b5563;
}

.cancel-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
