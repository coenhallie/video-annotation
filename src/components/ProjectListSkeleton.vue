<template>
  <!-- Geometry is copied from ProjectListItem, not approximated: the same
       `-mx-3 flex flex-col` wrapper the real list uses, the same
       `px-3 py-2.5 gap-3` row, and the same `h-11 w-[4.5rem]` thumbnail that
       fixes the row pitch at 64px. Rows therefore land at the same left edge
       and the same height, so nothing shifts when the data arrives.

       One pulse on the wrapper, so the placeholder rows read as a single
       loading surface rather than a set of independently blinking blocks. -->
  <div class="-mx-3 flex animate-pulse flex-col">
    <div
      v-for="n in skeletonCount"
      :key="n"
      class="flex items-center gap-3 px-3 py-2.5"
    >
      <div class="h-11 w-[4.5rem] shrink-0 rounded bg-gray-200 dark:bg-white/10" />

      <div class="min-w-0 flex-1">
        <!-- Each bar sits in a box of `1.5em` at the real text size - the line
             box the title and the meta line actually occupy - so the two
             stacks have the same height and the bars land where the text
             will.

             Title widths are absolute, not a percentage of the column: video
             titles are short names, so a percentage would draw a bar running
             most of the way across a wide dashboard and the skeleton would
             promise a list it is not about to render. Cycled from a fixed
             list rather than randomised, since a random width would reshuffle
             on every re-render while the load is still running. -->
        <div class="flex h-[1.5em] items-center text-[13px]">
          <div
            class="h-3 max-w-full rounded bg-gray-200 dark:bg-white/10"
            :style="{ width: titleWidths[n % titleWidths.length] }"
          />
        </div>
        <!-- The mono meta line: duration, fps, date, opened, counts. -->
        <div class="mt-1 flex h-[1.5em] items-center gap-2 text-[10px]">
          <div class="h-2 w-8 rounded bg-gray-100 dark:bg-white/5" />
          <div class="h-2 w-10 rounded bg-gray-100 dark:bg-white/5" />
          <div class="h-2 w-14 rounded bg-gray-100 dark:bg-white/5" />
          <div class="h-2 w-20 rounded bg-gray-100 dark:bg-white/5" />
        </div>
      </div>

      <!-- Watch coverage and the QA pill keep their exact widths, so the
           right-hand columns line up with the loaded rows too. -->
      <div class="h-3 w-7 shrink-0 rounded bg-gray-100 dark:bg-white/5" />
      <div class="h-5 w-24 shrink-0 rounded-full bg-gray-100 dark:bg-white/5" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  skeletonCount: {
    type: Number,
    default: 6,
  },
});

const titleWidths = ['9rem', '14rem', '7rem', '11rem', '16rem', '8rem'];
</script>
