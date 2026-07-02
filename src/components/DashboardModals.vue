<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import SharedVideoAuthPrompt from '@/components/SharedVideoAuthPrompt.vue';
import VideoUpload from '@/components/VideoUpload.vue';
import type {
  ComparisonCreatedEvent,
  VideoUploadResult,
  PendingSharedContent,
} from '@/types/component-interfaces';

// Lazy loaded components
const CreateComparisonModal = defineAsyncComponent(() => import('@/components/CreateComparisonModal.vue'));
const ShareModal = defineAsyncComponent(() => import('@/components/ShareModal.vue'));
const SharedLinksManagement = defineAsyncComponent(() => import('@/components/SharedLinksManagement.vue'));
const ChangelogModal = defineAsyncComponent(() => import('@/components/ChangelogModal.vue'));

defineProps<{
  // Modal visibility states
  isComparisonModalOpen: boolean;
  isVideoUploadModalOpen: boolean;
  isShareModalOpen: boolean;
  isSharedLinksModalOpen: boolean;
  showAuthPrompt: boolean;
  isChangelogModalOpen: boolean;

  // Share modal data
  shareVideoId: string;
  shareComparisonId: string | null;
  shareType: string;

  // Auth prompt data
  pendingSharedContent: PendingSharedContent | null;
}>();

const emit = defineEmits<{
  (e: 'upload-video'): void;
  (e: 'open-create-comparison'): void;
  (e: 'close-comparison-modal'): void;
  (e: 'comparison-created', comparison: ComparisonCreatedEvent): void;
  (e: 'close-video-upload'): void;
  (e: 'upload-success', videoRecord: VideoUploadResult): void;
  (e: 'upload-error', error: Error): void;
  (e: 'close-share-modal'): void;
  (e: 'close-shared-links'): void;
  (e: 'auth-sign-in'): void;
  (e: 'auth-continue-read-only'): void;
  (e: 'close-changelog'): void;
}>();
</script>

<template>
  <!-- Create Comparison Modal -->
  <CreateComparisonModal
    :is-visible="isComparisonModalOpen"
    @close="emit('close-comparison-modal')"
    @comparison-created="(comparison: ComparisonCreatedEvent) => emit('comparison-created', comparison)"
    @upload-video="emit('upload-video')"
  />

  <!-- Video Upload Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isVideoUploadModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm"
          @click="emit('close-video-upload')"
        />

        <!-- Modal Content -->
        <div
          class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto p-6"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
              Upload Video
            </h2>
            <button
              class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              @click="emit('close-video-upload')"
            >
              <svg
                class="w-5 h-5"
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

          <!-- Video Upload Component -->
          <VideoUpload
            @upload-success="(videoRecord: VideoUploadResult) => emit('upload-success', videoRecord)"
            @upload-error="(error: Error) => emit('upload-error', error)"
          />
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Share Video Modal -->
  <ShareModal
    :is-visible="isShareModalOpen"
    :video-id="shareVideoId"
    :comparison-id="shareComparisonId"
    :share-type="shareType"
    @close="emit('close-share-modal')"
  />

  <!-- Shared Links Management Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isSharedLinksModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm"
          @click="emit('close-shared-links')"
        />

        <!-- Modal Content -->
        <div
          class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-7xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <h2 class="text-2xl font-semibold text-gray-900 dark:text-white">
              Manage Shared Links
            </h2>
            <button
              class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              @click="emit('close-shared-links')"
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

          <!-- Component Container -->
          <div class="flex-1 overflow-auto">
            <SharedLinksManagement />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Shared Video Authentication Prompt -->
  <SharedVideoAuthPrompt
    :is-visible="showAuthPrompt"
    :content-type="pendingSharedContent?.type === 'comparison' ? 'comparison video' : 'video'"
    @sign-in="emit('auth-sign-in')"
    @continue-read-only="emit('auth-continue-read-only')"
  />

  <!-- Changelog Modal -->
  <ChangelogModal
    :is-visible="isChangelogModalOpen"
    @close="emit('close-changelog')"
  />
</template>

<style scoped>
/* Modal transition styles */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.3s ease;
}

.modal-enter-from .relative {
  transform: scale(0.95);
}

.modal-leave-to .relative {
  transform: scale(0.95);
}
</style>
