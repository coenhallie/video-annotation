<template>
  <div class="fixed inset-0 z-50 overflow-y-auto" @click="$emit('close')">
    <div
      class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0"
    >
      <!-- Background overlay -->
      <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" />

      <!-- Modal panel -->
      <div
        class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
        @click.stop
      >
        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div class="sm:flex sm:items-start">
            <div
              class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10"
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
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
            </div>
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
              <h3 class="text-lg leading-6 font-medium text-gray-900">
                Move {{ projects.length }} Project{{
                  projects.length !== 1 ? 's' : ''
                }}
              </h3>
              <div class="mt-4">
                <p class="text-sm text-gray-500 mb-3">
                  Select the destination folder:
                </p>

                <!-- Folder Tree -->
                <div
                  class="max-h-64 overflow-y-auto border border-gray-200 rounded-md p-2"
                >
                  <!-- Root folder option -->
                  <div
                    :class="[
                      'folder-option px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100',
                      selectedFolderId === null && 'bg-blue-50 text-blue-700',
                      currentFolderId === null &&
                        'opacity-50 cursor-not-allowed',
                    ]"
                    @click="currentFolderId !== null && selectFolder(null)"
                  >
                    <div class="flex items-center gap-2">
                      <svg
                        class="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                        />
                      </svg>
                      <span class="text-sm font-medium"
                        >Root (All Projects)</span
                      >
                    </div>
                  </div>

                  <!-- Folder tree -->
                  <div class="mt-1">
                    <MoveDialogFolderItem
                      v-for="folder in folders"
                      :key="folder.id"
                      :folder="folder"
                      :selected-folder-id="selectedFolderId"
                      :current-folder-id="currentFolderId"
                      :level="0"
                      @select="selectFolder"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button
            type="button"
            :disabled="selectedFolderId === currentFolderId"
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            @click="moveProjects"
          >
            Move
          </button>
          <button
            type="button"
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            @click="$emit('close')"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { FolderTreeNode } from '../types/folder';
import MoveDialogFolderItem from './MoveDialogFolderItem.vue';

// Props
const props = defineProps<{
  projects: string[];
  folders: FolderTreeNode[];
  currentFolderId: string | null;
}>();

// Emits
const emit = defineEmits<{
  move: [targetFolderId: string | null];
  close: [];
}>();

// State
const selectedFolderId = ref<string | null>(props.currentFolderId);

// Methods
const selectFolder = (folderId: string | null) => {
  if (folderId !== props.currentFolderId) {
    selectedFolderId.value = folderId;
  }
};

const moveProjects = () => {
  if (selectedFolderId.value !== props.currentFolderId) {
    emit('move', selectedFolderId.value);
  }
};
</script>
