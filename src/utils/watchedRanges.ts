/**
 * Watched-coverage math for video watch tracking.
 * Ranges are half-open second intervals [start, end), kept sorted and merged.
 */
export type WatchedRange = [number, number];

export function mergeRanges(ranges: WatchedRange[]): WatchedRange[] {
  const sorted = ranges
    .filter(([start, end]) => Number.isFinite(start) && end > start)
    .slice()
    .sort((a, b) => a[0] - b[0]);

  const merged: WatchedRange[] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

export function addSecond(
  ranges: WatchedRange[],
  currentTime: number
): WatchedRange[] {
  if (!Number.isFinite(currentTime) || currentTime < 0) return ranges;
  const sec = Math.floor(currentTime);
  return mergeRanges([...ranges, [sec, sec + 1]]);
}

export function percentFromRanges(
  ranges: WatchedRange[],
  duration: number
): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const covered = mergeRanges(ranges).reduce(
    (sum, [start, end]) =>
      sum + Math.max(0, Math.min(end, duration) - Math.min(start, duration)),
    0
  );
  const percent = (covered / duration) * 100;
  return Math.min(100, Math.round(percent * 10) / 10);
}
