/**
 * Decide what an annotation deep-link (`?a=<id>&t=<seconds>`) should do at this
 * moment. The dashboard links to an annotation by id so the editor can select
 * it - which both seeks to its moment and highlights its row in the sidebar -
 * and carries the timestamp as a fallback for links whose annotation is gone.
 *
 * Pure so the ordering rules stay testable: the player and the annotation list
 * become ready independently, and the list may never contain the id at all.
 */
export type DeepLinkAction<T> =
  /** Not resolvable yet; keep the pending target and re-run on the next change. */
  | { type: 'wait' }
  /** Select this annotation: seek plus sidebar highlight. */
  | { type: 'select'; annotation: T }
  /** The annotation is not here (yet); land on the linked moment meanwhile. */
  | { type: 'seek'; time: number }
  /** Nothing to do; drop the pending targets. */
  | { type: 'none' };

export function resolveAnnotationDeepLink<T extends { id: string | number }>(input: {
  /** Whether the player can accept a seek. */
  ready: boolean;
  /** The `?a=` target, if any. */
  annotationId: string | null;
  annotations: readonly T[];
  /** The `?t=` target, if any. Cleared by the caller once a seek is issued. */
  seekTime: number | null;
}): DeepLinkAction<T> {
  const { ready, annotationId, annotations, seekTime } = input;

  if (annotationId == null && seekTime == null) return { type: 'none' };
  if (!ready) return { type: 'wait' };

  if (annotationId != null) {
    // Ids arrive from the URL as strings; annotation ids are UUIDs today but
    // the type still allows the legacy numeric ones.
    const match = annotations.find(
      (annotation) => String(annotation.id) === annotationId
    );
    if (match) return { type: 'select', annotation: match };
  }

  // No match. The list may simply not have arrived yet - the player and the
  // annotations load independently - so the id stays pending and only the
  // timestamp is consumed. A link to a deleted annotation therefore lands on
  // the right moment and never highlights, which is the honest outcome.
  if (seekTime != null) return { type: 'seek', time: seekTime };
  return annotationId != null ? { type: 'wait' } : { type: 'none' };
}
