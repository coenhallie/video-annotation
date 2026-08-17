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
  (e: 'comment', text: string): void;
  (e: 'comment-mode', active: boolean): void;
  (e: 'close'): void;
}>();

const PANEL_W = 460;
const EDGE_MARGIN = 12;

const activeCategory = ref<LabelCategoryGroup | null>(null);

/** Letter that opens the comment field. Free because no category claims it. */
const COMMENT_LETTER = 'C';

type QuickPickMode = 'pick' | 'comment';

const mode = ref<QuickPickMode>('pick');
const commentText = ref('');
const commentInputRef = ref<HTMLInputElement | null>(null);

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

/**
 * True while a key that was already down when the comment field opened may
 * still be auto-repeating. The C that opens the field is preventDefault()ed,
 * but its repeats arrive after the switch to comment mode and would otherwise
 * land "ccc" in the input. Cleared by the first keydown that is not a repeat,
 * which is the earliest moment any key held across the switch must have been
 * released, so holding Backspace to erase still behaves normally.
 */
const swallowHeldRepeats = ref(false);

const enterCommentMode = () => {
  if (mode.value === 'comment') return;
  mode.value = 'comment';
  commentText.value = '';
  swallowHeldRepeats.value = true;
  emit('comment-mode', true);
};

/**
 * Every exit from comment mode goes through here, so a listener that paused
 * playback on the way in is always told on the way out.
 */
const leaveCommentMode = () => {
  if (mode.value !== 'comment') return;
  mode.value = 'pick';
  commentText.value = '';
  swallowHeldRepeats.value = false;
  emit('comment-mode', false);
};

const resetToRoot = () => {
  activeCategory.value = null;
  leaveCommentMode();
};

/**
 * Whitespace-only text is not a comment, so it never leaves the panel.
 *
 * The text deliberately survives the emit, and this is not an exit from comment
 * mode. Storing the annotation is asynchronous and can fail, so the listener
 * owns closing the panel and does it only once the annotation is actually
 * saved. Clearing here would mean a failed save took the prose with it, with
 * nothing left to retry from. Closing the panel resets it, which reports
 * leaving comment mode on the way out.
 */
const commitComment = () => {
  const text = commentText.value.trim();
  if (!text) return;
  emit('comment', text);
};

const back = () => {
  if (mode.value === 'comment') {
    leaveCommentMode();
    return;
  }
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

  // This listener is on window in capture phase and preventDefault()s every
  // letter, so in comment mode it has to get out of the way or the input
  // receives no characters at all. Escape is the only key it still owns; Enter
  // is handled by the input's own binding.
  if (mode.value === 'comment') {
    if (!event.repeat) {
      swallowHeldRepeats.value = false;
    } else if (swallowHeldRepeats.value) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      back();
    }
    return;
  }

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

  // Root screen only. Inside a category assignLabelShortcuts may well have
  // handed C to a label, and the label has to win there.
  if (key === COMMENT_LETTER) {
    event.preventDefault();
    event.stopPropagation();
    enterCommentMode();
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
      resetToRoot();
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
      // Closing while typing still has to report the mode change, or a paused
      // video would never be resumed.
      resetToRoot();
    }
  },
  { immediate: true }
);

// Re-measure when the right column's length changes the panel's height.
watch(activeCategory, async () => {
  await nextTick();
  measure();
});

// The comment screen is much shorter than the two columns, and the panel is
// anchored upward from props.y, so it has to be re-measured.
watch(mode, async () => {
  await nextTick();
  if (mode.value === 'comment') {
    commentInputRef.value?.focus({ preventScroll: true });
  }
  measure();
});

watch(
  () => [props.x, props.y],
  () => {
    if (props.open) resetToRoot();
  }
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true);
});
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50"
    @click="emit('close')"
    @contextmenu.prevent="emit('close')"
  >
    <!--
      Surface, border, text and hover tones are the app's own: white/gray-800
      panels, gray-200/gray-700 dividers, gray-900/gray-100 primary text, as
      used by the modals and the annotation sidebar. Only the per-label colours
      are the labels' own, because those carry meaning.
    -->
    <div
      ref="panelRef"
      tabindex="-1"
      class="absolute overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl outline-none dark:border-gray-700 dark:bg-gray-800"
      :style="{ ...position, width: `${PANEL_W}px` }"
      @click.stop
      @keydown="handleKeydown"
    >
      <header
        class="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 dark:border-gray-700"
      >
        <div class="flex items-center gap-2.5">
          <span class="h-1.5 w-1.5 rounded-full bg-orange-500" />
          <span
            class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-700 dark:text-gray-200"
          >
            Annotate
          </span>
        </div>
        <span class="font-mono text-[10px] tracking-wider text-gray-400 dark:text-gray-500">
          {{ frameLabel }} &middot; {{ timecode }}
        </span>
      </header>

      <!-- Comment screen -->
      <div v-if="mode === 'comment'" class="px-4 py-4">
        <label
          for="quick-pick-comment"
          class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400"
        >
          Comment
        </label>
        <input
          id="quick-pick-comment"
          ref="commentInputRef"
          v-model="commentText"
          data-testid="quick-pick-comment"
          type="text"
          autocomplete="off"
          placeholder="What happened on this frame?"
          class="w-full rounded border border-gray-300 bg-white px-3 py-2 text-[12px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-orange-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
          @keydown.enter.prevent="commitComment"
        />
      </div>

      <!-- Pick screen -->
      <div v-else class="flex min-h-[220px]">
        <div
          class="flex w-[46%] shrink-0 flex-col border-r border-gray-200 dark:border-gray-700"
        >
          <!-- Categories -->
          <ul v-if="categories.length" class="flex-1 py-1.5">
            <li
              v-for="group in categories"
              :key="group.key"
              class="relative flex cursor-pointer items-center gap-2.5 px-4 py-1.5 transition-colors"
              :class="
                activeCategory?.key === group.key
                  ? 'bg-gray-100 dark:bg-gray-700'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              "
              @mouseenter="selectCategory(group)"
              @click="selectCategory(group)"
            >
              <span
                v-if="activeCategory?.key === group.key"
                class="absolute inset-y-0 left-0 w-[3px]"
                :style="{ backgroundColor: group.labels[0]?.color ?? '#6b7280' }"
              />
              <span
                class="grid h-6 w-6 shrink-0 place-items-center rounded border font-mono text-[11px] font-semibold"
                :class="
                  activeCategory?.key === group.key
                    ? 'border-transparent text-white'
                    : 'border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300'
                "
                :style="
                  activeCategory?.key === group.key
                    ? { backgroundColor: group.labels[0]?.color ?? '#6b7280' }
                    : undefined
                "
              >
                {{ group.letter }}
              </span>
              <span
                class="flex-1 text-[11px] font-medium tracking-[0.1em]"
                :class="
                  activeCategory?.key === group.key
                    ? 'text-gray-900 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-400'
                "
              >
                {{ group.key }}
              </span>
              <span class="font-mono text-[10px] text-gray-400 dark:text-gray-500">
                {{ group.labels.length }}
              </span>
            </li>
          </ul>
          <div
            v-else
            class="flex flex-1 items-center justify-center px-4 text-center text-[10px] tracking-[0.12em] text-gray-400 dark:text-gray-500"
          >
            No categories
          </div>

          <!-- Comment, always available: it needs no labels at all -->
          <button
            type="button"
            class="flex w-full items-center gap-2.5 border-t border-gray-200 px-4 py-2 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
            @click="enterCommentMode"
          >
            <span
              class="grid h-6 w-6 shrink-0 place-items-center rounded border border-gray-300 bg-gray-50 font-mono text-[11px] font-semibold text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
            >
              C
            </span>
            <span
              class="flex-1 text-[11px] font-medium tracking-[0.1em] text-gray-600 dark:text-gray-400"
            >
              COMMENT
            </span>
          </button>
        </div>

        <!-- Labels of the active category -->
        <ul v-if="labelRows.length" class="flex-1 py-1.5">
          <li
            v-for="row in labelRows"
            :key="row.label.id"
            class="flex cursor-pointer items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
            :title="row.label.description || row.label.name"
            @click="commit(row.label)"
          >
            <span
              class="grid h-6 w-6 shrink-0 place-items-center rounded border border-gray-300 bg-gray-50 font-mono text-[11px] font-semibold text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
            >
              {{ row.letter }}
            </span>
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :style="{ backgroundColor: row.label.color }"
            />
            <span
              class="text-[11px] font-medium tracking-[0.08em] text-gray-800 dark:text-gray-200"
            >
              {{ row.text }}
            </span>
          </li>
        </ul>
        <div
          v-else
          class="flex flex-1 items-center justify-center px-6 text-center text-[10px] tracking-[0.12em] text-gray-400 dark:text-gray-500"
        >
          Pick a category
        </div>
      </div>

      <footer
        class="border-t border-gray-200 px-4 py-2 text-[9px] tracking-[0.14em] text-gray-400 dark:border-gray-700 dark:text-gray-500"
      >
        <span v-if="mode === 'comment'">Enter to save &middot; Esc to go back</span>
        <span v-else-if="activeCategory">Letter to label &middot; Esc to go back</span>
        <span v-else>Letter to pick a category &middot; C to comment &middot; Esc to close</span>
      </footer>
    </div>
  </div>
</template>
