<!-- eslint-disable vue/multi-word-component-names -->
<script setup>
import { useAuth } from '../composables/useAuth.ts';

const { signInWithSSO } = useAuth();

const handleLogin = async () => {
  try {
    await signInWithSSO();
  } catch (_error) {
    // Error notifications are handled in useAuth
  }
};
</script>

<template>
  <div
    class="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100"
  >
    <div class="w-full max-w-md p-8 bg-white rounded-2xl shadow-xl">
      <div class="text-center space-y-4 mb-8">
        <h1 class="text-3xl font-bold text-gray-800">Perspecto</h1>
        <p class="text-gray-600">
          Collaborative video analysis platform
        </p>
      </div>

      <div class="space-y-6">
        <button
          @click="handleLogin"
          class="w-full flex items-center justify-center px-4 py-4 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl group"
        >
          <svg
            class="w-5 h-5 mr-3 transition-transform group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
            />
          </svg>
          Log In
        </button>

        <div class="text-center">
          <p class="text-xs text-gray-500">
            Authenticated via Keycloak securely
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
