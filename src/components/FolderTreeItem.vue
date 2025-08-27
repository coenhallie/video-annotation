<template>
  <div class="folder-tree-item">
    <div
      :class="[
        'folder-item px-2 py-1.5 rounded-md cursor-pointer flex items-center gap-1 hover:bg-gray-100 transition-colors',
        selectedFolderId === folder.id && 'bg-blue-50 text-blue-700',
        dragOverFolderId === folder.id && 'bg-blue-100 ring-2 ring-blue-400',
      ]"
      :style="{ paddingLeft: `${level * 20 + 8}px` }"
      @click="handleClick"
      @contextmenu.prevent="showContextMenu"
      @dragover.prevent="handleDragOver"
      @drop="handleDrop"
      @dragleave="handleDragLeave"
    >
      <!-- Expand/Collapse Arrow -->
      <button
        v-if="folder.children.length > 0"
        class="p-0.5 hover:bg-gray-200 rounded"
        @click.stop="toggleExpanded"
      >
        <svg
          :class="['w-3 h-3 transition-transform', isExpanded && 'rotate-90']"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fill-rule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
      <div v-else class="w-4" />

      <!-- Folder Icon -->
      <svg
        class="w-4 h-4 flex-shrink-0"
        :class="folder.color && `text-${folder.color}-500`"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          v-if="isExpanded && folder.children.length > 0"
          d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
        />
        <path
          v-else
          fill-rule="evenodd"
          d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4z"
          clip-rule="evenodd"
        />
      </svg>

      <!-- Folder Name -->
      <span v-if="!isRenaming" class="text-sm font-medium flex-1 truncate">
        {{ folder.name }}
      </span>
      <input
        v-else
        ref="renameInput"
        v-model="newName"
        type="text"
        class="text-sm font-medium flex-1 px-1 py-0 border border-blue-400 rounded outline-none focus:ring-1 focus:ring-blue-500"
        @click.stop
        @keydown.enter="confirmRename"
        @keydown.esc="cancelRename"
        @blur="confirmRename"
      />

      <!-- Project Count Badge -->
      <span
        v-if="folder.totalProjectCount > 0"
        class="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full"
      >
        {{ folder.totalProjectCount }}
      </span>

      <!-- Actions Menu -->
      <div
        v-if="showActions"
        class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button
          class="p-1 hover:bg-gray-200 rounded"
          title="New subfolder"
          @click.stop="createSubfolder"
        >
          <svg
            class="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
        <button
          class="p-1 hover:bg-gray-200 rounded"
          title="Rename"
          @click.stop="startRename"
        >
          <svg
            class="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          class="p-1 hover:bg-red-100 text-red-600 rounded"
          title="Delete"
          @click.stop="deleteFolder"
        >
          <svg
            class="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Children -->
    <div v-if="isExpanded && folder.children.length > 0" class="ml-2">
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
const showActions = ref(false);
const renameInput = ref<HTMLInputElement | null>(null);

// Methods
const handleClick = () => {
  emit('select', props.folder);
};

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
  props.folder.isExpanded = isExpanded.value;
};

const showContextMenu = (event: MouseEvent) => {
  // You could implement a context menu here
  showActions.value = true;
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
  if (confirm(`Delete folder "${props.folder.name}" and all its contents?`)) {
    emit('delete', props.folder);
  }
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
