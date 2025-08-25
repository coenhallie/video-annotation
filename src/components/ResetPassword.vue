<script setup>
import { ref, onMounted } from 'vue';
import { useAuth } from '../composables/useAuth.ts';
import { supabase } from '../composables/useSupabase';

const emit = defineEmits(['complete']);

const { updatePassword } = useAuth();

const newPassword = ref('');
const confirmPassword = ref('');
const isLoading = ref(false);
const isValidSession = ref(false);
const isCheckingSession = ref(true);

// Password validation states
const passwordsMatch = ref(true);
const passwordStrength = ref('');

// Check if we have a valid password recovery session
onMounted(async () => {
  try {
    // Check if we have a valid session from the password reset link
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    // Check if we're in a password recovery flow
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');

    // Check for stored recovery token
    const storedRecoveryToken = sessionStorage.getItem('recovery_token');

    console.log('ResetPassword: Checking session', {
      hasSession: !!session,
      type,
      hasStoredToken: !!storedRecoveryToken,
    });

    // We should have either:
    // 1. A recovery type in the URL
    // 2. A stored recovery token
    // 3. A valid session (from the recovery token exchange)
    if (type === 'recovery' || storedRecoveryToken || session) {
      isValidSession.value = true;

      // Listen for auth state changes (specifically for PASSWORD_RECOVERY event)
      supabase.auth.onAuthStateChange((event, session) => {
        console.log('ResetPassword: Auth state change', {
          event,
          hasSession: !!session,
        });
        if (event === 'PASSWORD_RECOVERY') {
          isValidSession.value = true;
        }
      });
    } else {
      // No valid recovery session, redirect to login
      console.log('ResetPassword: No valid recovery session found');
      emit('complete');
    }
  } catch (error) {
    console.error('Error checking session:', error);
    emit('complete');
  } finally {
    isCheckingSession.value = false;
  }
});

// Check password strength
const checkPasswordStrength = () => {
  const password = newPassword.value;

  if (password.length < 6) {
    passwordStrength.value = 'weak';
  } else if (password.length < 10) {
    passwordStrength.value = 'medium';
  } else {
    passwordStrength.value = 'strong';
  }
};

// Validate passwords match
const validatePasswords = () => {
  if (confirmPassword.value && newPassword.value !== confirmPassword.value) {
    passwordsMatch.value = false;
  } else {
    passwordsMatch.value = true;
  }
};

const handleSubmit = async () => {
  if (!newPassword.value || !confirmPassword.value) {
    return;
  }

  if (newPassword.value !== confirmPassword.value) {
    passwordsMatch.value = false;
    return;
  }

  if (newPassword.value.length < 6) {
    return;
  }

  isLoading.value = true;
  try {
    await updatePassword(newPassword.value);

    // Clear the recovery token after successful password update
    sessionStorage.removeItem('recovery_token');

    // Show success message and redirect to main app
    setTimeout(() => {
      emit('complete');
    }, 2000);
  } catch (error) {
    // Error is handled in useAuth
    console.error('Password update error:', error);
  } finally {
    isLoading.value = false;
  }
};

const getStrengthColor = () => {
  switch (passwordStrength.value) {
    case 'weak':
      return 'text-red-600';
    case 'medium':
      return 'text-yellow-600';
    case 'strong':
      return 'text-green-600';
    default:
      return 'text-gray-400';
  }
};

const getStrengthText = () => {
  switch (passwordStrength.value) {
    case 'weak':
      return 'Weak - Use at least 6 characters';
    case 'medium':
      return 'Medium - Consider using a longer password';
    case 'strong':
      return 'Strong password';
    default:
      return 'Enter a password';
  }
};
</script>

<template>
  <div
    class="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100"
  >
    <div
      v-if="isCheckingSession"
      class="text-center"
    >
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"
      />
      <p class="mt-4 text-gray-600">
        Verifying reset link...
      </p>
    </div>

    <div
      v-else-if="isValidSession"
      class="w-full max-w-md"
    >
      <div class="bg-white rounded-2xl shadow-xl p-8">
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-gray-800 mb-2">
            Create New Password
          </h1>
          <p class="text-sm text-gray-600">
            Enter your new password below
          </p>
        </div>

        <form @submit.prevent="handleSubmit">
          <div class="space-y-5">
            <div>
              <label
                for="new-password"
                class="block text-sm font-medium text-gray-700 mb-2"
              >
                New Password
              </label>
              <input
                id="new-password"
                v-model="newPassword"
                type="password"
                required
                :disabled="isLoading"
                placeholder="Enter new password"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                @input="checkPasswordStrength"
              >
              <p
                v-if="newPassword"
                :class="getStrengthColor()"
                class="text-xs mt-1 transition-colors duration-200"
              >
                {{ getStrengthText() }}
              </p>
            </div>

            <div>
              <label
                for="confirm-password"
                class="block text-sm font-medium text-gray-700 mb-2"
              >
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                v-model="confirmPassword"
                type="password"
                required
                :disabled="isLoading"
                placeholder="Confirm new password"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                :class="{
                  'border-red-500': !passwordsMatch && confirmPassword,
                }"
                @input="validatePasswords"
              >
              <p
                v-if="!passwordsMatch && confirmPassword"
                class="text-red-600 text-xs mt-1"
              >
                Passwords do not match
              </p>
            </div>

            <div>
              <button
                type="submit"
                :disabled="
                  isLoading ||
                    !newPassword ||
                    !confirmPassword ||
                    !passwordsMatch ||
                    newPassword.length < 6
                "
                class="w-full px-4 py-3 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                <span v-if="!isLoading">Update Password</span>
                <span
                  v-else
                  class="flex items-center justify-center"
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
                  Updating...
                </span>
              </button>
            </div>
          </div>
        </form>

        <div class="text-center mt-6">
          <button
            class="text-sm text-blue-600 hover:text-blue-700 hover:underline transition-colors duration-200"
            @click="$emit('complete')"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    </div>

    <div
      v-else
      class="text-center"
    >
      <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md">
        <svg
          class="w-16 h-16 text-red-500 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <h2 class="text-xl font-bold text-gray-800 mb-2">
          Invalid Reset Link
        </h2>
        <p class="text-gray-600 mb-6">
          This password reset link is invalid or has expired.
        </p>
        <button
          class="inline-block px-6 py-3 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all duration-200"
          @click="$emit('complete')"
        >
          Back to Sign In
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
