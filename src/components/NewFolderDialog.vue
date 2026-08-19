<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] overflow-y-auto">
      <!-- Background overlay -->
      <div
        class="fixed inset-0 bg-black/50 transition-opacity"
        @click="$emit('close')"
      />

      <!-- Center container -->
      <div class="flex min-h-screen items-center justify-center px-4 py-10">
        <!-- Modal panel. Same floating surface as the annotation form's label
             picker and the dashboard's filter card. -->
        <div
          class="relative w-full max-w-sm rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
          @click.stop
        >
          <div class="border-b border-gray-200 px-4 py-3 dark:border-white/10">
            <h3 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
              New folder
            </h3>
          </div>

          <div class="px-4 py-4">
            <label
              for="folder-name"
              class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
            >
              Folder name
            </label>
            <input
              id="folder-name"
              ref="nameInput"
              v-model="folderName"
              type="text"
              class="w-full rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
              placeholder="Untitled folder"
              @keydown.enter="createFolder"
              @keydown.esc="$emit('close')"
            >
            <p
              v-if="parentFolder"
              class="mt-2 text-[11px] text-gray-500 dark:text-gray-400"
            >
              Created inside "{{ parentFolder.name }}"
            </p>
          </div>

          <div
            class="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3 dark:border-white/10"
          >
            <button
              type="button"
              class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              :disabled="!folderName.trim()"
              class="rounded bg-gray-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-700 dark:hover:bg-gray-600"
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
