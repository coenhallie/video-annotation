# Per-User "Recently Opened" Dashboard Ordering - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Order the dashboard project list by when the signed-in user last opened each project, most recent first, with never-opened projects keeping today's created-date order below them.

**Architecture:** A new `project_opens` table stores one RLS-scoped row per (user, project). The editor records an open through a single watcher on the video store's `currentVideoId` / `currentComparisonId`, which every load path already converges on. The dashboard reads the user's opens in one query and applies a pure sort function between filtering and pagination. Nothing in `ProjectService` changes: created-date order stays the base ordering, recency is a per-user view concern layered on top.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Pinia, Supabase (PostgREST + RLS), Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-21-recently-opened-ordering-design.md`

## Global Constraints

- **No em dashes in anything you write**: code comments, commit messages, docs. Use a plain hyphen `-` instead. (Existing file content you are not rewriting is exempt.)
- **No agent attribution in commits.** No `Co-Authored-By` trailer, no "Generated with" footer.
- **Column names are camelCase and must be quoted in SQL** (`"userId"`, `"videoId"`, `"openedAt"`). This is the existing schema convention - see `migrations/20260704_watch_progress.sql`.
- **Services never throw.** Every Supabase call is wrapped in try/catch, logs with `console.warn`, and returns a safe fallback. This feature is informational ordering; a failed write must never interrupt viewing a video. Pattern to copy: `src/services/watchProgressService.ts`.
- **Test command:** `npm run test` (vitest, `src/**/*.test.ts`). Single file: `npx vitest run <path>`.
- **Verification baselines as of 2026-08-21** (measure against these, do not expect zero):
  - `npm run test` - 25 files, 232 tests, all passing. Measured with the in-progress thumbnail work still in the tree; if that gets stashed, the baseline drops by one file and its tests. Re-measure before you start rather than trusting these numbers blindly.
  - `npx eslint src` - 0 errors, 99 warnings.
  - `npx vue-tsc --noEmit -p tsconfig.json` - 95 pre-existing errors. Your changes must not add any error whose path is a file you created or modified.
- **Working tree precondition:** the tree currently holds unrelated in-progress thumbnail work (`src/services/videoService.ts`, `src/utils/thumbnailGenerator.ts`, `src/types/database.ts`, `migrations/20260820_set_video_thumbnail.sql`, and two test files). Task 3 also edits `src/types/database.ts`. Commit or stash that work before starting, and confirm with the user which branch this feature belongs on - the current branch is `feat/aws-proxy-auth`, which is unrelated.

## File Structure

| File | Responsibility |
|---|---|
| `migrations/20260821_project_opens.sql` (create) | Table, constraints, index, RLS policies |
| `src/types/database.ts` (modify) | `DatabaseProjectOpen` row type + `project_opens` entry in `Database['public']['Tables']` |
| `src/utils/relativeTime.ts` (create) | `formatRelativeTime` - terse uppercase token for the meta line |
| `src/utils/projectOrdering.ts` (create) | `sortByRecentOpens` - pure comparator over an already-filtered list |
| `src/services/recentOpensService.ts` (create) | `recordOpen` / `getRecentOpens` - the only place that talks to `project_opens` |
| `src/composables/useRecordProjectOpen.ts` (create) | The single write trigger, mounted in the editor |
| `src/views/EditorView.vue` (modify) | Instantiate the composable |
| `src/views/DashboardView.vue` (modify) | Load opens, apply the sort before pagination, pass the prop |
| `src/components/ProjectListItem.vue` (modify) | Render the `OPENED …` meta token |

Tasks 1, 2 and 3 are independent of each other. Task 4 depends on 3. Tasks 5, 6, 7 depend on 4.

---

### Task 1: `formatRelativeTime` util

**Files:**
- Create: `src/utils/relativeTime.ts`
- Test: `src/utils/__tests__/relativeTime.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `formatRelativeTime(iso: string, now?: Date): string`, returning `'JUST NOW' | '5M AGO' | '2H AGO' | 'YESTERDAY' | '3 DAYS AGO' | <locale date>`, and `''` for an unparseable input.

**Why a new util instead of `ProjectListItem.formatDate`:** the component's existing `formatDate` resolves only to Today / Yesterday / N days ago, which is too coarse for an "opened" timestamp - a video opened five minutes ago and one opened this morning would both read "Today". `formatDate` and its wording stay untouched.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/relativeTime.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '@/utils/relativeTime';

const NOW = new Date('2026-08-21T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('reads anything under a minute as JUST NOW', () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe('JUST NOW');
    expect(formatRelativeTime(ago(59 * SECOND), NOW)).toBe('JUST NOW');
  });

  it('counts whole minutes up to the hour boundary', () => {
    expect(formatRelativeTime(ago(MINUTE), NOW)).toBe('1M AGO');
    expect(formatRelativeTime(ago(5 * MINUTE), NOW)).toBe('5M AGO');
    expect(formatRelativeTime(ago(59 * MINUTE), NOW)).toBe('59M AGO');
  });

  it('counts whole hours up to the day boundary', () => {
    expect(formatRelativeTime(ago(HOUR), NOW)).toBe('1H AGO');
    expect(formatRelativeTime(ago(23 * HOUR), NOW)).toBe('23H AGO');
  });

  it('names the first day boundary rather than counting it', () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe('YESTERDAY');
    expect(formatRelativeTime(ago(2 * DAY), NOW)).toBe('2 DAYS AGO');
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe('6 DAYS AGO');
  });

  it('falls back to a plain date once the relative form stops helping', () => {
    const iso = ago(7 * DAY);
    expect(formatRelativeTime(iso, NOW)).toBe(new Date(iso).toLocaleDateString());
  });

  it('treats a future timestamp as JUST NOW rather than a negative age', () => {
    const future = new Date(NOW.getTime() + 5 * MINUTE).toISOString();
    expect(formatRelativeTime(future, NOW)).toBe('JUST NOW');
  });

  it('returns an empty string for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/utils/__tests__/relativeTime.test.ts`
Expected: FAIL - `Failed to resolve import "@/utils/relativeTime"`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/relativeTime.ts`:

```ts
/**
 * Terse relative time for the dashboard's mono meta line. That line is a row
 * of uppercase tokens ("2:14  60FPS  TODAY  3A"), so this returns a token,
 * not a sentence.
 *
 * `now` is injectable so tests do not depend on the wall clock.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const elapsed = now.getTime() - then.getTime();
  // Unparseable input yields NaN. Callers render nothing rather than a token
  // reading "OPENED Invalid Date".
  if (!Number.isFinite(elapsed)) return '';

  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  // Clock skew can put a timestamp slightly in the future; that reads as
  // "just now", never as a negative age.
  if (elapsed < MINUTE) return 'JUST NOW';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}M AGO`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}H AGO`;

  const days = Math.floor(elapsed / DAY);
  if (days === 1) return 'YESTERDAY';
  if (days < 7) return `${days} DAYS AGO`;
  return then.toLocaleDateString();
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/utils/__tests__/relativeTime.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/relativeTime.ts src/utils/__tests__/relativeTime.test.ts
git commit -m "feat: add formatRelativeTime for terse opened-at tokens"
```

---

### Task 2: `sortByRecentOpens` util

**Files:**
- Create: `src/utils/projectOrdering.ts`
- Test: `src/utils/__tests__/projectOrdering.test.ts`

**Interfaces:**
- Consumes: the `Project` type from `src/types/project.ts`.
- Produces: `sortByRecentOpens(projects: Project[], openedAt: Record<string, string>): Project[]` - a new array; the input is not mutated.

**Contract:** projects with an entry in `openedAt` come first, most recent first. Projects without one follow, in the order they arrived (which is created-date descending, owned by `ProjectService.mapToProjects`). The map is keyed by **project id**, which is well-defined: `mapToProjects` sets `id: video.id` for singles and `id: comparisonVideo.id` for duals.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/projectOrdering.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sortByRecentOpens } from '@/utils/projectOrdering';
import type { Project } from '@/types/project';

// Only id and createdAt matter to the comparator; the cast keeps the fixture
// readable instead of building a full Video record per project.
const project = (id: string, createdAt: string): Project =>
  ({
    id,
    projectType: 'single',
    title: id,
    createdAt,
    video: { id, duration: 10 },
  }) as unknown as Project;

// Arrives created-date descending, the way mapToProjects hands it over.
const NEWEST = project('newest', '2026-08-20T00:00:00Z');
const MIDDLE = project('middle', '2026-08-10T00:00:00Z');
const OLDEST = project('oldest', '2026-08-01T00:00:00Z');
const INCOMING = [NEWEST, MIDDLE, OLDEST];

const ids = (list: Project[]) => list.map((p) => p.id);

describe('sortByRecentOpens', () => {
  it('is the identity ordering when nothing has been opened', () => {
    expect(ids(sortByRecentOpens(INCOMING, {}))).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);
  });

  it('floats an opened project above newer never-opened ones', () => {
    const result = sortByRecentOpens(INCOMING, {
      oldest: '2026-08-21T09:00:00Z',
    });
    expect(ids(result)).toEqual(['oldest', 'newest', 'middle']);
  });

  it('orders opened projects most recent first', () => {
    const result = sortByRecentOpens(INCOMING, {
      oldest: '2026-08-21T09:00:00Z',
      newest: '2026-08-21T11:00:00Z',
    });
    expect(ids(result)).toEqual(['newest', 'oldest', 'middle']);
  });

  it('keeps never-opened projects in created-date order below the opened ones', () => {
    const result = sortByRecentOpens(INCOMING, {
      middle: '2026-08-21T09:00:00Z',
    });
    expect(ids(result)).toEqual(['middle', 'newest', 'oldest']);
  });

  it('ignores entries for projects that are not in the list', () => {
    const result = sortByRecentOpens(INCOMING, {
      'filtered-out': '2026-08-21T11:00:00Z',
    });
    expect(ids(result)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('does not mutate the input array', () => {
    const input = [...INCOMING];
    sortByRecentOpens(input, { oldest: '2026-08-21T09:00:00Z' });
    expect(ids(input)).toEqual(['newest', 'middle', 'oldest']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/utils/__tests__/projectOrdering.test.ts`
Expected: FAIL - `Failed to resolve import "@/utils/projectOrdering"`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/projectOrdering.ts`:

```ts
import type { Project } from '@/types/project';

/**
 * Order an already-filtered project list by when THIS user last opened each
 * project. Opened projects come first, most recent first; everything else
 * keeps the order it arrived in, which is created-date descending and stays
 * owned by ProjectService.mapToProjects.
 *
 * `openedAt` is keyed by project id: video id for single projects, comparison
 * id for dual ones, matching how mapToProjects assigns Project.id.
 */
export function sortByRecentOpens(
  projects: Project[],
  openedAt: Record<string, string>
): Project[] {
  return [...projects].sort((a, b) => {
    const aOpened = openedAt[a.id];
    const bOpened = openedAt[b.id];
    // Three explicit branches, not a subtraction of two lookups: subtracting
    // an undefined timestamp yields NaN, and a comparator returning NaN gives
    // arbitrary order instead of the stable order the never-opened tail
    // depends on.
    if (!aOpened && !bOpened) return 0;
    if (!aOpened) return 1;
    if (!bOpened) return -1;
    // Both opened. String comparison would work for well-formed UTC ISO-8601,
    // but these come back from PostgREST and may carry an offset, so compare
    // instants.
    return new Date(bOpened).getTime() - new Date(aOpened).getTime();
  });
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/utils/__tests__/projectOrdering.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/projectOrdering.ts src/utils/__tests__/projectOrdering.test.ts
git commit -m "feat: add per-user recent-opens project ordering"
```

---

### Task 3: `project_opens` table and its row type

**Files:**
- Create: `migrations/20260821_project_opens.sql`
- Modify: `src/types/database.ts` (add `DatabaseProjectOpen` near the other `Database*` interfaces, and a `project_opens` entry inside `Database['public']['Tables']`, which starts at line 296)

**Interfaces:**
- Produces: table `public.project_opens` with columns `id`, `"userId"`, `"videoId"`, `"comparisonVideoId"`, `"openedAt"`; unique constraints named `project_opens_user_video_key` and `project_opens_user_comparison_key`; TypeScript row type `DatabaseProjectOpen`.

- [ ] **Step 1: Write the migration**

Create `migrations/20260821_project_opens.sql`:

```sql
-- migrations/20260821_project_opens.sql
-- Per-user "last opened" record, one row per (user, project). Drives the
-- dashboard's recency ordering: what YOU opened floats to the top of YOUR
-- list, and nobody else's opens move anything for you.
--
-- Shaped like `annotations` (nullable "videoId" + nullable "comparisonVideoId"),
-- which is this schema's existing way to point a row at either project type.
-- `video_watch_progress` could not be reused: its "videoId" is NOT NULL and
-- REFERENCES videos, so it structurally cannot record an opened comparison.

CREATE TABLE IF NOT EXISTS public.project_opens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" uuid NOT NULL,
    "videoId" uuid REFERENCES public.videos (id) ON DELETE CASCADE,
    "comparisonVideoId" uuid REFERENCES public.comparison_videos (id) ON DELETE CASCADE,
    "openedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_opens_one_target
        CHECK (num_nonnulls("videoId", "comparisonVideoId") = 1),
    -- Plain unique constraints, deliberately NOT partial unique indexes.
    -- Postgres treats NULLs as distinct, so dual rows ("videoId" NULL) never
    -- collide on the first constraint and single rows never collide on the
    -- second. A partial index would look tidier and would break the write:
    -- ON CONFLICT cannot infer a partial index unless the statement repeats
    -- the predicate, which PostgREST does not emit.
    CONSTRAINT project_opens_user_video_key UNIQUE ("userId", "videoId"),
    CONSTRAINT project_opens_user_comparison_key UNIQUE ("userId", "comparisonVideoId")
);

CREATE INDEX IF NOT EXISTS idx_project_opens_user_recent
    ON public.project_opens ("userId", "openedAt" DESC);

-- RLS from the start. This is per-user visibility data by definition, so it
-- does not inherit the "no RLS, pending RLS phase" note on
-- migrations/20260704_watch_progress.sql.
ALTER TABLE public.project_opens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own opens" ON public.project_opens;
CREATE POLICY "Users can read their own opens" ON public.project_opens
    FOR SELECT TO authenticated
    USING (auth.uid() = "userId");

DROP POLICY IF EXISTS "Users can record their own opens" ON public.project_opens;
CREATE POLICY "Users can record their own opens" ON public.project_opens
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = "userId");

-- UPDATE is required as well as INSERT: the write is an upsert, so the second
-- open of the same project updates the existing row.
DROP POLICY IF EXISTS "Users can update their own opens" ON public.project_opens;
CREATE POLICY "Users can update their own opens" ON public.project_opens
    FOR UPDATE TO authenticated
    USING (auth.uid() = "userId")
    WITH CHECK (auth.uid() = "userId");
```

- [ ] **Step 2: Add the row type**

In `src/types/database.ts`, add this interface alongside the other `Database*` interfaces (they run from line 44 to roughly line 165):

```ts
export interface DatabaseProjectOpen {
  id: string;
  userId: string;
  videoId: string | null;
  comparisonVideoId: string | null;
  openedAt: string;
}
```

And add this entry inside `Database['public']['Tables']` (the object opening at line 298), following the existing `videos` / `annotations` entries:

```ts
      project_opens: {
        Row: DatabaseProjectOpen;
        Insert: Omit<DatabaseProjectOpen, 'id'>;
        Update: Partial<Omit<DatabaseProjectOpen, 'id'>>;
      };
```

`Insert` omits only `id`: `openedAt` is deliberately sent by the client on every write (see Task 4), so it is not optional here.

- [ ] **Step 3: Verify the type edit compiles no worse than the baseline**

Measure the delta, do not assert an absolute number: the 95 in Global Constraints was
measured with the thumbnail work still modifying this very file, so stashing that work moves
the baseline.

Before the edit (or from `git stash` / `git show HEAD:` if you have already made it):

```bash
npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"   # record this number
```

After the edit:

```bash
npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"   # must equal the number above
npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "src/types/database.ts"   # must print nothing
```

Expected: identical count, and no error naming `src/types/database.ts`.

- [ ] **Step 4: Apply the migration and round-trip it**

This is the one verification that proves the schema claims, and it must happen before later tasks harden around them. Ask the user how they apply migrations if it is not obvious - per project notes, access is via the Supabase Management API with a PAT, and deploys are manual.

Apply `migrations/20260821_project_opens.sql`, then, signed in as a real user, run these two statements twice each (substituting real ids):

```sql
INSERT INTO public.project_opens ("userId", "videoId", "openedAt")
VALUES ('<user-uuid>', '<video-uuid>', now())
ON CONFLICT ("userId", "videoId") DO UPDATE SET "openedAt" = EXCLUDED."openedAt";

INSERT INTO public.project_opens ("userId", "comparisonVideoId", "openedAt")
VALUES ('<user-uuid>', '<comparison-uuid>', now())
ON CONFLICT ("userId", "comparisonVideoId") DO UPDATE SET "openedAt" = EXCLUDED."openedAt";

SELECT "videoId", "comparisonVideoId", "openedAt" FROM public.project_opens
WHERE "userId" = '<user-uuid>';
```

Expected: exactly two rows, both `openedAt` values advanced by the second run, no CHECK violation, no duplicate-key error. That single exercise confirms both `ON CONFLICT` targets infer against the plain unique constraints, that the CHECK accepts either row shape, and that the timestamp actually moves on re-open.

If the database is unreachable, say so explicitly rather than marking this step done, and carry it as an open item into the final verification.

- [ ] **Step 5: Commit**

```bash
git add migrations/20260821_project_opens.sql src/types/database.ts
git commit -m "feat: add project_opens table for per-user recency ordering"
```

---

### Task 4: `recentOpensService`

**Files:**
- Create: `src/services/recentOpensService.ts`
- Test: `src/services/__tests__/recentOpensService.test.ts`

**Interfaces:**
- Consumes: `supabase` from `@/composables/useSupabase`; the `project_opens` table from Task 3.
- Produces:
  - `type OpenTarget = { videoId: string } | { comparisonVideoId: string }`
  - `recordOpen(userId: string, target: OpenTarget): Promise<boolean>`
  - `getRecentOpens(userId: string): Promise<Record<string, string>>` - project id → ISO `openedAt`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/recentOpensService.test.ts`. The supabase chain mock follows the pattern in `src/services/__tests__/watchProgressService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
let rejectWith: unknown = null;

const settle = () =>
  rejectWith ? Promise.reject(rejectWith) : Promise.resolve(queryResult);

const chain: Record<string, any> = {};
for (const m of ['select', 'eq', 'order', 'limit', 'upsert']) {
  chain[m] = vi.fn(() => chain);
}
chain.then = (onFulfilled: any, onRejected: any) =>
  settle().then(onFulfilled, onRejected);

const fromMock = vi.fn(() => chain);

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

beforeEach(() => {
  fromMock.mockClear();
  for (const m of ['select', 'eq', 'order', 'limit', 'upsert']) {
    chain[m].mockClear();
  }
  queryResult = { data: null, error: null };
  rejectWith = null;
  // error-path tests exercise the service's console.warn-and-swallow contract;
  // keep the test output pristine
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('recordOpen', () => {
  it('upserts a single-video open on (userId,videoId)', async () => {
    const { recordOpen } = await import('@/services/recentOpensService');
    expect(await recordOpen('u1', { videoId: 'v1' })).toBe(true);

    expect(fromMock).toHaveBeenCalledWith('project_opens');
    const [row, options] = chain.upsert.mock.calls[0];
    expect(row).toMatchObject({
      userId: 'u1',
      videoId: 'v1',
      comparisonVideoId: null,
    });
    expect(options).toEqual({ onConflict: 'userId,videoId' });
  });

  it('upserts a comparison open on (userId,comparisonVideoId)', async () => {
    const { recordOpen } = await import('@/services/recentOpensService');
    expect(await recordOpen('u1', { comparisonVideoId: 'c1' })).toBe(true);

    const [row, options] = chain.upsert.mock.calls[0];
    expect(row).toMatchObject({
      userId: 'u1',
      videoId: null,
      comparisonVideoId: 'c1',
    });
    expect(options).toEqual({ onConflict: 'userId,comparisonVideoId' });
  });

  it('sends openedAt explicitly so re-opens actually move the timestamp', async () => {
    const { recordOpen } = await import('@/services/recentOpensService');
    const before = Date.now();
    await recordOpen('u1', { videoId: 'v1' });
    const [row] = chain.upsert.mock.calls[0];
    // DEFAULT now() fires on INSERT only, and PostgREST builds DO UPDATE SET
    // from the columns actually sent - omitting this would freeze every row at
    // its first-open time.
    expect(typeof row.openedAt).toBe('string');
    expect(Date.parse(row.openedAt)).toBeGreaterThanOrEqual(before);
  });

  it('returns false on error without throwing', async () => {
    const { recordOpen } = await import('@/services/recentOpensService');
    queryResult = { data: null, error: { message: 'boom' } };
    expect(await recordOpen('u1', { videoId: 'v1' })).toBe(false);
  });

  it('returns false on a rejected promise without throwing', async () => {
    const { recordOpen } = await import('@/services/recentOpensService');
    rejectWith = new Error('network drop');
    await expect(recordOpen('u1', { videoId: 'v1' })).resolves.toBe(false);
  });
});

describe('getRecentOpens', () => {
  it('keys both row shapes by project id', async () => {
    const { getRecentOpens } = await import('@/services/recentOpensService');
    queryResult = {
      data: [
        { videoId: 'v1', comparisonVideoId: null, openedAt: '2026-08-21T11:00:00Z' },
        { videoId: null, comparisonVideoId: 'c1', openedAt: '2026-08-21T09:00:00Z' },
      ],
      error: null,
    };
    expect(await getRecentOpens('u1')).toEqual({
      v1: '2026-08-21T11:00:00Z',
      c1: '2026-08-21T09:00:00Z',
    });
    expect(fromMock).toHaveBeenCalledWith('project_opens');
    expect(chain.eq).toHaveBeenCalledWith('userId', 'u1');
    expect(chain.order).toHaveBeenCalledWith('openedAt', { ascending: false });
  });

  it('returns {} on error', async () => {
    const { getRecentOpens } = await import('@/services/recentOpensService');
    queryResult = { data: null, error: { message: 'boom' } };
    expect(await getRecentOpens('u1')).toEqual({});
  });

  it('returns {} on a rejected promise without throwing', async () => {
    const { getRecentOpens } = await import('@/services/recentOpensService');
    rejectWith = new Error('network drop');
    await expect(getRecentOpens('u1')).resolves.toEqual({});
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/services/__tests__/recentOpensService.test.ts`
Expected: FAIL - `Failed to resolve import "@/services/recentOpensService"`.

- [ ] **Step 3: Write the implementation**

Create `src/services/recentOpensService.ts`:

```ts
import { supabase } from '@/composables/useSupabase';

export type OpenTarget = { videoId: string } | { comparisonVideoId: string };

interface ProjectOpenRow {
  videoId: string | null;
  comparisonVideoId: string | null;
  openedAt: string;
}

/**
 * Safety bound on the read. A user's own recents are small; this exists so a
 * pathological row count can never turn the dashboard load into a big query.
 */
const RECENT_OPENS_LIMIT = 500;

/**
 * Record that this user just opened this project. Informational only -
 * failures are warned and swallowed, never surfaced, exactly like
 * watchProgressService.
 */
export async function recordOpen(
  userId: string,
  target: OpenTarget
): Promise<boolean> {
  try {
    const isSingle = 'videoId' in target;
    const row = {
      userId,
      videoId: isSingle ? target.videoId : null,
      comparisonVideoId: isSingle ? null : target.comparisonVideoId,
      // Sent explicitly rather than left to the column's DEFAULT now(): the
      // default fires on INSERT only, and PostgREST builds DO UPDATE SET from
      // the columns actually sent, so omitting it would leave every re-open
      // stuck at the project's first-open timestamp.
      openedAt: new Date().toISOString(),
    };

    const { error } = await supabase.from('project_opens').upsert(row, {
      onConflict: isSingle ? 'userId,videoId' : 'userId,comparisonVideoId',
    });

    if (error) {
      console.warn('⚠️ [recentOpens] recordOpen error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('⚠️ [recentOpens] recordOpen failed:', err);
    return false;
  }
}

/**
 * This user's opens, keyed by project id - video id for single projects,
 * comparison id for dual ones, matching Project.id from mapToProjects.
 *
 * One query keyed on the user rather than an `.in(projectIds)` over every
 * loaded project: the user's own recents are small and bounded, and the
 * ("userId", "openedAt" DESC) index serves this directly.
 */
export async function getRecentOpens(
  userId: string
): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabase
      .from('project_opens')
      .select('videoId, comparisonVideoId, openedAt')
      .eq('userId', userId)
      .order('openedAt', { ascending: false })
      .limit(RECENT_OPENS_LIMIT);

    if (error || !data) {
      if (error) {
        console.warn('⚠️ [recentOpens] getRecentOpens error:', error);
      }
      return {};
    }

    const byProject: Record<string, string> = {};
    for (const row of data as ProjectOpenRow[]) {
      const projectId = row.videoId ?? row.comparisonVideoId;
      if (projectId) byProject[projectId] = row.openedAt;
    }
    return byProject;
  } catch (err) {
    console.warn('⚠️ [recentOpens] getRecentOpens failed:', err);
    return {};
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/services/__tests__/recentOpensService.test.ts`
Expected: PASS, 8 tests.

Then confirm the typed client accepts the new table and the upsert payload - this is the
first code to use the `project_opens` entry added in Task 3, and `exactOptionalPropertyTypes`
is on, so a payload mismatch would surface here:

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep recentOpensService`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/services/recentOpensService.ts src/services/__tests__/recentOpensService.test.ts
git commit -m "feat: add recentOpensService for reading and recording project opens"
```

---

### Task 5: `useRecordProjectOpen` and the editor trigger

**Files:**
- Create: `src/composables/useRecordProjectOpen.ts`
- Test: `src/composables/__tests__/useRecordProjectOpen.test.ts`
- Modify: `src/views/EditorView.vue` (import near the other composable imports around line 39; call it just after `const isAppLoading = ref(true);` at line 145)

**Interfaces:**
- Consumes: `recordOpen` / `OpenTarget` from Task 4.
- Produces: `useRecordProjectOpen(options: { currentVideoId: Ref<string | null>; currentComparisonId: Ref<string | null>; isAppLoading: Ref<boolean>; userId: Ref<string | null | undefined> }): void`

**Why one watcher instead of edits at each load site:** every editor entry path ends by setting the video store's `currentVideoId` or `currentComparisonId` - `handleProjectSelected` single branch (`EditorView.vue:1149`) and dual branch (`EditorView.vue:1159`), reached from `loadFromRoute` for dashboard clicks, pasted URLs and `?t=` deep links; `loadOutputVideo` (`EditorView.vue:1307`) for AWS links; and `useSharedContent` (lines 110, 130, 167, 203) for share links. Watching those two refs covers all of them with no edits to any load branch.

**Why `isAppLoading` is in the watch sources:** the video store is a singleton that keeps the previously-opened project across editor unmount and remount (see the comment at `EditorView.vue:1347`). Firing on mount without this gate would bump whichever project was open last time. It is also what makes re-opening the *same* project refresh its timestamp: `isAppLoading` is a per-mount local `ref(true)` that flips false in `onMounted`'s `finally` after the load, so the watcher fires again even when the ids never changed value.

- [ ] **Step 1: Write the failing test**

Create `src/composables/__tests__/useRecordProjectOpen.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick, ref } from 'vue';

const recordOpenMock = vi.fn();
vi.mock('@/services/recentOpensService', () => ({
  recordOpen: (...args: unknown[]) => recordOpenMock(...args),
}));

// Mirrors the editor at mount: the store may still hold the PREVIOUS project's
// id, and isAppLoading starts true until this mount's load settles.
function harness(initial?: {
  videoId?: string | null;
  comparisonId?: string | null;
  userId?: string | null;
}) {
  const currentVideoId = ref<string | null>(initial?.videoId ?? null);
  const currentComparisonId = ref<string | null>(initial?.comparisonId ?? null);
  const isAppLoading = ref(true);
  // Not `?? 'u1'`: that collapses an explicitly-passed null back to a signed-in
  // user and makes the anonymous-viewer test assert nothing.
  const userId = ref<string | null>(
    initial?.userId === undefined ? 'u1' : initial.userId
  );
  return { currentVideoId, currentComparisonId, isAppLoading, userId };
}

beforeEach(() => {
  recordOpenMock.mockReset();
  recordOpenMock.mockResolvedValue(true);
});

describe('useRecordProjectOpen', () => {
  it('records nothing while the mount is still loading', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness();
    useRecordProjectOpen(h);
    h.currentVideoId.value = 'v1';
    await nextTick();
    expect(recordOpenMock).not.toHaveBeenCalled();
  });

  it('records the single-video open once the load settles', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness();
    useRecordProjectOpen(h);
    h.currentVideoId.value = 'v1';
    h.isAppLoading.value = false;
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledTimes(1);
    expect(recordOpenMock).toHaveBeenCalledWith('u1', { videoId: 'v1' });
  });

  it('records a comparison open with the comparison target', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness();
    useRecordProjectOpen(h);
    h.currentComparisonId.value = 'c1';
    h.isAppLoading.value = false;
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledWith('u1', {
      comparisonVideoId: 'c1',
    });
  });

  it('records a project whose id was already in the singleton store at mount', async () => {
    // Returning to the same video: the ids never change, only isAppLoading does.
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness({ videoId: 'v1' });
    useRecordProjectOpen(h);
    h.isAppLoading.value = false;
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledWith('u1', { videoId: 'v1' });
  });

  it('does not write twice for the same project', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness();
    useRecordProjectOpen(h);
    h.currentVideoId.value = 'v1';
    h.isAppLoading.value = false;
    await nextTick();
    // A second load cycle on the same project inside one mount must not
    // produce a second write.
    h.isAppLoading.value = true;
    await nextTick();
    h.isAppLoading.value = false;
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledTimes(1);
  });

  it('records again when the editor navigates to another project', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness();
    useRecordProjectOpen(h);
    h.currentVideoId.value = 'v1';
    h.isAppLoading.value = false;
    await nextTick();
    h.currentVideoId.value = 'v2';
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledTimes(2);
    expect(recordOpenMock).toHaveBeenLastCalledWith('u1', { videoId: 'v2' });
  });

  it('writes nothing for an anonymous viewer, then writes once the user arrives', async () => {
    const { useRecordProjectOpen } = await import(
      '@/composables/useRecordProjectOpen'
    );
    const h = harness({ userId: null });
    useRecordProjectOpen(h);
    h.currentVideoId.value = 'v1';
    h.isAppLoading.value = false;
    await nextTick();
    expect(recordOpenMock).not.toHaveBeenCalled();

    h.userId.value = 'u1';
    await nextTick();
    expect(recordOpenMock).toHaveBeenCalledWith('u1', { videoId: 'v1' });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/composables/__tests__/useRecordProjectOpen.test.ts`
Expected: FAIL - `Failed to resolve import "@/composables/useRecordProjectOpen"`.

- [ ] **Step 3: Write the composable**

Create `src/composables/useRecordProjectOpen.ts`:

```ts
import { watch, type Ref } from 'vue';
import { recordOpen, type OpenTarget } from '@/services/recentOpensService';

/**
 * Records "this user opened this project" once per editor mount, per project.
 *
 * Every editor entry path - dashboard click, pasted URL, ?t= annotation deep
 * link, AWS outputVideo link, share link - ends by setting the video store's
 * currentVideoId or currentComparisonId, so watching those two covers all of
 * them without touching a single load branch.
 *
 * `isAppLoading` is the gate. The video store is a singleton that keeps the
 * previously-opened project across editor unmount/remount, so writing on mount
 * without it would bump the wrong project. It is also what makes re-opening
 * the SAME project refresh its timestamp: isAppLoading is a per-mount ref, so
 * it transitions again even when the ids do not change.
 */
export function useRecordProjectOpen(options: {
  currentVideoId: Ref<string | null>;
  currentComparisonId: Ref<string | null>;
  isAppLoading: Ref<boolean>;
  userId: Ref<string | null | undefined>;
}): void {
  const { currentVideoId, currentComparisonId, isAppLoading, userId } = options;

  // Per-mount, not module-level: a fresh editor mount must be able to record
  // the same project again.
  let lastRecordedKey: string | null = null;

  watch(
    [currentVideoId, currentComparisonId, isAppLoading, userId],
    ([videoId, comparisonId, loading, uid]) => {
      if (loading) return;
      // No signed-in user: an anonymous share-link visitor. Nothing to
      // attribute an open to, so nothing is written.
      if (!uid) return;

      const projectId = videoId ?? comparisonId;
      if (!projectId) return;

      const key = `${uid}:${projectId}`;
      if (key === lastRecordedKey) return;
      lastRecordedKey = key;

      const target: OpenTarget = videoId
        ? { videoId }
        : { comparisonVideoId: comparisonId as string };
      void recordOpen(uid, target);
    }
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/composables/__tests__/useRecordProjectOpen.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire it into the editor**

In `src/views/EditorView.vue`, add to the composable imports (near line 39, next to `import { useWatchProgress } from '@/composables/useWatchProgress';`):

```ts
import { useRecordProjectOpen } from '@/composables/useRecordProjectOpen';
```

Then, immediately after the existing line 145 (`const isAppLoading = ref(true); // Separate loading state for the app`), add:

```ts
// Per-user "last opened" record, which drives the dashboard's recency
// ordering. One watcher covers every entry path; see the composable.
useRecordProjectOpen({
  currentVideoId,
  currentComparisonId,
  isAppLoading,
  userId: computed(() => user.value?.id ?? null),
});
```

`currentVideoId` and `currentComparisonId` already come from `storeToRefs(videoStore)` (lines 79-80), `user` from `useAuth()` (line 141), and `computed` is already imported. Do not add new imports beyond the composable itself.

- [ ] **Step 6: Verify the whole suite and the typecheck delta**

Run: `npm run test`
Expected: PASS, 29 files, 260 tests - the 25-file / 232-test baseline plus the four new test files (7 + 6 + 8 + 7 = 28 tests). Read the counts off the actual summary line; the requirement is that nothing fails and every new test ran.

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -E "useRecordProjectOpen|recentOpensService|projectOrdering|relativeTime"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/composables/useRecordProjectOpen.ts src/composables/__tests__/useRecordProjectOpen.test.ts src/views/EditorView.vue
git commit -m "feat: record a per-user project open when the editor loads a project"
```

---

### Task 6: Dashboard reads opens and orders by them

**Files:**
- Modify: `src/views/DashboardView.vue` (imports near line 26; state near line 52; `loadData` at lines 105-159; `paginatedProjects` at lines 218-224)

**Interfaces:**
- Consumes: `getRecentOpens` (Task 4), `sortByRecentOpens` (Task 2).
- Produces: `recentOpens: Ref<Record<string, string>>` and an `orderedProjects` computed, both used by Task 7.

- [ ] **Step 1: Add the imports**

In `src/views/DashboardView.vue`, next to the existing `getMergedRangesForVideos` import (line 26):

```ts
import { getRecentOpens } from '@/services/recentOpensService';
import { sortByRecentOpens } from '@/utils/projectOrdering';
```

- [ ] **Step 2: Add the state**

Next to the existing `watchCoverage` ref (around line 52):

```ts
// This user's own "last opened" times, keyed by project id. Per user by
// construction: the query filters on userId and RLS enforces it independently,
// so scope 'all' still reorders by YOUR opens only.
const recentOpens = ref<Record<string, string>>({});
```

- [ ] **Step 3: Load it in `loadData`**

In `loadData`, replace these two lines. Both anchors occur exactly once in the file
(`grep -c "const counts = await ProjectService.getProjectCountsBatched" src/views/DashboardView.vue`
prints `1`); re-check that before editing rather than trusting a naive replace:

```ts
    const counts = await ProjectService.getProjectCountsBatched(projects.value);
    annotationCounts.value = counts.annotationCounts;
```

with:

```ts
    const [counts, opens] = await Promise.all([
      ProjectService.getProjectCountsBatched(projects.value),
      getRecentOpens(user.value.id),
    ]);
    recentOpens.value = opens;
    annotationCounts.value = counts.annotationCounts;
```

Parallel, not a fourth sequential await: the two calls are independent, so this adds no round trip to the dashboard load.

- [ ] **Step 4: Sort between filtering and pagination**

Add this computed immediately after `filteredProjects` (which ends at line 213):

```ts
// Recency ordering lives here, not in ProjectService.mapToProjects: that is a
// private static shared by getUserProjects and getAllProjects with no user
// context, and it keeps owning created-date order as the stable base.
const orderedProjects = computed(() =>
  sortByRecentOpens(filteredProjects.value, recentOpens.value)
);
```

Then change `paginatedProjects` to slice the ordered list:

```ts
const paginatedProjects = computed(() =>
  orderedProjects.value.slice(
    (currentPage.value - 1) * itemsPerPage.value,
    currentPage.value * itemsPerPage.value
  )
);
```

This ordering matters: sorting after the slice would only float a recent project within page 1. Leave `totalPages` reading `filteredProjects.value.length` - ordering does not change the count.

- [ ] **Step 5: Verify nothing regressed**

Run: `npm run test`
Expected: PASS, same counts as after Task 5.

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "src/views/DashboardView.vue"`
Expected: no output.

Run: `npx eslint src/views/DashboardView.vue`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "feat: order the dashboard by the user's recently opened projects"
```

---

### Task 7: The `OPENED …` meta token

**Files:**
- Modify: `src/components/ProjectListItem.vue` (meta line at lines 53-73; props at lines 92-100; script at lines 88-118)
- Modify: `src/views/DashboardView.vue` (the `<ProjectListItem>` usage at lines 540-552)

**Interfaces:**
- Consumes: `formatRelativeTime` (Task 1), `recentOpens` (Task 6).
- Produces: nothing downstream.

**Target rendering:**

```
Sprint drill
2:14  60FPS  Today  3A  OPENED 5M AGO

Uploaded Monday
0:58  4 days ago
```

- [ ] **Step 1: Add the prop and the label computed**

In `src/components/ProjectListItem.vue`, add the import below the existing `import type { Project }`:

```ts
import { formatRelativeTime } from '@/utils/relativeTime';
```

Add `openedAt` to the props (the existing block ends with `watchPercent?: number;`):

```ts
  openedAt?: string;
```

And add this computed next to `watchedPercentLabel`:

```ts
/**
 * "5M AGO" for a project this user has opened, empty otherwise. Empty covers
 * both never-opened and an unparseable timestamp, and the template renders no
 * token in either case - same suppression rule the coverage chip uses.
 */
const openedLabel = computed(() =>
  props.openedAt ? formatRelativeTime(props.openedAt) : ''
);
```

- [ ] **Step 2: Render the token**

In the meta line, immediately after the existing created-date span:

```html
        <span>{{ formatDate(project.createdAt) }}</span>
```

add:

```html
        <!-- Per-user: this is when YOU opened it, not the team. It also
             explains why the row sits where it does in the list. -->
        <span
          v-if="openedLabel"
          title="You last opened this"
        >OPENED {{ openedLabel }}</span>
```

Leave the annotation-count and comment-count tokens after it, unchanged.

- [ ] **Step 3: Pass the prop from the dashboard**

In `src/views/DashboardView.vue`, in the `<ProjectListItem>` usage, add below `:watch-percent="watchCoverage[project.id] ?? 0"`:

```html
              :opened-at="recentOpens[project.id]"
```

- [ ] **Step 4: Verify**

Run: `npm run test`
Expected: PASS, no change in counts.

Run: `npx eslint src/components/ProjectListItem.vue src/views/DashboardView.vue`
Expected: 0 errors. (`vue/max-attributes-per-line` and similar warnings are part of the 99-warning baseline; do not reformat unrelated attributes to chase them.)

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ProjectListItem|DashboardView"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProjectListItem.vue src/views/DashboardView.vue
git commit -m "feat: show when you last opened a project in the dashboard meta line"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: all files pass; total is the 232 baseline plus the new tests (7 + 6 + 8 + 7 = 28), so 260 tests across 29 files. Paste the actual summary line into the report rather than asserting it from memory.

- [ ] **Step 2: Lint**

Run: `npx eslint src`
Expected: 0 errors. Warning count should be at or near the 99 baseline; if it rose, the added warnings must be in your new files and you should fix them.

- [ ] **Step 3: Typecheck delta**

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: the same count you measured on a clean tree before Task 1, not necessarily 95 -
that figure was taken with the thumbnail work in place. The delta is the check.

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -E "relativeTime|projectOrdering|recentOpensService|useRecordProjectOpen|ProjectListItem|DashboardView|database.ts"`
Expected: no output.

- [ ] **Step 4: Runtime verification**

Confirm the migration from Task 3 is applied to the database this build points at. Then use the `verify` skill (or `npm run dev`) to drive the real app while signed in. The local dev auth bypass is fine here: `useAuth.applyDevAuthBypass` signs in with real credentials via `signInWithPassword`, so `auth.uid()` is a real user id and the RLS policies accept the write.

1. Load the dashboard. Note the current top three rows.
2. Open a project that is **not** first in the list, then go back to the dashboard.
3. It is now the first row and carries `OPENED JUST NOW`. No other row's meta line changed.
4. Open a different project, go back: it takes first place, the previous one is second and reads `OPENED 1M AGO` or similar.
5. Open a dual comparison, go back: it takes first place too, and its row still shows the `DUAL` token.
6. Search or select a folder that excludes the most-recent project, and confirm the remaining rows still order sensibly and pagination is not stranded.
7. Confirm rows you have never opened show no `OPENED` token at all.

Be picky about the row: the new token must sit in the same mono size, weight, letter-spacing and colour as the tokens beside it, with the same gap. A token that reads slightly larger or darker than `60FPS` is a defect, not a detail.

- [ ] **Step 5: Report**

Report what actually ran and what it printed: the test summary line, the lint counts, the typecheck count, and the result of each runtime step. If the migration could not be applied, say so plainly and mark the runtime verification as not performed rather than inferring it from the unit tests.

---

## Out of scope

Deliberately not in this plan, and not to be added opportunistically:

- Any sort-order control in the dashboard UI. There is no sort selector today; recency simply replaces created-date as the default order.
- A "Recent" section header or any grouping chrome.
- Backfilling `project_opens` from `video_watch_progress`. Existing watch rows are not opens, and an empty table simply means the list looks exactly like it does today until people start opening things.
- Recording opens for anonymous share-link visitors. No `auth.uid()` means no row, by design.
