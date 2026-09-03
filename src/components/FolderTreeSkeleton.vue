<template>
  <!-- Matches a level-0 FolderTreeItem row: `px-2 py-1.5 gap-1`, the `w-4`
       slot the expand arrow occupies, the `h-3.5 w-3.5` folder icon, and a
       name bar in the `h-5` line box the real name occupies - which is what
       sets the 32px row height, since it is taller than the icon.

       One pulse on the wrapper, so the rows read as a single loading surface
       rather than a set of independently blinking blocks. -->
  <div class="animate-pulse">
    <div
      v-for="n in skeletonCount"
      :key="n"
      class="flex items-center gap-1 px-2 py-1.5"
    >
      <div class="w-4 shrink-0" />
      <div class="h-3.5 w-3.5 shrink-0 rounded-sm bg-gray-200 dark:bg-white/10" />
      <!-- Absolute widths, for the same reason as the video rows: folder names
           are short, so a percentage of the sidebar would overstate them. -->
      <div class="flex h-5 flex-1 items-center">
        <div
          class="h-3 max-w-full rounded bg-gray-200 dark:bg-white/10"
          :style="{ width: nameWidths[n % nameWidths.length] }"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  skeletonCount: {
    type: Number,
    default: 4,
  },
});

const nameWidths = ['7rem', '5rem', '9rem', '6rem'];
</script>
