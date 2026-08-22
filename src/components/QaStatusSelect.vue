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
import { computed } from 'vue';
import type { Video } from '@/types/database';
import type { QaStatusTarget } from '@/utils/qaStatus';
import { QA_STATUSES, isQaStatus, qaStatusLabel, qaStatusToneClass } from '@/utils/qaStatus';
import { useQaStatusWrite } from '@/composables/useQaStatusWrite';
import { formatRelativeTime } from '@/utils/relativeTime';

const props = defineProps<{
  video: QaStatusTarget;
  updatedByName?: string | undefined;
}>();

const emit = defineEmits<{ updated: [Video] }>();

const { current, updatedAt, saving, change } = useQaStatusWrite(
  () => props.video,
  (updated) => emit('updated', updated)
);

const attribution = computed(() => {
  if (!updatedAt.value) return '';
  const who = props.updatedByName ? `SET BY ${props.updatedByName}` : 'SET';
  return `${who} · ${formatRelativeTime(updatedAt.value)}`;
});

function onChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value;
  // A guard rather than a cast: the DOM hands back a string, and the module
  // that owns the vocabulary is the one place that should turn it into a
  // QaStatus.
  if (!isQaStatus(raw)) return;
  void change(raw);
}
</script>
