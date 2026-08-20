import { watch, type Ref } from 'vue';
import { recordOpen, type OpenTarget } from '@/services/recentOpensService';

/**
 * Records "this user opened this project" once per editor mount, per project.
 *
 * Every editor entry path - dashboard click, pasted URL, ?t= annotation deep
 * link, AWS outputVideo link, share link - ends by setting the video store's
 * currentVideoId or currentComparisonId, so watching those two covers all of
 * them without touching a single load branch.
 *
 * `isAppLoading` is the gate. The video store is a singleton that keeps the
 * previously-opened project across editor unmount/remount, so writing on mount
 * without it would bump the wrong project. It is also what makes re-opening
 * the SAME project refresh its timestamp: isAppLoading is a per-mount ref, so
 * it transitions again even when the ids do not change.
 */
export function useRecordProjectOpen(options: {
  currentVideoId: Ref<string | null>;
  currentComparisonId: Ref<string | null>;
  isAppLoading: Ref<boolean>;
  userId: Ref<string | null | undefined>;
}): void {
  const { currentVideoId, currentComparisonId, isAppLoading, userId } = options;

  // Per-mount, not module-level: a fresh editor mount must be able to record
  // the same project again.
  let lastRecordedKey: string | null = null;

  watch(
    [currentVideoId, currentComparisonId, isAppLoading, userId],
    ([videoId, comparisonId, loading, uid]) => {
      if (loading) return;
      // No signed-in user: an anonymous share-link visitor. Nothing to
      // attribute an open to, so nothing is written.
      if (!uid) return;

      const projectId = videoId ?? comparisonId;
      if (!projectId) return;

      const key = `${uid}:${projectId}`;
      if (key === lastRecordedKey) return;
      lastRecordedKey = key;

      const target: OpenTarget = videoId
        ? { videoId }
        : { comparisonVideoId: comparisonId as string };
      void recordOpen(uid, target);
    }
  );
}
