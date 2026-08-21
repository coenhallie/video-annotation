# Pipeline Output Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a Video / Pipeline output tab bar above the editor's video player, with annotations scoped separately to each tab.

**Architecture:** One `videos` row per match stays the single project. A new `surface` column on `annotations` (`'video' | 'pipeline'`) discriminates which tab an annotation belongs to. The tab bar sits inside the black video section above the player, so the timeline and the annotation rail stay mounted in both tabs. The pipeline tab renders an empty state; no data is fetched this round.

**Tech Stack:** Vue 3 (script setup, Composition API), TypeScript, Pinia, Supabase (PostgREST + realtime), Tailwind v4, Vitest (node env by default, `// @vitest-environment jsdom` per-file for component tests).

**Design doc:** `docs/superpowers/specs/2026-08-21-pipeline-output-tab-design.md`

## Global Constraints

- Never use the em dash character in prose, comments, commit messages or docs. Use a plain dash.
- No `Co-Authored-By` trailer and no "Generated with Claude Code" footer on commits.
- Surface values are exactly `'video'` and `'pipeline'`. No other value is valid anywhere.
- `AnnotationService.getVideoAnnotations` with `surface` **omitted** means **no surface filter**. It never defaults to `'video'`. There are 18 call sites across the repo and only the single-video path in `useVideoAnnotations` passes the argument.
- Database columns in this schema are camelCase and quoted in SQL. `surface` is a single lowercase word, so it needs no quoting.
- Run the whole suite with `npm test`. Baseline in this worktree before any of this work: **28 files, 244 tests, all passing**. Every task must leave it green. (A measurement taken in the main checkout reads 268; that tree carries unrelated uncommitted work with extra test files. Trust the 244 figure - it is what this worktree actually runs.)
- Typecheck with `npx vue-tsc --noEmit -p tsconfig.json`. This project does NOT typecheck clean: the baseline is **95 pre-existing errors**, 20 of them in `useVideoAnnotations.ts`, 12 in `EditorView.vue`, 11 in `annotationService.ts` - all three files this plan edits. So the gate is never "no errors". It is: count with `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"` and confirm the count did not rise above 95, and that `grep -E "surface|Surface|allowDrawing"` over the output finds nothing. Do not fix unrelated pre-existing errors; report them instead.
- Migrations are applied manually. This project's Supabase CLI has no `db execute`; the working invocation is `supabase db query --linked -f <file>`. Do NOT apply the migration as part of these tasks - it is a separate, explicitly-requested step.

---

## File Structure

**Create:**
- `migrations/20260821_annotation_surface.sql` - the `surface` column.
- `src/components/EditorSurfaceTabs.vue` - the two-tab switch. Presentational only: a `modelValue` in, an `update:modelValue` out.
- `src/services/__tests__/annotationSurface.test.ts` - fetch-filter tests.
- `src/composables/__tests__/realtimeSurface.test.ts` - realtime INSERT guard test.
- `src/components/__tests__/editorSurfaceTabs.test.ts` - tab bar component test.

**Modify:**
- `src/types/database.ts` - `AnnotationSurface` type, `surface` on `DatabaseAnnotation`, annotations `Insert` override.
- `src/services/annotationService.ts:33` - `getVideoAnnotations` gains an optional `surface`.
- `src/composables/useVideoAnnotations.ts:18,252,398` - `surface` param, fetch passes it, create stamps it, reload on change.
- `src/composables/useRealtimeAnnotations.ts:14,36` - `surface` param, INSERT handler drops foreign-surface rows.
- `src/components/AnnotationQuickPick.vue:11,143,657` - `allowDrawing` prop.
- `src/components/__tests__/annotationQuickPick.test.ts` - harness gains `allowDrawing`, plus two new tests.
- `src/views/EditorView.vue` - `activeSurface` ref (near line 242), derived gate and watchers (after the `useSharedContent` destructure at line 1326), tab bar, pipeline empty state, thread `activeSurface` into the two composables and the quick pick.

---

## Task 1: Migration and types

**Files:**
- Create: `migrations/20260821_annotation_surface.sql`
- Modify: `src/types/database.ts` (add `AnnotationSurface`; `DatabaseAnnotation` at line 75; annotations table entry at line 317; `AnnotationInsert` at line 423)

**Interfaces:**
- Consumes: nothing.
- Produces: `export type AnnotationSurface = 'video' | 'pipeline'` from `@/types/database`. `DatabaseAnnotation.surface: AnnotationSurface` (required, truthful for a `Row`). `AnnotationInsert` has `surface?: AnnotationSurface` (optional, because the column has a database default).

This task has no new unit test: it is a schema and type change, and the gate is the typechecker plus the existing suite. Do not invent a test that only asserts a type alias exists.

- [ ] **Step 1: Write the migration**

Create `migrations/20260821_annotation_surface.sql`:

```sql
-- migrations/20260821_annotation_surface.sql
-- Which surface of a match an annotation belongs to.
--
-- A match arrives as one `videos` row (videoId 'aws:<outputVideoId>'), and the
-- editor now shows two tabs over it: the rendered video, and the pipeline's
-- data output. Annotations on one must never appear on the other.
--
-- Deliberately a column and not a second `videos` row. A sibling row would be a
-- real dashboard project, showing up as a duplicate in the project list, in
-- recent-opens, in thumbnails and in share links; and it would carry a second
-- projectId, which splits the (userId, projectId) label vocabulary the two tabs
-- are meant to share.
--
-- NOT NULL DEFAULT 'video' is the load-bearing part: every existing annotation
-- backfills to 'video' and keeps appearing in the only tab that should show it.
-- A nullable column would make them all vanish.
--
-- Comparison annotations (videoId NULL, comparisonVideoId set) also take
-- 'video'. The value is meaningless for them: comparison loading scopes by
-- comparisonVideoId and never filters on surface, and the editor hides the tab
-- bar in dual mode.
--
-- Design: docs/superpowers/specs/2026-08-21-pipeline-output-tab-design.md

ALTER TABLE public.annotations
    ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'video';

ALTER TABLE public.annotations
    DROP CONSTRAINT IF EXISTS annotations_surface_check;

ALTER TABLE public.annotations
    ADD CONSTRAINT annotations_surface_check
    CHECK (surface IN ('video', 'pipeline'));

-- Every read of a single video's annotations now carries this predicate
-- alongside "videoId". Composite so the planner can satisfy both from one
-- index rather than filtering a whole video's annotations in memory.
CREATE INDEX IF NOT EXISTS idx_annotations_video_surface
    ON public.annotations ("videoId", surface);
```

- [ ] **Step 2: Add the type**

In `src/types/database.ts`, directly above `export interface DatabaseAnnotation` (line 75), add:

```ts
/**
 * Which surface of a match an annotation was made on. The editor shows the
 * rendered video and the pipeline's data output as two tabs over one video row,
 * and each tab shows only its own annotations.
 */
export type AnnotationSurface = 'video' | 'pipeline';
```

- [ ] **Step 3: Add the field to DatabaseAnnotation**

In `src/types/database.ts`, inside `DatabaseAnnotation`, immediately after the `comparisonVideoId?: string;` line (line 78), add:

```ts
  surface: AnnotationSurface; // Which editor tab this annotation belongs to
```

- [ ] **Step 4: Make surface optional on insert**

In `src/types/database.ts`, the annotations entry at line 317 currently reads:

```ts
      annotations: {
        Row: DatabaseAnnotation;
        Insert: Omit<DatabaseAnnotation, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<
          Omit<DatabaseAnnotation, 'id' | 'createdAt' | 'updatedAt'>
        >;
      };
```

Replace the `Insert` line so the column's database default can do its job:

```ts
      annotations: {
        Row: DatabaseAnnotation;
        // `surface` is optional on insert only because the column is
        // NOT NULL DEFAULT 'video'. Omitting it means 'video'. Four call sites
        // omit it deliberately: annotationService.ts createComparisonAnnotation
        // and the two useComparisonVideoWorkflow inserts, where the value is
        // meaningless, plus any legacy path not yet surface-aware.
        Insert: Omit<
          DatabaseAnnotation,
          'id' | 'createdAt' | 'updatedAt' | 'surface'
        > & { surface?: AnnotationSurface };
        Update: Partial<
          Omit<DatabaseAnnotation, 'id' | 'createdAt' | 'updatedAt'>
        >;
      };
```

- [ ] **Step 5: Typecheck and run the suite**

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: 95, the baseline. Not zero - see Global Constraints.

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -E "surface|AnnotationInsert"`
Expected: no output.

Run: `npm test`
Expected: 28 files, 244 tests, all passing.

If the typecheck reports a missing `surface` on an object literal, the `Insert` override in Step 4 was not applied correctly. Do not "fix" it by adding `surface: 'video'` to `createComparisonAnnotation` or to `useComparisonVideoWorkflow`.

- [ ] **Step 6: Commit**

```bash
git add migrations/20260821_annotation_surface.sql src/types/database.ts
git commit -m "feat: add annotation surface column and type"
```

---

## Task 2: Scope annotation reads and writes by surface

**Files:**
- Modify: `src/services/annotationService.ts:33-56`
- Modify: `src/composables/useVideoAnnotations.ts:18-23, 129, 252-257, 398-416`
- Test: `src/services/__tests__/annotationSurface.test.ts` (create)

**Interfaces:**
- Consumes: `AnnotationSurface` from Task 1.
- Produces:
  - `AnnotationService.getVideoAnnotations(videoId: string, projectId?: string, includeCommentCounts?: boolean, surface?: AnnotationSurface)` - a fourth positional argument. Omitted means no surface filter.
  - `useVideoAnnotations(videoUrl, videoId, projectId, comparisonVideoId, surface?: Ref<AnnotationSurface> | AnnotationSurface)` - a fifth argument, defaulting to `'video'`. Task 4 passes the editor's `activeSurface` ref here.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/annotationSurface.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mirrors src/services/__tests__/scopeQueries.test.ts: a self-returning chain,
// so every builder call lands on the same set of spies.
const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  is: vi.fn(() => chain),
  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
};
const fromMock = vi.fn(() => chain);

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

const eqCalls = () => chain.eq.mock.calls.map((call) => call[0]);

beforeEach(() => {
  fromMock.mockClear();
  chain.select.mockClear();
  chain.eq.mockClear();
  chain.is.mockClear();
  chain.order.mockClear();
});

describe('AnnotationService.getVideoAnnotations surface filter', () => {
  it('filters on the requested surface', async () => {
    const { AnnotationService } = await import('@/services/annotationService');

    await AnnotationService.getVideoAnnotations(
      'video-1',
      'project-1',
      false,
      'pipeline'
    );

    expect(chain.eq).toHaveBeenCalledWith('surface', 'pipeline');
  });

  it('filters on video when the video surface is requested', async () => {
    const { AnnotationService } = await import('@/services/annotationService');

    await AnnotationService.getVideoAnnotations(
      'video-1',
      'project-1',
      false,
      'video'
    );

    expect(chain.eq).toHaveBeenCalledWith('surface', 'video');
  });

  // The argument is omitted by 17 of the 18 call sites in the repo, including
  // every comparison and share path. Omitted must mean "no filter", not
  // "surface = video": defaulting would silently drop rows from callers that
  // never asked about surfaces at all.
  it('applies no surface filter when the argument is omitted', async () => {
    const { AnnotationService } = await import('@/services/annotationService');

    await AnnotationService.getVideoAnnotations('video-1', 'project-1', false);

    expect(eqCalls()).not.toContain('surface');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/__tests__/annotationSurface.test.ts`
Expected: the first two tests FAIL because `.eq` is never called with `'surface'`. The third passes already.

- [ ] **Step 3: Add the parameter to the service**

In `src/services/annotationService.ts`, change the signature at line 33 and add the filter after the `projectId` block. The method becomes:

```ts
  static async getVideoAnnotations(
    videoId: string,
    projectId?: string,
    includeCommentCounts?: boolean,
    surface?: AnnotationSurface
  ) {
```

and immediately after the existing `if (projectId) { ... } else { ... }` block (which ends at line 63 with `query = query.is('projectId', null);` and its closing brace), insert:

```ts
    // Omitted means "no surface filter", never "surface = video". Most callers
    // here are comparison, share and project-summary paths that predate
    // surfaces and must keep seeing every row.
    if (surface) {
      query = query.eq('surface', surface);
    }
```

Add `AnnotationSurface` to the type import at the top of the file (the existing import block that already brings in `AnnotationInsert`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/__tests__/annotationSurface.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the surface argument to useVideoAnnotations**

In `src/composables/useVideoAnnotations.ts`, change the signature at line 18:

```ts
export function useVideoAnnotations(
  videoUrl: Ref<string | null> | string,
  videoId: Ref<string | null> | string,
  projectId: Ref<string | null> | string,
  comparisonVideoId: Ref<string | null> | string,
  surface: MaybeRefOrGetter<AnnotationSurface> = 'video'
) {
```

Add `type MaybeRefOrGetter` to the existing `vue` import at the top of the file, and `type AnnotationSurface` to the existing `../types/database` import.

- [ ] **Step 6: Pass the surface on read**

In the same file at line 252, the individual-video branch of `loadAnnotations` currently reads:

```ts
        dbAnnotations = await AnnotationService.getVideoAnnotations(
          currentVideo.value.id,
          toValue(projectId),
          true // includeCommentCounts
        );
```

Change it to:

```ts
        dbAnnotations = await AnnotationService.getVideoAnnotations(
          currentVideo.value.id,
          toValue(projectId),
          true, // includeCommentCounts
          toValue(surface)
        );
```

The comparison branch above it is left untouched: comparison annotations scope by `comparisonVideoId` and the editor hides the tab bar in dual mode.

- [ ] **Step 7: Stamp the surface on write**

In the same file, the `dbAnnotation` literal built in `addAnnotation` (line 398) ends with `metadata: annotationWithoutLabels.metadata,`. Add one line after it:

```ts
          surface: toValue(surface),
```

- [ ] **Step 8: Reload when the surface changes**

In the same file, directly below the existing `watch` on `comparisonVideoId` (which ends around line 56), add:

```ts
  // Switching tabs swaps which annotations exist, so the list has to be
  // refetched. Everything downstream - the annotation panel, the timeline
  // markers, the quick pick - reads this one array, so they all follow.
  watch(
    () => toValue(surface),
    async (next, previous) => {
      if (next !== previous) {
        await loadAnnotations();
      }
    }
  );
```

`loadAnnotations` is declared with `const` at line 129, below this watcher. That is fine: the callback only runs after setup completes, so the binding is initialised by the time it fires.

- [ ] **Step 9: Run the whole suite and typecheck**

Run: `npm test`
Expected: 247 tests passing (244 baseline plus the 3 added here).

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: 95 or lower.

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -E "surface|Surface"`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add src/services/annotationService.ts src/composables/useVideoAnnotations.ts src/services/__tests__/annotationSurface.test.ts
git commit -m "feat: scope annotation reads and writes by surface"
```

---

## Task 3: Drop foreign-surface realtime inserts

**Files:**
- Modify: `src/composables/useRealtimeAnnotations.ts:14-16, 26-45`
- Test: `src/composables/__tests__/realtimeSurface.test.ts` (create)

**Interfaces:**
- Consumes: `AnnotationSurface` from Task 1.
- Produces: `useRealtimeAnnotations(videoId, annotations, surface?: MaybeRefOrGetter<AnnotationSurface>)` - a third argument, defaulting to `'video'`.

Only the INSERT handler needs a guard. UPDATE looks the row up with `findIndex` and no-ops on `-1`; DELETE filters by id and no-ops when the id is absent. Both self-guard, because the local list only ever holds the active surface. Do not write a DELETE-surface test: with Postgres's default replica identity a DELETE payload carries only the primary key, so `payload.old.surface` is `undefined` and such a test cannot pass.

- [ ] **Step 1: Write the failing test**

Create `src/composables/__tests__/realtimeSurface.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { Annotation } from '@/types/database';

type Handler = (payload: Record<string, unknown>) => void;

/** Captured `on('postgres_changes', config, handler)` registrations. */
const handlers: Array<{ event: string; handler: Handler }> = [];

const channel = {
  on: vi.fn(
    (_type: string, config: { event: string }, handler: Handler) => {
      handlers.push({ event: config.event, handler });
      return channel;
    }
  ),
  subscribe: vi.fn(() => channel),
  track: vi.fn(),
  presenceState: vi.fn(() => ({})),
};

vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  },
}));

const insertHandler = (): Handler => {
  const entry = handlers.find((h) => h.event === 'INSERT');
  if (!entry) throw new Error('no INSERT handler registered');
  return entry.handler;
};

const row = (id: string, surface: string) =>
  ({ id, surface, timestamp: 1 }) as unknown as Annotation;

beforeEach(() => {
  handlers.length = 0;
  channel.on.mockClear();
  channel.subscribe.mockClear();
});

describe('useRealtimeAnnotations surface guard', () => {
  it('appends an insert on the active surface', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const annotations = ref<Annotation[]>([]);

    useRealtimeAnnotations(ref('video-1'), annotations, ref('video'));
    insertHandler()({ new: row('a1', 'video') });

    expect(annotations.value.map((a) => a.id)).toEqual(['a1']);
  });

  // The subscription filters on videoId only, and both tabs share one video
  // row. Without this guard another client's pipeline annotation appends into
  // the Video tab's list and shows up as a phantom marker on the timeline.
  it('drops an insert from the other surface', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const annotations = ref<Annotation[]>([]);

    useRealtimeAnnotations(ref('video-1'), annotations, ref('video'));
    insertHandler()({ new: row('a2', 'pipeline') });

    expect(annotations.value).toEqual([]);
  });

  it('appends a pipeline insert while the pipeline surface is active', async () => {
    const { useRealtimeAnnotations } = await import(
      '@/composables/useRealtimeAnnotations'
    );
    const annotations = ref<Annotation[]>([]);

    useRealtimeAnnotations(ref('video-1'), annotations, ref('pipeline'));
    insertHandler()({ new: row('a3', 'pipeline') });

    expect(annotations.value.map((a) => a.id)).toEqual(['a3']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/composables/__tests__/realtimeSurface.test.ts`
Expected: the second test FAILS - the annotation is appended and the array is not empty. The other two pass already.

If instead every test errors with something about `onUnmounted`, the composable is being called outside a component instance. That is expected to warn but not to throw; if it throws, wrap each `useRealtimeAnnotations(...)` call in the test in a mounted component the way `src/components/__tests__/annotationQuickPick.test.ts` mounts its harness, and add `// @vitest-environment jsdom` as the first line of the test file.

- [ ] **Step 3: Add the parameter and the guard**

In `src/composables/useRealtimeAnnotations.ts`, change the signature at line 14:

```ts
export function useRealtimeAnnotations(
  videoId: Ref<string | null> | (() => string | null),
  annotations: Ref<Annotation[]>,
  surface: MaybeRefOrGetter<AnnotationSurface> = 'video'
) {
```

Add `type MaybeRefOrGetter` to the existing `vue` import and `type AnnotationSurface` to the existing `../types/database` import.

Then in the INSERT handler (line 36), replace the body:

```ts
        (payload) => {
          const newAnnotation = payload.new as Annotation;

          // Add to annotations if not already present
          if (!annotations.value.find((a) => a.id === newAnnotation.id)) {
            annotations.value.push(newAnnotation);
            annotations.value.sort((a, b) => a.timestamp - b.timestamp);
          }
        }
```

with:

```ts
        (payload) => {
          const newAnnotation = payload.new as Annotation;

          // The channel filters on videoId only, and the Video and Pipeline
          // tabs share one video row, so an insert from the other tab arrives
          // here too. The local list holds the active surface alone; letting a
          // foreign row in puts a phantom marker on the timeline.
          //
          // Rows written before the surface column existed have no value here.
          // They are 'video' by the column's default, so treat a missing value
          // as 'video' rather than dropping them.
          const rowSurface =
            (newAnnotation as { surface?: AnnotationSurface }).surface ??
            'video';
          if (rowSurface !== toValue(surface)) return;

          // Add to annotations if not already present
          if (!annotations.value.find((a) => a.id === newAnnotation.id)) {
            annotations.value.push(newAnnotation);
            annotations.value.sort((a, b) => a.timestamp - b.timestamp);
          }
        }
```

`toValue` is already imported in this file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/composables/__tests__/realtimeSurface.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 250 tests passing (247 after Task 2 plus the 3 added here).

- [ ] **Step 6: Commit**

```bash
git add src/composables/useRealtimeAnnotations.ts src/composables/__tests__/realtimeSurface.test.ts
git commit -m "feat: drop realtime inserts from the inactive surface"
```

---

## Task 4: Tab bar, empty state and drawing gate

**Files:**
- Create: `src/components/EditorSurfaceTabs.vue`
- Create: `src/components/__tests__/editorSurfaceTabs.test.ts`
- Modify: `src/components/AnnotationQuickPick.vue:11-23, 143-147, 657-672`
- Modify: `src/components/__tests__/annotationQuickPick.test.ts`
- Modify: `src/views/EditorView.vue` (script: near line 285 and 251; template: line 1554 onward)

**Interfaces:**
- Consumes: `AnnotationSurface` (Task 1), `useVideoAnnotations(..., surface)` (Task 2), `useRealtimeAnnotations(videoId, annotations, surface)` (Task 3).
- Produces: `EditorSurfaceTabs` with props `{ modelValue: AnnotationSurface }` and emit `update:modelValue`. `AnnotationQuickPick` gains `allowDrawing: { type: Boolean, default: true }`.

- [ ] **Step 1: Write the failing component test**

Create `src/components/__tests__/editorSurfaceTabs.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import EditorSurfaceTabs from '@/components/EditorSurfaceTabs.vue';
import type { AnnotationSurface } from '@/types/database';

function mountTabs(initial: AnnotationSurface = 'video') {
  const current = ref<AnnotationSurface>(initial);
  const root = document.createElement('div');
  document.body.appendChild(root);

  const app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(EditorSurfaceTabs, {
            modelValue: current.value,
            'onUpdate:modelValue': (next: AnnotationSurface) => {
              current.value = next;
            },
          });
      },
    })
  );
  app.mount(root);

  return {
    root,
    current,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

const tab = (root: HTMLElement, surface: AnnotationSurface) =>
  root.querySelector<HTMLButtonElement>(`[data-testid="surface-tab-${surface}"]`);

describe('EditorSurfaceTabs', () => {
  it('renders a tab for each surface', () => {
    const harness = mountTabs();

    expect(tab(harness.root, 'video')?.textContent).toContain('Video');
    expect(tab(harness.root, 'pipeline')?.textContent).toContain(
      'Pipeline output'
    );

    harness.unmount();
  });

  it('marks the active tab as selected', () => {
    const harness = mountTabs('pipeline');

    expect(tab(harness.root, 'pipeline')?.getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(tab(harness.root, 'video')?.getAttribute('aria-selected')).toBe(
      'false'
    );

    harness.unmount();
  });

  it('emits the new surface on click', async () => {
    const harness = mountTabs('video');

    tab(harness.root, 'pipeline')?.click();
    await nextTick();

    expect(harness.current.value).toBe('pipeline');

    harness.unmount();
  });

  // Clicking the tab you are already on must not emit: every emit triggers an
  // annotation refetch through the watcher in useVideoAnnotations.
  it('does not emit when the active tab is clicked again', async () => {
    const harness = mountTabs('video');
    let emits = 0;

    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(EditorSurfaceTabs, {
              modelValue: 'video' as AnnotationSurface,
              'onUpdate:modelValue': () => {
                emits += 1;
              },
            });
        },
      })
    );
    app.mount(root);

    root.querySelector<HTMLButtonElement>('[data-testid="surface-tab-video"]')?.click();
    await nextTick();

    expect(emits).toBe(0);

    app.unmount();
    root.remove();
    harness.unmount();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/editorSurfaceTabs.test.ts`
Expected: FAIL - cannot resolve `@/components/EditorSurfaceTabs.vue`.

- [ ] **Step 3: Write the component**

Create `src/components/EditorSurfaceTabs.vue`:

```vue
<script setup lang="ts">
import type { AnnotationSurface } from '@/types/database';

const props = defineProps<{ modelValue: AnnotationSurface }>();

const emit = defineEmits<{
  (e: 'update:modelValue', surface: AnnotationSurface): void;
}>();

const TABS: Array<{ id: AnnotationSurface; label: string }> = [
  { id: 'video', label: 'Video' },
  { id: 'pipeline', label: 'Pipeline output' },
];

/**
 * Re-clicking the active tab is a no-op on purpose. Every emit reaches the
 * watcher in useVideoAnnotations and costs an annotation refetch.
 */
const select = (surface: AnnotationSurface) => {
  if (surface === props.modelValue) return;
  emit('update:modelValue', surface);
};
</script>

<template>
  <div
    role="tablist"
    aria-label="Editor surface"
    class="flex items-center gap-1 border-b border-white/10 bg-black px-4"
  >
    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      role="tab"
      :data-testid="`surface-tab-${tab.id}`"
      :aria-selected="tab.id === modelValue ? 'true' : 'false'"
      class="relative -mb-px border-b-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors"
      :class="
        tab.id === modelValue
          ? 'border-white text-white'
          : 'border-transparent text-gray-500 hover:text-gray-300'
      "
      @click="select(tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/editorSurfaceTabs.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit the component**

```bash
git add src/components/EditorSurfaceTabs.vue src/components/__tests__/editorSurfaceTabs.test.ts
git commit -m "feat: add editor surface tab bar component"
```

- [ ] **Step 6: Write the failing drawing-gate tests**

In `src/components/__tests__/annotationQuickPick.test.ts`, the `mountPanel` helper builds the props object. Give it an `allowDrawing` option.

Change the signature:

```ts
function mountPanel(
  labels: Label[] = LABELS,
  options: { allowDrawing?: boolean } = {}
): Harness {
```

and add one line to the props object passed to `h(AnnotationQuickPick, { ... })`, immediately after `drawWidth: drawWidth.value,`:

```ts
            allowDrawing: options.allowDrawing ?? true,
```

Then append this describe block at the end of the file:

```ts
describe('AnnotationQuickPick drawing gate', () => {
  it('offers drawing by default', () => {
    const harness = mountPanel();

    const buttons = Array.from(
      harness.root.querySelectorAll('button')
    ).map((b) => b.textContent ?? '');
    expect(buttons.some((text) => text.includes('DRAWING'))).toBe(true);

    harness.unmount();
  });

  // The Pipeline tab has no video element for the drawing canvas to mount on,
  // so the affordance must be gone, not merely inert.
  it('hides the drawing entry when drawing is not allowed', () => {
    const harness = mountPanel(LABELS, { allowDrawing: false });

    const buttons = Array.from(
      harness.root.querySelectorAll('button')
    ).map((b) => b.textContent ?? '');
    expect(buttons.some((text) => text.includes('DRAWING'))).toBe(false);

    harness.unmount();
  });

  it('ignores the D key when drawing is not allowed', async () => {
    const harness = mountPanel(LABELS, { allowDrawing: false });

    press('d');
    await nextTick();

    expect(harness.events.map(([name]) => name)).not.toContain('draw-mode');

    harness.unmount();
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run src/components/__tests__/annotationQuickPick.test.ts`
Expected: the "hides the drawing entry" and "ignores the D key" tests FAIL. "offers drawing by default" and every pre-existing test pass.

- [ ] **Step 8: Add the allowDrawing prop**

In `src/components/AnnotationQuickPick.vue`, add to `defineProps` (line 11), after `drawWidth`:

```ts
  /**
   * False on a surface with no video element under the panel, where the
   * drawing canvas has nothing to mount on. Hides the entry and disarms D.
   */
  allowDrawing: { type: Boolean, default: true },
```

Then gate the single function both entry points route through (line 143):

```ts
const enterDrawMode = () => {
  if (!props.allowDrawing) return;
  if (mode.value === 'draw') return;
  mode.value = 'draw';
  emit('draw-mode', true);
};
```

Both the `D` key handler (line 342) and the DRAWING button (line 660) call `enterDrawMode`, so this one guard covers both. `handleDrawKeydown`'s `emit('draw')` runs only once already in draw mode, which is now unreachable, so it needs no change.

Finally hide the button so there is no dead affordance. On the DRAWING `<button>` at line 657, add:

```
            v-if="allowDrawing"
```

as the first attribute, directly after `<button`.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/components/__tests__/annotationQuickPick.test.ts`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 10: Commit the drawing gate**

```bash
git add src/components/AnnotationQuickPick.vue src/components/__tests__/annotationQuickPick.test.ts
git commit -m "feat: let the quick pick hide its drawing entry"
```

- [ ] **Step 11: Wire the editor state**

In `src/views/EditorView.vue`, add the import alongside the other component imports near line 20:

```ts
import EditorSurfaceTabs from '@/components/EditorSurfaceTabs.vue';
```

and add `type AnnotationSurface` to the existing `@/types/database` type import (line 43).

This state is deliberately split across two places in the file. `activeSurface`
has to exist **before** the `useVideoAnnotations` call at line 251 that consumes
it. `hasPipelineSurface` reads `isSharedVideo`, which is not destructured until
line 1326, and `watch` evaluates a computed source eagerly - defining it at the
top would hit the temporal dead zone and throw during setup.

**11a.** Directly above the `// Annotation data` block at line 242, add only the
ref:

```ts
// ── Editor surface (Video / Pipeline output tabs) ────────────────────────────

const activeSurface = ref<AnnotationSurface>('video');
```

**11b.** Then, immediately **after** the closing `});` of the `useSharedContent`
destructure (the block beginning at line 1326 with `const { isSharedVideo, ...`),
add the gate and its watchers:

```ts
/**
 * Derived from the loaded video, not from the videoStore's `isAwsVideo` ref.
 * That ref is set true on both load paths but only ever cleared by
 * resetForProjectSwitch, so a path that skips the reset leaves it stale-true
 * and puts the tab bar on a video that has no pipeline output.
 *
 * Share views are excluded on purpose. loadAnnotations returns early for a
 * share link and takes its list from ShareService, which calls
 * getVideoAnnotations without a surface (shareService.ts:88) and so returns
 * both surfaces. Showing tabs there would put every annotation in both tabs.
 */
const hasPipelineSurface = computed(
  () =>
    playerMode.value === 'single' &&
    !isSharedVideo.value &&
    VideoService.isAwsVideo(
      (currentVideoObject.value ?? {}) as Record<string, unknown>
    )
);

// A project without the pipeline surface must never sit on the pipeline tab:
// switching to a plain video would otherwise hide its annotations behind a tab
// bar that is no longer rendered.
watch(hasPipelineSurface, (available) => {
  if (!available) activeSurface.value = 'video';
});

// Opening a different project starts on the video tab.
watch(currentVideoId, () => {
  activeSurface.value = 'video';
});

// The player stays mounted behind the pipeline tab (v-show, not v-if), so
// without this the audio keeps running with no picture. Switching back does not
// auto-resume: the timeline's own play control is still there and still owns
// playback on both tabs.
watch(activeSurface, (surface) => {
  if (surface === 'pipeline' && isPlaying.value) {
    unifiedVideoPlayerRef.value?.pause();
  }
});
```

`ref`, `computed` and `watch` are already imported, `VideoService` is already
imported, and `unifiedVideoPlayerRef` is already declared in this file.

- [ ] **Step 12: Thread the surface into the two composables**

In the same file, the `useVideoAnnotations` call at line 251 ends with the `computed(...)` comparison-id argument and its closing `);`. Add `activeSurface` as a fifth argument:

```ts
} = useVideoAnnotations(
  videoUrl,
  videoId,
  currentProjectId,
  computed(() => {
    if (
      playerMode.value === 'dual' &&
      comparisonWorkflow.currentComparison.value?.id
    ) {
      return comparisonWorkflow.currentComparison.value.id;
    }
    return null;
  }),
  activeSurface
);
```

And at line 722, change:

```ts
useRealtimeAnnotations(videoId, annotations);
```

to:

```ts
useRealtimeAnnotations(videoId, annotations, activeSurface);
```

`annotations` comes back from `useVideoAnnotations` wrapped in `readonly()`, which is part of why `EditorView.vue` carries 12 pre-existing type errors. Add the third argument and change nothing else on that line. Do not "fix" the readonly mismatch here; it is out of scope and touching it will ripple through the annotation panel and timeline props.

- [ ] **Step 13: Render the tab bar and the empty state**

In the same file's template, the video section at line 1554 currently reads:

```vue
      <section class="flex-1 flex flex-col bg-black min-w-0 overflow-hidden">
        <div class="flex-1 flex items-center justify-center p-6">
          <div class="w-full h-full flex flex-col items-center justify-center">
            <div
              class="relative w-full h-full max-h-full"
              @contextmenu="openQuickPick"
            >
              <!-- Unified Video Player -->
              <UnifiedVideoPlayer
```

Insert the tab bar as the section's first child, and wrap the player container so the pipeline tab can replace it. The section's opening lines become:

```vue
      <section class="flex-1 flex flex-col bg-black min-w-0 overflow-hidden">
        <EditorSurfaceTabs
          v-if="hasPipelineSurface"
          v-model="activeSurface"
        />
        <div class="flex-1 flex items-center justify-center p-6">
          <div class="w-full h-full flex flex-col items-center justify-center">
            <!--
              The player stays mounted with v-show rather than v-if: v-if would
              tear down the video element on every tab switch, dropping playback
              position, the decoded buffer and the drawing canvas with it.
            -->
            <div
              v-show="activeSurface === 'video'"
              class="relative w-full h-full max-h-full"
              @contextmenu="openQuickPick"
            >
              <!-- Unified Video Player -->
              <UnifiedVideoPlayer
```

The `UnifiedVideoPlayer` element and its props are unchanged. After its closing `/>` and the `</div>` that closes the player container, and before the `</div>` that closes `w-full h-full flex flex-col ...`, add the empty state:

```vue
            <div
              v-if="activeSurface === 'pipeline'"
              data-testid="pipeline-empty-state"
              class="flex h-full w-full flex-col items-center justify-center text-center"
            >
              <svg
                class="mb-3 h-8 w-8 text-gray-600"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
              <p class="text-[12px] text-gray-400">
                Pipeline output is not available yet
              </p>
              <p class="mt-1 text-[11px] text-gray-600">
                Annotations you add here stay separate from the video's.
              </p>
            </div>
```

- [ ] **Step 14: Gate drawing in the quick pick**

In the same file's template, on the `<AnnotationQuickPick>` element, add one prop after `:draw-width="quickPickDrawWidth"`:

```vue
        :allow-drawing="activeSurface === 'video'"
```

- [ ] **Step 15: Verify the wiring compiles and the suite passes**

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: 95 or lower.

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -E "surface|Surface|allowDrawing|activeSurface"`
Expected: no output.

Run: `npm test`
Expected: 257 tests passing (250 after Task 3, plus 4 for the tab bar and 3 for the drawing gate).

Run: `npx eslint src/views/EditorView.vue src/components/EditorSurfaceTabs.vue src/components/AnnotationQuickPick.vue`
Expected: no errors.

- [ ] **Step 16: Commit**

```bash
git add src/views/EditorView.vue
git commit -m "feat: show video and pipeline output tabs in the editor"
```

---

## Task 5: Apply the migration and verify end to end

This task touches the live database and a running app. Do NOT start it without the user explicitly asking. It is listed so the work is not considered done when Task 4 commits.

**Files:** none.

**Ordering, non-negotiable: the migration goes first, the frontend second, never the reverse.** The read filter and the insert stamp are unconditional - `useVideoAnnotations` defaults `surface` to `'video'` and passes it on every single-video project, AWS or not - so this frontend against a database without the column takes annotations down everywhere: reads answer `400` / `42703` (unknown column `surface`) and every project's list comes back empty, inserts answer `400` / `PGRST204` and nobody can create an annotation on anything. Deploys on this project are manual and production lags behind the branch, so never let a build carrying this change reach an environment whose database has not had the migration applied and verified.

- [ ] **Step 1: Count annotations before**

```bash
supabase db query --linked --query "SELECT count(*) FROM public.annotations;"
```

Record the number.

- [ ] **Step 2: Apply the migration**

```bash
supabase db query --linked -f migrations/20260821_annotation_surface.sql
```

This CLI has no `db execute`; `db query --linked -f` is the invocation that works on this project.

- [ ] **Step 3: Verify PostgREST exposes the column**

The `ALTER TABLE` succeeding is not enough. The app reaches the column through PostgREST, which answers from a cached schema, and a SQL-level `select surface from annotations limit 1` proves only that Postgres knows about it. Check over REST, and check the *filter* path rather than the select list, because filtering is what `getVideoAnnotations` actually does:

```bash
curl -s -w '\n%{http_code}\n' \
  "$VITE_SUPABASE_URL/rest/v1/annotations?surface=eq.video&select=id&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
```

Expected: `200`. The body is printed as well as the status because the two ways this can fail need different responses, and the status alone does not tell them apart:

- **`42703`, `column annotations.surface does not exist`** - Postgres itself does not have the column. The migration did not apply, or it applied to a different database than the one this URL points at. `NOTIFY` will not help. Go back to Step 2 and confirm which project `--linked` resolved to.
- **`PGRST204`, `Could not find the 'surface' column ... in the schema cache`** - Postgres has the column but PostgREST is serving a stale cache. This is the case `NOTIFY` fixes:

```bash
supabase db query --linked --query "NOTIFY pgrst, 'reload schema';"
```

Then re-run the curl.

Note what this check does NOT prove. `PGRST204` is raised when a request body names a column the cache does not know, so it is a *write*-path failure that can persist while reads already succeed. A `200` here means reads are safe; the insert path is only proven by actually creating an annotation, which Step 5's manual pass does. Do not deploy the frontend until this returns `200` AND Step 5's annotation-creation checks pass against the migrated database.

- [ ] **Step 4: Verify the backfill**

```bash
supabase db query --linked --query "SELECT surface, count(*) FROM public.annotations GROUP BY surface;"
```

Expected: one row, `video`, with the count from Step 1. Any NULL row, or a total that does not match, means the column was added without the `NOT NULL DEFAULT 'video'` and every existing annotation has just disappeared from the Video tab.

- [ ] **Step 5: Verify in the running app**

Run the dev server, sign in, and open an AWS pipeline project from the dashboard, not through `?outputVideo=`. Then confirm each of these:

1. The tab bar appears, with Video active.
2. Existing annotations on that project are all still listed in the panel and marked on the timeline.
3. Add an annotation on the Video tab. It appears in the panel and on the timeline.
4. Switch to Pipeline output. The empty state shows, the panel is empty, the timeline has no markers, and the timeline itself is still there and still scrubs.
5. Left-click the timeline on the Pipeline tab. The quick pick opens with no DRAWING entry, and pressing D does nothing. Add a text annotation. It appears in the panel.
6. Switch back to Video. Only the video annotation is listed. Switch again: only the pipeline one.
7. Reload the page. Both tabs still show their own annotations.
8. Start playback, then switch to Pipeline output. Playback stops and no audio continues. Switch back: the video is where you left it, paused.
9. Open a non-AWS video. No tab bar, and the layout is pixel-identical to before this change.
10. Open a comparison project. No tab bar, and dual-mode annotating is unchanged.
11. Open the pipeline project through a share link. No tab bar, and the annotation list matches what a share viewer saw before this change.

Report anything that does not match, including anything visually off by a pixel. Do not report the feature working without having run every one of these.

---

## Notes for the implementer

- The `?outputVideo=` deep link and the DALF game id are out of scope. The code has no notion of DALF; `outputVideoId` is what exists. Whether a DALF game id maps to it verbatim is an open question recorded in the design doc, and it does not affect any task here.
- No change to `netlify/functions/aws-storage.cjs`. It builds its S3 path server-side on purpose, and fetching pipeline data is a later round.
- Labels are deliberately untouched. Both tabs share one `(userId, projectId)` catalog.
