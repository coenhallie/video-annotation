# Watch Progress Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track how much of each video every user has actually watched (unique seconds coverage), persist it per user per video in Supabase, and surface the percentage in the editor and the dashboard details sidebar.

**Architecture:** Pure range-math helpers (`src/utils/watchedRanges.ts`) → Supabase service (`src/services/watchProgressService.ts`) → tracking composable (`src/composables/useWatchProgress.ts`) → UI wiring in `EditorView.vue` (own progress hint) and `VideoDetailsPanel.vue` (per-collaborator list). Spec: `docs/superpowers/specs/2026-07-04-watch-progress-design.md`.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Pinia store refs, Supabase JS v2, Vitest (node env, `npm test` runs `vitest run`, tests match `src/**/*.test.ts`).

## Global Constraints

- DB columns are camelCase and must be double-quoted in SQL (`"userId"`, `"videoId"`), matching existing tables (`ownerId`, `fullName`).
- Import the Supabase client only as `import { supabase } from '@/composables/useSupabase'`; unit tests mock that module (see `src/services/__tests__/sharePermissions.test.ts` for the established chain-mock pattern).
- No RLS on the new table — consistent with the rest of the schema today; noted in the spec for the pending RLS phase.
- Watch tracking is informational only. It must never block annotation and must never throw into the player path — service errors are `console.warn`ed and swallowed.
- Percentages are unique coverage: seeking must not fill gaps; rewatching must not exceed 100.
- No new dependencies. There is no @vue/test-utils — do not write component-mount tests; test logic as pure functions/composables and verify UI via `npm run build` + manual checks.

---

### Task 1: Pure watched-ranges helpers

**Files:**
- Create: `src/utils/watchedRanges.ts`
- Test: `src/utils/__tests__/watchedRanges.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `type WatchedRange = [number, number]` (seconds, half-open `[start, end)`); `mergeRanges(ranges: WatchedRange[]): WatchedRange[]`; `addSecond(ranges: WatchedRange[], currentTime: number): WatchedRange[]`; `percentFromRanges(ranges: WatchedRange[], duration: number): number` (0–100, one decimal, clamped).

- [ ] **Step 1: Write the failing tests**

```ts
// src/utils/__tests__/watchedRanges.test.ts
import { describe, it, expect } from 'vitest';
import {
  mergeRanges,
  addSecond,
  percentFromRanges,
  type WatchedRange,
} from '@/utils/watchedRanges';

describe('mergeRanges', () => {
  it('merges overlapping and touching ranges', () => {
    expect(
      mergeRanges([
        [0, 3],
        [2, 5],
        [5, 6],
      ])
    ).toEqual([[0, 6]]);
  });

  it('keeps disjoint ranges separate and sorts them', () => {
    expect(
      mergeRanges([
        [10, 12],
        [0, 2],
      ])
    ).toEqual([
      [0, 2],
      [10, 12],
    ]);
  });

  it('drops empty/inverted ranges and does not mutate input', () => {
    const input: WatchedRange[] = [
      [5, 5],
      [3, 1],
      [0, 1],
    ];
    const copy = JSON.parse(JSON.stringify(input));
    expect(mergeRanges(input)).toEqual([[0, 1]]);
    expect(input).toEqual(copy);
  });
});

describe('addSecond', () => {
  it('extends the current range during continuous playback', () => {
    let r: WatchedRange[] = [];
    r = addSecond(r, 0.2);
    r = addSecond(r, 1.1);
    r = addSecond(r, 2.7);
    expect(r).toEqual([[0, 3]]);
  });

  it('starts a new range after a seek, leaving the gap unwatched', () => {
    let r: WatchedRange[] = [[0, 3]];
    r = addSecond(r, 30.5);
    expect(r).toEqual([
      [0, 3],
      [30, 31],
    ]);
  });

  it('ignores negative and non-finite times', () => {
    expect(addSecond([], -1)).toEqual([]);
    expect(addSecond([], NaN)).toEqual([]);
  });
});

describe('percentFromRanges', () => {
  it('computes unique coverage percent', () => {
    expect(percentFromRanges([[0, 10]], 100)).toBe(10);
  });

  it('rewatching does not inflate; clamps to 100', () => {
    expect(
      percentFromRanges(
        [
          [0, 10],
          [0, 10],
          [0, 12],
        ],
        10
      )
    ).toBe(100);
  });

  it('ignores coverage beyond duration (last partial second)', () => {
    // 9.5s video: marking second 9 stores [9,10); only 0.5s of it counts
    expect(percentFromRanges([[9, 10]], 9.5)).toBe(5.3);
  });

  it('returns 0 for zero/unknown duration', () => {
    expect(percentFromRanges([[0, 5]], 0)).toBe(0);
    expect(percentFromRanges([], 100)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/watchedRanges.test.ts`
Expected: FAIL — cannot resolve `@/utils/watchedRanges`.

- [ ] **Step 3: Implement the helpers**

```ts
// src/utils/watchedRanges.ts
/**
 * Watched-coverage math for video watch tracking.
 * Ranges are half-open second intervals [start, end), kept sorted and merged.
 */
export type WatchedRange = [number, number];

export function mergeRanges(ranges: WatchedRange[]): WatchedRange[] {
  const sorted = ranges
    .filter(([start, end]) => Number.isFinite(start) && end > start)
    .slice()
    .sort((a, b) => a[0] - b[0]);

  const merged: WatchedRange[] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

export function addSecond(
  ranges: WatchedRange[],
  currentTime: number
): WatchedRange[] {
  if (!Number.isFinite(currentTime) || currentTime < 0) return ranges;
  const sec = Math.floor(currentTime);
  return mergeRanges([...ranges, [sec, sec + 1]]);
}

export function percentFromRanges(
  ranges: WatchedRange[],
  duration: number
): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const covered = mergeRanges(ranges).reduce(
    (sum, [start, end]) =>
      sum + Math.max(0, Math.min(end, duration) - Math.min(start, duration)),
    0
  );
  const percent = (covered / duration) * 100;
  return Math.min(100, Math.round(percent * 10) / 10);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/watchedRanges.test.ts`
Expected: PASS (all 10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/watchedRanges.ts src/utils/__tests__/watchedRanges.test.ts
git commit -m "feat: watched-ranges coverage math for watch progress"
```

---

### Task 2: Database migration

**Files:**
- Create: `migrations/20260704_watch_progress.sql`

**Interfaces:**
- Consumes: existing `public.videos(id)`.
- Produces: table `public.video_watch_progress` with unique `("userId", "videoId")`, used by Task 3 via PostgREST upsert `onConflict: 'userId,videoId'`.

- [ ] **Step 1: Write the migration**

```sql
-- migrations/20260704_watch_progress.sql
-- Per-user video watch coverage. One row per (user, video).
-- "watchedRanges" is a JSONB array of [startSec, endSec) intervals, merged client-side.
-- NOTE: no RLS, consistent with the rest of the schema (pending RLS phase).

CREATE TABLE IF NOT EXISTS public.video_watch_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" uuid NOT NULL,
    "videoId" uuid NOT NULL REFERENCES public.videos (id) ON DELETE CASCADE,
    "watchedRanges" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "percentWatched" numeric NOT NULL DEFAULT 0,
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT video_watch_progress_user_video_key UNIQUE ("userId", "videoId")
);

CREATE INDEX IF NOT EXISTS idx_video_watch_progress_video
    ON public.video_watch_progress ("videoId");
```

(`"userId"` intentionally has no FK: user rows live in `public.users` synced from Keycloak; other tables' `userId`/`ownerId` columns are plain uuids too.)

- [ ] **Step 2: Apply the migration (manual gate)**

This project has no migration runner; SQL files in `migrations/` are applied by hand. Ask the human to run the file's contents in the Supabase Studio SQL editor, then verify with:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'video_watch_progress';
```

Expected: 6 rows (`id`, `userId`, `videoId`, `watchedRanges`, `percentWatched`, `updatedAt`). Do not proceed to Task 5/6 verification steps until applied (Tasks 3–4 are mock-tested and don't need the live table).

- [ ] **Step 3: Commit**

```bash
git add migrations/20260704_watch_progress.sql
git commit -m "feat: video_watch_progress table migration"
```

---

### Task 3: Watch progress service

**Files:**
- Create: `src/services/watchProgressService.ts`
- Test: `src/services/__tests__/watchProgressService.test.ts`

**Interfaces:**
- Consumes: `supabase` from `@/composables/useSupabase`; `fetchOwners(ownerIds: string[]): Promise<Record<string, ProjectOwner>>` and `type ProjectOwner = { id: string; name: string; avatarUrl?: string }` from `./ownerEnrichmentService`; `mergeRanges` / `percentFromRanges` / `WatchedRange` from `@/utils/watchedRanges` (Task 1).
- Produces:
  - `interface WatchProgressRow { userId: string; videoId: string; watchedRanges: WatchedRange[]; percentWatched: number; updatedAt?: string }`
  - `interface UserWatchProgress extends WatchProgressRow { user: ProjectOwner }`
  - `getProgress(videoId: string, userId: string): Promise<WatchProgressRow | null>`
  - `getProgressForVideo(videoId: string): Promise<UserWatchProgress[]>`
  - `upsertProgress(userId: string, videoId: string, ranges: WatchedRange[], duration: number): Promise<boolean>`
  - `mergeDualProgress(a: UserWatchProgress[], b: UserWatchProgress[]): UserWatchProgress[]` (pure; per user, `percentWatched` = min of the two videos, missing video = 0)

- [ ] **Step 1: Write the failing tests**

```ts
// src/services/__tests__/watchProgressService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let queryResult: { data: unknown; error: unknown } = { data: null, error: null };

const chain: Record<string, any> = {};
for (const m of ['select', 'eq', 'order', 'upsert']) {
  chain[m] = vi.fn(() => chain);
}
chain.maybeSingle = vi.fn(() => Promise.resolve(queryResult));
chain.then = (onFulfilled: any, onRejected: any) =>
  Promise.resolve(queryResult).then(onFulfilled, onRejected);

const fromMock = vi.fn(() => chain);

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

const fetchOwnersMock = vi.fn();
vi.mock('@/services/ownerEnrichmentService', () => ({
  fetchOwners: (...a: unknown[]) => fetchOwnersMock(...a),
}));

beforeEach(() => {
  fromMock.mockClear();
  fetchOwnersMock.mockReset();
  for (const m of ['select', 'eq', 'order', 'upsert', 'maybeSingle']) {
    chain[m].mockClear();
  }
  queryResult = { data: null, error: null };
});

describe('getProgress', () => {
  it('returns the row for a user/video pair', async () => {
    const { getProgress } = await import('@/services/watchProgressService');
    const row = {
      userId: 'u1',
      videoId: 'v1',
      watchedRanges: [[0, 5]],
      percentWatched: 10,
    };
    queryResult = { data: row, error: null };
    expect(await getProgress('v1', 'u1')).toEqual(row);
    expect(fromMock).toHaveBeenCalledWith('video_watch_progress');
    expect(chain.eq).toHaveBeenCalledWith('videoId', 'v1');
    expect(chain.eq).toHaveBeenCalledWith('userId', 'u1');
  });

  it('returns null on error without throwing', async () => {
    const { getProgress } = await import('@/services/watchProgressService');
    queryResult = { data: null, error: { message: 'boom' } };
    expect(await getProgress('v1', 'u1')).toBeNull();
  });
});

describe('getProgressForVideo', () => {
  it('enriches rows with user info and falls back to Unknown', async () => {
    const { getProgressForVideo } = await import(
      '@/services/watchProgressService'
    );
    queryResult = {
      data: [
        { userId: 'u1', videoId: 'v1', watchedRanges: [], percentWatched: 80 },
        { userId: 'u2', videoId: 'v1', watchedRanges: [], percentWatched: 5 },
      ],
      error: null,
    };
    fetchOwnersMock.mockResolvedValue({
      u1: { id: 'u1', name: 'Alice' },
      u2: { id: 'u2', name: 'Unknown' },
    });
    const result = await getProgressForVideo('v1');
    expect(result.map((r) => r.user.name)).toEqual(['Alice', 'Unknown']);
    expect(fetchOwnersMock).toHaveBeenCalledWith(['u1', 'u2']);
  });

  it('returns [] on error', async () => {
    const { getProgressForVideo } = await import(
      '@/services/watchProgressService'
    );
    queryResult = { data: null, error: { message: 'boom' } };
    expect(await getProgressForVideo('v1')).toEqual([]);
  });
});

describe('upsertProgress', () => {
  it('merges ranges, computes percent, and upserts on (userId,videoId)', async () => {
    const { upsertProgress } = await import(
      '@/services/watchProgressService'
    );
    queryResult = { data: null, error: null };
    const ok = await upsertProgress(
      'u1',
      'v1',
      [
        [0, 5],
        [3, 10],
      ],
      100
    );
    expect(ok).toBe(true);
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        watchedRanges: [[0, 10]],
        percentWatched: 10,
      }),
      { onConflict: 'userId,videoId' }
    );
  });

  it('returns false on error without throwing', async () => {
    const { upsertProgress } = await import(
      '@/services/watchProgressService'
    );
    queryResult = { data: null, error: { message: 'boom' } };
    expect(await upsertProgress('u1', 'v1', [[0, 1]], 10)).toBe(false);
  });
});

describe('mergeDualProgress', () => {
  it('takes the per-user minimum across the two videos, missing video = 0', async () => {
    const { mergeDualProgress } = await import(
      '@/services/watchProgressService'
    );
    const alice = { id: 'u1', name: 'Alice' };
    const bob = { id: 'u2', name: 'Bob' };
    const a = [
      { userId: 'u1', videoId: 'va', watchedRanges: [], percentWatched: 80, user: alice },
      { userId: 'u2', videoId: 'va', watchedRanges: [], percentWatched: 40, user: bob },
    ];
    const b = [
      { userId: 'u1', videoId: 'vb', watchedRanges: [], percentWatched: 20, user: alice },
    ];
    const merged = mergeDualProgress(a as any, b as any);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ userId: 'u1', percentWatched: 20 });
    expect(merged[1]).toMatchObject({ userId: 'u2', percentWatched: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/__tests__/watchProgressService.test.ts`
Expected: FAIL — cannot resolve `@/services/watchProgressService`.

- [ ] **Step 3: Implement the service**

```ts
// src/services/watchProgressService.ts
import { supabase } from '@/composables/useSupabase';
import {
  fetchOwners,
  type ProjectOwner,
} from '@/services/ownerEnrichmentService';
import {
  mergeRanges,
  percentFromRanges,
  type WatchedRange,
} from '@/utils/watchedRanges';

export interface WatchProgressRow {
  userId: string;
  videoId: string;
  watchedRanges: WatchedRange[];
  percentWatched: number;
  updatedAt?: string;
}

export interface UserWatchProgress extends WatchProgressRow {
  user: ProjectOwner;
}

const COLUMNS = 'userId, videoId, watchedRanges, percentWatched, updatedAt';

export async function getProgress(
  videoId: string,
  userId: string
): Promise<WatchProgressRow | null> {
  const { data, error } = await supabase
    .from('video_watch_progress')
    .select(COLUMNS)
    .eq('videoId', videoId)
    .eq('userId', userId)
    .maybeSingle();

  if (error) {
    console.warn('⚠️ [watchProgress] getProgress error:', error);
    return null;
  }
  return (data as WatchProgressRow | null) ?? null;
}

export async function getProgressForVideo(
  videoId: string
): Promise<UserWatchProgress[]> {
  const { data, error } = await supabase
    .from('video_watch_progress')
    .select(COLUMNS)
    .eq('videoId', videoId)
    .order('percentWatched', { ascending: false });

  if (error || !data) {
    if (error) {
      console.warn('⚠️ [watchProgress] getProgressForVideo error:', error);
    }
    return [];
  }

  const rows = data as WatchProgressRow[];
  const owners = await fetchOwners(rows.map((r) => r.userId));
  return rows.map((r) => ({
    ...r,
    user: owners[r.userId] ?? { id: r.userId, name: 'Unknown' },
  }));
}

export async function upsertProgress(
  userId: string,
  videoId: string,
  ranges: WatchedRange[],
  duration: number
): Promise<boolean> {
  const watchedRanges = mergeRanges(ranges);
  const { error } = await supabase.from('video_watch_progress').upsert(
    {
      userId,
      videoId,
      watchedRanges,
      percentWatched: percentFromRanges(watchedRanges, duration),
      updatedAt: new Date().toISOString(),
    },
    { onConflict: 'userId,videoId' }
  );

  if (error) {
    console.warn('⚠️ [watchProgress] upsertProgress error:', error);
    return false;
  }
  return true;
}

/**
 * Per-user progress for a dual project: a user's coverage is the LOWER of
 * their two per-video percentages (not watching one video at all = 0).
 */
export function mergeDualProgress(
  a: UserWatchProgress[],
  b: UserWatchProgress[]
): UserWatchProgress[] {
  const aPercent = new Map(a.map((r) => [r.userId, r.percentWatched]));
  const bPercent = new Map(b.map((r) => [r.userId, r.percentWatched]));
  const byUser = new Map<string, UserWatchProgress>();
  for (const row of [...a, ...b]) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, row);
  }
  return [...byUser.values()]
    .map((row) => ({
      ...row,
      percentWatched: Math.min(
        aPercent.get(row.userId) ?? 0,
        bPercent.get(row.userId) ?? 0
      ),
    }))
    .sort((x, y) => y.percentWatched - x.percentWatched);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/__tests__/watchProgressService.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/watchProgressService.ts src/services/__tests__/watchProgressService.test.ts
git commit -m "feat: watch progress service (load/upsert/enrich, dual merge)"
```

---

### Task 4: useWatchProgress composable

**Files:**
- Create: `src/composables/useWatchProgress.ts`
- Test: `src/composables/__tests__/useWatchProgress.test.ts`

**Interfaces:**
- Consumes: `getProgress`, `upsertProgress` from `@/services/watchProgressService`; `addSecond`, `mergeRanges`, `percentFromRanges`, `WatchedRange` from `@/utils/watchedRanges`.
- Produces: `useWatchProgress(options: { videoId: ReadableRef<string | null | undefined>; duration: ReadableRef<number>; userId: ReadableRef<string | null | undefined> })` returning `{ percentWatched: ComputedRef<number>; onTimeUpdate(currentTime: number, isPlaying: boolean): void; flush(): Promise<void> }`. `ReadableRef<T>` = `Ref<T> | ComputedRef<T>` (exported). Task 5 calls `onTimeUpdate` from time watchers and reads `percentWatched`.

Behavior contract:
- Loads existing ranges when `videoId`+`userId` become available or change; merges DB ranges with any seconds marked while the load was in flight.
- `onTimeUpdate` marks the current second only when `isPlaying` is true, duration > 0, and both ids present.
- Persists at most once per 10 s of playback (`FLUSH_INTERVAL_MS = 10_000`), plus explicit `flush()` (Task 5 calls it on pause) and automatic flush on `beforeunload` and component unmount. A failed upsert re-marks state dirty so the next flush retries.

- [ ] **Step 1: Write the failing tests**

```ts
// src/composables/__tests__/useWatchProgress.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';

const getProgressMock = vi.fn();
const upsertProgressMock = vi.fn();

vi.mock('@/services/watchProgressService', () => ({
  getProgress: (...a: unknown[]) => getProgressMock(...a),
  upsertProgress: (...a: unknown[]) => upsertProgressMock(...a),
}));

async function setup(overrides: Partial<Record<'videoId' | 'userId', string | null>> = {}) {
  const { useWatchProgress } = await import('@/composables/useWatchProgress');
  const videoId = ref<string | null>(overrides.videoId ?? 'v1');
  const userId = ref<string | null>(overrides.userId ?? 'u1');
  const duration = ref(100);
  const wp = useWatchProgress({ videoId, duration, userId });
  // let the immediate load settle
  await Promise.resolve();
  await Promise.resolve();
  return { wp, videoId, userId, duration };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-04T12:00:00Z'));
  getProgressMock.mockReset().mockResolvedValue(null);
  upsertProgressMock.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useWatchProgress', () => {
  it('accumulates percent while playing and ignores paused updates', async () => {
    const { wp } = await setup();
    for (let t = 0; t < 10; t++) wp.onTimeUpdate(t + 0.5, true);
    expect(wp.percentWatched.value).toBe(10);
    wp.onTimeUpdate(50, false); // paused scrub — not counted
    expect(wp.percentWatched.value).toBe(10);
  });

  it('does not track without a signed-in user', async () => {
    const { wp } = await setup({ userId: null });
    wp.onTimeUpdate(1, true);
    expect(wp.percentWatched.value).toBe(0);
    await wp.flush();
    expect(upsertProgressMock).not.toHaveBeenCalled();
  });

  it('throttles persistence to one upsert per 10s window', async () => {
    const { wp } = await setup();
    wp.onTimeUpdate(0, true); // first mark flushes immediately
    expect(upsertProgressMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    wp.onTimeUpdate(5, true); // within window — no flush
    expect(upsertProgressMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6000);
    wp.onTimeUpdate(11, true); // window elapsed — flush
    expect(upsertProgressMock).toHaveBeenCalledTimes(2);
  });

  it('flush is a no-op when nothing changed', async () => {
    const { wp } = await setup();
    await wp.flush();
    expect(upsertProgressMock).not.toHaveBeenCalled();
  });

  it('merges previously stored ranges into the live percent', async () => {
    getProgressMock.mockResolvedValue({
      userId: 'u1',
      videoId: 'v1',
      watchedRanges: [[0, 20]],
      percentWatched: 20,
    });
    const { wp } = await setup();
    expect(wp.percentWatched.value).toBe(20);
    wp.onTimeUpdate(50.2, true);
    expect(wp.percentWatched.value).toBe(21);
  });

  it('reloads when the video changes', async () => {
    const { wp, videoId } = await setup();
    wp.onTimeUpdate(3, true);
    videoId.value = 'v2';
    await nextTick(); // let the [videoId, userId] watcher fire
    await Promise.resolve();
    await Promise.resolve();
    expect(getProgressMock).toHaveBeenLastCalledWith('v2', 'u1');
    expect(wp.percentWatched.value).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/composables/__tests__/useWatchProgress.test.ts`
Expected: FAIL — cannot resolve `@/composables/useWatchProgress`.

- [ ] **Step 3: Implement the composable**

```ts
// src/composables/useWatchProgress.ts
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import {
  addSecond,
  mergeRanges,
  percentFromRanges,
  type WatchedRange,
} from '@/utils/watchedRanges';
import { getProgress, upsertProgress } from '@/services/watchProgressService';

export type ReadableRef<T> = Ref<T> | ComputedRef<T>;

const FLUSH_INTERVAL_MS = 10_000;

/**
 * Tracks unique watched coverage for one video. Informational only —
 * persistence failures are retried on the next flush, never surfaced.
 */
export function useWatchProgress(options: {
  videoId: ReadableRef<string | null | undefined>;
  duration: ReadableRef<number>;
  userId: ReadableRef<string | null | undefined>;
}) {
  const { videoId, duration, userId } = options;

  const ranges = ref<WatchedRange[]>([]);
  let loadedKey: string | null = null;
  let dirty = false;
  let lastFlushAt = 0;

  const percentWatched = computed(() =>
    percentFromRanges(ranges.value, duration.value)
  );

  async function loadExisting() {
    const vid = videoId.value;
    const uid = userId.value;
    if (!vid || !uid) return;
    const key = `${uid}:${vid}`;
    if (loadedKey === key) return;
    loadedKey = key;
    ranges.value = [];
    dirty = false;
    const row = await getProgress(vid, uid);
    // Guard against the ids changing again while the request was in flight;
    // merge with seconds marked during the load.
    if (loadedKey === key && row?.watchedRanges?.length) {
      ranges.value = mergeRanges([...row.watchedRanges, ...ranges.value]);
    }
  }

  function onTimeUpdate(currentTime: number, isPlaying: boolean) {
    if (!isPlaying) return;
    if (!videoId.value || !userId.value || duration.value <= 0) return;
    ranges.value = addSecond(ranges.value, currentTime);
    dirty = true;
    if (Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS) void flush();
  }

  async function flush() {
    if (!dirty) return;
    const vid = videoId.value;
    const uid = userId.value;
    if (!vid || !uid || duration.value <= 0) return;
    dirty = false;
    lastFlushAt = Date.now();
    const ok = await upsertProgress(uid, vid, ranges.value, duration.value);
    if (!ok) dirty = true;
  }

  watch([videoId, userId], () => void loadExisting(), { immediate: true });

  const flushOnUnload = () => void flush();
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flushOnUnload);
  }
  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      void flush();
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', flushOnUnload);
      }
    });
  }

  return { percentWatched, onTimeUpdate, flush };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/useWatchProgress.test.ts`
Expected: PASS (6 tests). If the throttle test's first flush doesn't fire: `lastFlushAt` starts at 0 and `Date.now()` under fake timers is the 2026 epoch ms, so the first `onTimeUpdate` always flushes — check the mock setup, not the interval math.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: PASS (no regressions).

```bash
git add src/composables/useWatchProgress.ts src/composables/__tests__/useWatchProgress.test.ts
git commit -m "feat: useWatchProgress composable with throttled persistence"
```

---

### Task 5: Editor wiring + own-progress hint

**Files:**
- Modify: `src/views/EditorView.vue` (script: after the `useVideoEventHandlers` destructuring ~line 462–480; template: inside the `<aside>` at ~line 1112, above the AnnotationPanel wrapper `<div class="flex-1 overflow-hidden">` at ~line 1116)

**Interfaces:**
- Consumes (all already in EditorView scope): `user` (from `useAuth()`), `currentVideoId`, `duration`, `isPlaying`, `currentTime`, `playerMode` (from `storeToRefs(videoStore)`), `dualVideoPlayer` (from `useDualVideoPlayer()`, exposing `videoAId/videoBId`, `videoACurrentTime/videoBCurrentTime`, `videoAIsPlaying/videoBIsPlaying`, `videoAState/videoBState` with `.duration`); `useWatchProgress` from Task 4.
- Produces: user-visible hint; no exports.

- [ ] **Step 1: Add tracking instances and watchers to the script**

Add the import alongside the other composable imports:

```ts
import { useWatchProgress } from '@/composables/useWatchProgress';
```

Add after the `useVideoEventHandlers({...})` block (~line 496):

```ts
// ── Watch-progress tracking (informational; spec 2026-07-04) ────────────────
const watchUserId = computed(() => user.value?.id ?? null);

// Wrap store refs in computed: ComputedRef is covariant (readonly value), so
// it always satisfies ReadableRef<string | null | undefined> regardless of the
// store ref's exact nullability.
const singleWatchProgress = useWatchProgress({
  videoId: computed(() => currentVideoId.value ?? null),
  duration,
  userId: watchUserId,
});
const watchProgressA = useWatchProgress({
  videoId: computed(() => dualVideoPlayer?.videoAId?.value ?? null),
  duration: computed(() => dualVideoPlayer?.videoAState?.duration || 0),
  userId: watchUserId,
});
const watchProgressB = useWatchProgress({
  videoId: computed(() => dualVideoPlayer?.videoBId?.value ?? null),
  duration: computed(() => dualVideoPlayer?.videoBState?.duration || 0),
  userId: watchUserId,
});

watch(currentTime, (t) => {
  if (playerMode.value === 'single' && typeof t === 'number') {
    singleWatchProgress.onTimeUpdate(t, isPlaying.value);
  }
});
watch(
  () => dualVideoPlayer?.videoACurrentTime?.value,
  (t) => {
    if (playerMode.value === 'dual' && typeof t === 'number') {
      watchProgressA.onTimeUpdate(t, !!dualVideoPlayer?.videoAIsPlaying?.value);
    }
  }
);
watch(
  () => dualVideoPlayer?.videoBCurrentTime?.value,
  (t) => {
    if (playerMode.value === 'dual' && typeof t === 'number') {
      watchProgressB.onTimeUpdate(t, !!dualVideoPlayer?.videoBIsPlaying?.value);
    }
  }
);
// Flush promptly when playback pauses (composable also flushes on unmount/unload)
watch(isPlaying, (playing) => {
  if (!playing) void singleWatchProgress.flush();
});
watch(
  () => dualVideoPlayer?.videoAIsPlaying?.value,
  (playing) => {
    if (!playing) void watchProgressA.flush();
  }
);
watch(
  () => dualVideoPlayer?.videoBIsPlaying?.value,
  (playing) => {
    if (!playing) void watchProgressB.flush();
  }
);

const ownWatchPercent = computed(() =>
  playerMode.value === 'dual'
    ? Math.min(
        watchProgressA.percentWatched.value,
        watchProgressB.percentWatched.value
      )
    : singleWatchProgress.percentWatched.value
);
const watchBreakdownTitle = computed(() =>
  playerMode.value === 'dual'
    ? `Video A: ${watchProgressA.percentWatched.value}% · Video B: ${watchProgressB.percentWatched.value}%`
    : ''
);
```

(`computed` and `watch` are already imported in EditorView.)

- [ ] **Step 2: Add the hint to the template**

Inside the `<aside>` (~line 1112), immediately BEFORE `<div class="flex-1 overflow-hidden">`:

```html
<!-- Own watch-coverage hint (informational, never blocks annotating) -->
<div
  v-if="user && videoLoaded"
  class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
  :title="watchBreakdownTitle"
>
  You've watched {{ Math.round(ownWatchPercent) }}% of this video
</div>
```

- [ ] **Step 3: Verify it builds and tests still pass**

Run: `npm run build && npm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 4: Manual verification (needs Task 2 applied)**

Run `npm run dev`, open a video in the editor while signed in:
- Hint shows 0%, climbs while playing, does not climb while paused or when scrubbing paused.
- Seeking ahead does not jump the percent.
- Network tab shows an upsert to `video_watch_progress` at most every ~10 s and one on pause.
- Reload the page: percent resumes from the stored value.
- Open a dual comparison: hint shows the lower of A/B; tooltip shows both.

- [ ] **Step 5: Commit**

```bash
git add src/views/EditorView.vue
git commit -m "feat: track watch progress in editor with own-coverage hint"
```

---

### Task 6: Per-collaborator list in the dashboard sidebar

**Files:**
- Modify: `src/components/VideoDetailsPanel.vue` (template: new section between the Labels block ending ~line 74 and the Annotations list ~line 76; script: add fetch logic to the existing `<script setup>` ~line 153)

**Interfaces:**
- Consumes: `getProgressForVideo`, `mergeDualProgress`, `type UserWatchProgress` from `@/services/watchProgressService` (Task 3); existing `props.project: Project` (`project.video.id` when `projectType === 'single'`, `project.videoA.id`/`project.videoB.id` when `'dual'`).
- Produces: user-visible "Watched" section; no exports.

- [ ] **Step 1: Add the fetch logic to the script**

Add imports at the top of `<script setup>`:

```ts
import { ref, watch } from 'vue';
import {
  getProgressForVideo,
  mergeDualProgress,
  type UserWatchProgress,
} from '@/services/watchProgressService';
```

Add after the `emit` definition:

```ts
const watchProgress = ref<UserWatchProgress[]>([]);

watch(
  () => props.project,
  async (project) => {
    watchProgress.value = [];
    if (!project) return;
    const requestedId = project.id;
    const rows =
      project.projectType === 'single'
        ? await getProgressForVideo(project.video.id)
        : mergeDualProgress(
            ...(await Promise.all([
              getProgressForVideo(project.videoA.id),
              getProgressForVideo(project.videoB.id),
            ]))
          );
    // ignore stale responses if the user selected another project meanwhile
    if (props.project?.id === requestedId) {
      watchProgress.value = rows;
    }
  },
  { immediate: true }
);
```

(`mergeDualProgress(...(await Promise.all([...])))` spreads the `[a, b]` tuple; if TypeScript complains about spreading, destructure first: `const [a, b] = await Promise.all([...]); rows = mergeDualProgress(a, b);`.)

- [ ] **Step 2: Add the "Watched" section to the template**

Between the Labels `<div>` (ends ~line 74) and the Annotations list `<div class="flex-1 overflow-y-auto min-h-0">` (~line 77):

```html
<!-- Watch coverage per collaborator -->
<div
  v-if="watchProgress.length > 0"
  class="p-4 border-b border-gray-200 dark:border-gray-700"
>
  <h3 class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
    Watched
  </h3>
  <ul class="space-y-2">
    <li
      v-for="w in watchProgress"
      :key="w.userId"
      class="flex items-center gap-2"
    >
      <span class="text-xs text-gray-700 dark:text-gray-200 truncate flex-1">
        {{ w.user.name }}
      </span>
      <div
        class="w-24 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden shrink-0"
      >
        <div
          class="h-full rounded-full bg-blue-500"
          :style="{ width: `${Math.min(100, w.percentWatched)}%` }"
        />
      </div>
      <span
        class="text-xs text-gray-500 dark:text-gray-400 w-9 text-right shrink-0"
      >
        {{ Math.round(w.percentWatched) }}%
      </span>
    </li>
  </ul>
</div>
```

- [ ] **Step 3: Verify it builds and tests still pass**

Run: `npm run build && npm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 4: Manual verification (needs Task 2 applied)**

In `npm run dev`, on the dashboard: select a video whose watch progress exists (watch a bit in the editor first, per Task 5 Step 4). The details sidebar shows a "Watched" section listing each user with a progress bar and percent, sorted highest first; a dual project shows the per-user minimum of the two videos. A video nobody watched shows no section.

- [ ] **Step 5: Commit**

```bash
git add src/components/VideoDetailsPanel.vue
git commit -m "feat: per-collaborator watch coverage in video details sidebar"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full suite + build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 2: End-to-end pass**

Repeat the Task 5/6 manual flows once, in order: watch ~15 s of a single video → pause → reload → confirm resume; check the dashboard sidebar shows your row; repeat briefly for a dual comparison.

- [ ] **Step 3: Update the spec status if anything drifted**

If implementation deviated from `docs/superpowers/specs/2026-07-04-watch-progress-design.md` (e.g., helper location `src/utils/watchedRanges.ts` instead of inside the service), amend the spec and commit with the message `docs: sync watch progress spec with implementation`.
