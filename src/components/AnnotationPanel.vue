<script lang="ts">
// Re-export types so existing consumers (e.g. useLabelFiltering) keep working
// without needing to change their imports immediately.
export type { PanelAnnotation, NewAnnotationDraft } from '../types/component-interfaces';
</script>

<script setup lang="ts">
import { logger } from '../utils/logger';
import { formatTime, formatFrame, timeToFrame as _timeToFrame } from '@/utils/formatters';
import { ref, computed, onMounted, watch, onUnmounted, type PropType } from 'vue';
import AnnotationForm from './AnnotationForm.vue';
import AnnotationCard from './AnnotationCard.vue';
import AnnotationSkeleton from './AnnotationSkeleton.vue';
import LabelManagement from './LabelManagement.vue';
import LabelFilter from './LabelFilter.vue';
import { useAuth } from '../composables/useAuth';
import { useGlobalComments } from '../composables/useGlobalComments';
import { useAnnotationFiltering } from '../composables/useAnnotationFiltering';
import { useLabelCatalog } from '../composables/useLabelCatalog';
import type { DrawingData, Comment } from '../types/database';
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
  'add-annotation',
  'update-annotation',
  'delete-annotation',
  'select-annotation',
  'form-show',
  'form-hide',
  'pause',
  'drawing-created',
  'seek-to-frame',
  'video-context-changed',
  'annotation-edit',
  'comment-added',
  'comment-updated',
  'comment-deleted',
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

// Annotation filtering composable
const annotationsRef = computed(() => props.annotations);
const {
  filterState,
  hasActiveFilters,
  getActiveFilterCount,
  sortedAnnotations,
  annotationsListStyle,
  updateLabelFilter,
  clearAllFilters,
} = useAnnotationFiltering({
  annotations: annotationsRef,
  projectId: props.projectId,
});

// Label state
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
const showFilterDropdown = ref(false);

// Comment state
const expandedComments = ref(new Set<string>());

// Form ref
const annotationFormRef = ref<InstanceType<typeof AnnotationForm> | null>(null);

// Annotation being edited (passed to the form)
const editAnnotationData = ref<PanelAnnotation | null>(null);

// Default color for annotations without specific labels
const defaultAnnotationColor = '#6b7280'; // gray-500

/**
 * Stable loading state to prevent skeleton flickering
 */
const shouldShowSkeleton = computed(() => {
  return props.loading && props.annotations.length === 0;
});

if (import.meta.env.DEV) {
  logger.debug('[AnnotationPanel] setup');
}

const timeToFrame = (timeInSeconds: number) => _timeToFrame(timeInSeconds, props.fps);

onMounted(() => {
  if (import.meta.env.DEV) {
    logger.debug('[AnnotationPanel] mounted');
  }
  loadLabels();
});

// --- Form orchestration ---

const startAddAnnotation = () => {
  editAnnotationData.value = null;
  // Use nextTick-like approach: the form ref should already exist; call its method
  annotationFormRef.value?.startAddAnnotation();
};

const startEditAnnotation = (annotation: PanelAnnotation) => {
  emit('pause');
  const targetFrame =
    annotation.frame || Math.round(annotation.timestamp * props.fps);
  emit('seek-to-frame', targetFrame);
  emit('annotation-edit', annotation);

  editAnnotationData.value = annotation;
  // The form watches editAnnotation prop and will start editing
};

const handleFormSave = (annotationData: Record<string, unknown>) => {
  if (annotationData.id) {
    emit('update-annotation', annotationData);
  } else {
    emit('add-annotation', annotationData);
  }
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

// --- Label management ---

const openLabelManagement = () => {
  showLabelManagement.value = true;
};

const closeLabelManagement = () => {
  showLabelManagement.value = false;
  reloadLabels();
};

const handleCreateLabel = (_labelName: string) => {
  openLabelManagement();
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

// Drawing data forwarding — the parent still calls onDrawingCreated on us
const onDrawingCreated = (drawingData: DrawingData, videoContext: string | null = null) => {
  annotationFormRef.value?.onDrawingCreated(drawingData, videoContext);
};

// Expose methods for parent component access
defineExpose({
  onDrawingCreated,
});
</script>

<template>
  <div class="h-full w-full bg-white dark:bg-gray-900 overflow-y-auto overflow-x-hidden">
    <!-- Header -->
    <div
      class="sticky top-0 z-10 flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
    >
      <h3
        v-if="readOnly"
        class="text-sm font-medium text-gray-600 dark:text-gray-300"
      >
        Annotations (View Only)
      </h3>
      <h3
        v-else-if="!isAuthenticated"
        class="text-sm font-medium text-gray-600 dark:text-gray-300"
      >
        Annotations (Comments Enabled)
      </h3>
      <div
        v-else
        class="flex-1 flex items-center"
      >
        <!-- Active filter indicator -->
        <div
          v-if="hasActiveFilters"
          class="flex items-center text-xs text-blue-600 dark:text-blue-400 ml-2"
        >
          <svg
            class="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z"
            />
          </svg>
          <span>{{ getActiveFilterCount }} filter{{
            getActiveFilterCount !== 1 ? 's' : ''
          }}
            active</span>
        </div>
      </div>

      <div class="relative flex items-center space-x-2">
        <!-- Filter button -->
        <div>
          <button
            :class="[
              'btn flex items-center space-x-1 relative',
              hasActiveFilters ? 'btn-secondary' : 'btn-ghost',
            ]"
            title="Filter annotations"
            @click="showFilterDropdown = !showFilterDropdown"
          >
            <svg
              class="icon icon-lg"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z"
              />
            </svg>
            <!-- Badge for active filter count -->
            <span
              v-if="hasActiveFilters"
              class="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-blue-600 rounded-full"
            >
              {{ getActiveFilterCount }}
            </span>
          </button>

          <!-- Filter dropdown -->
          <div
            v-if="showFilterDropdown"
            class="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
            @click.stop
          >
            <div class="p-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Filter Annotations
                </h3>
                <button
                  class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  @click="showFilterDropdown = false"
                >
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <LabelFilter
                v-model="filterState.labelFilter"
                :project-id="projectId"
                @filter-changed="(newFilter) => updateLabelFilter(newFilter)"
              />

              <div
                v-if="hasActiveFilters"
                class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700"
              >
                <button
                  class="w-full btn btn-ghost text-sm"
                  @click="clearAllFilters"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Add button -->
        <button
          v-if="!readOnly && isAuthenticated"
          class="btn btn-primary flex items-center space-x-1"
          title="Add new annotation"
          @click="startAddAnnotation"
        >
          <svg
            class="icon icon-sm"
            viewBox="0 0 24 24"
          >
            <line
              x1="12"
              y1="5"
              x2="12"
              y2="19"
            />
            <line
              x1="5"
              y1="12"
              x2="19"
              y2="12"
            />
          </svg>
          <span>Add</span>
        </button>
      </div>
    </div>

    <!-- Add/Edit Form -->
    <AnnotationForm
      v-if="!readOnly"
      ref="annotationFormRef"
      :current-frame="currentFrame"
      :current-time="currentTime"
      :fps="fps"
      :is-dual-mode="isDualMode"
      :drawing-canvas="drawingCanvas"
      :drawing-canvas-a="drawingCanvasA"
      :drawing-canvas-b="drawingCanvasB"
      :drawing-canvas-ref="drawingCanvasRef"
      :drawing-canvas-a-ref="drawingCanvasARef"
      :drawing-canvas-b-ref="drawingCanvasBRef"
      :drawing-coordinator="drawingCoordinator"
      :video-a-current-frame="videoACurrentFrame"
      :video-b-current-frame="videoBCurrentFrame"
      :video-a-fps="videoAFps"
      :video-b-fps="videoBFps"
      :project-id="projectId"
      :available-labels="availableLabels"
      :edit-annotation="editAnnotationData"
      @save="handleFormSave"
      @cancel="handleFormHide"
      @form-show="handleFormShow"
      @form-hide="handleFormHide"
      @manage-labels="openLabelManagement"
      @create-label="handleCreateLabel"
    />

    <!-- Annotations List -->
    <div
      class="p-2"
      :style="annotationsListStyle"
    >
      <!-- Loading Skeleton -->
      <AnnotationSkeleton
        v-if="shouldShowSkeleton"
        :skeleton-count="3"
      />

      <!-- Empty State -->
      <div
        v-else-if="sortedAnnotations.length === 0"
        class="text-center py-8 px-3 text-gray-500 dark:text-gray-400"
      >
        <svg
          class="w-10 h-10 mx-auto mb-3 text-gray-400 dark:text-gray-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          />
          <polyline points="14,2 14,8 20,8" />
          <line
            x1="16"
            y1="13"
            x2="8"
            y2="13"
          />
          <line
            x1="16"
            y1="17"
            x2="8"
            y2="17"
          />
          <polyline points="10,9 9,9 8,9" />
        </svg>
        <p class="text-sm mb-1">
          No annotations yet
        </p>
        <p class="text-xs text-gray-400 dark:text-gray-500">
          Click "Add" to create your first annotation
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
        :is-authenticated="isAuthenticated"
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

    <!-- Panel Footer -->
    <div class="p-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 font-mono">
        <span> {{ annotations.length }} annotations </span>

        <!-- Single Video Mode -->
        <div
          v-if="!isDualMode"
          class="flex flex-col items-end"
        >
          <span>{{ formatTime(currentTime) }}</span>
          <span class="opacity-75">{{ formatFrame(currentFrame) }}</span>
        </div>

        <!-- Dual Video Mode -->
        <div
          v-else
          class="flex flex-col items-end space-y-1"
        >
          <div class="flex space-x-3">
            <div class="text-right">
              <div class="text-blue-600">
                Video A
              </div>
              <div class="opacity-75">
                {{ formatFrame(videoACurrentFrame) }}
              </div>
            </div>
            <div class="text-right">
              <div class="text-green-600">
                Video B
              </div>
              <div class="opacity-75">
                {{ formatFrame(videoBCurrentFrame) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Label Management Modal -->
    <div
      v-if="showLabelManagement"
      class="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0"
      >
        <!-- Background overlay -->
        <div
          class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          aria-hidden="true"
          @click="closeLabelManagement"
        />

        <!-- Modal panel -->
        <div
          class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full"
        >
          <div class="bg-white dark:bg-gray-800 relative">
            <button
              type="button"
              class="absolute top-4 right-4 z-10 bg-white dark:bg-gray-800 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              @click="closeLabelManagement"
            >
              <span class="sr-only">Close</span>
              <svg
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div class="p-6">
              <LabelManagement :project-id="projectId" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import 'tailwindcss' reference;

/* Custom styles for comment integration */
.comment-section {
  max-height: 300px;
  overflow-y: auto;
}

/* Comment toggle button styling handled via utility classes in template */

/* Smooth transitions for comment sections */
.comment-section-enter-active,
.comment-section-leave-active {
  transition: all 0.3s ease;
}

.comment-section-enter-from,
.comment-section-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Ensure proper spacing for comment sections */
.comment-section :deep(.comment-section) {
  border-radius: 0.5rem;
  overflow: hidden;
}

/* Responsive design for comment sections */
@media (max-width: 640px) {
  .comment-section {
    max-height: 250px;
  }
}
</style>
