<template>
  <!-- One pulse on the wrapper, so the placeholder rows read as a single
       loading surface rather than a set of independently blinking blocks. -->
  <div class="animate-pulse">
    <div
      v-for="n in skeletonCount"
      :key="n"
      class="flex items-start gap-3 px-3 py-2.5"
    >
      <span class="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-gray-200 dark:bg-white/10" />
      <div class="min-w-0 flex-1 space-y-2">
        <div
          class="h-3 rounded bg-gray-200 dark:bg-white/10"
          :style="{ width: `${45 + ((n * 17) % 40)}%` }"
        />
        <div class="h-2 w-12 rounded bg-gray-100 dark:bg-white/5" />
      </div>
      <div class="mt-0.5 h-3 w-9 shrink-0 rounded bg-gray-100 dark:bg-white/5" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  skeletonCount: {
    type: Number,
    default: 2,
  },
});
</script>
