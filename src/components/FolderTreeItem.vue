<template>
  <div class="folder-tree-item">
    <div
      :class="[
        'folder-item group flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 transition-colors',
        selectedFolderId === folder.id
          ? 'bg-gray-100 text-gray-900 dark:bg-white/[0.06] dark:text-white'
          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.03]',
        dragOverFolderId === folder.id &&
          'bg-gray-100 ring-1 ring-gray-400 dark:bg-white/[0.08] dark:ring-white/30',
      ]"
      :style="{ paddingLeft: `${level * 20 + 8}px` }"
      @click="handleClick"
      @dragover.prevent="handleDragOver"
      @drop="handleDrop"
      @dragleave="handleDragLeave"
    >
      <!-- Expand/Collapse Arrow -->
      <button
        v-if="folder.children.length > 0"
        type="button"
        class="rounded p-0.5 text-gray-400 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-200"
        @click.stop="toggleExpanded"
      >
        <svg
          :class="['h-3 w-3 transition-transform', isExpanded && 'rotate-90']"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m9 18 6-6-6-6"
          />
        </svg>
      </button>
      <div
        v-else
        class="w-4"
      />

      <!-- Folder Icon -->
      <!-- Dropped the old `text-${folder.color}-500` binding: Tailwind's
           scanner cannot see an interpolated class name, so it only ever
           coloured folders whose colour happened to match a class compiled
           somewhere else in the app - red and purple, and nothing else. -->
      <svg
        class="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>

      <!-- Folder Name -->
      <span
        v-if="!isRenaming"
        class="flex-1 truncate text-[13px] font-medium tracking-tight"
      >
        {{ folder.name }}
      </span>
      <input
        v-else
        ref="renameInput"
        v-model="newName"
        type="text"
        class="flex-1 rounded border border-gray-200 bg-transparent px-1 py-0 text-[13px] font-medium tracking-tight text-gray-900 outline-none transition-colors focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:focus:border-white/40"
        @click.stop
        @keydown.enter="confirmRename"
        @keydown.esc="cancelRename"
        @blur="confirmRename"
      >

      <!-- Project Count Badge -->
      <span
        v-if="folder.totalProjectCount > 0"
        class="font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
      >
        {{ folder.totalProjectCount }}
      </span>

      <!-- Actions Menu -->
      <div
        class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button
          type="button"
          class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          title="New subfolder"
          @click.stop="createSubfolder"
        >
          <svg
            class="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
        <button
          type="button"
          class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          title="Rename"
          @click.stop="startRename"
        >
          <svg
            class="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <!-- Red only on hover, the one place colour still carries meaning. -->
        <button
          type="button"
          class="rounded p-1 text-gray-500 transition-colors hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
          title="Delete"
          @click.stop="deleteFolder"
        >
          <svg
            class="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Children -->
    <div
      v-if="isExpanded && folder.children.length > 0"
      class="ml-2"
    >
      <FolderTreeItem
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :selected-folder-id="selectedFolderId"
        :drag-over-folder-id="dragOverFolderId"
        :level="level + 1"
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
import { ref, nextTick } from 'vue';
import type { FolderTreeNode } from '../types/folder';

// Props
const props = defineProps<{
  folder: FolderTreeNode;
  selectedFolderId: string | null;
  dragOverFolderId: string | null;
  level: number;
}>();

// Emits
const emit = defineEmits<{
  select: [folder: FolderTreeNode];
  create: [parentFolder: FolderTreeNode];
  rename: [folder: FolderTreeNode, newName: string];
  delete: [folder: FolderTreeNode];
  drop: [folder: FolderTreeNode, event: DragEvent];
  dragover: [folder: FolderTreeNode, event: DragEvent];
  dragleave: [];
}>();

// State
const isExpanded = ref(props.folder.isExpanded || false);
const isRenaming = ref(false);
const newName = ref(props.folder.name);
const renameInput = ref<HTMLInputElement | null>(null);

// Methods
const handleClick = () => {
  emit('select', props.folder);
};

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
  props.folder.isExpanded = isExpanded.value;
};

const createSubfolder = () => {
  emit('create', props.folder);
};

const startRename = async () => {
  isRenaming.value = true;
  newName.value = props.folder.name;
  await nextTick();
  renameInput.value?.select();
};

const confirmRename = () => {
  if (newName.value.trim() && newName.value !== props.folder.name) {
    emit('rename', props.folder, newName.value.trim());
  }
  isRenaming.value = false;
};

const cancelRename = () => {
  isRenaming.value = false;
  newName.value = props.folder.name;
};

const deleteFolder = () => {
  emit('delete', props.folder);
};

const handleDragOver = (event: DragEvent) => {
  emit('dragover', props.folder, event);
};

const handleDrop = (event: DragEvent) => {
  emit('drop', props.folder, event);
};

const handleDragLeave = () => {
  emit('dragleave');
};
</script>

<style scoped>
.folder-tree-item {
  user-select: none;
}

.folder-item:hover .group-hover\:opacity-100 {
  opacity: 1;
}
</style>
