import { VideoService } from '@/services/videoService';
import type { Video } from '@/types/database';

export type PipelineSurfaceVideo =
  | Partial<Video>
  | Record<string, unknown>
  | null
  | undefined;

/**
 * Whether the Video / Pipeline output tab bar should show for the currently
 * loaded content.
 *
 * Three rules, each excluding a case for a different reason:
 *
 * - Dual mode is excluded because comparison annotations scope by
 *   `comparisonVideoId` and bypass `videoId` entirely, so a `surface` column
 *   does not apply to them, and a single pipeline output for a two-match
 *   comparison is incoherent.
 * - Share views are excluded because `loadAnnotations` returns early for a
 *   share link and takes its list from `ShareService`, which calls
 *   `getVideoAnnotations` with no surface argument and therefore returns
 *   BOTH surfaces. Tabs there would show every annotation in both tabs.
 * - Whether the video is an AWS pipeline video is derived from the loaded
 *   video itself, via `VideoService.isAwsVideo` - the one source of truth
 *   for what counts as an AWS pipeline video - rather than from the
 *   videoStore's `isAwsVideo` ref. That ref is set true on both load paths
 *   but only ever cleared by `resetForProjectSwitch`, so a path that skips
 *   the reset leaves it stale-true and would put the tab bar on a video that
 *   has no pipeline output.
 */
export function isPipelineSurfaceVisible(
  video: PipelineSurfaceVideo,
  playerMode: 'single' | 'dual',
  isSharedVideo: boolean
): boolean {
  if (!video) return false;
  if (playerMode !== 'single') return false;
  if (isSharedVideo) return false;

  return VideoService.isAwsVideo(video as Record<string, unknown>);
}
