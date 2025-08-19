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
  customColor?: string | undefined; // Optional custom color override
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

  // Predefined color palette for quick selection
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

  // Get current drawing color (custom color takes precedence over severity color)
  const getCurrentColor = (): string => {
    return (
      state.value.currentTool.customColor ||
      severityColors[
        state.value.currentTool.severity as keyof typeof severityColors
      ]
    );
  };

  // Set custom color
  const setCustomColor = (color: string) => {
    state.value.currentTool.customColor = color;
  };

  // Clear custom color (revert to severity-based color)
  const clearCustomColor = () => {
    delete state.value.currentTool.customColor;
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
  const addDrawing = (drawing: DrawingData, videoContext?: 'A' | 'B') => {
    // In dual mode, we need to handle the drawing structure differently
    if (videoContext) {
      // For dual mode, create a drawing with video-specific data
      const dualDrawing: DrawingData = {
        paths: [], // Empty paths at root level for dual mode
        canvasWidth: drawing.canvasWidth,
        canvasHeight: drawing.canvasHeight,
        frame: drawing.frame,
        drawingA:
          videoContext === 'A'
            ? {
                paths: drawing.paths,
                canvasWidth: drawing.canvasWidth,
                canvasHeight: drawing.canvasHeight,
                frame: drawing.frame,
              }
            : undefined,
        drawingB:
          videoContext === 'B'
            ? {
                paths: drawing.paths,
                canvasWidth: drawing.canvasWidth,
                canvasHeight: drawing.canvasHeight,
                frame: drawing.frame,
              }
            : undefined,
      };

      const frame = drawing.frame;
      const frameDrawings = state.value.drawings.get(frame) || [];

      // Check if there's already a dual drawing for this frame and merge
      const existingIndex = frameDrawings.findIndex(
        (d: DrawingData) => d.drawingA || d.drawingB
      );
      if (existingIndex >= 0) {
        // Merge with existing dual drawing
        const existing = frameDrawings[existingIndex];
        if (videoContext === 'A') {
          existing.drawingA = dualDrawing.drawingA;
        } else {
          existing.drawingB = dualDrawing.drawingB;
        }
        console.log(
          `🎨 [useDrawingCanvas] Merged dual mode drawing for video ${videoContext} frame ${frame}:`,
          existing
        );
      } else {
        // Add new dual drawing
        frameDrawings.push(dualDrawing);
        console.log(
          `🎨 [useDrawingCanvas] Added dual mode drawing for video ${videoContext} frame ${frame}:`,
          dualDrawing
        );
      }

      state.value.drawings.set(frame, frameDrawings);
    } else {
      // Single mode - use the drawing as-is
      const frame = drawing.frame;
      const frameDrawings = state.value.drawings.get(frame) || [];
      frameDrawings.push(drawing);
      state.value.drawings.set(frame, frameDrawings);
      console.log(
        `🎨 [useDrawingCanvas] Added single mode drawing to frame ${frame}:`,
        drawing
      );
    }
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

  // Complete cleanup for project switching
  const cleanup = () => {
    console.log('🧹 [DrawingCanvas] Starting complete cleanup...');

    try {
      // Clear all drawings
      clearAllDrawings();

      // Disable drawing mode
      disableDrawingMode();

      // Reset state to initial values
      state.value.activeDrawing = null;
      state.value.isLoadingDrawings = false;
      state.value.currentTool = {
        type: 'pen',
        strokeWidth: 3,
        severity: 'medium',
      };
      state.value.canvasSize = { width: 0, height: 0 };
      state.value.videoSize = { width: 1920, height: 1080 };

      console.log('✅ [DrawingCanvas] Complete cleanup finished');
    } catch (error) {
      console.warn('🧹 [DrawingCanvas] Error during cleanup:', error);
    }
  };

  // Convert drawing data to annotation format
  const convertDrawingToAnnotation = (
    drawing: DrawingData,
    videoId: string,
    userId: string,
    title: string = 'Drawing Annotation',
    content: string = 'Drawing annotation',
    videoContext?: 'A' | 'B'
  ): Omit<Annotation, 'id'> => {
    // Calculate timestamp from frame
    const fps = 30; // Default FPS, should be passed from video metadata
    const timestamp = (drawing.frame / fps) * 1000;

    // For dual mode, ensure the drawing has the proper structure
    let drawingData = drawing;
    if (videoContext && !drawing.drawingA && !drawing.drawingB) {
      // Convert single drawing to dual structure if needed
      drawingData = {
        paths: [],
        canvasWidth: drawing.canvasWidth,
        canvasHeight: drawing.canvasHeight,
        frame: drawing.frame,
        drawingA:
          videoContext === 'A'
            ? {
                paths: drawing.paths,
                canvasWidth: drawing.canvasWidth,
                canvasHeight: drawing.canvasHeight,
                frame: drawing.frame,
              }
            : undefined,
        drawingB:
          videoContext === 'B'
            ? {
                paths: drawing.paths,
                canvasWidth: drawing.canvasWidth,
                canvasHeight: drawing.canvasHeight,
                frame: drawing.frame,
              }
            : undefined,
      };
    }

    return {
      content,
      title,
      severity: state.value.currentTool.severity,
      color: getCurrentColor(),
      timestamp,
      frame: drawing.frame,
      annotationType: 'drawing',
      drawingData,
      userId: userId,
      duration: 0,
      durationFrames: 0,
    };
  };

  // Load drawings from annotations
  const loadDrawingsFromAnnotations = (
    annotations: Annotation[],
    videoContext?: 'A' | 'B'
  ) => {
    console.log(
      '🎨 [useDrawingCanvas] loadDrawingsFromAnnotations called with:',
      annotations,
      'videoContext:',
      videoContext
    );
    console.log('🎨 [useDrawingCanvas] Annotations count:', annotations.length);

    // Only show loading state for initial loads or when there are many annotations
    // Don't show loading for frame changes during video playback
    const shouldShowLoading =
      annotations.length > 10 || state.value.drawings.size === 0;

    if (shouldShowLoading) {
      state.value.isLoadingDrawings = true;
    }

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

    // Process annotations immediately without delay to prevent flashing
    drawingAnnotations.forEach((annotation) => {
      if (annotation.drawingData) {
        const frame = annotation.frame;
        const frameDrawings = state.value.drawings.get(frame) || [];

        // Handle dual mode vs single mode drawing data
        if (
          videoContext &&
          (annotation.drawingData.drawingA || annotation.drawingData.drawingB)
        ) {
          // Dual mode: extract the relevant drawing data for this video context
          const relevantDrawingData =
            videoContext === 'A'
              ? annotation.drawingData.drawingA
              : annotation.drawingData.drawingB;

          if (relevantDrawingData) {
            frameDrawings.push(relevantDrawingData);
            console.log(
              `🎨 [useDrawingCanvas] Added dual mode drawing for video ${videoContext} frame ${frame}:`,
              relevantDrawingData
            );
          }
        } else {
          // Single mode: use the drawing data as-is
          frameDrawings.push(annotation.drawingData);
          console.log(
            `🎨 [useDrawingCanvas] Added single mode drawing for frame ${frame}:`,
            annotation.drawingData
          );
        }

        state.value.drawings.set(frame, frameDrawings);
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

    // Clear loading state immediately if it was set
    if (shouldShowLoading) {
      state.value.isLoadingDrawings = false;
    }
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
  const getCurrentFrameDrawing = (
    videoContext?: 'A' | 'B'
  ): DrawingData | null => {
    const frameDrawings = getDrawingsForFrame(currentFrame.value);
    const allPaths: DrawingPath[] = [];

    // Add paths from committed drawings
    frameDrawings.forEach((drawing) => {
      if (videoContext && (drawing.drawingA || drawing.drawingB)) {
        // Dual mode: extract paths from the appropriate video context
        const contextDrawing =
          videoContext === 'A' ? drawing.drawingA : drawing.drawingB;
        if (contextDrawing && contextDrawing.paths) {
          allPaths.push(...contextDrawing.paths);
        }
      } else if (!videoContext && drawing.paths) {
        // Single mode: use paths directly
        allPaths.push(...drawing.paths);
      }
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

    // Return appropriate structure based on mode
    if (videoContext) {
      return {
        paths: [],
        canvasWidth: state.value.canvasSize.width,
        canvasHeight: state.value.canvasSize.height,
        frame: currentFrame.value,
        drawingA:
          videoContext === 'A'
            ? {
                paths: allPaths,
                canvasWidth: state.value.canvasSize.width,
                canvasHeight: state.value.canvasSize.height,
                frame: currentFrame.value,
              }
            : undefined,
        drawingB:
          videoContext === 'B'
            ? {
                paths: allPaths,
                canvasWidth: state.value.canvasSize.width,
                canvasHeight: state.value.canvasSize.height,
                frame: currentFrame.value,
              }
            : undefined,
      };
    } else {
      return {
        paths: allPaths,
        canvasWidth: state.value.canvasSize.width,
        canvasHeight: state.value.canvasSize.height,
        frame: currentFrame.value,
      };
    }
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
  const completeDrawingSession = (videoContext?: 'A' | 'B') => {
    // If there's an active drawing, commit it to the drawings Map
    if (
      state.value.activeDrawing &&
      state.value.activeDrawing.paths.length > 0
    ) {
      addDrawing(state.value.activeDrawing, videoContext);
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
    colorPalette,
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

    // Color management
    getCurrentColor,
    setCustomColor,
    clearCustomColor,

    // Drawing management
    addDrawing,
    clearCurrentFrameDrawings,
    clearAllDrawings,
    cleanup,
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
