import { type Ref, computed } from 'vue';
import type { UseDrawingCanvas } from './useDrawingCanvas';
import type { DrawingData, Annotation } from '@/types/database';
import type {
  DrawingCanvasExpose,
  DrawingCreatedEvent,
} from '@/types/component-interfaces';
import { hasDrawingStrokes } from '@/utils/annotationPayload';

export interface DrawingCoordinatorOptions {
  playerMode: Ref<'single' | 'dual'>;
  singleCanvas: UseDrawingCanvas;
  canvasA: UseDrawingCanvas;
  canvasB: UseDrawingCanvas;
  /**
   * Which editor surface is on screen. The pipeline replay is a single canvas
   * over a single stage, so it takes the same path as single-video mode with
   * its own canvas swapped in - it is never dual, whatever the player is doing
   * behind the hidden video tab.
   */
  surface?: Ref<'video' | 'pipeline'>;
  pipelineCanvas?: UseDrawingCanvas;
}

/** The DrawingCanvas component instances, as EditorView holds them. */
export interface DrawingCanvasRefs {
  single?: DrawingCanvasExpose | null;
  a?: DrawingCanvasExpose | null;
  b?: DrawingCanvasExpose | null;
}

export function useDrawingCoordinator(options: DrawingCoordinatorOptions) {
  const { playerMode, singleCanvas, canvasA, canvasB, surface, pipelineCanvas } =
    options;

  const isPipeline = () =>
    surface?.value === 'pipeline' && pipelineCanvas !== undefined;

  /**
   * The one canvas the single-surface paths act on. On the pipeline tab that is
   * the replay's own canvas; everywhere else it is the video's.
   */
  const primary = () =>
    isPipeline() ? (pipelineCanvas as UseDrawingCanvas) : singleCanvas;

  // Dual is a property of the video surface. The pipeline replay has one stage,
  // so it must not fan out to canvases that are not on screen.
  const isDual = () => !isPipeline() && playerMode.value === 'dual';

  // --------------------------------------------------------------------------
  // Unified drawing-mode control
  // --------------------------------------------------------------------------

  function enableDrawingMode() {
    if (isDual()) {
      canvasA.enableDrawingMode();
      canvasB.enableDrawingMode();
    } else {
      primary().enableDrawingMode();
    }
  }

  function disableDrawingMode() {
    if (isDual()) {
      canvasA.disableDrawingMode();
      canvasB.disableDrawingMode();
    } else {
      primary().disableDrawingMode();
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
      primary().toggleDrawingMode();
    }
  }

  const isDrawingMode = computed(() => {
    if (isDual()) {
      return canvasA.isDrawingMode.value || canvasB.isDrawingMode.value;
    }
    return primary().isDrawingMode.value;
  });

  // --------------------------------------------------------------------------
  // Drawing data clearing
  // --------------------------------------------------------------------------

  function clearAllDrawings() {
    if (isDual()) {
      canvasA.clearAllDrawings();
      canvasB.clearAllDrawings();
    } else {
      primary().clearAllDrawings();
    }
  }

  function clearCurrentFrameDrawings() {
    if (isDual()) {
      canvasA.clearCurrentFrameDrawings();
      canvasB.clearCurrentFrameDrawings();
    } else {
      primary().clearCurrentFrameDrawings();
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
      primary().disableDrawingMode();
      primary().clearCurrentFrameDrawings();
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
      primary().currentFrame.value = frame;
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

      if (primary().getCurrentFrameDrawing) {
        const frameDrawing = primary().getCurrentFrameDrawing();
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
      primary().clearCurrentFrameDrawings();
      if (annotation.drawingData) {
        primary().addDrawing(annotation.drawingData);
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
      primary().hasDrawingsOnCurrentFrame()
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
      primary().addDrawing(drawing);
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
      primary().setCustomColor(color);
    }
  }

  function clearCustomColor() {
    if (isDual()) {
      canvasA.clearCustomColor();
      canvasB.clearCustomColor();
    } else {
      primary().clearCustomColor();
    }
  }

  function setStrokeWidth(width: number) {
    if (isDual()) {
      canvasA.setStrokeWidth(width);
      canvasB.setStrokeWidth(width);
    } else {
      primary().setStrokeWidth(width);
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
      primary().loadDrawingsFromAnnotations(annotations);
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup all canvases (project-switch)
  // --------------------------------------------------------------------------

  function cleanup() {
    // Every canvas, including the pipeline one: a project switch must not leave
    // the previous replay's strokes on the pipeline tab.
    const all = [singleCanvas, canvasA, canvasB];
    if (pipelineCanvas) all.push(pipelineCanvas);
    for (const canvas of all) {
      canvas.clearAllDrawings();
      canvas.disableDrawingMode();
      if (canvas.state) {
        canvas.state.activeDrawing = null;
        canvas.state.isLoadingDrawings = false;
      }
    }
  }

  /**
   * The "primary" canvas: on the pipeline tab it is the replay's canvas; in
   * single mode it is singleCanvas; in dual mode it falls back to canvasA (used
   * for tool state like stroke width, color).
   */
  const primaryCanvas = computed(() => {
    if (isPipeline()) return pipelineCanvas as UseDrawingCanvas;
    return isDual() ? canvasA : singleCanvas;
  });

  // --------------------------------------------------------------------------
  // The in-progress drawing, for callers that own their own save
  // --------------------------------------------------------------------------

  /**
   * Reads the strokes drawn so far without completing the session.
   *
   * Deliberately not getDrawingData: that one calls completeDrawingSession,
   * which emits drawing-created, which useVideoEventHandlers forwards into the
   * sidebar form's draft. A caller that stores the drawing itself would
   * otherwise leave a copy attached to the sidebar's next new annotation.
   */
  function getInProgressDrawing(canvasRefs: DrawingCanvasRefs): DrawingData | null {
    if (isDual()) {
      const a = canvasRefs.a?.getCurrentDrawingSession?.() ?? null;
      const b = canvasRefs.b?.getCurrentDrawingSession?.() ?? null;
      if (!hasDrawingStrokes(a) && !hasDrawingStrokes(b)) return null;

      // The wrapper's own measurements come from a video that actually drew,
      // so a stale empty session on the other one cannot supply them.
      const primary = (hasDrawingStrokes(a) ? a : b)!;
      const data: DrawingData = {
        paths: [],
        canvasWidth: primary.canvasWidth,
        canvasHeight: primary.canvasHeight,
        frame: primary.frame,
      };
      // Copy the paths array too, not just the wrapper: a stroke drawn between
      // this read and the panel closing would otherwise land inside the array
      // already handed to the insert, since a spread of the session object is
      // still a shared reference to the same live paths array.
      if (hasDrawingStrokes(a)) data.drawingA = { ...a!, paths: [...a!.paths] };
      if (hasDrawingStrokes(b)) data.drawingB = { ...b!, paths: [...b!.paths] };
      return data;
    }

    const session = canvasRefs.single?.getCurrentDrawingSession?.() ?? null;
    if (!hasDrawingStrokes(session)) return null;
    // Copied for the same reason the dual branch copies its paths: DrawingCanvas
    // keeps drawing into this same array while it stays the active session.
    return {
      paths: [...session!.paths],
      frame: session!.frame,
      canvasWidth: session!.canvasWidth,
      canvasHeight: session!.canvasHeight,
    };
  }

  function undoLastStroke(canvasRefs: DrawingCanvasRefs) {
    if (isDual()) {
      canvasRefs.a?.undoLastStroke?.();
      canvasRefs.b?.undoLastStroke?.();
    } else {
      canvasRefs.single?.undoLastStroke?.();
    }
  }

  /**
   * Throws away the strokes of the current session, leaving anything already
   * saved on this frame untouched. Must run before drawing mode is disabled:
   * DrawingCanvas completes a session that still has paths when the mode goes
   * off, which would save what the user just cancelled.
   */
  function discardInProgressDrawing(canvasRefs: DrawingCanvasRefs) {
    if (isDual()) {
      canvasRefs.a?.discardCurrentSession?.();
      canvasRefs.b?.discardCurrentSession?.();
    } else {
      canvasRefs.single?.discardCurrentSession?.();
    }
  }

  /**
   * Puts a drawing that has just been stored into canvas state, so the strokes
   * stay on screen instead of blinking out until the annotations watcher folds
   * the new annotation back in.
   */
  function retainDrawing(drawingData: DrawingData) {
    if (isDual()) {
      if (drawingData.drawingA) canvasA.addDrawing(drawingData.drawingA, 'A');
      if (drawingData.drawingB) canvasB.addDrawing(drawingData.drawingB, 'B');
    } else {
      primary().addDrawing(drawingData);
    }
  }

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
    getInProgressDrawing,
    undoLastStroke,
    discardInProgressDrawing,
    retainDrawing,
    loadDrawingsForAnnotation,
    hasDrawingsOnCurrentFrame,
    loadDrawingsFromAnnotations,
    storeDrawingInDraft,

    // Color
    setCustomColor,
    clearCustomColor,
    setStrokeWidth,

    // Lifecycle
    cleanup,
  };
}

export type UseDrawingCoordinator = ReturnType<typeof useDrawingCoordinator>;
