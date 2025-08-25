<script setup>
import { ref } from 'vue';
import { useAuth } from '../composables/useAuth.ts';

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(['close']);

const { resetPasswordForEmail } = useAuth();

const email = ref('');
const isLoading = ref(false);
const isSuccess = ref(false);

const handleSubmit = async () => {
  if (!email.value) return;

  isLoading.value = true;
  try {
    await resetPasswordForEmail(email.value);
    isSuccess.value = true;
    // Auto-close modal after 3 seconds on success
    setTimeout(() => {
      handleClose();
    }, 3000);
  } catch (error) {
    // Error is handled in useAuth
  } finally {
    isLoading.value = false;
  }
};

const handleClose = () => {
  email.value = '';
  isSuccess.value = false;
  isLoading.value = false;
  emit('close');
};
</script>

<template>
  <Transition name="modal">
    <div
      v-if="isOpen"
      class="modal-overlay"
      @click.self="handleClose"
    >
      <div class="modal-container">
        <div class="modal-header">
          <h2 class="modal-title">
            {{ isSuccess ? 'Check Your Email' : 'Reset Password' }}
          </h2>
          <button
            class="close-button"
            :disabled="isLoading"
            @click="handleClose"
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

        <div class="modal-body">
          <div v-if="!isSuccess">
            <p class="text-gray-600 mb-6">
              Enter your email address and we'll send you a link to reset your
              password.
            </p>

            <form @submit.prevent="handleSubmit">
              <div class="mb-6">
                <label
                  for="reset-email"
                  class="block text-sm font-medium text-gray-700 mb-2"
                >
                  Email Address
                </label>
                <input
                  id="reset-email"
                  v-model="email"
                  type="email"
                  required
                  :disabled="isLoading"
                  placeholder="Enter your email"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
              </div>

              <div class="flex gap-3">
                <button
                  type="button"
                  :disabled="isLoading"
                  class="flex-1 px-4 py-3 font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  @click="handleClose"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  :disabled="isLoading || !email"
                  class="flex-1 px-4 py-3 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <span v-if="!isLoading">Send Reset Link</span>
                  <span
                    v-else
                    class="flex items-center"
                  >
                    <svg
                      class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      />
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Sending...
                  </span>
                </button>
              </div>
            </form>
          </div>

          <div
            v-else
            class="text-center py-8"
          >
            <div class="mb-4">
              <svg
                class="w-16 h-16 text-green-500 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">
              Email Sent Successfully!
            </h3>
            <p class="text-gray-600">
              We've sent a password reset link to
              <span class="font-medium">{{ email }}</span>
            </p>
            <p class="text-sm text-gray-500 mt-4">
              Please check your email and click the link to reset your password.
            </p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-container {
  background: white;
  border-radius: 1rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
  max-width: 28rem;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
}

.close-button {
  padding: 0.5rem;
  border-radius: 0.5rem;
  transition: background-color 0.2s;
  color: #6b7280;
}

.close-button:hover:not(:disabled) {
  background-color: #f3f4f6;
}

.close-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-body {
  padding: 1.5rem;
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.9);
}

/* Loading spinner animation */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
