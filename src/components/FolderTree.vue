<template>
  <div class="folder-tree">
    <!-- Root folder -->
    <div
      :class="[
        'folder-item flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors',
        selectedFolderId === null
          ? 'bg-gray-100 text-gray-900 dark:bg-white/[0.06] dark:text-white'
          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.03]',
      ]"
      @click="$emit('select', null)"
      @dragover.prevent="handleRootDragOver"
      @drop="handleRootDrop"
      @dragleave="handleRootDragLeave"
    >
      <svg
        class="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <span class="text-[13px] font-medium tracking-tight">All Projects</span>
    </div>

    <!-- Folder tree items -->
    <div class="mt-2">
      <FolderTreeItem
        v-for="folder in folders"
        :key="folder.id"
        :folder="folder"
        :selected-folder-id="selectedFolderId"
        :drag-over-folder-id="dragOverFolderId"
        :level="0"
        @select="(folder: FolderTreeNode) => $emit('select', folder)"
        @create="(folder: FolderTreeNode) => $emit('create', folder)"
        @rename="(folder: FolderTreeNode, newName: string) => $emit('rename', folder, newName)"
        @delete="(folder: FolderTreeNode) => $emit('delete', folder)"
        @drop="(folder: FolderTreeNode, event: DragEvent) => $emit('drop', folder, event)"
        @dragover="(folder: FolderTreeNode, event: DragEvent) => $emit('dragover', folder, event)"
        @dragleave="() => $emit('dragleave')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { FolderTreeNode } from '../types/folder';
import FolderTreeItem from './FolderTreeItem.vue';

// Props
defineProps<{
  folders: FolderTreeNode[];
  selectedFolderId: string | null;
  dragOverFolderId: string | null;
}>();

// Emits
const emit = defineEmits<{
  select: [folder: FolderTreeNode | null];
  create: [parentFolder: FolderTreeNode | null];
  rename: [folder: FolderTreeNode, newName: string];
  delete: [folder: FolderTreeNode];
  drop: [folder: FolderTreeNode | null, event: DragEvent];
  dragover: [folder: FolderTreeNode | null, event: DragEvent];
  dragleave: [];
}>();

// State
const isRootDragOver = ref(false);

// Methods
const handleRootDragOver = (event: DragEvent) => {
  event.preventDefault();
  isRootDragOver.value = true;
  emit('dragover', null, event);
};

const handleRootDrop = (event: DragEvent) => {
  event.preventDefault();
  isRootDragOver.value = false;
  emit('drop', null, event);
};

const handleRootDragLeave = () => {
  isRootDragOver.value = false;
  emit('dragleave');
};
</script>

<style scoped>
.folder-tree {
  user-select: none;
}
</style>
