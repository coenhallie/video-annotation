// Where an annotation sits in the list: the time its row shows and sorts by.
//
// A comparison row stands for video A, like its frame token. Rows saved before
// the capture was fixed hold `timestamp` 0 beside a correct per-video position,
// so that position is read here instead of rewriting stored data.

export interface ListTimeSource {
  timestamp?: number | null;
  videoAFrame?: number | null;
  videoATimestamp?: number | null;
}

export function annotationListTime(
  annotation: ListTimeSource,
  context: { isDualMode: boolean; fps: number }
): number {
  const timestamp =
    typeof annotation.timestamp === 'number' ? annotation.timestamp : 0;
  if (!context.isDualMode) return timestamp;
  if (typeof annotation.videoATimestamp === 'number') {
    return annotation.videoATimestamp;
  }
  if (typeof annotation.videoAFrame === 'number') {
    return annotation.videoAFrame / (context.fps > 0 ? context.fps : 30);
  }
  return timestamp;
}
