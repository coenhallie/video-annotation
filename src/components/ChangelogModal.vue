<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click="closeModal"
  >
    <div
      class="flex max-h-[85vh] w-full max-w-lg flex-col rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
      @click.stop
    >
      <!-- Modal Header -->
      <div
        class="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10"
      >
        <h2 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
          Changelog
        </h2>
        <button
          type="button"
          class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          @click="closeModal"
        >
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M18 6 6 18M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Modal Content (Scrollable). Versions read as a list of releases, not
           as blue-ruled blocks: the mono version token carries the heading. -->
      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div class="space-y-6">
          <div
            v-for="(entry, index) in changelogEntries"
            :key="index"
          >
            <div class="flex items-baseline gap-2">
              <h3 class="font-mono text-[11px] tracking-wider text-gray-900 dark:text-white">
                {{ entry.version }}
              </h3>
              <span class="font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500">
                {{ entry.date }}
              </span>
            </div>
            <ul class="mt-2 space-y-1">
              <li
                v-for="(change, cIndex) in entry.changes"
                :key="cIndex"
                class="flex gap-2 text-[12px] leading-relaxed text-gray-700 dark:text-gray-300"
              >
                <span class="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gray-400 dark:bg-gray-600" />
                <span>{{ change }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div
        class="flex shrink-0 items-center justify-end border-t border-gray-200 px-4 py-3 dark:border-white/10"
      >
        <button
          type="button"
          class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
          @click="closeModal"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

// Props
defineProps({
  isVisible: {
    type: Boolean,
    default: false,
  },
});

// Emits
const emit = defineEmits(['close']);

// Methods
const closeModal = () => {
  emit('close');
};

// --- MANUAL CHANGELOG ENTRIES ---
// Add new entries to the TOP of this array
const changelogEntries = ref([
  {
    version: 'Beta v3.9',
    date: 'July 9, 2026',
    changes: [
      'New video library: browse all shared videos with search, All/My Videos scope toggle, and pagination',
      'Organize videos into folders with drag & drop filing and folder filtering',
      'Video details sidebar: preview annotations, jump straight to their timestamps, and see per-video stats',
      'Watch progress tracking: see how much of each video you and your team have watched',
      'Filter videos by annotation labels via the new Filter button next to the search bar',
      'New football-tracking QA label set (EVT/PITCH/TEAM/NPL/PLR/PLY/BALL) with descriptions shown in tooltips',
      'Thumbnails for AWS pipeline videos',
      'Click the Perspecto title to return to the library',
      'Security: database access is now protected with row-level security policies',
    ],
  },
  {
    version: 'Beta v3.8',
    date: 'March 13, 2026',
    changes: [
      'Major codebase refactor for improved performance and maintainability',
      'Fix frame number not updating when scrubbing AWS pipeline videos',
      'Fix drawing annotations not saving when added to an annotation',
      'Fix frame counter showing -1 and not updating until video is played',
      'Fix silent error swallowing in drawing canvas and comment handlers',
      'Fix memory leaks in dual video player and comment subscriptions',
      'Consolidate video state into single source of truth',
      'Standardize error handling across all services',
    ],
  },
  {
    version: 'Beta v3.7',
    date: 'March 12, 2026',
    changes: [
      'Load pipeline output videos directly via shared link',
      'Automatic presigned URL refresh for streamed videos',
    ],
  },
    {
    version: 'Beta v3.6',
    date: 'February 25, 2026',
    changes: [
      'Hide comment functionality in view-only mode'
    ],
  },
  {
    version: 'Beta v3.5',
    date: 'February 23, 2026',
    changes: [
      'Make skeleton loader work for both light and dark mode'
    ],
  },
   {
    version: 'Beta v3.4',
    date: 'February 17, 2026',
    changes: [
      'Add frame increase/decrease using arrow keys',
      'Use spacebar to play/pause video',
      'Fix drawing annotation persistence'
    ],
  },
  {
    version: 'Beta v3.3',
    date: 'February 8, 2026',
    changes: [
      'Added dark mode toggle',
    ],
  },
  {
    version: 'Beta v3.2',
    date: 'February 7, 2026',
    changes: [
      'Removed all video analytics functionality',
    ],
  },
  {
    version: 'Beta v3.1',
    date: 'January 27, 2026',
    changes: [
      'Fixed video scrubbing performance',
    ],
  },
  {
    version: 'Beta v3',
    date: 'January 26, 2026',
    changes: [
      'Added Changelog modal',
      'Implemented Keycloak Authentication',
      'Updated to Montserrat font',
      'Improved video scrubbing performance',
      'Major refactor to clean-up components'
    ],
  },
]);
</script>
