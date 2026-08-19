<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="handleDeclineAuth"
  >
    <div
      class="w-full max-w-sm rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
      @click.stop
    >
      <!-- Modal Header -->
      <div
        class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10"
      >
        <h2 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
          Sign in to annotate
        </h2>
        <button
          type="button"
          class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          @click="handleDeclineAuth"
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

      <!-- Modal Content. The two illustrated info boxes said the same thing
           twice; what actually differs between the two paths is one line. -->
      <div class="px-4 py-4">
        <p class="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400">
          This {{ contentType }} allows annotations. You can read it either way -
          signing in is what lets you add your own annotations and comments.
        </p>
      </div>

      <!-- Action Buttons -->
      <div
        class="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3 dark:border-white/10"
      >
        <button
          type="button"
          class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
          @click="handleContinueReadOnly"
        >
          View only
        </button>
        <button
          type="button"
          class="rounded bg-gray-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
          @click="handleSignIn"
        >
          Sign in
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Props
defineProps({
  isVisible: {
    type: Boolean,
    default: false,
  },
  contentType: {
    type: String,
    default: 'video',
    validator: (value: string) => ['video', 'comparison video'].includes(value),
  },
});

// Emits
const emit = defineEmits(['sign-in', 'continue-read-only', 'close']);

// Methods
const handleSignIn = () => {
  emit('sign-in');
};

const handleContinueReadOnly = () => {
  emit('continue-read-only');
};

const handleDeclineAuth = () => {
  // Declining auth means continuing in read-only mode
  emit('continue-read-only');
};
</script>