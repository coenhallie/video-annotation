<template>
  <div
    class="flex h-full flex-col border-l border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900"
  >
    <!-- Header -->
    <div class="border-b border-gray-200 p-4 dark:border-white/10">
      <div class="flex items-start justify-between gap-2">
        <h2 class="truncate text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
          {{ project.title }}
        </h2>
        <button
          type="button"
          class="shrink-0 rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          title="Close"
          @click="emit('close')"
        >
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="mt-3 aspect-video overflow-hidden rounded bg-gray-100 dark:bg-white/5">
        <img
          v-if="project.thumbnailUrl"
          :src="project.thumbnailUrl"
          :alt="project.title"
          class="h-full w-full object-cover"
        >
      </div>

      <!-- One mono meta line instead of a pill plus four sizes of grey. -->
      <div
        class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
      >
        <span>{{ project.projectType === 'dual' ? 'DUAL' : 'SINGLE' }}</span>
        <span>·</span>
        <span>{{ formatDuration(getDuration()) }}</span>
        <span>·</span>
        <span>{{ formatDate(project.createdAt) }}</span>
        <template v-if="project.owner">
          <span>·</span>
          <span class="truncate">{{ project.owner.name }}</span>
        </template>
      </div>
    </div>

    <!-- Stat row -->
    <div class="flex items-baseline gap-6 border-b border-gray-200 px-4 py-3 dark:border-white/10">
      <div class="flex items-baseline gap-2">
        <span class="font-mono text-[13px] text-gray-900 dark:text-white">{{ annotationCount }}</span>
        <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
          Annotations
        </span>
      </div>
      <div class="flex items-baseline gap-2">
        <span class="font-mono text-[13px] text-gray-900 dark:text-white">{{ commentCount }}</span>
        <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
          Comments
        </span>
      </div>
    </div>

    <!-- QA status. Its own bordered block, matching the Watched block below:
         one row of per-video state per block. -->
    <div
      v-if="project.projectType === 'single'"
      class="border-b border-gray-200 px-4 py-3 dark:border-white/10"
    >
      <!-- updated-by-name is the video's OWNER, not necessarily whoever set
           the status: qaStatusUpdatedBy has no name lookup yet, since
           fetchOwners is keyed on owner ids only. Known approximation.

           Suppressed when the lookup failed: fetchOwners fills unresolved ids
           with the placeholder "Unknown", and "SET BY Unknown" reads worse than
           the plain "SET" the attribution falls back to. -->
      <QaStatusSelect
        :video="project.video"
        :updated-by-name="attributionName"
        @updated="onQaStatusUpdated"
      />
    </div>

    <!-- Team watch coverage (union of all users' ranges; hover for breakdown).
         The bar is the only graphic here, so it stays thin and monochrome:
         the number carries the reading, the bar just shapes it. -->
    <div
      v-if="watchProgress.length > 0"
      class="border-b border-gray-200 px-4 py-3 dark:border-white/10"
    >
      <div class="group relative">
        <div class="flex items-baseline gap-2">
          <h3 class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            Watched
          </h3>
          <span class="ml-auto font-mono text-[11px] tracking-wider text-gray-500 dark:text-gray-400">
            {{ Math.round(coveragePercent) }}%
          </span>
        </div>

        <div class="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
          <div
            class="h-full rounded-full bg-gray-900 dark:bg-gray-300"
            :style="{ width: `${coveragePercent}%` }"
          />
        </div>

        <!-- Per-user breakdown, unchanged in behaviour: hover only, and it
             never eats the pointer. -->
        <div
          class="pointer-events-none absolute bottom-full left-0 z-10 mb-2 hidden min-w-48 space-y-1 rounded border border-gray-200 bg-white px-3 py-2 shadow-lg group-hover:block dark:border-white/10 dark:bg-gray-900"
        >
          <div
            v-for="w in watchProgress"
            :key="w.userId"
            class="flex items-center justify-between gap-4 whitespace-nowrap"
          >
            <span class="max-w-40 truncate text-[11px] text-gray-700 dark:text-gray-200">
              {{ w.user.name }}
            </span>
            <span class="font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400">
              {{ Math.round(w.percentWatched) }}% · {{ formatDuration(watchedSeconds(w)) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Annotations list -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <div
        v-if="loading"
        class="space-y-2 p-4"
      >
        <div
          v-for="n in 4"
          :key="n"
          class="h-10 animate-pulse rounded bg-gray-100 dark:bg-white/5"
        />
      </div>
      <div
        v-else-if="annotations.length === 0"
        class="px-4 py-10 text-center text-[12px] text-gray-600 dark:text-gray-400"
      >
        No annotations yet.
      </div>
      <!-- Same row shape as AnnotationCard: colour dot, uppercase identity
           line, mono timecode. No rules between rows - the hover tint separates
           them. -->
      <ul
        v-else
        class="px-1 py-1"
      >
        <li
          v-for="a in annotations"
          :key="String(a.id)"
          class="flex cursor-pointer items-start gap-3 rounded px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
          @click="emit('annotation-click', project, a)"
        >
          <span
            class="mt-[7px] h-2 w-2 shrink-0 rounded-full"
            :style="{ backgroundColor: a.color || '#6b7280' }"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline justify-between gap-2">
              <span
                class="truncate text-[13px] font-medium uppercase tracking-[0.06em] text-gray-700 dark:text-gray-200"
              >
                {{ a.title || 'Untitled' }}
              </span>
              <span
                class="shrink-0 font-mono text-[11px] tracking-wider text-gray-500 dark:text-gray-400"
              >
                {{ formatTimestamp(a.timestamp) }}
              </span>
            </div>
            <p
              v-if="note(a)"
              class="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400"
            >
              {{ note(a) }}
            </p>
            <!-- Labels read as dots plus names, not filled chips: the colour is
                 the only thing that has to be the label's own. -->
            <div
              v-if="extraLabels(a).length > 0"
              class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"
            >
              <span
                v-for="label in extraLabels(a)"
                :key="label.id"
                class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :style="{ backgroundColor: label.color }"
                />
                {{ label.name }}
              </span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2 border-t border-gray-200 p-4 dark:border-white/10">
      <button
        type="button"
        class="flex-1 rounded bg-gray-900 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
        @click="emit('open', project)"
      >
        Open editor
      </button>
      <button
        type="button"
        class="rounded px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        @click="emit('share', project)"
      >
        Share
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Project } from '@/types/project';
import type { PanelAnnotation } from '@/composables/useVideoDetails';
import type { Label } from '@/types/labels';
import type { Video } from '@/types/database';
import QaStatusSelect from './QaStatusSelect.vue';
import { UNKNOWN_OWNER_NAME } from '@/services/ownerEnrichmentService';
import {
  getProgressForVideo,
  mergeDualProgress,
  type UserWatchProgress,
} from '@/services/watchProgressService';
import { percentFromRanges, sanitizeRanges } from '@/utils/watchedRanges';

const props = defineProps<{
  project: Project;
  annotations: PanelAnnotation[];
  loading: boolean;
  annotationCount: number;
  commentCount: number;
  labelMap?: Map<string, Label>;
}>();

const emit = defineEmits<{
  close: [];
  open: [project: Project];
  share: [project: Project];
  'annotation-click': [project: Project, annotation: PanelAnnotation];
  'qa-status-updated': [project: Project, updated: Video];
}>();

// fetchOwners guarantees an entry for every requested id, filling unresolved
// ones with a placeholder rather than omitting them. Printing that placeholder
// into "SET BY ..." states a falsehood about who acted, so drop it and let the
// attribution line fall back to a bare "SET".
const attributionName = computed(() => {
  const name = props.project.owner?.name;
  return name && name !== UNKNOWN_OWNER_NAME ? name : undefined;
});

// Up, not sideways - the same route the dashboard row already takes.
//
// This panel used to merge into props.project.video itself. That kept the two
// surfaces in step, because they share one project object, but it meant a
// status changed from here never reached DashboardView. So a change that a
// filter excludes made the row vanish from the list beside the panel with no
// explanation, while the identical change made from the row explained itself.
// Emitting instead gives both paths one handler, one merge and one toast.
function onQaStatusUpdated(updated: Video) {
  if (props.project.projectType !== 'single') return;
  emit('qa-status-updated', props.project, updated);
}

const watchProgress = ref<UserWatchProgress[]>([]);
// True team coverage: the union of everyone's watched ranges, so overlap
// doesn't double-count (ten people watching the same first 10% ⇒ 10%).
const coveragePercent = ref(0);

// Union coverage of one video across all users. DB-sourced ranges are
// untrusted (no RLS) — sanitize before any range math.
function unionPercent(rows: UserWatchProgress[], duration: number): number {
  return percentFromRanges(
    rows.flatMap((r) => sanitizeRanges(r.watchedRanges)),
    duration
  );
}

// Approximate per-user watch time from their stored percentage — for dual
// projects percentWatched is min(A, B), so exact seconds aren't recoverable.
function watchedSeconds(w: UserWatchProgress): number {
  return Math.round((w.percentWatched / 100) * getDuration());
}
// Monotonic token so only the latest request may commit its result —
// id-equality alone can't order two in-flight fetches for the same project.
let watchProgressReq = 0;

watch(
  () => props.project,
  async (project) => {
    const reqId = ++watchProgressReq;
    watchProgress.value = [];
    coveragePercent.value = 0;
    if (!project) return;
    if (project.projectType === 'single') {
      const rows = await getProgressForVideo(project.video.id);
      if (watchProgressReq !== reqId) return;
      watchProgress.value = rows;
      coveragePercent.value = unionPercent(rows, project.video.duration);
    } else {
      const [a, b] = await Promise.all([
        getProgressForVideo(project.videoA.id),
        getProgressForVideo(project.videoB.id),
      ]);
      if (watchProgressReq !== reqId) return;
      watchProgress.value = mergeDualProgress(a, b);
      // Dual coverage mirrors per-user dual semantics: a video only counts
      // as covered where BOTH sides have been seen ⇒ take the lower side.
      coveragePercent.value = Math.min(
        unionPercent(a, project.videoA.duration),
        unionPercent(b, project.videoB.duration)
      );
    }
  },
  { immediate: true }
);

function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

function getDuration(): number {
  if (props.project.projectType === 'single') {
    return props.project.video.duration;
  }
  return Math.max(
    props.project.videoA?.duration || 0,
    props.project.videoB?.duration || 0
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function resolveLabels(ids: string[]): Label[] {
  if (!props.labelMap) return [];
  const result: Label[] = [];
  for (const id of ids) {
    const label = props.labelMap.get(id);
    if (label) result.push(label);
  }
  return result;
}

/**
 * The row's second line, or '' when it would only repeat the title. Many
 * annotations carry their label name as the title and the same words as the
 * content, and printing both says nothing twice.
 */
function note(a: PanelAnnotation): string {
  const content = (a.content || '').trim();
  const title = (a.title || '').trim();
  return content.toLowerCase() === title.toLowerCase() ? '' : content;
}

/**
 * Labels worth printing under the row. An annotation's title is usually its
 * first label's name, so listing that label again just says the same thing
 * twice - the dot beside the title already carries its colour.
 */
function extraLabels(a: PanelAnnotation): Label[] {
  const title = (a.title || '').trim().toLowerCase();
  return resolveLabels(a.labels ?? []).filter(
    (label) => label.name.trim().toLowerCase() !== title
  );
}
</script>
