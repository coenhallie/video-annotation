<template>
  <span
    ref="iconRef"
    class="inline-flex items-center flex-shrink-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 cursor-help"
    tabindex="0"
    role="img"
    :aria-label="description"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
    @click.stop
  >
    <svg
      class="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <Teleport to="body">
      <div
        v-if="visible"
        class="fixed z-[9999] w-max max-w-xs px-3 py-2 text-xs leading-relaxed text-white bg-gray-900 dark:bg-gray-700 rounded-md shadow-lg pointer-events-none"
        :style="tooltipStyle"
        role="tooltip"
      >
        {{ description }}
      </div>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { CSSProperties } from 'vue';

const props = defineProps({
  description: {
    type: String,
    required: true,
  },
});

const iconRef = ref<HTMLElement | null>(null);
const visible = ref(false);
const tooltipStyle = ref<CSSProperties>({});

const TOOLTIP_MAX_WIDTH = 320; // matches max-w-xs
const GAP = 8;

const show = () => {
  const rect = iconRef.value?.getBoundingClientRect();
  if (!rect) return;

  const style: CSSProperties = {
    top: `${rect.top + rect.height / 2}px`,
    transform: 'translateY(-50%)',
  };

  // Prefer showing to the right of the icon; flip left when it would overflow
  if (rect.right + GAP + TOOLTIP_MAX_WIDTH <= window.innerWidth) {
    style.left = `${rect.right + GAP}px`;
  } else {
    style.right = `${window.innerWidth - rect.left + GAP}px`;
  }

  tooltipStyle.value = style;
  visible.value = true;
};

const hide = () => {
  visible.value = false;
};
</script>
