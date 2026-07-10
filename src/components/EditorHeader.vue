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
    <!-- Action Buttons (only for authenticated users) -->
    <div
      v-if="user && !isSharedVideo && !isSharedComparison"
      class="flex items-center space-x-4"
    >
      <!-- Back to Library Button -->
      <button
        class="p-2 text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        title="Back to library"
        @click="$emit('open-project-modal')"
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
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      </button>

      <!-- Manage Shared Links Button -->
      <button
        class="p-2 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        title="Manage shared links"
        @click="$emit('open-shared-links')"
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
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </button>

      <!-- Share Video Button -->
      <button
        :disabled="!canShare"
        class="p-2 text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        title="Share current video"
        @click="$emit('open-share-modal')"
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
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
          />
        </svg>
      </button>
    </div>

    <!-- Shared Video/Comparison Info -->
    <div
      v-if="isSharedVideo || isSharedComparison"
      class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300"
    >
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
          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
        />
      </svg>
      <span class="font-medium">
        {{ sharedContentPermissionText }}
      </span>
    </div>

    <!-- User Info (for authenticated users) -->
    <div
      v-else-if="user"
      class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300"
    >
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
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
      <span class="font-medium">{{ user.email || 'Loading...' }}</span>
    </div>
  </AppHeader>
</template>
