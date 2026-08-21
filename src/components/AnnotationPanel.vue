<script lang="ts">
// Re-export types so existing consumers keep working without needing to change
// their imports immediately.
export type { PanelAnnotation, NewAnnotationDraft } from '../types/component-interfaces';
</script>

<script setup lang="ts">
import { logger } from '../utils/logger';
import { ref, computed, onMounted, watch, onUnmounted, type PropType } from 'vue';
import AnnotationForm from './AnnotationForm.vue';
import AnnotationCard from './AnnotationCard.vue';
import AnnotationSkeleton from './AnnotationSkeleton.vue';
import LabelManagement from './LabelManagement.vue';
import QaStatusSelect from './QaStatusSelect.vue';
import { useAuth } from '../composables/useAuth';
import { useGlobalComments } from '../composables/useGlobalComments';
import { useAnnotationFiltering } from '../composables/useAnnotationFiltering';
import { useLabelCatalog } from '../composables/useLabelCatalog';
import type { Comment, Video } from '../types/database';
import type { UseDrawingCanvas } from '../composables/useDrawingCanvas';
import type { UseDrawingCoordinator } from '../composables/useDrawingCoordinator';
import type { DualVideoPlayer } from '../composables/useDualVideoPlayer';
import type { DrawingCanvasExpose, PanelAnnotation } from '../types/component-interfaces';
import type { QaStatusTarget } from '@/utils/qaStatus';

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
  /**
   * The video this rail belongs to, for the QA status control. EditorView
   * passes null in dual mode and in shared views, and the control does not
   * render without it.
   */
  video: {
    type: Object as PropType<QaStatusTarget | null>,
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
  'qa-status-updated',
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
const { sortedAnnotations, availableCategories, activeCategory } = useAnnotationFiltering({
  annotations: annotationsRef,
  labelsById: labelColors,
});

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
  // Editing an annotation moves the video to it and selects it, so the frame
  // the form names is the frame on screen - and any drawing it carries is
  // rendered, since the canvas only draws strokes stamped with its own frame.
  // Selecting is what seeks: `seek-to-frame` had no listener at all.
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

// Pass-through only: this panel does not know about the store that owns the
// loaded video, so it hands the saved row to whoever mounted it rather than
// writing anywhere itself.
const handleQaStatusUpdated = (updated: Video) => {
  emit('qa-status-updated', updated);
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

    <!-- QA status. Here rather than in EditorHeader: that row is AppHeader,
         shared with the dashboard, and it holds identity plus three icon
         buttons under a stated rule of one hover colour for all of them. A
         five-value dropdown there would be the loudest thing in the bar. The
         rail is the editor's per-video sidebar, so the control lives in the
         same kind of block VideoDetailsPanel gives it.

         `canAnnotate` is a third gate beyond the two the spec names (dual
         projects, shared/anonymous viewers). It is coincidentally correct
         today: canAnnotate resolves to isPublic || own, the same set the RPC's
         first two visibility branches allow. That coupling is load-bearing
         but not enforced anywhere - if annotation permissions ever narrow
         independently of QA visibility, this control silently disappears for
         the reviewers this feature exists for. -->
    <div
      v-if="video && !isDualMode && canAnnotate"
      class="shrink-0 border-b border-gray-200 px-4 pb-3 dark:border-white/10"
    >
      <QaStatusSelect
        :video="video"
        @updated="handleQaStatusUpdated"
      />
    </div>

    <!-- Category filter. Hidden until the video has categorised annotations,
         so a lone "All" pill never sits over an empty list. -->
    <div
      v-if="availableCategories.length > 0"
      class="flex shrink-0 flex-wrap items-center gap-1 px-3 pb-3"
    >
      <button
        type="button"
        class="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
        :class="
          activeCategory === null
            ? 'bg-gray-900 text-white dark:bg-gray-700 dark:text-white'
            : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
        "
        @click="activeCategory = null"
      >
        All
      </button>
      <button
        v-for="category in availableCategories"
        :key="category"
        type="button"
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
    <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-4">
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
          {{ activeCategory ? 'Nothing in this category' : 'No annotations yet' }}
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
        class="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
        @click.stop
      >
        <button
          type="button"
          class="absolute right-3 top-3 z-10 rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
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
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <LabelManagement :project-id="projectId" />
        </div>
      </div>
    </div>
  </div>
</template>
