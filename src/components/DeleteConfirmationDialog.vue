<template>
  <div class="fixed inset-0 z-[100] overflow-y-auto">
    <!-- Background overlay -->
    <div
      class="fixed inset-0 bg-black/50 transition-opacity"
      @click="$emit('cancel')"
    />

    <div class="flex min-h-screen items-center justify-center px-4 py-10">
      <!-- Modal panel -->
      <div
        ref="dialogPanel"
        role="alertdialog"
        aria-modal="true"
        :aria-label="getTitle()"
        class="relative w-full max-w-sm rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
        @click.stop
      >
        <div class="border-b border-gray-200 px-4 py-3 dark:border-white/10">
          <h3 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
            {{ getTitle() }}
          </h3>
        </div>

        <div class="px-4 py-4">
          <p class="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400">
            {{ getMessage() }}
          </p>
          <!-- The extra loss is the one thing here that must not be skimmed,
               so it keeps a colour - the same red the action button uses. -->
          <p
            v-if="itemType === 'video' && impactLoading"
            class="mt-3 text-[12px] leading-relaxed text-gray-500 dark:text-gray-400"
          >
            Counting what goes with it…
          </p>
          <p
            v-if="itemType === 'video' && impact && impact.comparisons > 0"
            class="mt-3 text-[12px] leading-relaxed text-red-600 dark:text-red-400"
          >
            It is used in {{ plural(impact.comparisons, 'comparison') }}. They will be
            deleted too, with their annotations.
          </p>
          <p
            v-if="itemType === 'folder' && itemCount > 0"
            class="mt-3 text-[12px] leading-relaxed text-red-600 dark:text-red-400"
          >
            This folder contains {{ itemCount }} project{{ itemCount !== 1 ? 's' : '' }}.
            All of them will be permanently deleted.
          </p>
        </div>

        <div
          class="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3 dark:border-white/10"
        >
          <button
            type="button"
            class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
            @click="$emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="busy === true || impactLoading === true"
            class="rounded bg-red-600 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            @click="$emit('confirm')"
          >
            {{ busy ? 'Deleting' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useEscapeToClose } from '../composables/useEscapeToClose';
import { useFocusTrap } from '../composables/useFocusTrap';
import type { VideoDeleteImpact } from '../services/videoService';

// Props
const props = defineProps<{
  itemType: 'project' | 'folder' | 'projects' | 'annotation' | 'video';
  itemName: string;
  itemCount: number;
  // True while the parent's delete request runs; a second confirm would fire
  // the delete again and fail on the row the first one removed.
  busy?: boolean;
  // Video only: what goes with the video. Null once loading has finished means
  // the counts could not be read, and the message falls back to a general one.
  impact?: VideoDeleteImpact | null;
  // Video only: confirm stays disabled meanwhile, so nobody deletes before
  // seeing the counts the dialog exists to show.
  impactLoading?: boolean;
}>();

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Emits
const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

// Rendered with v-if by its parents, so mounted means open.
const dialogPanel = ref<HTMLElement | null>(null);
useFocusTrap(dialogPanel, () => true);

useEscapeToClose(() => true, () => emit('cancel'));

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
    case 'annotation':
      return 'Delete Annotation';
    case 'video':
      return 'Delete Video';
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
    case 'annotation':
      return `Are you sure you want to delete "${props.itemName}"? This action cannot be undone and will permanently remove the annotation with its drawing and comments.`;
    case 'video': {
      const lead = `Are you sure you want to delete "${props.itemName}"? This action cannot be undone and removes the video for everyone`;
      if (props.impact) {
        return `${lead}, with its ${plural(props.impact.annotations, 'annotation')} and ${plural(props.impact.comments, 'comment')}.`;
      }
      return `${lead}, with all its annotations and comments.`;
    }
    default:
      return 'Are you sure you want to delete this item? This action cannot be undone.';
  }
};
</script>
