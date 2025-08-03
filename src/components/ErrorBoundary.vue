<template>
  <div
    v-if="hasError"
    class="min-h-screen bg-red-50 flex items-center justify-center p-4"
  >
    <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
      <div class="flex items-center mb-4">
        <svg
          class="w-8 h-8 text-red-500 mr-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <h2 class="text-lg font-semibold text-gray-900">
          Something went wrong
        </h2>
      </div>

      <p class="text-gray-600 mb-4">
        We encountered an unexpected error. Please try refreshing the page.
      </p>

      <div
        v-if="errorDetails && isDevelopment"
        class="mb-4 p-3 bg-gray-100 rounded text-xs font-mono text-gray-700 overflow-auto max-h-32"
      >
        {{ errorDetails }}
      </div>

      <div class="flex space-x-3">
        <button
          class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          @click="retry"
        >
          Try Again
        </button>
        <button
          class="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
          @click="reload"
        >
          Reload Page
        </button>
      </div>
    </div>
  </div>

  <slot v-else />
</template>

<script setup>
import { ref, onErrorCaptured, computed } from 'vue';

const hasError = ref(false);
const errorDetails = ref('');

const isDevelopment = computed(() => process.env.NODE_ENV === 'development');

const emit = defineEmits(['error']);

onErrorCaptured((error, instance, info) => {
  console.error('Vue Error Boundary caught error:', error);
  console.error('Component instance:', instance);
  console.error('Error info:', info);

  hasError.value = true;
  errorDetails.value = `${error.message}\n\nComponent: ${info}\n\nStack: ${error.stack}`;

  emit('error', { error, instance, info });

  // Prevent the error from propagating further
  return false;
});

const retry = () => {
  hasError.value = false;
  errorDetails.value = '';
};

const reload = () => {
  window.location.reload();
};

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);

  // Only show error boundary for critical errors
  if (
    event.reason &&
    event.reason.message &&
    (event.reason.message.includes('__vnode') ||
      event.reason.message.includes('Cannot read properties of null'))
  ) {
    hasError.value = true;
    errorDetails.value = `Unhandled Promise Rejection: ${event.reason.message}`;
  }
});

// Global error handler for JavaScript errors
window.addEventListener('error', (event) => {
  console.error('Global JavaScript error:', event.error);

  // Only show error boundary for critical Vue-related errors
  if (
    event.error &&
    event.error.message &&
    (event.error.message.includes('__vnode') ||
      event.error.message.includes('Cannot read properties of null'))
  ) {
    hasError.value = true;
    errorDetails.value = `JavaScript Error: ${event.error.message}`;
  }
});
</script>
