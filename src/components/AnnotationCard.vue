<script setup lang="ts">
import { type PropType } from 'vue';
import { formatFrame } from '@/utils/formatters';
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
  isAuthenticated: {
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

// Get labels for the annotation
const getAnnotationLabels = (): Label[] => {
  if (!props.annotation.labels || props.annotation.labels.length === 0) return [];
  return props.annotation.labels
    .map((labelId: string) => props.labelColors[labelId])
    .filter((l): l is Label => l != null);
};

// Default color for annotations without specific labels
const defaultAnnotationColor = '#6b7280'; // gray-500

// Get primary label color for annotation display
const getPrimaryLabelColor = (): string => {
  const labels = getAnnotationLabels();
  const first = labels[0] as Label | undefined;
  return first ? first.color : defaultAnnotationColor;
};

// Helper to compute frame from timestamp
const timeToFrame = (timeInSeconds: number): number => {
  const validFps = props.fps > 0 ? props.fps : 30;
  return Math.max(0, Math.round(timeInSeconds * validFps));
};
</script>

<template>
  <div
    class="card mb-2 p-2 transition-all duration-200 relative group"
    :class="{
      'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-md ring-2 ring-blue-200 dark:ring-blue-800 cursor-default':
        isSelected,
      'bg-white dark:bg-gray-800 cursor-pointer card-hover':
        !isSelected,
    }"
    :style="{
      borderLeft: `4px solid ${getPrimaryLabelColor()}`,
    }"
    @click="emit('select')"
  >
    <div class="flex justify-between items-center mb-1">
      <div class="flex items-center space-x-1.5 text-xs text-gray-600 dark:text-gray-300">
        <!-- Show primary label or annotation type -->
        <div class="flex items-center space-x-1">
          <div
            class="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600"
            :style="{ backgroundColor: getPrimaryLabelColor() }"
          />
          <span
            :class="{
              'text-blue-700 dark:text-blue-300 font-medium':
                isSelected,
            }"
          >
            {{
              getAnnotationLabels().length > 0
                ? (getAnnotationLabels()[0] as Label).name
                : 'Annotation'
            }}
          </span>
        </div>

        <!-- Comment count indicator -->
        <div class="flex items-center space-x-1 ml-2 relative">
          <span
            class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            :title="`${commentCount} comment${
              commentCount !== 1 ? 's' : ''
            }`"
          >
            <svg
              class="w-3 h-3 mr-1"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fill-rule="evenodd"
                d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                clip-rule="evenodd"
              />
            </svg>
            {{ commentCount || 0 }}
          </span>

          <!-- New comments indicator (always visible when there are new comments) -->
          <div
            v-if="hasNewComments"
            class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"
            :title="`${newCommentCount} new comment${
              newCommentCount > 1 ? 's' : ''
            }`"
          />

          <!-- Real-time activity indicator (when comments are expanded and no new comments) -->
          <div
            v-if="
              !hasNewComments &&
                isCommentsExpanded
            "
            class="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse"
            title="Real-time comments active"
          />
        </div>
      </div>
      <div
        class="font-mono text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded flex flex-col items-center"
      >
        <!-- Dual video mode: Show both video frame numbers if available -->
        <div
          v-if="
            isDualMode &&
              (annotation.videoAFrame !== undefined ||
                annotation.videoBFrame !== undefined)
          "
          class="text-xs opacity-75 space-y-0.5"
        >
          <div
            v-if="annotation.videoAFrame !== undefined"
            class="text-blue-600"
          >
            A: {{ formatFrame(annotation.videoAFrame) }}
          </div>
          <div
            v-if="annotation.videoBFrame !== undefined"
            class="text-green-600"
          >
            B: {{ formatFrame(annotation.videoBFrame) }}
          </div>
        </div>

        <!-- Single video mode or fallback: Show single frame -->
        <span
          v-else
          class="text-xs opacity-75"
        >{{
          annotation.frame !== undefined
            ? formatFrame(annotation.frame)
            : formatFrame(timeToFrame(annotation.timestamp))
        }}</span>
      </div>
    </div>

    <div
      v-if="
        annotation.annotationType === 'drawing' ||
          annotation.drawingData ||
          (annotation.content && annotation.content.length)
      "
    >
      <div class="flex items-center space-x-1 mb-0.5">
        <!-- Drawing indicator -->
        <div
          v-if="
            annotation.annotationType === 'drawing' ||
              annotation.drawingData
          "
          class="flex items-center space-x-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-xs"
        >
          <svg
            class="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
          <span>Drawing</span>
        </div>
      </div>
      <p
        v-if="annotation.content && annotation.content.length"
        class="text-sm text-gray-600 dark:text-gray-300 mb-1 leading-snug"
      >
        {{ annotation.content }}
      </p>
    </div>

    <!-- Action buttons and comment toggle -->
    <div class="flex justify-between items-center mt-1">
      <!-- Comment toggle button (always visible) -->
      <button
        class="btn btn-ghost p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
        :title="
          isCommentsExpanded
            ? 'Hide comments'
            : 'Show comments'
        "
        @click.stop="emit('toggle-comments')"
      >
        <svg
          class="icon icon-sm"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          />
        </svg>
        <span class="text-xs ml-1">
          {{ isCommentsExpanded ? 'Hide' : 'Comments' }}
        </span>
      </button>

      <!-- Edit/Delete buttons (only visible on hover and when not read-only) -->
      <div
        v-if="!readOnly"
        class="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      >
        <button
          class="btn btn-ghost p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title="Edit annotation"
          @click.stop="emit('edit')"
        >
          <svg
            class="icon icon-sm"
            viewBox="0 0 24 24"
          >
            <path
              d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
            />
            <path
              d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
            />
          </svg>
        </button>
        <button
          class="btn btn-ghost p-1 text-red-600 hover:text-red-700"
          title="Delete annotation"
          @click.stop="emit('delete')"
        >
          <svg
            class="icon icon-sm"
            viewBox="0 0 24 24"
          >
            <polyline points="3 6 5 6 21 6" />
            <path
              d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Expandable Comment Section -->
    <div
      v-show="isCommentsExpanded"
      class="mt-2 border-t border-gray-200 pt-2"
    >
      <div @click.stop>
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
  </div>
</template>
