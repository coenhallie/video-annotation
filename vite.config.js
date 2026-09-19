import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [tailwindcss(), vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Production builds lose debug chatter only. console.warn and console.error
  // stay: they are the app's only error trail (the Vue errorHandler, the
  // service error handler and every catch block log through them), and
  // dropping all of `console` compiled those handlers down to empty functions.
  // Dev keeps everything.
  esbuild:
    command === 'build'
      ? {
          drop: ['debugger'],
          pure: ['console.log', 'console.debug', 'console.info', 'console.trace'],
        }
      : {},
}));
