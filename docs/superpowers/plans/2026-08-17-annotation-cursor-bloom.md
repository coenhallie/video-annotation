# Annotation Cursor Bloom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-stage radial menu ("cursor bloom") opened by right-clicking the video, showing label categories then labels, where clicking a label immediately creates an annotation at the frame that was showing when the bloom opened.

**Architecture:** Categories are derived from the label name prefix by a pure helper - no schema change. A shared label-catalog composable gives the bloom and the existing sidebar one label list. A presentational SVG radial-menu component reports a chosen label; `EditorView` snapshots the frame at open time, builds the annotation payload with a util extracted from `AnnotationForm`, and calls the existing `handleAddAnnotation`. The sidebar keeps working exactly as it does today, except a text comment is no longer required to save.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), Pinia, Tailwind CSS 4, Vitest (node environment), Supabase.

## Global Constraints

- **No new dependency.** The bloom is hand-rolled SVG.
- **No new migration and no `category` column.** Categories come from the label name prefix.
- **The six category prefixes are exactly:** `EVT`, `PITCH`, `TEAM`, `NPL`, `PLR`, `BALL`, displayed in that order.
- **Labels whose first token is not one of those six are excluded from the bloom.** They stay available in the sidebar. Custom labels are out of scope.
- **Vitest runs in the `node` environment** (`vitest.config.ts`) with no DOM library installed. Only write tests for pure TypeScript modules. Do **not** write component-mounting tests; verify components by running the app.
- **Test files live next to their subject in a `__tests__` directory** and are named `*.test.ts` (`vitest.config.ts` includes `src/**/*.test.ts`).
- **`@` is an alias for `src/`.**
- **Never use the em dash `-` in prose, comments, or commit messages.** Use a plain dash.
- **Never add `Co-Authored-By` trailers or Claude attribution to commits.**
- **Run `npx vue-tsc --noEmit` and `npm test` before the final commit.** Type errors and failing tests are defects.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/labelCategories.ts` (create) | Pure: label name prefix to category, grouping, prefix stripping |
| `src/utils/__tests__/labelCategories.test.ts` (create) | Unit tests for the above |
| `src/utils/annotationPayload.ts` (create) | Pure: build the annotation payload from a label + frame + fps + dual-mode frames |
| `src/utils/__tests__/annotationPayload.test.ts` (create) | Unit tests for the above |
| `src/composables/useLabelCatalog.ts` (create) | Shared label list per `userId::projectId`, used by both the sidebar and the bloom |
| `src/components/AnnotationBloom.vue` (create) | Presentational two-stage radial menu |
| `src/components/AnnotationForm.vue` (modify) | Drop the text requirement from the save gate; use the extracted payload builder |
| `src/components/AnnotationPanel.vue` (modify) | Load labels through `useLabelCatalog` instead of calling `LabelService` directly |
| `src/views/EditorView.vue` (modify) | Right-click handler, frame snapshot, mount the bloom, wire selection to `handleAddAnnotation` |

---

## Task 1: Label category helper

**Files:**
- Create: `src/utils/labelCategories.ts`
- Test: `src/utils/__tests__/labelCategories.test.ts`

**Interfaces:**
- Consumes: `Label` from `src/types/labels.ts` (fields used: `id`, `name`, `color`, `description`)
- Produces:
  - `CATEGORY_ORDER: readonly LabelCategoryKey[]`
  - `type LabelCategoryKey = 'EVT' | 'PITCH' | 'TEAM' | 'NPL' | 'PLR' | 'BALL'`
  - `interface LabelCategoryGroup { key: LabelCategoryKey; name: string; labels: Label[] }`
  - `categoryKeyForLabel(label: Label): LabelCategoryKey | null`
  - `groupLabelsByCategory(labels: Label[]): LabelCategoryGroup[]`
  - `labelShortName(label: Label): string`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/labelCategories.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  CATEGORY_ORDER,
  categoryKeyForLabel,
  groupLabelsByCategory,
  labelShortName,
} from '../labelCategories';
import type { Label } from '@/types/labels';

const makeLabel = (name: string, id = name): Label => ({
  id,
  name,
  color: '#000000',
  isDefault: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('categoryKeyForLabel', () => {
  it('maps each known prefix to its category key', () => {
    expect(categoryKeyForLabel(makeLabel('EVT MISSED'))).toBe('EVT');
    expect(categoryKeyForLabel(makeLabel('PITCH LINES MISMATCH'))).toBe('PITCH');
    expect(categoryKeyForLabel(makeLabel('TEAM ASSIGN WRONG'))).toBe('TEAM');
    expect(categoryKeyForLabel(makeLabel('NPL MISSED'))).toBe('NPL');
    expect(categoryKeyForLabel(makeLabel('PLR ID SWITCH'))).toBe('PLR');
    expect(categoryKeyForLabel(makeLabel('BALL TRAJ IMPLAUSIBLE'))).toBe('BALL');
  });

  it('returns null for an unrecognised prefix', () => {
    expect(categoryKeyForLabel(makeLabel('PLY MISSED'))).toBeNull();
    expect(categoryKeyForLabel(makeLabel('My custom label'))).toBeNull();
    expect(categoryKeyForLabel(makeLabel(''))).toBeNull();
  });

  it('is case insensitive on the prefix and tolerates extra whitespace', () => {
    expect(categoryKeyForLabel(makeLabel('  evt  missed  '))).toBe('EVT');
  });

  it('does not match a prefix that is only part of a longer token', () => {
    expect(categoryKeyForLabel(makeLabel('EVTX MISSED'))).toBeNull();
  });
});

describe('labelShortName', () => {
  it('strips the category prefix', () => {
    expect(labelShortName(makeLabel('BALL TRAJ IMPLAUSIBLE'))).toBe(
      'TRAJ IMPLAUSIBLE'
    );
  });

  it('returns the full name when there is no known prefix', () => {
    expect(labelShortName(makeLabel('My custom label'))).toBe('My custom label');
  });

  it('returns the full name when the prefix is the whole name', () => {
    expect(labelShortName(makeLabel('BALL'))).toBe('BALL');
  });
});

describe('groupLabelsByCategory', () => {
  it('groups labels and returns categories in CATEGORY_ORDER', () => {
    const groups = groupLabelsByCategory([
      makeLabel('BALL MISSED'),
      makeLabel('EVT MISSED'),
      makeLabel('PLR MISSED'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['EVT', 'PLR', 'BALL']);
    expect(CATEGORY_ORDER.indexOf('EVT')).toBeLessThan(
      CATEGORY_ORDER.indexOf('BALL')
    );
  });

  it('omits categories with no labels', () => {
    const groups = groupLabelsByCategory([makeLabel('EVT MISSED')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('EVT');
    expect(groups[0].name).toBe('Events');
  });

  it('excludes labels with an unrecognised prefix', () => {
    const groups = groupLabelsByCategory([
      makeLabel('EVT MISSED'),
      makeLabel('PLY MISSED'),
      makeLabel('Custom thing'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].labels.map((l) => l.name)).toEqual(['EVT MISSED']);
  });

  it('preserves the incoming order of labels within a category', () => {
    const groups = groupLabelsByCategory([
      makeLabel('PLR TELEPORT'),
      makeLabel('PLR MISSED'),
    ]);
    expect(groups[0].labels.map((l) => l.name)).toEqual([
      'PLR TELEPORT',
      'PLR MISSED',
    ]);
  });

  it('returns an empty array when nothing is categorisable', () => {
    expect(groupLabelsByCategory([makeLabel('Custom thing')])).toEqual([]);
    expect(groupLabelsByCategory([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/labelCategories.test.ts`
Expected: FAIL, cannot resolve `../labelCategories`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/labelCategories.ts`:

```ts
import type { Label } from '@/types/labels';

/**
 * Labels carry their category as a name prefix (see DEFAULT_LABELS in
 * src/types/labels.ts). There is no category column on the labels table, so the
 * prefix is the only category signal we have.
 */
export type LabelCategoryKey = 'EVT' | 'PITCH' | 'TEAM' | 'NPL' | 'PLR' | 'BALL';

export const CATEGORY_ORDER: readonly LabelCategoryKey[] = [
  'EVT',
  'PITCH',
  'TEAM',
  'NPL',
  'PLR',
  'BALL',
] as const;

const CATEGORY_NAMES: Record<LabelCategoryKey, string> = {
  EVT: 'Events',
  PITCH: 'Pitch',
  TEAM: 'Team',
  NPL: 'Officials',
  PLR: 'Players',
  BALL: 'Ball',
};

export interface LabelCategoryGroup {
  key: LabelCategoryKey;
  name: string;
  labels: Label[];
}

const firstToken = (name: string): string =>
  name.trim().split(/\s+/)[0]?.toUpperCase() ?? '';

/**
 * The category a label belongs to, or null when its prefix is not one of the
 * six known categories. Uncategorised labels are deliberately excluded from the
 * bloom; they remain available in the sidebar.
 */
export function categoryKeyForLabel(label: Label): LabelCategoryKey | null {
  const token = firstToken(label.name ?? '');
  return (CATEGORY_ORDER as readonly string[]).includes(token)
    ? (token as LabelCategoryKey)
    : null;
}

/** Label name with the category prefix removed, for compact display in a ring. */
export function labelShortName(label: Label): string {
  const name = (label.name ?? '').trim();
  if (!categoryKeyForLabel(label)) return name;
  const rest = name.split(/\s+/).slice(1).join(' ');
  return rest || name;
}

/**
 * Group labels into categories in CATEGORY_ORDER. Uncategorised labels are
 * dropped and empty categories are omitted, so the result is never a category
 * with nothing in it.
 */
export function groupLabelsByCategory(labels: Label[]): LabelCategoryGroup[] {
  const buckets = new Map<LabelCategoryKey, Label[]>();

  for (const label of labels) {
    const key = categoryKeyForLabel(label);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(label);
    else buckets.set(key, [label]);
  }

  return CATEGORY_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    name: CATEGORY_NAMES[key],
    labels: buckets.get(key) as Label[],
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/labelCategories.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/labelCategories.ts src/utils/__tests__/labelCategories.test.ts
git commit -m "feat: derive label categories from the name prefix"
```

---

## Task 2: Annotation payload builder

Extracts the draft-to-payload rules currently inlined in `AnnotationForm.saveAnnotation` so the bloom and the form cannot drift. Behaviour preserving.

**Files:**
- Create: `src/utils/annotationPayload.ts`
- Test: `src/utils/__tests__/annotationPayload.test.ts`
- Modify: `src/components/AnnotationForm.vue` (the block starting `const primaryLabel = props.availableLabels.find(` down to and including the `annotationData.videoBFrame = ...` assignment, around lines 411-447)

**Interfaces:**
- Consumes: `Label` from `src/types/labels.ts`, `AnnotationFormData` and `DrawingData` from `src/types/component-interfaces.ts` and `src/types/database.ts`
- Produces:
  - `DEFAULT_ANNOTATION_COLOR: string` (`'#6b7280'`)
  - `interface BuildAnnotationPayloadInput { labels: Label[]; labelIds: string[]; content: string; frame: number; fps: number; drawingData?: DrawingData | null; fallbackColor?: string; dual?: { videoAFrame: number; videoBFrame: number } | null }`
  - `buildAnnotationPayload(input: BuildAnnotationPayloadInput): AnnotationFormData`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/annotationPayload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildAnnotationPayload,
  DEFAULT_ANNOTATION_COLOR,
} from '../annotationPayload';
import type { Label } from '@/types/labels';

const ballMissed: Label = {
  id: 'label-ball-missed',
  name: 'BALL MISSED',
  color: '#f97316',
  isDefault: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('buildAnnotationPayload', () => {
  it('builds a label-only payload with no content', () => {
    const payload = buildAnnotationPayload({
      labels: [ballMissed],
      labelIds: [ballMissed.id],
      content: '',
      frame: 300,
      fps: 25,
    });

    expect(payload.content).toBe('');
    expect(payload.title).toBe('BALL MISSED');
    expect(payload.color).toBe('#f97316');
    expect(payload.frame).toBe(300);
    expect(payload.timestamp).toBe(12);
    expect(payload.annotationType).toBe('text');
    expect(payload.drawingData).toBeNull();
    expect(payload.labels).toEqual([ballMissed.id]);
    expect(payload.videoAFrame).toBeUndefined();
    expect(payload.videoBFrame).toBeUndefined();
  });

  it('titles from the content when no label matches', () => {
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: 'Something looked wrong here',
      frame: 60,
      fps: 30,
    });

    expect(payload.title).toBe('Something looked wrong here');
    expect(payload.color).toBe(DEFAULT_ANNOTATION_COLOR);
  });

  it('truncates a long content title to 50 characters', () => {
    const long = 'x'.repeat(80);
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: long,
      frame: 0,
      fps: 30,
    });

    expect(payload.title).toBe('x'.repeat(50));
  });

  it('falls back to Untitled when there is no label and no content', () => {
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: '',
      frame: 0,
      fps: 30,
    });

    expect(payload.title).toBe('Untitled');
  });

  it('marks the annotation as a drawing when drawing data is present', () => {
    const payload = buildAnnotationPayload({
      labels: [ballMissed],
      labelIds: [ballMissed.id],
      content: '',
      frame: 10,
      fps: 30,
      drawingData: { paths: [{ id: 'p1' }] } as never,
    });

    expect(payload.annotationType).toBe('drawing');
    expect(payload.drawingData).not.toBeNull();
  });

  it('includes the per-video frames in dual mode', () => {
    const payload = buildAnnotationPayload({
      labels: [ballMissed],
      labelIds: [ballMissed.id],
      content: '',
      frame: 100,
      fps: 30,
      dual: { videoAFrame: 100, videoBFrame: 97 },
    });

    expect(payload.videoAFrame).toBe(100);
    expect(payload.videoBFrame).toBe(97);
  });

  it('prefers an explicit fallback colour over the default', () => {
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: 'note',
      frame: 0,
      fps: 30,
      fallbackColor: '#123456',
    });

    expect(payload.color).toBe('#123456');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/annotationPayload.test.ts`
Expected: FAIL, cannot resolve `../annotationPayload`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/annotationPayload.ts`:

```ts
import type { Label } from '@/types/labels';
import type { DrawingData } from '@/types/database';
import type { AnnotationFormData } from '@/types/component-interfaces';

/** Colour used when no label supplies one. */
export const DEFAULT_ANNOTATION_COLOR = '#6b7280'; // gray-500

export interface BuildAnnotationPayloadInput {
  /** Every label available, used to resolve labelIds to colour and title. */
  labels: Label[];
  labelIds: string[];
  content: string;
  frame: number;
  fps: number;
  drawingData?: DrawingData | null;
  /** Colour to use when no label matches. */
  fallbackColor?: string;
  /** Per-video frames, set only in dual mode. */
  dual?: { videoAFrame: number; videoBFrame: number } | null;
}

/**
 * The single place that turns a chosen label plus a frame into the payload the
 * annotation service expects. Shared by the sidebar form and the cursor bloom so
 * the two paths cannot drift apart.
 */
export function buildAnnotationPayload(
  input: BuildAnnotationPayloadInput
): AnnotationFormData {
  const {
    labels,
    labelIds,
    content,
    frame,
    fps,
    drawingData = null,
    fallbackColor,
    dual = null,
  } = input;

  const primaryLabel = labels.find((label) => labelIds.includes(label.id));

  const payload: AnnotationFormData = {
    content,
    title: primaryLabel?.name || content.slice(0, 50) || 'Untitled',
    color: primaryLabel?.color || fallbackColor || DEFAULT_ANNOTATION_COLOR,
    timestamp: frame / fps,
    frame,
    annotationType: drawingData ? 'drawing' : 'text',
    drawingData,
    duration: 1 / 30,
    durationFrames: 1,
    labels: labelIds,
  };

  if (dual) {
    payload.videoAFrame = dual.videoAFrame;
    payload.videoBFrame = dual.videoBFrame;
  }

  return payload;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/annotationPayload.test.ts`
Expected: PASS.

- [ ] **Step 5: Use the builder in AnnotationForm**

In `src/components/AnnotationForm.vue`, add to the imports at the top of `<script setup>`:

```ts
import { buildAnnotationPayload } from '../utils/annotationPayload';
```

Then in `saveAnnotation`, replace this existing block (it starts right after `const baseDraft = newAnnotation.value;` and its `if (!baseDraft)` guard, and ends just before `if (editingAnnotation.value) {`):

```ts
    const primaryLabel = props.availableLabels.find((label) =>
      baseDraft.labels?.includes(label.id)
    );
    const annotationColor =
      primaryLabel?.color || baseDraft.color || defaultAnnotationColor;
    const annotationTitle =
      primaryLabel?.name || baseDraft.content.slice(0, 50) || 'Untitled';

    const annotationData: Record<string, unknown> = {
      content: baseDraft.content,
      title: annotationTitle,
      color: annotationColor,
      timestamp: baseDraft.frame / props.fps,
      frame: baseDraft.frame,
      annotationType: currentDrawingData ? 'drawing' : 'text',
      drawingData: currentDrawingData,
      duration: Math.max(1 / 30, 1 / 30),
      durationFrames: Math.max(1, 1),
      labels: baseDraft.labels || [],
    };

    console.log('🎨 [AnnotationForm] Saving annotation with data:', {
      annotationType: annotationData.annotationType,
      hasDrawingData: !!annotationData.drawingData,
      frame: annotationData.frame,
    });

    if (props.isDualMode) {
      annotationData.videoAFrame = props.videoACurrentFrame;
      annotationData.videoBFrame = props.videoBCurrentFrame;
    }
```

with:

```ts
    const annotationData = buildAnnotationPayload({
      labels: props.availableLabels,
      labelIds: baseDraft.labels || [],
      content: baseDraft.content,
      frame: baseDraft.frame,
      fps: props.fps,
      drawingData: currentDrawingData,
      fallbackColor: baseDraft.color,
      dual: props.isDualMode
        ? {
            videoAFrame: props.videoACurrentFrame,
            videoBFrame: props.videoBCurrentFrame,
          }
        : null,
    });
```

Leave the following `if (editingAnnotation.value) { annotationData.id = ... }` and `emit('save', annotationData)` lines as they are. `AnnotationFormData` has an index signature, so assigning `id` still type-checks.

- [ ] **Step 6: Verify types and the full suite**

Run: `npx vue-tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/utils/annotationPayload.ts src/utils/__tests__/annotationPayload.test.ts src/components/AnnotationForm.vue
git commit -m "refactor: extract annotation payload building out of the form"
```

---

## Task 3: Make the comment optional

The save gate currently requires a label **and** (text or drawing). Drop the text requirement so a label alone is enough, in the sidebar as well as the bloom.

**Files:**
- Modify: `src/components/AnnotationForm.vue:200-207`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Change the save gate**

In `src/components/AnnotationForm.vue`, replace:

```ts
const isSaveDisabled = computed(() => {
  if (!newAnnotation.value) return true;
  const hasContent = newAnnotation.value.content?.trim();
  const hasDrawing = hasDrawingData.value;
  const hasLabel =
    newAnnotation.value.labels && newAnnotation.value.labels.length === 1;
  return (!hasContent && !hasDrawing) || !hasLabel;
});
```

with:

```ts
// A label is all that is required. Text and drawings are optional, so the
// sidebar agrees with the cursor bloom on what a valid annotation is.
const isSaveDisabled = computed(() => {
  if (!newAnnotation.value) return true;
  return newAnnotation.value.labels?.length !== 1;
});
```

- [ ] **Step 2: Drop the "required" marker from the comment field**

In `src/components/AnnotationForm.vue`, find the comment/content field around line 703 that carries `:required="true"` and change it to `:required="false"`. If the surrounding markup renders a visible required indicator such as a `*`, remove that indicator too, so the UI does not claim a field is required when it is not.

- [ ] **Step 3: Verify types**

Run: `npx vue-tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Verify in the running app**

Start the app with `npm run dev`, open a video, click to add an annotation in the sidebar, select a label, leave the comment empty. The Save button must be enabled and saving must create the annotation with the label's name as its title.

- [ ] **Step 5: Commit**

```bash
git add src/components/AnnotationForm.vue
git commit -m "feat: make the annotation comment optional"
```

---

## Task 4: Shared label catalog

`AnnotationPanel` fetches labels itself today. The bloom needs the same list, and a label added through `LabelManagement` must appear in both. One shared source, one fetch.

**Files:**
- Create: `src/composables/useLabelCatalog.ts`
- Modify: `src/components/AnnotationPanel.vue:201-214` (the `loadLabels` function) and its `availableLabels` / `labelColors` declarations around line 170

**Interfaces:**
- Consumes: `LabelService.getLabels(userId?: string, projectId?: string, includeDefault?: boolean): Promise<Label[]>` from `src/services/labelService.ts`
- Produces:
  - `useLabelCatalog(userId: MaybeRefOrGetter<string | undefined>, projectId?: MaybeRefOrGetter<string | undefined>)` returning `{ labels: Ref<Label[]>, labelsById: ComputedRef<Record<string, Label>>, loading: Ref<boolean>, load(): Promise<void>, reload(): Promise<void> }`

- [ ] **Step 1: Write the composable**

Create `src/composables/useLabelCatalog.ts`:

```ts
import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import { LabelService } from '../services/labelService';
import type { Label } from '../types/labels';

interface CatalogEntry {
  labels: Ref<Label[]>;
  loading: Ref<boolean>;
  inFlight: Promise<void> | null;
  loaded: boolean;
}

/**
 * Label lists are shared per user and project so the annotation sidebar and the
 * cursor bloom read the same array. Without this they would each fetch and
 * silently drift after a label is created or renamed.
 */
const catalogs = new Map<string, CatalogEntry>();

const entryFor = (key: string): CatalogEntry => {
  let entry = catalogs.get(key);
  if (!entry) {
    entry = {
      labels: ref<Label[]>([]),
      loading: ref(false),
      inFlight: null,
      loaded: false,
    };
    catalogs.set(key, entry);
  }
  return entry;
};

export function useLabelCatalog(
  userId: MaybeRefOrGetter<string | undefined>,
  projectId?: MaybeRefOrGetter<string | undefined>
) {
  const keyFor = () => `${toValue(userId) ?? ''}::${toValue(projectId) ?? ''}`;

  const labels = computed(() => entryFor(keyFor()).labels.value);
  const loading = computed(() => entryFor(keyFor()).loading.value);

  const labelsById = computed(() => {
    const map: Record<string, Label> = {};
    for (const label of labels.value) map[label.id] = label;
    return map;
  });

  const fetchInto = (entry: CatalogEntry): Promise<void> => {
    entry.loading.value = true;
    const request = LabelService.getLabels(toValue(userId), toValue(projectId))
      .then((result) => {
        entry.labels.value = result;
        entry.loaded = true;
      })
      .catch((error) => {
        console.error('Failed to load labels:', error);
      })
      .finally(() => {
        entry.loading.value = false;
        entry.inFlight = null;
      });
    entry.inFlight = request;
    return request;
  };

  /** Fetch once per key. Concurrent callers share the same request. */
  const load = (): Promise<void> => {
    const entry = entryFor(keyFor());
    if (entry.inFlight) return entry.inFlight;
    if (entry.loaded) return Promise.resolve();
    return fetchInto(entry);
  };

  /** Force a refetch, for example after labels are created or edited. */
  const reload = (): Promise<void> => {
    const entry = entryFor(keyFor());
    if (entry.inFlight) return entry.inFlight;
    return fetchInto(entry);
  };

  return { labels, labelsById, loading, load, reload };
}

/** Test seam: drop all cached catalogs. */
export function __resetLabelCatalogs(): void {
  catalogs.clear();
}
```

- [ ] **Step 2: Move AnnotationPanel onto the composable**

In `src/components/AnnotationPanel.vue`:

Add the import next to the other composable imports:

```ts
import { useLabelCatalog } from '../composables/useLabelCatalog';
```

Replace these two lines in the label state block (around line 170):

```ts
const availableLabels = ref<Label[]>([]);
```
and
```ts
const labelColors = ref<Record<string, Label>>({});
```

with:

```ts
const {
  labels: availableLabels,
  labelsById: labelColors,
  load: loadLabels,
  reload: reloadLabels,
} = useLabelCatalog(
  () => user.value?.id,
  () => props.projectId ?? undefined
);
```

Then delete the whole `const loadLabels = async () => { ... };` function (around lines 201-214) - the composable supplies it now.

Change the call inside `closeLabelManagement` (around line 312) from `loadLabels();` to `reloadLabels();`, so closing label management always refetches. Leave the `onMounted` call as `loadLabels();`.

If `ref` or the `Label` type import becomes unused after this, remove it from the import list. Everything else in the file keeps working: `availableLabels` is still an array of labels and `labelColors` is still a record keyed by label id.

- [ ] **Step 3: Verify types and the suite**

Run: `npx vue-tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 4: Verify in the running app**

With `npm run dev`, open a video. The sidebar's label filter and the annotation form's label selector must still list every label. Open label management, create a label, close it, and confirm the new label appears in the form's selector.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useLabelCatalog.ts src/components/AnnotationPanel.vue
git commit -m "refactor: share the label catalog between panel and future consumers"
```

---

## Task 5: The bloom component

Presentational only. It knows about labels and rings, not about annotations, frames, or services.

**Files:**
- Create: `src/components/AnnotationBloom.vue`

**Interfaces:**
- Consumes: `groupLabelsByCategory`, `labelShortName`, `LabelCategoryGroup` from `src/utils/labelCategories.ts` (Task 1); `Label` from `src/types/labels.ts`
- Produces: a component with props `{ open: boolean; x: number; y: number; labels: Label[] }` and emits `{ select: [label: Label]; close: [] }`

- [ ] **Step 1: Write the component**

Create `src/components/AnnotationBloom.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, type PropType } from 'vue';
import {
  groupLabelsByCategory,
  labelShortName,
  type LabelCategoryGroup,
} from '../utils/labelCategories';
import type { Label } from '../types/labels';

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  labels: { type: Array as PropType<Label[]>, default: () => [] },
});

const emit = defineEmits<{
  (e: 'select', label: Label): void;
  (e: 'close'): void;
}>();

// Ring geometry, in pixels.
const INNER_RADIUS = 46;
const OUTER_RADIUS = 132;
const SIZE = OUTER_RADIUS * 2 + 8; // a little slack so strokes are not clipped
const CENTER = SIZE / 2;
const LABEL_RADIUS = (INNER_RADIUS + OUTER_RADIUS) / 2;
const EDGE_MARGIN = 8;

const activeCategory = ref<LabelCategoryGroup | null>(null);
const hoveredKey = ref<string | null>(null);

const categories = computed(() => groupLabelsByCategory(props.labels));

interface Segment {
  key: string;
  text: string;
  title: string;
  color: string;
  path: string;
  labelX: number;
  labelY: number;
  onPick: () => void;
}

const polar = (radius: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
};

/** Annulus wedge from startDeg to endDeg. */
const wedgePath = (startDeg: number, endDeg: number): string => {
  const outerStart = polar(OUTER_RADIUS, startDeg);
  const outerEnd = polar(OUTER_RADIUS, endDeg);
  const innerEnd = polar(INNER_RADIUS, endDeg);
  const innerStart = polar(INNER_RADIUS, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
};

const buildSegments = <T,>(
  items: T[],
  describe: (item: T) => { key: string; text: string; title: string; color: string },
  pick: (item: T) => void
): Segment[] => {
  const step = 360 / items.length;
  // A single item would produce a degenerate 360 degree arc, so leave a small gap.
  const sweep = items.length === 1 ? 359.9 : step;
  return items.map((item, index) => {
    const start = index * step;
    const mid = start + sweep / 2;
    const centroid = polar(LABEL_RADIUS, mid);
    const described = describe(item);
    return {
      ...described,
      path: wedgePath(start, start + sweep),
      labelX: centroid.x,
      labelY: centroid.y,
      onPick: () => pick(item),
    };
  });
};

const segments = computed<Segment[]>(() => {
  const category = activeCategory.value;
  if (category) {
    return buildSegments(
      category.labels,
      (label) => ({
        key: label.id,
        text: labelShortName(label),
        title: label.description ? `${label.name}: ${label.description}` : label.name,
        color: label.color,
      }),
      (label) => emit('select', label)
    );
  }
  return buildSegments(
    categories.value,
    (group) => ({
      key: group.key,
      text: group.name,
      title: `${group.name} (${group.labels.length})`,
      color: group.labels[0]?.color ?? '#6b7280',
    }),
    (group) => {
      activeCategory.value = group;
    }
  );
});

/**
 * Keep the whole ring on screen. The bloom is anchored at the cursor but slides
 * inward near a viewport edge rather than being clipped.
 */
const position = computed(() => {
  const halfSize = SIZE / 2;
  const maxX = window.innerWidth - halfSize - EDGE_MARGIN;
  const maxY = window.innerHeight - halfSize - EDGE_MARGIN;
  const minX = halfSize + EDGE_MARGIN;
  const minY = halfSize + EDGE_MARGIN;
  return {
    left: `${Math.min(Math.max(props.x, minX), Math.max(minX, maxX))}px`,
    top: `${Math.min(Math.max(props.y, minY), Math.max(minY, maxY))}px`,
  };
});

const hubText = computed(() => (activeCategory.value ? 'Back' : 'Esc'));

const handleHub = () => {
  if (activeCategory.value) activeCategory.value = null;
  else emit('close');
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  if (activeCategory.value) activeCategory.value = null;
  else emit('close');
};

watch(
  () => props.open,
  (open) => {
    if (open) {
      activeCategory.value = null;
      hoveredKey.value = null;
      // Capture phase so the video player's global Escape handling does not win.
      window.addEventListener('keydown', handleKeydown, true);
    } else {
      window.removeEventListener('keydown', handleKeydown, true);
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true);
});
</script>

<template>
  <div
    v-if="open && categories.length > 0"
    class="fixed inset-0 z-50"
    @click="emit('close')"
    @contextmenu.prevent="emit('close')"
  >
    <div
      class="absolute -translate-x-1/2 -translate-y-1/2"
      :style="position"
      @click.stop
    >
      <svg
        :width="SIZE"
        :height="SIZE"
        :viewBox="`0 0 ${SIZE} ${SIZE}`"
        class="drop-shadow-2xl"
      >
        <g
          v-for="segment in segments"
          :key="segment.key"
          class="cursor-pointer"
          @mouseenter="hoveredKey = segment.key"
          @mouseleave="hoveredKey = null"
          @click="segment.onPick()"
        >
          <title>{{ segment.title }}</title>
          <path
            :d="segment.path"
            :fill="segment.color"
            :fill-opacity="hoveredKey === segment.key ? 0.95 : 0.75"
            stroke="rgba(15, 23, 42, 0.85)"
            stroke-width="2"
          />
          <text
            :x="segment.labelX"
            :y="segment.labelY"
            text-anchor="middle"
            dominant-baseline="middle"
            class="pointer-events-none select-none fill-white text-[10px] font-semibold uppercase tracking-wide"
          >
            <tspan
              v-for="(word, index) in segment.text.split(' ')"
              :key="index"
              :x="segment.labelX"
              :dy="index === 0 ? -((segment.text.split(' ').length - 1) * 5) : 11"
            >
              {{ word }}
            </tspan>
          </text>
        </g>

        <circle
          :cx="CENTER"
          :cy="CENTER"
          :r="INNER_RADIUS - 4"
          fill="rgba(15, 23, 42, 0.92)"
          stroke="rgba(148, 163, 184, 0.5)"
          stroke-width="2"
          class="cursor-pointer"
          @click="handleHub()"
        />
        <text
          :x="CENTER"
          :y="CENTER"
          text-anchor="middle"
          dominant-baseline="middle"
          class="pointer-events-none select-none fill-slate-300 text-[11px] font-semibold uppercase tracking-wide"
        >
          {{ hubText }}
        </text>
      </svg>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Verify types**

Run: `npx vue-tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AnnotationBloom.vue
git commit -m "feat: add the annotation cursor bloom component"
```

---

## Task 6: Wire the bloom into the editor

**Files:**
- Modify: `src/views/EditorView.vue` - imports, new state and handlers in `<script setup>`, and the video stage wrapper around lines 1046-1097

**Interfaces:**
- Consumes: `AnnotationBloom` (Task 5), `buildAnnotationPayload` (Task 2), `useLabelCatalog` (Task 4)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add imports and state**

In `src/views/EditorView.vue`, add to the component imports:

```ts
import AnnotationBloom from '../components/AnnotationBloom.vue';
import { useLabelCatalog } from '../composables/useLabelCatalog';
import { buildAnnotationPayload } from '../utils/annotationPayload';
```

Then add this block near the other annotation state, after `const selectedAnnotation = ref<Annotation | null>(null);` (around line 224):

```ts
// ── Annotation cursor bloom ──────────────────────────────────────────────────
// AnnotationPanel is mounted without a project id, so the bloom must use the
// same catalog key to see the same labels.
const { labels: bloomLabels, load: loadBloomLabels } = useLabelCatalog(
  () => user.value?.id
);

const bloomOpen = ref(false);
const bloomX = ref(0);
const bloomY = ref(0);

/**
 * Frame captured when the bloom opens. The video keeps playing while the menu is
 * up, so reading the frame at click time would place every annotation late.
 */
const bloomSnapshot = ref<{
  frame: number;
  fps: number;
  dual: { videoAFrame: number; videoBFrame: number } | null;
} | null>(null);

// A plain function, not a computed: canComment() is not reactive, so a computed
// would cache a stale answer.
const bloomReadOnly = () =>
  (isSharedVideo.value || isSharedComparison.value) && !canComment();

const openBloom = (event: MouseEvent) => {
  if (bloomReadOnly()) return;
  if (!user.value) return;
  if (drawingCoordinator?.isDrawingMode?.value) return;
  if (bloomLabels.value.length === 0) return;

  event.preventDefault();

  bloomSnapshot.value = {
    frame: currentFrame.value ?? 0,
    fps: fps.value || 30,
    dual:
      playerMode.value === 'dual'
        ? {
            videoAFrame: dualVideoPlayer?.videoACurrentFrame?.value ?? 0,
            videoBFrame: dualVideoPlayer?.videoBCurrentFrame?.value ?? 0,
          }
        : null,
  };
  bloomX.value = event.clientX;
  bloomY.value = event.clientY;
  bloomOpen.value = true;
};

const closeBloom = () => {
  bloomOpen.value = false;
  bloomSnapshot.value = null;
};

const handleBloomSelect = async (label: Label) => {
  const snapshot = bloomSnapshot.value;
  closeBloom();
  if (!snapshot) return;

  await handleAddAnnotation(
    buildAnnotationPayload({
      labels: bloomLabels.value,
      labelIds: [label.id],
      content: '',
      frame: snapshot.frame,
      fps: snapshot.fps,
      dual: snapshot.dual,
    })
  );
};

onMounted(() => {
  loadBloomLabels();
});
```

Add `import type { Label } from '../types/labels';` if `Label` is not already imported in this file. If `EditorView.vue` already has an `onMounted` block, put `loadBloomLabels();` inside the existing one instead of adding a second.

- [ ] **Step 2: Attach the handler and mount the component**

In the template, the video stage is the `<div class="relative w-full h-full max-h-full">` wrapper around `<UnifiedVideoPlayer>` (around line 1047). Add the context menu handler to it:

```html
<div
  class="relative w-full h-full max-h-full"
  @contextmenu="openBloom"
>
```

Then, immediately after the closing `</section>` of the video section and before the `<aside>` sidebar, mount the bloom:

```html
<AnnotationBloom
  :open="bloomOpen"
  :x="bloomX"
  :y="bloomY"
  :labels="bloomLabels"
  @select="handleBloomSelect"
  @close="closeBloom"
/>
```

- [ ] **Step 3: Verify types and the suite**

Run: `npx vue-tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/views/EditorView.vue
git commit -m "feat: open the annotation bloom on right-click over the video"
```

---

## Task 7: Runtime verification

No code unless a defect turns up. Everything here must be observed in the running app, not assumed.

**Files:**
- Modify: only whatever a failure requires

- [ ] **Step 1: Start the app**

Run: `npm run dev`, then open a video in the editor.

- [ ] **Step 2: Verify the frame snapshot, the highest-risk behaviour**

Start playback. While the video is **playing**, right-click over it, note the timestamp shown, pick a category and then a label. The created annotation must sit at the frame that was showing when the bloom opened, not several seconds later. If it lands late, the snapshot in `openBloom` is not being used at commit time.

- [ ] **Step 3: Verify the two stages**

Right-click. The first ring shows only categories that have labels, in the order Events, Pitch, Team, Officials, Players, Ball. Click one. The second ring shows that category's labels with the prefix stripped and each segment tinted with the label's own colour. Hovering a segment shows the full name and description.

- [ ] **Step 4: Verify the created annotation**

The annotation appears in the sidebar and on the timeline with the label's name as its title and the label's colour, and with the label attached. Reload the page and confirm it persisted.

- [ ] **Step 5: Verify cancellation**

Escape from the second ring returns to the categories. Escape from the first ring closes it. Clicking outside the ring closes it. The centre hub goes back and then closes. None of these create an annotation.

- [ ] **Step 6: Verify edge clamping**

Right-click near the top-left, top-right, bottom-left and bottom-right corners of the video area. The ring must stay fully visible each time, never clipped by the viewport.

- [ ] **Step 7: Verify the suppression rules**

Enter drawing mode and right-click over the video: the bloom must not open. Open a shared video in a read-only context and right-click: the bloom must not open and the browser's own context menu behaviour is unchanged.

- [ ] **Step 8: Verify the sidebar is untouched**

Add an annotation through the sidebar with a label and text: it still saves. Add one with a label and no text: it now saves too. Edit an existing annotation: it still updates.

- [ ] **Step 9: Full check and final commit**

Run: `npx vue-tsc --noEmit && npm test && npm run build`
Expected: no type errors, all tests pass, build succeeds.

Commit any fixes made during verification:

```bash
git add -A
git commit -m "fix: <what the verification turned up>"
```

If nothing needed fixing, there is nothing to commit and the feature is done.
