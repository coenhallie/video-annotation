import { describe, it, expect } from 'vitest';
import {
  buildAnnotationPayload,
  DEFAULT_ANNOTATION_COLOR,
  isCommentAnnotation,
  isSaveableAnnotation,
} from '../annotationPayload';
import type { Label } from '@/types/labels';

const ballMissed: Label = {
  id: 'label-ball-missed',
  name: 'BALL MISSED',
  color: '#f97316',
  isDefault: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
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

  it('treats a missing labels array as a comment', () => {
    // A freshly created comment never has one written: useVideoAnnotations
    // only sets labels on the created object when the array is non-empty.
    expect(isCommentAnnotation({})).toBe(true);
    expect(isCommentAnnotation({ labels: null })).toBe(true);
  });

  it('does not treat a labelled annotation as a comment', () => {
    expect(isCommentAnnotation({ labels: ['label-ball-missed'] })).toBe(false);
  });
});
