<script lang="ts">
// Centralize all type aliases here (kept pure TS to avoid parser edge cases)
export type PanelAnnotation = {
  id: string;
  title?: string;
  content?: string;
  color?: string;
  timestamp: number;
  frame?: number;
  startFrame?: number;
  endFrame?: number;
  duration?: number;
  durationFrames?: number;
  annotationType?: string;
  drawingData?: any;
  videoAFrame?: number;
  videoBFrame?: number;
  commentCount?: number;
  labels?: string[]; // Array of label IDs (but we'll enforce single selection)
};

export type NewAnnotationDraft = {
  content: string;
  color: string;
  frame: number;
  annotationType: string;
  drawingData: any;
  startFrame?: number;
  endFrame?: number;
  duration?: number;
  durationFrames?: number;
  labels?: string[]; // Array of label IDs (but we'll enforce single selection)
};
</script>

<script setup lang="ts">
import { logger } from '../utils/logger';
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import CommentSection from './CommentSection.vue';
import AnnotationSkeleton from './AnnotationSkeleton.vue';
import SearchableLabelSelector from './SearchableLabelSelector.vue';
import LabelManagement from './LabelManagement.vue';
import LabelFilter from './LabelFilter.vue';
import { useAuth } from '../composables/useAuth';
import { useGlobalComments } from '../composables/useGlobalComments';
import { useLabelFiltering } from '../composables/useLabelFiltering';
import { LabelService } from '../services/labelService';

// Helper to parse select value in template change handlers safely
const parseSelectValue = (e: any) => {
  const t = /** @type {HTMLSelectElement|null} */ e.target;
  return t?.value ?? '';
};

const props = defineProps({
  annotations: {
    type: Array,
    default: () => [],
  },
  selectedAnnotation: {
    type: Object,
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
    type: Object,
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
    type: Object,
    default: null,
  },
  drawingCanvasB: {
    type: Object,
    default: null,
  },
  dualVideoPlayer: {
    type: Object,
    default: null,
  },
  // Component refs for accessing drawing data
  drawingCanvasRef: {
    type: Object,
    default: null,
  },
  drawingCanvasARef: {
    type: Object,
    default: null,
  },
  drawingCanvasBRef: {
    type: Object,
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

// Get the primary drawing canvas (for single mode or primary canvas in dual mode)
const primaryDrawingCanvas = computed(() => {
  if (props.isDualMode && props.drawingCanvasA) {
    return props.drawingCanvasA;
  }
  return props.drawingCanvas;
});

// Color picker functionality
const colorPalette = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#000000', // black
  '#6b7280', // gray-500
  '#ffffff', // white
  '#fbbf24', // amber-400 (default medium)
];

// Get current drawing color
const getCurrentDrawingColor = (): string => {
  return primaryDrawingCanvas.value?.getCurrentColor?.() || '#6b7280';
};

// Set custom color on the drawing canvas
const setCustomColor = (color: string) => {
  if (primaryDrawingCanvas.value?.setCustomColor) {
    primaryDrawingCanvas.value.setCustomColor(color);
  }
  // Also update both canvases in dual mode
  if (props.isDualMode) {
    if (props.drawingCanvasA?.setCustomColor) {
      props.drawingCanvasA.setCustomColor(color);
    }
    if (props.drawingCanvasB?.setCustomColor) {
      props.drawingCanvasB.setCustomColor(color);
    }
  }
};

// Clear custom color on the drawing canvas
const clearCustomColor = () => {
  if (primaryDrawingCanvas.value?.clearCustomColor) {
    primaryDrawingCanvas.value.clearCustomColor();
  }
  // Also clear on both canvases in dual mode
  if (props.isDualMode) {
    if (props.drawingCanvasA?.clearCustomColor) {
      props.drawingCanvasA.clearCustomColor();
    }
    if (props.drawingCanvasB?.clearCustomColor) {
      props.drawingCanvasB.clearCustomColor();
    }
  }
};

// Form state
const showAddForm = ref(false);
const editingAnnotation = ref(null);
const newAnnotation = ref<NewAnnotationDraft>({
  content: '',
  color: '#6b7280',
  frame: 0,
  annotationType: 'text', // 'text' or 'drawing'
  drawingData: null,
  labels: [], // Array of label IDs (but we'll enforce single selection)
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

// Comment state
const expandedComments = ref(new Set());
const commentCounts = ref(new Map());

// Label state
const availableLabels = ref<any[]>([]);
const showLabelManagement = ref(false);
const labelColors = ref<Record<string, any>>({});
const showFilterDropdown = ref(false);

// Initialize label filtering composable
const {
  filterState,
  hasActiveFilters,
  getActiveFilterCount,
  filterAnnotations,
  updateLabelFilter,
  clearAllFilters,
} = useLabelFiltering(props.projectId);

// Default color for annotations without specific labels
const defaultAnnotationColor = '#6b7280'; // gray-500

// Watch for currentFrame changes to keep the form in sync with timeline
watch(
  () => props.currentFrame,
  (newFrame) => {
    // Only update if the form is open and we're not editing an existing annotation
    if (showAddForm.value && !isEditing.value && newAnnotation.value) {
      newAnnotation.value.frame = newFrame;
      // Also update start/end frames for new annotations
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
const isSaveDisabled = computed(() => {
  if (!newAnnotation.value) return true;
  const hasContent = newAnnotation.value.content?.trim();
  const hasDrawing = hasDrawingData.value;
  const hasLabel =
    newAnnotation.value.labels && newAnnotation.value.labels.length === 1;
  return (!hasContent && !hasDrawing) || !hasLabel;
});

const normalizedAnnotations = computed(() => {
  const anns = props?.annotations ?? [];
  const list = Array.isArray(anns) ? anns : [];
  return list.map((it: any) => {
    const a = it || {};
    return {
      id: a?.id ?? '',
      title: a?.title ?? '',
      content: a?.content ?? '',
      color: a?.color ?? defaultAnnotationColor,
      timestamp: typeof a?.timestamp === 'number' ? a.timestamp : 0,
      frame: typeof a?.frame === 'number' ? a.frame : undefined,
      startFrame: typeof a?.startFrame === 'number' ? a.startFrame : undefined,
      endFrame: typeof a?.endFrame === 'number' ? a.endFrame : undefined,
      duration: typeof a?.duration === 'number' ? a.duration : undefined,
      durationFrames:
        typeof a?.durationFrames === 'number' ? a.durationFrames : undefined,
      annotationType: a?.annotationType ?? 'text',
      drawingData: a?.drawingData ?? null,
      videoAFrame:
        typeof a?.videoAFrame === 'number' ? a.videoAFrame : undefined,
      videoBFrame:
        typeof a?.videoBFrame === 'number' ? a.videoBFrame : undefined,
      commentCount:
        typeof a?.commentCount === 'number' ? a.commentCount : undefined,
      labels: a?.labels ?? [],
    };
  });
});

// Filtered annotations based on label filters
const filteredAnnotations = ref<PanelAnnotation[]>([]);

// Watch for annotation or filter changes and apply filtering
watch(
  [normalizedAnnotations, filterState],
  async () => {
    if (hasActiveFilters.value) {
      filteredAnnotations.value = await filterAnnotations(
        normalizedAnnotations.value
      );
    } else {
      filteredAnnotations.value = normalizedAnnotations.value;
    }
  },
  { immediate: true, deep: true }
);

const sortedAnnotations = computed(() => {
  return filteredAnnotations.value.slice().sort((a, b) => {
    const ta = a && typeof a.timestamp === 'number' ? a.timestamp : 0;
    const tb = b && typeof b.timestamp === 'number' ? b.timestamp : 0;
    return ta - tb;
  });
});

// Computed style for annotations list - scrollable after 7 annotations
const annotationsListStyle = computed(() => {
  // Approximate height per annotation card (including margins)
  const annotationCardHeight = 120; // pixels
  const maxAnnotations = 7;
  const maxHeight = annotationCardHeight * maxAnnotations;

  if (sortedAnnotations.value.length > maxAnnotations) {
    return {
      maxHeight: `${maxHeight}px`,
      overflowY: 'auto' as const,
      overflowX: 'hidden' as const,
    };
  }
  return {};
});

// Load labels for display
const loadLabels = async () => {
  try {
    const labels = await LabelService.getLabels(
      user.value?.id,
      props.projectId
    );
    availableLabels.value = labels;
    // Create a map of label ID to label for quick lookup
    labelColors.value = {};
    labels.forEach((label) => {
      labelColors.value[label.id] = label;
    });
  } catch (error) {
    console.error('Failed to load labels:', error);
  }
};

// Get labels for an annotation
const getAnnotationLabels = (annotation: any) => {
  if (!annotation.labels || annotation.labels.length === 0) return [];
  return annotation.labels
    .map((labelId: string) => labelColors.value[labelId])
    .filter(Boolean);
};

// Get primary label color for annotation display
const getPrimaryLabelColor = (annotation: any) => {
  const labels = getAnnotationLabels(annotation);
  return labels.length > 0 ? labels[0].color : defaultAnnotationColor;
};

/**
 * Stable loading state to prevent skeleton flickering
 * DEV: gated mount log
 */
const shouldShowSkeleton = computed(() => {
  return props.loading && props.annotations.length === 0;
});
if (import.meta.env.DEV) {
  logger.debug('[AnnotationPanel] setup');
}

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const formatFrame = (frameNumber: number) => {
  if (!frameNumber || isNaN(frameNumber)) return 'Frame 0';
  return `Frame ${frameNumber.toLocaleString()}`;
};

/**
 * Stable loading state to prevent skeleton flickering
 * DEV: gated mount log
 */
const timeToFrame = (timeInSeconds: number) => {
  return Math.round(timeInSeconds * props.fps);
};
onMounted(() => {
  if (import.meta.env.DEV) {
    logger.debug('[AnnotationPanel] mounted');
  }
  loadLabels();
});

/**
 * Methods
 * Start an add-annotation flow and prime defaults.
 */
const startAddAnnotation = () => {
  // emit('pause'); // This was the cause of the race condition
  // cast to our local draft type to satisfy TS
  // Cast removed for runtime JS compatibility; structure already matches expected draft shape
  // Ensure the draft includes all runtime properties expected downstream
  // Build draft with explicit fields to satisfy both runtime and linter
  newAnnotation.value = {
    content: '',
    color: defaultAnnotationColor,
    frame: props.currentFrame,
    annotationType: 'text',
    drawingData: null,
    labels: [], // Initialize empty labels array (but we'll enforce single selection)
    // optional fields used later in code paths
    startFrame: props.currentFrame,
    endFrame: props.currentFrame,
    duration: 1 / props.fps,
    durationFrames: 1,
  };
  showAddForm.value = true;
  editingAnnotation.value = null;
  showDrawingSection.value = false;
  isEditing.value = false; // This is a new annotation, not editing

  // Check if there are existing drawings on the current frame
  const hasExistingDrawings = props.isDualMode
    ? props.drawingCanvasARef?.hasDrawingsOnCurrentFrame() ||
      props.drawingCanvasBRef?.hasDrawingsOnCurrentFrame()
    : props.drawingCanvasRef?.hasDrawingsOnCurrentFrame() ||
      primaryDrawingCanvas.value?.hasDrawingsOnCurrentFrame();

  if (hasExistingDrawings) {
    // If there are existing drawings, preserve them and set hasDrawingData to true
    hasDrawingData.value = true;
  } else {
    // Only clear and reset if there are no existing drawings
    hasDrawingData.value = false;
    if (props.isDualMode) {
      // In dual mode, disable drawing on both canvases and clear existing drawings for new annotation
      if (props.drawingCanvasA && props.drawingCanvasA.disableDrawingMode) {
        props.drawingCanvasA.disableDrawingMode();
      }
      if (props.drawingCanvasB && props.drawingCanvasB.disableDrawingMode) {
        props.drawingCanvasB.disableDrawingMode();
      }
      // Clear drawings from both canvases to provide clean slate for new annotation
      if (props.drawingCanvasARef && props.drawingCanvasARef.clearDrawings) {
        props.drawingCanvasARef.clearDrawings();
      }
      if (props.drawingCanvasBRef && props.drawingCanvasBRef.clearDrawings) {
        props.drawingCanvasBRef.clearDrawings();
      }
    } else {
      if (
        primaryDrawingCanvas.value &&
        primaryDrawingCanvas.value.disableDrawingMode
      ) {
        primaryDrawingCanvas.value.disableDrawingMode();
      }
      // Clear drawings to provide clean slate for new annotation
      if (
        primaryDrawingCanvas.value &&
        primaryDrawingCanvas.value.clearCurrentFrameDrawings
      ) {
        primaryDrawingCanvas.value.clearCurrentFrameDrawings();
      }
    }
  }

  emit('form-show');
};

const startEditAnnotation = (annotation: any) => {
  // First navigate to the annotation's frame
  emit('pause');

  // Navigate to the annotation's frame
  const targetFrame =
    annotation.frame || Math.round(annotation.timestamp * props.fps);
  emit('seek-to-frame', targetFrame);

  // Emit annotation edit event to set context in dual video player
  emit('annotation-edit', annotation);

  newAnnotation.value = {
    ...annotation,
    labels: annotation.labels || [], // Ensure labels is always an array
  };
  showAddForm.value = true;
  editingAnnotation.value = annotation;
  isEditing.value = true; // Set editing state to true

  // Handle drawing data if present, but keep drawing section closed by default
  if (annotation.drawingData) {
    hasDrawingData.value = true;
    showDrawingSection.value = false; // Always keep closed by default
    // Load the drawing data into the canvas
    if (props.isDualMode) {
      // In dual mode, load drawing data to both canvases if it exists
      if (props.drawingCanvasA) {
        props.drawingCanvasA.clearCurrentFrameDrawings();
        if (annotation.drawingData?.drawingA) {
          // Ensure the drawing data has the correct structure for addDrawing
          const drawingA = {
            frame: annotation.drawingData.drawingA.frame,
            paths: annotation.drawingData.drawingA.paths,
            canvasWidth: annotation.drawingData.drawingA.canvasWidth,
            canvasHeight: annotation.drawingData.drawingA.canvasHeight,
          };
          props.drawingCanvasA.addDrawing(drawingA);
        }
      }
      if (props.drawingCanvasB) {
        props.drawingCanvasB.clearCurrentFrameDrawings();
        if (annotation.drawingData?.drawingB) {
          // Ensure the drawing data has the correct structure for addDrawing
          const drawingB = {
            frame: annotation.drawingData.drawingB.frame,
            paths: annotation.drawingData.drawingB.paths,
            canvasWidth: annotation.drawingData.drawingB.canvasWidth,
            canvasHeight: annotation.drawingData.drawingB.canvasHeight,
          };
          props.drawingCanvasB.addDrawing(drawingB);
        }
      }
    } else {
      // Single mode: load drawing data to primary canvas
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
    // Check if drawing data was explicitly cleared by the user
    let currentDrawingData = null;

    // First check if we have drawing data stored in the annotation (from onDrawingCreated)
    if (newAnnotation.value.drawingData) {
      currentDrawingData = newAnnotation.value.drawingData;
    } else {
      // Otherwise, try to collect drawing data from canvases
      if (props.isDualMode) {
        // In dual mode, collect from both canvases
        const drawingA = props.drawingCanvasARef?.getCurrentDrawingSession();
        const drawingB = props.drawingCanvasBRef?.getCurrentDrawingSession();

        if (drawingA || drawingB) {
          currentDrawingData = {} as any;
          if (drawingA) currentDrawingData.drawingA = drawingA;
          if (drawingB) currentDrawingData.drawingB = drawingB;
        }
      } else {
        // Single mode: try to get from canvas ref
        const canvasRef = props.drawingCanvasRef;

        // Try to complete any pending drawing session
        if (
          canvasRef &&
          typeof canvasRef.completeDrawingSession === 'function'
        ) {
          canvasRef.completeDrawingSession();
        }

        // Then try to get the session data
        if (
          canvasRef &&
          typeof canvasRef.getCurrentDrawingSession === 'function'
        ) {
          const drawingSession = canvasRef.getCurrentDrawingSession();
          if (
            drawingSession &&
            drawingSession.paths &&
            drawingSession.paths.length > 0
          ) {
            currentDrawingData = {
              paths: drawingSession.paths,
              frame: drawingSession.frame,
              canvasWidth: drawingSession.canvasWidth,
              canvasHeight: drawingSession.canvasHeight,
            };
          }
        }

        // If still no data, check the drawing canvas composable for current frame drawings
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

    // Update hasDrawingData based on actual drawing data
    hasDrawingData.value = currentDrawingData !== null;

    // Build the annotation data
    const baseDraft = newAnnotation.value;
    if (!baseDraft) {
      console.error('No annotation draft available');
      return;
    }

    // Get color and title from primary label or use default
    const primaryLabel = availableLabels.value.find((label) =>
      baseDraft.labels?.includes(label.id)
    );
    const annotationColor =
      primaryLabel?.color || baseDraft.color || defaultAnnotationColor;

    // Use label name as title if available, otherwise use content or 'Untitled'
    const annotationTitle =
      primaryLabel?.name || baseDraft.content.slice(0, 50) || 'Untitled';

    const annotationData = {
      content: baseDraft.content,
      title: annotationTitle,
      color: annotationColor,
      timestamp: baseDraft.frame / props.fps,
      frame: baseDraft.frame,
      annotationType: currentDrawingData ? 'drawing' : 'text',
      drawingData: currentDrawingData,
      duration: Math.max(1 / 30, 1 / 30),
      durationFrames: Math.max(1, 1),
      labels: baseDraft.labels || [],
    };

    console.log('🎨 [AnnotationPanel] Saving annotation with data:', {
      annotationType: annotationData.annotationType,
      hasDrawingData: !!annotationData.drawingData,
      frame: annotationData.frame,
    });

    // Add dual video frame data if in dual mode
    if (props.isDualMode) {
      (annotationData as any).videoAFrame = props.videoACurrentFrame;
      (annotationData as any).videoBFrame = props.videoBCurrentFrame;
    }

    if (editingAnnotation.value) {
      // Update existing annotation
      const updateData = {
        ...annotationData,
        id: (editingAnnotation.value as any).id,
      };
      emit('update-annotation', updateData);
    } else {
      // Create new annotation
      emit('add-annotation', annotationData);
    }

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
  if (props.isDualMode) {
    if (props.drawingCanvasA && props.drawingCanvasA.disableDrawingMode) {
      props.drawingCanvasA.disableDrawingMode();
    }
    if (props.drawingCanvasB && props.drawingCanvasB.disableDrawingMode) {
      props.drawingCanvasB.disableDrawingMode();
    }
    if (props.drawingCanvasARef && props.drawingCanvasARef.clearDrawings) {
      props.drawingCanvasARef.clearDrawings();
    }
    if (props.drawingCanvasBRef && props.drawingCanvasBRef.clearDrawings) {
      props.drawingCanvasBRef.clearDrawings();
    }
  } else {
    if (
      primaryDrawingCanvas.value &&
      primaryDrawingCanvas.value.disableDrawingMode
    ) {
      primaryDrawingCanvas.value.disableDrawingMode();
    }
    if (
      primaryDrawingCanvas.value &&
      primaryDrawingCanvas.value.clearCurrentFrameDrawings
    ) {
      primaryDrawingCanvas.value.clearCurrentFrameDrawings();
    }
  }

  // Reset form data
  newAnnotation.value = {
    content: '',
    color: defaultAnnotationColor,
    frame: props.currentFrame,
    annotationType: 'text',
    drawingData: null,
    labels: [],
  };

  emit('form-hide');
};

const deleteAnnotation = (annotation: any) => {
  emit('delete-annotation', annotation);
};

const selectAnnotation = (annotation: any) => {
  // Prevent reselecting the same annotation to avoid unnecessary rerenders
  if (props.selectedAnnotation?.id === annotation.id) {
    return;
  }
  emit('select-annotation', annotation);
};

// Update annotation color based on selected labels
const updateAnnotationColor = () => {
  const primaryLabel = availableLabels.value.find((label) =>
    newAnnotation.value.labels?.includes(label.id)
  );
  newAnnotation.value.color = primaryLabel?.color || defaultAnnotationColor;
};

const toggleDrawingSection = () => {
  showDrawingSection.value = !showDrawingSection.value;

  if (showDrawingSection.value) {
    // Enable drawing mode using the composable
    if (props.isDualMode) {
      // In dual mode, we need to enable drawing on the composables
      if (props.drawingCanvasA?.enableDrawingMode) {
        props.drawingCanvasA.enableDrawingMode();
      }
      if (props.drawingCanvasB?.enableDrawingMode) {
        props.drawingCanvasB.enableDrawingMode();
      }
    } else {
      // In single mode, use the primary drawing canvas composable
      if (primaryDrawingCanvas.value?.enableDrawingMode) {
        primaryDrawingCanvas.value.enableDrawingMode();
      }
    }
  } else {
    // Disable drawing mode using the composable
    if (props.isDualMode) {
      // In dual mode, we need to disable drawing on the composables
      if (props.drawingCanvasA?.disableDrawingMode) {
        props.drawingCanvasA.disableDrawingMode();
      }
      if (props.drawingCanvasB?.disableDrawingMode) {
        props.drawingCanvasB.disableDrawingMode();
      }
    } else {
      // In single mode, use the primary drawing canvas composable
      if (primaryDrawingCanvas.value?.disableDrawingMode) {
        primaryDrawingCanvas.value.disableDrawingMode();
      }
    }
  }
};

const onDrawingCreated = (drawingData: any, videoContext = null) => {
  console.log(
    '🎨 [AnnotationPanel] onDrawingCreated called with:',
    drawingData,
    'context:',
    videoContext
  );

  if (props.isDualMode) {
    // Initialize drawing data object if it doesn't exist
    if (!newAnnotation.value.drawingData) {
      newAnnotation.value.drawingData = {} as any;
    }

    // Store drawing data based on video context
    if (videoContext === 'A') {
      (newAnnotation.value.drawingData as any).drawingA = drawingData;
    } else if (videoContext === 'B') {
      (newAnnotation.value.drawingData as any).drawingB = drawingData;
    } else {
      // Default to video A if no context specified
      (newAnnotation.value.drawingData as any).drawingA = drawingData;
    }
  } else {
    // Single mode: store the drawing data directly
    newAnnotation.value.drawingData = drawingData;
    console.log(
      '🎨 [AnnotationPanel] Stored drawing data in annotation:',
      newAnnotation.value.drawingData
    );
  }

  hasDrawingData.value = true;
  // Don't emit drawing-created here as it creates an infinite loop
  // The drawing data is already stored in newAnnotation.value.drawingData
};

const clearDrawing = () => {
  // Clear the visual canvas(es)
  if (props.isDualMode) {
    // Clear both canvases in dual mode
    if (props.drawingCanvasARef && props.drawingCanvasARef.clearDrawings) {
      props.drawingCanvasARef.clearDrawings();
    }
    if (props.drawingCanvasBRef && props.drawingCanvasBRef.clearDrawings) {
      props.drawingCanvasBRef.clearDrawings();
    }
  } else {
    // Clear single canvas - use the canvas ref which has the clearDrawings method
    if (props.drawingCanvasRef && props.drawingCanvasRef.clearDrawings) {
      props.drawingCanvasRef.clearDrawings();
    }
    // Also clear via the composable method if available
    if (
      primaryDrawingCanvas.value &&
      primaryDrawingCanvas.value.clearCurrentFrameDrawings
    ) {
      primaryDrawingCanvas.value.clearCurrentFrameDrawings();
    }
  }

  // Reset drawing data in the form
  newAnnotation.value.drawingData = null;
  hasDrawingData.value = false;

  // If we're editing an existing annotation, also clear its drawing data
  // This ensures that when the annotation is saved, the drawing data will be null
  if (editingAnnotation.value) {
    (editingAnnotation.value as any).drawingData = null;
  }
};

// Comment management
const toggleComments = (annotationId: any) => {
  if (expandedComments.value.has(annotationId)) {
    expandedComments.value.delete(annotationId);
  } else {
    expandedComments.value.add(annotationId);
    // Mark comments as viewed when expanded
    markCommentsAsViewed(annotationId);
  }
};

const isCommentsExpanded = (annotationId: any) => {
  return expandedComments.value.has(annotationId);
};

const getCommentCount = (annotation: any) => {
  return getTotalCommentCount(annotation.id) || annotation.commentCount || 0;
};

const handleCommentAdded = (comment: any) => {
  emit('comment-added', comment);
};

const handleCommentUpdated = (comment: any) => {
  emit('comment-updated', comment);
};

const handleCommentDeleted = (comment: any) => {
  emit('comment-deleted', comment);
};

// Label management
const openLabelManagement = () => {
  showLabelManagement.value = true;
};

const closeLabelManagement = () => {
  showLabelManagement.value = false;
  // Reload labels after management
  loadLabels();
};

const handleCreateLabel = (labelName: string) => {
  // Open label management with the new label name pre-filled
  // This could be enhanced to directly create the label or pass the name to the management component
  openLabelManagement();
};

// Global comment subscription setup
onMounted(async () => {
  if (props.videoId && isAuthenticated.value) {
    try {
      await setupGlobalCommentSubscription(props.videoId);
      await initializeCommentCounts(props.annotations as any);

      // Set up new comment handler
      onNewComment((comment: any) => {
        // Handle new comment notification
        console.log('New comment received:', comment);
      });
    } catch (error) {
      console.error('Failed to setup global comment subscription:', error);
    }
  }
});

// Cleanup on unmount
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
        await initializeCommentCounts(props.annotations as any);
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
      await initializeCommentCounts(newAnnotations as any);
    }
  },
  { deep: true }
);

// Drawing data management
const setDrawingData = (drawingData: any) => {
  newAnnotation.value.drawingData = drawingData;
  hasDrawingData.value = drawingData !== null;
};

// Watch for label changes to update annotation color
watch(
  () => newAnnotation.value.labels,
  () => {
    updateAnnotationColor();
  },
  { deep: true }
);

// Expose methods for parent component access
defineExpose({
  onDrawingCreated,
});
</script>

<template>
  <div class="h-full w-full bg-white overflow-y-auto overflow-x-hidden">
    <!-- Header -->
    <div
      class="sticky top-0 z-10 flex justify-between items-center p-2 border-b border-gray-200 bg-white"
    >
      <h3
        v-if="readOnly"
        class="text-sm font-medium text-gray-600"
      >
        Annotations (View Only)
      </h3>
      <h3
        v-else-if="!isAuthenticated"
        class="text-sm font-medium text-gray-600"
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
          class="flex items-center text-xs text-blue-600 ml-2"
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

      <div class="flex items-center space-x-2">
        <!-- Filter button -->
        <div class="relative">
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
            class="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
            @click.stop
          >
            <div class="p-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-medium text-gray-900">
                  Filter Annotations
                </h3>
                <button
                  class="text-gray-400 hover:text-gray-600"
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
                class="mt-3 pt-3 border-t border-gray-200"
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
    <div
      v-if="showAddForm && !readOnly"
      class="border-b border-gray-200 bg-gray-50"
    >
      <div
        class="flex justify-between items-center p-2 border-b border-gray-200"
      >
        <h4 class="text-sm font-medium text-gray-900">
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
            <label class="block text-sm font-medium text-gray-700 mb-1">Frame Position</label>
            <input
              v-if="newAnnotation"
              v-model.number="newAnnotation.frame"
              type="number"
              min="0"
              step="1"
              class="input"
              placeholder="Enter frame number"
            >
            <p class="text-xs text-gray-500 mt-1">
              @ {{ fps }}fps
            </p>
          </div>

          <!-- Dual Video Mode - Show both video frame positions -->
          <div
            v-else
            class="space-y-3"
          >
            <label class="block text-sm font-medium text-gray-700 mb-1">Frame Positions</label>

            <div class="grid grid-cols-2 gap-3">
              <!-- Video A Frame -->
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Video A Frame</label>
                <input
                  :value="videoACurrentFrame"
                  type="number"
                  min="0"
                  step="1"
                  class="input text-sm"
                  readonly
                  :title="`Video A is currently at frame ${videoACurrentFrame}`"
                >
                <p class="text-xs text-gray-500 mt-1">
                  @ {{ videoAFps }}fps
                </p>
              </div>

              <!-- Video B Frame -->
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Video B Frame</label>
                <input
                  :value="videoBCurrentFrame"
                  type="number"
                  min="0"
                  step="1"
                  class="input text-sm"
                  readonly
                  :title="`Video B is currently at frame ${videoBCurrentFrame}`"
                >
                <p class="text-xs text-gray-500 mt-1">
                  @ {{ videoBFps }}fps
                </p>
              </div>
            </div>

            <p class="text-xs text-gray-500">
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
              @manage-labels="openLabelManagement"
              @create-label="handleCreateLabel"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Content <span class="text-red-500">*</span></label>
            <textarea
              v-if="newAnnotation"
              v-model="newAnnotation.content"
              placeholder="Enter annotation content..."
              class="input resize-y min-h-[50px]"
              rows="2"
            />
          </div>

          <!-- Drawing Section -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="block text-sm font-medium text-gray-700">Drawing</label>
              <button
                type="button"
                :class="[
                  'px-2 py-1 rounded text-xs font-medium transition-colors',
                  showDrawingSection
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
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
              <div class="bg-gray-50 p-3 rounded-lg space-y-2">
                <!-- Stroke Width -->
                <div class="space-y-1">
                  <label class="text-xs text-gray-600">
                    Width: {{ drawingCanvas.currentTool.value.strokeWidth }}px
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    :value="drawingCanvas.currentTool.value.strokeWidth"
                    class="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    @input="
                      drawingCanvas.setStrokeWidth(
                        Number(($event.target as HTMLInputElement)?.value ?? 0)
                      )
                    "
                  >
                </div>

                <!-- Drawing Color Picker -->
                <div class="space-y-2">
                  <label class="text-xs text-gray-600">Drawing Color</label>

                  <!-- Custom Color Input -->
                  <div class="flex items-center space-x-2">
                    <input
                      type="color"
                      :value="getCurrentDrawingColor()"
                      class="w-8 h-6 rounded border border-gray-300 cursor-pointer"
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
                      class="text-xs text-blue-600 hover:text-blue-800"
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
                    class="flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    class="flex items-center text-xs text-green-600"
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
        class="text-center py-8 px-3 text-gray-500"
      >
        <svg
          class="w-10 h-10 mx-auto mb-3 text-gray-400"
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
        <p class="text-xs text-gray-400">
          Click "Add" to create your first annotation
        </p>
      </div>

      <!-- Annotations -->
      <div
        v-for="annotation in sortedAnnotations"
        v-else
        :key="annotation.id || Math.random().toString(36).slice(2)"
        class="card mb-2 p-2 transition-all duration-200 relative group"
        :class="{
          'bg-blue-50 border-blue-300 shadow-md ring-2 ring-blue-200 cursor-default':
            selectedAnnotation?.id === annotation.id,
          'bg-white cursor-pointer card-hover':
            selectedAnnotation?.id !== annotation.id,
        }"
        :style="{
          borderLeft: `4px solid ${getPrimaryLabelColor(annotation)}`,
        }"
        @click="selectAnnotation(annotation)"
      >
        <div class="flex justify-between items-center mb-1">
          <div class="flex items-center space-x-1.5 text-xs text-gray-600">
            <!-- Show primary label or annotation type -->
            <div class="flex items-center space-x-1">
              <div
                class="w-3 h-3 rounded-full border border-gray-300"
                :style="{ backgroundColor: getPrimaryLabelColor(annotation) }"
              />
              <span
                :class="{
                  'text-blue-700 font-medium':
                    selectedAnnotation?.id === annotation.id,
                }"
              >
                {{
                  getAnnotationLabels(annotation).length > 0
                    ? getAnnotationLabels(annotation)[0].name
                    : 'Annotation'
                }}
              </span>
            </div>

            <!-- Comment count indicator -->
            <div class="flex items-center space-x-1 ml-2 relative">
              <span
                class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                :title="`${getCommentCount(annotation)} comment${
                  getCommentCount(annotation) !== 1 ? 's' : ''
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
                {{ getCommentCount(annotation) || 0 }}
              </span>

              <!-- New comments indicator (always visible when there are new comments) -->
              <div
                v-if="hasNewComments(annotation.id)"
                class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"
                :title="`${getNewCommentCount(annotation.id)} new comment${
                  getNewCommentCount(annotation.id) > 1 ? 's' : ''
                }`"
              />

              <!-- Real-time activity indicator (when comments are expanded and no new comments) -->
              <div
                v-if="
                  !hasNewComments(annotation.id) &&
                    isCommentsExpanded(annotation.id)
                "
                class="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse"
                title="Real-time comments active"
              />
            </div>
          </div>
          <div
            class="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded flex flex-col items-center"
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

        <div>
          <div class="flex items-center space-x-1 mb-0.5">
            <!-- Drawing indicator -->
            <div
              v-if="
                annotation.annotationType === 'drawing' ||
                  annotation.drawingData
              "
              class="flex items-center space-x-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
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
            class="text-sm text-gray-600 mb-1 leading-snug"
          >
            {{ annotation.content }}
          </p>
        </div>

        <!-- Action buttons and comment toggle -->
        <div class="flex justify-between items-center mt-1">
          <!-- Comment toggle button (always visible) -->
          <button
            class="btn btn-ghost p-1 text-blue-600 hover:text-blue-700"
            :title="
              isCommentsExpanded(annotation.id)
                ? 'Hide comments'
                : 'Show comments'
            "
            @click.stop="toggleComments(annotation.id)"
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
              {{ isCommentsExpanded(annotation.id) ? 'Hide' : 'Comments' }}
            </span>
          </button>

          <!-- Edit/Delete buttons (only visible on hover and when not read-only) -->
          <div
            v-if="!readOnly"
            class="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            <button
              class="btn btn-ghost p-1"
              title="Edit annotation"
              @click.stop="startEditAnnotation(annotation)"
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
              @click.stop="deleteAnnotation(annotation)"
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
          v-show="isCommentsExpanded(annotation.id)"
          class="mt-2 border-t border-gray-200 pt-2"
        >
          <div @click.stop>
            <CommentSection
              :annotation-id="annotation.id"
              :current-user="user"
              :video-id="videoId"
              @comment-added="handleCommentAdded"
              @comment-updated="handleCommentUpdated"
              @comment-deleted="handleCommentDeleted"
            />
          </div>
        </div>

        <!-- Removed hidden CommentSection to fix component reference issues -->
      </div>
    </div>

    <!-- Panel Footer -->
    <div class="p-2 border-t border-gray-200 bg-gray-50">
      <div class="flex justify-between text-xs text-gray-500 font-mono">
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
          class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full"
        >
          <div class="bg-white relative">
            <button
              type="button"
              class="absolute top-4 right-4 z-10 bg-white rounded-md text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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

.btn {
  @apply inline-flex items-center justify-center rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none;
}

.btn-ghost {
  @apply hover:bg-gray-100 hover:text-gray-900;
}

.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700;
}

.btn-secondary {
  @apply bg-gray-200 text-gray-900 hover:bg-gray-300;
}

.icon {
  @apply w-4 h-4;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-sm {
  @apply w-3 h-3;
}

.card {
  @apply rounded-lg border border-gray-200 bg-white shadow-sm;
}

.card-hover {
  @apply hover:shadow-md transition-shadow duration-200;
}

.input {
  @apply flex h-10 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50;
}

.input::placeholder {
  color: #6b7280;
}

/* Comment toggle button styling */
.btn-ghost.text-blue-600 {
  @apply text-blue-600 hover:text-blue-700 hover:bg-blue-50;
}

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
