<template>
  <div>
    <div class="flex items-baseline gap-2">
      <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        QA
      </span>

      <!-- A native select, the same choice VideoControls makes for playback
           speed: keyboard, screen reader and touch behaviour come free, and it
           needs no popover, no menu and no outside-click handling. Borderless
           until hover and focus, so at rest it reads as one more meta token
           that happens to be editable. -->
      <select
        data-testid="qa-status-select"
        :value="current"
        :disabled="saving"
        aria-label="QA status"
        :class="[
          'ml-auto cursor-pointer appearance-none rounded border border-transparent bg-transparent py-0.5 pl-1 pr-1 font-mono text-[10px] tracking-wider transition-colors',
          'hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:hover:border-white/10 dark:focus:ring-gray-400',
          'disabled:cursor-not-allowed disabled:opacity-40',
          qaStatusToneClass(current),
        ]"
        @change="onChange"
      >
        <option
          v-for="status in QA_STATUSES"
          :key="status"
          :value="status"
        >
          {{ qaStatusLabel(status) }}
        </option>
      </select>
    </div>

    <!-- Who last touched it. A status with no author is unattributable in a
         tool several people share. -->
    <p
      v-if="attribution"
      data-testid="qa-status-attribution"
      class="mt-1 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
    >
      {{ attribution }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { QaStatus, Video } from '@/types/database';
import type { QaStatusTarget } from '@/utils/qaStatus';
import {
  QA_STATUSES,
  isQaStatus,
  qaStatusLabel,
  qaStatusToneClass,
} from '@/utils/qaStatus';
import { VideoService } from '@/services/videoService';
import { useNotifications } from '@/composables/useNotifications';
import { formatRelativeTime } from '@/utils/relativeTime';

const props = defineProps<{
  video: QaStatusTarget;
  updatedByName?: string | undefined;
}>();

const emit = defineEmits<{ updated: [Video] }>();

const { addNotification } = useNotifications();

const current = ref<QaStatus>(props.video.qaStatus);
const updatedAt = ref<string | undefined>(props.video.qaStatusUpdatedAt);
const saving = ref(false);

// Follows the prop, not just the prop's identity: a parent that mutates the
// same video object in place (Object.assign from a refetch, for instance)
// changes qaStatus/qaStatusUpdatedAt without changing id, and a watch keyed
// on id alone would leave a mounted select silently stale. While a write is
// in flight (saving), onChange already owns `current`/`updatedAt` end to
// end, so an incoming prop mutation for the *same* video is either our own
// resolved write echoed back through the parent, or a stale value racing our
// optimistic one - either way, acting on it here would flicker or revert the
// control mid-write. A genuine video swap (id changes) always takes effect
// immediately, even mid-write, since that is a different control's value.
watch(
  () => [props.video.id, props.video.qaStatus, props.video.qaStatusUpdatedAt] as const,
  ([nextId, nextStatus, nextUpdatedAt], previous) => {
    const [previousId] = previous ?? [];
    if (saving.value && nextId === previousId) return;
    current.value = nextStatus;
    updatedAt.value = nextUpdatedAt;
  }
);

const attribution = computed(() => {
  if (!updatedAt.value) return '';
  const who = props.updatedByName ? `SET BY ${props.updatedByName}` : 'SET';
  return `${who} · ${formatRelativeTime(updatedAt.value)}`;
});

async function onChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value;
  // A guard rather than a cast: the DOM hands back a string, and the one place
  // that turns a string into a QaStatus should be the module that owns the
  // vocabulary.
  if (!isQaStatus(raw)) return;

  const next = raw;
  const previous = current.value;
  if (next === previous) return;

  // Captured before the await: `props.video` can be swapped out from under
  // this same mounted instance while the write is in flight (a parent with
  // no `:key` reusing this control across a project switch), and the write
  // must be judged against the video it started on, not whatever is
  // displayed by the time it resolves.
  const targetId = props.video.id;

  // Optimistic: the value moves now, and moves back if the write is refused.
  current.value = next;
  saving.value = true;

  try {
    const updated = await VideoService.setQaStatus(targetId, next);
    // The control may now belong to a different video than the one this
    // write started on. Applying the resolved row here would show this
    // video's stale status on top of whatever is really displayed, and
    // emitting it would hand the parent a row for the wrong video under the
    // right one's name - exactly the "denied write looks like a success"
    // failure the RPC itself guards against, reintroduced client-side.
    if (props.video.id !== targetId) return;
    current.value = updated.qaStatus;
    updatedAt.value = updated.qaStatusUpdatedAt;
    emit('updated', updated);
  } catch (error) {
    // The rollback is video-specific and must stay guarded: writing
    // `previous` into `current` here would corrupt whatever video is now
    // displayed. The notification is not video-specific, and the user still
    // needs to know their save was refused even after switching away -
    // silently swallowing it would be the same "denied write looks like a
    // success" failure this whole guard exists to prevent, just moved to the
    // error path.
    if (props.video.id === targetId) current.value = previous;
    addNotification({
      type: 'error',
      title: 'Could not save QA status',
      message: error instanceof Error ? error.message : undefined,
    });
  } finally {
    // Reset unconditionally, even if the video swapped mid-write: the write
    // this flag was tracking has concluded either way, and the select is
    // disabled while `saving` is true, so nothing else could have started a
    // second write for whatever video is now displayed.
    saving.value = false;
  }
}
</script>
