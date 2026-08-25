<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { getActivity, type ActivityTarget } from '@/services/activityService';
import {
  activityVerb,
  activitySubject,
  activityExcerpt,
  groupActivityByDay,
} from '@/utils/activityPhrasing';
import { formatTime } from '@/utils/formatters';
import { formatRelativeTime } from '@/utils/relativeTime';
import type { ActivityEntry } from '@/types/database';

const props = defineProps<{
  target: ActivityTarget | null;
  /** The History tab is the one on screen. Nothing loads until it is. */
  active: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-annotation', annotationId: string, timestamp: number): void;
}>();

const entries = ref<ActivityEntry[]>([]);
const loading = ref(false);

/**
 * Guards against a stale response overwriting a newer one when the target
 * changes mid-flight, the same pattern VideoDetailsPanel uses for watch
 * progress.
 */
let request = 0;

const load = async () => {
  if (!props.active || !props.target) return;
  const reqId = ++request;
  loading.value = true;
  const rows = await getActivity(props.target);
  if (request !== reqId) return;
  entries.value = rows;
  loading.value = false;
};

watch(
  () => [props.active, props.target] as const,
  () => {
    void load();
  },
  { immediate: true }
);

const groups = computed(() => groupActivityByDay(entries.value));

const annotationIdOf = (entry: ActivityEntry) =>
  entry.entityType === 'annotation'
    ? entry.entityId
    : (entry.summary.annotationId ?? '');

const onEntryClick = (entry: ActivityEntry) => {
  if (!entry.live) return;
  const id = annotationIdOf(entry);
  if (!id) return;
  emit('select-annotation', id, entry.summary.timestamp ?? 0);
};
</script>

<template>
  <div
    class="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-gray-900"
  >
    <header class="flex shrink-0 items-baseline gap-2.5 px-4 pb-3 pt-4">
      <h2
        class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white"
      >
        History
      </h2>
      <span class="font-mono text-[11px] text-gray-500 dark:text-gray-500">
        {{ entries.length }}
      </span>
    </header>

    <div class="flex-1 overflow-y-auto px-4 pb-4">
      <p
        v-if="loading && entries.length === 0"
        class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400"
      >
        Loading
      </p>

      <p
        v-else-if="entries.length === 0"
        data-testid="activity-empty"
        class="text-[13px] text-gray-500 dark:text-gray-400"
      >
        Nothing has happened on this video yet.
      </p>

      <template v-else>
        <section v-for="group in groups" :key="group.key" class="mb-4">
          <h3
            data-testid="activity-day"
            class="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400"
          >
            {{ group.label }}
          </h3>

          <!-- The rule is a border on the list, not a pseudo-element per row,
               so it stays continuous through entries of different heights. -->
          <ul class="border-l border-gray-200 pl-3 dark:border-white/10">
            <li v-for="entry in group.entries" :key="entry.id" class="relative py-1.5">
              <!-- The dot sits on the rule, 1px of overlap on each side so it
                   reads as a node rather than a bullet floating beside it. -->
              <span
                class="absolute -left-[17px] top-[13px] h-1.5 w-1.5 rounded-full"
                :class="
                  entry.live
                    ? 'bg-gray-400 dark:bg-gray-500'
                    : 'bg-gray-300 dark:bg-gray-700'
                "
              />

              <!-- A dead entry is a div, never a button: a control that does
                   nothing when clicked is worse than plain text. It must not
                   take focus and must not show a pointer cursor. -->
              <component
                :is="entry.live ? 'button' : 'div'"
                :type="entry.live ? 'button' : undefined"
                data-testid="activity-entry"
                class="block w-full text-left"
                :class="
                  entry.live
                    ? 'cursor-pointer'
                    : 'cursor-default text-gray-400 dark:text-gray-600'
                "
                @click="onEntryClick(entry)"
              >
                <span
                  class="text-[13px]"
                  :class="
                    entry.live
                      ? 'text-gray-900 dark:text-gray-200'
                      : 'text-gray-400 dark:text-gray-600'
                  "
                >
                  <span class="font-semibold">{{ entry.actor }}</span>
                  {{ ' ' }}{{ activityVerb(entry) }}{{ ' ' }}
                  <span :class="entry.live ? '' : 'line-through'">
                    {{ activitySubject(entry) }}
                  </span>
                </span>

                <span
                  class="ml-2 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
                >
                  {{ formatTime(entry.summary.timestamp ?? 0) }}
                  ·
                  {{ formatRelativeTime(entry.createdAt) }}
                </span>

                <span
                  v-if="activityExcerpt(entry)"
                  data-testid="activity-excerpt"
                  class="mt-0.5 block truncate text-[12px] text-gray-500 dark:text-gray-400"
                >
                  {{ activityExcerpt(entry) }}
                </span>
              </component>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>
