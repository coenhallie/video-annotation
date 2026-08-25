<script setup lang="ts">
import type { SidebarTab } from '@/types/component-interfaces';

const props = defineProps<{ modelValue: SidebarTab }>();

const emit = defineEmits<{
  (e: 'update:modelValue', tab: SidebarTab): void;
}>();

const TABS: Array<{ id: SidebarTab; label: string }> = [
  { id: 'annotations', label: 'Annotations' },
  { id: 'history', label: 'History' },
];

/**
 * Re-clicking the active tab is a no-op on purpose. Every emit reaches
 * ActivityTimeline's watcher and costs a refetch.
 */
const select = (tab: SidebarTab) => {
  if (tab === props.modelValue) return;
  emit('update:modelValue', tab);
};
</script>

<template>
  <!-- Deliberately not styled like EditorSurfaceTabs, which sits above the
       player on black and switches what the video area shows. Two tab bars on
       one screen that look identical read as one control. This one lives on the
       sidebar's own surface and uses the panel's border colour. -->
  <div
    role="tablist"
    aria-label="Sidebar panel"
    class="flex shrink-0 items-center gap-1 border-b border-gray-200 px-3 dark:border-white/10"
  >
    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      role="tab"
      :data-testid="`sidebar-tab-${tab.id}`"
      :aria-selected="tab.id === modelValue ? 'true' : 'false'"
      class="relative -mb-px border-b-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
      :class="
        tab.id === modelValue
          ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
          : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
      "
      @click="select(tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
