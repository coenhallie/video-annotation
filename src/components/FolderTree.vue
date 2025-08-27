<template>
  <div class="folder-tree">
    <!-- Root folder -->
    <div
      :class="[
        'folder-item px-2 py-1.5 rounded-md cursor-pointer flex items-center gap-2 hover:bg-gray-100',
        selectedFolderId === null && 'bg-blue-50 text-blue-700',
      ]"
      @click="$emit('select', null)"
      @dragover.prevent="handleRootDragOver"
      @drop="handleRootDrop"
      @dragleave="handleRootDragLeave"
    >
      <svg
        class="w-4 h-4 flex-shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
        />
      </svg>
      <span class="text-sm font-medium">All Projects</span>
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
