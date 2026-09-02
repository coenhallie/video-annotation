import type { AnnotationSurface } from '@/types/database';

export type HistorySelectionPlan =
  | { kind: 'switch-surface'; surface: AnnotationSurface }
  | { kind: 'select-now' };

/**
 * Decides what clicking a History tab entry should do, given the surface the
 * event carries (`entry.summary.surface`, added by the activity triggers) and
 * whichever surface the editor is currently showing.
 *
 * `useVideoAnnotations` scopes `annotations` to the active surface, so an
 * entry from the other surface cannot be found there until the editor
 * switches to it. Returning a plan rather than switching directly keeps this
 * decision testable without mounting the editor: EditorView.vue owns
 * `activeSurface` and the annotation list, this only owns the choice.
 *
 * `entrySurface` is optional because a row written before the field existed
 * carries none - for those the caller falls back to its pre-existing
 * behaviour (look in the current list, else just seek), the same as when the
 * surfaces already match.
 */
export function planHistorySelection(
  entrySurface: AnnotationSurface | undefined,
  activeSurface: AnnotationSurface
): HistorySelectionPlan {
  if (entrySurface && entrySurface !== activeSurface) {
    return { kind: 'switch-surface', surface: entrySurface };
  }
  return { kind: 'select-now' };
}
