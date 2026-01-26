<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click="closeModal"
  >
    <div
      class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 flex flex-col max-h-[85vh]"
      @click.stop
    >
      <!-- Modal Header -->
      <div
        class="flex items-center justify-between p-6 border-b border-gray-200"
      >
        <h2 class="text-xl font-semibold text-gray-900">
          Changelog
        </h2>
        <button
          class="text-gray-400 hover:text-gray-600 transition-colors"
          @click="closeModal"
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

      <!-- Modal Content (Scrollable) -->
      <div class="p-6 overflow-y-auto flex-1">
        <div class="space-y-8">
          <div v-for="(entry, index) in changelogEntries" :key="index" class="border-l-4 border-blue-500 pl-4 py-1">
            <div class="flex items-baseline justify-between mb-2">
              <h3 class="text-lg font-bold text-gray-900">{{ entry.version }}</h3>
              <span class="text-sm text-gray-500">{{ entry.date }}</span>
            </div>
            <ul class="list-disc list-inside space-y-1 text-gray-700">
              <li v-for="(change, cIndex) in entry.changes" :key="cIndex">
                {{ change }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div
        class="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg"
      >
        <button
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
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
