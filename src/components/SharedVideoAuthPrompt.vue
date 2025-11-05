<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click.self="handleDeclineAuth"
  >
    <div
      class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
      @click.stop
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-200">
        <h2 class="text-xl font-semibold text-gray-900">
          Authentication Required
        </h2>
        <button
          class="text-gray-400 hover:text-gray-600 transition-colors"
          @click="handleDeclineAuth"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Modal Content -->
      <div class="p-6">
        <div class="text-center mb-6">
          <div class="text-blue-600 mb-4">
            <svg
              class="w-16 h-16 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">
            Sign In to Add Annotations
          </h3>
          <p class="text-sm text-gray-600 mb-4">
            This {{ contentType }} allows annotations. To create and add your own annotations, please sign in.
          </p>
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
            <div class="flex items-start">
              <svg
                class="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div class="text-sm text-blue-900">
                <p class="font-medium mb-1">With authentication:</p>
                <ul class="list-disc list-inside space-y-1 text-blue-800">
                  <li>View the {{ contentType }}</li>
                  <li>See all existing annotations</li>
                  <li>Create new annotations</li>
                  <li>Add comments to annotations</li>
                </ul>
              </div>
            </div>
          </div>
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left mt-3">
            <div class="flex items-start">
              <svg
                class="w-5 h-5 text-gray-600 mr-2 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              <div class="text-sm text-gray-700">
                <p class="font-medium mb-1">Without authentication (view-only):</p>
                <ul class="list-disc list-inside space-y-1 text-gray-600">
                  <li>View the {{ contentType }}</li>
                  <li>See all existing annotations</li>
                  <li>Cannot create or edit annotations</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-col space-y-3">
          <button
            class="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors font-medium"
            @click="handleSignIn"
          >
            Sign In to Add Annotations
          </button>
          <button
            class="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors font-medium"
            @click="handleContinueReadOnly"
          >
            Continue in View-Only Mode
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Props
const props = defineProps({
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