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
  // The match tracker loads its fonts with `new URL('./font.woff2',
  // import.meta.url)`. Pre-bundled, its code is served from .vite/deps, where
  // the fonts are not, so the dev server answered with the app's HTML and the
  // pitch fell back to system fonts. Served from its own folder, the fonts sit
  // next to it. The build copies them either way.
  optimizeDeps: {
    exclude: ['@coenhallie/match-tracker'],
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
