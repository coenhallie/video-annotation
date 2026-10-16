/**
 * Who may create annotations.
 *
 * This mirrors the `annotations` INSERT row-level security policies: annotating
 * is open to any signed-in user on anything they can see. Neither ownership nor
 * the view-only/can-annotate share permission restricts it.
 *
 * What a signed-in user can see differs by target:
 *
 * - A single video: every one. Since
 *   migrations/20261016_team_library_and_video_delete.sql the whole library is
 *   shared with every signed-in account, pipeline outputs and private uploads
 *   alike.
 * - A comparison: only their own, or one shared by link (`isPublic`).
 *   comparison_videos was deliberately not widened.
 *
 * The UI has to apply the same rule. Offering an annotate affordance the
 * database will reject only produces a 403
 * (`42501 new row violates row-level security policy for table "annotations"`)
 * after the user has already picked a label.
 *
 * Note this is deliberately *not* the same question as "may this viewer
 * comment": anonymous visitors can comment on a public video but can never
 * create an annotation, since every insert policy requires `auth.uid()`.
 */
export interface AnnotationTarget {
  /** True for a comparison; absent or false for a single video. */
  isComparison?: boolean | undefined;
  /**
   * The owner column of whatever is being annotated: `videos.ownerId` for a
   * single video, `comparison_videos.userId` for a comparison.
   */
  ownerId?: string | null | undefined;
  isPublic?: boolean | null | undefined;
  /** `videos.videoId`; absent for a comparison. */
  videoId?: string | null | undefined;
}

export function canCreateAnnotations(
  target: AnnotationTarget | null | undefined,
  userId: string | null | undefined
): boolean {
  // Every insert policy requires an authenticated identity.
  if (!userId || !target) return false;

  if (target.isComparison) {
    return target.isPublic === true || target.ownerId === userId;
  }

  return true;
}
