<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import CommentSection from './CommentSection.vue';
import AnnotationSkeleton from './AnnotationSkeleton.vue';
import { useAuth } from '../composables/useAuth';
import { useGlobalComments } from '../composables/useGlobalComments';

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

// Form state
const showAddForm = ref(false);
const editingAnnotation = ref(null);
const newAnnotation = ref({
  content: '',
  severity: 'medium',
  color: '#6b7280',
  frame: 0,
  annotationType: 'text', // 'text' or 'drawing'
  drawingData: null,
});

// Drawing state
const showDrawingSection = ref(false);
const hasDrawingData = ref(false);

// Editing state
const isEditing = ref(false);

// Comment state
const expandedComments = ref(new Set());
const commentCounts = ref(new Map());

// Annotation severity levels
const severityLevels = [
  { value: 'low', label: 'Low', color: '#34d399', icon: 'info' },
  {
    value: 'medium',
    label: 'Medium',
    color: '#fbbf24',
    icon: 'alert-triangle',
  },
  { value: 'high', label: 'High', color: '#ef4444', icon: 'alert-circle' },
];

// Severity colors mapping (same as drawing canvas)
const severityColors = {
  low: '#34d399', // green-400
  medium: '#fbbf24', // amber-400
  high: '#ef4444', // red-500
};

// Computed
const isSaveDisabled = computed(() => {
  if (!newAnnotation.value) return true;
  const hasContent = newAnnotation.value.content?.trim();
  const hasDrawing = hasDrawingData.value;
  return !hasContent && !hasDrawing;
});

const sortedAnnotations = computed(() => {
  return [...props.annotations].sort((a, b) => a.timestamp - b.timestamp);
});

// Stable loading state to prevent skeleton flickering
const shouldShowSkeleton = computed(() => {
  // Only show skeleton if loading AND we don't have any annotations yet
  // This prevents the skeleton from showing again after annotations are loaded
  return props.loading && props.annotations.length === 0;
});

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const formatFrame = (frameNumber) => {
  if (!frameNumber || isNaN(frameNumber)) return 'Frame 0';
  return `Frame ${frameNumber.toLocaleString()}`;
};

// Frame calculation utilities
const timeToFrame = (timeInSeconds) => {
  return Math.round(timeInSeconds * props.fps);
};

const getSeverityInfo = (severity) => {
  return severityLevels.find((s) => s.value === severity) || severityLevels[1]; // Default to medium
};

// Methods
const startAddAnnotation = () => {
  // emit('pause'); // This was the cause of the race condition
  newAnnotation.value = {
    content: '',
    severity: 'medium',
    color: '#fbbf24',
    frame: props.currentFrame,
    startFrame: props.currentFrame,
    endFrame: props.currentFrame,
    duration: 1 / props.fps,
    durationFrames: 1,
    annotationType: 'text',
    drawingData: null,
  };
  showAddForm.value = true;
  editingAnnotation.value = null;
  showDrawingSection.value = false;
  isEditing.value = false; // This is a new annotation, not editing

  // Check if there are existing drawings on the current frame
  const hasExistingDrawings = props.isDualMode
    ? props.drawingCanvasA?.hasDrawingsOnCurrentFrame() ||
      props.drawingCanvasB?.hasDrawingsOnCurrentFrame()
    : primaryDrawingCanvas.value?.hasDrawingsOnCurrentFrame();

  if (hasExistingDrawings) {
    // If there are existing drawings, preserve them and set hasDrawingData to true
    hasDrawingData.value = true;
  } else {
    // Only clear and reset if there are no existing drawings
    hasDrawingData.value = false;
    if (props.isDualMode) {
      // In dual mode, disable drawing on both canvases and clear existing drawings for new annotation
      if (props.drawingCanvasA) props.drawingCanvasA.disableDrawingMode();
      if (props.drawingCanvasB) props.drawingCanvasB.disableDrawingMode();
      // Clear drawings from both canvases to provide clean slate for new annotation
      if (props.drawingCanvasA)
        props.drawingCanvasA.clearCurrentFrameDrawings();
      if (props.drawingCanvasB)
        props.drawingCanvasB.clearCurrentFrameDrawings();
    } else {
      primaryDrawingCanvas.value.disableDrawingMode();
      // Clear drawings to provide clean slate for new annotation
      primaryDrawingCanvas.value.clearCurrentFrameDrawings();
    }
  }

  emit('form-show');
};

const startEditAnnotation = (annotation) => {
  // First navigate to the annotation's frame
  emit('pause');

  // Navigate to the annotation's frame
  const targetFrame =
    annotation.frame || Math.round(annotation.timestamp * props.fps);
  emit('seek-to-frame', targetFrame);

  // Emit annotation edit event to set context in dual video player
  emit('annotation-edit', annotation);

  newAnnotation.value = { ...annotation };
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
          props.drawingCanvasA.addDrawing(annotation.drawingData.drawingA);
        }
      }
      if (props.drawingCanvasB) {
        props.drawingCanvasB.clearCurrentFrameDrawings();
        if (annotation.drawingData?.drawingB) {
          props.drawingCanvasB.addDrawing(annotation.drawingData.drawingB);
        }
      }
    } else {
      primaryDrawingCanvas.value.clearCurrentFrameDrawings();
      primaryDrawingCanvas.value.addDrawing(annotation.drawingData);
    }
  } else {
    hasDrawingData.value = false;
    showDrawingSection.value = false;
  }

  emit('form-show');
};

const saveAnnotation = async () => {
  emit('pause'); // Pause the video when saving the annotation

  // Complete any active drawing session before saving
  if (props.isDualMode) {
    if (props.drawingCanvasARef)
      props.drawingCanvasARef.completeDrawingSession();
    if (props.drawingCanvasBRef)
      props.drawingCanvasBRef.completeDrawingSession();
  } else {
    if (props.drawingCanvasRef) {
      props.drawingCanvasRef.completeDrawingSession();
    }
  }

  // CRITICAL: Capture drawing data FIRST, before any clearing operations
  let currentDrawingData = newAnnotation.value.drawingData;

  // Always try to capture drawing data from the canvas, regardless of hasDrawingData flag
  if (!currentDrawingData) {
    if (props.isDualMode) {
      // In dual mode, capture from both canvas component refs
      const drawingA = props.drawingCanvasARef?.getCurrentDrawingSession();
      const drawingB = props.drawingCanvasBRef?.getCurrentDrawingSession();

      if (drawingA || drawingB) {
        currentDrawingData = {};
        if (drawingA) currentDrawingData.drawingA = drawingA;
        if (drawingB) currentDrawingData.drawingB = drawingB;
      }
    } else {
      // In single mode, capture from the single canvas component ref
      currentDrawingData = props.drawingCanvasRef?.getCurrentDrawingSession();
    }
  }

  // Update hasDrawingData flag based on actual drawing data found
  if (currentDrawingData && !hasDrawingData.value) {
    hasDrawingData.value = true;
  }

  const hasDrawing = hasDrawingData.value && !!currentDrawingData;
  const hasContent = newAnnotation.value?.content?.trim()?.length > 0;

  if (!hasContent && !hasDrawing) {
    return; // Nothing to save
  }

  // 2. Prepare annotation data
  const severityInfo = getSeverityInfo(
    newAnnotation.value?.severity || 'medium'
  );
  const title = hasContent
    ? newAnnotation.value.content.trim().substring(0, 50) +
      (newAnnotation.value.content.trim().length > 50 ? '...' : '')
    : 'Drawing Annotation';

  const annotationData = {
    ...(newAnnotation.value || {}),
    color: severityInfo.color,
    title,
    content: hasContent
      ? newAnnotation.value.content.trim()
      : 'Drawing annotation',
    frame: Math.max(0, newAnnotation.value.frame || 0), // Ensure frame is never negative
    startFrame: Math.max(0, newAnnotation.value.frame || 0), // Ensure startFrame is never negative
    timestamp: Math.max(
      0,
      (newAnnotation.value.frame || 0) / (props.fps || 30)
    ), // Ensure timestamp is never negative
    annotationType: hasDrawing ? 'drawing' : 'text',
    drawingData: hasDrawing ? currentDrawingData : null,
    // Ensure valid duration values to avoid constraint violations
    duration: Math.max(newAnnotation.value.duration || 1 / 30, 1 / 30),
    durationFrames: Math.max(newAnnotation.value.durationFrames || 1, 1),
    // For dual video mode, store both video frame numbers
    ...(props.isDualMode && {
      videoAFrame: Math.max(0, props.videoACurrentFrame || 0),
      videoBFrame: Math.max(0, props.videoBCurrentFrame || 0),
      videoATimestamp: Math.max(
        0,
        (props.videoACurrentFrame || 0) / (props.videoAFps || 30)
      ),
      videoBTimestamp: Math.max(
        0,
        (props.videoBCurrentFrame || 0) / (props.videoBFps || 30)
      ),
    }),
  };

  // 3. Emit event
  if (editingAnnotation.value) {
    emit('update-annotation', {
      ...annotationData,
      id: editingAnnotation.value.id,
    });
  } else {
    emit('add-annotation', annotationData);
  }

  // 4. Reset form state
  cancelForm();
};

const cancelForm = () => {
  showAddForm.value = false;
  editingAnnotation.value = null;
  showDrawingSection.value = false;
  hasDrawingData.value = false;
  isEditing.value = false; // Reset editing state

  // Reset newAnnotation to prevent null reference errors
  newAnnotation.value = {
    content: '',
    severity: 'medium',
    color: '#6b7280',
    frame: props.currentFrame || 0,
    annotationType: 'text',
    drawingData: null,
  };
  if (props.isDualMode) {
    // Complete any active drawing session before disabling
    if (props.dualVideoPlayer) {
      // Complete any active drawing session by calling the canvas completion method
      if (props.drawingCanvasA) props.drawingCanvasA.completeDrawingSession();
      if (props.drawingCanvasB) props.drawingCanvasB.completeDrawingSession();
    }

    // In dual mode, disable drawing on both canvases and clear drawings
    if (props.drawingCanvasA) props.drawingCanvasA.disableDrawingMode();
    if (props.drawingCanvasB) props.drawingCanvasB.disableDrawingMode();
    if (props.drawingCanvasA) props.drawingCanvasA.clearCurrentFrameDrawings();
    if (props.drawingCanvasB) props.drawingCanvasB.clearCurrentFrameDrawings();
  } else {
    // In single mode, complete drawing session for the primary canvas
    if (primaryDrawingCanvas.value) {
      primaryDrawingCanvas.value.completeDrawingSession();
    }

    primaryDrawingCanvas.value.disableDrawingMode();
    primaryDrawingCanvas.value.clearCurrentFrameDrawings();
  }
  newAnnotation.value = {
    content: '',
    severity: 'medium',
    color: '#fbbf24',
    frame: 0,
    startFrame: 0,
    endFrame: 0,
    duration: 1 / props.fps,
    durationFrames: 1,
    annotationType: 'text',
    drawingData: null,
  };

  // Clear annotation context by emitting annotation-edit with null
  emit('annotation-edit', null);
  emit('form-hide');
};

const deleteAnnotation = (annotation) => {
  emit('delete-annotation', annotation.id);
};

const selectAnnotation = (annotation) => {
  emit('select-annotation', annotation);
};

const onSeverityChange = () => {
  if (!newAnnotation.value) return;
  const severityInfo = getSeverityInfo(newAnnotation.value.severity);
  newAnnotation.value.color = severityInfo.color;
  // Update drawing canvas severity too
  if (props.isDualMode) {
    if (props.drawingCanvasA)
      props.drawingCanvasA.setSeverity(newAnnotation.value.severity);
    if (props.drawingCanvasB)
      props.drawingCanvasB.setSeverity(newAnnotation.value.severity);
  } else {
    primaryDrawingCanvas.value.setSeverity(newAnnotation.value.severity);
  }
};

// Drawing-related methods
const toggleDrawingSection = () => {
  showDrawingSection.value = !showDrawingSection.value;

  if (showDrawingSection.value) {
    if (props.isDualMode) {
      // In dual mode, enable drawing on both canvases
      if (props.drawingCanvasA) props.drawingCanvasA.enableDrawingMode();
      if (props.drawingCanvasB) props.drawingCanvasB.enableDrawingMode();
    } else {
      primaryDrawingCanvas.value.enableDrawingMode();
    }
  } else {
    if (props.isDualMode) {
      if (props.drawingCanvasA) props.drawingCanvasA.disableDrawingMode();
      if (props.drawingCanvasB) props.drawingCanvasB.disableDrawingMode();
    } else {
      primaryDrawingCanvas.value.disableDrawingMode();
    }
  }
};

const onDrawingCreated = (drawingData, videoContext = null) => {
  if (props.isDualMode) {
    // In dual mode, we need to handle drawings from both canvases
    if (!newAnnotation.value.drawingData) {
      newAnnotation.value.drawingData = {};
    }

    // Store drawing data based on video context
    if (videoContext === 'A') {
      newAnnotation.value.drawingData.drawingA = drawingData;
    } else if (videoContext === 'B') {
      newAnnotation.value.drawingData.drawingB = drawingData;
    } else {
      // If no context specified, treat as drawing A for backward compatibility
      newAnnotation.value.drawingData.drawingA = drawingData;
    }
  } else {
    // Single mode logic - always merge drawing paths for multiple shapes in one annotation
    if (newAnnotation.value.drawingData) {
      // Merge the paths from both drawings (whether editing existing or adding to new annotation)
      const existingDrawing = newAnnotation.value.drawingData;
      const mergedDrawing = {
        ...existingDrawing,
        paths: [...existingDrawing.paths, ...drawingData.paths],
        // Update canvas dimensions to current size
        canvasWidth: drawingData.canvasWidth,
        canvasHeight: drawingData.canvasHeight,
      };

      newAnnotation.value.drawingData = mergedDrawing;
    } else {
      // For the very first drawing in a new annotation, initialize with the drawing data
      newAnnotation.value.drawingData = drawingData;
    }
  }

  hasDrawingData.value = true;
  // Removed emit('drawing-created', drawingData) to prevent infinite loop
  // The AnnotationPanel should only receive drawing events, not emit them
};

const clearDrawing = () => {
  if (props.isDualMode) {
    if (props.drawingCanvasA) props.drawingCanvasA.clearCurrentFrameDrawings();
    if (props.drawingCanvasB) props.drawingCanvasB.clearCurrentFrameDrawings();
  } else {
    primaryDrawingCanvas.value.clearCurrentFrameDrawings();
  }
  newAnnotation.value.drawingData = null;
  hasDrawingData.value = false;
};

// Setup drawing canvas frame
onMounted(() => {
  if (props.isDualMode) {
    if (props.drawingCanvasA)
      props.drawingCanvasA.currentFrame.value = props.currentFrame;
    if (props.drawingCanvasB)
      props.drawingCanvasB.currentFrame.value = props.currentFrame;
  } else {
    primaryDrawingCanvas.value.currentFrame.value = props.currentFrame;
  }
});

// Watch for currentFrame changes and update the annotation form if it's open
watch(
  () => props.currentFrame,
  (newFrame) => {
    // Only update the frame in the form if the form is open and we're not editing an existing annotation
    if (showAddForm.value && !editingAnnotation.value) {
      // Ensure frame is never negative to avoid database constraint violations
      newAnnotation.value.frame = Math.max(0, newFrame || 0);
    }
  }
);

// Comment-related methods
const toggleComments = (annotationId) => {
  if (expandedComments.value.has(annotationId)) {
    expandedComments.value.delete(annotationId);
  } else {
    expandedComments.value.add(annotationId);
    // Mark comments as viewed when expanding
    markCommentsAsViewed(annotationId);
  }
};

const isCommentsExpanded = (annotationId) => {
  return expandedComments.value.has(annotationId);
};

const getCommentCount = (annotation) => {
  // Use global comment count if available, otherwise fall back to local tracking
  const globalCount = getTotalCommentCount(annotation.id);
  if (globalCount > 0) {
    return globalCount;
  }
  return annotation.commentCount || commentCounts.value.get(annotation.id) || 0;
};

const handleCommentAdded = (comment) => {
  // Update comment count for the annotation
  const currentCount = commentCounts.value.get(comment.annotationId) || 0;
  commentCounts.value.set(comment.annotationId, currentCount + 1);

  // Add visual indicator for new comment
  const annotation = props.annotations.find(
    (a) => a.id === comment.annotationId
  );
  if (annotation) {
    // Add a temporary highlight class or indicator
    setTimeout(() => {
      // Auto-expand comments if not already expanded
      if (!expandedComments.value.has(comment.annotationId)) {
        expandedComments.value.add(comment.annotationId);
      }
    }, 100);
  }

  // Emit to parent
  emit('comment-added', comment);
};

const handleCommentUpdated = (comment) => {
  // Emit to parent
  emit('comment-updated', comment);
};

const handleCommentDeleted = (comment) => {
  // Update comment count for the annotation
  const currentCount = commentCounts.value.get(comment.annotationId) || 0;
  commentCounts.value.set(comment.annotationId, Math.max(0, currentCount - 1));

  // Emit to parent
  emit('comment-deleted', comment);
};

// Setup global comment tracking
const setupGlobalCommentTracking = () => {
  if (props.videoId) {
    // Initialize comment counts for existing annotations
    initializeCommentCounts(props.annotations);

    // Setup global subscription (works for both authenticated and anonymous users)
    setupGlobalCommentSubscription(props.videoId, user.value?.id);

    // Listen for new comment events
    onNewComment((event) => {
      // The global comment system will handle the indicator automatically
    });
  }
};

// Watch for videoId changes to setup global tracking
watch(
  () => props.videoId,
  (newVideoId) => {
    if (newVideoId) {
      setupGlobalCommentTracking();
    } else {
      cleanupGlobalComments();
    }
  },
  { immediate: true }
);

// Watch for user changes to update the subscription with user ID
watch(user, (newUser) => {
  if (props.videoId) {
    // Re-setup subscription with updated user ID
    cleanupGlobalComments();
    setupGlobalCommentTracking();
  }
});

// Watch for annotations changes to update comment counts
watch(
  () => props.annotations,
  (newAnnotations) => {
    if (newAnnotations && newAnnotations.length > 0) {
      initializeCommentCounts(newAnnotations);
    }
  },
  { immediate: true }
);

// Cleanup on unmount
onUnmounted(() => {
  cleanupGlobalComments();
});

// Missing methods that are called from App.vue
const setDrawingData = (drawingData) => {
  if (!drawingData) return;

  // Set the drawing data for the current annotation
  if (newAnnotation.value) {
    newAnnotation.value.drawingData = drawingData;
    hasDrawingData.value = true;

    // If we're in dual mode, handle both canvas drawings
    if (props.isDualMode) {
      if (drawingData.drawingA && props.drawingCanvasA) {
        props.drawingCanvasA.addDrawing(drawingData.drawingA);
      }
      if (drawingData.drawingB && props.drawingCanvasB) {
        props.drawingCanvasB.addDrawing(drawingData.drawingB);
      }
    } else {
      // Single mode - add drawing to primary canvas
      if (primaryDrawingCanvas.value) {
        primaryDrawingCanvas.value.addDrawing(drawingData);
      }
    }
  }
};

const clearDrawingData = () => {
  // Clear the drawing data from the current annotation
  if (newAnnotation.value) {
    newAnnotation.value.drawingData = null;
    hasDrawingData.value = false;
  }

  // Clear drawings from canvas(es)
  if (props.isDualMode) {
    if (props.drawingCanvasA) props.drawingCanvasA.clearCurrentFrameDrawings();
    if (props.drawingCanvasB) props.drawingCanvasB.clearCurrentFrameDrawings();
  } else {
    if (primaryDrawingCanvas.value) {
      primaryDrawingCanvas.value.clearCurrentFrameDrawings();
    }
  }
};

// Expose methods to parent component
defineExpose({
  startAddAnnotation,
  cancelForm,
  onDrawingCreated,
  toggleComments,
  setDrawingData,
  clearDrawingData,
  isEditing,
});
</script>
<template>
  <div class="h-full w-full bg-white overflow-y-auto overflow-x-hidden">
    <!-- Header -->
    <div
      class="sticky top-0 z-10 flex justify-between items-center p-2 border-b border-gray-200 bg-white"
    >
      <h3 v-if="readOnly" class="text-sm font-medium text-gray-600">
        Annotations (View Only)
      </h3>
      <h3
        v-else-if="!isAuthenticated"
        class="text-sm font-medium text-gray-600"
      >
        Annotations (Comments Enabled)
      </h3>
      <div v-else class="flex-1"></div>
      <button
        v-if="!readOnly && isAuthenticated"
        class="btn btn-primary flex items-center space-x-1"
        @click="startAddAnnotation"
        title="Add new annotation"
      >
        <svg class="icon icon-sm" viewBox="0 0 24 24">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>Add</span>
      </button>
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
        <button class="btn btn-ghost p-1" @click="cancelForm">
          <svg class="icon icon-sm" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="p-3">
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Severity</label
            >
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="severity in severityLevels"
                :key="severity.value"
                type="button"
                @click="
                  if (newAnnotation) {
                    newAnnotation.severity = severity.value;
                    onSeverityChange();
                  }
                "
                :class="[
                  'flex items-center justify-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors border',
                  newAnnotation?.severity === severity.value
                    ? 'border-gray-400 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300',
                ]"
                :style="{
                  backgroundColor:
                    newAnnotation.severity === severity.value
                      ? severity.color + '20'
                      : 'white',
                  color:
                    newAnnotation.severity === severity.value
                      ? severity.color
                      : '#374151',
                  borderColor:
                    newAnnotation.severity === severity.value
                      ? severity.color
                      : '#d1d5db',
                }"
              >
                <div
                  class="w-3 h-3 rounded-full"
                  :style="{ backgroundColor: severity.color }"
                ></div>
                <span>{{ severity.label }}</span>
              </button>
            </div>
          </div>

          <!-- Frame Position - Different UI for dual vs single mode -->
          <div v-if="!isDualMode">
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Frame Position</label
            >
            <input
              v-model.number="newAnnotation.frame"
              type="number"
              v-if="newAnnotation"
              min="0"
              step="1"
              class="input"
              placeholder="Enter frame number"
            />
            <p class="text-xs text-gray-500 mt-1">@ {{ fps }}fps</p>
          </div>

          <!-- Dual Video Mode - Show both video frame positions -->
          <div v-else class="space-y-3">
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Frame Positions</label
            >

            <div class="grid grid-cols-2 gap-3">
              <!-- Video A Frame -->
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1"
                  >Video A Frame</label
                >
                <input
                  :value="videoACurrentFrame"
                  type="number"
                  min="0"
                  step="1"
                  class="input text-sm"
                  readonly
                  :title="`Video A is currently at frame ${videoACurrentFrame}`"
                />
                <p class="text-xs text-gray-500 mt-1">@ {{ videoAFps }}fps</p>
              </div>

              <!-- Video B Frame -->
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1"
                  >Video B Frame</label
                >
                <input
                  :value="videoBCurrentFrame"
                  type="number"
                  min="0"
                  step="1"
                  class="input text-sm"
                  readonly
                  :title="`Video B is currently at frame ${videoBCurrentFrame}`"
                />
                <p class="text-xs text-gray-500 mt-1">@ {{ videoBFps }}fps</p>
              </div>
            </div>

            <p class="text-xs text-gray-500">
              Annotation will be saved with both video positions shown above
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Content <span class="text-red-500">*</span></label
            >
            <textarea
              v-if="newAnnotation"
              v-model="newAnnotation.content"
              placeholder="Enter annotation content..."
              class="input resize-y min-h-[50px]"
              rows="2"
            ></textarea>
          </div>

          <!-- Drawing Section -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="block text-sm font-medium text-gray-700"
                >Drawing</label
              >
              <button
                type="button"
                @click="toggleDrawingSection"
                :class="[
                  'px-2 py-1 rounded text-xs font-medium transition-colors',
                  showDrawingSection
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                ]"
              >
                {{ showDrawingSection ? 'Hide' : 'Add Drawing' }}
              </button>
            </div>

            <!-- Drawing Tools and Canvas -->
            <div v-if="showDrawingSection" class="space-y-3">
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
                    @input="
                      drawingCanvas.setStrokeWidth(
                        parseInt($event.target.value)
                      )
                    "
                    class="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <!-- Drawing Color Preview -->
                <div class="flex items-center space-x-2 text-xs text-gray-600">
                  <span>Drawing color:</span>
                  <div
                    class="w-4 h-4 rounded-full border border-gray-300"
                    :style="{
                      backgroundColor: severityColors[newAnnotation.severity],
                    }"
                  ></div>
                  <span class="capitalize">{{ newAnnotation.severity }}</span>
                </div>

                <!-- Clear Drawing Button -->
                <div class="flex space-x-2">
                  <button
                    type="button"
                    @click="clearDrawing"
                    :disabled="!hasDrawingData"
                    class="flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
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
              @click="saveAnnotation"
              :disabled="isSaveDisabled"
            >
              {{ editingAnnotation ? 'Update' : 'Save' }}
            </button>
            <button class="btn btn-secondary flex-1" @click="cancelForm">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Annotations List -->
    <div class="p-2">
      <!-- Loading Skeleton -->
      <AnnotationSkeleton v-if="shouldShowSkeleton" :skeleton-count="3" />

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
          ></path>
          <polyline points="14,2 14,8 20,8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10,9 9,9 8,9"></polyline>
        </svg>
        <p class="text-sm mb-1">No annotations yet</p>
        <p class="text-xs text-gray-400">
          Click "Add" to create your first annotation
        </p>
      </div>

      <!-- Annotations -->
      <div
        v-else
        v-for="annotation in sortedAnnotations"
        :key="annotation.id"
        class="card card-hover mb-2 p-2 cursor-pointer transition-all duration-200 relative group"
        :class="{
          'bg-blue-50 border-blue-300 shadow-md ring-2 ring-blue-200':
            selectedAnnotation?.id === annotation.id,
          'bg-white': selectedAnnotation?.id !== annotation.id,
        }"
        :style="{
          borderLeft: `4px solid ${getSeverityInfo(annotation.severity).color}`,
        }"
        @click="selectAnnotation(annotation)"
      >
        <div class="flex justify-between items-center mb-1">
          <div class="flex items-center space-x-1.5 text-xs text-gray-600">
            <svg
              class="icon icon-sm"
              viewBox="0 0 24 24"
              v-if="getSeverityInfo(annotation.severity).icon === 'info'"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <svg
              class="icon icon-sm"
              viewBox="0 0 24 24"
              v-else-if="
                getSeverityInfo(annotation.severity).icon === 'alert-triangle'
              "
            >
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              ></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <svg
              class="icon icon-sm"
              viewBox="0 0 24 24"
              v-else-if="
                getSeverityInfo(annotation.severity).icon === 'alert-circle'
              "
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>

            <span
              :class="{
                'text-blue-700 font-medium':
                  selectedAnnotation?.id === annotation.id,
              }"
            >
              {{ getSeverityInfo(annotation.severity).label }}
            </span>

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
              ></div>

              <!-- Real-time activity indicator (when comments are expanded) -->
              <div
                v-else-if="isCommentsExpanded(annotation.id)"
                class="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse"
                title="Real-time comments active"
              ></div>
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
            <span v-else class="text-xs opacity-75">{{
              annotation.frame !== undefined
                ? formatFrame(annotation.frame)
                : formatFrame(timeToFrame(annotation.timestamp))
            }}</span>
          </div>
        </div>

        <div>
          <div class="flex items-center space-x-1 mb-0.5">
            <h4
              class="text-sm font-medium leading-tight"
              :class="{
                'text-blue-900': selectedAnnotation?.id === annotation.id,
                'text-gray-900': selectedAnnotation?.id !== annotation.id,
              }"
            >
              {{ annotation.title }}
            </h4>
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
            v-if="annotation.content"
            class="text-xs text-gray-600 mb-1 leading-snug"
          >
            {{ annotation.content }}
          </p>
        </div>

        <!-- Action buttons and comment toggle -->
        <div class="flex justify-between items-center mt-1">
          <!-- Comment toggle button (always visible) -->
          <button
            class="btn btn-ghost p-1 text-blue-600 hover:text-blue-700"
            @click.stop="toggleComments(annotation.id)"
            :title="
              isCommentsExpanded(annotation.id)
                ? 'Hide comments'
                : 'Show comments'
            "
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
              ></path>
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
              @click.stop="startEditAnnotation(annotation)"
              title="Edit annotation"
            >
              <svg class="icon icon-sm" viewBox="0 0 24 24">
                <path
                  d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                ></path>
                <path
                  d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                ></path>
              </svg>
            </button>
            <button
              class="btn btn-ghost p-1 text-red-600 hover:text-red-700"
              @click.stop="deleteAnnotation(annotation)"
              title="Delete annotation"
            >
              <svg class="icon icon-sm" viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                ></path>
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
        <div v-if="!isDualMode" class="flex flex-col items-end">
          <span>{{ formatTime(currentTime) }}</span>
          <span class="opacity-75">{{ formatFrame(currentFrame) }}</span>
        </div>

        <!-- Dual Video Mode -->
        <div v-else class="flex flex-col items-end space-y-1">
          <div class="flex space-x-3">
            <div class="text-right">
              <div class="text-blue-600">Video A</div>
              <div class="opacity-75">
                {{ formatFrame(videoACurrentFrame) }}
              </div>
            </div>
            <div class="text-right">
              <div class="text-green-600">Video B</div>
              <div class="opacity-75">
                {{ formatFrame(videoBCurrentFrame) }}
              </div>
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
