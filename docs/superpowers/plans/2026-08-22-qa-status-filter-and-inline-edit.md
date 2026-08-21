# QA Status Filtering and Inline Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reviewer filter the dashboard by QA status from the existing filter panel, and change a video's status directly from its list row instead of opening the details panel first.

**Architecture:** Two pure functions in a new `qaStatusFilter.ts` do the filtering and counting, so `DashboardView` gains state and wiring but no logic. The write path moves out of `QaStatusSelect.vue` into a `useQaStatusWrite` composable, because a second control in the list would otherwise be a second copy of the code that produced this feature's one Critical review finding. The list's read-only pill becomes a native `<select>` wearing the pill's shape.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API), TypeScript, Tailwind v4, Vitest.

**Specs:** `docs/superpowers/specs/2026-08-22-qa-status-filter-design.md` and `docs/superpowers/specs/2026-08-22-qa-status-inline-edit-design.md`. Read the one your task cites before starting it. Where a spec and this plan disagree, the spec wins and the plan is wrong.

## Global Constraints

- The five values, exactly: `not_started`, `in_review`, `failed`, `staging`, `production`. `not_started` displays as `UNREVIEWED`.
- Filter semantics: OR within a filter type, AND across filter types. An empty status set means the filter is off, not "match nothing".
- Dual (comparison) projects have no `qaStatus`. They never match a status filter, never appear in a count, and never render a control. Their 96px slot stays reserved.
- Monochrome visual language. The only colour accent is `text-red-600` / `dark:text-red-400`, on `failed`. `production` is the only filled pill.
- Every pill keeps one shared fixed width (`w-24`). That is what makes the column scan.
- No em dash (`—`) in any prose, comment, commit message or doc. Use a plain dash.
- No `Co-Authored-By` trailer and no "Generated with Claude Code" footer on commits.
- Never run `git stash` in any form. The stash stack is shared with other worktrees and concurrent sessions.
- Tests: `npx vitest run <path>`; whole suite `npm test`. Component tests use raw `createApp` with `// @vitest-environment jsdom` and `data-testid` selectors, no `@vue/test-utils`. See `src/components/__tests__/qaStatusPill.test.ts`.
- Baseline to preserve: 312 tests passing, 95 `vue-tsc` errors (all pre-existing), eslint clean on touched files.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/utils/qaStatusFilter.ts` | Create (Task 1). Two pure generic functions: the filter predicate and the per-status counts. No Vue, no `Project` import. |
| `src/utils/__tests__/qaStatusFilter.test.ts` | Create (Task 1). |
| `src/views/DashboardView.vue` | Modify (Tasks 2, 5, 6). Filter state, the panel's QA section, the inline-edit write-back, the filter-hid-it toast. |
| `src/composables/useQaStatusWrite.ts` | Create (Task 3). The whole write path, moved out of the select. |
| `src/composables/__tests__/useQaStatusWrite.test.ts` | Create (Task 3). Inherits the race tests. |
| `src/components/QaStatusSelect.vue` | Modify (Task 3). Keeps its markup, delegates the write. |
| `src/components/QaStatusPillSelect.vue` | Create (Task 4). The list control: a select wearing the pill. |
| `src/components/__tests__/qaStatusPillSelect.test.ts` | Create (Task 4). |
| `src/components/ProjectListItem.vue` | Modify (Task 5). Swap the read-only pill for the editable one, emit upward. |

Task order matters in one place: Task 3 (the composable) must land before Task 4 (the second control), or Task 4 has nothing to delegate to and the duplication this plan exists to prevent happens anyway.

---

### Task 1: The filter and count functions

**Spec:** `2026-08-22-qa-status-filter-design.md`, sections "Semantics" and "A new module, not qaStatus.ts".

**Files:**
- Create: `src/utils/qaStatusFilter.ts`
- Test: `src/utils/__tests__/qaStatusFilter.test.ts`

**Interfaces:**
- Consumes: `QaStatus` and `QA_STATUSES` from the existing `src/types/database.ts` and `src/utils/qaStatus.ts`.
- Produces:
  - `filterByQaStatus<T>(projects: T[], active: ReadonlySet<QaStatus>, statusOf: (p: T) => QaStatus | null): T[]`
  - `countByQaStatus<T>(projects: T[], statusOf: (p: T) => QaStatus | null): Record<QaStatus, number>`

Both are generic and take a `statusOf` accessor so neither imports `Project` or knows about its discriminated union.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/qaStatusFilter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filterByQaStatus, countByQaStatus } from '@/utils/qaStatusFilter';
import type { QaStatus } from '@/types/database';

type Row = { id: string; status: QaStatus | null };
const statusOf = (r: Row) => r.status;

const rows: Row[] = [
  { id: 'a', status: 'not_started' },
  { id: 'b', status: 'failed' },
  { id: 'c', status: 'in_review' },
  { id: 'd', status: 'failed' },
  { id: 'e', status: null }, // a dual project
];

const ids = (list: Row[]) => list.map((r) => r.id);

describe('filterByQaStatus', () => {
  // An empty set means "filter off", the same way activeLabelIds already
  // behaves. Returning nothing here would blank the dashboard on first paint.
  it('returns everything when nothing is selected', () => {
    expect(ids(filterByQaStatus(rows, new Set(), statusOf))).toEqual([
      'a', 'b', 'c', 'd', 'e',
    ]);
  });

  it('keeps only the selected status', () => {
    expect(ids(filterByQaStatus(rows, new Set<QaStatus>(['failed']), statusOf)))
      .toEqual(['b', 'd']);
  });

  it('ORs within the selection', () => {
    const active = new Set<QaStatus>(['failed', 'in_review']);
    expect(ids(filterByQaStatus(rows, active, statusOf))).toEqual(['b', 'c', 'd']);
  });

  // Dual projects have no status, so no selection can match them.
  it('never matches a project with no status', () => {
    for (const status of ['not_started', 'in_review', 'failed', 'staging', 'production'] as QaStatus[]) {
      const kept = filterByQaStatus(rows, new Set([status]), statusOf);
      expect(kept.some((r) => r.id === 'e')).toBe(false);
    }
  });

  it('preserves input order', () => {
    const active = new Set<QaStatus>(['in_review', 'not_started']);
    expect(ids(filterByQaStatus(rows, active, statusOf))).toEqual(['a', 'c']);
  });
});

describe('countByQaStatus', () => {
  it('counts every status, including the empty ones', () => {
    expect(countByQaStatus(rows, statusOf)).toEqual({
      not_started: 1,
      in_review: 1,
      failed: 2,
      staging: 0,
      production: 0,
    });
  });

  it('does not count projects with no status', () => {
    const total = Object.values(countByQaStatus(rows, statusOf)).reduce((a, b) => a + b, 0);
    expect(total).toBe(4); // five rows, one of them null
  });

  // The caller passes an already-narrowed list; the counts describe that list.
  it('reflects the list it is handed', () => {
    const narrowed = rows.filter((r) => r.id === 'b');
    expect(countByQaStatus(narrowed, statusOf).failed).toBe(1);
    expect(countByQaStatus(narrowed, statusOf).not_started).toBe(0);
  });

  it('returns zeros for an empty list rather than an empty object', () => {
    expect(countByQaStatus([], statusOf)).toEqual({
      not_started: 0, in_review: 0, failed: 0, staging: 0, production: 0,
    });
  });
});

// The filter spec asks for a check that the chain composes: status AND label
// together, not either alone. The label half is inline in DashboardView's
// computed, so this asserts the composition at the seam this module owns -
// a status filter applied to an already-label-narrowed list. The rest of the
// chain is covered by the visual pass.
describe('composing with an earlier filter', () => {
  it('ANDs with a list that has already been narrowed', () => {
    const labelNarrowed = rows.filter((r) => r.id === 'b' || r.id === 'c');
    const active = new Set<QaStatus>(['failed']);
    expect(ids(filterByQaStatus(labelNarrowed, active, statusOf))).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/utils/__tests__/qaStatusFilter.test.ts`
Expected: FAIL, cannot resolve `@/utils/qaStatusFilter`.

- [ ] **Step 3: Write the module**

Create `src/utils/qaStatusFilter.ts`:

```ts
import type { QaStatus } from '@/types/database';
import { QA_STATUSES } from '@/utils/qaStatus';

/**
 * Narrows a project list to the selected statuses.
 *
 * Generic over the project type and taking a `statusOf` accessor, so this
 * module never imports Project and never has to know about its discriminated
 * union. `statusOf` returning null means "has no status" - the dual-project
 * case - which matches no selection.
 *
 * An empty `active` set means the filter is off and everything passes. It does
 * NOT mean "match nothing": that would blank the dashboard on first paint, and
 * it is the same convention activeLabelIds already follows.
 */
export function filterByQaStatus<T>(
  projects: T[],
  active: ReadonlySet<QaStatus>,
  statusOf: (project: T) => QaStatus | null
): T[] {
  if (active.size === 0) return projects;
  return projects.filter((project) => {
    const status = statusOf(project);
    return status !== null && active.has(status);
  });
}

/**
 * How many of these projects carry each status.
 *
 * Every one of the five keys is always present, zeros included: the filter
 * panel renders a fixed vocabulary, and a missing key would make a row's count
 * read as undefined.
 *
 * The counts describe exactly the list handed in. The caller is responsible for
 * passing a list with every OTHER filter already applied but not the status
 * filter, so that selecting one status does not collapse the other four to
 * zero.
 */
export function countByQaStatus<T>(
  projects: T[],
  statusOf: (project: T) => QaStatus | null
): Record<QaStatus, number> {
  const counts = Object.fromEntries(
    QA_STATUSES.map((status) => [status, 0])
  ) as Record<QaStatus, number>;

  for (const project of projects) {
    const status = statusOf(project);
    if (status !== null) counts[status] += 1;
  }

  return counts;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/utils/__tests__/qaStatusFilter.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/qaStatusFilter.ts src/utils/__tests__/qaStatusFilter.test.ts
git commit -m "feat: add QA status filter and count functions

Generic over the project type so the module never imports Project. An
empty selection means the filter is off, not that nothing matches."
```

---

### Task 2: Filter state and the panel's QA section

**Spec:** `2026-08-22-qa-status-filter-design.md`, sections "The panel", "The counts", "State and placement".

**Files:**
- Modify: `src/views/DashboardView.vue` (state near line 67, the `filteredProjects` chain at 204-223, the page-reset watcher at 184-190, the filter button at 432-462, the dropdown card at 470-535)

**Interfaces:**
- Consumes: `filterByQaStatus` and `countByQaStatus` from Task 1; the existing `QaStatusPill` component; `QA_STATUSES` from `@/utils/qaStatus`.
- Produces: no exports. `DashboardView` gains `activeQaStatuses`, `toggleQaStatusFilter`, `clearAllFilters`, `qaStatusCounts`, and `statusOfProject`.

- [ ] **Step 1: Add the state and the accessor**

In the `<script setup>` block, next to `const activeLabelIds = ref<Set<string>>(new Set());` (around line 67):

```ts
const activeQaStatuses = ref<Set<QaStatus>>(new Set());
```

Add these imports to the existing import block:

```ts
import type { QaStatus } from '@/types/database';
import { QA_STATUSES } from '@/utils/qaStatus';
import { filterByQaStatus, countByQaStatus } from '@/utils/qaStatusFilter';
import QaStatusPill from '@/components/QaStatusPill.vue';
```

Then the accessor, next to the existing `projectLabelKey` helper (around line 200). This is the only place that knows a dual project has no status:

```ts
// Dual projects have no qaStatus: the column is on `videos` only. Null here is
// what makes them fall out of a status filter and out of every count.
const statusOfProject = (p: Project): QaStatus | null =>
  p.projectType === 'single' ? p.video.qaStatus : null;
```

- [ ] **Step 2: Split the filter chain so the counts have something honest to count**

Replace the existing `filteredProjects` computed (lines 204-223) with two computeds. The first stops just short of the status filter; the second applies it:

```ts
// Everything except the status filter. The counts are computed against this,
// so selecting FAILED does not drop the other four statuses to zero and make
// the panel useless exactly when it is being used.
const projectsBeforeQaFilter = computed(() => {
  let list = dashFolders.filterByFolder(projects.value);
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        !!p.owner?.name.toLowerCase().includes(q)
    );
  }
  if (activeLabelIds.value.size > 0) {
    // OR semantics: keep videos that carry at least one selected label.
    list = list.filter((p) =>
      (labelIdsByProject.value[projectLabelKey(p)] ?? []).some((id) =>
        activeLabelIds.value.has(id)
      )
    );
  }
  return list;
});

const qaStatusCounts = computed(() =>
  countByQaStatus(projectsBeforeQaFilter.value, statusOfProject)
);

const filteredProjects = computed(() =>
  filterByQaStatus(
    projectsBeforeQaFilter.value,
    activeQaStatuses.value,
    statusOfProject
  )
);
```

Nothing downstream changes: `orderedProjects`, `totalPages` and `paginatedProjects` all still read `filteredProjects`.

- [ ] **Step 3: Add the toggle and widen Clear**

Next to `toggleLabelFilter` / `clearLabelFilter` (lines 242-251). Replace `clearLabelFilter` with `clearAllFilters`, since the card's Clear now owns both types:

```ts
function toggleQaStatusFilter(status: QaStatus) {
  const next = new Set(activeQaStatuses.value);
  if (next.has(status)) next.delete(status);
  else next.add(status);
  activeQaStatuses.value = next; // new Set so the watchers fire
}

function clearAllFilters() {
  activeLabelIds.value = new Set();
  activeQaStatuses.value = new Set();
}
```

Delete `clearLabelFilter` and update its one template usage to `clearAllFilters`.

- [ ] **Step 4: Add the filter to the page-reset watcher**

The watcher at lines 184-190 resets to page 1 and closes the details panel whenever the result set changes. Add the new ref to its source array:

```ts
watch(
  [scope, searchQuery, dashFolders.currentFolderId, activeLabelIds, activeQaStatuses],
  () => {
    currentPage.value = 1;
    closeDetails();
  }
);
```

Without this, filtering while on page 4 of a 2-page result shows an empty list with the pagination hidden.

- [ ] **Step 5: Update the filter button's active state and badge**

At lines 432-462, both currently key on `activeLabelIds.size`. Add a computed next to the others:

```ts
const activeFilterCount = computed(
  () => activeLabelIds.value.size + activeQaStatuses.value.size
);
```

In the template, change the button's `:class` condition from
`activeLabelIds.size > 0 || showLabelFilter` to
`activeFilterCount > 0 || showLabelFilter`, and the badge's `v-if` from
`activeLabelIds.size > 0` to `activeFilterCount > 0` with `{{ activeFilterCount }}` as its content.

- [ ] **Step 6: Restructure the dropdown card**

The card at lines 470-535 currently has one header ("Filter by label") and the label list. Change the header text to `Filter`, point its Clear button at `clearAllFilters`, and give it `v-if="activeFilterCount > 0"`. Then insert the QA section between that header and the label list:

```vue
                <div class="border-b border-gray-200 py-1 dark:border-white/10">
                  <div
                    class="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
                  >
                    QA status
                  </div>
                  <!-- All five always render, zeros included. The vocabulary is
                       fixed, so hiding empty ones would make the panel's
                       contents shift as data changes, and "nothing is in
                       staging" is itself an answer. -->
                  <button
                    v-for="status in QA_STATUSES"
                    :key="status"
                    type="button"
                    :data-testid="`qa-filter-${status}`"
                    class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                    @click="toggleQaStatusFilter(status)"
                  >
                    <QaStatusPill :status="status" />
                    <span class="flex-1 text-right font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400">
                      {{ qaStatusCounts[status] }}
                    </span>
                    <svg
                      v-if="activeQaStatuses.has(status)"
                      class="h-3.5 w-3.5 shrink-0 text-gray-900 dark:text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="m5 13 4 4L19 7"
                      />
                    </svg>
                  </button>
                </div>
```

Then wrap the existing label list in a matching section with a `Labels` eyebrow in the same style, so the two read as siblings.

The check mark markup is copied from the label row deliberately: same affordance, same size, same position. Do not factor the two into a shared component in this task; they are five lines and they may yet diverge.

- [ ] **Step 7: Verify**

Run: `npm test`
Expected: all pass. No new tests in this task; Task 1 covers the logic and Task 6 covers the composition.

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: 95 errors, matching the baseline, none in `DashboardView.vue`.

Run: `npx eslint src/views/DashboardView.vue`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "feat: filter the dashboard by QA status

A QA section in the existing filter dropdown, above the labels, with a
count per status. Counts are computed before the status filter is applied,
so selecting one status does not zero the other four."
```

---

### Task 3: Move the write path into a composable

**Spec:** `2026-08-22-qa-status-inline-edit-design.md`, section "Decomposition".

**Files:**
- Create: `src/composables/useQaStatusWrite.ts`
- Create: `src/composables/__tests__/useQaStatusWrite.test.ts`
- Modify: `src/components/QaStatusSelect.vue`
- Modify: `src/components/__tests__/qaStatusSelect.test.ts`

**Interfaces:**
- Consumes: `VideoService.setQaStatus`, `useNotifications`, `QaStatusTarget`, `toQaStatus`.
- Produces:

```ts
export function useQaStatusWrite(
  target: () => QaStatusTarget,
  onUpdated: (video: Video) => void
): {
  current: Ref<QaStatus>;
  updatedAt: Ref<string | undefined>;
  saving: Ref<boolean>;
  change: (next: QaStatus) => Promise<void>;
};
```

This is a refactor of reviewed, tested code. The behaviour must not change. `target` is a getter, not a value, so the composable can re-read the caller's prop after an await and compare ids: that comparison is the fix for the swap-write bug the final review caught, and it must move across intact rather than be re-derived from scratch.

- [ ] **Step 1: Write the failing test**

Create `src/composables/__tests__/useQaStatusWrite.test.ts`. These are the race tests, now aimed at the composable:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { QaStatusTarget } from '@/utils/qaStatus';
import type { Video } from '@/types/database';

const setQaStatus = vi.fn();
const addNotification = vi.fn();

vi.mock('@/services/videoService', () => ({ VideoService: { setQaStatus } }));
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ addNotification }),
}));

const load = async () =>
  (await import('@/composables/useQaStatusWrite')).useQaStatusWrite;

const video = (over: Partial<Video> = {}): Video =>
  ({ id: 'v1', qaStatus: 'staging', qaStatusUpdatedAt: '2026-08-22T00:00:00Z', ...over }) as Video;

beforeEach(() => vi.clearAllMocks());

describe('useQaStatusWrite', () => {
  it('applies and emits when the target has not changed', async () => {
    setQaStatus.mockResolvedValue(video());
    const useQaStatusWrite = await load();
    const target = ref<QaStatusTarget>({ id: 'v1', qaStatus: 'not_started' });
    const seen: Video[] = [];
    const w = useQaStatusWrite(() => target.value, (v) => seen.push(v));

    await w.change('staging');

    expect(w.current.value).toBe('staging');
    expect(seen).toHaveLength(1);
    expect(w.saving.value).toBe(false);
  });

  // The Critical finding from the feature's final review: a write resolving
  // after the caller swapped targets must not write one video onto another.
  it('applies nothing and emits nothing when the target changed mid-write', async () => {
    let resolve!: (v: Video) => void;
    setQaStatus.mockReturnValue(new Promise<Video>((r) => { resolve = r; }));
    const useQaStatusWrite = await load();
    const target = ref<QaStatusTarget>({ id: 'v1', qaStatus: 'not_started' });
    const seen: Video[] = [];
    const w = useQaStatusWrite(() => target.value, (v) => seen.push(v));

    const pending = w.change('staging');
    target.value = { id: 'v2', qaStatus: 'in_review' };
    resolve(video());
    await pending;

    expect(seen).toHaveLength(0);
    expect(w.saving.value).toBe(false);
  });

  it('rolls back and notifies when the write is refused', async () => {
    setQaStatus.mockRejectedValue(new Error('not visible to the caller'));
    const useQaStatusWrite = await load();
    const target = ref<QaStatusTarget>({ id: 'v1', qaStatus: 'in_review' });
    const w = useQaStatusWrite(() => target.value, () => {});

    await w.change('production');

    expect(w.current.value).toBe('in_review');
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  // The rollback is video-specific; the notification is not. Swallowing it
  // would recreate "a denied write looks like a success" on the error path.
  it('notifies but does not roll back when the target changed mid-failure', async () => {
    let reject!: (e: Error) => void;
    setQaStatus.mockReturnValue(new Promise<Video>((_, r) => { reject = r; }));
    const useQaStatusWrite = await load();
    const target = ref<QaStatusTarget>({ id: 'v1', qaStatus: 'in_review' });
    const w = useQaStatusWrite(() => target.value, () => {});

    const pending = w.change('production');
    target.value = { id: 'v2', qaStatus: 'failed' };
    reject(new Error('refused'));
    await pending;

    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    expect(w.current.value).not.toBe('in_review'); // v1's value was not restored onto v2
    expect(w.saving.value).toBe(false);
  });

  it('ignores a change to the value already shown', async () => {
    const useQaStatusWrite = await load();
    const target = ref<QaStatusTarget>({ id: 'v1', qaStatus: 'staging' });
    const w = useQaStatusWrite(() => target.value, () => {});

    await w.change('staging');

    expect(setQaStatus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/composables/__tests__/useQaStatusWrite.test.ts`
Expected: FAIL, cannot resolve `@/composables/useQaStatusWrite`.

- [ ] **Step 3: Write the composable**

Create `src/composables/useQaStatusWrite.ts` by moving the logic out of `QaStatusSelect.vue`'s `onChange`, its `current` / `updatedAt` / `saving` refs, and its prop watch. Preserve every comment explaining the race handling; they are the record of a bug that was expensive to find.

```ts
import { ref, watch, type Ref } from 'vue';
import type { QaStatus, Video } from '@/types/database';
import { type QaStatusTarget, toQaStatus } from '@/utils/qaStatus';
import { VideoService } from '@/services/videoService';
import { useNotifications } from '@/composables/useNotifications';

/**
 * The one write path for a video's QA status, shared by the details-panel
 * control and the dashboard list's inline control.
 *
 * Deliberately a composable and not duplicated markup logic: this is the code
 * that produced the single Critical finding in the feature's final review, and
 * a second copy inside a component that renders 171 times would be a second
 * copy of that bug.
 *
 * `target` is a getter rather than a value so the composable can re-read the
 * caller's prop AFTER an await. Comparing ids across the await is the whole
 * defence: a control can be swapped to a different video mid-write.
 */
export function useQaStatusWrite(
  target: () => QaStatusTarget,
  onUpdated: (video: Video) => void
): {
  current: Ref<QaStatus>;
  updatedAt: Ref<string | undefined>;
  saving: Ref<boolean>;
  change: (next: QaStatus) => Promise<void>;
} {
  const { addNotification } = useNotifications();

  const current = ref<QaStatus>(toQaStatus(target().qaStatus));
  const updatedAt = ref<string | undefined>(target().qaStatusUpdatedAt);
  const saving = ref(false);

  // Follows the prop's value, not just its identity: a parent that mutates the
  // same video object in place changes qaStatus without changing id, and a
  // watch keyed on id alone would leave the control silently stale. While a
  // write is in flight, `change` owns these refs end to end, so an incoming
  // mutation for the SAME video is either our own resolved write echoed back
  // or a stale value racing our optimistic one; acting on it would flicker or
  // revert mid-write. A genuine swap (id changes) always takes effect.
  watch(
    () => [target().id, target().qaStatus, target().qaStatusUpdatedAt] as const,
    ([nextId, nextStatus, nextUpdatedAt], previous) => {
      const [previousId] = previous ?? [];
      if (saving.value && nextId === previousId) return;
      current.value = toQaStatus(nextStatus);
      updatedAt.value = nextUpdatedAt;
    }
  );

  async function change(next: QaStatus): Promise<void> {
    const previous = current.value;
    if (next === previous) return;

    // Captured before the await: the caller's prop can be swapped out from
    // under this same instance while the write is in flight, and the write
    // must be judged against the video it started on.
    const targetId = target().id;

    // Optimistic: the value moves now, and moves back if the write is refused.
    current.value = next;
    saving.value = true;

    try {
      const updated = await VideoService.setQaStatus(targetId, next);
      // Applying a resolved row to a different video would show one video's
      // status on another, and emitting it would hand the parent a row for the
      // wrong video under the right one's name.
      if (target().id !== targetId) return;
      current.value = updated.qaStatus;
      updatedAt.value = updated.qaStatusUpdatedAt;
      onUpdated(updated);
    } catch (error) {
      // The rollback is video-specific and must stay guarded. The notification
      // is not: the user needs to know their save was refused even after
      // switching away, and swallowing it would move "a denied write looks
      // like a success" onto the error path.
      if (target().id === targetId) current.value = previous;
      addNotification({
        type: 'error',
        title: 'Could not save QA status',
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      // Unconditional, even after a swap: the write this flag tracked has
      // concluded either way, and the control is disabled while it is true.
      saving.value = false;
    }
  }

  return { current, updatedAt, saving, change };
}
```

- [ ] **Step 4: Rewrite `QaStatusSelect.vue` to delegate**

Its template is unchanged. In `<script setup>`, replace the refs, the watch and `onChange` with:

```ts
const { current, updatedAt, saving, change } = useQaStatusWrite(
  () => props.video,
  (updated) => emit('updated', updated)
);

function onChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value;
  // A guard rather than a cast: the DOM hands back a string, and the module
  // that owns the vocabulary is the one place that should turn it into a
  // QaStatus.
  if (!isQaStatus(raw)) return;
  void change(raw);
}
```

Remove the now-unused imports (`ref`, `watch`, `VideoService`, `useNotifications`, `toQaStatus`) and add `useQaStatusWrite`. Keep `computed` for `attribution`, and keep `isQaStatus`.

- [ ] **Step 5: Prune the duplicated tests from the select's suite**

`src/components/__tests__/qaStatusSelect.test.ts` currently owns the race tests that now live in the composable's suite. Delete from it only the tests whose behaviour moved: the target-swap test and the swap-during-failure test. Keep everything that is genuinely about the component: the five options in order, the value binding, the emit, the attribution line, the disabled-while-saving binding, and the rollback-and-notify path, which is still worth asserting through the real component.

Do not delete a test without its behaviour existing somewhere. If you are unsure whether a given test moved, keep it.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/composables/__tests__/useQaStatusWrite.test.ts src/components/__tests__/qaStatusSelect.test.ts`
Expected: PASS. 5 composable tests, and the select's remaining tests.

Run: `npm test`
Expected: all pass. The count will be lower than the 312 baseline by however many tests you moved, and higher by the 5 new ones. State the arithmetic in your report.

- [ ] **Step 7: Commit**

```bash
git add src/composables/useQaStatusWrite.ts src/composables/__tests__/useQaStatusWrite.test.ts src/components/QaStatusSelect.vue src/components/__tests__/qaStatusSelect.test.ts
git commit -m "refactor: move the QA status write path into a composable

The list is about to need the same write, and this is the code that
produced the swap-write bug. One copy, with the id-across-the-await guard
and the tests that prove it, rather than two."
```

---

### Task 4: The inline control

**Spec:** `2026-08-22-qa-status-inline-edit-design.md`, sections "The control" and "Affordance".

**Files:**
- Create: `src/components/QaStatusPillSelect.vue`
- Test: `src/components/__tests__/qaStatusPillSelect.test.ts`

**Interfaces:**
- Consumes: `useQaStatusWrite` from Task 3; `QA_STATUSES`, `qaStatusLabel`, `qaStatusPillClass`, `QaStatusTarget` from `@/utils/qaStatus`.
- Produces: `<QaStatusPillSelect :video="QaStatusTarget" @updated="(v: Video) => void" />`, with `data-testid="qa-status-pill-select"` on the select.

At rest this must be pixel-identical to `QaStatusPill`. Same `w-24`, same radius, same border, same five weights. Only hover and focus differ.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/qaStatusPillSelect.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { Video } from '@/types/database';

const setQaStatus = vi.fn();
const addNotification = vi.fn();
vi.mock('@/services/videoService', () => ({ VideoService: { setQaStatus } }));
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ addNotification }),
}));

async function mount(status = 'not_started') {
  const { default: C } = await import('@/components/QaStatusPillSelect.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const rowClicks: string[] = [];
  const app = createApp(
    defineComponent({
      setup: () => () =>
        // A stand-in for ProjectListItem's clickable, draggable row.
        h('div', { onClick: () => rowClicks.push('row') }, [
          h(C, { video: { id: 'v1', qaStatus: status } }),
        ]),
    })
  );
  app.mount(root);
  const sel = () => root.querySelector<HTMLSelectElement>('[data-testid="qa-status-pill-select"]')!;
  return {
    sel, rowClicks,
    choose: async (v: string) => {
      sel().value = v;
      sel().dispatchEvent(new Event('change', { bubbles: true }));
      await nextTick(); await Promise.resolve(); await nextTick();
    },
    unmount: () => { app.unmount(); root.remove(); },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('QaStatusPillSelect', () => {
  it('offers the five values in workflow order', async () => {
    const m = await mount();
    expect([...m.sel().options].map((o) => o.value)).toEqual([
      'not_started', 'in_review', 'failed', 'staging', 'production',
    ]);
    m.unmount();
  });

  // At rest it must be indistinguishable from the read-only pill, or the
  // column stops scanning as one thing.
  it('wears the pill geometry', async () => {
    const m = await mount();
    const c = m.sel().className;
    expect(c).toContain('w-24');
    expect(c).toContain('rounded-full');
    expect(c).toContain('appearance-none');
    expect(c).toContain('text-center');
    m.unmount();
  });

  it('carries the status weight, accent on failed only', async () => {
    const failed = await mount('failed');
    expect(failed.sel().className).toContain('text-red-600');
    failed.unmount();
    const staging = await mount('staging');
    expect(staging.sel().className).not.toContain('red');
    staging.unmount();
  });

  // Without stopPropagation every status change also opens the details panel.
  it('does not trigger the row click', async () => {
    const m = await mount();
    m.sel().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(m.rowClicks).toHaveLength(0);
    m.unmount();
  });

  // A mousedown on a child of a draggable row starts a drag instead of
  // opening the menu, which makes the control unusable by mouse.
  it('is not draggable', async () => {
    const m = await mount();
    expect(m.sel().getAttribute('draggable')).toBe('false');
    m.unmount();
  });

  it('writes the chosen status and emits the updated video', async () => {
    setQaStatus.mockResolvedValue({ id: 'v1', qaStatus: 'failed' } as Video);
    const m = await mount();
    await m.choose('failed');
    expect(setQaStatus).toHaveBeenCalledWith('v1', 'failed');
    m.unmount();
  });

  it('disables itself while the write is in flight', async () => {
    let resolve!: (v: Video) => void;
    setQaStatus.mockReturnValue(new Promise<Video>((r) => { resolve = r; }));
    const m = await mount();
    m.sel().value = 'failed';
    m.sel().dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(m.sel().disabled).toBe(true);
    resolve({ id: 'v1', qaStatus: 'failed' } as Video);
    await nextTick(); await Promise.resolve(); await nextTick();
    expect(m.sel().disabled).toBe(false);
    m.unmount();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/components/__tests__/qaStatusPillSelect.test.ts`
Expected: FAIL, cannot resolve `@/components/QaStatusPillSelect.vue`.

- [ ] **Step 3: Write the component**

Create `src/components/QaStatusPillSelect.vue`:

```vue
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
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/__tests__/qaStatusPillSelect.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/QaStatusPillSelect.vue src/components/__tests__/qaStatusPillSelect.test.ts
git commit -m "feat: add the inline QA status control

A native select wearing the pill's shape: identical at rest, a neutral
hover ring as the only affordance. Stops click and mousedown so the row
around it neither opens nor drags."
```

---

### Task 5: Put the control in the row and wire the write-back

**Spec:** `2026-08-22-qa-status-inline-edit-design.md`, sections "Row interaction" and "Write-back".

**Files:**
- Modify: `src/components/ProjectListItem.vue` (the pill at the row's right edge, and the emits block)
- Modify: `src/views/DashboardView.vue` (the `ProjectListItem` usage around line 557)
- Modify: `src/components/__tests__/projectListItem.test.ts`

**Interfaces:**
- Consumes: `QaStatusPillSelect` from Task 4; the existing `mergeQaStatusUpdate` from `@/utils/qaStatus`.
- Produces: `ProjectListItem` emits `qa-status-updated: [project: Project, updated: Video]`.

- [ ] **Step 1: Swap the pill for the control**

In `ProjectListItem.vue`, replace the `<QaStatusPill>` element with:

```vue
    <QaStatusPillSelect
      v-if="project.projectType === 'single'"
      :video="project.video"
      @updated="(updated) => emit('qa-status-updated', project, updated)"
    />
```

Keep the explanatory comment above it and keep the `v-else` spacer exactly as it is: a dual project still reserves the 96px slot, or the watch-coverage chip jumps on those rows.

Swap the import from `QaStatusPill` to `QaStatusPillSelect`, and add to the `defineEmits` block:

```ts
  'qa-status-updated': [project: Project, updated: Video];
```

Add `import type { Video } from '../types/database';` if the file does not already have it.

- [ ] **Step 2: Handle it in DashboardView**

On the `<ProjectListItem>` usage:

```vue
              @qa-status-updated="onProjectQaStatusUpdated"
```

And in the script:

```ts
// The list row and the details panel reference the same project object -
// DashboardView's `projects` array is not cloned on the way to either - so one
// merge updates both surfaces. mergeQaStatusUpdate is id-guarded and merges
// only the QA fields, never the whole returned row.
function onProjectQaStatusUpdated(project: Project, updated: Video) {
  if (project.projectType !== 'single') return;
  const merged = mergeQaStatusUpdate(project.video, updated);
  if (merged) Object.assign(project.video, merged);
}
```

Add `mergeQaStatusUpdate` to the existing `@/utils/qaStatus` import and `Video` to the type imports.

- [ ] **Step 3: Extend the row's tests**

Add to `src/components/__tests__/projectListItem.test.ts`:

```ts
  it('renders the editable control for a single project', () => {
    const m = mountRow(singleProject());
    expect(m.root.querySelector('[data-testid="qa-status-pill-select"]')).not.toBeNull();
    m.unmount();
  });

  // Still reserved, or the watch chip jumps ~108px on comparison rows.
  it('reserves the slot and renders no control for a dual project', () => {
    const m = mountRow(dualProject());
    expect(m.root.querySelector('[data-testid="qa-status-pill-select"]')).toBeNull();
    const spacer = m.root.querySelector<HTMLElement>('[data-testid="qa-status-pill-placeholder"]');
    expect(spacer?.className).toContain('w-24');
    m.unmount();
  });
```

Use whatever `mountRow` / `singleProject` / `dualProject` helpers that file already defines; do not invent new ones. If the existing helpers do not cover the dual case, extend them rather than duplicating the mount.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/__tests__/projectListItem.test.ts`
Expected: PASS.

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProjectListItem.vue src/views/DashboardView.vue src/components/__tests__/projectListItem.test.ts
git commit -m "feat: change a video's QA status from the dashboard row

The row emits and DashboardView merges, so the write-back happens at the
owner of the data rather than by a row mutating its own prop."
```

---

### Task 6: The filter-hid-it toast

**Spec:** `2026-08-22-qa-status-inline-edit-design.md`, section "Changing a status while a filter is active".

**Files:**
- Modify: `src/views/DashboardView.vue` (`onProjectQaStatusUpdated` from Task 5)
- Test: `src/utils/__tests__/qaStatusFilter.test.ts` (extend with the predicate)
- Modify: `src/utils/qaStatusFilter.ts`

**Interfaces:**
- Consumes: `filterByQaStatus` from Task 1, `useNotifications`'s `success(title, message?)`.
- Produces: `qaStatusHiddenByFilter(next: QaStatus, active: ReadonlySet<QaStatus>): boolean`.

Changing a status can drop a row out of a filtered list. That is correct, and consistent with every other filter here, but abrupt when the user caused it. One success toast in that case only; every other successful write stays silent, because a toast on every change is noise in a list built for working down quickly.

- [ ] **Step 1: Write the failing test**

Add to `src/utils/__tests__/qaStatusFilter.test.ts`:

```ts
import { qaStatusHiddenByFilter } from '@/utils/qaStatusFilter';

describe('qaStatusHiddenByFilter', () => {
  it('is false when no filter is active', () => {
    expect(qaStatusHiddenByFilter('failed', new Set())).toBe(false);
  });

  it('is false when the new status is one of the selected ones', () => {
    expect(qaStatusHiddenByFilter('failed', new Set<QaStatus>(['failed', 'staging']))).toBe(false);
  });

  it('is true when the new status is excluded by the active filter', () => {
    expect(qaStatusHiddenByFilter('production', new Set<QaStatus>(['failed']))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/utils/__tests__/qaStatusFilter.test.ts`
Expected: FAIL, `qaStatusHiddenByFilter is not a function`.

- [ ] **Step 3: Add the predicate**

Append to `src/utils/qaStatusFilter.ts`:

```ts
/**
 * Whether setting a video to `next` would drop it out of the currently
 * filtered list. The one case where a successful write deserves a toast: the
 * row vanishes, and the user is owed an explanation for a disappearance they
 * caused.
 */
export function qaStatusHiddenByFilter(
  next: QaStatus,
  active: ReadonlySet<QaStatus>
): boolean {
  return active.size > 0 && !active.has(next);
}
```

- [ ] **Step 4: Fire the toast**

Extend `onProjectQaStatusUpdated` in `DashboardView.vue`:

```ts
function onProjectQaStatusUpdated(project: Project, updated: Video) {
  if (project.projectType !== 'single') return;
  const merged = mergeQaStatusUpdate(project.video, updated);
  if (merged) Object.assign(project.video, merged);

  // Silent on success everywhere except here: the row is about to disappear
  // from a list the user is looking at, because of something they just did.
  if (qaStatusHiddenByFilter(updated.qaStatus, activeQaStatuses.value)) {
    notifySuccess(
      `Marked ${qaStatusLabel(updated.qaStatus)}`,
      'Hidden by the current filter.'
    );
  }
}
```

`DashboardView` already destructures `const { error: notifyError } = useNotifications();`. Extend it to `const { error: notifyError, success: notifySuccess } = useNotifications();`, and add `qaStatusLabel` and `qaStatusHiddenByFilter` to the existing imports.

- [ ] **Step 5: Run everything**

Run: `npx vitest run src/utils/__tests__/qaStatusFilter.test.ts`
Expected: PASS, 13 tests.

Run: `npm test`
Expected: all pass.

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: 95 errors, matching the baseline.

Run: `npx eslint src/views/DashboardView.vue src/components/ProjectListItem.vue src/components/QaStatusPillSelect.vue src/components/QaStatusSelect.vue src/composables/useQaStatusWrite.ts src/utils/qaStatusFilter.ts`
Expected: no new errors.

**On what is NOT unit-tested here.** The inline-edit spec asks for a
`DashboardView` assertion that an excluded change toasts and an included one
does not. That needs the 708-line view mounted with folders, watch coverage,
labels and Supabase all stubbed, to assert one `if`. The predicate above is
tested purely and the wiring is three lines directly under it, so the toast is
covered by the predicate plus the visual pass rather than by a mount. Say so in
your report rather than quietly skipping it, and if you find a cheap honest way
to assert it, take it.

- [ ] **Step 6: Commit**

```bash
git add src/utils/qaStatusFilter.ts src/utils/__tests__/qaStatusFilter.test.ts src/views/DashboardView.vue
git commit -m "feat: explain a row that a filter hides after a status change

One success toast, only when the new status is excluded by the active
filter. Every other successful write stays silent."
```

---

## Done when

- All six tasks committed, `npm test` green, `vue-tsc` at the 95-error baseline, eslint clean on touched files.
- The visual pass below has been run by the controller, not a subagent.

## Visual verification (controller, not a subagent)

Subagents have no browser. Run these against the dev server per the `verify` skill, in both light and dark:

- The pill column still aligns: every control's left and right edges share an x down the list, and a dual row still leaves its slot empty.
- At rest the controls are indistinguishable from the old read-only pills. On hover, the ring appears and the cursor changes. On keyboard focus, the ring is clearly visible in both themes.
- Opening a control does not open the details panel, and dragging a row still works when the drag starts anywhere but the control.
- The filter panel shows all five statuses with counts, the counts do not collapse when a status is selected, and the FILTER badge counts both filter types.
- With a filter active, changing a row's status makes it disappear and fires exactly one toast.
- The select's closed-state text is centred. `text-align: center` on a `<select>` is the one style here that browsers disagree about; if it is off in Chrome, say so rather than working around it silently.

This drives live production data. Restore any status you change, and say in the report what was written.

## Deliberately not built

Sorting or grouping by status, bulk edit, filtering outside the dashboard, persisting the filter across reloads, attribution in the list row, and any QA status for comparison projects. All named in the two specs' out-of-scope lists. If a task seems to need one, the task is wrong.
