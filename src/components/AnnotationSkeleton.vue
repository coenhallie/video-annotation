<template>
  <div class="h-full w-full bg-white overflow-y-auto overflow-x-hidden">
    <!-- Header Skeleton -->
    <div
      class="sticky top-0 z-10 flex justify-between items-center p-2 border-b border-gray-200 bg-white"
    >
      <div class="h-4 bg-gray-200 w-32 animate-pulse skeleton-rounded"></div>
      <div class="h-8 bg-gray-200 w-16 animate-pulse skeleton-rounded"></div>
    </div>

    <!-- Annotations List Skeleton -->
    <div class="p-2">
      <div
        v-for="n in skeletonCount"
        :key="n"
        class="card mb-2 p-2 relative"
        style="border-left: 4px solid #e5e7eb"
      >
        <!-- Header row with severity and timestamp -->
        <div class="flex justify-between items-center mb-1">
          <div class="flex items-center space-x-1.5">
            <!-- Severity icon skeleton -->
            <div
              class="w-3 h-3 bg-gray-200 animate-pulse skeleton-circle"
            ></div>
            <!-- Severity label skeleton -->
            <div
              class="h-3 bg-gray-200 w-12 animate-pulse skeleton-rounded"
            ></div>
            <!-- Comment count skeleton (sometimes visible) -->
            <div
              v-if="Math.random() > 0.5"
              class="flex items-center space-x-1 ml-2 px-1.5 py-0.5 bg-gray-100 skeleton-rounded"
            >
              <div
                class="w-3 h-3 bg-gray-200 animate-pulse skeleton-rounded"
              ></div>
              <div
                class="h-3 bg-gray-200 w-3 animate-pulse skeleton-rounded"
              ></div>
            </div>
          </div>
          <!-- Timestamp skeleton -->
          <div
            class="bg-gray-100 px-2 py-0.5 flex flex-col items-center space-y-1 skeleton-rounded"
          >
            <div
              class="h-3 bg-gray-200 w-8 animate-pulse skeleton-rounded"
            ></div>
            <div
              class="h-2 bg-gray-200 w-12 animate-pulse skeleton-rounded"
            ></div>
          </div>
        </div>

        <!-- Title and content -->
        <div>
          <div class="flex items-center space-x-1 mb-0.5">
            <!-- Title skeleton -->
            <div
              class="h-4 bg-gray-200 animate-pulse skeleton-rounded"
              :style="{ width: `${Math.random() * 100 + 80}px` }"
            ></div>
            <!-- Drawing indicator skeleton (sometimes visible) -->
            <div
              v-if="Math.random() > 0.7"
              class="flex items-center space-x-1 px-1.5 py-0.5 bg-gray-100 skeleton-rounded"
            >
              <div
                class="w-3 h-3 bg-gray-200 animate-pulse skeleton-rounded"
              ></div>
              <div
                class="h-3 bg-gray-200 w-12 animate-pulse skeleton-rounded"
              ></div>
            </div>
          </div>
          <!-- Content skeleton -->
          <div class="space-y-1 mb-1">
            <div
              class="h-3 bg-gray-200 animate-pulse skeleton-rounded"
              :style="{ width: `${Math.random() * 40 + 60}%` }"
            ></div>
            <div
              v-if="Math.random() > 0.4"
              class="h-3 bg-gray-200 animate-pulse skeleton-rounded"
              :style="{ width: `${Math.random() * 30 + 40}%` }"
            ></div>
          </div>
        </div>

        <!-- Action buttons row -->
        <div class="flex justify-between items-center mt-1">
          <!-- Comment toggle button skeleton -->
          <div class="flex items-center space-x-1">
            <div
              class="w-3 h-3 bg-gray-200 animate-pulse skeleton-rounded"
            ></div>
            <div
              class="h-3 bg-gray-200 w-16 animate-pulse skeleton-rounded"
            ></div>
          </div>

          <!-- Edit/Delete buttons skeleton -->
          <div class="flex space-x-1">
            <div
              class="w-6 h-6 bg-gray-200 animate-pulse skeleton-rounded"
            ></div>
            <div
              class="w-6 h-6 bg-gray-200 animate-pulse skeleton-rounded"
            ></div>
          </div>
        </div>

        <!-- Expanded comment section skeleton (sometimes visible) -->
        <div
          v-if="Math.random() > 0.8"
          class="mt-2 border-t border-gray-200 pt-2 space-y-2"
        >
          <!-- Comment form skeleton -->
          <div class="space-y-2">
            <div class="h-16 bg-gray-100 animate-pulse skeleton-rounded"></div>
            <div class="flex justify-end">
              <div
                class="h-6 bg-gray-200 w-16 animate-pulse skeleton-rounded"
              ></div>
            </div>
          </div>

          <!-- Existing comments skeleton -->
          <div
            v-for="c in Math.floor(Math.random() * 3) + 1"
            :key="c"
            class="bg-gray-50 p-2 space-y-1 skeleton-rounded"
          >
            <div class="flex justify-between items-start">
              <div
                class="h-3 bg-gray-200 w-20 animate-pulse skeleton-rounded"
              ></div>
              <div
                class="h-2 bg-gray-200 w-12 animate-pulse skeleton-rounded"
              ></div>
            </div>
            <div
              class="h-3 bg-gray-200 animate-pulse skeleton-rounded"
              :style="{ width: `${Math.random() * 50 + 50}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Panel Footer Skeleton -->
    <div class="p-2 border-t border-gray-200 bg-gray-50">
      <div class="flex justify-between text-xs">
        <div class="h-3 bg-gray-200 w-20 animate-pulse skeleton-rounded"></div>
        <div class="flex flex-col items-end space-y-1">
          <div class="h-3 bg-gray-200 w-8 animate-pulse skeleton-rounded"></div>
          <div
            class="h-2 bg-gray-200 w-12 animate-pulse skeleton-rounded"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  skeletonCount: {
    type: Number,
    default: 2,
  },
});
</script>

<style scoped>
@import 'tailwindcss' reference;

.card {
  @apply bg-white border border-gray-200 shadow-sm;
  border-radius: 8px;
}

.skeleton-rounded {
  border-radius: 4px;
}

.skeleton-circle {
  border-radius: 50%;
}

/* Pulse animation for skeleton elements */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
