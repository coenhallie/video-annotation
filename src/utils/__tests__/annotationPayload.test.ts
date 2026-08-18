import { describe, it, expect } from 'vitest';
import {
  buildAnnotationPayload,
  DEFAULT_ANNOTATION_COLOR,
  isCommentAnnotation,
  isSaveableAnnotation,
  hasDrawingStrokes,
  isDrawingAnnotation,
  stampSnapshotFrame,
} from '../annotationPayload';
import type { Label } from '@/types/labels';
import type { DrawingData } from '@/types/database';

const ballMissed: Label = {
  id: 'label-ball-missed',
  name: 'BALL MISSED',
  color: '#f97316',
  isDefault: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const strokes: DrawingData = {
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
  canvasWidth: 800,
  canvasHeight: 450,
  frame: 300,
};

describe('buildAnnotationPayload', () => {
  it('builds a label-only payload with no content', () => {
    const payload = buildAnnotationPayload({
      labels: [ballMissed],
      labelIds: [ballMissed.id],
      content: '',
      frame: 300,
      fps: 25,
    });

    expect(payload.content).toBe('');
    expect(payload.title).toBe('BALL MISSED');
    expect(payload.color).toBe('#f97316');
    expect(payload.frame).toBe(300);
    expect(payload.timestamp).toBe(12);
    expect(payload.annotationType).toBe('text');
    expect(payload.drawingData).toBeNull();
    expect(payload.labels).toEqual([ballMissed.id]);
    expect(payload.videoAFrame).toBeUndefined();
    expect(payload.videoBFrame).toBeUndefined();
  });

  it('titles from the content when no label matches', () => {
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: 'Something looked wrong here',
      frame: 60,
      fps: 30,
    });

    expect(payload.title).toBe('Something looked wrong here');
    expect(payload.color).toBe(DEFAULT_ANNOTATION_COLOR);
  });

  it('truncates a long content title to 50 characters', () => {
    const long = 'x'.repeat(80);
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: long,
      frame: 0,
      fps: 30,
    });

    expect(payload.title).toBe('x'.repeat(50));
  });

  it('falls back to Untitled when there is no label and no content', () => {
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: '',
      frame: 0,
      fps: 30,
    });

    expect(payload.title).toBe('Untitled');
  });

  it('marks the annotation as a drawing when drawing data is present', () => {
    const payload = buildAnnotationPayload({
      labels: [ballMissed],
      labelIds: [ballMissed.id],
      content: '',
      frame: 10,
      fps: 30,
      drawingData: { paths: [{ id: 'p1' }] } as never,
    });

    expect(payload.annotationType).toBe('drawing');
    expect(payload.drawingData).not.toBeNull();
  });

  it('includes the per-video frames in dual mode', () => {
    const payload = buildAnnotationPayload({
      labels: [ballMissed],
      labelIds: [ballMissed.id],
      content: '',
      frame: 100,
      fps: 30,
      dual: { videoAFrame: 100, videoBFrame: 97 },
    });

    expect(payload.videoAFrame).toBe(100);
    expect(payload.videoBFrame).toBe(97);
  });

  it('prefers an explicit fallback colour over the default', () => {
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: 'note',
      frame: 0,
      fps: 30,
      fallbackColor: '#123456',
    });

    expect(payload.color).toBe('#123456');
  });
});

describe('isSaveableAnnotation', () => {
  it('accepts exactly one label with no text', () => {
    expect(isSaveableAnnotation({ labels: ['label-ball-missed'], content: '' })).toBe(true);
  });

  it('accepts a label-less comment with text', () => {
    // This is what the quick pick creates. Before, the sidebar refused to
    // re-save one without attaching a label, which changes what it is.
    expect(isSaveableAnnotation({ labels: [], content: 'keeper off his line' })).toBe(true);
    expect(isSaveableAnnotation({ content: 'keeper off his line' })).toBe(true);
  });

  it('rejects a label-less annotation whose text is only whitespace', () => {
    expect(isSaveableAnnotation({ labels: [], content: '   ' })).toBe(false);
  });

  it('rejects neither a label nor text', () => {
    expect(isSaveableAnnotation({ labels: [], content: '' })).toBe(false);
    expect(isSaveableAnnotation({})).toBe(false);
  });

  it('still rejects more than one label', () => {
    expect(isSaveableAnnotation({ labels: ['a', 'b'], content: 'note' })).toBe(false);
  });
});

describe('isCommentAnnotation', () => {
  it('treats an annotation with no labels as a comment', () => {
    expect(isCommentAnnotation({ labels: [] })).toBe(true);
  });

  it('does not treat a missing labels array as a comment', () => {
    // Absence means the join was never resolved, which is exactly what a
    // realtime INSERT payload looks like. Reading it as "no labels" would draw
    // a labelled annotation as a comment, so unknown has to stay unknown.
    expect(isCommentAnnotation({})).toBe(false);
    expect(isCommentAnnotation({ labels: null })).toBe(false);
  });

  it('does not treat a labelled annotation as a comment', () => {
    expect(isCommentAnnotation({ labels: ['label-ball-missed'] })).toBe(false);
  });
});

describe('buildAnnotationPayload drawing titles', () => {
  it('titles a bare drawing Drawing', () => {
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: '',
      frame: 300,
      fps: 30,
      drawingData: strokes,
    });

    expect(payload.title).toBe('Drawing');
    expect(payload.annotationType).toBe('drawing');
    expect(payload.color).toBe(DEFAULT_ANNOTATION_COLOR);
  });

  it('still prefers the label name over the drawing fallback', () => {
    const payload = buildAnnotationPayload({
      labels: [ballMissed],
      labelIds: [ballMissed.id],
      content: '',
      frame: 300,
      fps: 30,
      drawingData: strokes,
    });

    expect(payload.title).toBe('BALL MISSED');
  });

  it('still prefers the content over the drawing fallback', () => {
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: 'keeper off his line',
      frame: 300,
      fps: 30,
      drawingData: strokes,
    });

    expect(payload.title).toBe('keeper off his line');
  });
});

describe('hasDrawingStrokes', () => {
  it('is true for a single-mode drawing with paths', () => {
    expect(hasDrawingStrokes(strokes)).toBe(true);
  });

  it('is true for a dual-mode drawing with paths on video A', () => {
    expect(
      hasDrawingStrokes({
        paths: [],
        canvasWidth: 800,
        canvasHeight: 450,
        frame: 300,
        drawingA: {
          paths: strokes.paths,
          canvasWidth: 800,
          canvasHeight: 450,
          frame: 300,
        },
      })
    ).toBe(true);
  });

  it('is true for a dual-mode drawing with paths on video B', () => {
    expect(
      hasDrawingStrokes({
        paths: [],
        canvasWidth: 800,
        canvasHeight: 450,
        frame: 300,
        drawingB: {
          paths: strokes.paths,
          canvasWidth: 800,
          canvasHeight: 450,
          frame: 300,
        },
      })
    ).toBe(true);
  });

  it('is false for an empty shell of either shape', () => {
    expect(
      hasDrawingStrokes({
        paths: [],
        canvasWidth: 800,
        canvasHeight: 450,
        frame: 300,
      })
    ).toBe(false);
    expect(hasDrawingStrokes(null)).toBe(false);
    expect(hasDrawingStrokes()).toBe(false);
  });
});

describe('isSaveableAnnotation with drawings', () => {
  it('accepts a label-less drawing with no text', () => {
    // What the quick pick creates. The sidebar has to accept it too, or it
    // could never re-save a drawing it opened.
    expect(
      isSaveableAnnotation({ labels: [], content: '', drawingData: strokes })
    ).toBe(true);
  });

  it('rejects an empty drawing with no label and no text', () => {
    expect(
      isSaveableAnnotation({
        labels: [],
        content: '',
        drawingData: {
          paths: [],
          canvasWidth: 800,
          canvasHeight: 450,
          frame: 300,
        },
      })
    ).toBe(false);
  });

  it('still rejects more than one label, drawing or not', () => {
    expect(
      isSaveableAnnotation({ labels: ['a', 'b'], drawingData: strokes })
    ).toBe(false);
  });
});

describe('isDrawingAnnotation', () => {
  it('is true for a drawing with strokes', () => {
    expect(
      isDrawingAnnotation({ annotationType: 'drawing', drawingData: strokes })
    ).toBe(true);
  });

  it('is false for a comment', () => {
    expect(
      isDrawingAnnotation({ annotationType: 'text', drawingData: null })
    ).toBe(false);
  });

  it('is false for a drawing type with no strokes left', () => {
    expect(isDrawingAnnotation({ annotationType: 'drawing' })).toBe(false);
  });
});

describe('stampSnapshotFrame', () => {
  it('stamps the single-mode top-level frame from the snapshot', () => {
    const drawingData = { ...strokes, frame: 999 };

    stampSnapshotFrame(drawingData, { frame: 300, dual: null });

    expect(drawingData.frame).toBe(300);
  });

  it('stamps each video\'s own frame in dual mode and leaves the top level alone', () => {
    const drawingData: DrawingData = {
      paths: [],
      canvasWidth: 800,
      canvasHeight: 450,
      frame: 999,
      drawingA: { ...strokes, frame: 111 },
      drawingB: { ...strokes, frame: 222 },
    };

    stampSnapshotFrame(drawingData, {
      frame: 300,
      dual: { videoAFrame: 10, videoBFrame: 20 },
    });

    expect(drawingData.drawingA?.frame).toBe(10);
    expect(drawingData.drawingB?.frame).toBe(20);
    // The top-level frame is single mode's field, unused once dual is set,
    // and stamping it too would be a lie about which video it belongs to.
    expect(drawingData.frame).toBe(999);
  });

  it('is a no-op on whichever side of a dual drawing is missing', () => {
    const drawingData: DrawingData = {
      paths: [],
      canvasWidth: 800,
      canvasHeight: 450,
      frame: 999,
      drawingA: { ...strokes, frame: 111 },
    };

    stampSnapshotFrame(drawingData, {
      frame: 300,
      dual: { videoAFrame: 10, videoBFrame: 20 },
    });

    expect(drawingData.drawingA?.frame).toBe(10);
    expect(drawingData.drawingB).toBeUndefined();
  });
});
