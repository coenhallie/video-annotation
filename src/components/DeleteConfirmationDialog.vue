<template>
  <div class="fixed inset-0 z-[100] overflow-y-auto">
    <div
      class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0"
    >
      <!-- Background overlay -->
      <div
        class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
        @click="$emit('cancel')"
      />

      <!-- This element is to trick the browser into centering the modal contents. -->
      <span
        class="hidden sm:inline-block sm:align-middle sm:h-screen"
        aria-hidden="true"
        >&#8203;</span
      >

      <!-- Modal panel -->
      <div
        class="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
        @click.stop
      >
        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div class="sm:flex sm:items-start">
            <div
              class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10"
            >
              <svg
                class="h-6 w-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
              <h3 class="text-lg leading-6 font-medium text-gray-900">
                {{ getTitle() }}
              </h3>
              <div class="mt-2">
                <p class="text-sm text-gray-500">
                  {{ getMessage() }}
                </p>
                <div
                  v-if="itemType === 'folder' && itemCount > 0"
                  class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md"
                >
                  <div class="flex">
                    <div class="flex-shrink-0">
                      <svg
                        class="h-5 w-5 text-yellow-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                    <div class="ml-3">
                      <p class="text-sm text-yellow-700">
                        This folder contains {{ itemCount }} project{{
                          itemCount !== 1 ? 's' : ''
                        }}. All projects will be permanently deleted.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button
            type="button"
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
            @click="$emit('confirm')"
          >
            Delete
          </button>
          <button
            type="button"
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            @click="$emit('cancel')"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

// Props
const props = defineProps<{
  itemType: 'project' | 'folder' | 'projects';
  itemName: string;
  itemCount: number;
}>();

// Emits
defineEmits<{
  confirm: [];
  cancel: [];
}>();

// Lifecycle
onMounted(() => {
  console.log('🗑️ DeleteConfirmationDialog: Mounted with props:', {
    itemType: props.itemType,
    itemName: props.itemName,
    itemCount: props.itemCount,
  });
});

onUnmounted(() => {
  console.log('🗑️ DeleteConfirmationDialog: Unmounted');
});

// Methods
const getTitle = () => {
  switch (props.itemType) {
    case 'project':
      return 'Delete Project';
    case 'folder':
      return 'Delete Folder';
    case 'projects':
      return 'Delete Projects';
    default:
      return 'Confirm Delete';
  }
};

const getMessage = () => {
  switch (props.itemType) {
    case 'project':
      return `Are you sure you want to delete "${props.itemName}"? This action cannot be undone and will permanently remove the project and all its annotations.`;
    case 'folder':
      return `Are you sure you want to delete the folder "${props.itemName}"? This action cannot be undone.`;
    case 'projects':
      return `Are you sure you want to delete ${props.itemCount} selected projects? This action cannot be undone and will permanently remove all selected projects and their annotations.`;
    default:
      return 'Are you sure you want to delete this item? This action cannot be undone.';
  }
};
</script>
