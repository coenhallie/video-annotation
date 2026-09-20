import type { Annotation, AnnotationSurface } from '@/types/database';

/** One realtime binding: a server-side filter, and the client-side check on top. */
export interface RealtimeSource {
  /** `postgres_changes` takes a single column filter per binding. */
  filter: string;
  /**
   * The row as the local list should hold it, or null when the row passed the
   * server filter but is not part of the list on screen.
   */
  accept: (row: Annotation) => Annotation | null;
}

export interface RealtimeScope {
  channel: string;
  sources: RealtimeSource[];
}

/**
 * What the open project has to listen to for its annotation list to stay live.
 * It mirrors the loaders: whatever they would return for a row, this accepts,
 * and nothing else, so a live list and a reloaded one are the same list.
 */
export function annotationRealtimeScope(input: {
  playerMode: 'single' | 'dual';
  videoId: string | null;
  surface: AnnotationSurface;
  comparison: { id: string; videoAId: string; videoBId: string } | null;
}): RealtimeScope | null {
  if (input.playerMode === 'single') {
    if (!input.videoId) return null;
    const { surface } = input;
    return {
      channel: `video_annotations:${input.videoId}`,
      sources: [
        {
          filter: `videoId=eq.${input.videoId}`,
          // The Video and Pipeline tabs share one video row, so an insert from
          // the other tab arrives here too; letting it in puts a phantom marker
          // on the timeline. Rows from before the surface column existed are
          // 'video' by its default.
          accept: (row) =>
            ((row as { surface?: AnnotationSurface }).surface ?? 'video') ===
            surface
              ? row
              : null,
        },
      ],
    };
  }

  const comparison = input.comparison;
  if (!comparison?.id) return null;

  // A video's own annotations, shown beside the comparison's. The loader reads
  // them with projectId null and tags each with the side it belongs to.
  const side = (
    videoId: string,
    videoContext: 'video_a' | 'video_b'
  ): RealtimeSource => ({
    filter: `videoId=eq.${videoId}`,
    accept: (row) => (row.projectId == null ? { ...row, videoContext } : null),
  });

  return {
    channel: `comparison_annotations:${comparison.id}`,
    sources: [
      { filter: `comparisonVideoId=eq.${comparison.id}`, accept: (row) => row },
      ...(comparison.videoAId ? [side(comparison.videoAId, 'video_a')] : []),
      ...(comparison.videoBId ? [side(comparison.videoBId, 'video_b')] : []),
    ],
  };
}
