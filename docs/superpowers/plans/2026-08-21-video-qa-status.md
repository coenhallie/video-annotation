# Video QA Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every video a saved five-value QA status label, settable by any signed-in user who can see the video, shown on the dashboard row, in the details panel and in the editor's annotation rail.

**Architecture:** Three columns on `public.videos` carry the value and its attribution. Writes go through one `SECURITY DEFINER` RPC, `set_video_qa_status`, because the `videos` UPDATE policy is owner-only and row-level security cannot restrict a policy to individual columns. Reads need no new query: the columns ride along on the `select *` the dashboard, details panel and editor already do. The frontend is one pure vocabulary module, one read-only pill component, one editable select component, and three call sites.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API), TypeScript, Tailwind v4, Supabase (PostgREST + PL/pgSQL), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-video-qa-status-design.md`. Read it before Task 1. Where this plan and the spec disagree, the spec wins and the plan is wrong.

## Global Constraints

- The five values, exactly: `not_started`, `in_review`, `failed`, `staging`, `production`. No others, no renames.
- Labels only. Nothing may read `qaStatus` to gate, filter, sort, trigger, deploy or notify. Storing and displaying is the entire feature.
- Migration goes to production **before** any frontend merges. The frontend calls a function that must already exist.
- No em dash (`—`) in any prose, comment, commit message or doc. Use a plain dash.
- No `Co-Authored-By` trailer and no "Generated with Claude Code" footer on commits.
- Comparison (dual) projects get no control anywhere. The column is on `videos` only.
- Shared-link and anonymous views get no control anywhere.
- Visual language is monochrome. The single permitted accent is `text-red-600 dark:text-red-400`, on `FAILED` only.
- Meta token styling, copied verbatim where a token is rendered: `font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400`.
- Eyebrow heading styling, copied verbatim: `text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400`.
- Tests run with `npx vitest run <path>`. The whole suite is `npm test`.
- This repo has no CI. Every task ends with a green test run you executed yourself and read the output of.

## File Structure

| File | Responsibility |
| --- | --- |
| `migrations/20260821_video_qa_status.sql` | Create (Task 1). The three columns, the CHECK constraint, and the RPC with its grants. |
| `src/types/database.ts` | Modify (Task 2). Add `QaStatus` type and the three fields to `DatabaseVideo` and `Video`. |
| `src/utils/qaStatus.ts` | Create (Task 2). Pure vocabulary: ordered value list, display labels, select tone, pill weights, type guard. No Vue, no Supabase. |
| `src/utils/__tests__/qaStatus.test.ts` | Create (Task 2). |
| `src/services/videoService.ts` | Modify (Task 3). Add `setQaStatus`, the only write path. |
| `src/services/__tests__/setQaStatus.test.ts` | Create (Task 3). |
| `src/components/QaStatusPill.vue` | Create (Task 4). Read-only uppercase pill, one fixed width, rendered for all five values. |
| `src/components/__tests__/qaStatusPill.test.ts` | Create (Task 4). |
| `src/components/ProjectListItem.vue` | Modify (Task 4). Render the pill as a fixed-width column at the row's right edge. |
| `src/components/QaStatusSelect.vue` | Create (Task 5). The editable control: native `<select>`, optimistic write, rollback, toast, attribution line. |
| `src/components/__tests__/qaStatusSelect.test.ts` | Create (Task 5). |
| `src/components/VideoDetailsPanel.vue` | Modify (Task 6). Mount the select in a bordered block. |
| `src/components/AnnotationPanel.vue` | Modify (Task 6). Mount the select in a bordered row under the header. |
| `src/views/EditorView.vue` | Modify (Task 6). Pass the loaded video down to `AnnotationPanel`. |

Why two components rather than one with a `readonly` prop: the pill is a static span, the select owns async state, rollback and a toast. Sharing them behind a flag would put a network call inside a component that renders 171 times on the dashboard.

---

### Task 1: Migration, applied and verified against production

**Files:**
- Create: `migrations/20260821_video_qa_status.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.videos."qaStatus"` (text, NOT NULL, default `'not_started'`), `public.videos."qaStatusUpdatedAt"` (timestamptz, nullable), `public.videos."qaStatusUpdatedBy"` (uuid, nullable, FK to `public.users(id)`), and `public.set_video_qa_status(p_video_id uuid, p_status text) RETURNS public.videos`, executable by `authenticated` only.

This task has no Vitest cycle. Its test is the four SQL probes in Step 4, run against production, whose output you paste into the commit message.

- [ ] **Step 1: Write the migration**

Create `migrations/20260821_video_qa_status.sql`:

```sql
-- migrations/20260821_video_qa_status.sql
-- QA completion status per video.
--
-- Five values, ordered as the work flows. `failed` exists because a QA control
-- with no way to say "this did not pass" forces reviewers to leave the video in
-- a state that lies. `not_started` exists because it is what all 171 existing
-- rows are.
--
-- Labels only. Nothing reads this column to gate, filter or trigger anything.
--
-- Design: docs/superpowers/specs/2026-08-21-video-qa-status-design.md

ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS "qaStatus" text NOT NULL DEFAULT 'not_started';

ALTER TABLE public.videos
    DROP CONSTRAINT IF EXISTS videos_qa_status_check;

ALTER TABLE public.videos
    ADD CONSTRAINT videos_qa_status_check
    CHECK ("qaStatus" IN ('not_started', 'in_review', 'failed', 'staging', 'production'));

-- NOT NULL DEFAULT is the load-bearing part, same as annotations.surface: every
-- existing row backfills to a real value. A nullable column renders the control
-- empty on every row and makes each read site invent a fallback.
ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS "qaStatusUpdatedAt" timestamptz;

-- SET NULL, not CASCADE. Deleting a user must never delete the video they last
-- touched.
ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS "qaStatusUpdatedBy" uuid
        REFERENCES public.users(id) ON DELETE SET NULL;

-- The write path.
--
-- Direct UPDATE on videos is auth.uid() = "ownerId". QA is done by people who
-- are not the uploader, and row-level security is row level, not column level:
-- opening the UPDATE policy to `authenticated` would also let any account
-- rename, re-URL or unpublish any video in the system. So the UPDATE policy is
-- left alone and the write goes through this function instead.
CREATE OR REPLACE FUNCTION public.set_video_qa_status(
    p_video_id uuid,
    p_status text
)
RETURNS public.videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_row public.videos;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'QA status requires a signed-in user'
            USING ERRCODE = '42501';
    END IF;

    -- The CHECK constraint would catch this too, but as a constraint violation
    -- rather than something the caller can act on.
    IF p_status NOT IN ('not_started', 'in_review', 'failed', 'staging', 'production') THEN
        RAISE EXCEPTION 'Unknown QA status: %', p_status
            USING ERRCODE = '22023';
    END IF;

    -- SECURITY DEFINER bypasses RLS, so this predicate is the only gate on the
    -- write. It mirrors the three SELECT policies on public.videos as they stand
    -- today: own, public, and member of a public comparison. If those policies
    -- change, this function changes in the same migration.
    UPDATE public.videos v
       SET "qaStatus" = p_status,
           "qaStatusUpdatedAt" = now(),
           "qaStatusUpdatedBy" = v_caller,
           "updatedAt" = now()
     WHERE v.id = p_video_id
       AND (
             v."ownerId" = v_caller
          OR v."isPublic" = true
          OR v.id IN (
                 SELECT c."videoAId" FROM public.comparison_videos c WHERE c."isPublic"
                 UNION
                 SELECT c."videoBId" FROM public.comparison_videos c WHERE c."isPublic"
             )
       )
    RETURNING * INTO v_row;

    -- Not a no-op. A denied write that returns success is the failure mode this
    -- whole function exists to avoid: a policy-gated UPDATE matching no row
    -- returns 2xx with zero rows, which the frontend cannot tell from success.
    --
    -- FOUND is the right test and was verified against this database, not
    -- assumed: an UPDATE ... RETURNING * INTO that matches no row leaves FOUND
    -- false. Do not "simplify" this to v_row.id IS NULL without re-running that
    -- probe.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video % is not visible to the caller', p_video_id
            USING ERRCODE = '42501';
    END IF;

    RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_video_qa_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_video_qa_status(uuid, text) TO authenticated;
```

- [ ] **Step 2: Apply it to production**

This CLI has no `db execute`, and this worktree is not linked, so the invocation needs `--workdir` pointing at the main checkout:

```bash
supabase db query \
  --workdir /Users/coenhallie/Desktop/projects/video-annotation \
  --linked \
  -f migrations/20260821_video_qa_status.sql
```

Expected: no error. Deploys here are manual, so nothing else picks this up.

- [ ] **Step 3: Verify the schema landed**

Write this to a scratch file and run it the same way:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'videos' and column_name ilike 'qaStatus%'
order by column_name;

select count(*) as rows_not_backfilled
from public.videos where "qaStatus" is null;

select proname, prosecdef,
       pg_get_function_identity_arguments(oid) as args
from pg_proc where proname = 'set_video_qa_status';
```

Expected: three columns, `qaStatus` NOT NULL with default `'not_started'::text`; `rows_not_backfilled` = 0; one function, `prosecdef` true, args `p_video_id uuid, p_status text`.

- [ ] **Step 4: Verify the behaviour, including the denial path**

Four probes. These are the actual test for this task, because no Vitest test can reach row-level security. Run each as its own scratch file.

Probe A, a bogus status raises rather than silently doing nothing:

```sql
do $$
begin
  perform public.set_video_qa_status(
    (select id from public.videos limit 1), 'shipped');
  raise exception 'PROBE FAILED: bogus status was accepted';
exception
  when sqlstate '22023' then
    raise notice 'PROBE A OK: bogus status rejected';
end $$;
```

Probe B, an unauthenticated caller raises. `auth.uid()` is null when no JWT claims are set:

```sql
do $$
begin
  perform public.set_video_qa_status(
    (select id from public.videos limit 1), 'staging');
  raise exception 'PROBE FAILED: anonymous caller was accepted';
exception
  when sqlstate '42501' then
    raise notice 'PROBE B OK: anonymous caller rejected';
end $$;
```

Probe C, a signed-in non-owner is rejected on a private video. Pick a private video and a user who does not own it:

```sql
do $$
declare
  v_private uuid;
  v_stranger uuid;
begin
  select v.id, (select u.id from public.users u where u.id <> v."ownerId" limit 1)
    into v_private, v_stranger
    from public.videos v
   where v."isPublic" = false
   limit 1;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_stranger, 'role', 'authenticated')::text,
                     true);

  perform public.set_video_qa_status(v_private, 'staging');
  raise exception 'PROBE FAILED: stranger wrote a private video';
exception
  when sqlstate '42501' then
    raise notice 'PROBE C OK: stranger rejected on a private video';
end $$;
```

Probe D, the happy path writes the value and the attribution, then rolls back so production data is untouched:

```sql
begin;

do $$
declare
  v_id uuid;
  v_owner uuid;
  v_row public.videos;
begin
  select v.id, v."ownerId" into v_id, v_owner from public.videos v limit 1;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_owner, 'role', 'authenticated')::text,
                     true);

  v_row := public.set_video_qa_status(v_id, 'staging');

  if v_row."qaStatus" <> 'staging' then
    raise exception 'PROBE FAILED: status not written';
  end if;
  if v_row."qaStatusUpdatedBy" <> v_owner then
    raise exception 'PROBE FAILED: attribution not written';
  end if;
  if v_row."qaStatusUpdatedAt" is null then
    raise exception 'PROBE FAILED: timestamp not written';
  end if;

  raise notice 'PROBE D OK: value and attribution written';
end $$;

rollback;
```

Expected: all four print their OK notice and none raises PROBE FAILED. If Probe C succeeds instead of raising, stop: the visibility predicate is wrong and the frontend must not ship.

If the `supabase db query` output swallows `raise notice`, convert each probe to insert its result into a temp table and select it, the way the FOUND probe in the spec was run.

- [ ] **Step 5: Commit**

```bash
git add migrations/20260821_video_qa_status.sql
git commit -m "feat(db): add per-video QA status with a guarded write path

Three columns on videos plus set_video_qa_status, a SECURITY DEFINER
function so a reviewer who is not the uploader can set the status without
gaining write access to the rest of the row.

The raise on NOT FOUND is the point: a policy-gated UPDATE that matches no
row returns 2xx with zero rows, which the client cannot tell from success.

Applied to prod and verified: bogus status rejected, anonymous caller
rejected, non-owner rejected on a private video, owner write lands with
attribution."
```

---

### Task 2: Types and the status vocabulary

**Files:**
- Modify: `src/types/database.ts:54-73` (`DatabaseVideo`), `src/types/database.ts:212-230` (`Video`)
- Create: `src/utils/qaStatus.ts`
- Test: `src/utils/__tests__/qaStatus.test.ts`

**Interfaces:**
- Consumes: the columns from Task 1.
- Produces:
  - `type QaStatus = 'not_started' | 'in_review' | 'failed' | 'staging' | 'production'` exported from `src/types/database.ts`
  - `QA_STATUSES: readonly QaStatus[]` (ordered, five entries)
  - `qaStatusLabel(status: QaStatus): string` (uppercase display text)
  - `isQaStatus(value: unknown): value is QaStatus`
  - `qaStatusToneClass(status: QaStatus): string`
  - `qaStatusPillClass(status: QaStatus): string`
  - `interface QaStatusTarget { id: string; qaStatus: QaStatus; qaStatusUpdatedAt?: string }`
  - `Video` and `DatabaseVideo` each gain `qaStatus: QaStatus`, `qaStatusUpdatedAt?: string`, `qaStatusUpdatedBy?: string`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/qaStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  QA_STATUSES,
  isQaStatus,
  qaStatusLabel,
  qaStatusPillClass,
  qaStatusToneClass,
} from '@/utils/qaStatus';

describe('qaStatus vocabulary', () => {
  it('lists the five values in workflow order', () => {
    expect(QA_STATUSES).toEqual([
      'not_started',
      'in_review',
      'failed',
      'staging',
      'production',
    ]);
  });

  it('renders labels as uppercase display text', () => {
    expect(qaStatusLabel('not_started')).toBe('NOT STARTED');
    expect(qaStatusLabel('in_review')).toBe('IN REVIEW');
    expect(qaStatusLabel('failed')).toBe('FAILED');
    expect(qaStatusLabel('staging')).toBe('STAGING');
    expect(qaStatusLabel('production')).toBe('PRODUCTION');
  });

  it('accepts only the five values', () => {
    expect(isQaStatus('staging')).toBe(true);
    expect(isQaStatus('shipped')).toBe(false);
    expect(isQaStatus(null)).toBe(false);
    expect(isQaStatus(undefined)).toBe(false);
    expect(isQaStatus(3)).toBe(false);
  });

  it('gives the accent to failed and to nothing else', () => {
    expect(qaStatusToneClass('failed')).toBe('text-red-600 dark:text-red-400');
    for (const status of QA_STATUSES.filter((s) => s !== 'failed')) {
      expect(qaStatusToneClass(status)).toBe('text-gray-500 dark:text-gray-400');
    }
  });

  it('gives every status a bordered pill treatment', () => {
    for (const status of QA_STATUSES) {
      expect(qaStatusPillClass(status)).toMatch(/\bborder-\S+/);
      expect(qaStatusPillClass(status)).toMatch(/\btext-\S+/);
    }
  });

  // Three weights, not five colours. These two assertions are what stop a later
  // change from quietly turning the column into a rainbow.
  it('fills only production and accents only failed', () => {
    expect(qaStatusPillClass('production')).toContain('bg-gray-900');
    for (const status of QA_STATUSES.filter((s) => s !== 'production')) {
      expect(qaStatusPillClass(status)).not.toContain('bg-');
    }

    expect(qaStatusPillClass('failed')).toContain('text-red-600');
    for (const status of QA_STATUSES.filter((s) => s !== 'failed')) {
      expect(qaStatusPillClass(status)).not.toContain('red');
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/utils/__tests__/qaStatus.test.ts`
Expected: FAIL, cannot resolve `@/utils/qaStatus`.

- [ ] **Step 3: Add the type to `src/types/database.ts`**

Put this next to the existing `AnnotationSurface` type, which is documented the same way:

```ts
/**
 * QA completion status of a video. A saved label and nothing more: no code
 * reads it to gate, filter or trigger anything.
 *
 * `failed` is not in the literal request. It is here because a QA control with
 * no way to say "this did not pass" forces reviewers to leave the video in a
 * state that lies.
 */
export type QaStatus =
  | 'not_started'
  | 'in_review'
  | 'failed'
  | 'staging'
  | 'production';
```

Then add these three fields to **both** `DatabaseVideo` (after `updatedAt`) and `Video` (after `updatedAt`):

```ts
  qaStatus: QaStatus;
  qaStatusUpdatedAt?: string;
  qaStatusUpdatedBy?: string;
```

`qaStatus` is non-optional because the column is `NOT NULL DEFAULT`, so every row PostgREST returns carries it.

- [ ] **Step 4: Write `src/utils/qaStatus.ts`**

```ts
import type { QaStatus } from '@/types/database';

/**
 * The five values in workflow order. This array is the source of truth for the
 * order options appear in the select; it must stay in step with the
 * videos_qa_status_check constraint in migrations/20260821_video_qa_status.sql.
 */
export const QA_STATUSES: readonly QaStatus[] = [
  'not_started',
  'in_review',
  'failed',
  'staging',
  'production',
] as const;

const LABELS: Record<QaStatus, string> = {
  not_started: 'NOT STARTED',
  in_review: 'IN REVIEW',
  failed: 'FAILED',
  staging: 'STAGING',
  production: 'PRODUCTION',
};

export function qaStatusLabel(status: QaStatus): string {
  return LABELS[status];
}

export function isQaStatus(value: unknown): value is QaStatus {
  return (
    typeof value === 'string' && (QA_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Text colour for the select, which sits among grey meta tokens. `failed` gets
 * the one accent the app already uses for destructive and error states.
 */
export function qaStatusToneClass(status: QaStatus): string {
  return status === 'failed'
    ? 'text-red-600 dark:text-red-400'
    : 'text-gray-500 dark:text-gray-400';
}

/**
 * Border, fill and text for the dashboard pill.
 *
 * Three weights, not five colours: recedes (not_started), outlined
 * (in_review, staging, and failed in the accent), filled (production, the
 * terminal state). Five hues would scan marginally faster and would add five
 * accents to an app whose header comment says three were already too many.
 * Weight also survives colour-blind viewing, which hue does not.
 *
 * Production inverts in dark mode. A dark fill on a dark page is invisible.
 */
const PILL_CLASSES: Record<QaStatus, string> = {
  not_started: 'border-gray-200 text-gray-400 dark:border-white/10 dark:text-gray-500',
  in_review: 'border-gray-300 text-gray-500 dark:border-white/15 dark:text-gray-400',
  failed: 'border-red-300 text-red-600 dark:border-red-400/40 dark:text-red-400',
  staging: 'border-gray-300 text-gray-900 dark:border-white/20 dark:text-white',
  production:
    'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900',
};

export function qaStatusPillClass(status: QaStatus): string {
  return PILL_CLASSES[status];
}

/**
 * The narrow shape the select needs, rather than a whole `Video`.
 *
 * EditorView holds the loaded video as `Ref<Partial<Video> | null>`, so a
 * `Video`-typed prop would force a cast at that call site and hide the fact
 * that `qaStatus` really can be absent there. Three fields, all required to be
 * present by the time the control renders.
 */
export interface QaStatusTarget {
  id: string;
  qaStatus: QaStatus;
  qaStatusUpdatedAt?: string;
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/utils/__tests__/qaStatus.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Typecheck, since this task changes shared types**

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: no new errors mentioning `qaStatus`. Record any pre-existing errors and leave them alone.

Making `qaStatus` non-optional on `Video` may surface errors at places that build a `Video` literal, including test fixtures. Fix those by adding `qaStatus: 'not_started'`. Do not make the field optional to silence them: that would reintroduce the nullable-column problem in the type system.

- [ ] **Step 7: Commit**

```bash
git add src/types/database.ts src/utils/qaStatus.ts src/utils/__tests__/qaStatus.test.ts
git commit -m "feat: add the QA status vocabulary

One pure module for the five values, their display text and the single
accent rule, so the token and the select cannot drift apart."
```

---

### Task 3: `VideoService.setQaStatus`

**Files:**
- Modify: `src/services/videoService.ts`
- Test: `src/services/__tests__/setQaStatus.test.ts`

**Interfaces:**
- Consumes: `QaStatus` and `Video` from Task 2; `set_video_qa_status` from Task 1.
- Produces: `VideoService.setQaStatus(videoId: string, status: QaStatus): Promise<Video>`. Resolves with the updated row. Throws on any failure. Never resolves on a rejected write.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/setQaStatus.test.ts`. Note the mocking shape: `videoService.ts` imports the client at module scope, so the mock has to be declared before the dynamic import, exactly as `getAllProjects.test.ts` does it.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: vi.fn(), rpc },
}));
vi.mock('@/services/awsStorageService', () => ({ AwsStorageService: {} }));
vi.mock('@/utils/thumbnailGenerator', () => ({ ThumbnailGenerator: {} }));

beforeEach(() => {
  vi.clearAllMocks();
});

const loadService = async () =>
  (await import('@/services/videoService')).VideoService;

describe('VideoService.setQaStatus', () => {
  it('calls the RPC with the video id and status', async () => {
    rpc.mockResolvedValue({
      data: { id: 'v1', qaStatus: 'staging' },
      error: null,
    });
    const VideoService = await loadService();

    await VideoService.setQaStatus('v1', 'staging');

    expect(rpc).toHaveBeenCalledWith('set_video_qa_status', {
      p_video_id: 'v1',
      p_status: 'staging',
    });
  });

  it('resolves with the updated row', async () => {
    rpc.mockResolvedValue({
      data: {
        id: 'v1',
        qaStatus: 'production',
        qaStatusUpdatedAt: '2026-08-21T10:00:00Z',
        qaStatusUpdatedBy: 'u1',
      },
      error: null,
    });
    const VideoService = await loadService();

    const video = await VideoService.setQaStatus('v1', 'production');

    expect(video.qaStatus).toBe('production');
    expect(video.qaStatusUpdatedBy).toBe('u1');
  });

  // The whole reason the RPC raises instead of relying on a policy: a denied
  // write must never look like a successful one.
  it('throws when the function raises', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Video v9 is not visible to the caller', code: '42501' },
    });
    const VideoService = await loadService();

    await expect(VideoService.setQaStatus('v9', 'staging')).rejects.toThrow(
      /not visible to the caller/
    );
  });

  it('throws when the RPC returns no row and no error', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const VideoService = await loadService();

    await expect(VideoService.setQaStatus('v1', 'staging')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/services/__tests__/setQaStatus.test.ts`
Expected: FAIL, `VideoService.setQaStatus is not a function`.

- [ ] **Step 3: Implement it**

Add to the `VideoService` class in `src/services/videoService.ts`, next to the other single-row methods. Add `QaStatus` to the existing `import type { ... } from '../types/database'` list.

```ts
  /**
   * The only write path for a video's QA status.
   *
   * Not a plain `.update()`: the videos UPDATE policy is auth.uid() = "ownerId",
   * and QA is done by people who are not the uploader. The function is
   * SECURITY DEFINER and raises when the caller cannot see the video, so a
   * denied write arrives here as an error rather than as a silent success.
   */
  static async setQaStatus(videoId: string, status: QaStatus): Promise<Video> {
    const { data, error } = await supabase.rpc('set_video_qa_status', {
      p_video_id: videoId,
      p_status: status,
    });

    if (error) {
      handleServiceError('VideoService.setQaStatus', error);
      throw new Error(error.message);
    }

    if (!data) {
      const missing = new Error('set_video_qa_status returned no row');
      handleServiceError('VideoService.setQaStatus', missing);
      throw missing;
    }

    return data as Video;
  }
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/services/__tests__/setQaStatus.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/videoService.ts src/services/__tests__/setQaStatus.test.ts
git commit -m "feat: add VideoService.setQaStatus

Wraps the RPC and turns a raised exception into a thrown error, so a
rejected write can never be mistaken for a successful one."
```

---

### Task 4: The status pill on the dashboard row

**Files:**
- Create: `src/components/QaStatusPill.vue`
- Test: `src/components/__tests__/qaStatusPill.test.ts`
- Modify: `src/components/ProjectListItem.vue:83-93` (the right edge, after the watch-coverage chip)

**Interfaces:**
- Consumes: `QaStatus` from Task 2, `qaStatusLabel` and `qaStatusPillClass` from Task 2.
- Produces: `<QaStatusPill :status="QaStatus" />`, rendering `<span data-testid="qa-status-pill">` for all five values at a single fixed width.

Read the spec's "The dashboard pill" section before starting. Two things in it are easy to undo by accident: every row shows a pill including `not_started`, and every pill is the same width. The fixed width is the entire reason the column scans; a hug-content pill puts every left edge somewhere different.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/qaStatusPill.test.ts`, following the mounting style of `editorSurfaceTabs.test.ts`: raw `createApp`, jsdom, `data-testid` selectors, no `@vue/test-utils`.

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import QaStatusPill from '@/components/QaStatusPill.vue';
import { QA_STATUSES } from '@/utils/qaStatus';
import type { QaStatus } from '@/types/database';

function mountPill(status: QaStatus) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({ setup: () => () => h(QaStatusPill, { status }) })
  );
  app.mount(root);
  return {
    pill: () => root.querySelector<HTMLElement>('[data-testid="qa-status-pill"]'),
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

describe('QaStatusPill', () => {
  // Not suppressed at not_started, unlike the watch chip. The column exists to
  // tell states apart at a glance, and an empty slot cannot be told from a row
  // whose data has not loaded.
  it('renders a pill for all five values', () => {
    for (const status of QA_STATUSES) {
      const p = mountPill(status);
      expect(p.pill()).not.toBeNull();
      p.unmount();
    }
  });

  it('renders the uppercase label', () => {
    for (const [status, label] of [
      ['not_started', 'NOT STARTED'],
      ['in_review', 'IN REVIEW'],
      ['failed', 'FAILED'],
      ['staging', 'STAGING'],
      ['production', 'PRODUCTION'],
    ] as [QaStatus, string][]) {
      const p = mountPill(status);
      expect(p.pill()?.textContent?.trim()).toBe(label);
      p.unmount();
    }
  });

  // The load-bearing assertion for the column. Without one width, the left
  // edges stagger and you are back to reading row by row.
  it('gives every pill the same fixed width', () => {
    const widths = new Set<string>();
    for (const status of QA_STATUSES) {
      const p = mountPill(status);
      const className = p.pill()?.className ?? '';
      const match = className.match(/\bw-\S+/);
      expect(match).not.toBeNull();
      widths.add(match![0]);
      p.unmount();
    }
    expect(widths.size).toBe(1);
  });

  it('accents only failed and fills only production', () => {
    const failed = mountPill('failed');
    expect(failed.pill()?.className).toContain('text-red-600');
    failed.unmount();

    const production = mountPill('production');
    expect(production.pill()?.className).toContain('bg-gray-900');
    production.unmount();

    for (const status of ['not_started', 'in_review', 'staging'] as QaStatus[]) {
      const p = mountPill(status);
      expect(p.pill()?.className).not.toContain('red');
      expect(p.pill()?.className).not.toContain('bg-gray-900');
      p.unmount();
    }
  });

  it('does not shrink when the row is tight', () => {
    const p = mountPill('production');
    expect(p.pill()?.className).toContain('shrink-0');
    p.unmount();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/components/__tests__/qaStatusPill.test.ts`
Expected: FAIL, cannot resolve `@/components/QaStatusPill.vue`.

- [ ] **Step 3: Write the component**

Create `src/components/QaStatusPill.vue`:

```vue
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
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/__tests__/qaStatusPill.test.ts`
Expected: PASS, 5 tests.

If the width test fails because `NOT STARTED` overflows `w-24` at the 10px mono size, widen to `w-28` in the component and leave the test alone. The test asserts one shared width, not a particular one.

- [ ] **Step 5: Wire it into the dashboard row**

In `src/components/ProjectListItem.vue`, after the watch-coverage `<span>` and before the closing `</div>` of the row, so the pill is the last element and its right edge is the row's right edge:

```vue
    <!-- QA status. Last in the row and fixed width, so both its edges land at
         the same x on every row and the column scans vertically.

         This is a deliberate exception to the note above about flattening the
         row into one meta line "instead of pills competing along both edges".
         One pill, at one edge, in one column. The meta line stays flat and
         nothing returns to the left edge. -->
    <QaStatusPill
      v-if="project.projectType === 'single'"
      :status="project.video.qaStatus"
    />
```

Add the import to `<script setup>`:

```ts
import QaStatusPill from './QaStatusPill.vue';
```

The `projectType === 'single'` guard is required, not defensive: `project.video` does not exist on a dual project, and the column is on `videos` only.

- [ ] **Step 6: Verify the wiring and the whole suite**

Run: `npm test`
Expected: every test passes, including the pre-existing ones.

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 7: Verify the column by eye**

Run: `npm run dev` and open the dashboard with several projects visible.

Check, and treat any miss as a defect:
- Pill left edges and right edges each line up in a single vertical column down the list.
- A dual project leaves a gap in the column rather than shifting its neighbours.
- The title still truncates before it reaches the pill, at a narrow window width too.
- `PRODUCTION` is filled dark with white text in light mode, and filled light with dark text in dark mode. Check both; a dark fill on a dark page is invisible.
- `NOT STARTED` recedes and does not compete with the title.
- `FAILED` is the only red thing in the row.

- [ ] **Step 8: Commit**

```bash
git add src/components/QaStatusPill.vue src/components/__tests__/qaStatusPill.test.ts src/components/ProjectListItem.vue
git commit -m "feat: show QA status as a pill column on the dashboard

Fixed width and last in the row, so both edges align and the column scans
top to bottom. Every row carries one, not_started included: a gap cannot
be told from a row whose data has not loaded.

Three weights rather than five colours. Filled for production, the accent
for failed, outlines for the rest."
```

---

### Task 5: The editable select

**Files:**
- Create: `src/components/QaStatusSelect.vue`
- Test: `src/components/__tests__/qaStatusSelect.test.ts`

**Interfaces:**
- Consumes: `Video` and `QaStatus` from Task 2, `VideoService.setQaStatus` from Task 3, `QA_STATUSES` / `qaStatusLabel` / `qaStatusToneClass` from Task 2, `useNotifications` from `@/composables/useNotifications`, `formatRelativeTime` from `@/utils/relativeTime`.
- Produces: `<QaStatusSelect :video="QaStatusTarget" :updated-by-name="string | undefined" @updated="(video: Video) => void" />`. The select carries `data-testid="qa-status-select"`; the attribution line carries `data-testid="qa-status-attribution"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/qaStatusSelect.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { Video } from '@/types/database';

const setQaStatus = vi.fn();
const addNotification = vi.fn();

vi.mock('@/services/videoService', () => ({
  VideoService: { setQaStatus },
}));
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ addNotification }),
}));

const video = (overrides: Partial<Video> = {}): Video =>
  ({
    id: 'v1',
    title: 'Match 1',
    url: 'http://v',
    videoId: 'aws:abc',
    fps: 30,
    duration: 10,
    totalFrames: 300,
    isPublic: false,
    allowAnnotations: true,
    ownerId: 'u1',
    videoType: 'url',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    qaStatus: 'not_started',
    ...overrides,
  }) as Video;

async function mountSelect(initial: Video, updatedByName?: string) {
  const { default: QaStatusSelect } = await import('@/components/QaStatusSelect.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const updates: Video[] = [];
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(QaStatusSelect, {
          video: initial,
          updatedByName,
          onUpdated: (v: Video) => updates.push(v),
        }),
    })
  );
  app.mount(root);
  return {
    updates,
    select: () => root.querySelector<HTMLSelectElement>('[data-testid="qa-status-select"]')!,
    attribution: () => root.querySelector<HTMLElement>('[data-testid="qa-status-attribution"]'),
    choose: async (value: string) => {
      const el = root.querySelector<HTMLSelectElement>('[data-testid="qa-status-select"]')!;
      el.value = value;
      el.dispatchEvent(new Event('change'));
      await nextTick();
      await Promise.resolve();
      await nextTick();
    },
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('QaStatusSelect', () => {
  it('offers the five values in workflow order', async () => {
    const s = await mountSelect(video());
    expect([...s.select().options].map((o) => o.value)).toEqual([
      'not_started',
      'in_review',
      'failed',
      'staging',
      'production',
    ]);
    s.unmount();
  });

  it('writes the chosen status through the service', async () => {
    setQaStatus.mockResolvedValue(video({ qaStatus: 'staging' }));
    const s = await mountSelect(video());

    await s.choose('staging');

    expect(setQaStatus).toHaveBeenCalledWith('v1', 'staging');
    expect(s.select().value).toBe('staging');
    s.unmount();
  });

  it('emits the updated video so the parent can refresh its copy', async () => {
    const updated = video({ qaStatus: 'staging', qaStatusUpdatedBy: 'u2' });
    setQaStatus.mockResolvedValue(updated);
    const s = await mountSelect(video());

    await s.choose('staging');

    expect(s.updates).toHaveLength(1);
    expect(s.updates[0]?.qaStatus).toBe('staging');
    s.unmount();
  });

  // The optimistic update is what stops a five-value dropdown feeling like a
  // form submission. The rollback is what keeps it honest when the RPC raises.
  it('rolls back and notifies when the write is rejected', async () => {
    setQaStatus.mockRejectedValue(new Error('Video v1 is not visible to the caller'));
    const s = await mountSelect(video({ qaStatus: 'in_review' }));

    await s.choose('production');

    expect(s.select().value).toBe('in_review');
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    expect(s.updates).toHaveLength(0);
    s.unmount();
  });

  it('shows attribution once the status has been set', async () => {
    const s = await mountSelect(
      video({ qaStatus: 'staging', qaStatusUpdatedAt: '2026-08-20T00:00:00Z' }),
      'Alice'
    );
    expect(s.attribution()?.textContent).toContain('Alice');
    s.unmount();
  });

  it('shows no attribution line before anyone has set it', async () => {
    const s = await mountSelect(video());
    expect(s.attribution()).toBeNull();
    s.unmount();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/components/__tests__/qaStatusSelect.test.ts`
Expected: FAIL, cannot resolve `@/components/QaStatusSelect.vue`.

- [ ] **Step 3: Write the component**

Create `src/components/QaStatusSelect.vue`:

```vue
<template>
  <div>
    <div class="flex items-baseline gap-2">
      <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        QA
      </span>

      <!-- A native select, the same choice VideoControls makes for playback
           speed: keyboard, screen reader and touch behaviour come free, and it
           needs no popover, no menu and no outside-click handling. Borderless
           until hover and focus, so at rest it reads as one more meta token
           that happens to be editable. -->
      <select
        data-testid="qa-status-select"
        :value="current"
        :disabled="saving"
        aria-label="QA status"
        :class="[
          'ml-auto cursor-pointer appearance-none rounded border border-transparent bg-transparent py-0.5 pl-1 pr-1 font-mono text-[10px] tracking-wider transition-colors',
          'hover:border-gray-200 focus:border-gray-300 focus:outline-none dark:hover:border-white/10 dark:focus:border-white/20',
          'disabled:cursor-not-allowed disabled:opacity-40',
          qaStatusToneClass(current),
        ]"
        @change="onChange"
      >
        <option
          v-for="status in QA_STATUSES"
          :key="status"
          :value="status"
        >
          {{ qaStatusLabel(status) }}
        </option>
      </select>
    </div>

    <!-- Who last touched it. A status with no author is unattributable in a
         tool several people share. -->
    <p
      v-if="attribution"
      data-testid="qa-status-attribution"
      class="mt-1 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
    >
      {{ attribution }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { QaStatus, Video } from '@/types/database';
import type { QaStatusTarget } from '@/utils/qaStatus';
import {
  QA_STATUSES,
  isQaStatus,
  qaStatusLabel,
  qaStatusToneClass,
} from '@/utils/qaStatus';
import { VideoService } from '@/services/videoService';
import { useNotifications } from '@/composables/useNotifications';
import { formatRelativeTime } from '@/utils/relativeTime';

const props = defineProps<{
  video: QaStatusTarget;
  updatedByName?: string | undefined;
}>();

const emit = defineEmits<{ updated: [Video] }>();

const { addNotification } = useNotifications();

const current = ref<QaStatus>(props.video.qaStatus);
const updatedAt = ref<string | undefined>(props.video.qaStatusUpdatedAt);
const saving = ref(false);

watch(
  () => props.video.id,
  () => {
    current.value = props.video.qaStatus;
    updatedAt.value = props.video.qaStatusUpdatedAt;
  }
);

const attribution = computed(() => {
  if (!updatedAt.value) return '';
  const who = props.updatedByName ? `SET BY ${props.updatedByName}` : 'SET';
  return `${who} · ${formatRelativeTime(updatedAt.value)}`;
});

async function onChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value;
  // A guard rather than a cast: the DOM hands back a string, and the one place
  // that turns a string into a QaStatus should be the module that owns the
  // vocabulary.
  if (!isQaStatus(raw)) return;

  const next = raw;
  const previous = current.value;
  if (next === previous) return;

  // Optimistic: the value moves now, and moves back if the write is refused.
  current.value = next;
  saving.value = true;

  try {
    const updated = await VideoService.setQaStatus(props.video.id, next);
    current.value = updated.qaStatus;
    updatedAt.value = updated.qaStatusUpdatedAt;
    emit('updated', updated);
  } catch (error) {
    current.value = previous;
    addNotification({
      type: 'error',
      title: 'Could not save QA status',
      message: error instanceof Error ? error.message : undefined,
    });
  } finally {
    saving.value = false;
  }
}
</script>
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/__tests__/qaStatusSelect.test.ts`
Expected: PASS, 6 tests.

If the rollback test fails because the rejected promise has not settled by the time the assertion runs, add one more `await nextTick()` inside `choose`. Do not weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/components/QaStatusSelect.vue src/components/__tests__/qaStatusSelect.test.ts
git commit -m "feat: add the QA status select

Native select styled as an editable meta token. Optimistic, with a
rollback and a toast when the RPC refuses the write."
```

---

### Task 6: Mount the select in the details panel and the editor rail

**Files:**
- Modify: `src/components/VideoDetailsPanel.vue` (after the stat row, before the Watched block)
- Modify: `src/components/AnnotationPanel.vue:371` (after the header, before the category filter)
- Modify: `src/views/EditorView.vue` (pass the loaded video to `AnnotationPanel`)

**Interfaces:**
- Consumes: `QaStatusSelect` from Task 5.
- Produces: no new exports. `AnnotationPanel` gains one prop, `video: QaStatusTarget | null`, defaulting to `null`.

- [ ] **Step 1: Mount it in the details panel**

In `src/components/VideoDetailsPanel.vue`, immediately after the stat row `div` and before the watch-coverage block, add a block matching their border rhythm:

```vue
    <!-- QA status. Its own bordered block, matching the Watched block below:
         one row of per-video state per block. -->
    <div
      v-if="project.projectType === 'single'"
      class="border-b border-gray-200 px-4 py-3 dark:border-white/10"
    >
      <QaStatusSelect
        :video="project.video"
        :updated-by-name="project.owner?.name"
        @updated="onQaStatusUpdated"
      />
    </div>
```

Add to `<script setup>`:

```ts
import QaStatusSelect from './QaStatusSelect.vue';
import type { Video } from '../types/database';

// Keep the panel's own copy in step, so closing and reopening it does not show
// the value the row was loaded with.
function onQaStatusUpdated(updated: Video) {
  if (props.project.projectType === 'single') {
    Object.assign(props.project.video, updated);
  }
}
```

`updatedByName` passes `project.owner?.name`, which is the video's owner, not necessarily the person who set the status. That is a knowingly approximate label while `qaStatusUpdatedBy` has no name lookup: `fetchOwners` is keyed on owner ids only. If the two differ often in practice, resolving `qaStatusUpdatedBy` through `fetchOwners` is the follow-up. Leave the approximation and this comment in place rather than silently showing the wrong name with no note.

- [ ] **Step 2: Verify the details panel by eye**

Run: `npm run dev`, open the dashboard, click a single-video project to open the details panel.

Check, and treat any miss as a defect:
- The QA block sits between the annotation/comment stat row and the Watched block, with the same `border-b` and the same `px-4 py-3`.
- At rest the select shows no border and reads as a meta token, not a form field.
- Hover and keyboard focus both reveal a border.
- Changing the value persists across a page reload.
- `FAILED` is the only value that is not grey.
- Dark mode is checked as well as light.
- Opening a dual project shows no QA block at all.

- [ ] **Step 3: Add the prop to the annotation panel and mount it**

In `src/components/AnnotationPanel.vue`, add to `defineProps`:

```ts
  /**
   * The video this rail belongs to, for the QA status control. EditorView
   * passes null in dual mode and in shared views, and the control does not
   * render without it.
   */
  video: {
    type: Object as PropType<QaStatusTarget | null>,
    default: null,
  },
```

Add `import type { QaStatusTarget } from '@/utils/qaStatus';`, then mount the control right after the `</header>` and before the category filter block:

```vue
    <!-- QA status. Here rather than in EditorHeader: that row is AppHeader,
         shared with the dashboard, and it holds identity plus three icon
         buttons under a stated rule of one hover colour for all of them. A
         five-value dropdown there would be the loudest thing in the bar. The
         rail is the editor's per-video sidebar, so the control lives in the
         same kind of block VideoDetailsPanel gives it. -->
    <div
      v-if="video && !isDualMode && canAnnotate"
      class="shrink-0 border-b border-gray-200 px-4 pb-3 dark:border-white/10"
    >
      <QaStatusSelect :video="video" />
    </div>
```

Add the import:

```ts
import QaStatusSelect from './QaStatusSelect.vue';
```

`canAnnotate` is already false for signed-out visitors and for view-only shares, so it carries most of the hide rule. The rest of it lives in the parent, in Step 4, because that is where share state actually is.

Do not reach for the `isSharedVideo` value the panel appears to receive. `EditorView.vue:1768` passes `:is-shared-video`, but `AnnotationPanel` never declares that prop, so it is a fallthrough attribute landing on the root element and is not readable in the template. Leave that alone; it is out of scope.

- [ ] **Step 4: Pass the video down from the editor**

The ref holding the loaded video is `currentVideoObject`, typed `Ref<Partial<Video> | null>` (`src/composables/useVideoEventHandlers.ts:59`). Partial, so it cannot be bound directly. Add a computed in `src/views/EditorView.vue` that both narrows it and applies the share rule:

```ts
// The QA control's target, or null when it must not render. Shared and
// anonymous viewers are outside the QA process, and the RPC would refuse them
// anyway, so hiding it beats showing a control that always fails.
const qaStatusTarget = computed<QaStatusTarget | null>(() => {
  if (isSharedVideo.value || isSharedComparison.value) return null;
  const video = currentVideoObject.value;
  if (!video?.id || !video.qaStatus) return null;
  return {
    id: video.id,
    qaStatus: video.qaStatus,
    qaStatusUpdatedAt: video.qaStatusUpdatedAt,
  };
});
```

Add `import type { QaStatusTarget } from '@/utils/qaStatus';` and make sure `computed` is in the existing `vue` import.

Then bind it on the `<AnnotationPanel>` at `src/views/EditorView.vue:1750`, next to the existing `:video-id`:

```vue
            :video="qaStatusTarget"
```

Do not introduce a fetch. The row is already in memory, and a second query for it is the one thing this design set out to avoid.

If `isSharedVideo` or `isSharedComparison` are not in scope at that point in the file, they are: both are already used at `EditorView.vue:1759` and `1768`.

- [ ] **Step 5: Verify the editor by eye**

Run: `npm run dev`, open a single video in the editor.

Check:
- The QA row sits directly under the "Annotations 12 Labels" header, above the category filter, with the same horizontal padding as the header.
- The select shows the same value the dashboard row shows, and changing it in one place and reloading shows the change in the other.
- Both editor tabs, Video and Pipeline output, show the same value. The status describes the match, not the surface.
- A dual comparison shows no QA row.
- A shared link opened in a private window shows no QA row.

- [ ] **Step 6: Run the whole suite and typecheck**

Run: `npm test`
Expected: all tests pass.

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: no new errors.

Run: `npx eslint src/components/QaStatusSelect.vue src/components/QaStatusPill.vue src/components/ProjectListItem.vue src/components/VideoDetailsPanel.vue src/components/AnnotationPanel.vue src/services/videoService.ts src/utils/qaStatus.ts`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/VideoDetailsPanel.vue src/components/AnnotationPanel.vue src/views/EditorView.vue
git commit -m "feat: put the QA status control in the details panel and the rail

Deliberately not in EditorHeader: that row is AppHeader, and a five-value
dropdown next to three one-colour icon buttons would be the loudest thing
in it. The rail is the editor's version of the details panel."
```

---

## Done when

- All six tasks committed, `npm test` green, `vue-tsc` and `eslint` clean.
- The four SQL probes from Task 1 passed against production, with Probe C confirming a non-owner is refused on a private video.
- Setting a status in the editor and seeing it on the dashboard row after a reload, in both light and dark mode, with the pill column aligned down the list.

## Deliberately not built

Filtering or sorting the dashboard by status, realtime sync between open clients, a status history table, comparison-project support, and any connection between a label and a real deployment. All named in the spec's out-of-scope list. If a task seems to need one of them, the task is wrong.

## Known follow-ups, not in this plan

- `qaStatusUpdatedBy` has no name lookup, so the attribution line shows the video's owner. Resolving it properly means extending `fetchOwners` to take arbitrary user ids.
- `jsdom` is used by the component tests via `// @vitest-environment jsdom` but is not a declared devDependency; it currently resolves transitively through `netlify-cli`. If a component test fails to find it, `npm i -D jsdom` is the fix, in its own commit.
