# Video Details Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-hand details panel to the dashboard that shows a clicked video's metadata, stats, labels, and full annotation list, with each annotation deep-linking into the editor at its timestamp.

**Architecture:** A presentational `VideoDetailsPanel.vue` renders data owned by `DashboardView.vue`. A `useVideoDetails` composable lazily fetches + caches a project's annotations (merging dual A/B/comparison into one sorted list). Pure helpers derive the label summary. Clicking a card opens the panel (no navigation); the editor opens only from the panel's "Open" button; clicking an annotation navigates to the editor with a `?t=` seek target that `EditorView` reads and seeks to once the video loads.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), TypeScript (strict), Tailwind CSS (with `dark:` variants), Vue Router, Vitest (jsdom) for unit tests, Supabase-backed services.

## Global Constraints

- Vue 3 `<script setup lang="ts">` single-file components; follow existing component style.
- All Tailwind classes must include `dark:` variants where the design uses color (match existing dashboard components).
- TypeScript strict — no `any` except where the existing codebase already casts service results (annotation service returns are cast; mirror that).
- Tests run with `npm test` (`vitest run`); unit tests use `@vitest-environment jsdom` and mock services with `vi.mock`, matching `src/composables/__tests__/useDashboardFolders.test.ts`.
- No new dependencies. `@vue/test-utils` is NOT installed — do not write `.vue` mount tests; verify components via typecheck/build and manual run.
- Commit after each task.

---

### Task 1: `useVideoDetails` composable + pure helpers

**Files:**
- Create: `src/composables/useVideoDetails.ts`
- Test: `src/composables/__tests__/useVideoDetails.test.ts`

**Interfaces:**
- Consumes: `AnnotationService.getVideoAnnotations(videoId, projectId?)` → `Array<Annotation & { labels: string[] }>`; `AnnotationService.getAllComparisonVideoAnnotations(comparisonId, videoAId, videoBId)` → `{ comparison, videoA, videoB }` (each `Array<Annotation & { labels: string[] }>`).
- Produces:
  - `type PanelAnnotation = Annotation & { labels: string[] }`
  - `interface LabelSummaryEntry { id: string; name: string; color: string; count: number }`
  - `mergeComparisonAnnotations(groups): PanelAnnotation[]` (sorted by `timestamp` asc)
  - `summarizeLabels(annotations, labelMap: Map<string, Label>): LabelSummaryEntry[]` (desc by count; ids missing from map skipped)
  - `useVideoDetails()` → `{ annotations: Ref<PanelAnnotation[]>, loading: Ref<boolean>, error: Ref<string|null>, selectProject(project): Promise<void>, clear(): void }`

- [ ] **Step 1: Write the failing tests**

Create `src/composables/__tests__/useVideoDetails.test.ts`:

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getVideoAnnotations = vi.fn();
const getAllComparisonVideoAnnotations = vi.fn();

vi.mock('@/services/annotationService', () => ({
  AnnotationService: {
    getVideoAnnotations: (...a: unknown[]) => getVideoAnnotations(...a),
    getAllComparisonVideoAnnotations: (...a: unknown[]) =>
      getAllComparisonVideoAnnotations(...a),
  },
}));

const ann = (id: string, timestamp: number, labels: string[] = []) =>
  ({ id, timestamp, frame: Math.round(timestamp * 30), title: 't' + id, content: '', color: '#000', labels }) as any;

const singleProject = {
  id: 'p1',
  projectType: 'single',
  video: { id: 'v1' },
} as any;

const dualProject = {
  id: 'p2',
  projectType: 'dual',
  comparisonVideo: { id: 'c1' },
  videoA: { id: 'va' },
  videoB: { id: 'vb' },
} as any;

beforeEach(() => {
  getVideoAnnotations.mockReset();
  getAllComparisonVideoAnnotations.mockReset();
});

describe('mergeComparisonAnnotations', () => {
  it('merges the three groups and sorts by timestamp', async () => {
    const { mergeComparisonAnnotations } = await import('@/composables/useVideoDetails');
    const merged = mergeComparisonAnnotations({
      comparison: [ann('c', 5)],
      videoA: [ann('a', 1)],
      videoB: [ann('b', 3)],
    });
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('summarizeLabels', () => {
  it('counts label ids, resolves name/color, skips unknown ids, sorts by count desc', async () => {
    const { summarizeLabels } = await import('@/composables/useVideoDetails');
    const labelMap = new Map<string, any>([
      ['l1', { id: 'l1', name: 'Bug', color: '#f00' }],
      ['l2', { id: 'l2', name: 'Note', color: '#0f0' }],
    ]);
    const result = summarizeLabels(
      [ann('1', 0, ['l1', 'l2']), ann('2', 1, ['l1', 'unknown'])],
      labelMap
    );
    expect(result).toEqual([
      { id: 'l1', name: 'Bug', color: '#f00', count: 2 },
      { id: 'l2', name: 'Note', color: '#0f0', count: 1 },
    ]);
  });
});

describe('useVideoDetails.selectProject', () => {
  it('fetches single-project annotations via getVideoAnnotations', async () => {
    const { useVideoDetails } = await import('@/composables/useVideoDetails');
    getVideoAnnotations.mockResolvedValue([ann('1', 2), ann('2', 1)]);
    const d = useVideoDetails();
    await d.selectProject(singleProject);
    expect(getVideoAnnotations).toHaveBeenCalledWith('v1', 'p1');
    expect(d.annotations.value).toHaveLength(2);
    expect(d.loading.value).toBe(false);
  });

  it('fetches and merges dual-project annotations sorted by timestamp', async () => {
    const { useVideoDetails } = await import('@/composables/useVideoDetails');
    getAllComparisonVideoAnnotations.mockResolvedValue({
      comparison: [ann('c', 5)],
      videoA: [ann('a', 1)],
      videoB: [ann('b', 3)],
    });
    const d = useVideoDetails();
    await d.selectProject(dualProject);
    expect(getAllComparisonVideoAnnotations).toHaveBeenCalledWith('c1', 'va', 'vb');
    expect(d.annotations.value.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('caches per project id and does not refetch on re-select', async () => {
    const { useVideoDetails } = await import('@/composables/useVideoDetails');
    getVideoAnnotations.mockResolvedValue([ann('1', 0)]);
    const d = useVideoDetails();
    await d.selectProject(singleProject);
    await d.selectProject(singleProject);
    expect(getVideoAnnotations).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale fetch when a newer selection resolves first', async () => {
    const { useVideoDetails } = await import('@/composables/useVideoDetails');
    let resolveSlow!: (v: unknown) => void;
    getVideoAnnotations.mockImplementationOnce(
      () => new Promise((r) => (resolveSlow = r))
    );
    getAllComparisonVideoAnnotations.mockResolvedValue({
      comparison: [], videoA: [ann('a', 1)], videoB: [],
    });
    const d = useVideoDetails();
    const p1 = d.selectProject(singleProject); // slow, pending
    await d.selectProject(dualProject); // newer, resolves now
    resolveSlow([ann('stale', 9)]); // slow resolves late
    await p1;
    expect(d.annotations.value.map((x) => x.id)).toEqual(['a']);
  });

  it('sets error and empties annotations on fetch failure', async () => {
    const { useVideoDetails } = await import('@/composables/useVideoDetails');
    getVideoAnnotations.mockRejectedValue(new Error('boom'));
    const d = useVideoDetails();
    await d.selectProject(singleProject);
    expect(d.error.value).toBe('boom');
    expect(d.annotations.value).toEqual([]);
    expect(d.loading.value).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- useVideoDetails`
Expected: FAIL — `Cannot find module '@/composables/useVideoDetails'`.

- [ ] **Step 3: Write the implementation**

Create `src/composables/useVideoDetails.ts`:

```ts
import { ref, type Ref } from 'vue';
import type { Project } from '@/types/project';
import type { Annotation } from '@/types/database';
import type { Label } from '@/types/labels';
import { AnnotationService } from '@/services/annotationService';

export type PanelAnnotation = Annotation & { labels: string[] };

export interface LabelSummaryEntry {
  id: string;
  name: string;
  color: string;
  count: number;
}

/** Merge the three comparison annotation groups into one list sorted by timestamp. */
export function mergeComparisonAnnotations(groups: {
  comparison: PanelAnnotation[];
  videoA: PanelAnnotation[];
  videoB: PanelAnnotation[];
}): PanelAnnotation[] {
  return [...groups.comparison, ...groups.videoA, ...groups.videoB].sort(
    (a, b) => a.timestamp - b.timestamp
  );
}

/**
 * Count each label id across annotations, resolving name/color from labelMap.
 * Ids not present in labelMap are skipped. Result is sorted by count descending.
 */
export function summarizeLabels(
  annotations: PanelAnnotation[],
  labelMap: Map<string, Label>
): LabelSummaryEntry[] {
  const counts = new Map<string, number>();
  for (const ann of annotations) {
    for (const id of ann.labels || []) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  const entries: LabelSummaryEntry[] = [];
  for (const [id, count] of counts) {
    const label = labelMap.get(id);
    if (!label) continue;
    entries.push({ id, name: label.name, color: label.color, count });
  }
  return entries.sort((a, b) => b.count - a.count);
}

export interface UseVideoDetails {
  annotations: Ref<PanelAnnotation[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  selectProject: (project: Project) => Promise<void>;
  clear: () => void;
}

export function useVideoDetails(): UseVideoDetails {
  const annotations = ref<PanelAnnotation[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const cache = new Map<string, PanelAnnotation[]>();
  // Guards against a slow earlier fetch overwriting a newer selection.
  let requestId = 0;

  async function fetchAnnotations(project: Project): Promise<PanelAnnotation[]> {
    if (project.projectType === 'single') {
      return (await AnnotationService.getVideoAnnotations(
        project.video.id,
        project.id
      )) as PanelAnnotation[];
    }
    const groups = await AnnotationService.getAllComparisonVideoAnnotations(
      project.comparisonVideo.id,
      project.videoA.id,
      project.videoB.id
    );
    return mergeComparisonAnnotations(
      groups as unknown as {
        comparison: PanelAnnotation[];
        videoA: PanelAnnotation[];
        videoB: PanelAnnotation[];
      }
    );
  }

  async function selectProject(project: Project): Promise<void> {
    error.value = null;
    const token = ++requestId;

    const cached = cache.get(project.id);
    if (cached) {
      annotations.value = cached;
      loading.value = false;
      return;
    }

    loading.value = true;
    annotations.value = [];
    try {
      const result = await fetchAnnotations(project);
      cache.set(project.id, result);
      if (token !== requestId) return; // a newer selection superseded this one
      annotations.value = result;
    } catch (e) {
      if (token !== requestId) return;
      error.value = e instanceof Error ? e.message : String(e);
      annotations.value = [];
    } finally {
      if (token === requestId) loading.value = false;
    }
  }

  function clear(): void {
    annotations.value = [];
    loading.value = false;
    error.value = null;
  }

  return { annotations, loading, error, selectProject, clear };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- useVideoDetails`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useVideoDetails.ts src/composables/__tests__/useVideoDetails.test.ts
git commit -m "feat: useVideoDetails composable for lazy annotation loading + label summary"
```

---

### Task 2: `VideoDetailsPanel.vue` presentational component

**Files:**
- Create: `src/components/VideoDetailsPanel.vue`

**Interfaces:**
- Consumes: `PanelAnnotation`, `LabelSummaryEntry` from `@/composables/useVideoDetails`; `Project` from `@/types/project`.
- Produces (props): `project: Project`, `annotations: PanelAnnotation[]`, `loading: boolean`, `labelSummary: LabelSummaryEntry[]`, `annotationCount: number`, `commentCount: number`.
- Produces (emits): `close: []`, `open: [project: Project]`, `share: [project: Project]`, `add-to-folder: [project: Project]`, `annotation-click: [project: Project, annotation: PanelAnnotation]`.

- [ ] **Step 1: Write the component**

Create `src/components/VideoDetailsPanel.vue`:

```vue
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
      </div>
    </div>

    <!-- Stat row -->
    <div class="grid grid-cols-3 divide-x divide-gray-200 dark:divide-gray-700 border-b border-gray-200 dark:border-gray-700">
      <div class="p-3 text-center">
        <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ annotationCount }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Annotations</div>
      </div>
      <div class="p-3 text-center">
        <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ commentCount }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Comments</div>
      </div>
      <div class="p-3 text-center">
        <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ labelSummary.length }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Labels</div>
      </div>
    </div>

    <!-- Labels -->
    <div
      v-if="labelSummary.length > 0"
      class="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-2"
    >
      <span
        v-for="l in labelSummary"
        :key="l.id"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
        :style="{ backgroundColor: l.color }"
      >
        {{ l.name }}
        <span class="opacity-80">{{ l.count }}</span>
      </span>
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
      <button
        class="px-3 py-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="Add to folder"
        @click="emit('add-to-folder', project)"
      >
        Folder
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Project } from '@/types/project';
import type { PanelAnnotation, LabelSummaryEntry } from '@/composables/useVideoDetails';

defineProps<{
  project: Project;
  annotations: PanelAnnotation[];
  loading: boolean;
  labelSummary: LabelSummaryEntry[];
  annotationCount: number;
  commentCount: number;
}>();

const emit = defineEmits<{
  close: [];
  open: [project: Project];
  share: [project: Project];
  'add-to-folder': [project: Project];
  'annotation-click': [project: Project, annotation: PanelAnnotation];
}>();

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
</script>
```

- [ ] **Step 2: Verify it typechecks / builds**

Run: `npm run build`
Expected: build succeeds with no type errors referencing `VideoDetailsPanel.vue`.
(If the project has a `type-check`/`vue-tsc` script, run that instead: `npm run type-check`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/VideoDetailsPanel.vue
git commit -m "feat: VideoDetailsPanel presentational component"
```

---

### Task 3: Wire panel into the dashboard (selection, layout, actions)

**Files:**
- Modify: `src/components/ProjectCard.vue` (add `inspect` emit; plain click emits it)
- Modify: `src/components/ProjectListItem.vue` (same, mirror the card)
- Modify: `src/views/DashboardView.vue` (selection state, render panel docked + mobile drawer, wire actions, Esc/close)

**Interfaces:**
- Consumes: `useVideoDetails`, `summarizeLabels`, `VideoDetailsPanel` from Task 1/2.
- Produces: `ProjectCard`/`ProjectListItem` emit `inspect: [project: Project]` on a plain (no modifier) click.

- [ ] **Step 1: Add `inspect` emit to `ProjectCard.vue`**

In `src/components/ProjectCard.vue`, add `inspect` to the emits and change `handleClick` so a plain click inspects instead of opening the editor. Replace the emits block:

```ts
const emit = defineEmits<{
  select: [project: Project, event: MouseEvent];
  open: [project: Project];
  inspect: [project: Project];
  delete: [project: Project];
  dragstart: [project: Project, event: DragEvent];
  dragend: [event: DragEvent];
  'add-to-folder': [project: Project];
}>();
```

Replace `handleClick`:

```ts
const handleClick = (event: MouseEvent) => {
  // Don't react if clicking on actions area
  const target = event.target as HTMLElement;
  if (target.closest('.actions-menu')) {
    return;
  }

  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    emit('select', props.project, event);
  } else {
    // Plain click now opens the details panel (not the editor).
    emit('inspect', props.project);
  }
};
```

(The `⋯ → Open` menu item still calls `openProject` → `emit('open', …)`, unchanged — that remains the explicit "open editor" path.)

- [ ] **Step 2: Add `inspect` emit to `ProjectListItem.vue`**

Open `src/components/ProjectListItem.vue`. Add `inspect: [project: Project];` to its `defineEmits`, and change its plain row-click handler the same way: a plain click emits `inspect`; modifier-clicks keep any existing `select` behavior; the explicit Open control keeps emitting `open`. (Match the exact handler name already present in that file.)

- [ ] **Step 3: Build to confirm emits typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Wire state + panel into `DashboardView.vue` — script**

In `src/views/DashboardView.vue` `<script setup>`:

Add imports:

```ts
import VideoDetailsPanel from '@/components/VideoDetailsPanel.vue';
import {
  useVideoDetails,
  summarizeLabels,
  type PanelAnnotation,
} from '@/composables/useVideoDetails';
import type { Label } from '@/types/labels';
```

After the existing refs (near `availableLabels`), add:

```ts
const selectedProject = ref<Project | null>(null);
const videoDetails = useVideoDetails();

// Fast lookup for resolving annotation label ids → label name/color.
const labelMap = computed(() => {
  const m = new Map<string, Label>();
  for (const l of availableLabels.value) m.set(l.id, l);
  return m;
});

const detailsLabelSummary = computed(() =>
  summarizeLabels(videoDetails.annotations.value, labelMap.value)
);

function inspectProject(project: Project) {
  // Toggle off if the same card is clicked again.
  if (selectedProject.value?.id === project.id) {
    closeDetails();
    return;
  }
  selectedProject.value = project;
  videoDetails.selectProject(project);
}

function closeDetails() {
  selectedProject.value = null;
  videoDetails.clear();
}

function openAnnotation(project: Project, annotation: PanelAnnotation) {
  const name = project.projectType === 'single' ? 'editor-single' : 'editor-dual';
  router.push({
    name,
    params: { id: project.id },
    query: { t: String(annotation.timestamp ?? 0) },
  });
}

// Close the panel on Escape.
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedProject.value) closeDetails();
}
```

Register/unregister the key listener. Extend the existing `onMounted` and add `onUnmounted` (import `onUnmounted` from vue):

```ts
onMounted(() => {
  loadData();
  dashFolders.loadFolders();
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
```

(Update the `import { ref, computed, onMounted, watch } from 'vue';` line to also import `onUnmounted`.)

- [ ] **Step 5: Wire the panel + selection ring into `DashboardView.vue` — template**

In the grid loop, bind the ring and the `inspect` handler on `ProjectCard`:

```vue
<ProjectCard
  :project="project"
  :is-selected="selectedProject?.id === project.id"
  :is-dragging="false"
  :annotation-count="annotationCounts[project.id] ?? 0"
  :comment-count="commentCounts[project.id] ?? 0"
  @inspect="inspectProject"
  @open="openProject"
  @dragstart="onCardDragStart"
  @add-to-folder="openAddToFolder"
/>
```

Do the same for the list-view `ProjectListItem` (add `:is-selected="selectedProject?.id === project.id"` and `@inspect="inspectProject"`).

Add the docked panel as a third column. Change the main row wrapper and append the panel after the `<div class="flex-1 min-w-0">…</div>` content column, still inside `<div class="flex gap-6">`:

```vue
<!-- Desktop docked details panel -->
<aside
  v-if="selectedProject"
  class="hidden lg:block w-96 shrink-0 self-start sticky top-6 h-[calc(100vh-6rem)]"
>
  <VideoDetailsPanel
    :project="selectedProject"
    :annotations="videoDetails.annotations.value"
    :loading="videoDetails.loading.value"
    :label-summary="detailsLabelSummary"
    :annotation-count="annotationCounts[selectedProject.id] ?? 0"
    :comment-count="commentCounts[selectedProject.id] ?? 0"
    @close="closeDetails"
    @open="openProject"
    @share="/* see step 6 */"
    @add-to-folder="openAddToFolder"
    @annotation-click="openAnnotation"
  />
</aside>
```

Add the mobile drawer near the other `Teleport` modals at the bottom of the template:

```vue
<Teleport to="body">
  <Transition name="modal">
    <div
      v-if="selectedProject"
      class="lg:hidden fixed inset-0 z-50 flex justify-end"
    >
      <div class="absolute inset-0 bg-black/50" @click="closeDetails" />
      <div class="relative w-[90%] max-w-sm h-full">
        <VideoDetailsPanel
          :project="selectedProject"
          :annotations="videoDetails.annotations.value"
          :loading="videoDetails.loading.value"
          :label-summary="detailsLabelSummary"
          :annotation-count="annotationCounts[selectedProject.id] ?? 0"
          :comment-count="commentCounts[selectedProject.id] ?? 0"
          @close="closeDetails"
          @open="openProject"
          @share="/* see step 6 */"
          @add-to-folder="openAddToFolder"
          @annotation-click="openAnnotation"
        />
      </div>
    </div>
  </Transition>
</Teleport>
```

- [ ] **Step 6: Wire the panel's Share action**

`ProjectCard` opens sharing via its own internal `ShareModal`. For the panel, reuse the existing dashboard flow. If the dashboard has no share entry point, wire `@share` to the same handler the card menu uses. Minimal approach: on `@share`, open the project's editor share is out of scope — instead route through the existing per-card share by setting a `shareProject` ref and rendering one `ShareModal` at the dashboard level:

Add to script:

```ts
import ShareModal from '@/components/ShareModal.vue';
const shareTarget = ref<Project | null>(null);
```

Add near the other dashboard-level modals in the template:

```vue
<ShareModal
  v-if="shareTarget"
  :is-visible="true"
  :video-id="shareTarget.projectType === 'single' ? shareTarget.video?.id : ''"
  :comparison-id="shareTarget.projectType === 'dual' ? shareTarget.comparisonVideo?.id : ''"
  :share-type="shareTarget.projectType === 'single' ? 'video' : 'comparison'"
  @close="shareTarget = null"
/>
```

Replace both `@share="/* see step 6 */"` bindings with `@share="(p) => (shareTarget = p)"`.

- [ ] **Step 7: Reset selection when the result set changes**

So the panel never points at a project that scrolled out of the current folder/scope, extend the existing reset watcher:

```ts
watch([scope, searchQuery, dashFolders.currentFolderId], () => {
  closeDetails();
});
```

(Fold this into the existing `watch([scope, searchQuery], …)` that resets `currentPage`, or add alongside it — keep `currentPage.value = 1` behavior intact.)

- [ ] **Step 8: Build and manually verify**

Run: `npm run build`
Expected: success.

Then run the app (`npm run dev`) and verify:
- Clicking a card opens the panel; the card shows the selected ring; the URL does **not** change.
- Clicking the same card again closes the panel; `Esc` closes it; `✕` closes it.
- Stat row shows counts immediately; the annotation list shows a skeleton then the list.
- `⋯ → Open` on the card still navigates to the editor.
- Narrow the window below `lg`: the panel becomes a right-side drawer with a backdrop.

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS (no regressions).

- [ ] **Step 10: Commit**

```bash
git add src/views/DashboardView.vue src/components/ProjectCard.vue src/components/ProjectListItem.vue
git commit -m "feat: video details sidebar on the dashboard"
```

---

### Task 4: Deep-link the editor to an annotation's timestamp

**Files:**
- Modify: `src/views/EditorView.vue` (read `?t=` and seek once the video is loaded)

**Interfaces:**
- Consumes: `route.query.t` (seconds, string) set by `openAnnotation` in Task 3; existing `unifiedVideoPlayerRef` exposing `seekTo(time: number)`; existing `videoLoaded` ref.
- Produces: none (behavioral).

- [ ] **Step 1: Add a pending-seek ref and capture the query in `loadFromRoute`**

In `src/views/EditorView.vue` `<script setup>`, near the top-level refs (e.g. by `unifiedVideoPlayerRef` at line 227), add:

```ts
const pendingSeekTime = ref<number | null>(null);
```

Inside `loadFromRoute()` (around line 650), at the very start of the `try` block — before the `route.name` checks — capture the query so it is set before the async load:

```ts
const tParam = route.query.t;
pendingSeekTime.value =
  tParam != null && tParam !== '' ? parseFloat(String(tParam)) : null;
```

- [ ] **Step 2: Seek once the video is loaded**

Ensure `nextTick` is imported (`import { …, nextTick } from 'vue';`). Add a watcher after the existing `watch(() => [route.name, route.params.id], …)` (around line 688):

```ts
// When arriving via an annotation deep-link (?t=), seek once the player is ready.
watch(videoLoaded, async (loaded) => {
  if (!loaded || pendingSeekTime.value == null) return;
  const time = pendingSeekTime.value;
  pendingSeekTime.value = null;
  await nextTick();
  (unifiedVideoPlayerRef.value as unknown as { seekTo?: (t: number) => void })
    ?.seekTo?.(time);
});
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manually verify the deep-link end-to-end**

Run `npm run dev`:
- On the dashboard, click a card to open the panel, then click an annotation in the list.
- Confirm the editor opens for that video and the playhead lands at the annotation's timestamp.
- Repeat for a dual/comparison project (annotation from the combined list).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/EditorView.vue
git commit -m "feat: deep-link editor to annotation timestamp via ?t= query"
```

---

## Self-Review Notes

- **Spec coverage:** interaction model (Task 3 steps 1–2, 4), layout docked + mobile drawer (Task 3 step 5), panel content header/stats/labels/annotation list/actions (Task 2), lazy fetch + cache + dual merge (Task 1), deep-link (Tasks 3 step-`openAnnotation` + Task 4), keep `⋯ → Open` (Task 3 step 1 note). All covered.
- **Label map limitation:** `availableLabels` is currently built from single-project video ids only, so a dual project's annotation labels may not resolve to a chip. Annotations still render; unresolved label ids are skipped in the summary. Acceptable for v1 (noted as a follow-up in the spec).
- **No component mount tests:** `@vue/test-utils` is not installed; component behavior is verified via build + manual run, consistent with the existing codebase (no `.vue` tests exist). TDD coverage concentrates on the composable and pure helpers.
