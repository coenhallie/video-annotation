<template>
  <div class="move-dialog-folder-item">
    <div
      :class="[
        'folder-option px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100',
        selectedFolderId === folder.id && 'bg-blue-50 text-blue-700',
        currentFolderId === folder.id && 'opacity-50 cursor-not-allowed',
      ]"
      :style="{ paddingLeft: `${level * 20 + 8}px` }"
      @click="handleClick"
    >
      <div class="flex items-center gap-2">
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
        <span class="text-sm font-medium flex-1 truncate">
          {{ folder.name }}
        </span>

        <!-- Project Count Badge -->
        <span
          v-if="folder.totalProjectCount > 0"
          class="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full"
        >
          {{ folder.totalProjectCount }}
        </span>
      </div>
    </div>

    <!-- Children -->
    <div v-if="isExpanded && folder.children.length > 0" class="ml-2">
      <MoveDialogFolderItem
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :selected-folder-id="selectedFolderId"
        :current-folder-id="currentFolderId"
        :level="level + 1"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { FolderTreeNode } from '../types/folder';

// Props
const props = defineProps<{
  folder: FolderTreeNode;
  selectedFolderId: string | null;
  currentFolderId: string | null;
  level: number;
}>();

// Emits
const emit = defineEmits<{
  select: [folderId: string];
}>();

// State
const isExpanded = ref(false);

// Methods
const handleClick = () => {
  if (props.currentFolderId !== props.folder.id) {
    emit('select', props.folder.id);
  }
};

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
};
</script>
