<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import SharedVideoAuthPrompt from '@/components/SharedVideoAuthPrompt.vue';
import type {
  ComparisonCreatedEvent,
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
  (e: 'open-create-comparison'): void;
  (e: 'close-comparison-modal'): void;
  (e: 'comparison-created', comparison: ComparisonCreatedEvent): void;
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
  />

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
          class="absolute inset-0 bg-black/50"
          @click="emit('close-shared-links')"
        />

        <!-- Modal Content -->
        <div
          class="relative mx-4 flex max-h-[85vh] w-full max-w-3xl flex-col rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
          @click.stop
        >
          <!-- Header -->
          <div
            class="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10"
          >
            <h2 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
              Shared links
            </h2>
            <button
              type="button"
              class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              @click="emit('close-shared-links')"
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

          <!-- Component Container -->
          <div class="min-h-0 flex-1 overflow-auto px-4 py-4">
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
