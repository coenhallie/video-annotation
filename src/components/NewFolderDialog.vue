<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] overflow-y-auto">
      <!-- Background overlay -->
      <div
        class="fixed inset-0 transition-opacity bg-black/50 backdrop-blur-sm"
        @click="$emit('close')"
      />

      <!-- Center container -->
      <div
        class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center"
      >
        <!-- Modal panel -->
        <div
          class="relative inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
          @click.stop
        >
          <div class="bg-white px-6 pt-6 pb-4">
            <div class="flex items-start gap-4">
              <div
                class="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-50"
              >
                <svg
                  class="h-6 w-6 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">
                  Create New Folder
                </h3>
                <div>
                  <label
                    for="folder-name"
                    class="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Folder Name
                  </label>
                  <input
                    id="folder-name"
                    ref="nameInput"
                    v-model="folderName"
                    type="text"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="Enter folder name"
                    @keydown.enter="createFolder"
                    @keydown.esc="$emit('close')"
                  />
                  <p v-if="parentFolder" class="mt-2 text-sm text-gray-500">
                    This folder will be created inside "{{ parentFolder.name }}"
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div class="bg-gray-50 px-6 py-4 flex justify-end gap-3">
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              :disabled="!folderName.trim()"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              @click="createFolder"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { Folder } from '../types/folder';

// Props
const props = defineProps<{
  parentFolder: Folder | null;
}>();

// Emits
const emit = defineEmits<{
  create: [name: string, parentId: string | null];
  close: [];
}>();

// State
const folderName = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

// Methods
const createFolder = () => {
  if (folderName.value.trim()) {
    emit('create', folderName.value.trim(), props.parentFolder?.id || null);
  }
};

// Lifecycle
onMounted(() => {
  nameInput.value?.focus();
});
</script>
