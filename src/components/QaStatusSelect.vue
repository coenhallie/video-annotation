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
          'hover:border-gray-200 focus:border-gray-300 focus:outline-none dark:hover:border-white/10 dark:focus:border-white/20',
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

watch(
  () => props.video.id,
  () => {
    current.value = props.video.qaStatus;
    updatedAt.value = props.video.qaStatusUpdatedAt;
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

  // Optimistic: the value moves now, and moves back if the write is refused.
  current.value = next;
  saving.value = true;

  try {
    const updated = await VideoService.setQaStatus(props.video.id, next);
    current.value = updated.qaStatus;
    updatedAt.value = updated.qaStatusUpdatedAt;
    emit('updated', updated);
  } catch (error) {
    current.value = previous;
    addNotification({
      type: 'error',
      title: 'Could not save QA status',
      message: error instanceof Error ? error.message : undefined,
    });
  } finally {
    saving.value = false;
  }
}
</script>
