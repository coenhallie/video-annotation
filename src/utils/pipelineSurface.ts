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
 * Share views get the tab bar too. A share link is meant to show the project
 * as its owner sees it, pipeline output included, and the share-view
 * annotation load is scoped to the active surface the same way the signed-in
 * one is (see useVideoAnnotations and ShareService), so each tab lists only
 * its own annotations. The pipeline data itself is fetched through the AWS
 * proxy, whose visibility check applies the `videos` SELECT policy to whoever
 * is asking - a public video is readable by an anonymous share visitor.
 *
 * Dual mode is still excluded, and for a reason that would otherwise show
 * wrong annotations rather than an empty pane: comparison annotations scope by
 * `comparisonVideoId` and bypass `videoId` entirely, so the `surface` column
 * does not apply to them, and a single pipeline output for a two-match
 * comparison is incoherent.
 */
export function isPipelineSurfaceVisible(
  video: PipelineSurfaceVideo,
  playerMode: 'single' | 'dual'
): boolean {
  if (!video) return false;
  if (playerMode !== 'single') return false;

  return true;
}
