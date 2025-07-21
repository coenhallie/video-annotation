<script setup>
import { ref } from 'vue';
import { useAuth } from '../composables/useAuth.ts';

const { signIn, signUp } = useAuth();

const email = ref('');
const password = ref('');
const isSigningUp = ref(false);

const handleAuth = async () => {
  try {
    if (isSigningUp.value) {
      const result = await signUp(email.value, password.value);
      // If signup successful and email confirmation is required, switch to sign-in mode
      if (result.user && !result.session) {
        isSigningUp.value = false;
        // Clear the form
        email.value = '';
        password.value = '';
      }
    } else {
      await signIn(email.value, password.value);
    }
  } catch (error) {
    // Error notifications are handled in useAuth
    console.error('Authentication error:', error);
  }
};
</script>

<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-100">
    <div class="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
      <h2 class="text-2xl font-bold text-center">
        {{ isSigningUp ? 'Sign Up' : 'Sign In' }}
      </h2>
      <form @submit.prevent="handleAuth">
        <div class="space-y-4">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700"
              >Email</label
            >
            <input
              v-model="email"
              id="email"
              type="email"
              required
              class="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label
              for="password"
              class="block text-sm font-medium text-gray-700"
              >Password</label
            >
            <input
              v-model="password"
              id="password"
              type="password"
              required
              class="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <button
              type="submit"
              class="w-full px-4 py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              {{ isSigningUp ? 'Sign Up' : 'Sign In' }}
            </button>
          </div>
        </div>
      </form>
      <div class="text-center">
        <button
          @click="isSigningUp = !isSigningUp"
          class="text-sm text-blue-600 hover:underline"
        >
          {{
            isSigningUp
              ? 'Already have an account? Sign In'
              : "Don't have an account? Sign Up"
          }}
        </button>
      </div>
    </div>
  </div>
</template>
