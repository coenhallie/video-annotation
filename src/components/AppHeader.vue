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
  <!-- Same surface as the pages below it (editor and annotation panel are both
       white / gray-900), so the nav reads as the top of one sheet rather than a
       separate bar stacked on the app. -->
  <header
    class="flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6 dark:border-white/10 dark:bg-gray-900"
  >
    <router-link
      to="/"
      class="text-[13px] font-semibold uppercase tracking-[0.18em] text-gray-900 transition-colors hover:text-gray-600 dark:text-white dark:hover:text-gray-300"
      title="Back to library"
    >
      <h1>Perspecto</h1>
    </router-link>

    <!-- The version is meta, not a badge: it sits in the same mono token style
         the annotation rows use for their frame and timecode. -->
    <button
      type="button"
      class="font-mono text-[10px] tracking-wider text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
      title="What's new"
      @click="$emit('open-changelog')"
    >
      BETA v3.9
    </button>

    <div class="ml-auto flex items-center gap-4">
      <slot />
      <template v-if="showUserControls">
        <ThemeToggle />
        <button
          type="button"
          class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          @click="$emit('sign-out')"
        >
          Sign out
        </button>
      </template>
    </div>
  </header>
</template>
