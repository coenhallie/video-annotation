<template>
  <!-- Every row gets one, not_started included: the column's job is telling
       states apart at a glance, and a gap cannot be told from unloaded data.
       w-24 on all five is what makes it a column rather than five ragged
       shapes; do not swap it for hug-content padding. -->
  <span
    data-testid="qa-status-pill"
    :class="[
      'inline-flex w-24 shrink-0 items-center justify-center rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider',
      qaStatusPillClass(status),
    ]"
    :title="`QA status: ${qaStatusLabel(status)}`"
  >
    {{ qaStatusLabel(status) }}
  </span>
</template>

<script setup lang="ts">
import type { QaStatus } from '@/types/database';
import { qaStatusLabel, qaStatusPillClass } from '@/utils/qaStatus';

defineProps<{ status: QaStatus }>();
</script>
