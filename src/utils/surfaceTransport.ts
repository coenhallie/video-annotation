/** Play, pause and frame-step, for one playback source. */
export interface Transport {
  isPlaying(): boolean;
  play(): void;
  pause(): void;
  step(frames: number): void;
}

/**
 * One transport that always drives the surface on screen.
 *
 * The Video and Pipeline tabs have independent clocks. Everything that controls
 * playback from outside a player - Space, the arrow keys, the pause on entering
 * comment or draw mode - has to pick the visible one, and picking per call site
 * is how the pipeline tab ended up with Space playing the hidden video's audio
 * and draw mode leaving the replay running under the drawing.
 *
 * `onPipeline` is read on every call, so a tab switch needs no rewiring.
 */
export function surfaceTransport(
  onPipeline: () => boolean,
  video: Transport,
  replay: Transport
): Transport {
  const active = () => (onPipeline() ? replay : video);
  return {
    isPlaying: () => active().isPlaying(),
    play: () => active().play(),
    pause: () => active().pause(),
    step: (frames) => active().step(frames),
  };
}

/**
 * Where a frame step lands on the replay's clock. The replay has no frame-step
 * of its own, only seek; this moves its time by whole frame durations and
 * leaves choosing the record for that time to the replay, which shows records
 * as they are.
 */
export function replayStepTarget(
  replay: { currentTime: number; fps: number; duration: number },
  frames: number
): number {
  const fps = replay.fps || 30;
  const target = replay.currentTime + frames / fps;
  return Math.min(Math.max(target, 0), replay.duration);
}
