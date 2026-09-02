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
 * Every single-video project gets the tab bar, whether or not it has pipeline
 * output: the pipeline tab says it is empty, which is the honest answer for a
 * plain upload and for a pipeline video whose output has not landed yet. It is
 * deliberately not gated on the video being an AWS pipeline video - that gate
 * hid the tab on every hand-uploaded project, which is most of them.
 *
 * Two cases are still excluded, each for a reason that would otherwise show
 * wrong annotations rather than an empty pane:
 *
 * - Dual mode, because comparison annotations scope by `comparisonVideoId` and
 *   bypass `videoId` entirely, so the `surface` column does not apply to them,
 *   and a single pipeline output for a two-match comparison is incoherent.
 * - Share views, because `loadAnnotations` returns early for a share link and
 *   takes its list from `ShareService`, which calls `getVideoAnnotations` with
 *   no surface argument and therefore returns BOTH surfaces. Tabs there would
 *   show every annotation in both tabs.
 */
export function isPipelineSurfaceVisible(
  video: PipelineSurfaceVideo,
  playerMode: 'single' | 'dual',
  isSharedVideo: boolean
): boolean {
  if (!video) return false;
  if (playerMode !== 'single') return false;
  if (isSharedVideo) return false;

  return true;
}
