<template>
  <div
    class="flex flex-col h-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700"
  >
    <!-- Header -->
    <div class="p-4 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-start justify-between gap-2">
        <h2 class="font-semibold text-gray-900 dark:text-white truncate">
          {{ project.title }}
        </h2>
        <button
          class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"
          title="Close"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="mt-3 aspect-video bg-gray-100 dark:bg-gray-900 rounded-md overflow-hidden">
        <img
          v-if="project.thumbnailUrl"
          :src="project.thumbnailUrl"
          :alt="project.title"
          class="w-full h-full object-cover"
        >
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span
          class="inline-flex items-center px-2 py-0.5 rounded-full font-medium"
          :class="project.projectType === 'dual'
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'"
        >
          {{ project.projectType === 'dual' ? 'Dual' : 'Single' }}
        </span>
        <span v-if="project.owner">{{ project.owner.name }}</span>
        <span>{{ formatDate(project.createdAt) }}</span>
        <span>{{ formatDuration(getDuration()) }}</span>
      </div>
    </div>

    <!-- Stat row -->
    <div class="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700 border-b border-gray-200 dark:border-gray-700">
      <div class="p-3 text-center">
        <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ annotationCount }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Annotations</div>
      </div>
      <div class="p-3 text-center">
        <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ commentCount }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Comments</div>
      </div>
    </div>

    <!-- Team watch coverage (union of all users' ranges; hover for breakdown) -->
    <div
      v-if="watchProgress.length > 0"
      class="p-4 border-b border-gray-200 dark:border-gray-700"
    >
      <h3 class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        Watched
      </h3>
      <div class="group relative flex items-center gap-2">
        <div
          class="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
        >
          <div
            class="h-full rounded-full bg-blue-500"
            :style="{ width: `${coveragePercent}%` }"
          />
        </div>
        <span
          class="text-xs text-gray-500 dark:text-gray-400 shrink-0"
        >
          {{ Math.round(coveragePercent) }}%
        </span>
        <div
          class="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 rounded-md bg-gray-900 dark:bg-gray-700 text-white text-xs px-3 py-2 shadow-lg space-y-1 pointer-events-none"
        >
          <div
            v-for="w in watchProgress"
            :key="w.userId"
            class="flex items-center justify-between gap-4 whitespace-nowrap"
          >
            <span class="truncate max-w-40">{{ w.user.name }}</span>
            <span class="text-gray-300">
              {{ Math.round(w.percentWatched) }}% · {{ formatDuration(watchedSeconds(w)) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Annotations list -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <div v-if="loading" class="p-4 space-y-2">
        <div
          v-for="n in 4"
          :key="n"
          class="h-12 rounded bg-gray-100 dark:bg-gray-700 animate-pulse"
        />
      </div>
      <div
        v-else-if="annotations.length === 0"
        class="p-6 text-center text-sm text-gray-500 dark:text-gray-400"
      >
        No annotations yet.
      </div>
      <ul v-else class="divide-y divide-gray-100 dark:divide-gray-700">
        <li
          v-for="a in annotations"
          :key="String(a.id)"
          class="p-3 flex gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
          @click="emit('annotation-click', project, a)"
        >
          <span
            class="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
            :style="{ backgroundColor: a.color || '#9ca3af' }"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-gray-900 dark:text-white truncate">
                {{ a.title || 'Untitled' }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                {{ formatTimestamp(a.timestamp) }}
              </span>
            </div>
            <p
              v-if="a.content"
              class="text-xs text-gray-500 dark:text-gray-400 truncate"
            >
              {{ a.content }}
            </p>
            <div
              v-if="a.labels && a.labels.length > 0"
              class="mt-1 flex flex-wrap gap-1"
            >
              <span
                v-for="label in resolveLabels(a.labels)"
                :key="label.id"
                class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
                :style="{ backgroundColor: label.color }"
              >
                {{ label.name }}
              </span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- Actions -->
    <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
      <button
        class="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        @click="emit('open', project)"
      >
        Open editor
      </button>
      <button
        class="px-3 py-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        @click="emit('share', project)"
      >
        Share
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Project } from '@/types/project';
import type { PanelAnnotation } from '@/composables/useVideoDetails';
import type { Label } from '@/types/labels';
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
}>();

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
</script>
