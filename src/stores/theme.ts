import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export const useThemeStore = defineStore('theme', () => {
  // State
  const isDark = ref(false);

  // Actions
  function initTheme() {
    try {
      // Check localStorage first
      const storedTheme = localStorage.getItem('theme');
      if (storedTheme) {
        isDark.value = storedTheme === 'dark';
      } else {
        // Fallback to system preference
        isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch {
      // localStorage unavailable (e.g. Safari private browsing)
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    applyTheme();
  }

  function toggleTheme() {
    isDark.value = !isDark.value;
    applyTheme();
    try {
      localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
    } catch {
      // localStorage unavailable
    }
  }

  function applyTheme() {
    if (isDark.value) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  // Watch for system preference changes if no user preference is set?
  // For now, let's just stick to manual toggle or initial system preference.

  return {
    isDark,
    initTheme,
    toggleTheme,
  };
});
