<!-- eslint-disable vue/multi-word-component-names -->
<script setup>
import { ref } from 'vue';
import { useAuth } from '../composables/useAuth.ts';
import ForgotPasswordModal from './ForgotPasswordModal.vue';

const { signIn, signUp } = useAuth();

const email = ref('');
const password = ref('');
const isSigningUp = ref(false);
const showForgotPasswordModal = ref(false);

const handleAuth = async () => {
  try {
    if (isSigningUp.value) {
      const result = await signUp(email.value, password.value);
      // If signup successful and email confirmation is required, switch to sign-in mode
      if (result.user && !result.session) {
        toggleMode();
      }
    } else {
      await signIn(email.value, password.value);
    }
  } catch (error) {
    // Error notifications are handled in useAuth
  }
};

const toggleMode = () => {
  isSigningUp.value = !isSigningUp.value;
  // Clear form when switching modes
  email.value = '';
  password.value = '';
};
</script>

<template>
  <div
    class="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100"
  >
    <div class="card-container">
      <div class="card" :class="{ 'is-flipped': isSigningUp }">
        <!-- Front Side - Sign In -->
        <div class="card-face card-front">
          <div class="text-center space-y-2 mb-8">
            <h1 class="text-2xl font-bold text-gray-800">Perspecto AI</h1>
            <p class="text-sm text-gray-600">
              Collaborative video analysis platform
            </p>
          </div>
          <form @submit.prevent="handleAuth">
            <div class="space-y-5">
              <div>
                <label
                  for="signin-email"
                  class="block text-sm font-medium text-gray-700 mb-2"
                >
                  <span class="flex items-center">
                    <svg
                      class="w-4 h-4 mr-2 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                      />
                    </svg>
                    Email Address
                  </span>
                </label>
                <input
                  id="signin-email"
                  v-model="email"
                  type="email"
                  required
                  placeholder="Enter your registered email"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white"
                />
              </div>
              <div>
                <label
                  for="signin-password"
                  class="block text-sm font-medium text-gray-700 mb-2"
                >
                  <span class="flex items-center">
                    <svg
                      class="w-4 h-4 mr-2 text-gray-500"
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
                    Password
                  </span>
                </label>
                <input
                  id="signin-password"
                  v-model="password"
                  type="password"
                  required
                  placeholder="Enter your password"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white"
                />
              </div>
              <div class="text-right mb-4">
                <button
                  type="button"
                  class="text-sm text-blue-600 hover:text-blue-700 hover:underline transition-colors duration-200"
                  @click="showForgotPasswordModal = true"
                >
                  Forgot your password?
                </button>
              </div>
              <div>
                <button
                  type="submit"
                  class="w-full px-4 py-3 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Sign In to Your Account
                </button>
              </div>
            </div>
          </form>
          <div class="text-center mt-8">
            <p class="text-sm text-gray-600 mb-3">New to Perspecto?</p>
            <button
              class="text-blue-600 hover:text-blue-700 font-medium text-sm hover:underline transition-colors duration-200"
              @click="toggleMode"
            >
              Create a new account →
            </button>
          </div>
        </div>

        <!-- Back Side - Sign Up -->
        <div class="card-face card-back">
          <!-- BETA indicator -->
          <div
            class="absolute top-4 right-4 bg-gray-400 text-white text-xs font-semibold px-2 py-1 rounded-full z-10"
          >
            BETA v2.2
          </div>
          <div class="text-center space-y-2 mb-8">
            <h1 class="text-2xl font-bold text-gray-800">Perspecto AI</h1>
            <p class="text-sm text-gray-600">
              Collaborative video analysis platform
            </p>
          </div>
          <form @submit.prevent="handleAuth">
            <div class="space-y-5">
              <div>
                <label
                  for="signup-email"
                  class="block text-sm font-medium text-gray-700 mb-2"
                >
                  <span class="flex items-center">
                    <svg
                      class="w-4 h-4 mr-2 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                      />
                    </svg>
                    Email Address
                  </span>
                </label>
                <input
                  id="signup-email"
                  v-model="email"
                  type="email"
                  required
                  placeholder="Choose your email address"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white"
                />
                <p class="text-xs text-gray-500 mt-1">
                  We'll send you a confirmation email
                </p>
              </div>
              <div>
                <label
                  for="signup-password"
                  class="block text-sm font-medium text-gray-700 mb-2"
                >
                  <span class="flex items-center">
                    <svg
                      class="w-4 h-4 mr-2 text-gray-500"
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
                    Create Password
                  </span>
                </label>
                <input
                  id="signup-password"
                  v-model="password"
                  type="password"
                  required
                  placeholder="Create a secure password"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white"
                />
                <p class="text-xs text-gray-500 mt-1">
                  Minimum 6 characters recommended
                </p>
              </div>
              <div>
                <button
                  type="submit"
                  class="w-full px-4 py-3 font-semibold text-white bg-black rounded-lg hover:bg-gray-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Create your Account
                </button>
              </div>
            </div>
          </form>
          <div class="text-center mt-8">
            <p class="text-sm text-gray-600 mb-3">Already have an account?</p>
            <button
              class="text-black hover:text-gray-700 font-medium text-sm hover:underline transition-colors duration-200"
              @click="toggleMode"
            >
              ← Sign in instead
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Forgot Password Modal -->
    <ForgotPasswordModal
      :is-open="showForgotPasswordModal"
      @close="showForgotPasswordModal = false"
    />
  </div>
</template>

<style scoped>
.card-container {
  perspective: 1000px;
  width: 100%;
  max-width: 400px;
}

.card {
  position: relative;
  width: 100%;
  height: 600px;
  transform-style: preserve-3d;
  transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.card.is-flipped {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 16px;
  padding: 32px;
  background: white;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.card-front {
  /* Front face is normal */
}

.card-back {
  transform: rotateY(180deg);
}

/* Enhanced focus states */
input:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.card-back input:focus {
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
}

/* Smooth transitions for all interactive elements */
button,
input {
  transition: all 0.2s ease-in-out;
}

/* Hover effects for buttons */
button:hover {
  transform: translateY(-1px);
}

button:active {
  transform: translateY(0);
}

/* Loading state animation */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.loading {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
