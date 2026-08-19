<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue';
import type { User } from '@supabase/supabase-js';

defineProps<{
  user: User | null;
  isSharedVideo: boolean;
  isSharedComparison: boolean;
  canShare: boolean;
  sharedContentPermissionText: string;
}>();

defineEmits<{
  (e: 'open-project-modal'): void;
  (e: 'open-shared-links'): void;
  (e: 'open-share-modal'): void;
  (e: 'sign-out'): void;
  (e: 'open-changelog'): void;
}>();
</script>

<template>
  <AppHeader
    :show-user-controls="!!user && !isSharedVideo && !isSharedComparison"
    @open-changelog="$emit('open-changelog')"
    @sign-out="$emit('sign-out')"
  >
    <!-- Shared Video/Comparison Info. The permission level is an eyebrow, the
         same shape the annotation panel uses for its read-only state. -->
    <span
      v-if="isSharedVideo || isSharedComparison"
      class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400"
    >
      {{ sharedContentPermissionText }}
    </span>

    <template v-else-if="user">
      <!-- Who you are is meta, not a labelled field: no icon, no chrome. -->
      <span
        class="max-w-[16rem] truncate font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
        :title="user.email || ''"
      >
        {{ user.email || 'Loading...' }}
      </span>

      <!-- Action Buttons (only for authenticated users). One hover colour for
           all three - the icons already tell them apart, and three different
           accents were the loudest thing in the old bar. -->
      <div class="flex items-center gap-1">
        <!-- Back to Library Button -->
        <button
          type="button"
          class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          title="Back to library"
          @click="$emit('open-project-modal')"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        </button>

        <!-- Manage Shared Links Button -->
        <button
          type="button"
          class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          title="Manage shared links"
          @click="$emit('open-shared-links')"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </button>

        <!-- Share Video Button -->
        <button
          type="button"
          :disabled="!canShare"
          class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:disabled:text-gray-600"
          title="Share current video"
          @click="$emit('open-share-modal')"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
            />
          </svg>
        </button>
      </div>
    </template>
  </AppHeader>
</template>
