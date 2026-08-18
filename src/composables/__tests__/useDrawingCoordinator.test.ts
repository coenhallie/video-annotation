import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { useDrawingCoordinator } from '@/composables/useDrawingCoordinator';
import { useDrawingCanvas } from '@/composables/useDrawingCanvas';
import type { DrawingData } from '@/types/database';

const session = (frame: number): DrawingData => ({
  frame,
  canvasWidth: 800,
  canvasHeight: 450,
  paths: [
    {
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
      strokeWidth: 4,
      color: '#ef4444',
      timestamp: 1,
    },
  ],
});

const fakeRef = (current: DrawingData | null) => ({
  getCurrentDrawingSession: vi.fn(() => current),
  completeDrawingSession: vi.fn(),
  undoLastStroke: vi.fn(),
  discardCurrentSession: vi.fn(),
  clearDrawings: vi.fn(),
});

function setup(mode: 'single' | 'dual') {
  const playerMode = ref<'single' | 'dual'>(mode);
  const singleCanvas = useDrawingCanvas();
  const canvasA = useDrawingCanvas();
  const canvasB = useDrawingCanvas();
  const coordinator = useDrawingCoordinator({
    playerMode,
    singleCanvas,
    canvasA,
    canvasB,
  });
  return { coordinator, singleCanvas, canvasA, canvasB };
}

describe('useDrawingCoordinator stroke width', () => {
  it('sets the width on the single canvas in single mode', () => {
    const { coordinator, singleCanvas, canvasA } = setup('single');
    coordinator.setStrokeWidth(8);
    expect(singleCanvas.currentTool.value.strokeWidth).toBe(8);
    expect(canvasA.currentTool.value.strokeWidth).toBe(3);
  });

  it('sets the width on both canvases in dual mode', () => {
    const { coordinator, canvasA, canvasB } = setup('dual');
    coordinator.setStrokeWidth(2);
    expect(canvasA.currentTool.value.strokeWidth).toBe(2);
    expect(canvasB.currentTool.value.strokeWidth).toBe(2);
  });
});

describe('useDrawingCoordinator getInProgressDrawing', () => {
  it('reads the session without completing it', () => {
    // completeDrawingSession fires drawing-created, which useVideoEventHandlers
    // forwards into the sidebar form's draft. The quick pick must not.
    const { coordinator } = setup('single');
    const single = fakeRef(session(300));

    const drawing = coordinator.getInProgressDrawing({ single });

    expect(drawing?.paths).toHaveLength(1);
    expect(drawing?.frame).toBe(300);
    expect(single.completeDrawingSession).not.toHaveBeenCalled();
  });

  it('is null when nothing has been drawn', () => {
    const { coordinator } = setup('single');
    expect(coordinator.getInProgressDrawing({ single: fakeRef(null) })).toBeNull();
  });

  it('is null when the session exists but carries no strokes', () => {
    const { coordinator } = setup('single');
    const empty = { ...session(300), paths: [] };
    expect(coordinator.getInProgressDrawing({ single: fakeRef(empty) })).toBeNull();
  });

  it('nests one drawing per video in dual mode', () => {
    const { coordinator } = setup('dual');

    const drawing = coordinator.getInProgressDrawing({
      a: fakeRef(session(300)),
      b: fakeRef(null),
    });

    expect(drawing?.drawingA?.paths).toHaveLength(1);
    expect(drawing?.drawingB).toBeUndefined();
  });

  it('never completes the session in dual mode either', () => {
    // Same guarantee as the single-mode test above: completeDrawingSession
    // would emit drawing-created into the sidebar form's draft, and a caller
    // reading the in-progress drawing owns saving it itself.
    const { coordinator } = setup('dual');
    const a = fakeRef(session(300));
    const b = fakeRef(session(300));

    coordinator.getInProgressDrawing({ a, b });

    expect(a.completeDrawingSession).not.toHaveBeenCalled();
    expect(b.completeDrawingSession).not.toHaveBeenCalled();
  });

  it('hands back a copy of the paths array, not the live session array', () => {
    // A stroke drawn between this read and the panel closing must not land in
    // the object already handed to the insert.
    const { coordinator } = setup('single');
    const live = session(300);
    const single = fakeRef(live);

    const drawing = coordinator.getInProgressDrawing({ single });
    live.paths.push({ ...live.paths[0]!, timestamp: 2 });

    expect(drawing?.paths).toHaveLength(1);
  });

  it("hands back a copy of each video's paths array in dual mode", () => {
    const { coordinator } = setup('dual');
    const liveA = session(300);
    const a = fakeRef(liveA);
    const b = fakeRef(null);

    const drawing = coordinator.getInProgressDrawing({ a, b });
    liveA.paths.push({ ...liveA.paths[0]!, timestamp: 2 });

    expect(drawing?.drawingA?.paths).toHaveLength(1);
  });
});

describe('useDrawingCoordinator undo and discard', () => {
  it('routes both to the single canvas in single mode', () => {
    const { coordinator } = setup('single');
    const single = fakeRef(session(300));

    coordinator.undoLastStroke({ single });
    coordinator.discardInProgressDrawing({ single });

    expect(single.undoLastStroke).toHaveBeenCalledTimes(1);
    expect(single.discardCurrentSession).toHaveBeenCalledTimes(1);
  });

  it('routes both to each canvas in dual mode', () => {
    const { coordinator } = setup('dual');
    const a = fakeRef(session(300));
    const b = fakeRef(session(300));

    coordinator.undoLastStroke({ a, b });
    coordinator.discardInProgressDrawing({ a, b });

    expect(a.undoLastStroke).toHaveBeenCalledTimes(1);
    expect(b.undoLastStroke).toHaveBeenCalledTimes(1);
    expect(a.discardCurrentSession).toHaveBeenCalledTimes(1);
    expect(b.discardCurrentSession).toHaveBeenCalledTimes(1);
  });
});

describe('useDrawingCoordinator retainDrawing', () => {
  it('keeps a just-saved drawing in single-mode canvas state', () => {
    const { coordinator, singleCanvas } = setup('single');

    coordinator.retainDrawing(session(300));

    expect(singleCanvas.getDrawingsForFrame(300)).toHaveLength(1);
  });

  it('keeps a just-saved dual drawing under its own video', () => {
    // Both videos present and distinguishable by frame, so routing drawingB's
    // data onto canvasA (or vice versa) would fail this rather than merely
    // producing the right count on the wrong canvas.
    const { coordinator, canvasA, canvasB } = setup('dual');
    const drawingA = session(300);
    const drawingB = session(301);

    coordinator.retainDrawing({
      paths: [],
      canvasWidth: 800,
      canvasHeight: 450,
      frame: 300,
      drawingA: {
        paths: drawingA.paths,
        canvasWidth: 800,
        canvasHeight: 450,
        frame: 300,
      },
      drawingB: {
        paths: drawingB.paths,
        canvasWidth: 800,
        canvasHeight: 450,
        frame: 301,
      },
    });

    expect(canvasA.getDrawingsForFrame(300)).toHaveLength(1);
    expect(canvasA.getDrawingsForFrame(301)).toHaveLength(0);
    expect(canvasB.getDrawingsForFrame(301)).toHaveLength(1);
    expect(canvasB.getDrawingsForFrame(300)).toHaveLength(0);
  });
});
