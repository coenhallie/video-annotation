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
 * The frame and fps to stamp on a new annotation, from the active surface's
 * current position.
 *
 * The video branch reads its currentFrame ref directly, unchanged from this
 * codebase's existing behaviour - that ref is already zero-based (video frame
 * 0 is video time 0), so it is exactly what buildAnnotationPayload needs to
 * derive a correct `timestamp: frame / fps`.
 *
 * The pipeline branch cannot do the same: frameWindow.ts documents the
 * pipeline's own frame number as "not zero-based" - it is whatever number the
 * pipeline itself assigned that frame, not a count from the start of this
 * replay window. Stamping that value directly would make buildAnnotationPayload
 * derive a timestamp far outside the replay's own duration. currentTime *is*
 * zero-based on the pipeline surface too (a replay's time 0 is wherever its
 * loaded window starts), so the pipeline branch derives the frame from that
 * instead - the same computation `openQuickPickAtTime` already does for a
 * scrubbed timeline position.
 */
export function annotationStampFor(
  surface: AnnotationSurface,
  video: TimelineNumbers,
  replay: TimelineNumbers
): { frame: number; fps: number } {
  if (surface === 'pipeline') {
    const fps = replay.fps || 30;
    return { frame: Math.round(replay.currentTime * fps), fps };
  }
  const fps = video.fps || 30;
  return { frame: video.currentFrame, fps };
}
