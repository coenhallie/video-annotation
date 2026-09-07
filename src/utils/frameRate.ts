/**
 * Frame-rate helpers for the frame counter.
 *
 * A video's frame rate is not exposed by the media element, and the `fps`
 * column on `videos` is a placeholder (30 for every pipeline row, 30 or -1 for
 * uploads), so the player has to find it out. Two sources are used, in
 * order:
 *
 * - The container. A fragmented mp4 streamed through MSE carries a fixed
 *   sample duration per fragment, so the rate is exact from the header:
 *   see fragmentedMp4Source's `fps`.
 * - Measurement, for anything native. `requestVideoFrameCallback` reports
 *   the `mediaTime` of every frame it presents, and that advances by exactly
 *   one frame's worth per presented frame no matter how the wall clock
 *   stutters. The old estimator counted callbacks against wall-clock time,
 *   which under load read 24 for a 25 fps stream.
 */

/** Rates worth snapping to when a measurement lands within `tolerance`. */
export const COMMON_FRAME_RATES = [
  23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120,
] as const;

/**
 * The nearest common rate when the measurement is within `tolerance` of one
 * (a fraction, default 1%), else the measurement rounded to three decimals.
 */
export function snapFrameRate(fps: number, tolerance = 0.01): number {
  let best: number = COMMON_FRAME_RATES[0];
  for (const rate of COMMON_FRAME_RATES) {
    if (Math.abs(rate - fps) < Math.abs(best - fps)) best = rate;
  }
  return Math.abs(best - fps) / best <= tolerance ? best : Math.round(fps * 1000) / 1000;
}

/** Deltas needed before a measurement is trusted. */
export const MIN_FRAME_DELTAS = 8;

/**
 * Frame rate from the `mediaTime` of consecutively presented frames, or null
 * while there are too few to say.
 *
 * The median of the deltas is used rather than their mean: a dropped frame
 * shows up as a delta of two (or more) frames, and a seek as a huge or
 * negative one, and neither should move the answer. Deltas that are not
 * positive or that exceed one second are discarded outright.
 */
export function frameRateFromMediaTimes(
  mediaTimes: readonly number[]
): number | null {
  const deltas: number[] = [];
  for (let i = 1; i < mediaTimes.length; i++) {
    const d = (mediaTimes[i] as number) - (mediaTimes[i - 1] as number);
    if (d > 0 && d <= 1) deltas.push(d);
  }
  if (deltas.length < MIN_FRAME_DELTAS) return null;
  deltas.sort((a, b) => a - b);
  const mid = deltas.length >> 1;
  const median =
    deltas.length % 2
      ? (deltas[mid] as number)
      : ((deltas[mid - 1] as number) + (deltas[mid] as number)) / 2;
  return snapFrameRate(1 / median);
}
