import type { Label } from '@/types/labels';
import type { DrawingData } from '@/types/database';
import type { AnnotationFormData } from '@/types/component-interfaces';

/** Colour used when no label supplies one. */
export const DEFAULT_ANNOTATION_COLOR = '#6b7280'; // gray-500

export interface BuildAnnotationPayloadInput {
  /** Every label available, used to resolve labelIds to colour and title. */
  labels: Label[];
  labelIds: string[];
  content: string;
  frame: number;
  fps: number;
  drawingData?: DrawingData | null;
  /** Colour to use when no label matches. */
  fallbackColor?: string;
  /** Per-video frames, set only in dual mode. */
  dual?: { videoAFrame: number; videoBFrame: number } | null;
}

/**
 * The single place that turns a chosen label plus a frame into the payload the
 * annotation service expects. Shared by the sidebar form and the quick pick so
 * the two paths cannot drift apart.
 */
export function buildAnnotationPayload(
  input: BuildAnnotationPayloadInput
): AnnotationFormData {
  const {
    labels,
    labelIds,
    content,
    frame,
    fps,
    drawingData = null,
    fallbackColor,
    dual = null,
  } = input;

  const primaryLabel = labels.find((label) => labelIds.includes(label.id));

  const payload: AnnotationFormData = {
    content,
    title: primaryLabel?.name || content.slice(0, 50) || 'Untitled',
    color: primaryLabel?.color || fallbackColor || DEFAULT_ANNOTATION_COLOR,
    timestamp: frame / fps,
    frame,
    annotationType: drawingData ? 'drawing' : 'text',
    drawingData,
    duration: 1 / 30,
    durationFrames: 1,
    labels: labelIds,
  };

  if (dual) {
    payload.videoAFrame = dual.videoAFrame;
    payload.videoBFrame = dual.videoBFrame;
  }

  return payload;
}

/**
 * A comment is an annotation with no labels attached, created by the quick
 * pick's comment mode with an empty labelIds.
 *
 * The same test works for a stored and a just-created comment: annotationService
 * attaches a `labels` array of ids to every loaded annotation, and
 * useVideoAnnotations only sets one on a newly created annotation when the array
 * is non-empty, so a fresh comment simply has no `labels` property.
 */
export function isCommentAnnotation(annotation: {
  labels?: string[] | null;
}): boolean {
  return !annotation.labels?.length;
}
