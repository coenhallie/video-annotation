<script setup lang="ts">
import { onMounted, onErrorCaptured, ref } from 'vue';
import { useAuth } from '@/composables/useAuth';
import NotificationToast from '@/components/NotificationToast.vue';

const { initAuth } = useAuth();
const hasError = ref(false);
const errorMessage = ref('');

onMounted(() => {
  initAuth();
});

onErrorCaptured((error: any, instance: any, info: string) => {
  console.error('Global Error Boundary caught error:', error);
  hasError.value = true;
  errorMessage.value = error.message || 'An unexpected error occurred';
  return false;
});
</script>

<template>
  <div v-if="hasError" class="min-h-screen bg-red-50 flex items-center justify-center p-4">
    <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
      <h2 class="text-lg font-semibold text-red-600 mb-2">Application Error</h2>
      <p class="text-gray-600 mb-4">{{ errorMessage }}</p>
      <button 
        class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        @click="window.location.reload()"
      >
        Reload Page
      </button>
    </div>
  </div>
  <RouterView v-else />
  <NotificationToast />
</template>
