import { type Ref, computed } from 'vue';
import type { UseDrawingCanvas } from './useDrawingCanvas';
import type { DrawingData, Annotation } from '@/types/database';
import type {
  DrawingCanvasExpose,
  DrawingCreatedEvent,
} from '@/types/component-interfaces';

export interface DrawingCoordinatorOptions {
  playerMode: Ref<'single' | 'dual'>;
  singleCanvas: UseDrawingCanvas;
  canvasA: UseDrawingCanvas;
  canvasB: UseDrawingCanvas;
}

export function useDrawingCoordinator(options: DrawingCoordinatorOptions) {
  const { playerMode, singleCanvas, canvasA, canvasB } = options;

  const isDual = () => playerMode.value === 'dual';

  // --------------------------------------------------------------------------
  // Unified drawing-mode control
  // --------------------------------------------------------------------------

  function enableDrawingMode() {
    if (isDual()) {
      canvasA.enableDrawingMode();
      canvasB.enableDrawingMode();
    } else {
      singleCanvas.enableDrawingMode();
    }
  }

  function disableDrawingMode() {
    if (isDual()) {
      canvasA.disableDrawingMode();
      canvasB.disableDrawingMode();
    } else {
      singleCanvas.disableDrawingMode();
    }
  }

  function toggleDrawingMode() {
    if (isDual()) {
      // Toggle based on canvas A's current state (they stay in sync)
      if (canvasA.isDrawingMode.value) {
        canvasA.disableDrawingMode();
        canvasB.disableDrawingMode();
      } else {
        canvasA.enableDrawingMode();
        canvasB.enableDrawingMode();
      }
    } else {
      singleCanvas.toggleDrawingMode();
    }
  }

  const isDrawingMode = computed(() => {
    if (isDual()) {
      return canvasA.isDrawingMode.value || canvasB.isDrawingMode.value;
    }
    return singleCanvas.isDrawingMode.value;
  });

  // --------------------------------------------------------------------------
  // Drawing data clearing
  // --------------------------------------------------------------------------

  function clearAllDrawings() {
    if (isDual()) {
      canvasA.clearAllDrawings();
      canvasB.clearAllDrawings();
    } else {
      singleCanvas.clearAllDrawings();
    }
  }

  function clearCurrentFrameDrawings() {
    if (isDual()) {
      canvasA.clearCurrentFrameDrawings();
      canvasB.clearCurrentFrameDrawings();
    } else {
      singleCanvas.clearCurrentFrameDrawings();
    }
  }

  /**
   * Clear drawings on both composable state and the exposed canvas component
   * refs. Mirrors the pattern used in AnnotationForm's cancelForm /
   * clearDrawing.
   */
  function clearDrawingsWithRefs(canvasRefs: {
    single?: DrawingCanvasExpose | null;
    a?: DrawingCanvasExpose | null;
    b?: DrawingCanvasExpose | null;
  }) {
    if (isDual()) {
      canvasA.disableDrawingMode();
      canvasB.disableDrawingMode();
      canvasRefs.a?.clearDrawings?.();
      canvasRefs.b?.clearDrawings?.();
    } else {
      singleCanvas.disableDrawingMode();
      singleCanvas.clearCurrentFrameDrawings();
      canvasRefs.single?.clearDrawings?.();
    }
  }

  // --------------------------------------------------------------------------
  // Frame management
  // --------------------------------------------------------------------------

  function setCurrentFrame(
    frame: number,
    videoAFrame?: number,
    videoBFrame?: number,
  ) {
    if (isDual()) {
      canvasA.currentFrame.value = videoAFrame ?? frame;
      canvasB.currentFrame.value = videoBFrame ?? frame;
    } else {
      singleCanvas.currentFrame.value = frame;
    }
  }

  // --------------------------------------------------------------------------
  // Collect drawing data from the correct canvas(es)
  // --------------------------------------------------------------------------

  function getDrawingData(canvasRefs: {
    single?: DrawingCanvasExpose | null;
    a?: DrawingCanvasExpose | null;
    b?: DrawingCanvasExpose | null;
  }): DrawingData | null {
    if (isDual()) {
      const drawingA = canvasRefs.a?.getCurrentDrawingSession?.();
      const drawingB = canvasRefs.b?.getCurrentDrawingSession?.();

      if (drawingA || drawingB) {
        const data = {} as DrawingData;
        if (drawingA) data.drawingA = drawingA;
        if (drawingB) data.drawingB = drawingB;
        return data;
      }
      return null;
    } else {
      // Single mode – try multiple fallback strategies
      const canvasRef = canvasRefs.single;

      // Read the session data BEFORE completing, because completeDrawingSession
      // emits an event and then clears currentDrawingSession to null.
      if (canvasRef?.getCurrentDrawingSession) {
        const session = canvasRef.getCurrentDrawingSession();
        if (session && session.paths && session.paths.length > 0) {
          // Complete the session (fires event + clears internal state)
          canvasRef.completeDrawingSession?.();
          return {
            paths: session.paths,
            frame: session.frame,
            canvasWidth: session.canvasWidth,
            canvasHeight: session.canvasHeight,
          };
        }
      }

      if (singleCanvas.getCurrentFrameDrawing) {
        const frameDrawing = singleCanvas.getCurrentFrameDrawing();
        if (
          frameDrawing &&
          frameDrawing.paths &&
          frameDrawing.paths.length > 0
        ) {
          return frameDrawing;
        }
      }

      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Load drawing data for an annotation being edited
  // --------------------------------------------------------------------------

  function loadDrawingsForAnnotation(annotation: {
    drawingData?: DrawingData | null;
    frame?: number;
  }) {
    if (!annotation.drawingData) return;

    if (isDual()) {
      canvasA.clearCurrentFrameDrawings();
      if (annotation.drawingData.drawingA) {
        canvasA.addDrawing({
          frame: annotation.drawingData.drawingA.frame,
          paths: annotation.drawingData.drawingA.paths,
          canvasWidth: annotation.drawingData.drawingA.canvasWidth,
          canvasHeight: annotation.drawingData.drawingA.canvasHeight,
        });
      }
      canvasB.clearCurrentFrameDrawings();
      if (annotation.drawingData.drawingB) {
        canvasB.addDrawing({
          frame: annotation.drawingData.drawingB.frame,
          paths: annotation.drawingData.drawingB.paths,
          canvasWidth: annotation.drawingData.drawingB.canvasWidth,
          canvasHeight: annotation.drawingData.drawingB.canvasHeight,
        });
      }
    } else {
      singleCanvas.clearCurrentFrameDrawings();
      if (annotation.drawingData) {
        singleCanvas.addDrawing(annotation.drawingData);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Check if current frame has drawings (via canvas refs or composable state)
  // --------------------------------------------------------------------------

  function hasDrawingsOnCurrentFrame(canvasRefs?: {
    single?: DrawingCanvasExpose | null;
    a?: DrawingCanvasExpose | null;
    b?: DrawingCanvasExpose | null;
  }): boolean {
    if (isDual()) {
      return (
        (canvasRefs?.a?.hasDrawingsOnCurrentFrame?.() ?? false) ||
        (canvasRefs?.b?.hasDrawingsOnCurrentFrame?.() ?? false)
      );
    }
    return (
      (canvasRefs?.single?.hasDrawingsOnCurrentFrame?.() ?? false) ||
      singleCanvas.hasDrawingsOnCurrentFrame()
    );
  }

  // --------------------------------------------------------------------------
  // Handle drawing-created events (from useVideoEventHandlers)
  // --------------------------------------------------------------------------

  function addDrawing(
    drawing: DrawingCreatedEvent,
    videoContext?: string,
  ) {
    if (isDual()) {
      const context = videoContext || 'A';
      canvasA.addDrawing(drawing, context as 'A' | 'B');
    } else {
      singleCanvas.addDrawing(drawing);
    }
  }

  // --------------------------------------------------------------------------
  // Propagate color settings across all active canvases
  // --------------------------------------------------------------------------

  function setCustomColor(color: string) {
    if (isDual()) {
      canvasA.setCustomColor(color);
      canvasB.setCustomColor(color);
    } else {
      singleCanvas.setCustomColor(color);
    }
  }

  function clearCustomColor() {
    if (isDual()) {
      canvasA.clearCustomColor();
      canvasB.clearCustomColor();
    } else {
      singleCanvas.clearCustomColor();
    }
  }

  // --------------------------------------------------------------------------
  // Load drawings from annotations (used by DashboardView watcher)
  // --------------------------------------------------------------------------

  function loadDrawingsFromAnnotations(annotations: Annotation[]) {
    if (isDual()) {
      canvasA.loadDrawingsFromAnnotations(annotations, 'A');
      canvasB.loadDrawingsFromAnnotations(annotations, 'B');
    } else {
      singleCanvas.loadDrawingsFromAnnotations(annotations);
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup all canvases (project-switch)
  // --------------------------------------------------------------------------

  function cleanup() {
    for (const canvas of [singleCanvas, canvasA, canvasB]) {
      canvas.clearAllDrawings();
      canvas.disableDrawingMode();
      if (canvas.state) {
        canvas.state.activeDrawing = null;
        canvas.state.isLoadingDrawings = false;
      }
    }
  }

  /**
   * The "primary" canvas: in single mode it is singleCanvas; in dual mode
   * it falls back to canvasA (used for tool state like stroke width, color).
   */
  const primaryCanvas = computed(() => {
    return isDual() ? canvasA : singleCanvas;
  });

  // --------------------------------------------------------------------------
  // Store drawing data into annotation draft (onDrawingCreated from panel)
  // --------------------------------------------------------------------------

  function storeDrawingInDraft(
    draft: { drawingData: DrawingData | null },
    drawingData: DrawingData,
    videoContext: string | null = null,
  ) {
    if (isDual()) {
      if (!draft.drawingData) {
        draft.drawingData = {
          paths: [],
          canvasWidth: drawingData.canvasWidth,
          canvasHeight: drawingData.canvasHeight,
          frame: drawingData.frame,
        } as DrawingData;
      }
      if (videoContext === 'A' || !videoContext) {
        draft.drawingData.drawingA = drawingData;
      }
      if (videoContext === 'B') {
        draft.drawingData.drawingB = drawingData;
      }
    } else {
      draft.drawingData = drawingData;
    }
  }

  return {
    // Mode query
    isDrawingMode,
    primaryCanvas,

    // Drawing mode control
    enableDrawingMode,
    disableDrawingMode,
    toggleDrawingMode,

    // Drawing management
    clearAllDrawings,
    clearCurrentFrameDrawings,
    clearDrawingsWithRefs,
    addDrawing,

    // Frame management
    setCurrentFrame,

    // Data collection / loading
    getDrawingData,
    loadDrawingsForAnnotation,
    hasDrawingsOnCurrentFrame,
    loadDrawingsFromAnnotations,
    storeDrawingInDraft,

    // Color
    setCustomColor,
    clearCustomColor,

    // Lifecycle
    cleanup,
  };
}

export type UseDrawingCoordinator = ReturnType<typeof useDrawingCoordinator>;
