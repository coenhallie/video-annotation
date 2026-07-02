# Shared Video Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-opening project modal with a dedicated dashboard landing page where any authenticated user browses all users' videos (uploads, URL, and AWS/pipeline) with their labels — filterable to "my videos" — and selecting a video opens the annotation workspace at its own route; plus close the pre-existing "no access control" hole with owner-gated RLS.

**Architecture:** The app moves from "single screen + modal" to "library landing page (`/`) → editor (`/video/:id`, `/comparison/:id`)". The current `DashboardView.vue` (an annotation workspace) is extracted to `EditorView.vue`; a new lean `DashboardView.vue` becomes the library, reusing the presentation components lifted out of the retired `ProjectManagementModal.vue`. A scope-aware service layer (`getAllProjects({ scope })`) drops the owner filter for `scope: 'all'`, batches counts, and enriches with owner info. Backend RLS is enabled with owner-gated writes.

**Tech Stack:** Vue 3 (`<script setup>`), Vue Router 4 (`createWebHistory`), Pinia, Supabase JS v2, Keycloak SSO, Tailwind v4, Vite 7, TypeScript, Vitest (introduced in Phase 0).

## Global Constraints

- Supabase client is the singleton exported from `@/composables/useSupabase` (`supabase`). Never construct a new client.
- Ownership columns differ by table: `videos.ownerId`, `comparison_videos.userId`, `folders.owner_id`, `project_folders` (snake_case). Copy these exactly.
- AWS/pipeline videos are discriminated **only** by `videoId` starting with `aws:`. Use `VideoService.isAwsVideo(video)` — never re-implement the check.
- Current user identity comes from `useAuth()` (`const { user } = useAuth()`), a module-singleton composable — there is no Pinia auth store. `user.value.id` is the owner id.
- The `Project` view model is the union type in `src/types/project.ts` (`projectType: 'single' | 'dual'`). Do not change its existing shape; only extend it additively.
- No secrets in the repo. The anon key and Supabase URL live in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). RLS SQL runs against the Supabase project, not committed with credentials.
- Path alias `@/` maps to `src/`.
- Commit after every task with a `feat:`/`chore:`/`refactor:` prefixed message.

---

## Phase 0 — Test tooling

### Task 0: Add Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/services/__tests__/smoke.test.ts` (temporary; deleted at end of task)

**Interfaces:**
- Produces: an `npm test` script and a working Vitest runner used by all Phase 2 tasks.

- [ ] **Step 1: Install Vitest**

Run:
```bash
npm install -D vitest@^2
```
Expected: adds `vitest` to `devDependencies`, no peer errors.

- [ ] **Step 2: Add the test script**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Add a smoke test**

Create `src/services/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest wiring', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm src/services/__tests__/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit testing"
```

---

## Phase 1 — Backend access control (RLS)

> **BLOCKER — read before starting.** The policy design depends on one unverified fact: does the identity in an authenticated user's Supabase JWT equal the stored `ownerId` (a **Keycloak** UUID after `migrations/20260107_auth_migration.sql`)? Task 1.0 verifies this and selects the owner-key expression used by every later policy. Do **not** skip it. Enabling RLS and revoking anon grants happens **last** (Task 1.4) so a wrong guess cannot lock out the running app.

### Task 1.0: Verify JWT identity → ownerId mapping

**Files:**
- Create: `docs/superpowers/notes/rls-identity-finding.md`

**Interfaces:**
- Produces: `OWNER_KEY_SQL` — the exact SQL expression that yields the current caller's owner id. Every policy in Tasks 1.1–1.3 substitutes this verbatim. One of:
  - `(select auth.uid())` — if JWT `sub` equals `ownerId`.
  - `(current_setting('request.jwt.claims', true)::json ->> '<claim>')` — if a custom claim carries the Keycloak sub.
  - `SERVICE_PROXY` — sentinel meaning no JWT claim matches `ownerId`; triggers the fallback note in Task 1.3.

- [ ] **Step 1: Obtain one authenticated JWT**

Ask the user to log in to the app, open browser devtools console on the app tab, and run:
```js
JSON.parse(localStorage.getItem('supabase.auth.token')).access_token ?? JSON.parse(localStorage.getItem('sb-<ref>-auth-token')).access_token
```
(The storage key is `supabase.auth.token` per `src/composables/useSupabase.ts`; if absent, list `Object.keys(localStorage)` and pick the `*-auth-token` entry.) Have them paste the token string.

- [ ] **Step 2: Decode the claims**

Run (paste the token as `$JWT`):
```bash
JWT="<pasted token>"
echo "$JWT" | cut -d. -f2 | tr '_-' '/+' | base64 -D 2>/dev/null | python3 -m json.tool
```
Expected: JSON with `sub`, `role`, possibly `user_metadata` / `app_metadata`. Record `sub` and any Keycloak-looking UUID claims.

- [ ] **Step 3: Compare against a real ownerId**

Read a real owner id (non-destructive, anon key already grants read):
```bash
URL=$(grep VITE_SUPABASE_URL .env | sed -E 's/.*="?([^"]*)"?/\1/')
KEY=$(grep VITE_SUPABASE_ANON_KEY .env | sed -E 's/.*="?([^"]*)"?/\1/')
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "$URL/rest/v1/videos?select=ownerId&limit=5"
```
Compare the JWT `sub` (and any custom claim) to these `ownerId` values for the logged-in user's own videos.

- [ ] **Step 4: Record the finding and set `OWNER_KEY_SQL`**

Write `docs/superpowers/notes/rls-identity-finding.md` stating: the decoded claim set (redact the raw token), which claim matched `ownerId`, and the resulting `OWNER_KEY_SQL` (one of the three forms above). Commit:
```bash
git add docs/superpowers/notes/rls-identity-finding.md
git commit -m "docs: record RLS JWT identity finding"
```

### Task 1.1: Author read (SELECT) policies

**Files:**
- Create: `supabase/policies/01_enable_and_select.sql`

**Interfaces:**
- Consumes: `OWNER_KEY_SQL` from Task 1.0.
- Produces: SQL that (a) enables RLS, (b) grants authenticated users read on all shared tables, (c) preserves the anon share-link read path. **Not yet applied** — application is Task 1.4.

- [ ] **Step 1: Write the SELECT policy file**

Create `supabase/policies/01_enable_and_select.sql`. Authenticated users can read everything (the shared-library goal); anon can read only public videos/comparisons and their annotations (the existing share-link flow):
```sql
-- Shared Video Dashboard: enable RLS + SELECT policies
alter table public.videos enable row level security;
alter table public.comparison_videos enable row level security;
alter table public.annotations enable row level security;
alter table public.annotation_labels enable row level security;
alter table public.annotation_comments enable row level security;
alter table public.labels enable row level security;
alter table public.folders enable row level security;
alter table public.project_folders enable row level security;
alter table public.anonymous_sessions enable row level security;

-- Authenticated: read everything
create policy "auth read videos" on public.videos
  for select to authenticated using (true);
create policy "auth read comparison_videos" on public.comparison_videos
  for select to authenticated using (true);
create policy "auth read annotations" on public.annotations
  for select to authenticated using (true);
create policy "auth read annotation_labels" on public.annotation_labels
  for select to authenticated using (true);
create policy "auth read annotation_comments" on public.annotation_comments
  for select to authenticated using (true);
create policy "auth read labels" on public.labels
  for select to authenticated using (true);
-- folders are a personal layer; owner-only read
create policy "auth read own folders" on public.folders
  for select to authenticated using (owner_id = OWNER_KEY_SQL);
create policy "auth read own project_folders" on public.project_folders
  for select to authenticated using (
    folder_id in (select id from public.folders where owner_id = OWNER_KEY_SQL)
  );

-- Anon (share-link path): only public content
create policy "anon read public videos" on public.videos
  for select to anon using ("isPublic" = true);
create policy "anon read public comparisons" on public.comparison_videos
  for select to anon using ("isPublic" = true);
create policy "anon read annotations of public content" on public.annotations
  for select to anon using (
    "videoId" in (select id from public.videos where "isPublic" = true)
    or "comparisonVideoId" in (select id from public.comparison_videos where "isPublic" = true)
  );
create policy "anon read comments of public content" on public.annotation_comments
  for select to anon using (
    "annotationId" in (
      select id from public.annotations
      where "videoId" in (select id from public.videos where "isPublic" = true)
         or "comparisonVideoId" in (select id from public.comparison_videos where "isPublic" = true)
    )
  );
create policy "anon read anonymous_sessions" on public.anonymous_sessions
  for select to anon using (true);
```
Replace every `OWNER_KEY_SQL` token with the expression from Task 1.0. (If Task 1.0 yielded `SERVICE_PROXY`, use `false` for the folder owner checks here — folders become invisible to anon and read-only via proxy — and see Task 1.3.)

- [ ] **Step 2: Commit (not yet applied)**

```bash
git add supabase/policies/01_enable_and_select.sql
git commit -m "feat: add RLS SELECT policies (not yet applied)"
```

### Task 1.2: Author write policies for collaborative tables

**Files:**
- Create: `supabase/policies/02_write_collab.sql`

**Interfaces:**
- Consumes: `OWNER_KEY_SQL`.
- Produces: INSERT/UPDATE/DELETE policies for annotations, labels, comments (any authenticated user may add; only the author may modify/delete their own rows).

- [ ] **Step 1: Write the collaborative write policies**

Create `supabase/policies/02_write_collab.sql`:
```sql
-- Any authenticated user may create annotations/labels/comments (collaboration)
create policy "auth insert annotations" on public.annotations
  for insert to authenticated with check ("userId" = OWNER_KEY_SQL);
create policy "auth modify own annotations" on public.annotations
  for update to authenticated using ("userId" = OWNER_KEY_SQL);
create policy "auth delete own annotations" on public.annotations
  for delete to authenticated using ("userId" = OWNER_KEY_SQL);

create policy "auth insert annotation_labels" on public.annotation_labels
  for insert to authenticated with check (
    "annotationId" in (select id from public.annotations where "userId" = OWNER_KEY_SQL)
  );
create policy "auth delete own annotation_labels" on public.annotation_labels
  for delete to authenticated using (
    "annotationId" in (select id from public.annotations where "userId" = OWNER_KEY_SQL)
  );

create policy "auth insert labels" on public.labels
  for insert to authenticated with check ("userId" = OWNER_KEY_SQL);
create policy "auth modify own labels" on public.labels
  for update to authenticated using ("userId" = OWNER_KEY_SQL);
create policy "auth delete own labels" on public.labels
  for delete to authenticated using ("userId" = OWNER_KEY_SQL);

create policy "auth insert comments" on public.annotation_comments
  for insert to authenticated with check ("userId" = OWNER_KEY_SQL);
create policy "auth modify own comments" on public.annotation_comments
  for update to authenticated using ("userId" = OWNER_KEY_SQL);
create policy "auth delete own comments" on public.annotation_comments
  for delete to authenticated using ("userId" = OWNER_KEY_SQL);
```
Note: anonymous commenting (via `anonymous_sessions`) currently uses the anon role. If anon commenting must keep working, add an `anon insert comments` policy mirroring the share-link gate from the spec (§6); if anonymous commenting is not required for this feature, leave it out. Confirm with the user during execution.

- [ ] **Step 2: Commit**

```bash
git add supabase/policies/02_write_collab.sql
git commit -m "feat: add RLS write policies for collaborative tables (not yet applied)"
```

### Task 1.3: Author owner-gated write policies for owned entities

**Files:**
- Create: `supabase/policies/03_write_owned.sql`

**Interfaces:**
- Consumes: `OWNER_KEY_SQL`.
- Produces: UPDATE/DELETE restricted to the owner for `videos`, `comparison_videos`, `folders`, `project_folders`; INSERT allowed for authenticated with owner = caller.

- [ ] **Step 1: Write the owned-entity policies**

Create `supabase/policies/03_write_owned.sql`:
```sql
create policy "auth insert videos" on public.videos
  for insert to authenticated with check ("ownerId" = OWNER_KEY_SQL);
create policy "owner update videos" on public.videos
  for update to authenticated using ("ownerId" = OWNER_KEY_SQL);
create policy "owner delete videos" on public.videos
  for delete to authenticated using ("ownerId" = OWNER_KEY_SQL);

create policy "auth insert comparison_videos" on public.comparison_videos
  for insert to authenticated with check ("userId" = OWNER_KEY_SQL);
create policy "owner update comparison_videos" on public.comparison_videos
  for update to authenticated using ("userId" = OWNER_KEY_SQL);
create policy "owner delete comparison_videos" on public.comparison_videos
  for delete to authenticated using ("userId" = OWNER_KEY_SQL);

create policy "owner all folders" on public.folders
  for all to authenticated using (owner_id = OWNER_KEY_SQL) with check (owner_id = OWNER_KEY_SQL);
create policy "owner all project_folders" on public.project_folders
  for all to authenticated using (
    folder_id in (select id from public.folders where owner_id = OWNER_KEY_SQL)
  ) with check (
    folder_id in (select id from public.folders where owner_id = OWNER_KEY_SQL)
  );
```

- [ ] **Step 2: Handle the AWS-video write exception**

AWS videos are updated (presigned-URL refresh via `refreshAwsVideoUrl`) by **any** user who opens them, not just the owner — so an owner-only UPDATE on `videos` would break URL refresh for non-owners. Add a narrow allowance to `03_write_owned.sql`:
```sql
-- Allow any authenticated user to refresh the presigned URL of an AWS video
-- (they update only the url column; broader owner rule still applies to non-AWS rows).
create policy "auth refresh aws video url" on public.videos
  for update to authenticated
  using ("videoId" like 'aws:%')
  with check ("videoId" like 'aws:%');
```
(Column-level restriction to `url` is not expressible in a policy; this intentionally lets any authenticated user update AWS-video rows. Acceptable because AWS rows carry only pipeline output, no user-authored content. Note this tradeoff in the commit body.)

- [ ] **Step 3: Service-proxy fallback (only if Task 1.0 = `SERVICE_PROXY`)**

If no JWT claim matches `ownerId`, RLS cannot express ownership. In that case: keep `01_enable_and_select.sql` (reads are role-based, no owner match needed), do **not** create `02`/`03` owner-gated policies, and instead create `netlify/functions/owned-write.cjs` — a service-role proxy that validates the caller's Keycloak token, maps it to `ownerId`, and performs UPDATE/DELETE with the service key. Writing that proxy is a separate task; stop and flag to the user, because it changes the client mutation calls in `videoService`/`comparisonVideoService`/`folderService` too. Only proceed to Task 1.4 on the SQL path.

- [ ] **Step 4: Commit**

```bash
git add supabase/policies/03_write_owned.sql
git commit -m "feat: add owner-gated RLS write policies (not yet applied)"
```

### Task 1.4: Apply policies against a real token, then revoke anon writes

**Files:**
- Create: `supabase/policies/04_revoke_anon_writes.sql`

**Interfaces:**
- Consumes: all policy files from 1.1–1.3, plus one authenticated JWT (Task 1.0 Step 1) and a second user's JWT if available.

- [ ] **Step 1: Apply the SELECT + write policies**

Apply `01`, `02`, `03` via the Supabase SQL editor (dashboard) or `psql`. This is done by the user against their project; the agent provides the SQL and instructions. Do **not** run `04` yet.

- [ ] **Step 2: Test authenticated writes with a real token (before revoking anon)**

Using the logged-in user's JWT, verify the owner boundary holds. Update a video the user **owns** (should succeed) and one they **don't** (should affect 0 rows / 403):
```bash
JWT="<authenticated user token>"
URL=$(grep VITE_SUPABASE_URL .env | sed -E 's/.*="?([^"]*)"?/\1/')
KEY=$(grep VITE_SUPABASE_ANON_KEY .env | sed -E 's/.*="?([^"]*)"?/\1/')
# OWN video id → expect 204
curl -s -o /dev/null -w "own update: HTTP %{http_code}\n" -X PATCH \
  -H "apikey: $KEY" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" -d '{"title":"self-edit-ok"}' \
  "$URL/rest/v1/videos?id=eq.<OWN_VIDEO_ID>"
# OTHER user's video id → expect 0 rows changed (Content-Range 0 or 403)
curl -s -o /dev/null -w "other delete: HTTP %{http_code}\n" -X DELETE \
  -H "apikey: $KEY" -H "Authorization: Bearer $JWT" \
  "$URL/rest/v1/videos?id=eq.<OTHER_VIDEO_ID>"
```
Expected: own update `204`; other delete does not remove the row (verify with a follow-up SELECT that `<OTHER_VIDEO_ID>` still exists). If the own update FAILS, `OWNER_KEY_SQL` is wrong — revisit Task 1.0 before continuing. **Restore the edited title afterward.**

- [ ] **Step 3: Manual app smoke test**

With policies live (anon writes still enabled), run `npm run dev`, log in, and confirm: dashboard/video load works, adding an annotation works, refreshing an AWS video works, and deleting your **own** video works. This proves the policies don't break the authenticated app before we remove the anon safety margin.

- [ ] **Step 4: Write and apply the anon-write revoke (last)**

Create `supabase/policies/04_revoke_anon_writes.sql`:
```sql
-- Remove the pre-existing hole: anon must not write.
revoke insert, update, delete on public.videos from anon;
revoke insert, update, delete on public.comparison_videos from anon;
revoke insert, update, delete on public.annotations from anon;
revoke insert, update, delete on public.annotation_labels from anon;
revoke insert, update, delete on public.labels from anon;
revoke insert, update, delete on public.folders from anon;
revoke insert, update, delete on public.project_folders from anon;
-- Keep anon INSERT on annotation_comments + anonymous_sessions ONLY if
-- anonymous commenting on shared links must keep working; otherwise revoke here too.
```
Apply it. Then re-run the anon write probe from the spec (§6) and confirm it now returns `401/403`:
```bash
curl -s -o /dev/null -w "anon update now: HTTP %{http_code}\n" -X PATCH \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" -d '{"title":"x"}' \
  "$URL/rest/v1/videos?id=eq.00000000-0000-0000-0000-000000000000"
```
Expected: `401` or `403` (previously `204`).

- [ ] **Step 5: Commit**

```bash
git add supabase/policies/04_revoke_anon_writes.sql
git commit -m "feat: revoke anon write grants (close pre-existing hole)"
```

---

## Phase 2 — Scope-aware service layer

### Task 2.1: Owner-filter-optional list queries

**Files:**
- Modify: `src/services/videoService.ts` (add `getAllVideos`)
- Modify: `src/services/comparisonVideoService.ts` (add `getAllComparisonVideos`)
- Test: `src/services/__tests__/scopeQueries.test.ts`

**Interfaces:**
- Produces:
  - `VideoService.getAllVideos(): Promise<Video[]>` — same shape as `getUserVideos` but no `ownerId` filter.
  - `ComparisonVideoService.getAllComparisonVideos(): Promise<ComparisonVideoRecord[]>` — same shape as `getUserComparisonVideos` but no `userId` filter.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/scopeQueries.test.ts`. Mock the supabase client to assert the query chain omits the owner filter:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
};
const fromMock = vi.fn(() => chain);

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

beforeEach(() => {
  fromMock.mockClear();
  chain.select.mockClear();
  chain.eq.mockClear();
  chain.order.mockClear();
});

describe('VideoService.getAllVideos', () => {
  it('queries videos without an ownerId eq filter', async () => {
    const { VideoService } = await import('@/services/videoService');
    await VideoService.getAllVideos();
    expect(fromMock).toHaveBeenCalledWith('videos');
    expect(chain.eq).not.toHaveBeenCalled();
    expect(chain.order).toHaveBeenCalledWith('createdAt', { ascending: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- scopeQueries`
Expected: FAIL — `VideoService.getAllVideos is not a function`.

- [ ] **Step 3: Implement `getAllVideos`**

In `src/services/videoService.ts`, add after `getUserVideos` (around line 232):
```ts
static async getAllVideos() {
  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .order('createdAt', { ascending: false });
  if (error) {
    handleServiceError('VideoService.getAllVideos', error);
    throw error;
  }
  return data;
}
```

- [ ] **Step 4: Implement `getAllComparisonVideos`**

In `src/services/comparisonVideoService.ts`, add after `getUserComparisonVideos` (around line 177):
```ts
async getAllComparisonVideos(): Promise<ComparisonVideoRecord[]> {
  const { data, error } = await supabase
    .from('comparison_videos')
    .select(
      'id, title, description, createdAt, updatedAt, userId, videoAId, videoBId, isPublic, thumbnailUrl, videoA:videoAId(*), videoB:videoBId(*)'
    )
    .order('createdAt', { ascending: false });
  if (error) {
    console.warn('⚠️ [ComparisonVideoService] getAllComparisonVideos error:', error);
    return [];
  }
  return (data || []) as unknown as ComparisonVideoRecord[];
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- scopeQueries`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/videoService.ts src/services/comparisonVideoService.ts src/services/__tests__/scopeQueries.test.ts
git commit -m "feat: add scope-'all' list queries (no owner filter)"
```

### Task 2.2: Owner enrichment helper

**Files:**
- Create: `src/services/ownerEnrichmentService.ts`
- Test: `src/services/__tests__/ownerEnrichment.test.ts`

**Interfaces:**
- Consumes: the `users` table (`id`, `fullName`, `email`, `avatarUrl`).
- Produces: `fetchOwners(ownerIds: string[]): Promise<Record<string, ProjectOwner>>` where
  `type ProjectOwner = { id: string; name: string; avatarUrl?: string }`. Deduplicates ids, one query keyed by `in`, returns a map keyed by owner id. Missing users map to `{ id, name: 'Unknown' }`.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/ownerEnrichment.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chain = {
  select: vi.fn(() => chain),
  in: vi.fn(() => Promise.resolve({
    data: [
      { id: 'u1', fullName: 'Alice', email: 'a@x.com', avatarUrl: null },
      { id: 'u2', fullName: null, email: 'bob@x.com', avatarUrl: 'http://img' },
    ],
    error: null,
  })),
};
const fromMock = vi.fn(() => chain);
vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

beforeEach(() => { fromMock.mockClear(); chain.in.mockClear(); });

describe('fetchOwners', () => {
  it('dedupes ids and maps by owner id, falling back on name', async () => {
    const { fetchOwners } = await import('@/services/ownerEnrichmentService');
    const map = await fetchOwners(['u1', 'u2', 'u1']);
    expect(chain.in).toHaveBeenCalledWith('id', ['u1', 'u2']);
    expect(map.u1.name).toBe('Alice');
    expect(map.u2.name).toBe('bob@x.com'); // falls back to email when no fullName
    expect(map.u2.avatarUrl).toBe('http://img');
  });

  it('returns empty map for empty input without querying', async () => {
    const { fetchOwners } = await import('@/services/ownerEnrichmentService');
    const map = await fetchOwners([]);
    expect(map).toEqual({});
    expect(fromMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- ownerEnrichment`
Expected: FAIL — cannot find module `ownerEnrichmentService`.

- [ ] **Step 3: Implement the service**

Create `src/services/ownerEnrichmentService.ts`:
```ts
import { supabase } from '@/composables/useSupabase';

export type ProjectOwner = {
  id: string;
  name: string;
  avatarUrl?: string;
};

export async function fetchOwners(
  ownerIds: string[]
): Promise<Record<string, ProjectOwner>> {
  const uniqueIds = [...new Set(ownerIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase
    .from('users')
    .select('id, fullName, email, avatarUrl')
    .in('id', uniqueIds);

  if (error) {
    console.warn('⚠️ [ownerEnrichment] fetchOwners error:', error);
    return {};
  }

  const map: Record<string, ProjectOwner> = {};
  for (const u of data ?? []) {
    map[u.id] = {
      id: u.id,
      name: u.fullName || u.email || 'Unknown',
      avatarUrl: u.avatarUrl ?? undefined,
    };
  }
  // Ensure every requested id has an entry
  for (const id of uniqueIds) {
    if (!map[id]) map[id] = { id, name: 'Unknown' };
  }
  return map;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- ownerEnrichment`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/ownerEnrichmentService.ts src/services/__tests__/ownerEnrichment.test.ts
git commit -m "feat: add batched owner enrichment service"
```

### Task 2.3: Batched project counts

**Files:**
- Modify: `src/services/projectService.ts` (add `getProjectCountsBatched`)
- Test: `src/services/__tests__/projectCounts.test.ts`

**Interfaces:**
- Produces: `ProjectService.getProjectCountsBatched(projects: Project[]): Promise<{ annotationCounts: Record<string, number>; commentCounts: Record<string, number> }>` — same return shape as the existing `getProjectCounts`, but uses **two grouped queries** (annotations by videoId/comparisonVideoId, comments joined to annotations) instead of per-project round-trips.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/projectCounts.test.ts`. Assert it issues a bounded number of queries and buckets counts by project id:
```ts
import { describe, it, expect, vi } from 'vitest';

// annotations rows: two for video v1, one for comparison c1
const annotationRows = [
  { id: 'a1', videoId: 'v1', comparisonVideoId: null },
  { id: 'a2', videoId: 'v1', comparisonVideoId: null },
  { id: 'a3', videoId: null, comparisonVideoId: 'c1' },
];
const commentRows = [
  { annotationId: 'a1' },
  { annotationId: 'a1' },
  { annotationId: 'a3' },
];

function makeChain(rows: unknown[]) {
  const chain: any = {
    select: vi.fn(() => chain),
    in: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return chain;
}
const fromMock = vi.fn((table: string) =>
  table === 'annotations' ? makeChain(annotationRows) : makeChain(commentRows)
);
vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (t: string) => fromMock(t) },
}));

describe('getProjectCountsBatched', () => {
  it('buckets annotation and comment counts by project id', async () => {
    const { ProjectService } = await import('@/services/projectService');
    const projects: any = [
      { id: 'v1', projectType: 'single', video: { id: 'v1' } },
      { id: 'c1', projectType: 'dual', comparisonVideo: { id: 'c1' } },
    ];
    const { annotationCounts, commentCounts } =
      await ProjectService.getProjectCountsBatched(projects);
    expect(annotationCounts).toEqual({ v1: 2, c1: 1 });
    expect(commentCounts).toEqual({ v1: 2, c1: 1 });
    // annotations query + comments query = 2 table reads only
    expect(fromMock.mock.calls.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- projectCounts`
Expected: FAIL — `getProjectCountsBatched is not a function`.

- [ ] **Step 3: Implement the batched method**

In `src/services/projectService.ts`, add the import at top:
```ts
import { supabase } from '@/composables/useSupabase';
```
Add the method to the `ProjectService` class:
```ts
/**
 * Batched counts for a page of projects — two grouped queries total,
 * replacing the per-project N+1 in getProjectCounts.
 */
static async getProjectCountsBatched(projects: Project[]): Promise<{
  annotationCounts: Record<string, number>;
  commentCounts: Record<string, number>;
}> {
  const annotationCounts: Record<string, number> = {};
  const commentCounts: Record<string, number> = {};
  if (projects.length === 0) return { annotationCounts, commentCounts };

  const videoIds = projects
    .filter((p) => p.projectType === 'single')
    .map((p) => (p as any).video.id as string);
  const comparisonIds = projects
    .filter((p) => p.projectType === 'dual')
    .map((p) => (p as any).comparisonVideo.id as string);

  // Map annotation id -> owning project id, and seed annotation counts.
  const annToProject: Record<string, string> = {};
  const ids = [...videoIds, ...comparisonIds];
  const { data: annRows } = await supabase
    .from('annotations')
    .select('id, videoId, comparisonVideoId')
    .in('videoId', videoIds.length ? videoIds : ['__none__']);
  // Second predicate for comparison annotations (OR across two columns is
  // split into the same query set; run comparison filter via a second `.in`
  // is not chainable as OR, so fetch both columns and bucket in code):
  const { data: annRows2 } = await supabase
    .from('annotations')
    .select('id, videoId, comparisonVideoId')
    .in('comparisonVideoId', comparisonIds.length ? comparisonIds : ['__none__']);

  const allAnn = [...(annRows ?? []), ...(annRows2 ?? [])];
  for (const id of ids) annotationCounts[id] = 0;
  for (const a of allAnn) {
    const pid = a.videoId ?? a.comparisonVideoId;
    if (pid == null) continue;
    annToProject[a.id] = pid;
    annotationCounts[pid] = (annotationCounts[pid] ?? 0) + 1;
    commentCounts[pid] = commentCounts[pid] ?? 0;
  }

  const annIds = Object.keys(annToProject);
  if (annIds.length) {
    const { data: commentRows } = await supabase
      .from('annotation_comments')
      .select('annotationId')
      .in('annotationId', annIds);
    for (const c of commentRows ?? []) {
      const pid = annToProject[c.annotationId];
      if (pid) commentCounts[pid] = (commentCounts[pid] ?? 0) + 1;
    }
  }
  return { annotationCounts, commentCounts };
}
```
Note: this issues up to 3 queries (two annotation reads split by column because PostgREST can't express the cross-column OR in one `.in`, plus one comments read) — still O(1) in the number of projects, versus the old O(projects) round-trips. The test's `fromMock` returns the same rows for the `annotations` table on both calls; adjust the test's `fromMock` to return `annotationRows` only on the first `annotations` call and `[]` on the second if you want exact counts, OR keep the single-column bucketing. **Implementer: make the test and implementation agree — the intended behavior is "annotation counted once for its owning project."**

- [ ] **Step 4: Reconcile test with the two-query split**

Update `src/services/__tests__/projectCounts.test.ts` `fromMock` so the first `annotations` call returns rows filtered to `videoId` present and the second returns rows filtered to `comparisonVideoId` present (mirroring the real `.in` filters), so no annotation is double-counted:
```ts
let annCall = 0;
const fromMock = vi.fn((table: string) => {
  if (table === 'annotations') {
    annCall += 1;
    return makeChain(annCall === 1
      ? annotationRows.filter((r) => r.videoId)
      : annotationRows.filter((r) => r.comparisonVideoId));
  }
  return makeChain(commentRows);
});
```
Adjust the query-count assertion to `expect(fromMock.mock.calls.length).toBe(3)`.

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- projectCounts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/projectService.ts src/services/__tests__/projectCounts.test.ts
git commit -m "feat: add batched project counts (removes N+1)"
```

### Task 2.4: `getAllProjects` orchestration with scope + owners

**Files:**
- Modify: `src/services/projectService.ts` (add `getAllProjects`)
- Modify: `src/types/project.ts` (add optional `owner`)
- Test: `src/services/__tests__/getAllProjects.test.ts`

**Interfaces:**
- Consumes: `VideoService.getUserVideos`/`getAllVideos`, `ComparisonVideoService.getUserComparisonVideos`/`getAllComparisonVideos` (Task 2.1), `fetchOwners` (Task 2.2).
- Produces: `ProjectService.getAllProjects(opts: { scope: 'mine' | 'all'; userId: string }): Promise<Project[]>`. Reuses the existing single/dual mapping + validity filtering + sort from `getUserProjects`, then attaches `owner` to each project. Adds optional `owner?: ProjectOwner` to the `Project` type.

- [ ] **Step 1: Extend the `Project` type**

In `src/types/project.ts`, add `owner` to the base object and import the type:
```ts
import type { Video, ComparisonVideo } from './database';
import type { ProjectOwner } from '../services/ownerEnrichmentService';

export type Project = {
  id: string;
  projectType: 'single' | 'dual';
  title: string;
  thumbnailUrl?: string;
  createdAt: string;
  owner?: ProjectOwner;
} & ( /* ...unchanged single/dual union... */ );
```

- [ ] **Step 2: Write the failing test**

Create `src/services/__tests__/getAllProjects.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserVideos = vi.fn();
const getAllVideos = vi.fn();
const getUserComparisonVideos = vi.fn();
const getAllComparisonVideos = vi.fn();
const fetchOwners = vi.fn();

vi.mock('@/services/videoService', () => ({
  VideoService: { getUserVideos, getAllVideos },
}));
vi.mock('@/services/comparisonVideoService', () => ({
  ComparisonVideoService: { getUserComparisonVideos, getAllComparisonVideos },
}));
vi.mock('@/services/ownerEnrichmentService', () => ({ fetchOwners }));
vi.mock('@/services/annotationService', () => ({ AnnotationService: {} }));
vi.mock('@/services/commentService', () => ({ CommentService: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  fetchOwners.mockResolvedValue({ u1: { id: 'u1', name: 'Alice' } });
});

const video = (id: string) => ({
  id, ownerId: 'u1', title: 't', videoType: 'url', url: 'http://v', createdAt: '2026-01-01',
});

describe('getAllProjects', () => {
  it("scope 'all' uses getAllVideos and attaches owner", async () => {
    getAllVideos.mockResolvedValue([video('v1')]);
    getAllComparisonVideos.mockResolvedValue([]);
    const { ProjectService } = await import('@/services/projectService');
    const projects = await ProjectService.getAllProjects({ scope: 'all', userId: 'u1' });
    expect(getAllVideos).toHaveBeenCalled();
    expect(getUserVideos).not.toHaveBeenCalled();
    expect(projects[0].owner?.name).toBe('Alice');
  });

  it("scope 'mine' uses getUserVideos(userId)", async () => {
    getUserVideos.mockResolvedValue([video('v1')]);
    getUserComparisonVideos.mockResolvedValue([]);
    const { ProjectService } = await import('@/services/projectService');
    await ProjectService.getAllProjects({ scope: 'mine', userId: 'u1' });
    expect(getUserVideos).toHaveBeenCalledWith('u1');
    expect(getAllVideos).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- getAllProjects`
Expected: FAIL — `getAllProjects is not a function`.

- [ ] **Step 4: Refactor mapping into a shared helper + implement `getAllProjects`**

In `src/services/projectService.ts`, extract the existing single/dual mapping from `getUserProjects` into a private `static mapToProjects(videos, comparisonVideos): Project[]` (move lines 54–144's logic verbatim, returning the sorted array), and have `getUserProjects` call it. Then add:
```ts
import { fetchOwners } from './ownerEnrichmentService';

static async getAllProjects(opts: { scope: 'mine' | 'all'; userId: string }): Promise<Project[]> {
  const { scope, userId } = opts;
  const [videos, comparisonVideos] = await Promise.all([
    scope === 'all' ? VideoService.getAllVideos() : VideoService.getUserVideos(userId),
    scope === 'all'
      ? ComparisonVideoService.getAllComparisonVideos()
      : ComparisonVideoService.getUserComparisonVideos(userId),
  ]);

  const projects = this.mapToProjects(videos ?? [], comparisonVideos ?? []);

  // Attach owner info (batched)
  const ownerIds = projects.map((p) =>
    p.projectType === 'single' ? (p as any).video.ownerId : (p as any).comparisonVideo.userId
  );
  const owners = await fetchOwners(ownerIds);
  for (const p of projects) {
    const oid = p.projectType === 'single' ? (p as any).video.ownerId : (p as any).comparisonVideo.userId;
    p.owner = owners[oid];
  }
  return projects;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- getAllProjects`
Expected: PASS (both cases).

- [ ] **Step 6: Typecheck and commit**

Run: `npx vue-tsc --noEmit`
Expected: no new errors from these files.
```bash
git add src/services/projectService.ts src/types/project.ts src/services/__tests__/getAllProjects.test.ts
git commit -m "feat: add getAllProjects with scope + owner enrichment"
```

### Task 2.5: Cross-user label set for filtering

**Files:**
- Modify: `src/services/labelService.ts` (add `getLabelsForProjects`)
- Test: `src/services/__tests__/labelSet.test.ts`

**Interfaces:**
- Produces: `LabelService.getLabelsForProjects(videoIds: string[]): Promise<Label[]>` — the distinct set of labels attached to any annotation on the given videos, regardless of who authored them (joins `annotations` → `annotation_labels` → `labels`).

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/labelSet.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

const annChain: any = { select: vi.fn(() => annChain), in: vi.fn(() =>
  Promise.resolve({ data: [{ id: 'a1' }, { id: 'a2' }], error: null })) };
const joinChain: any = { select: vi.fn(() => joinChain), in: vi.fn(() =>
  Promise.resolve({ data: [
    { labelId: 'l1', labels: { id: 'l1', name: 'Foul', color: '#f00' } },
    { labelId: 'l1', labels: { id: 'l1', name: 'Foul', color: '#f00' } },
    { labelId: 'l2', labels: { id: 'l2', name: 'Goal', color: '#0f0' } },
  ], error: null })) };
const fromMock = vi.fn((t: string) => (t === 'annotations' ? annChain : joinChain));
vi.mock('@/composables/useSupabase', () => ({ supabase: { from: (t: string) => fromMock(t) } }));

describe('getLabelsForProjects', () => {
  it('returns the distinct labels across all annotations of the videos', async () => {
    const { LabelService } = await import('@/services/labelService');
    const labels = await LabelService.getLabelsForProjects(['v1', 'v2']);
    expect(labels.map((l) => l.id).sort()).toEqual(['l1', 'l2']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- labelSet`
Expected: FAIL — `getLabelsForProjects is not a function`.

- [ ] **Step 3: Implement it**

In `src/services/labelService.ts` add to the `LabelService` class (match the file's existing `supabase` import and `Label` type):
```ts
static async getLabelsForProjects(videoIds: string[]): Promise<Label[]> {
  if (videoIds.length === 0) return [];
  const { data: anns, error: annErr } = await supabase
    .from('annotations')
    .select('id')
    .in('videoId', videoIds);
  if (annErr || !anns?.length) return [];

  const { data: rows, error } = await supabase
    .from('annotation_labels')
    .select('labelId, labels(*)')
    .in('annotationId', anns.map((a) => a.id));
  if (error || !rows) return [];

  const byId = new Map<string, Label>();
  for (const r of rows as any[]) {
    if (r.labels && !byId.has(r.labelId)) byId.set(r.labelId, r.labels as Label);
  }
  return [...byId.values()];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- labelSet`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/labelService.ts src/services/__tests__/labelSet.test.ts
git commit -m "feat: add cross-user label set for dashboard filtering"
```

---

## Phase 3 — Routing + editor extraction

### Task 3.1: Add a comparison-by-id fetch

**Files:**
- Modify: `src/services/comparisonVideoService.ts` (add `getComparisonVideoById`)
- Test: `src/services/__tests__/comparisonById.test.ts`

**Interfaces:**
- Produces: `ComparisonVideoService.getComparisonVideoById(id: string): Promise<ComparisonVideoRecord | null>` — fetches one comparison with its `videoA`/`videoB` joined, mirroring the select in `getUserComparisonVideos`. Needed because the editor route receives only an id, not a preloaded object.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/comparisonById.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
const chain: any = {
  select: vi.fn(() => chain), eq: vi.fn(() => chain),
  maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'c1', videoA: {}, videoB: {} }, error: null })),
};
const fromMock = vi.fn(() => chain);
vi.mock('@/composables/useSupabase', () => ({ supabase: { from: () => fromMock() } }));

describe('getComparisonVideoById', () => {
  it('fetches one comparison by id with joined videos', async () => {
    const { ComparisonVideoService } = await import('@/services/comparisonVideoService');
    const c = await ComparisonVideoService.getComparisonVideoById('c1');
    expect(chain.eq).toHaveBeenCalledWith('id', 'c1');
    expect(c?.id).toBe('c1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- comparisonById`
Expected: FAIL — not a function.

- [ ] **Step 3: Implement it**

In `src/services/comparisonVideoService.ts` add:
```ts
async getComparisonVideoById(id: string): Promise<ComparisonVideoRecord | null> {
  const { data, error } = await supabase
    .from('comparison_videos')
    .select(
      'id, title, description, createdAt, updatedAt, userId, videoAId, videoBId, isPublic, thumbnailUrl, videoA:videoAId(*), videoB:videoBId(*)'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn('⚠️ [ComparisonVideoService] getComparisonVideoById error:', error);
    return null;
  }
  return (data as unknown as ComparisonVideoRecord) ?? null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- comparisonById`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/comparisonVideoService.ts src/services/__tests__/comparisonById.test.ts
git commit -m "feat: add getComparisonVideoById for editor route"
```

### Task 3.2: Extract the editor into `EditorView.vue`

**Files:**
- Create: `src/views/EditorView.vue` (moved from the current `DashboardView.vue`)
- Modify: `src/router/index.ts`

**Interfaces:**
- Consumes: route params `id` (both routes) + route name to distinguish single vs dual.
- Produces: routes `/video/:id` (single) and `/comparison/:id` (dual) rendering `EditorView`; the old `/` temporarily still points at the editor until Task 4.x swaps it.

- [ ] **Step 1: Copy the current workspace into `EditorView.vue`**

```bash
git mv src/views/DashboardView.vue src/views/EditorView.vue
```
(We move it, then Task 4.1 creates a brand-new `DashboardView.vue`.)

- [ ] **Step 2: Add editor routes (keep `/` on editor for now)**

In `src/router/index.ts`, replace the `dashboard` route block with:
```ts
{
  path: '/',
  name: 'dashboard',
  component: () => import('../views/EditorView.vue'), // temporary; swapped in Task 4.2
},
{
  path: '/video/:id',
  name: 'editor-single',
  component: () => import('../views/EditorView.vue'),
},
{
  path: '/comparison/:id',
  name: 'editor-dual',
  component: () => import('../views/EditorView.vue'),
},
```

- [ ] **Step 3: Make `EditorView` load from the route param**

In `src/views/EditorView.vue`, add a route-driven loader. Near the existing `const route = useRoute();` (line 47), add a function and an `onMounted`/watch that resolves the param to a project and calls the existing `handleProjectSelected`:
```ts
import { VideoService } from '@/services/videoService';
import { ComparisonVideoService } from '@/services/comparisonVideoService';
import { watch } from 'vue';

async function loadFromRoute() {
  if (route.name === 'editor-single' && route.params.id) {
    const video = await VideoService.getVideoById(route.params.id as string);
    if (video) {
      await handleProjectSelected({ projectType: 'single', video } as any);
    }
  } else if (route.name === 'editor-dual' && route.params.id) {
    const comparisonVideo = await ComparisonVideoService.getComparisonVideoById(route.params.id as string);
    if (comparisonVideo) {
      await handleProjectSelected({
        projectType: 'dual',
        comparisonVideo,
        videoA: (comparisonVideo as any).videoA,
        videoB: (comparisonVideo as any).videoB,
      } as any);
    }
  }
}

// Reload when navigating editor → editor (param changes), not just on mount.
watch(
  () => [route.name, route.params.id],
  () => { loadFromRoute(); }
);
```

- [ ] **Step 4: Call `loadFromRoute` in `onMounted` and stop auto-opening the modal**

In `EditorView.vue`'s existing `onMounted` (lines 760-790), after `await initAuth()` and the shared/AWS branches, replace the `layoutStore.openProjectModal()` call (line 783) with `await loadFromRoute();`. Remove the modal auto-open from the `user` watcher (line 846, the `setTimeout(() => { isProjectModalOpen.value = true }, 100)` branch) — logged-in users now land on the dashboard route, not a modal. Keep the shared-link (`initSharedContent`) and AWS (`loadOutputVideo`) branches intact.

- [ ] **Step 5: Verify build + manual smoke**

Run: `npm run build`
Expected: builds without errors.
Manual: `npm run dev`, log in, visit `/video/<a real video id>` → the workspace loads that video; visit `/comparison/<a real comparison id>` → dual workspace loads. Navigating between two `/video/:id` URLs reloads the player.

- [ ] **Step 6: Commit**

```bash
git add src/views/EditorView.vue src/router/index.ts
git commit -m "refactor: extract annotation workspace to EditorView with id routes"
```

### Task 3.3: Migrate share-link and AWS entry into the editor route

**Files:**
- Modify: `src/views/EditorView.vue`
- Modify: `src/router/index.ts`

**Interfaces:**
- Consumes: `?share=`/`?shareComparison=` and `?outputVideo=` query params (existing behavior).
- Produces: these deep-links resolve inside `EditorView` regardless of which route path is hit; the router guard still allows shared links without auth.

- [ ] **Step 1: Confirm guard still permits shared links on editor routes**

In `src/router/index.ts` `beforeEach`, the access check is "authenticated OR shared link". Confirm `to.name` checks don't exclude `editor-single`/`editor-dual` — the current guard only special-cases `login`, so shared links work on any non-login route. No change needed unless a name check was added; if so, include the editor route names in the allow path.

- [ ] **Step 2: Ensure AWS `?outputVideo=` still routes into the editor**

The existing `onMounted` AWS branch (reads `params.get('outputVideo') || sessionStorage.getItem('pendingOutputVideo')` and calls `loadOutputVideo`) already lives in `EditorView`. Confirm it runs before `loadFromRoute()` and that `loadFromRoute()` early-returns when there is no `:id` param (landing on `/?outputVideo=`), so the two paths don't conflict. Add the guard:
```ts
async function loadFromRoute() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('outputVideo') || ShareService.parseShareUrl().id) return; // handled by AWS/share branch
  // ...existing single/dual resolution...
}
```

- [ ] **Step 3: Verify + commit**

Manual: open a share link (`/?share=<public video id>`) while logged out → loads read-only; open `/?outputVideo=<pipeline id>` while logged in → AWS video loads.
```bash
git add src/views/EditorView.vue src/router/index.ts
git commit -m "refactor: keep share-link and AWS deep-links working on editor route"
```

---

## Phase 4 — Library dashboard

### Task 4.1: Build the new `DashboardView.vue` library page

**Files:**
- Create: `src/views/DashboardView.vue` (new, lean — NOT the old one, which is now `EditorView.vue`)
- Reuse (no move needed): `src/components/ProjectCard.vue`, `src/components/ProjectListItem.vue`, `src/components/FolderTree.vue`, `src/components/DashboardHeader.vue`

**Interfaces:**
- Consumes: `ProjectService.getAllProjects`, `ProjectService.getProjectCountsBatched`, `LabelService.getLabelsForProjects`, `useAuth`, `useRouter`.
- Produces: a route component that lists projects with scope toggle, search, label filter, grid/list toggle, pagination, and owner chips; emits navigation to the editor on open.

- [ ] **Step 1: Scaffold the view with scope + data loading**

Create `src/views/DashboardView.vue`. Model the state/loaders on `ProjectManagementModal.vue`'s `<script setup>` (projects/filteredProjects/counts/search/pagination refs, lines 625-693), but source data via `getAllProjects` and persist scope to `localStorage`:
```vue
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { ProjectService } from '@/services/projectService';
import { LabelService } from '@/services/labelService';
import type { Project } from '@/types/project';
import DashboardHeader from '@/components/DashboardHeader.vue';
import ProjectCard from '@/components/ProjectCard.vue';
import ProjectListItem from '@/components/ProjectListItem.vue';

const router = useRouter();
const { user } = useAuth();

const scope = ref<'mine' | 'all'>((localStorage.getItem('dashboardScope') as 'mine' | 'all') || 'all');
const viewMode = ref<'grid' | 'list'>('grid');
const searchQuery = ref('');
const isLoading = ref(false);
const projects = ref<Project[]>([]);
const annotationCounts = ref<Record<string, number>>({});
const commentCounts = ref<Record<string, number>>({});
const currentPage = ref(1);
const itemsPerPage = ref(20);
const activeLabelIds = ref<Set<string>>(new Set());
const availableLabels = ref<{ id: string; name: string; color: string }[]>([]);

watch(scope, (s) => { localStorage.setItem('dashboardScope', s); loadData(); });

async function loadData() {
  if (!user.value) return;
  isLoading.value = true;
  try {
    projects.value = await ProjectService.getAllProjects({ scope: scope.value, userId: user.value.id });
    const counts = await ProjectService.getProjectCountsBatched(projects.value);
    annotationCounts.value = counts.annotationCounts;
    commentCounts.value = counts.commentCounts;
    const videoIds = projects.value
      .filter((p) => p.projectType === 'single')
      .map((p) => (p as any).video.id);
    availableLabels.value = (await LabelService.getLabelsForProjects(videoIds)) as any;
  } finally {
    isLoading.value = false;
  }
}

const filteredProjects = computed(() => {
  let list = projects.value;
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((p) => p.title.toLowerCase().includes(q) || p.owner?.name.toLowerCase().includes(q));
  }
  return list;
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredProjects.value.length / itemsPerPage.value)));
const paginatedProjects = computed(() =>
  filteredProjects.value.slice((currentPage.value - 1) * itemsPerPage.value, currentPage.value * itemsPerPage.value)
);

function openProject(project: Project) {
  if (project.projectType === 'single') router.push({ name: 'editor-single', params: { id: project.id } });
  else router.push({ name: 'editor-dual', params: { id: project.id } });
}

onMounted(loadData);
</script>
```

- [ ] **Step 2: Add the template (scope toggle, owner chip, cards, pagination)**

Add a `<template>` that renders `DashboardHeader`, a `My Videos | All Videos` toggle bound to `scope`, a search input bound to `searchQuery`, a grid/list toggle bound to `viewMode`, and the project grid/list using the existing components:
```vue
<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <DashboardHeader />
    <main class="max-w-7xl mx-auto p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="inline-flex rounded-lg border overflow-hidden">
          <button :class="scope === 'all' ? 'bg-blue-600 text-white' : ''" class="px-3 py-1.5 text-sm" @click="scope = 'all'">All Videos</button>
          <button :class="scope === 'mine' ? 'bg-blue-600 text-white' : ''" class="px-3 py-1.5 text-sm" @click="scope = 'mine'">My Videos</button>
        </div>
        <input v-model="searchQuery" placeholder="Search videos or owners…" class="flex-1 px-3 py-1.5 border rounded-lg text-sm" />
        <button class="px-2 py-1.5 border rounded-lg text-sm" @click="viewMode = viewMode === 'grid' ? 'list' : 'grid'">{{ viewMode === 'grid' ? 'List' : 'Grid' }}</button>
      </div>

      <div v-if="isLoading" class="text-center text-gray-500 py-12">Loading…</div>
      <div v-else-if="paginatedProjects.length === 0" class="text-center text-gray-500 py-12">No videos found.</div>

      <div v-else-if="viewMode === 'grid'" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div v-for="project in paginatedProjects" :key="project.id" class="relative">
          <ProjectCard
            :project="project"
            :annotation-count="annotationCounts[project.id]"
            :comment-count="commentCounts[project.id]"
            @open="openProject"
          />
          <span v-if="project.owner" class="absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded bg-black/60 text-white">
            {{ project.owner.name }}
          </span>
        </div>
      </div>

      <div v-else class="flex flex-col gap-2">
        <ProjectListItem
          v-for="project in paginatedProjects"
          :key="project.id"
          :project="project"
          :annotation-count="annotationCounts[project.id]"
          :comment-count="commentCounts[project.id]"
          @open="openProject"
        />
      </div>

      <div v-if="totalPages > 1" class="flex justify-center gap-2 mt-6">
        <button :disabled="currentPage === 1" class="px-3 py-1 border rounded disabled:opacity-40" @click="currentPage--">Prev</button>
        <span class="px-2 py-1 text-sm">{{ currentPage }} / {{ totalPages }}</span>
        <button :disabled="currentPage === totalPages" class="px-3 py-1 border rounded disabled:opacity-40" @click="currentPage++">Next</button>
      </div>
    </main>
  </div>
</template>
```
(Label-filter chips using `availableLabels`/`activeLabelIds` can be added here following the same pattern; wire `activeLabelIds` into `filteredProjects` by intersecting with each project's annotation labels if/when label data is attached to the card. If label data isn't on the `Project` yet, render the chips as a visual filter over `availableLabels` and treat full label-based project filtering as a follow-up — note this in the commit.)

**Folders (deferred, tracked):** spec §4 keeps folders meaningful in `My Videos` scope and hidden in `All Videos`. To keep this task shippable, the new dashboard launches **without** the folder sidebar; the retired modal's folder feature is not carried over in v1. This is a deliberate scope cut — the shared library (All Videos) is the feature's point, and folders are a personal-organization layer. Add a follow-up task to reintroduce `FolderTree` + `FolderService.getUserFolders`/`getProjectsInFolder` filtering, shown **only when `scope === 'mine'`**, after this plan lands. Call this out in the Task 4.1 commit body so it isn't mistaken for complete.

- [ ] **Step 3: Verify build + manual**

Run: `npm run build`
Expected: builds clean.
Manual: temporarily add a link to `/dashboard-preview` route (or set `/` per Task 4.2 first) and confirm: All Videos shows other users' videos with owner chips; My Videos narrows to yours; search filters; clicking a card navigates to the editor.

- [ ] **Step 4: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "feat: add library DashboardView (scope toggle, owners, pagination)"
```

### Task 4.2: Make the dashboard the home route

**Files:**
- Modify: `src/router/index.ts`

- [ ] **Step 1: Point `/` at the new dashboard**

In `src/router/index.ts`, change the `dashboard` route component back to the new file:
```ts
{
  path: '/',
  name: 'dashboard',
  component: () => import('../views/DashboardView.vue'),
},
```
(`/video/:id` and `/comparison/:id` keep pointing at `EditorView.vue`.)

- [ ] **Step 2: Verify the full flow**

Manual: `npm run dev`, log in → land on the library dashboard (no modal). Click a video → editor route. Browser back → dashboard. Reload on `/video/:id` → editor loads that video directly.

- [ ] **Step 3: Commit**

```bash
git add src/router/index.ts
git commit -m "feat: make library dashboard the home route"
```

---

## Phase 5 — Retire the modal + cleanup

### Task 5.1: Remove the project modal wiring from the editor

**Files:**
- Modify: `src/views/EditorView.vue`
- Modify: `src/components/DashboardModals.vue`
- Modify: `src/stores/layout.ts`

**Interfaces:**
- Produces: editor no longer references `ProjectManagementModal` or `isProjectModalOpen`; comparison-create and upload flows navigate to the editor route instead of re-opening a modal.

- [ ] **Step 1: Redirect post-create/upload flows to routes**

In `EditorView.vue`: `handleComparisonCreated` (lines 524-534) and `handleVideoUploadSuccess` (lines 544-567) currently call `handleProjectSelected(...)` then re-open the project modal. Replace the modal re-open (`isProjectModalOpen.value = true`) with a router navigation to the new content's editor route (`router.push({ name: 'editor-single'|'editor-dual', params: { id } })`), or simply drop the re-open so the user stays in the just-created editor. Keep the `handleProjectSelected` call so the content loads.

- [ ] **Step 2: Remove `ProjectManagementModal` from `DashboardModals.vue`**

Delete the `ProjectManagementModal` async import (line 13-17 area) and its `<ProjectManagementModal .../>` usage (lines 58-64) plus the `is-project-modal-open` prop, `close-project-modal` and `project-selected` emits. Leave the other modals (comparison, share, shared-links, upload, changelog, auth-prompt) intact.

- [ ] **Step 3: Remove project-modal state from the layout store**

In `src/stores/layout.ts`, remove `isProjectModalOpen`, `openProjectModal`, `closeProjectModal` from state, actions, and the return. Update `EditorView.vue` to drop the `isProjectModalOpen` destructure (line 51-59 area) and any `layoutStore.openProjectModal()/closeProjectModal()` / `openLoadModal`/`closeLoadModal` references (lines 503-509, 665, 938). Where the header previously opened the project modal, point it at `router.push({ name: 'dashboard' })`.

- [ ] **Step 4: Verify build + typecheck**

Run: `npm run build && npx vue-tsc --noEmit`
Expected: no references to removed symbols; builds clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/EditorView.vue src/components/DashboardModals.vue src/stores/layout.ts
git commit -m "refactor: remove project modal; navigation replaces it"
```

### Task 5.2: Delete `ProjectManagementModal.vue` and dead helpers

**Files:**
- Delete: `src/components/ProjectManagementModal.vue`

- [ ] **Step 1: Confirm no remaining references**

Run:
```bash
grep -rn "ProjectManagementModal\|openProjectModal\|isProjectModalOpen" src || echo "clean"
```
Expected: `clean` (or only comments). If any references remain, fix them before deleting.

- [ ] **Step 2: Delete the file**

```bash
git rm src/components/ProjectManagementModal.vue
```

- [ ] **Step 3: Verify build + commit**

Run: `npm run build`
Expected: builds clean.
```bash
git add -A
git commit -m "chore: delete retired ProjectManagementModal"
```

### Task 5.3: Update the header "back to library" affordance

**Files:**
- Modify: `src/components/DashboardHeader.vue`

- [ ] **Step 1: Ensure a route to the library exists from the editor**

In `DashboardHeader.vue`, confirm the "projects"/logo control navigates to the dashboard route. If it currently emits an "open modal" event, change it to `router.push({ name: 'dashboard' })` (import `useRouter`). The header is shared by both views, so guard the control to only navigate when not already on `/`.

- [ ] **Step 2: Verify + commit**

Manual: from an editor route, the header control returns to the library dashboard.
```bash
git add src/components/DashboardHeader.vue
git commit -m "feat: header navigates back to library dashboard"
```

---

## Final verification

- [ ] **Run the whole test suite**

Run: `npm test`
Expected: all Phase 2/3 unit tests pass.

- [ ] **Typecheck + build**

Run: `npx vue-tsc --noEmit && npm run build`
Expected: clean.

- [ ] **End-to-end manual pass**

1. Log in → land on library dashboard (no modal).
2. `All Videos` shows other users' videos with owner chips + counts; AWS/pipeline videos appear with a badge.
3. `My Videos` narrows to your own.
4. Search filters by title/owner.
5. Open a single video → `/video/:id` editor; open a comparison → `/comparison/:id` editor; both load and annotate.
6. Add an annotation to someone else's video → succeeds (RLS allows author writes).
7. Attempt to delete someone else's video via the API with your token → blocked (RLS).
8. Anon write probe → `401/403` (hole closed).
9. Share link + AWS `?outputVideo=` deep links still load in the editor.
