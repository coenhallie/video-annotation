# Video QA Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every video a saved five-value QA status label, settable by any signed-in user who can see the video, shown on the dashboard row, in the details panel and in the editor's annotation rail.

**Architecture:** Three columns on `public.videos` carry the value and its attribution. Writes go through one `SECURITY DEFINER` RPC, `set_video_qa_status`, because the `videos` UPDATE policy is owner-only and row-level security cannot restrict a policy to individual columns. Reads need no new query: the columns ride along on the `select *` the dashboard, details panel and editor already do. The frontend is one pure vocabulary module, one read-only token component, one editable select component, and three call sites.

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
| `src/utils/qaStatus.ts` | Create (Task 2). Pure vocabulary: ordered value list, display labels, accent rule, type guard. No Vue, no Supabase. |
| `src/utils/__tests__/qaStatus.test.ts` | Create (Task 2). |
| `src/services/videoService.ts` | Modify (Task 3). Add `setQaStatus`, the only write path. |
| `src/services/__tests__/setQaStatus.test.ts` | Create (Task 3). |
| `src/components/QaStatusToken.vue` | Create (Task 4). Read-only uppercase token. Renders nothing at `not_started`. |
| `src/components/__tests__/qaStatusToken.test.ts` | Create (Task 4). |
| `src/components/ProjectListItem.vue` | Modify (Task 4). Render the token in the existing mono meta line. |
| `src/components/QaStatusSelect.vue` | Create (Task 5). The editable control: native `<select>`, optimistic write, rollback, toast, attribution line. |
| `src/components/__tests__/qaStatusSelect.test.ts` | Create (Task 5). |
| `src/components/VideoDetailsPanel.vue` | Modify (Task 6). Mount the select in a bordered block. |
| `src/components/AnnotationPanel.vue` | Modify (Task 6). Mount the select in a bordered row under the header. |
| `src/views/EditorView.vue` | Modify (Task 6). Pass the loaded video down to `AnnotationPanel`. |

Why two components rather than one with a `readonly` prop: the token is a text span with a visibility rule, the select owns async state, rollback and a toast. Sharing them behind a flag would put a network call inside a component that renders 171 times on the dashboard.

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
 * The app is deliberately monochrome, so this returns the same grey as every
 * other meta token for four of the five values. `failed` gets the one accent
 * the app already uses for destructive and error states, because it is the only
 * status that has to catch the eye in a list of 171 rows.
 */
export function qaStatusToneClass(status: QaStatus): string {
  return status === 'failed'
    ? 'text-red-600 dark:text-red-400'
    : 'text-gray-500 dark:text-gray-400';
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
Expected: PASS, 4 tests.

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

### Task 4: The read-only token on the dashboard row

**Files:**
- Create: `src/components/QaStatusToken.vue`
- Test: `src/components/__tests__/qaStatusToken.test.ts`
- Modify: `src/components/ProjectListItem.vue:50-81` (the mono meta line)

**Interfaces:**
- Consumes: `QaStatus`, `qaStatusLabel`, `qaStatusToneClass` from Task 2.
- Produces: `<QaStatusToken :status="QaStatus" />`. Renders a `<span data-testid="qa-status-token">` for four values and nothing at all for `not_started`.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/qaStatusToken.test.ts`. This follows the mounting style of `editorSurfaceTabs.test.ts`: raw `createApp`, jsdom, `data-testid` selectors, no `@vue/test-utils`.

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import QaStatusToken from '@/components/QaStatusToken.vue';
import type { QaStatus } from '@/types/database';

function mountToken(status: QaStatus) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({ setup: () => () => h(QaStatusToken, { status }) })
  );
  app.mount(root);
  return {
    token: () => root.querySelector<HTMLElement>('[data-testid="qa-status-token"]'),
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

describe('QaStatusToken', () => {
  // Suppressed at not_started for the same reason the watch chip is suppressed
  // at 0: 171 rows shouting NOT STARTED says less than no mark at all.
  it('renders nothing at not_started', () => {
    const t = mountToken('not_started');
    expect(t.token()).toBeNull();
    t.unmount();
  });

  it('renders the uppercase label for the other four values', () => {
    for (const [status, label] of [
      ['in_review', 'IN REVIEW'],
      ['failed', 'FAILED'],
      ['staging', 'STAGING'],
      ['production', 'PRODUCTION'],
    ] as [QaStatus, string][]) {
      const t = mountToken(status);
      expect(t.token()?.textContent?.trim()).toBe(label);
      t.unmount();
    }
  });

  it('gives failed the accent and the others the meta grey', () => {
    const failed = mountToken('failed');
    expect(failed.token()?.className).toContain('text-red-600');
    failed.unmount();

    const staging = mountToken('staging');
    expect(staging.token()?.className).toContain('text-gray-500');
    expect(staging.token()?.className).not.toContain('text-red-600');
    staging.unmount();
  });

  it('uses the mono meta token type scale', () => {
    const t = mountToken('production');
    expect(t.token()?.className).toContain('font-mono');
    expect(t.token()?.className).toContain('text-[10px]');
    t.unmount();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/components/__tests__/qaStatusToken.test.ts`
Expected: FAIL, cannot resolve `@/components/QaStatusToken.vue`.

- [ ] **Step 3: Write the component**

Create `src/components/QaStatusToken.vue`:

```vue
<template>
  <!-- Hidden at not_started, following the watch-coverage chip's rule directly
       above it in ProjectListItem: an unstarted video is better said by no mark
       than by every row in the list shouting NOT STARTED. -->
  <span
    v-if="status !== 'not_started'"
    data-testid="qa-status-token"
    :class="['font-mono text-[10px] tracking-wider', qaStatusToneClass(status)]"
    :title="`QA status: ${qaStatusLabel(status)}`"
  >
    {{ qaStatusLabel(status) }}
  </span>
</template>

<script setup lang="ts">
import type { QaStatus } from '@/types/database';
import { qaStatusLabel, qaStatusToneClass } from '@/utils/qaStatus';

defineProps<{ status: QaStatus }>();
</script>
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/__tests__/qaStatusToken.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it into the dashboard row**

In `src/components/ProjectListItem.vue`, inside the mono meta line, after the `commentCount` span and before the closing `</div>` of that line:

```vue
        <QaStatusToken
          v-if="project.projectType === 'single'"
          :status="project.video.qaStatus"
        />
```

Add the import to the `<script setup>` block:

```ts
import QaStatusToken from './QaStatusToken.vue';
```

The `projectType === 'single'` guard is required, not defensive: `project.video` does not exist on a dual project, and the column is on `videos` only.

- [ ] **Step 6: Verify the wiring and the whole suite**

Run: `npm test`
Expected: every test passes, including the pre-existing ones.

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/QaStatusToken.vue src/components/__tests__/qaStatusToken.test.ts src/components/ProjectListItem.vue
git commit -m "feat: show QA status on the dashboard row

Read-only token in the existing mono meta line, hidden at not_started the
way the watch chip is hidden at zero. Dual projects render nothing: the
column is on videos."
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

Run: `npx eslint src/components/QaStatusSelect.vue src/components/QaStatusToken.vue src/components/ProjectListItem.vue src/components/VideoDetailsPanel.vue src/components/AnnotationPanel.vue src/services/videoService.ts src/utils/qaStatus.ts`
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
- Setting a status in the editor and seeing it on the dashboard row after a reload, in both light and dark mode.

## Deliberately not built

Filtering or sorting the dashboard by status, realtime sync between open clients, a status history table, comparison-project support, and any connection between a label and a real deployment. All named in the spec's out-of-scope list. If a task seems to need one of them, the task is wrong.

## Known follow-ups, not in this plan

- `qaStatusUpdatedBy` has no name lookup, so the attribution line shows the video's owner. Resolving it properly means extending `fetchOwners` to take arbitrary user ids.
- `jsdom` is used by the component tests via `// @vitest-environment jsdom` but is not a declared devDependency; it currently resolves transitively through `netlify-cli`. If a component test fails to find it, `npm i -D jsdom` is the fix, in its own commit.
