<script lang="ts">
// Re-export types so existing consumers keep working without needing to change
// their imports immediately.
export type { PanelAnnotation, NewAnnotationDraft } from '../types/component-interfaces';
</script>

<script setup lang="ts">
import { logger } from '../utils/logger';
import {
  ref,
  computed,
  onMounted,
  watch,
  onUnmounted,
  nextTick,
  type PropType,
} from 'vue';
import AnnotationForm from './AnnotationForm.vue';
import AnnotationCard from './AnnotationCard.vue';
import AnnotationSkeleton from './AnnotationSkeleton.vue';
import LabelManagement from './LabelManagement.vue';
import { useAuth } from '../composables/useAuth';
import { useGlobalComments } from '../composables/useGlobalComments';
import { useAnnotationFiltering } from '../composables/useAnnotationFiltering';
import { useLabelCatalog } from '../composables/useLabelCatalog';
import { useEscapeToClose } from '../composables/useEscapeToClose';
import type { Comment } from '../types/database';
import type { UseDrawingCanvas } from '../composables/useDrawingCanvas';
import type { UseDrawingCoordinator } from '../composables/useDrawingCoordinator';
import type { DualVideoPlayer } from '../composables/useDualVideoPlayer';
import type { DrawingCanvasExpose, PanelAnnotation } from '../types/component-interfaces';

const props = defineProps({
  annotations: {
    type: Array as PropType<PanelAnnotation[]>,
    default: () => [],
  },
  selectedAnnotation: {
    type: Object as PropType<PanelAnnotation | null>,
    default: null,
  },
  currentTime: {
    type: Number,
    default: 0,
  },
  currentFrame: {
    type: Number,
    default: 0,
  },
  fps: {
    type: Number,
    default: 30,
  },
  drawingCanvas: {
    type: Object as PropType<UseDrawingCanvas | null>,
    required: false,
    default: () => null,
  },
  readOnly: {
    type: Boolean,
    default: false,
  },
  /**
   * Whether the viewer may create annotations, which is narrower than
   * `readOnly`: a view-only share still permits commenting, so the two cannot
   * share a flag. Mirrors the `annotations` INSERT row-level security policies
   * (see utils/annotationPermissions).
   */
  canAnnotate: {
    type: Boolean,
    default: true,
  },
  videoId: {
    type: String,
    default: null,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  projectId: {
    type: String,
    default: null,
  },
  // Dual video mode props
  isDualMode: {
    type: Boolean,
    default: false,
  },
  drawingCanvasA: {
    type: Object as PropType<UseDrawingCanvas | null>,
    default: null,
  },
  drawingCanvasB: {
    type: Object as PropType<UseDrawingCanvas | null>,
    default: null,
  },
  dualVideoPlayer: {
    type: Object as PropType<DualVideoPlayer | null>,
    default: null,
  },
  // Component refs for accessing drawing data
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
  drawingCoordinator: {
    type: Object as PropType<UseDrawingCoordinator | null>,
    default: null,
  },
  // Dual video frame tracking props
  videoACurrentFrame: {
    type: Number,
    default: 0,
  },
  videoBCurrentFrame: {
    type: Number,
    default: 0,
  },
  videoAFps: {
    type: Number,
    default: 30,
  },
  videoBFps: {
    type: Number,
    default: 30,
  },
});

const emit = defineEmits([
  'update-annotation',
  'delete-annotation',
  'select-annotation',
  'form-show',
  'form-hide',
  'pause',
  'comment-added',
  'comment-updated',
  'comment-deleted',
  // The ids the group/label filter shows, or null when nothing is filtered.
  // EditorView hands these to the timeline so its markers follow the list.
  'filter-change',
]);

// Authentication
const { user, isAuthenticated } = useAuth();

// Global comment tracking
const {
  setupGlobalCommentSubscription,
  markCommentsAsViewed,
  hasNewComments,
  getNewCommentCount,
  getTotalCommentCount,
  initializeCommentCounts,
  cleanup: cleanupGlobalComments,
  onNewComment,
} = useGlobalComments();

// Label state. Loaded before filtering, which reads label names to work out
// which category each annotation belongs to.
const {
  labels: availableLabels,
  labelsById: labelColors,
  load: loadLabels,
  reload: reloadLabels,
} = useLabelCatalog(
  () => user.value?.id,
  () => props.projectId ?? undefined
);
const showLabelManagement = ref(false);

// Annotation filtering composable
const annotationsRef = computed(() => props.annotations);
const {
  sortedAnnotations,
  availableCategories,
  activeCategory,
  labelOptions,
  activeLabelIds,
  toggleLabel,
  clearLabels,
} = useAnnotationFiltering({
  annotations: annotationsRef,
  labelsById: labelColors,
  isDualMode: () => props.isDualMode,
  fps: () => props.fps,
});

watch(
  [activeCategory, activeLabelIds, sortedAnnotations],
  () => {
    const filtered = activeCategory.value !== null || activeLabelIds.value.length > 0;
    emit('filter-change', filtered ? sortedAnnotations.value.map((a) => String(a.id)) : null);
  },
  { immediate: true }
);

// The label checklist. Closes on Escape and on any click outside it.
const showLabelFilter = ref(false);
useEscapeToClose(
  () => showLabelFilter.value,
  () => {
    showLabelFilter.value = false;
  }
);

/**
 * Shown in place of the label editor when this viewer cannot annotate, so the
 * missing affordances read as a permission rather than as a bug.
 */
const accessLabel = computed(() =>
  !props.readOnly && !isAuthenticated.value ? 'Comments only' : 'View only'
);

// Comment state
const expandedComments = ref(new Set<string>());

// Annotation being edited (passed to the form)
const editAnnotationData = ref<PanelAnnotation | null>(null);

/**
 * Stable loading state to prevent skeleton flickering
 */
const shouldShowSkeleton = computed(() => {
  return props.loading && props.annotations.length === 0;
});

if (import.meta.env.DEV) {
  logger.debug('[AnnotationPanel] setup');
}

onMounted(() => {
  if (import.meta.env.DEV) {
    logger.debug('[AnnotationPanel] mounted');
  }
  loadLabels();
});

// --- Form orchestration ---
// The panel edits but never adds: new annotations are created from the
// timeline's quick pick, which is why the header has no add button.

const startEditAnnotation = (annotation: PanelAnnotation) => {
  emit('pause');
  // Editing an annotation selects it and moves whichever surface is active
  // to it (EditorView routes this through onAnnotationClick), so the frame
  // the form names is the frame on screen on the video tab. On the pipeline
  // tab the video stays put and the replay moves instead - the underlying
  // video element is hidden there, so there is nothing for the drawing
  // canvas to render onto anyway. Selecting is what seeks: `seek-to-frame`
  // had no listener at all.
  emit('select-annotation', annotation);

  editAnnotationData.value = annotation;
  // The form watches editAnnotation prop and will start editing
};

// Always an update: the form only ever edits an annotation that exists.
const handleFormSave = (annotationData: Record<string, unknown>) => {
  emit('update-annotation', annotationData);
};

const handleFormShow = () => {
  emit('form-show');
};

const handleFormHide = () => {
  editAnnotationData.value = null;
  emit('form-hide');
};

// --- Annotation card actions ---

// Selection can come from outside the list - the timeline, the video, or a
// dashboard deep-link - so the highlighted row has to be brought into view.
// `nearest` leaves an already-visible card alone, which keeps clicks in the list
// itself from scrolling.
const listRef = ref<HTMLElement | null>(null);

watch(
  [() => props.selectedAnnotation?.id ?? null, () => sortedAnnotations.value.length],
  async ([id]) => {
    if (!id) return;
    await nextTick();
    const card = listRef.value?.querySelector(`[data-annotation-id="${CSS.escape(id)}"]`);
    card?.scrollIntoView({ block: 'nearest' });
  }
);

const selectAnnotation = (annotation: PanelAnnotation) => {
  if (props.selectedAnnotation?.id === annotation.id) {
    return;
  }
  emit('select-annotation', annotation);
};

const deleteAnnotation = (annotation: PanelAnnotation) => {
  emit('delete-annotation', annotation);
};

// --- Comment management ---

const toggleComments = (annotationId: string) => {
  if (expandedComments.value.has(annotationId)) {
    expandedComments.value.delete(annotationId);
  } else {
    expandedComments.value.add(annotationId);
    markCommentsAsViewed(annotationId);
  }
};

const isCommentsExpanded = (annotationId: string) => {
  return expandedComments.value.has(annotationId);
};

const getCommentCount = (annotation: PanelAnnotation) => {
  return getTotalCommentCount(annotation.id) || annotation.commentCount || 0;
};

const handleCommentAdded = (comment: Comment) => {
  emit('comment-added', comment);
};

const handleCommentUpdated = (comment: Comment) => {
  emit('comment-updated', comment);
};

const handleCommentDeleted = (comment: Comment) => {
  emit('comment-deleted', comment);
};

// --- Label management ---

const openLabelManagement = () => {
  showLabelManagement.value = true;
};

const closeLabelManagement = () => {
  showLabelManagement.value = false;
  reloadLabels();
};

// --- Global comment subscription ---

onMounted(async () => {
  if (props.videoId && isAuthenticated.value) {
    try {
      await setupGlobalCommentSubscription(props.videoId);
      await initializeCommentCounts(props.annotations);

      onNewComment((event) => {
        console.log('New comment received:', event.comment);
      });
    } catch (error) {
      console.error('Failed to setup global comment subscription:', error);
    }
  }
});

onUnmounted(() => {
  cleanupGlobalComments();
});

// Watch for video ID changes
watch(
  () => props.videoId,
  async (newVideoId) => {
    if (newVideoId && isAuthenticated.value) {
      try {
        await setupGlobalCommentSubscription(newVideoId);
        await initializeCommentCounts(props.annotations);
      } catch (error) {
        console.error('Failed to setup global comment subscription:', error);
      }
    }
  }
);

// Watch for annotation changes to update comment counts
watch(
  () => props.annotations,
  async (newAnnotations) => {
    if (newAnnotations && isAuthenticated.value) {
      await initializeCommentCounts(newAnnotations);
    }
  },
  { deep: true }
);

// Nothing to expose: the panel now only edits annotations, and a drawing made
// on the video belongs to whatever created it - the quick pick stores its own.
</script>

<template>
  <div class="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-gray-900">
    <!-- Header -->
    <header class="flex shrink-0 items-baseline gap-2.5 px-4 pb-3 pt-4">
      <h2 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
        Annotations
      </h2>
      <span class="font-mono text-[11px] text-gray-500 dark:text-gray-500">
        {{ sortedAnnotations.length }}
      </span>

      <!-- The only route to the label editor now that the panel has no add
           button, and the quick pick can only offer labels that already exist. -->
      <button
        v-if="canAnnotate"
        type="button"
        class="ml-auto text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
        @click="openLabelManagement"
      >
        Labels
      </button>
      <span
        v-else
        class="ml-auto text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
      >
        {{ accessLabel }}
      </span>
    </header>

    <!-- QA status is deliberately NOT here. It belongs to picking work, not to
         doing it: the dashboard list and the details panel are where a
         reviewer sets a video's state before opening it. Inside the editor the
         rail is for annotating, and a five-value dropdown at the top of it was
         competing with the annotation list for the same attention. See
         VideoDetailsPanel for the control that remains. -->

    <!-- Category filter. Hidden until the video has categorised annotations,
         so a lone "All" pill never sits over an empty list.

         pt-3 rather than sitting flush: the header above ends on a divider,
         and without it the pill row reads as attached to that rule instead of
         as the top of the list it filters. -->
    <div
      v-if="availableCategories.length > 0"
      class="flex shrink-0 flex-wrap items-center gap-1 px-3 pb-3 pt-3"
    >
      <button
        type="button"
        class="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
        :class="
          activeCategory === null
            ? 'bg-gray-900 text-white dark:bg-gray-700 dark:text-white'
            : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
        "
        data-testid="filter-group"
        :aria-pressed="activeCategory === null"
        @click="activeCategory = null"
      >
        All
      </button>
      <button
        v-for="category in availableCategories"
        :key="category"
        type="button"
        data-testid="filter-group"
        :aria-pressed="activeCategory === category"
        class="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
        :class="
          activeCategory === category
            ? 'bg-gray-900 text-white dark:bg-gray-700 dark:text-white'
            : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
        "
        @click="activeCategory = category"
      >
        {{ category }}
      </button>

      <!-- Label checklist: refines the current group (every label, grouped,
           under All) to any mix of labels. Same card and rows as the
           dashboard's filter. The count says the list is filtered even with
           the checklist closed. -->
      <div class="relative ml-auto">
        <button
          type="button"
          data-testid="label-filter-toggle"
          :aria-expanded="showLabelFilter"
          aria-label="Filter by label"
          title="Filter by label"
          class="flex items-center gap-1 rounded px-1.5 py-1 transition-colors"
          :class="
            activeLabelIds.length > 0 || showLabelFilter
              ? 'text-gray-900 dark:text-gray-200'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
          "
          @click="showLabelFilter = !showLabelFilter"
        >
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <span
            v-if="activeLabelIds.length > 0"
            class="font-mono text-[10px] tracking-wider"
          >{{ activeLabelIds.length }}</span>
        </button>
        <div
          v-if="showLabelFilter"
          class="fixed inset-0 z-40"
          @click="showLabelFilter = false"
        />
        <div
          v-if="showLabelFilter"
          data-testid="label-filter-menu"
          class="absolute right-0 z-50 mt-2 max-h-80 w-64 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-gray-900"
        >
          <div
            class="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-white/10"
          >
            <span
              class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
            >
              Labels
            </span>
            <button
              v-if="activeLabelIds.length > 0"
              type="button"
              class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
              @click="clearLabels"
            >
              Clear
            </button>
          </div>
          <div
            v-for="option in labelOptions"
            :key="option.group"
            class="border-b border-gray-200 py-1 last:border-b-0 dark:border-white/10"
          >
            <div
              class="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
            >
              {{ option.group }}
            </div>
            <button
              v-for="label in option.labels"
              :key="label.id"
              type="button"
              role="menuitemcheckbox"
              data-testid="label-filter-option"
              :aria-checked="activeLabelIds.includes(label.id)"
              class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              @click="toggleLabel(label.id)"
            >
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                :style="{ backgroundColor: label.color }"
              />
              <span
                class="flex-1 truncate text-[12px]"
                :class="
                  activeLabelIds.includes(label.id)
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-700 dark:text-gray-200'
                "
              >{{ label.name }}</span>
              <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                <svg
                  v-if="activeLabelIds.includes(label.id)"
                  class="h-3.5 w-3.5 text-gray-900 dark:text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="m5 13 4 4L19 7"
                  />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Form -->
    <AnnotationForm
      v-if="canAnnotate"
      :fps="fps"
      :is-dual-mode="isDualMode"
      :drawing-canvas-ref="drawingCanvasRef"
      :drawing-canvas-a-ref="drawingCanvasARef"
      :drawing-canvas-b-ref="drawingCanvasBRef"
      :drawing-coordinator="drawingCoordinator"
      :available-labels="availableLabels"
      :edit-annotation="editAnnotationData"
      @save="handleFormSave"
      @form-show="handleFormShow"
      @form-hide="handleFormHide"
    />

    <!-- Annotations List -->
    <div
      ref="listRef"
      class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-4"
    >
      <!-- Loading Skeleton -->
      <AnnotationSkeleton
        v-if="shouldShowSkeleton"
        :skeleton-count="3"
      />

      <!-- Empty State -->
      <div
        v-else-if="sortedAnnotations.length === 0"
        class="px-4 py-10 text-center"
      >
        <p class="text-[12px] text-gray-600 dark:text-gray-400">
          {{
            activeLabelIds.length > 0
              ? 'Nothing with these labels'
              : activeCategory
                ? 'Nothing in this category'
                : 'No annotations yet'
          }}
        </p>
        <p
          v-if="canAnnotate && !activeCategory"
          class="mt-1.5 text-[11px] text-gray-500 dark:text-gray-500"
        >
          Click the timeline, or right-click the video, to annotate a frame.
        </p>
        <!-- No third branch: canAnnotate is briefly false while the video
             loads, and a signed-in user should not see a sign-in prompt flash. -->
        <p
          v-else-if="!isAuthenticated"
          class="mt-1.5 text-[11px] text-gray-500 dark:text-gray-500"
        >
          Sign in to add annotations.
        </p>
      </div>

      <!-- Annotations -->
      <AnnotationCard
        v-for="annotation in sortedAnnotations"
        v-else
        :key="annotation.id"
        :annotation="annotation"
        :data-annotation-id="annotation.id"
        :is-selected="selectedAnnotation?.id === annotation.id"
        :read-only="readOnly"
        :label-colors="labelColors"
        :comment-count="getCommentCount(annotation)"
        :has-new-comments="hasNewComments(annotation.id)"
        :new-comment-count="getNewCommentCount(annotation.id)"
        :is-comments-expanded="isCommentsExpanded(annotation.id)"
        :is-dual-mode="isDualMode"
        :fps="fps"
        :video-id="videoId"
        :current-user="user"
        @select="selectAnnotation(annotation)"
        @edit="startEditAnnotation(annotation)"
        @delete="deleteAnnotation(annotation)"
        @toggle-comments="toggleComments(annotation.id)"
        @comment-added="handleCommentAdded"
        @comment-updated="handleCommentUpdated"
        @comment-deleted="handleCommentDeleted"
      />
    </div>

    <!-- Label Management Modal -->
    <div
      v-if="showLabelManagement"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
      @click="closeLabelManagement"
    >
      <!-- Modal panel -->
      <div
        class="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
        @click.stop
      >
        <!-- Close sits inside the panel's own sticky header row, so it never
             covers the "+ New label" action or a scrolled row's actions. -->
        <div class="min-h-0 flex-1 overflow-y-auto">
          <LabelManagement :project-id="projectId">
            <template #header-actions>
              <button
                type="button"
                class="-mr-1 rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                @click="closeLabelManagement"
              >
                <span class="sr-only">Close</span>
                <svg
                  class="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M18 6 6 18M6 6l12 12"
                  />
                </svg>
              </button>
            </template>
          </LabelManagement>
        </div>
      </div>
    </div>
  </div>
</template>
