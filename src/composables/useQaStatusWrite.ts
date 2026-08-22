import { ref, watch, type Ref } from 'vue';
import type { QaStatus, Video } from '@/types/database';
import { type QaStatusTarget, toQaStatus } from '@/utils/qaStatus';
import { VideoService } from '@/services/videoService';
import { useNotifications } from '@/composables/useNotifications';

/**
 * The one write path for a video's QA status, shared by the details-panel
 * control and the dashboard list's inline control.
 *
 * Deliberately a composable and not duplicated markup logic: this is the code
 * that produced the single Critical finding in the feature's final review, and
 * a second copy inside a component that renders 171 times would be a second
 * copy of that bug.
 *
 * `target` is a getter rather than a value so the composable can re-read the
 * caller's prop AFTER an await. Comparing ids across the await is the whole
 * defence: a control can be swapped to a different video mid-write.
 */
export function useQaStatusWrite(
  target: () => QaStatusTarget,
  onUpdated: (video: Video) => void
): {
  current: Ref<QaStatus>;
  updatedAt: Ref<string | undefined>;
  saving: Ref<boolean>;
  change: (next: QaStatus) => Promise<void>;
} {
  const { addNotification } = useNotifications();

  // Through toQaStatus, not straight off the target: a video loaded before the
  // qaStatus migration lands carries undefined, which would leave the select
  // on no option at all rather than on a word.
  const current = ref<QaStatus>(toQaStatus(target().qaStatus));
  const updatedAt = ref<string | undefined>(target().qaStatusUpdatedAt);
  const saving = ref(false);

  // Follows the target's value, not just its identity: a caller that mutates
  // the same video object in place (Object.assign from a refetch, for
  // instance) changes qaStatus/qaStatusUpdatedAt without changing id, and a
  // watch keyed on id alone would leave a mounted control silently stale.
  // While a write is in flight (saving), `change` already owns
  // `current`/`updatedAt` end to end, so an incoming mutation for the *same*
  // video is either our own resolved write echoed back through the caller, or
  // a stale value racing our optimistic one - either way, acting on it here
  // would flicker or revert the control mid-write. A genuine video swap (id
  // changes) always takes effect immediately, even mid-write, since that is a
  // different control's value.
  watch(
    () => [target().id, target().qaStatus, target().qaStatusUpdatedAt] as const,
    ([nextId, nextStatus, nextUpdatedAt], previous) => {
      const [previousId] = previous ?? [];
      if (saving.value && nextId === previousId) return;
      current.value = toQaStatus(nextStatus);
      updatedAt.value = nextUpdatedAt;
    }
  );

  async function change(next: QaStatus): Promise<void> {
    const previous = current.value;
    if (next === previous) return;

    // Captured before the await: the caller's target can be swapped out from
    // under this same mounted instance while the write is in flight (a
    // parent with no `:key` reusing this control across a project switch),
    // and the write must be judged against the video it started on, not
    // whatever is displayed by the time it resolves.
    const targetId = target().id;

    // Optimistic: the value moves now, and moves back if the write is refused.
    current.value = next;
    saving.value = true;

    try {
      const updated = await VideoService.setQaStatus(targetId, next);
      // The control may now belong to a different video than the one this
      // write started on. Applying the resolved row here would show this
      // video's stale status on top of whatever is really displayed, and
      // emitting it would hand the caller a row for the wrong video under the
      // right one's name - exactly the "denied write looks like a success"
      // failure the RPC itself guards against, reintroduced client-side.
      if (target().id !== targetId) return;
      current.value = updated.qaStatus;
      updatedAt.value = updated.qaStatusUpdatedAt;
      onUpdated(updated);
    } catch (error) {
      // The rollback is video-specific and must stay guarded: writing
      // `previous` into `current` here would corrupt whatever video is now
      // displayed. The notification is not video-specific, and the user still
      // needs to know their save was refused even after switching away -
      // silently swallowing it would be the same "denied write looks like a
      // success" failure this whole guard exists to prevent, just moved to the
      // error path.
      if (target().id === targetId) current.value = previous;
      addNotification({
        type: 'error',
        title: 'Could not save QA status',
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      // Reset unconditionally, even if the video swapped mid-write: the write
      // this flag was tracking has concluded either way, and the control is
      // disabled while `saving` is true, so nothing else could have started a
      // second write for whatever video is now displayed.
      saving.value = false;
    }
  }

  return { current, updatedAt, saving, change };
}
