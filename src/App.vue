<script setup lang="ts">
import { onMounted, onErrorCaptured, ref } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useThemeStore } from '@/stores/theme';
import NotificationToast from '@/components/NotificationToast.vue';

const { initAuth } = useAuth();
const themeStore = useThemeStore();
const hasError = ref(false);
const errorMessage = ref('');

onMounted(() => {
  initAuth();
  themeStore.initTheme();
});

onErrorCaptured((error: any) => {
  console.error('Global Error Boundary caught error:', error);
  hasError.value = true;
  errorMessage.value = error.message || 'An unexpected error occurred';
  return false;
});

const reloadPage = () => window.location.reload();
</script>

<template>
  <!-- The error boundary had no dark mode at all, so a crash flipped the whole
       app to a light-red page. -->
  <div
    v-if="hasError"
    class="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-gray-900"
  >
    <div class="w-full max-w-xs">
      <h2 class="text-[13px] font-semibold tracking-tight text-red-600 dark:text-red-400">
        Application error
      </h2>
      <p class="mt-2 text-[12px] leading-relaxed text-gray-600 dark:text-gray-400">
        {{ errorMessage }}
      </p>
      <button
        type="button"
        class="mt-6 w-full rounded bg-gray-900 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
        @click="reloadPage"
      >
        Reload page
      </button>
    </div>
  </div>
  <RouterView v-else />
  <NotificationToast />
</template>
