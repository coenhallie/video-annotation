<script setup lang="ts">
import type { AnnotationSurface } from '@/types/database';

const props = defineProps<{ modelValue: AnnotationSurface }>();

const emit = defineEmits<{
  (e: 'update:modelValue', surface: AnnotationSurface): void;
}>();

const TABS: Array<{ id: AnnotationSurface; label: string }> = [
  { id: 'video', label: 'Video' },
  { id: 'pipeline', label: 'Pipeline output' },
];

/**
 * Re-clicking the active tab is a no-op on purpose. Every emit reaches the
 * watcher in useVideoAnnotations and costs an annotation refetch.
 */
const select = (surface: AnnotationSurface) => {
  if (surface === props.modelValue) return;
  emit('update:modelValue', surface);
};
</script>

<template>
  <div
    role="tablist"
    aria-label="Editor surface"
    class="flex shrink-0 items-center gap-1 border-b border-white/10 bg-black px-4"
  >
    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      role="tab"
      :data-testid="`surface-tab-${tab.id}`"
      :aria-selected="tab.id === modelValue ? 'true' : 'false'"
      class="relative -mb-px border-b-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors"
      :class="
        tab.id === modelValue
          ? 'border-white text-white'
          : 'border-transparent text-gray-500 hover:text-gray-300'
      "
      @click="select(tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
