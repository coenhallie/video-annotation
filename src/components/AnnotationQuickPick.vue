<script setup lang="ts">
import { computed, nextTick, ref, watch, onBeforeUnmount, type PropType } from 'vue';
import {
  assignLabelShortcuts,
  groupLabelsByCategory,
  labelShortName,
  type LabelCategoryGroup,
} from '../utils/labelCategories';
import type { Label } from '../types/labels';

const props = defineProps({
  open: { type: Boolean, default: false },
  /** Page coordinates of the click that opened the panel. */
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  labels: { type: Array as PropType<Label[]>, default: () => [] },
  /** Frame the annotation will land on, shown in the header. */
  frame: { type: Number, default: 0 },
  fps: { type: Number, default: 30 },
});

const emit = defineEmits<{
  (e: 'select', label: Label): void;
  (e: 'close'): void;
}>();

const PANEL_W = 460;
const EDGE_MARGIN = 12;

const activeCategory = ref<LabelCategoryGroup | null>(null);

const categories = computed(() => groupLabelsByCategory(props.labels));

/**
 * Shortcuts are scoped to a category, so the same letter can mean different
 * things under different categories and each set stays short enough to learn.
 */
const shortcuts = computed(() =>
  activeCategory.value ? assignLabelShortcuts(activeCategory.value.labels) : {}
);

interface LabelRow {
  label: Label;
  letter: string;
  text: string;
}

const labelRows = computed<LabelRow[]>(() =>
  (activeCategory.value?.labels ?? []).map((label) => ({
    label,
    letter: shortcuts.value[label.id] ?? '',
    text: labelShortName(label),
  }))
);

const timecode = computed(() => {
  const seconds = props.fps > 0 ? props.frame / props.fps : 0;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
});

const frameLabel = computed(
  () => `F${String(Math.max(props.frame, 0)).padStart(5, '0')}`
);

const selectCategory = (group: LabelCategoryGroup) => {
  activeCategory.value = group;
};

const commit = (label: Label) => {
  emit('select', label);
};

const back = () => {
  if (activeCategory.value) activeCategory.value = null;
  else emit('close');
};

/**
 * Once a category is chosen, letters address its labels only. Letting them also
 * re-address categories would make P ambiguous under BALL, where it is already
 * WRONG POS. Escape or Backspace steps back out.
 */
const handleKeydown = (event: KeyboardEvent) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === 'Escape' || event.key === 'Backspace') {
    event.preventDefault();
    event.stopPropagation();
    back();
    return;
  }

  if (event.key.length !== 1) return;
  const key = event.key.toUpperCase();
  if (!/[A-Z]/.test(key)) return;

  if (activeCategory.value) {
    const row = labelRows.value.find((r) => r.letter === key);
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    commit(row.label);
    return;
  }

  const group = categories.value.find((c) => c.letter === key);
  if (!group) return;
  event.preventDefault();
  event.stopPropagation();
  selectCategory(group);
};

/**
 * Anchored to the click, but pinned so the panel never leaves the viewport.
 * Its height is content-driven, so the vertical clamp uses the measured
 * element rather than a guess.
 */
const panelRef = ref<HTMLElement | null>(null);
const panelHeight = ref(0);

const position = computed(() => {
  const maxLeft = window.innerWidth - PANEL_W - EDGE_MARGIN;
  const left = Math.min(Math.max(props.x - PANEL_W / 2, EDGE_MARGIN), Math.max(EDGE_MARGIN, maxLeft));
  // Prefer sitting above the click, the way the timeline entry point needs;
  // drop below only when there is no room above.
  const height = panelHeight.value || 320;
  const above = props.y - height - 16;
  const top = above >= EDGE_MARGIN ? above : Math.min(props.y + 16, window.innerHeight - height - EDGE_MARGIN);
  return { left: `${left}px`, top: `${Math.max(top, EDGE_MARGIN)}px` };
});

const measure = () => {
  panelHeight.value = panelRef.value?.offsetHeight ?? 0;
};

watch(
  () => props.open,
  async (open) => {
    if (open) {
      activeCategory.value = null;
      // Two belts here on purpose. The window listener is capture phase so the
      // player's own global shortcuts cannot consume the keys first, and moving
      // focus into the panel means the keys are delivered to it even if
      // something else owns focus when it opens. Whichever handler runs first
      // stops propagation, so a keystroke is never acted on twice.
      window.addEventListener('keydown', handleKeydown, true);
      await nextTick();
      panelRef.value?.focus({ preventScroll: true });
      measure();
    } else {
      window.removeEventListener('keydown', handleKeydown, true);
    }
  },
  { immediate: true }
);

// Re-measure when the right column's length changes the panel's height.
watch(activeCategory, async () => {
  await nextTick();
  measure();
});

watch(
  () => [props.x, props.y],
  () => {
    if (props.open) activeCategory.value = null;
  }
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true);
});
</script>

<template>
  <div
    v-if="open && categories.length > 0"
    class="fixed inset-0 z-50"
    @click="emit('close')"
    @contextmenu.prevent="emit('close')"
  >
    <div
      ref="panelRef"
      tabindex="-1"
      class="absolute overflow-hidden rounded-2xl border border-white/10 bg-[#0e1013]/98 shadow-2xl outline-none backdrop-blur-sm"
      :style="{ ...position, width: `${PANEL_W}px` }"
      @click.stop
      @keydown="handleKeydown"
    >
      <header
        class="flex items-center justify-between border-b border-white/[0.07] px-5 py-2.5"
      >
        <div class="flex items-center gap-2.5">
          <span class="h-2 w-2 rounded-full bg-orange-500" />
          <span
            class="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-300"
          >
            Annotate
          </span>
        </div>
        <span class="font-mono text-[10px] tracking-wider text-zinc-500">
          {{ frameLabel }} &middot; {{ timecode }}
        </span>
      </header>

      <div class="flex min-h-[220px]">
        <!-- Categories -->
        <ul class="w-[46%] shrink-0 border-r border-white/[0.07] py-2">
          <li
            v-for="group in categories"
            :key="group.key"
            class="relative flex cursor-pointer items-center gap-2.5 px-4 py-1.5 transition-colors"
            :class="
              activeCategory?.key === group.key
                ? 'bg-white/[0.06]'
                : 'hover:bg-white/[0.03]'
            "
            @mouseenter="selectCategory(group)"
            @click="selectCategory(group)"
          >
            <span
              v-if="activeCategory?.key === group.key"
              class="absolute inset-y-0 left-0 w-[3px]"
              :style="{ backgroundColor: group.labels[0]?.color ?? '#f97316' }"
            />
            <span
              class="grid h-7 w-7 shrink-0 place-items-center rounded-md border font-mono text-[11px] font-semibold"
              :class="
                activeCategory?.key === group.key
                  ? 'border-transparent text-white'
                  : 'border-white/10 bg-white/[0.04] text-zinc-300'
              "
              :style="
                activeCategory?.key === group.key
                  ? { backgroundColor: group.labels[0]?.color ?? '#f97316' }
                  : undefined
              "
            >
              {{ group.letter }}
            </span>
            <span
              class="flex-1 font-mono text-[11px] tracking-[0.12em]"
              :class="activeCategory?.key === group.key ? 'text-white' : 'text-zinc-400'"
            >
              {{ group.key }}
            </span>
            <span class="font-mono text-[10px] text-zinc-600">
              {{ group.labels.length }}
            </span>
          </li>
        </ul>

        <!-- Labels of the active category -->
        <ul v-if="labelRows.length" class="flex-1 py-2">
          <li
            v-for="row in labelRows"
            :key="row.label.id"
            class="flex cursor-pointer items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-white/[0.04]"
            :title="row.label.description || row.label.name"
            @click="commit(row.label)"
          >
            <span
              class="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] font-mono text-[11px] font-semibold text-zinc-300"
            >
              {{ row.letter }}
            </span>
            <span class="font-mono text-[11px] tracking-[0.1em] text-zinc-200">
              {{ row.text }}
            </span>
          </li>
        </ul>
        <div
          v-else
          class="flex flex-1 items-center justify-center px-6 text-center font-mono text-[10px] tracking-[0.14em] text-zinc-600"
        >
          Pick a category
        </div>
      </div>

      <footer
        class="border-t border-white/[0.07] px-5 py-2 font-mono text-[9px] tracking-[0.16em] text-zinc-600"
      >
        <span v-if="activeCategory">Letter to label &middot; Esc to go back</span>
        <span v-else>Letter to pick a category &middot; Esc to close</span>
      </footer>
    </div>
  </div>
</template>
