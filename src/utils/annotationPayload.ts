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
 * What counts as a saveable annotation: exactly one label, or no label at all
 * and some text. The second case is a comment, which the quick pick creates
 * from the timeline. Without it the sidebar could not re-save a comment as
 * itself, since attaching a label is what its Update button would demand and
 * that turns the comment into something else.
 *
 * Neither a label nor text is still not an annotation, so a bare drawing stays
 * blocked, exactly as before.
 */
export function isSaveableAnnotation(input: {
  labels?: string[] | null;
  content?: string | null;
}): boolean {
  const labelCount = input.labels?.length ?? 0;
  if (labelCount === 1) return true;
  return labelCount === 0 && (input.content ?? '').trim().length > 0;
}

/**
 * A comment is an annotation with no labels attached, created by the quick
 * pick's comment mode with an empty labelIds.
 *
 * The array must actually be there. A missing or null `labels` means the join
 * was never resolved, which is what a realtime INSERT payload looks like: a raw
 * annotations row that says nothing about its labels. Reading that absence as
 * "no labels" would draw a labelled annotation as a comment. Treating it as
 * unknown errs the other way, so an un-hydrated comment shows a filled dot
 * until it is refetched, and a labelled annotation is never misdrawn.
 *
 * Both fetch paths in annotationService and both create paths in
 * useVideoAnnotations set the array, so a comment created or loaded through the
 * app always carries an empty one.
 */
export function isCommentAnnotation(annotation: {
  labels?: string[] | null;
}): boolean {
  return Array.isArray(annotation.labels) && annotation.labels.length === 0;
}
