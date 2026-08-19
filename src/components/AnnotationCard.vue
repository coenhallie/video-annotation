<script setup lang="ts">
import { computed, type PropType } from 'vue';
import { formatFrameCompact, formatTime } from '@/utils/formatters';
import CommentSection from './CommentSection.vue';
import type { Comment } from '../types/database';
import type { Label } from '../types/labels';
import type { PanelAnnotation, LabelColorMap } from '../types/component-interfaces';

const props = defineProps({
  annotation: {
    type: Object as PropType<PanelAnnotation>,
    required: true,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
  readOnly: {
    type: Boolean,
    default: false,
  },
  labelColors: {
    type: Object as PropType<LabelColorMap>,
    default: () => ({}),
  },
  commentCount: {
    type: Number,
    default: 0,
  },
  hasNewComments: {
    type: Boolean,
    default: false,
  },
  newCommentCount: {
    type: Number,
    default: 0,
  },
  isCommentsExpanded: {
    type: Boolean,
    default: false,
  },
  isDualMode: {
    type: Boolean,
    default: false,
  },
  fps: {
    type: Number,
    default: 30,
  },
  videoId: {
    type: String,
    default: null,
  },
  currentUser: {
    type: Object as PropType<{ id: string; email?: string } | null>,
    default: null,
  },
});

const emit = defineEmits<{
  (e: 'select'): void;
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'toggle-comments'): void;
  (e: 'comment-added', comment: Comment): void;
  (e: 'comment-updated', comment: Comment): void;
  (e: 'comment-deleted', comment: Comment): void;
}>();

/** Labels the viewer can resolve. Unreadable ids are dropped, not guessed at. */
const labels = computed((): Label[] =>
  (props.annotation.labels ?? [])
    .map((labelId) => props.labelColors[labelId])
    .filter((label): label is Label => label != null)
);

/** The dot is the only colour in the row, so it carries the label identity. */
const dotColor = computed(() => labels.value[0]?.color ?? '#6b7280');

/**
 * The row's identity line. A label name when there is one; otherwise the note
 * itself, because for an unlabelled annotation that text is the only thing
 * identifying it - and many older annotations are exactly that. `note` stands
 * down in that case so the row never prints the same sentence twice.
 */
const title = computed(() => {
  const labelName = labels.value[0]?.name?.trim();
  if (labelName) return labelName;
  return props.annotation.content?.trim() || 'Annotation';
});

const frame = computed(() => {
  if (typeof props.annotation.frame === 'number') return props.annotation.frame;
  const validFps = props.fps > 0 ? props.fps : 30;
  return Math.max(0, Math.round(props.annotation.timestamp * validFps));
});

/**
 * Dual mode annotates two videos at once, so one frame token cannot stand for
 * both. Fall back to A's frame and let the timecode carry the position.
 */
const frameLabel = computed(() => {
  if (props.isDualMode && typeof props.annotation.videoAFrame === 'number') {
    return formatFrameCompact(props.annotation.videoAFrame);
  }
  return formatFrameCompact(frame.value);
});

const timecode = computed(() => formatTime(props.annotation.timestamp));

const hasDrawing = computed(
  () => props.annotation.annotationType === 'drawing' || Boolean(props.annotation.drawingData)
);

/** The label already names the annotation, so only add a note that says more. */
const note = computed(() => {
  const content = props.annotation.content?.trim() ?? '';
  return content && content !== title.value ? content : '';
});

const select = () => emit('select');
</script>

<template>
  <div class="group">
    <div
      class="relative flex w-full cursor-pointer items-start gap-3 rounded px-3 py-2.5 transition-colors"
      :class="
        isSelected
          ? 'bg-gray-100 dark:bg-white/[0.06]'
          : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
      "
      role="button"
      tabindex="0"
      @click="select"
      @keydown.enter.prevent="select"
      @keydown.space.prevent="select"
    >
      <span
        class="mt-[7px] h-2 w-2 shrink-0 rounded-full"
        :style="{ backgroundColor: dotColor }"
      />

      <div class="min-w-0 flex-1">
        <p
          class="truncate text-[13px] font-medium uppercase tracking-[0.06em]"
          :class="
            isSelected
              ? 'text-gray-900 dark:text-white'
              : 'text-gray-700 dark:text-gray-200'
          "
        >
          {{ title }}
        </p>

        <div
          class="mt-1 flex items-center gap-2 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
        >
          <span>{{ frameLabel }}</span>

          <span
            v-if="hasDrawing"
            title="Has a drawing"
          >DRAW</span>

          <!-- Comments open from the count itself: an always-present toggle on
               every row is the clutter this panel is shedding. -->
          <button
            v-if="commentCount > 0"
            type="button"
            class="relative -my-0.5 rounded px-1 py-0.5 transition-colors hover:text-gray-900 dark:hover:text-gray-300"
            :class="{ 'text-gray-900 dark:text-gray-300': isCommentsExpanded }"
            :title="`${commentCount} comment${commentCount !== 1 ? 's' : ''}`"
            @click.stop="emit('toggle-comments')"
          >
            {{ commentCount }}C
            <span
              v-if="hasNewComments"
              class="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500"
              :title="`${newCommentCount} new comment${newCommentCount !== 1 ? 's' : ''}`"
            />
          </button>
        </div>

        <p
          v-if="note"
          class="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400"
        >
          {{ note }}
        </p>
      </div>

      <!-- Fixed-width slot so the actions can take the timecode's place on
           hover without shifting the row or covering a long label. The swap is
           keyed to this slot, not to the row: the row itself is focusable, and
           selecting one must not strip its timecode for as long as it holds
           focus. Keyboard users still reach the buttons, which reveal
           themselves once one of them takes focus. -->
      <div class="group/actions relative mt-0.5 h-5 w-20 shrink-0">
        <span
          class="absolute inset-0 flex items-center justify-end font-mono text-[11px] tracking-wider text-gray-500 transition-opacity dark:text-gray-500"
          :class="{
            'group-hover:opacity-0 group-has-[:focus-visible]/actions:opacity-0': !readOnly,
          }"
        >
          {{ timecode }}
        </span>

        <div
          v-if="!readOnly"
          class="absolute inset-0 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]/actions:opacity-100"
        >
          <!-- Only where the meta row has no count to click: a row with
               comments already carries its own way in. -->
          <button
            v-if="commentCount === 0"
            type="button"
            class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            title="Add a comment"
            @click.stop="emit('toggle-comments')"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            type="button"
            class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            title="Edit annotation"
            @click.stop="emit('edit')"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            class="rounded p-1 text-gray-500 transition-colors hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
            title="Delete annotation"
            @click.stop="emit('delete')"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="3 6 5 6 21 6" />
              <path
                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- v-if, not v-show: CommentSection fetches on mount, so keeping every
         row's section alive would query comments for the whole video at once.
         The rule sits at 16px, under the centre of the row's dot, and the inner
         padding puts the thread text on the same line as the row's title. -->
    <div
      v-if="isCommentsExpanded"
      class="ml-4 border-l border-gray-200 pb-3 pl-4 pr-3 dark:border-white/10"
      @click.stop
    >
      <CommentSection
        :annotation-id="annotation.id"
        :current-user="currentUser"
        :video-id="videoId"
        :read-only="readOnly"
        @comment-added="(c: Comment) => emit('comment-added', c)"
        @comment-updated="(c: Comment) => emit('comment-updated', c)"
        @comment-deleted="(c: Comment) => emit('comment-deleted', c)"
      />
    </div>
  </div>
</template>
