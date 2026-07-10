<script setup lang="ts">
import ThemeToggle from '@/components/ThemeToggle.vue';

withDefaults(
  defineProps<{
    /** Hide the theme toggle and sign-out button (e.g. anonymous shared views). */
    showUserControls?: boolean;
  }>(),
  { showUserControls: true }
);

defineEmits<{
  (e: 'open-changelog'): void;
  (e: 'sign-out'): void;
}>();
</script>

<template>
  <header
    class="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
  >
    <div class="flex items-center space-x-3">
      <router-link
        to="/"
        class="text-xl font-medium text-gray-900 dark:text-white hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        title="Back to library"
      >
        <h1>Perspecto</h1>
      </router-link>
      <span
        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border border-orange-200 dark:border-orange-800 cursor-pointer hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors"
        @click="$emit('open-changelog')"
      >
        BETA v3.9
      </span>
    </div>

    <div class="flex items-center gap-3">
      <slot />
      <template v-if="showUserControls">
        <ThemeToggle />
        <button
          class="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          @click="$emit('sign-out')"
        >
          Sign out
        </button>
      </template>
    </div>
  </header>
</template>
