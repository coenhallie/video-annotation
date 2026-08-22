<template>
  <!-- The editable twin of QaStatusPill, and pixel-identical to it at rest:
       same w-24, same radius, same border, same five weights. Only hover and
       focus differ, so the column keeps scanning as one column.

       The hover signal is a neutral ring rather than a border colour change.
       A colour change would have to work against five palettes, and
       `production` is a filled pill whose border is part of its fill; a ring
       sits outside all of that and costs no layout.

       stop on click and mousedown because the row around this opens the
       details panel and is draggable. Without them, every status change also
       opens the panel, and a mousedown starts a drag instead of a menu. -->
  <select
    data-testid="qa-status-pill-select"
    draggable="false"
    :value="current"
    :disabled="saving"
    aria-label="QA status"
    :class="[
      'w-24 shrink-0 cursor-pointer appearance-none rounded-full border px-2 py-0.5 text-center font-mono text-[10px] tracking-wider transition-shadow',
      'hover:ring-2 hover:ring-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:hover:ring-white/10 dark:focus:ring-gray-400',
      'disabled:cursor-not-allowed disabled:opacity-40',
      qaStatusPillClass(current),
    ]"
    @click.stop
    @mousedown.stop
    @change.stop="onChange"
  >
    <option
      v-for="status in QA_STATUSES"
      :key="status"
      :value="status"
    >
      {{ qaStatusLabel(status) }}
    </option>
  </select>
</template>

<script setup lang="ts">
import type { Video } from '@/types/database';
import {
  QA_STATUSES,
  isQaStatus,
  qaStatusLabel,
  qaStatusPillClass,
  type QaStatusTarget,
} from '@/utils/qaStatus';
import { useQaStatusWrite } from '@/composables/useQaStatusWrite';

const props = defineProps<{ video: QaStatusTarget }>();
const emit = defineEmits<{ updated: [Video] }>();

const { current, saving, change } = useQaStatusWrite(
  () => props.video,
  (updated) => emit('updated', updated)
);

function onChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value;
  if (!isQaStatus(raw)) return;
  void change(raw);
}
</script>
