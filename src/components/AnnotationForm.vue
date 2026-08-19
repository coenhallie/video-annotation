<script setup lang="ts">
import { computed, nextTick, ref, watch, type PropType } from 'vue';
import {
  buildAnnotationPayload,
  DEFAULT_ANNOTATION_COLOR,
  hasDrawingStrokes,
  isSaveableAnnotation,
} from '../utils/annotationPayload';
import {
  categoryKeyForLabel,
  groupLabelsByCategory,
  labelShortName,
} from '../utils/labelCategories';
import { formatFrameCompact, formatTime, frameToTime } from '../utils/formatters';
import type { DrawingData } from '../types/database';
import type { Label } from '../types/labels';
import type { UseDrawingCoordinator } from '../composables/useDrawingCoordinator';
import type { DrawingCanvasExpose, PanelAnnotation } from '../types/component-interfaces';

/**
 * Editing an existing annotation, and only that. New annotations are created
 * from the timeline's quick pick, so everything this form once carried for the
 * add flow - the frame field, the drawing tools, the label search - has moved
 * there or been dropped: the frame is where the annotation already is, and
 * strokes are drawn on the video, not in the sidebar.
 */
const props = defineProps({
  fps: {
    type: Number,
    default: 30,
  },
  isDualMode: {
    type: Boolean,
    default: false,
  },
  drawingCoordinator: {
    type: Object as PropType<UseDrawingCoordinator | null>,
    default: null,
  },
  drawingCanvasRef: {
    type: Object as PropType<DrawingCanvasExpose | null>,
    default: null,
  },
  drawingCanvasARef: {
    type: Object as PropType<DrawingCanvasExpose | null>,
    default: null,
  },
  drawingCanvasBRef: {
    type: Object as PropType<DrawingCanvasExpose | null>,
    default: null,
  },
  availableLabels: {
    type: Array as PropType<Label[]>,
    default: () => [],
  },
  editAnnotation: {
    type: Object as PropType<PanelAnnotation | null>,
    default: null,
  },
});

const emit = defineEmits<{
  (e: 'save', data: Record<string, unknown>): void;
  (e: 'form-show'): void;
  (e: 'form-hide'): void;
}>();

const coord = computed(() => props.drawingCoordinator);

const canvasRefs = () => ({
  single: props.drawingCanvasRef,
  a: props.drawingCanvasARef,
  b: props.drawingCanvasBRef,
});

// --- Form state ---

const isOpen = ref(false);
const annotation = ref<PanelAnnotation | null>(null);
const labelId = ref<string | null>(null);
const content = ref('');
const drawingData = ref<DrawingData | null>(null);
const pickerOpen = ref(false);
const noteRef = ref<HTMLTextAreaElement | null>(null);

const frame = computed(() => {
  const current = annotation.value;
  if (!current) return 0;
  if (typeof current.frame === 'number') return current.frame;
  const fps = props.fps > 0 ? props.fps : 30;
  return Math.max(0, Math.round(current.timestamp * fps));
});

/**
 * Dual mode annotates two videos at once, so one frame token cannot stand for
 * both. Fall back to A's frame, the way the annotation rows already do, and let
 * the timecode carry the position.
 */
const frameLabel = computed(() => {
  if (props.isDualMode && typeof annotation.value?.videoAFrame === 'number') {
    return formatFrameCompact(annotation.value.videoAFrame);
  }
  return formatFrameCompact(frame.value);
});

const timecode = computed(() =>
  formatTime(annotation.value?.timestamp ?? frameToTime(frame.value, props.fps))
);

// --- Labels ---

const selectedLabel = computed(
  () => props.availableLabels.find((label) => label.id === labelId.value) ?? null
);

/**
 * The dot carries the label's identity, exactly as it does in the list. When
 * the label itself is not readable - other people's custom labels are still
 * owner-gated - the annotation's own stored colour keeps the row honest rather
 * than repainting it gray.
 */
const dotColor = computed(
  () =>
    selectedLabel.value?.color ??
    (labelId.value ? annotation.value?.color : null) ??
    DEFAULT_ANNOTATION_COLOR
);

/**
 * The full name here, category prefix and all, because this chip stands on its
 * own: the list below it can shorten a name to `MISSED` only because it sits
 * under a `BALL` heading.
 */
const labelText = computed(() => {
  if (selectedLabel.value) return selectedLabel.value.name;
  return labelId.value ? 'Label' : '';
});

interface LabelGroup {
  key: string;
  labels: Label[];
}

/**
 * Categorised labels first, in the quick pick's order, then anything whose name
 * carries no known category prefix. The quick pick drops those; this form
 * cannot, or a label it can't show would be one the annotation can never be
 * moved to - or off.
 */
const labelGroups = computed<LabelGroup[]>(() => {
  const groups: LabelGroup[] = groupLabelsByCategory(props.availableLabels).map(
    (group) => ({ key: group.key, labels: group.labels })
  );
  const uncategorised = props.availableLabels.filter((label) => !categoryKeyForLabel(label));
  if (uncategorised.length) groups.push({ key: 'OTHER', labels: uncategorised });
  return groups;
});

const chooseLabel = (id: string | null) => {
  labelId.value = id;
  pickerOpen.value = false;
};

const listRef = ref<HTMLElement | null>(null);

/**
 * Open the list on the label the annotation already carries. Scrolled by hand
 * rather than with scrollIntoView, which would also scroll every ancestor and
 * so could shift the sidebar out from under the form.
 */
watch(pickerOpen, async (open) => {
  if (!open) return;
  await nextTick();
  const list = listRef.value;
  const selected = list?.querySelector<HTMLElement>('[data-selected="true"]');
  if (!list || !selected) return;
  list.scrollTop = selected.offsetTop - list.clientHeight / 2 + selected.clientHeight / 2;
});

// --- Drawing ---

const hasDrawing = computed(() => hasDrawingStrokes(drawingData.value));

/**
 * Drawings are authored on the video, from the quick pick's draw toolbar, so
 * the only thing to do with one here is take it off.
 */
const removeDrawing = () => {
  drawingData.value = null;
  coord.value?.clearDrawingsWithRefs(canvasRefs());
};

// --- Open / close ---

const open = (source: PanelAnnotation) => {
  annotation.value = source;
  labelId.value = source.labels?.[0] ?? null;
  content.value = source.content ?? '';
  drawingData.value = source.drawingData ?? null;
  pickerOpen.value = false;
  isOpen.value = true;

  // Put the annotation's own strokes back on the canvas, so what is being
  // edited is what is on screen.
  if (source.drawingData) coord.value?.loadDrawingsForAnnotation(source);

  emit('form-show');
  nextTick(() => noteRef.value?.focus({ preventScroll: true }));
};

const cancelForm = () => {
  isOpen.value = false;
  annotation.value = null;
  labelId.value = null;
  content.value = '';
  drawingData.value = null;
  pickerOpen.value = false;
  emit('form-hide');
};

watch(
  () => props.editAnnotation,
  (source) => {
    if (source) open(source);
  }
);

// --- Save ---

/**
 * Exactly one label, or no label and content of its own: text, which is a
 * comment, or strokes, which is a drawing. The rule lives in annotationPayload
 * so this form and the quick pick cannot drift apart on what a valid annotation
 * is - and so an annotation the quick pick created can always be re-saved here.
 */
const isSaveDisabled = computed(
  () =>
    !annotation.value ||
    !isSaveableAnnotation({
      labels: labelId.value ? [labelId.value] : [],
      content: content.value,
      drawingData: drawingData.value,
    })
);

const save = () => {
  const source = annotation.value;
  if (!source || isSaveDisabled.value) return;

  // The annotation's own per-video frames, never the playhead's: editing a note
  // must not move the annotation to wherever the video happens to be paused.
  const dual =
    props.isDualMode &&
    typeof source.videoAFrame === 'number' &&
    typeof source.videoBFrame === 'number'
      ? { videoAFrame: source.videoAFrame, videoBFrame: source.videoBFrame }
      : null;

  const payload = buildAnnotationPayload({
    labels: props.availableLabels,
    labelIds: labelId.value ? [labelId.value] : [],
    content: content.value,
    frame: frame.value,
    fps: props.fps,
    drawingData: drawingData.value,
    fallbackColor: source.color ?? DEFAULT_ANNOTATION_COLOR,
    dual,
  });
  payload.id = source.id;

  emit('save', payload);
  cancelForm();
};

/** Escape backs out of the label list first, then out of the form. */
const handleEscape = () => {
  if (pickerOpen.value) pickerOpen.value = false;
  else cancelForm();
};
</script>

<template>
  <div
    v-if="isOpen"
    class="shrink-0 border-y border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/[0.03]"
    @keydown.esc.stop.prevent="handleEscape"
  >
    <header class="flex items-center gap-2.5 px-4 pb-2 pt-3">
      <span
        class="h-1.5 w-1.5 shrink-0 rounded-full"
        :style="{ backgroundColor: dotColor }"
      />
      <span
        class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-700 dark:text-gray-200"
      >
        Edit
      </span>
      <span
        class="ml-auto font-mono text-[10px] tracking-wider text-gray-400 dark:text-gray-500"
      >
        {{ frameLabel }} &middot; {{ timecode }}
      </span>
      <button
        type="button"
        class="-mr-1 rounded p-1 text-gray-400 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-200"
        title="Close"
        @click="cancelForm"
      >
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line
            x1="18"
            y1="6"
            x2="6"
            y2="18"
          />
          <line
            x1="6"
            y1="6"
            x2="18"
            y2="18"
          />
        </svg>
      </button>
    </header>

    <div class="space-y-2 px-4 pb-3">
      <!-- Label -->
      <div>
        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded border border-gray-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-gray-300 dark:border-white/10 dark:bg-gray-900 dark:hover:border-white/20"
          @click="pickerOpen = !pickerOpen"
        >
          <span
            v-if="labelId"
            class="h-2 w-2 shrink-0 rounded-full"
            :style="{ backgroundColor: dotColor }"
          />
          <span
            v-if="labelId"
            class="min-w-0 truncate text-[11px] font-medium uppercase tracking-[0.08em] text-gray-800 dark:text-gray-200"
          >
            {{ labelText }}
          </span>
          <span
            v-else
            class="text-[11px] text-gray-400 dark:text-gray-500"
          >
            Add a label
          </span>

          <svg
            class="ml-auto h-3 w-3 shrink-0 text-gray-400 transition-transform dark:text-gray-500"
            :class="{ 'rotate-180': pickerOpen }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <!-- Inline rather than floating: the sidebar clips its own overflow,
             and a list that pushes the buttons down can never be cut off. -->
        <div
          v-if="pickerOpen"
          ref="listRef"
          class="relative mt-1 max-h-52 overflow-y-auto rounded border border-gray-200 bg-white py-1 dark:border-white/10 dark:bg-gray-900"
        >
          <!-- Taking the label off leaves a comment or a drawing, both of which
               are annotations in their own right. -->
          <button
            type="button"
            class="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04]"
            :class="{ 'bg-gray-100 dark:bg-white/[0.06]': !labelId }"
            @click="chooseLabel(null)"
          >
            <span
              class="h-2 w-2 shrink-0 rounded-full border border-gray-300 dark:border-gray-600"
            />
            <span
              class="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400"
            >
              No label
            </span>
          </button>

          <div
            v-for="group in labelGroups"
            :key="group.key"
            class="pb-1"
          >
            <p
              class="px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500"
            >
              {{ group.key }}
            </p>
            <button
              v-for="label in group.labels"
              :key="label.id"
              type="button"
              class="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04]"
              :class="{ 'bg-gray-100 dark:bg-white/[0.06]': label.id === labelId }"
              :data-selected="label.id === labelId || undefined"
              :title="label.description || label.name"
              @click="chooseLabel(label.id)"
            >
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                :style="{ backgroundColor: label.color }"
              />
              <span
                class="truncate text-[11px] font-medium uppercase tracking-[0.08em]"
                :class="
                  label.id === labelId
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-700 dark:text-gray-300'
                "
              >
                {{ labelShortName(label) }}
              </span>
            </button>
          </div>
          <p
            v-if="!labelGroups.length"
            class="px-2.5 py-2 text-[11px] text-gray-400 dark:text-gray-500"
          >
            No labels yet
          </p>
        </div>
      </div>

      <!-- Note -->
      <textarea
        ref="noteRef"
        v-model="content"
        rows="2"
        placeholder="Add a note…"
        class="block w-full resize-y rounded border border-gray-200 bg-white px-2.5 py-2 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-orange-500 dark:border-white/10 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
        @keydown.meta.enter.prevent="save"
        @keydown.ctrl.enter.prevent="save"
      />

      <!-- Drawing: shown, and removable, but drawn on the video itself -->
      <div
        v-if="hasDrawing"
        class="flex items-center gap-2 rounded border border-gray-200 bg-white px-2.5 py-1.5 dark:border-white/10 dark:bg-gray-900"
      >
        <svg
          class="h-3 w-3 shrink-0 text-gray-400 dark:text-gray-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <span
          class="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400"
        >
          Drawing
        </span>
        <button
          type="button"
          class="ml-auto rounded p-0.5 text-gray-400 transition-colors hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
          title="Remove the drawing"
          @click="removeDrawing"
        >
          <svg
            class="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line
              x1="18"
              y1="6"
              x2="6"
              y2="18"
            />
            <line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
            />
          </svg>
        </button>
      </div>
    </div>

    <footer class="flex items-center gap-2 px-4 pb-3">
      <span
        class="hidden text-[9px] tracking-[0.14em] text-gray-400 dark:text-gray-500 sm:inline"
      >
        Esc to cancel
      </span>
      <button
        type="button"
        class="ml-auto rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
        @click="cancelForm"
      >
        Cancel
      </button>
      <button
        type="button"
        class="rounded border border-orange-500 bg-orange-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20"
        :disabled="isSaveDisabled"
        :title="isSaveDisabled ? 'Add a label, a note, or a drawing first' : 'Save'"
        @click="save"
      >
        Save
      </button>
    </footer>
  </div>
</template>
