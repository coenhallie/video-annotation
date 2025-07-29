import { ref, computed } from 'vue';
import type {
  DrawingData,
  DrawingPath,
  SeverityLevel,
  Annotation,
} from '@/types/database';

export interface DrawingTool {
  type: 'pen';
  strokeWidth: number;
  severity: SeverityLevel;
}

export interface DrawingState {
  isDrawingMode: boolean;
  currentTool: DrawingTool;
  drawings: Map<number, DrawingData[]>; // frame -> drawings
  activeDrawing: DrawingData | null;
  canvasSize: { width: number; height: number };
  videoSize: { width: number; height: number };
  isLoadingDrawings: boolean;
}

export function useDrawingCanvas() {
  // State
  const state = ref<DrawingState>({
    isDrawingMode: false,
    currentTool: {
      type: 'pen',
      strokeWidth: 3,
      severity: 'medium',
    },
    drawings: new Map(),
    activeDrawing: null,
    canvasSize: { width: 0, height: 0 },
    videoSize: { width: 1920, height: 1080 },
    isLoadingDrawings: false,
  });

  // Severity colors mapping
  const severityColors = {
    low: '#34d399', // green-400
    medium: '#fbbf24', // amber-400
    high: '#ef4444', // red-500
  };

  // Computed properties
  const isDrawingMode = computed(() => state.value.isDrawingMode);
  const currentTool = computed(() => state.value.currentTool);
  const currentFrame = ref(0);

  // Get drawings for a specific frame
  const getDrawingsForFrame = (frame: number): DrawingData[] => {
    return state.value.drawings.get(frame) || [];
  };

  // Get drawings for current frame
  const currentFrameDrawings = computed(() => {
    return getDrawingsForFrame(currentFrame.value);
  });

  // Get all drawings (for passing to DrawingCanvas component)
  const allDrawings = computed(() => {
    const drawings: DrawingData[] = [];
    if (state.value.drawings && state.value.drawings.size > 0) {
      state.value.drawings.forEach((frameDrawings) => {
        if (frameDrawings && Array.isArray(frameDrawings)) {
          drawings.push(...frameDrawings);
        }
      });
    }
    return drawings;
  });

  // Toggle drawing mode
  const toggleDrawingMode = () => {
    state.value.isDrawingMode = !state.value.isDrawingMode;
  };

  // Enable drawing mode
  const enableDrawingMode = () => {
    state.value.isDrawingMode = true;
  };

  // Disable drawing mode
  const disableDrawingMode = () => {
    state.value.isDrawingMode = false;
  };

  // Set current tool
  const setTool = (tool: Partial<DrawingTool>) => {
    state.value.currentTool = { ...state.value.currentTool, ...tool };
  };

  // Set stroke width
  const setStrokeWidth = (width: number) => {
    state.value.currentTool.strokeWidth = Math.max(1, Math.min(20, width));
  };

  // Set severity level
  const setSeverity = (severity: SeverityLevel) => {
    state.value.currentTool.severity = severity;
  };

  // Set canvas size
  const setCanvasSize = (width: number, height: number) => {
    state.value.canvasSize = { width, height };
  };

  // Set video size
  const setVideoSize = (width: number, height: number) => {
    state.value.videoSize = { width, height };
  };

  // Add drawing to the frame specified in the drawing data
  const addDrawing = (drawing: DrawingData) => {
    const frame = drawing.frame; // Use the frame from the drawing data, not currentFrame
    const frameDrawings = state.value.drawings.get(frame) || [];
    frameDrawings.push(drawing);
    state.value.drawings.set(frame, frameDrawings);
    console.log(
      `🎨 [useDrawingCanvas] Added drawing to frame ${frame}:`,
      drawing
    );
  };

  // Clear drawings for current frame
  const clearCurrentFrameDrawings = () => {
    const frame = currentFrame.value;
    state.value.drawings.delete(frame);
  };

  // Clear all drawings
  const clearAllDrawings = () => {
    state.value.drawings.clear();
  };

  // Convert drawing data to annotation format
  const convertDrawingToAnnotation = (
    drawing: DrawingData,
    videoId: string,
    userId: string,
    title: string = 'Drawing Annotation',
    content: string = 'Drawing annotation'
  ): Omit<Annotation, 'id'> => {
    // Calculate timestamp from frame
    const fps = 30; // Default FPS, should be passed from video metadata
    const timestamp = (drawing.frame / fps) * 1000;

    return {
      content,
      title,
      severity: state.value.currentTool.severity,
      color: severityColors[state.value.currentTool.severity],
      timestamp,
      frame: drawing.frame,
      annotationType: 'drawing',
      drawingData: drawing,
      userId: userId,
      duration: 0,
      durationFrames: 0,
    };
  };

  // Load drawings from annotations
  const loadDrawingsFromAnnotations = (annotations: Annotation[]) => {
    console.log(
      '🎨 [useDrawingCanvas] loadDrawingsFromAnnotations called with:',
      annotations
    );
    console.log('🎨 [useDrawingCanvas] Annotations count:', annotations.length);

    // Set loading state
    state.value.isLoadingDrawings = true;

    // Clear existing drawings
    state.value.drawings.clear();

    const drawingAnnotations = annotations.filter(
      (annotation) =>
        annotation.annotationType === 'drawing' && annotation.drawingData
    );

    console.log(
      '🎨 [useDrawingCanvas] Drawing annotations found:',
      drawingAnnotations
    );
    console.log(
      '🎨 [useDrawingCanvas] Drawing annotations count:',
      drawingAnnotations.length
    );

    // TIMING FIX: Reduce delay to prevent interference with video fade transition timing
    // The 300ms delay was causing race conditions with the 350ms video fade transition
    setTimeout(() => {
      drawingAnnotations.forEach((annotation) => {
        if (annotation.drawingData) {
          const frame = annotation.frame;
          const frameDrawings = state.value.drawings.get(frame) || [];
          frameDrawings.push(annotation.drawingData);
          state.value.drawings.set(frame, frameDrawings);
          console.log(
            `🎨 [useDrawingCanvas] Added drawing for frame ${frame}:`,
            annotation.drawingData
          );
        }
      });

      console.log(
        '🎨 [useDrawingCanvas] Final drawings map:',
        state.value.drawings
      );
      console.log(
        '🎨 [useDrawingCanvas] Total frames with drawings:',
        state.value.drawings.size
      );

      // Clear loading state
      state.value.isLoadingDrawings = false;
    }, 100); // Reduced delay to prevent race conditions with video transitions
  };

  // Get total number of drawings
  const getTotalDrawingsCount = computed(() => {
    let count = 0;
    state.value.drawings.forEach((frameDrawings) => {
      count += frameDrawings.length;
    });
    return count;
  });

  // Get frames with drawings
  const getFramesWithDrawings = computed(() => {
    return Array.from(state.value.drawings.keys()).sort((a, b) => a - b);
  });

  // Check if frame has drawings
  const hasDrawingsOnFrame = (frame: number): boolean => {
    const frameDrawings = state.value.drawings.get(frame);
    return frameDrawings ? frameDrawings.length > 0 : false;
  };

  // Check if current frame has drawings
  const hasDrawingsOnCurrentFrame = (): boolean => {
    return hasDrawingsOnFrame(currentFrame.value);
  };

  // Get current frame drawing data (merges all drawings on current frame)
  const getCurrentFrameDrawing = (): DrawingData | null => {
    const frameDrawings = getDrawingsForFrame(currentFrame.value);
    const allPaths: DrawingPath[] = [];

    // Add paths from committed drawings
    frameDrawings.forEach((drawing) => {
      allPaths.push(...drawing.paths);
    });

    // CRITICAL: Also check for active drawing that hasn't been committed yet
    if (
      state.value.activeDrawing &&
      state.value.activeDrawing.paths.length > 0
    ) {
      allPaths.push(...state.value.activeDrawing.paths);
    }

    if (allPaths.length === 0) {
      return null;
    }

    return {
      paths: allPaths,
      canvasWidth: state.value.canvasSize.width,
      canvasHeight: state.value.canvasSize.height,
      frame: currentFrame.value,
    };
  };

  const getCurrentDrawingSession = (): DrawingData | null => {
    if (state.value.activeDrawing) {
      return {
        ...state.value.activeDrawing,
        frame: currentFrame.value,
      };
    }
    return null;
  };

  // Complete drawing session - compatibility method for AnnotationPanel
  const completeDrawingSession = () => {
    // If there's an active drawing, commit it to the drawings Map
    if (
      state.value.activeDrawing &&
      state.value.activeDrawing.paths.length > 0
    ) {
      addDrawing(state.value.activeDrawing);
      state.value.activeDrawing = null;
    }
  };

  // Export interface
  return {
    // State
    state: state.value,
    isDrawingMode,
    currentTool,
    currentFrame,
    currentFrameDrawings,
    allDrawings,
    severityColors,
    isLoadingDrawings: computed(() => state.value.isLoadingDrawings),

    // Actions
    toggleDrawingMode,
    enableDrawingMode,
    disableDrawingMode,
    setTool,
    setStrokeWidth,
    setSeverity,
    setCanvasSize,
    setVideoSize,

    // Drawing management
    addDrawing,
    clearCurrentFrameDrawings,
    clearAllDrawings,
    getDrawingsForFrame,
    completeDrawingSession,

    // Data conversion
    convertDrawingToAnnotation,
    loadDrawingsFromAnnotations,

    // Computed properties
    getTotalDrawingsCount,
    getFramesWithDrawings,
    hasDrawingsOnFrame,
    hasDrawingsOnCurrentFrame,
    getCurrentFrameDrawing,
  };
}

export type UseDrawingCanvas = ReturnType<typeof useDrawingCanvas>;
