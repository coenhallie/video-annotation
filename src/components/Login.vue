<!-- eslint-disable vue/multi-word-component-names -->
<script setup>
import { useAuth } from '../composables/useAuth.ts';

const { signInWithSSO } = useAuth();

const handleLogin = async () => {
  try {
    await signInWithSSO();
  } catch {
    // Error notifications are handled in useAuth
  }
};
</script>

<template>
  <!-- No card, no gradient: the sign-in screen is the first thing the app
       says, and the rest of the app is a plain white / gray-900 sheet. It also
       had no dark mode at all before. -->
  <div
    class="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-gray-900"
  >
    <div class="w-full max-w-xs">
      <h1
        class="text-[13px] font-semibold uppercase tracking-[0.18em] text-gray-900 dark:text-white"
      >
        Perspecto
      </h1>
      <p class="mt-2 text-[12px] text-gray-600 dark:text-gray-400">
        Collaborative video analysis platform
      </p>

      <button
        type="button"
        class="mt-8 w-full rounded bg-gray-900 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
        @click="handleLogin"
      >
        Log in
      </button>

      <p class="mt-3 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500">
        AUTHENTICATED VIA KEYCLOAK
      </p>
    </div>
  </div>
</template>
