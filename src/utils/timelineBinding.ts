import type { AnnotationSurface } from '@/types/database';

/** Everything VideoTimeline needs to draw itself. */
export interface TimelineNumbers {
  currentTime: number;
  duration: number;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  isPlaying: boolean;
}

/**
 * Pick which playback source the timeline shows.
 *
 * VideoTimeline is purely presentational, so a tab switch changes only which
 * set of numbers it is handed. The two clocks are deliberately independent and
 * this returns one or the other whole: blending fields would put one surface's
 * position on the other's duration, which is how a playhead ends up somewhere
 * that exists on neither.
 *
 * Unknown surfaces fall back to the video, which is the surface every project
 * has.
 */
export function timelineNumbersFor(
  surface: AnnotationSurface,
  video: TimelineNumbers,
  replay: TimelineNumbers
): TimelineNumbers {
  return surface === 'pipeline' ? replay : video;
}

/**
 * The frame and fps to stamp on a new annotation.
 *
 * Both must come from the surface the user is actually looking at. The video's
 * refs are meaningless on the pipeline tab, where the player is hidden and
 * paused: its currentFrame is usually 0, and its fps is typically 30 against a
 * replay that runs at 25.
 */
export function annotationStampFor(
  surface: AnnotationSurface,
  video: TimelineNumbers,
  replay: TimelineNumbers
): { frame: number; fps: number } {
  const active = timelineNumbersFor(surface, video, replay);
  return { frame: active.currentFrame, fps: active.fps || 30 };
}
