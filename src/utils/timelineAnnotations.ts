/**
 * The annotations the timeline draws: all of them, or, while the annotation
 * list is filtered by group or label, only the ones the list shows.
 *
 * `visibleIds` is what AnnotationPanel reports through `filter-change`: null
 * when nothing is filtered, otherwise the ids the filter keeps. Ids are
 * compared as strings because rows can carry numeric ids.
 */
export function timelineAnnotations<T extends { id?: string | number | null }>(
  annotations: T[],
  visibleIds: readonly string[] | null
): T[] {
  if (visibleIds === null) return annotations;
  const keep = new Set(visibleIds);
  return annotations.filter((annotation) => keep.has(String(annotation.id)));
}
