<script setup lang="ts">
import { ref, computed, watch, type PropType } from 'vue';
import SearchableLabelSelector from './SearchableLabelSelector.vue';
import { buildAnnotationPayload, DEFAULT_ANNOTATION_COLOR } from '../utils/annotationPayload';
import type { DrawingData } from '../types/database';
import type { Label } from '../types/labels';
import type { UseDrawingCanvas } from '../composables/useDrawingCanvas';
import type { UseDrawingCoordinator } from '../composables/useDrawingCoordinator';
import type {
  DrawingCanvasExpose,
  PanelAnnotation,
  NewAnnotationDraft,
} from '../types/component-interfaces';

const props = defineProps({
  currentFrame: {
    type: Number,
    default: 0,
  },
  currentTime: {
    type: Number,
    default: 0,
  },
  fps: {
    type: Number,
    default: 30,
  },
  isDualMode: {
    type: Boolean,
    default: false,
  },
  drawingCanvas: {
    type: Object as PropType<UseDrawingCanvas | null>,
    default: null,
  },
  drawingCanvasA: {
    type: Object as PropType<UseDrawingCanvas | null>,
    default: null,
  },
  drawingCanvasB: {
    type: Object as PropType<UseDrawingCanvas | null>,
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
  drawingCoordinator: {
    type: Object as PropType<UseDrawingCoordinator | null>,
    default: null,
  },
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
  projectId: {
    type: String,
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
  (e: 'cancel'): void;
  (e: 'form-show'): void;
  (e: 'form-hide'): void;
  (e: 'drawing-mode-changed', active: boolean): void;
  (e: 'manage-labels'): void;
  (e: 'create-label', name: string): void;
}>();

// Color picker functionality
const colorPalette = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#000000', '#6b7280', '#ffffff', '#fbbf24',
];

// Get the primary drawing canvas (for single mode or primary canvas in dual mode)
const primaryDrawingCanvas = computed(() => {
  if (props.isDualMode && props.drawingCanvasA) {
    return props.drawingCanvasA;
  }
  return props.drawingCanvas;
});

// Shorthand to build the canvas-refs object the coordinator expects
const canvasRefs = () => ({
  single: props.drawingCanvasRef,
  a: props.drawingCanvasARef,
  b: props.drawingCanvasBRef,
});

// Shorthand for the coordinator (may be null when not provided)
const coord = computed(() => props.drawingCoordinator);

// Get current drawing color
const getCurrentDrawingColor = (): string => {
  return primaryDrawingCanvas.value?.getCurrentColor?.() || '#6b7280';
};

// Set custom color on the drawing canvas
const setCustomColor = (color: string) => {
  if (coord.value) {
    coord.value.setCustomColor(color);
  } else {
    primaryDrawingCanvas.value?.setCustomColor?.(color);
  }
};

// Clear custom color on the drawing canvas
const clearCustomColor = () => {
  if (coord.value) {
    coord.value.clearCustomColor();
  } else {
    primaryDrawingCanvas.value?.clearCustomColor?.();
  }
};

// Form state
const showAddForm = ref(false);
const editingAnnotation = ref<PanelAnnotation | null>(null);
const newAnnotation = ref<NewAnnotationDraft>({
  content: '',
  color: DEFAULT_ANNOTATION_COLOR,
  frame: 0,
  annotationType: 'text',
  drawingData: null,
  labels: [],
  startFrame: 0,
  endFrame: 0,
  duration: 0,
  durationFrames: 0,
});

// Drawing state
const showDrawingSection = ref(false);
const hasDrawingData = ref(false);

// Editing state
const isEditing = ref(false);

// Watch for currentFrame changes to keep the form in sync with timeline
watch(
  () => props.currentFrame,
  (newFrame) => {
    if (showAddForm.value && !isEditing.value && newAnnotation.value) {
      newAnnotation.value.frame = newFrame;
      if (newAnnotation.value.startFrame !== undefined) {
        newAnnotation.value.startFrame = newFrame;
      }
      if (newAnnotation.value.endFrame !== undefined) {
        newAnnotation.value.endFrame = newFrame;
      }
    }
  }
);

// Computed property to ensure labels is always an array for the LabelSelector
const annotationLabels = computed({
  get: () => newAnnotation.value?.labels || [],
  set: (value) => {
    if (newAnnotation.value) {
      newAnnotation.value.labels = value;
    }
  },
});

// Computed
// A label is all that is required. Text and drawings are optional, so the
// sidebar agrees with the quick pick on what a valid annotation is.
const isSaveDisabled = computed(() => {
  if (!newAnnotation.value) return true;
  return newAnnotation.value.labels?.length !== 1;
});

// Update annotation color based on selected labels
const updateAnnotationColor = () => {
  const primaryLabel = props.availableLabels.find((label) =>
    newAnnotation.value.labels?.includes(label.id)
  );
  newAnnotation.value.color = primaryLabel?.color || DEFAULT_ANNOTATION_COLOR;
};

// Watch for label changes to update annotation color
watch(
  () => newAnnotation.value.labels,
  () => {
    updateAnnotationColor();
  },
  { deep: true }
);

// Watch for editAnnotation prop to trigger edit mode
watch(
  () => props.editAnnotation,
  (annotation) => {
    if (annotation) {
      startEditAnnotation(annotation);
    }
  }
);

/**
 * Start an add-annotation flow and prime defaults.
 */
const startAddAnnotation = () => {
  newAnnotation.value = {
    content: '',
    color: DEFAULT_ANNOTATION_COLOR,
    frame: props.currentFrame,
    annotationType: 'text',
    drawingData: null,
    labels: [],
    startFrame: props.currentFrame,
    endFrame: props.currentFrame,
    duration: 1 / props.fps,
    durationFrames: 1,
  };
  showAddForm.value = true;
  editingAnnotation.value = null;
  showDrawingSection.value = false;
  isEditing.value = false;

  // Check if there are existing drawings on the current frame
  const hasExistingDrawings = coord.value
    ? coord.value.hasDrawingsOnCurrentFrame(canvasRefs())
    : props.isDualMode
      ? props.drawingCanvasARef?.hasDrawingsOnCurrentFrame?.() ||
        props.drawingCanvasBRef?.hasDrawingsOnCurrentFrame?.()
      : props.drawingCanvasRef?.hasDrawingsOnCurrentFrame?.() ||
        primaryDrawingCanvas.value?.hasDrawingsOnCurrentFrame();

  if (hasExistingDrawings) {
    hasDrawingData.value = true;
  } else {
    hasDrawingData.value = false;
    if (coord.value) {
      coord.value.clearDrawingsWithRefs(canvasRefs());
    } else if (props.isDualMode) {
      props.drawingCanvasA?.disableDrawingMode?.();
      props.drawingCanvasB?.disableDrawingMode?.();
      props.drawingCanvasARef?.clearDrawings?.();
      props.drawingCanvasBRef?.clearDrawings?.();
    } else {
      primaryDrawingCanvas.value?.disableDrawingMode?.();
      primaryDrawingCanvas.value?.clearCurrentFrameDrawings?.();
    }
  }

  emit('form-show');
};

const startEditAnnotation = (annotation: PanelAnnotation) => {
  const draft: NewAnnotationDraft = {
    content: annotation.content ?? '',
    color: annotation.color ?? DEFAULT_ANNOTATION_COLOR,
    frame: annotation.frame ?? Math.round(annotation.timestamp * props.fps),
    annotationType: annotation.annotationType ?? 'text',
    drawingData: annotation.drawingData ?? null,
    labels: annotation.labels || [],
  };
  if (annotation.startFrame != null) draft.startFrame = annotation.startFrame;
  if (annotation.endFrame != null) draft.endFrame = annotation.endFrame;
  if (annotation.duration != null) draft.duration = annotation.duration;
  if (annotation.durationFrames != null) draft.durationFrames = annotation.durationFrames;
  newAnnotation.value = draft;
  showAddForm.value = true;
  editingAnnotation.value = annotation;
  isEditing.value = true;

  // Handle drawing data if present, but keep drawing section closed by default
  if (annotation.drawingData) {
    hasDrawingData.value = true;
    showDrawingSection.value = false;
    // Load the drawing data into the canvas
    if (coord.value) {
      coord.value.loadDrawingsForAnnotation(annotation);
    } else if (props.isDualMode) {
      if (props.drawingCanvasA) {
        props.drawingCanvasA.clearCurrentFrameDrawings();
        if (annotation.drawingData?.drawingA) {
          props.drawingCanvasA.addDrawing({
            frame: annotation.drawingData.drawingA.frame,
            paths: annotation.drawingData.drawingA.paths,
            canvasWidth: annotation.drawingData.drawingA.canvasWidth,
            canvasHeight: annotation.drawingData.drawingA.canvasHeight,
          });
        }
      }
      if (props.drawingCanvasB) {
        props.drawingCanvasB.clearCurrentFrameDrawings();
        if (annotation.drawingData?.drawingB) {
          props.drawingCanvasB.addDrawing({
            frame: annotation.drawingData.drawingB.frame,
            paths: annotation.drawingData.drawingB.paths,
            canvasWidth: annotation.drawingData.drawingB.canvasWidth,
            canvasHeight: annotation.drawingData.drawingB.canvasHeight,
          });
        }
      }
    } else {
      if (primaryDrawingCanvas.value) {
        primaryDrawingCanvas.value.clearCurrentFrameDrawings();
        if (annotation.drawingData) {
          primaryDrawingCanvas.value.addDrawing(annotation.drawingData);
        }
      }
    }
  } else {
    hasDrawingData.value = false;
    showDrawingSection.value = false;
  }

  emit('form-show');
};

const saveAnnotation = async () => {
  try {
    let currentDrawingData = null;

    if (newAnnotation.value.drawingData) {
      currentDrawingData = newAnnotation.value.drawingData;
    } else if (coord.value) {
      currentDrawingData = coord.value.getDrawingData(canvasRefs());
    } else {
      if (props.isDualMode) {
        const drawingA = props.drawingCanvasARef?.getCurrentDrawingSession?.();
        const drawingB = props.drawingCanvasBRef?.getCurrentDrawingSession?.();

        if (drawingA || drawingB) {
          currentDrawingData = {} as DrawingData;
          if (drawingA) currentDrawingData.drawingA = drawingA;
          if (drawingB) currentDrawingData.drawingB = drawingB;
        }
      } else {
        const canvasRef = props.drawingCanvasRef;

        // Read session data BEFORE completing, because completeDrawingSession
        // clears currentDrawingSession to null after emitting the event.
        if (canvasRef?.getCurrentDrawingSession) {
          const drawingSession = canvasRef.getCurrentDrawingSession();
          if (
            drawingSession &&
            drawingSession.paths &&
            drawingSession.paths.length > 0
          ) {
            canvasRef.completeDrawingSession?.();
            currentDrawingData = {
              paths: drawingSession.paths,
              frame: drawingSession.frame,
              canvasWidth: drawingSession.canvasWidth,
              canvasHeight: drawingSession.canvasHeight,
            };
          }
        }

        if (
          !currentDrawingData &&
          primaryDrawingCanvas.value?.getCurrentFrameDrawing
        ) {
          const frameDrawing =
            primaryDrawingCanvas.value.getCurrentFrameDrawing();
          if (
            frameDrawing &&
            frameDrawing.paths &&
            frameDrawing.paths.length > 0
          ) {
            currentDrawingData = frameDrawing;
          }
        }
      }
    }

    hasDrawingData.value = currentDrawingData !== null;

    const baseDraft = newAnnotation.value;
    if (!baseDraft) {
      console.error('No annotation draft available');
      return;
    }

    const annotationData = buildAnnotationPayload({
      labels: props.availableLabels,
      labelIds: baseDraft.labels || [],
      content: baseDraft.content,
      frame: baseDraft.frame,
      fps: props.fps,
      drawingData: currentDrawingData,
      fallbackColor: baseDraft.color,
      dual: props.isDualMode
        ? {
            videoAFrame: props.videoACurrentFrame,
            videoBFrame: props.videoBCurrentFrame,
          }
        : null,
    });

    if (editingAnnotation.value) {
      annotationData.id = editingAnnotation.value.id;
    }

    emit('save', annotationData);

    // Reset form
    cancelForm();
  } catch (error) {
    console.error('Error saving annotation:', error);
  }
};

const cancelForm = () => {
  showAddForm.value = false;
  editingAnnotation.value = null;
  isEditing.value = false;
  showDrawingSection.value = false;
  hasDrawingData.value = false;

  // Clear drawing canvases
  if (coord.value) {
    coord.value.clearDrawingsWithRefs(canvasRefs());
  } else if (props.isDualMode) {
    props.drawingCanvasA?.disableDrawingMode?.();
    props.drawingCanvasB?.disableDrawingMode?.();
    props.drawingCanvasARef?.clearDrawings?.();
    props.drawingCanvasBRef?.clearDrawings?.();
  } else {
    primaryDrawingCanvas.value?.disableDrawingMode?.();
    primaryDrawingCanvas.value?.clearCurrentFrameDrawings?.();
  }

  // Reset form data
  newAnnotation.value = {
    content: '',
    color: DEFAULT_ANNOTATION_COLOR,
    frame: props.currentFrame,
    annotationType: 'text',
    drawingData: null,
    labels: [],
  };

  emit('form-hide');
};

const toggleDrawingSection = () => {
  showDrawingSection.value = !showDrawingSection.value;

  if (coord.value) {
    if (showDrawingSection.value) {
      coord.value.enableDrawingMode();
    } else {
      coord.value.disableDrawingMode();
    }
  } else if (showDrawingSection.value) {
    if (props.isDualMode) {
      props.drawingCanvasA?.enableDrawingMode?.();
      props.drawingCanvasB?.enableDrawingMode?.();
    } else {
      primaryDrawingCanvas.value?.enableDrawingMode?.();
    }
  } else {
    if (props.isDualMode) {
      props.drawingCanvasA?.disableDrawingMode?.();
      props.drawingCanvasB?.disableDrawingMode?.();
    } else {
      primaryDrawingCanvas.value?.disableDrawingMode?.();
    }
  }

  emit('drawing-mode-changed', showDrawingSection.value);
};

const onDrawingCreated = (drawingData: DrawingData, videoContext: string | null = null) => {
  console.log(
    '🎨 [AnnotationForm] onDrawingCreated called with:',
    drawingData,
    'context:',
    videoContext
  );

  if (coord.value) {
    coord.value.storeDrawingInDraft(newAnnotation.value, drawingData, videoContext);
  } else if (props.isDualMode) {
    if (!newAnnotation.value.drawingData) {
      newAnnotation.value.drawingData = {
        paths: [],
        canvasWidth: drawingData.canvasWidth,
        canvasHeight: drawingData.canvasHeight,
        frame: drawingData.frame,
      } as DrawingData;
    }

    if (videoContext === 'A') {
      newAnnotation.value.drawingData.drawingA = drawingData;
    } else if (videoContext === 'B') {
      newAnnotation.value.drawingData.drawingB = drawingData;
    } else {
      newAnnotation.value.drawingData.drawingA = drawingData;
    }
  } else {
    newAnnotation.value.drawingData = drawingData;
    console.log(
      '🎨 [AnnotationForm] Stored drawing data in annotation:',
      newAnnotation.value.drawingData
    );
  }

  hasDrawingData.value = true;
};

const clearDrawing = () => {
  if (coord.value) {
    coord.value.clearDrawingsWithRefs(canvasRefs());
  } else if (props.isDualMode) {
    props.drawingCanvasARef?.clearDrawings?.();
    props.drawingCanvasBRef?.clearDrawings?.();
  } else {
    props.drawingCanvasRef?.clearDrawings?.();
    primaryDrawingCanvas.value?.clearCurrentFrameDrawings?.();
  }

  newAnnotation.value.drawingData = null;
  hasDrawingData.value = false;

  if (editingAnnotation.value) {
    editingAnnotation.value.drawingData = null;
  }
};

// Drawing data management (for external updates)
const setDrawingData = (drawingData: DrawingData | null) => {
  newAnnotation.value.drawingData = drawingData;
  hasDrawingData.value = drawingData !== null;
};

// Expose methods for parent component access
defineExpose({
  onDrawingCreated,
  startAddAnnotation,
  startEditAnnotation,
  cancelForm,
  setDrawingData,
  showAddForm,
});
</script>

<template>
  <div
    v-if="showAddForm"
    class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
  >
    <div
      class="flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700"
    >
      <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">
        {{ editingAnnotation ? 'Edit' : 'New' }} Annotation
      </h4>
      <button
        class="btn btn-ghost p-1"
        @click="cancelForm"
      >
        <svg
          class="icon icon-sm"
          viewBox="0 0 24 24"
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

    <div class="p-3">
      <div class="space-y-3">
        <!-- Frame Position - Different UI for dual vs single mode -->
        <div v-if="!isDualMode">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Frame Position</label>
          <input
            v-if="newAnnotation"
            v-model.number="newAnnotation.frame"
            type="number"
            min="0"
            step="1"
            class="input text-gray-900 dark:text-gray-100"
            placeholder="Enter frame number"
          >
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            @ {{ fps }}fps
          </p>
        </div>

        <!-- Dual Video Mode - Show both video frame positions -->
        <div
          v-else
          class="space-y-3"
        >
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Frame Positions</label>

          <div class="grid grid-cols-2 gap-3">
            <!-- Video A Frame -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Video A Frame</label>
              <input
                :value="videoACurrentFrame"
                type="number"
                min="0"
                step="1"
                class="input text-sm text-gray-900 dark:text-gray-100"
                readonly
                :title="`Video A is currently at frame ${videoACurrentFrame}`"
              >
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                @ {{ videoAFps }}fps
              </p>
            </div>

            <!-- Video B Frame -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Video B Frame</label>
              <input
                :value="videoBCurrentFrame"
                type="number"
                min="0"
                step="1"
                class="input text-sm text-gray-900 dark:text-gray-100"
                readonly
                :title="`Video B is currently at frame ${videoBCurrentFrame}`"
              >
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                @ {{ videoBFps }}fps
              </p>
            </div>
          </div>

          <p class="text-xs text-gray-500 dark:text-gray-400">
            Annotation will be saved with both video positions shown above
          </p>
        </div>

        <!-- Label Selector -->
        <div>
          <SearchableLabelSelector
            v-model="annotationLabels"
            :project-id="projectId"
            :readonly="false"
            :required="true"
            :can-manage-labels="true"
            :mode="'default'"
            :max-labels="1"
            @manage-labels="emit('manage-labels')"
            @create-label="(name: string) => emit('create-label', name)"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content</label>
          <textarea
            v-if="newAnnotation"
            v-model="newAnnotation.content"
            placeholder="Enter annotation content..."
            class="input resize-y min-h-[50px] text-gray-900 dark:text-gray-100"
            rows="2"
          />
        </div>

        <!-- Drawing Section -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Drawing</label>
            <button
              type="button"
              :class="[
                'px-2 py-1 rounded text-xs font-medium transition-colors',
                showDrawingSection
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
              ]"
              @click="toggleDrawingSection"
            >
              {{ showDrawingSection ? 'Hide' : 'Add Drawing' }}
            </button>
          </div>

          <!-- Drawing Tools and Canvas -->
          <div
            v-if="showDrawingSection"
            class="space-y-3"
          >
            <!-- Drawing Tools -->
            <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg space-y-2">
              <!-- Stroke Width -->
              <div class="space-y-1">
                <label class="text-xs text-gray-600 dark:text-gray-300">
                  Width: {{ drawingCanvas?.currentTool.value.strokeWidth ?? 2 }}px
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  :value="drawingCanvas?.currentTool.value.strokeWidth ?? 2"
                  class="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  @input="
                    drawingCanvas?.setStrokeWidth(
                      Number(($event.target as HTMLInputElement)?.value ?? 0)
                    )
                  "
                >
              </div>

              <!-- Drawing Color Picker -->
              <div class="space-y-2">
                <label class="text-xs text-gray-600 dark:text-gray-300">Drawing Color</label>

                <!-- Custom Color Input -->
                <div class="flex items-center space-x-2">
                  <input
                    type="color"
                    :value="getCurrentDrawingColor()"
                    class="w-8 h-6 rounded border border-gray-300 dark:border-gray-500 cursor-pointer"
                    @input="
                      setCustomColor(
                        ($event.target as HTMLInputElement).value
                      )
                    "
                  >
                  <button
                    v-if="
                      primaryDrawingCanvas?.currentTool?.value?.customColor
                    "
                    class="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                    @click="clearCustomColor"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <!-- Clear Drawing Button -->
              <div class="flex space-x-2">
                <button
                  type="button"
                  :disabled="!hasDrawingData"
                  class="flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  @click="clearDrawing"
                >
                  <svg
                    class="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="3,6 5,6 21,6" />
                    <path
                      d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"
                    />
                  </svg>
                  <span>Clear Drawing</span>
                </button>
                <div
                  v-if="hasDrawingData"
                  class="flex items-center text-xs text-green-600 dark:text-green-400"
                >
                  <svg
                    class="w-3 h-3 mr-1"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                  Drawing saved
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex space-x-2 pt-1">
          <button
            class="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="isSaveDisabled"
            @click="saveAnnotation"
          >
            {{ editingAnnotation ? 'Update' : 'Save' }}
          </button>
          <button
            class="btn btn-secondary flex-1"
            @click="cancelForm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
