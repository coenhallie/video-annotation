/**
 * Who may create annotations.
 *
 * This mirrors the `annotations` INSERT row-level security policies (see
 * migrations/20260817_open_annotations_to_all_users.sql): annotating is open to
 * any signed-in user on any video they can see. Neither ownership nor the
 * view-only/can-annotate share permission restricts it.
 *
 * "Can see" means `isPublic`, their own, or a pipeline output - the same
 * reachability the SELECT policies grant. A private upload belonging to
 * someone else is not readable in the first place. Pipeline outputs (a
 * `videos.videoId` of `aws:<outputVideoId>`) are readable and annotatable by
 * every signed-in account since migrations/20260903_rename_video.sql, whose
 * policies test `"videoId" LIKE 'aws:%'` directly; the same prefix test lives
 * in VideoService.isAwsVideo and the storage proxy. Comparison targets carry
 * no `videoId`, and those policies require one, so the clause never applies
 * to them.
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
  /**
   * The owner column of whatever is being annotated: `videos.ownerId` for a
   * single video, `comparison_videos.userId` for a comparison.
   */
  ownerId?: string | null | undefined;
  isPublic?: boolean | null | undefined;
  /** `videos.videoId`; absent for a comparison. */
  videoId?: string | null | undefined;
}

/** The predicate the pipeline-output policies use: `"videoId" LIKE 'aws:%'`. */
function isPipelineOutput(videoId: string | null | undefined): boolean {
  return typeof videoId === 'string' && videoId.startsWith('aws:');
}

export function canCreateAnnotations(
  target: AnnotationTarget | null | undefined,
  userId: string | null | undefined
): boolean {
  // Every insert policy requires an authenticated identity.
  if (!userId || !target) return false;

  return (
    target.isPublic === true ||
    target.ownerId === userId ||
    isPipelineOutput(target.videoId)
  );
}
