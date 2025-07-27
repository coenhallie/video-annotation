<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import CommentSection from './CommentSection.vue';
import CommentItem from './CommentItem.vue';
import CommentForm from './CommentForm.vue';
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
    required: true,
  },
  readOnly: {
    type: Boolean,
    default: false,
  },
  videoId: {
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
  const hasContent = newAnnotation.value.content.trim();
  const hasDrawing = hasDrawingData.value && newAnnotation.value.drawingData;
  return !hasContent && !hasDrawing;
});

const sortedAnnotations = computed(() => {
  return [...props.annotations].sort((a, b) => a.timestamp - b.timestamp);
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

const frameToTime = (frameNumber) => {
  return frameNumber / props.fps;
};

const getSeverityInfo = (severity) => {
  return severityLevels.find((s) => s.value === severity) || severityLevels[1]; // Default to medium
};

// Methods
const startAddAnnotation = () => {
  emit('pause');
  newAnnotation.value = {
    content: '',
    severity: 'medium',
    color: '#fbbf24',
    frame: props.currentFrame,
    annotationType: 'text',
    drawingData: null,
  };
  showAddForm.value = true;
  editingAnnotation.value = null;
  showDrawingSection.value = false;
  hasDrawingData.value = false;
  if (props.isDualMode) {
    // In dual mode, disable drawing on both canvases and clear existing drawings for new annotation
    if (props.drawingCanvasA) props.drawingCanvasA.disableDrawingMode();
    if (props.drawingCanvasB) props.drawingCanvasB.disableDrawingMode();
    // Clear drawings from both canvases to provide clean slate for new annotation
    if (props.drawingCanvasA) props.drawingCanvasA.clearCurrentFrameDrawings();
    if (props.drawingCanvasB) props.drawingCanvasB.clearCurrentFrameDrawings();
  } else {
    primaryDrawingCanvas.value.disableDrawingMode();
    // Clear drawings to provide clean slate for new annotation
    primaryDrawingCanvas.value.clearCurrentFrameDrawings();
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
  console.log('🔍 [DEBUG] AnnotationPanel.saveAnnotation called');
  console.log('🔍 [DEBUG] Props received:', {
    isDualMode: props.isDualMode,
    dualVideoPlayer: !!props.dualVideoPlayer,
    drawingCanvasA: !!props.drawingCanvasA,
    drawingCanvasB: !!props.drawingCanvasB,
    currentFrame: props.currentFrame,
    fps: props.fps,
  });
  console.log('🔍 [DEBUG] Current state:', {
    newAnnotation: newAnnotation.value,
    editingAnnotation: editingAnnotation.value,
    hasDrawingData: hasDrawingData.value,
    showDrawingSection: showDrawingSection.value,
  });

  // Check if we have either content or drawing data
  const hasContent = newAnnotation.value.content.trim();
  const hasDrawing = hasDrawingData.value && newAnnotation.value.drawingData;

  console.log('🔍 [DEBUG] Content validation:', {
    hasContent: !!hasContent,
    hasDrawing: hasDrawing,
    contentLength: newAnnotation.value.content.trim().length,
    drawingDataExists: !!newAnnotation.value.drawingData,
  });

  if (!hasContent && !hasDrawing) {
    console.log('❌ [DEBUG] No content or drawing data, returning early');
    return;
  }

  const severityInfo = getSeverityInfo(newAnnotation.value.severity);

  // Generate title based on content type
  let title = '';
  if (hasContent) {
    title =
      newAnnotation.value.content.trim().substring(0, 50) +
      (newAnnotation.value.content.trim().length > 50 ? '...' : '');
  } else {
    title = 'Drawing Annotation';
  }

  const annotationData = {
    ...newAnnotation.value,
    color: severityInfo.color,
    title,
    content: newAnnotation.value.content.trim() || 'Drawing annotation',
    frame: newAnnotation.value.frame,
    timestamp: newAnnotation.value.frame / props.fps,
    annotationType: hasDrawing ? 'drawing' : 'text',
    drawingData: hasDrawing ? newAnnotation.value.drawingData : null,
  };

  console.log('🔍 [DEBUG] Prepared annotationData:', {
    annotationData: annotationData,
    hasDrawingData: !!annotationData.drawingData,
    drawingDataKeys: annotationData.drawingData
      ? Object.keys(annotationData.drawingData)
      : null,
  });

  // Check if we're in dual mode and have an annotation context for updating
  const isDualModeUpdate =
    props.isDualMode &&
    props.dualVideoPlayer &&
    editingAnnotation.value &&
    props.dualVideoPlayer.currentAnnotationContext?.value;

  console.log('🔍 [DEBUG] Update path decision:', {
    isDualMode: props.isDualMode,
    hasDualVideoPlayer: !!props.dualVideoPlayer,
    isEditing: !!editingAnnotation.value,
    hasAnnotationContext:
      !!props.dualVideoPlayer?.currentAnnotationContext?.value,
    willUseDualModeUpdate: isDualModeUpdate,
    currentContextId:
      props.dualVideoPlayer?.currentAnnotationContext?.value?.id,
  });

  if (isDualModeUpdate) {
    console.log('🔍 [DEBUG] ENTERING dual video player update path');
    console.log('🔍 [DEBUG] Current annotation context before update:', {
      context: props.dualVideoPlayer.currentAnnotationContext.value,
      contextId: props.dualVideoPlayer.currentAnnotationContext.value?.id,
    });

    try {
      // Update the annotation context with the new data
      const updatedContext = {
        ...props.dualVideoPlayer.currentAnnotationContext.value,
        ...annotationData,
      };

      console.log('🔍 [DEBUG] Setting updated context:', {
        originalContext: props.dualVideoPlayer.currentAnnotationContext.value,
        annotationData: annotationData,
        mergedContext: updatedContext,
      });

      props.dualVideoPlayer.setCurrentAnnotationContext(updatedContext);

      console.log('🔍 [DEBUG] About to call updateAnnotationWithDrawing');

      // Get drawing data from both canvases
      const drawingDataA = props.drawingCanvasA
        ? props.drawingCanvasA.getCurrentFrameDrawing()
        : null;
      const drawingDataB = props.drawingCanvasB
        ? props.drawingCanvasB.getCurrentFrameDrawing()
        : null;

      console.log('🔍 [DEBUG] Retrieved drawing data for update:', {
        drawingDataA: drawingDataA,
        drawingDataB: drawingDataB,
        hasDrawingA: !!drawingDataA,
        hasDrawingB: !!drawingDataB,
      });

      // CANVAS STATE TRACKING: Log canvas state before save
      console.log('🎨 [CANVAS-STATE] Canvas state BEFORE save operation:', {
        canvasAHasDrawings: props.drawingCanvasA
          ? props.drawingCanvasA.hasDrawingsOnCurrentFrame()
          : false,
        canvasBHasDrawings: props.drawingCanvasB
          ? props.drawingCanvasB.hasDrawingsOnCurrentFrame()
          : false,
        canvasADrawingCount: drawingDataA?.paths?.length || 0,
        canvasBDrawingCount: drawingDataB?.paths?.length || 0,
        currentFrame: props.currentFrame,
        timestamp: Date.now(),
      });

      // Use the dual video player's update method with drawing data
      const result = await props.dualVideoPlayer.updateAnnotationWithDrawing(
        drawingDataA,
        drawingDataB
      );

      console.log('🔍 [DEBUG] updateAnnotationWithDrawing completed:', {
        result: result,
        success: !!result,
      });

      // CANVAS STATE TRACKING: Log canvas state immediately after save
      console.log(
        '🎨 [CANVAS-STATE] Canvas state IMMEDIATELY AFTER save operation:',
        {
          canvasAHasDrawings: props.drawingCanvasA
            ? props.drawingCanvasA.hasDrawingsOnCurrentFrame()
            : false,
          canvasBHasDrawings: props.drawingCanvasB
            ? props.drawingCanvasB.hasDrawingsOnCurrentFrame()
            : false,
          canvasAVisible: props.drawingCanvasA
            ? props.drawingCanvasA.isDrawingMode
            : false,
          canvasBVisible: props.drawingCanvasB
            ? props.drawingCanvasB.isDrawingMode
            : false,
          currentFrame: props.currentFrame,
          timestamp: Date.now(),
        }
      );
    } catch (error) {
      console.error('🔍 [DEBUG] Error in dual video player update path:', {
        error: error,
        errorMessage: error.message,
        errorStack: error.stack,
      });
      // Fall back to regular update method
      console.log('🔍 [DEBUG] Falling back to regular update method');
      emit('update-annotation', {
        ...annotationData,
        id: editingAnnotation.value.id,
      });
    }
  } else if (editingAnnotation.value) {
    console.log(
      '🔍 [DEBUG] ENTERING regular update path - emitting update-annotation'
    );
    emit('update-annotation', {
      ...annotationData,
      id: editingAnnotation.value.id,
    });
  } else {
    console.log(
      '🔍 [DEBUG] ENTERING add new annotation path - emitting add-annotation'
    );
    emit('add-annotation', annotationData);
  }

  // Always close the drawing section when saving/updating
  showDrawingSection.value = false;

  // Don't clear context immediately if we have drawing data and are editing
  // The context will be cleared after drawing processing is complete
  if (editingAnnotation.value && hasDrawingData.value) {
    console.log('🔍 [DEBUG] Handling post-save cleanup for drawing annotation');

    // CANVAS STATE TRACKING: Log canvas state during cleanup
    console.log(
      '🎨 [CANVAS-STATE] Canvas state DURING cleanup (before disabling drawing mode):',
      {
        canvasAHasDrawings: props.drawingCanvasA
          ? props.drawingCanvasA.hasDrawingsOnCurrentFrame()
          : false,
        canvasBHasDrawings: props.drawingCanvasB
          ? props.drawingCanvasB.hasDrawingsOnCurrentFrame()
          : false,
        canvasADrawingMode: props.drawingCanvasA
          ? props.drawingCanvasA.isDrawingMode
          : false,
        canvasBDrawingMode: props.drawingCanvasB
          ? props.drawingCanvasB.isDrawingMode
          : false,
        currentFrame: props.currentFrame,
        timestamp: Date.now(),
      }
    );

    // For drawing annotations in dual mode, preserve the drawings after save
    console.log(
      '🔍 [DEBUG] Handling post-save cleanup for drawing annotation in dual mode'
    );

    // Use the preserving cleanup method
    cancelFormButPreserveDrawings();

    // DRAWING PERSISTENCE FIX: Do NOT clear annotation context after saving
    // when we have drawing data, as this causes drawings to disappear
    setTimeout(() => {
      console.log(
        '🔍 [DEBUG] Post-save cleanup completed - drawings preserved'
      );

      // CANVAS STATE TRACKING: Log final canvas state after timeout
      console.log(
        '🎨 [CANVAS-STATE] Canvas state AFTER timeout (final state):',
        {
          canvasAHasDrawings: props.drawingCanvasA
            ? props.drawingCanvasA.hasDrawingsOnCurrentFrame()
            : false,
          canvasBHasDrawings: props.drawingCanvasB
            ? props.drawingCanvasB.hasDrawingsOnCurrentFrame()
            : false,
          currentFrame: props.currentFrame,
          timestamp: Date.now(),
        }
      );

      // DO NOT emit annotation-edit with null here as it clears the context
      // and causes drawings to disappear. The context will be cleared when
      // the user clicks elsewhere or starts a new annotation.
      console.log(
        '🎨 [DRAWING-PERSISTENCE] Skipping context clear to preserve drawings'
      );
    }, 100);
  } else {
    console.log(
      '🔍 [DEBUG] Normal cleanup flow - determining cleanup strategy'
    );

    // Check if this is a successful save in dual-video mode with drawings
    // DRAWING PERSISTENCE FIX: Preserve drawings for BOTH new and edited annotations
    const isSuccessfulSaveWithDrawings =
      props.isDualMode && hasDrawingData.value;

    console.log('🔍 [DEBUG] Cleanup strategy decision:', {
      isDualMode: props.isDualMode,
      isEditing: !!editingAnnotation.value,
      hasDrawingData: hasDrawingData.value,
      willPreserveDrawings: isSuccessfulSaveWithDrawings,
    });

    if (isSuccessfulSaveWithDrawings) {
      console.log(
        '🔍 [DEBUG] Successful save with drawings in dual mode - preserving drawings'
      );
      cancelFormButPreserveDrawings();
    } else {
      console.log('🔍 [DEBUG] Normal cleanup - clearing drawings');
      cancelForm();
    }
  }
};

const cancelForm = () => {
  console.log(
    '🔍 [DEBUG] cancelForm called - clearing drawings and form state'
  );

  showAddForm.value = false;
  editingAnnotation.value = null;
  showDrawingSection.value = false;
  hasDrawingData.value = false;
  if (props.isDualMode) {
    // In dual mode, disable drawing on both canvases and clear drawings
    if (props.drawingCanvasA) props.drawingCanvasA.disableDrawingMode();
    if (props.drawingCanvasB) props.drawingCanvasB.disableDrawingMode();
    if (props.drawingCanvasA) props.drawingCanvasA.clearCurrentFrameDrawings();
    if (props.drawingCanvasB) props.drawingCanvasB.clearCurrentFrameDrawings();
  } else {
    primaryDrawingCanvas.value.disableDrawingMode();
    primaryDrawingCanvas.value.clearCurrentFrameDrawings();
  }
  newAnnotation.value = {
    content: '',
    severity: 'medium',
    color: '#fbbf24',
    frame: 0,
    annotationType: 'text',
    drawingData: null,
  };

  // Clear annotation context by emitting annotation-edit with null
  emit('annotation-edit', null);
  emit('form-hide');
};

const cancelFormButPreserveDrawings = () => {
  console.log(
    '🔍 [DEBUG] cancelFormButPreserveDrawings called - preserving canvas drawings'
  );

  // CANVAS STATE TRACKING: Log canvas state before cleanup
  console.log('🎨 [CANVAS-STATE] Canvas state BEFORE preserving cleanup:', {
    canvasAHasDrawings: props.drawingCanvasA
      ? props.drawingCanvasA.hasDrawingsOnCurrentFrame()
      : false,
    canvasBHasDrawings: props.drawingCanvasB
      ? props.drawingCanvasB.hasDrawingsOnCurrentFrame()
      : false,
    currentFrame: props.currentFrame,
    timestamp: Date.now(),
  });

  // Close form and reset form state
  showAddForm.value = false;
  editingAnnotation.value = null;
  showDrawingSection.value = false;
  hasDrawingData.value = false;

  // Disable drawing mode but DO NOT clear the drawings
  if (props.isDualMode) {
    if (props.drawingCanvasA) props.drawingCanvasA.disableDrawingMode();
    if (props.drawingCanvasB) props.drawingCanvasB.disableDrawingMode();
    // NOTE: We intentionally do NOT call clearCurrentFrameDrawings() here
  } else {
    primaryDrawingCanvas.value.disableDrawingMode();
    // NOTE: We intentionally do NOT call clearCurrentFrameDrawings() here
  }

  // Reset form data
  newAnnotation.value = {
    content: '',
    severity: 'medium',
    color: '#fbbf24',
    frame: 0,
    annotationType: 'text',
    drawingData: null,
  };

  // Clear annotation context by emitting annotation-edit with null
  emit('annotation-edit', null);
  emit('form-hide');

  // CANVAS STATE TRACKING: Log canvas state after cleanup
  console.log('🎨 [CANVAS-STATE] Canvas state AFTER preserving cleanup:', {
    canvasAHasDrawings: props.drawingCanvasA
      ? props.drawingCanvasA.hasDrawingsOnCurrentFrame()
      : false,
    canvasBHasDrawings: props.drawingCanvasB
      ? props.drawingCanvasB.hasDrawingsOnCurrentFrame()
      : false,
    currentFrame: props.currentFrame,
    timestamp: Date.now(),
  });
};

const reloadDrawingsFromAnnotation = (annotation) => {
  console.log(
    '🔍 [DEBUG] reloadDrawingsFromAnnotation called with:',
    annotation
  );

  if (!annotation || !annotation.drawingData) {
    console.log('🔍 [DEBUG] No drawing data to reload');
    return;
  }

  if (props.isDualMode) {
    // In dual mode, reload drawing data to both canvases if it exists
    if (props.drawingCanvasA && annotation.drawingData?.drawingA) {
      console.log('🔍 [DEBUG] Reloading drawing A to canvas');
      props.drawingCanvasA.addDrawing(annotation.drawingData.drawingA);
    }
    if (props.drawingCanvasB && annotation.drawingData?.drawingB) {
      console.log('🔍 [DEBUG] Reloading drawing B to canvas');
      props.drawingCanvasB.addDrawing(annotation.drawingData.drawingB);
    }
  } else {
    console.log('🔍 [DEBUG] Reloading drawing to primary canvas');
    primaryDrawingCanvas.value.addDrawing(annotation.drawingData);
  }

  // CANVAS STATE TRACKING: Log canvas state after reloading
  console.log('🎨 [CANVAS-STATE] Canvas state AFTER reloading drawings:', {
    canvasAHasDrawings: props.drawingCanvasA
      ? props.drawingCanvasA.hasDrawingsOnCurrentFrame()
      : false,
    canvasBHasDrawings: props.drawingCanvasB
      ? props.drawingCanvasB.hasDrawingsOnCurrentFrame()
      : false,
    currentFrame: props.currentFrame,
    timestamp: Date.now(),
  });
};

const deleteAnnotation = (annotation) => {
  emit('delete-annotation', annotation.id);
};

const selectAnnotation = (annotation) => {
  emit('select-annotation', annotation);
};

const onSeverityChange = () => {
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
      newAnnotation.value.frame = newFrame;
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
  return (
    annotation.comment_count || commentCounts.value.get(annotation.id) || 0
  );
};

const handleCommentAdded = (comment) => {
  // Update comment count for the annotation
  const currentCount = commentCounts.value.get(comment.annotation_id) || 0;
  commentCounts.value.set(comment.annotation_id, currentCount + 1);

  // Add visual indicator for new comment
  const annotation = props.annotations.find(
    (a) => a.id === comment.annotation_id
  );
  if (annotation) {
    // Add a temporary highlight class or indicator
    setTimeout(() => {
      // Auto-expand comments if not already expanded
      if (!expandedComments.value.has(comment.annotation_id)) {
        expandedComments.value.add(comment.annotation_id);
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
  const currentCount = commentCounts.value.get(comment.annotation_id) || 0;
  commentCounts.value.set(comment.annotation_id, Math.max(0, currentCount - 1));

  // Emit to parent
  emit('comment-deleted', comment);
};

// Setup global comment tracking
const setupGlobalCommentTracking = () => {
  if (props.videoId) {
    console.log(
      '🔄 [AnnotationPanel] Setting up global comment tracking for video:',
      props.videoId
    );

    // Initialize comment counts for existing annotations
    initializeCommentCounts(props.annotations);

    // Setup global subscription (works for both authenticated and anonymous users)
    setupGlobalCommentSubscription(props.videoId, user.value?.id);

    // Listen for new comment events
    onNewComment((event) => {
      console.log('📥 [AnnotationPanel] New comment event received:', event);
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

// Expose methods to parent component
defineExpose({
  startAddAnnotation,
  cancelForm,
  onDrawingCreated,
  toggleComments,
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
        Annotations (Login to Create)
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
                  newAnnotation.severity = severity.value;
                  onSeverityChange();
                "
                :class="[
                  'flex items-center justify-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors border',
                  newAnnotation.severity === severity.value
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

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Frame Position</label
            >
            <input
              v-model.number="newAnnotation.frame"
              type="number"
              min="0"
              step="1"
              class="input"
              placeholder="Enter frame number"
            />
            <p class="text-xs text-gray-500 mt-1">@ {{ fps }}fps</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Content <span class="text-red-500">*</span></label
            >
            <textarea
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
                    Drawing added
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
      <div
        v-if="sortedAnnotations.length === 0"
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

      <div
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
            <div
              v-if="getCommentCount(annotation) > 0"
              class="flex items-center space-x-1 ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs relative"
            >
              <svg
                class="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                ></path>
              </svg>
              <span>{{ getCommentCount(annotation) }}</span>

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
            <!-- Show timestamp and frame for single-point annotations -->
            <span>{{ formatTime(annotation.timestamp) }}</span>
            <span class="text-xs opacity-75">{{
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
          <CommentSection
            :annotation-id="annotation.id"
            :read-only="readOnly"
            :current-user="user"
            :video-id="videoId"
            @comment-added="handleCommentAdded"
            @comment-updated="handleCommentUpdated"
            @comment-deleted="handleCommentDeleted"
          />
        </div>

        <!-- Hidden Comment Section for real-time subscriptions when not expanded -->
        <CommentSection
          v-if="!isCommentsExpanded(annotation.id)"
          v-show="false"
          :annotation-id="annotation.id"
          :read-only="true"
          :current-user="user"
          :video-id="videoId"
          @comment-added="handleCommentAdded"
          @comment-updated="handleCommentUpdated"
          @comment-deleted="handleCommentDeleted"
        />
      </div>
    </div>

    <!-- Panel Footer -->
    <div class="p-2 border-t border-gray-200 bg-gray-50">
      <div class="flex justify-between text-xs text-gray-500 font-mono">
        <span> {{ annotations.length }} annotations </span>
        <div class="flex flex-col items-end">
          <span>{{ formatTime(currentTime) }}</span>
          <span class="opacity-75">{{ formatFrame(currentFrame) }}</span>
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
