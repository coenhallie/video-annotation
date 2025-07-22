import { ref, computed, watch } from 'vue';
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

  // Add drawing to current frame
  const addDrawing = (drawing: DrawingData) => {
    const frame = currentFrame.value;
    const frameDrawings = state.value.drawings.get(frame) || [];
    frameDrawings.push(drawing);
    state.value.drawings.set(frame, frameDrawings);
  };

  // Update drawing
  const updateDrawing = (
    frame: number,
    drawingIndex: number,
    drawing: DrawingData
  ) => {
    const frameDrawings = state.value.drawings.get(frame);
    if (frameDrawings && frameDrawings[drawingIndex]) {
      frameDrawings[drawingIndex] = drawing;
      state.value.drawings.set(frame, frameDrawings);
    }
  };

  // Remove drawing
  const removeDrawing = (frame: number, drawingIndex: number) => {
    const frameDrawings = state.value.drawings.get(frame);
    if (frameDrawings && frameDrawings[drawingIndex]) {
      frameDrawings.splice(drawingIndex, 1);
      state.value.drawings.set(frame, frameDrawings);
    }
  };

  // Clear drawings for current frame
  const clearCurrentFrameDrawings = () => {
    state.value.drawings.delete(currentFrame.value);
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
      user_id: userId,
    };
  };

  // Load drawings from annotations
  const loadDrawingsFromAnnotations = (annotations: Annotation[]) => {
    // Set loading state
    state.value.isLoadingDrawings = true;

    // Clear existing drawings
    state.value.drawings.clear();

    const drawingAnnotations = annotations.filter(
      (annotation) =>
        annotation.annotationType === 'drawing' && annotation.drawingData
    );

    // Simulate async loading for better UX (drawings load instantly but this gives visual feedback)
    setTimeout(() => {
      drawingAnnotations.forEach((annotation) => {
        if (annotation.drawingData) {
          const frame = annotation.frame;
          const frameDrawings = state.value.drawings.get(frame) || [];
          frameDrawings.push(annotation.drawingData);
          state.value.drawings.set(frame, frameDrawings);
        }
      });

      // Clear loading state
      state.value.isLoadingDrawings = false;
    }, 300); // Small delay to show loading indicator
  };

  // Serialize drawings for storage
  const serializeDrawings = (): Record<number, DrawingData[]> => {
    const serialized: Record<number, DrawingData[]> = {};
    state.value.drawings.forEach((drawings, frame) => {
      serialized[frame] = drawings;
    });
    return serialized;
  };

  // Deserialize drawings from storage
  const deserializeDrawings = (serialized: Record<number, DrawingData[]>) => {
    state.value.drawings.clear();
    Object.entries(serialized).forEach(([frame, drawings]) => {
      state.value.drawings.set(parseInt(frame), drawings);
    });
  };

  // Normalize coordinates from canvas to video dimensions
  const normalizeCoordinates = (
    x: number,
    y: number
  ): { x: number; y: number } => {
    return {
      x: x / state.value.canvasSize.width,
      y: y / state.value.canvasSize.height,
    };
  };

  // Denormalize coordinates from video to canvas dimensions
  const denormalizeCoordinates = (
    x: number,
    y: number
  ): { x: number; y: number } => {
    return {
      x: x * state.value.canvasSize.width,
      y: y * state.value.canvasSize.height,
    };
  };

  // Scale drawing data to different canvas size
  const scaleDrawingData = (
    drawing: DrawingData,
    newCanvasSize: { width: number; height: number }
  ): DrawingData => {
    const scaleX = newCanvasSize.width / drawing.canvasWidth;
    const scaleY = newCanvasSize.height / drawing.canvasHeight;

    return {
      ...drawing,
      canvasWidth: newCanvasSize.width,
      canvasHeight: newCanvasSize.height,
      paths: drawing.paths.map((path) => ({
        ...path,
        points: path.points.map((point) => ({
          x: point.x, // Keep normalized coordinates
          y: point.y,
        })),
        strokeWidth: path.strokeWidth * Math.min(scaleX, scaleY), // Scale stroke width proportionally
      })),
    };
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

  // Export interface
  return {
    // State
    state: state.value,
    isDrawingMode,
    currentTool,
    currentFrame,
    currentFrameDrawings,
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
    updateDrawing,
    removeDrawing,
    clearCurrentFrameDrawings,
    clearAllDrawings,
    getDrawingsForFrame,

    // Data conversion
    convertDrawingToAnnotation,
    loadDrawingsFromAnnotations,
    serializeDrawings,
    deserializeDrawings,

    // Coordinate utilities
    normalizeCoordinates,
    denormalizeCoordinates,
    scaleDrawingData,

    // Computed properties
    getTotalDrawingsCount,
    getFramesWithDrawings,
    hasDrawingsOnFrame,
  };
}

export type UseDrawingCanvas = ReturnType<typeof useDrawingCanvas>;
