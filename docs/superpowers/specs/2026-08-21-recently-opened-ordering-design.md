# Per-User "Recently Opened" Dashboard Ordering - Design

**Date:** 2026-08-21
**Status:** Approved.

## 1. Goal

The dashboard list is ordered newest-created first, for everyone, always. A user who
returns to the app has no way to get back to what they were just working on except by
remembering its title.

Order the list by what **the signed-in user** opened, most recent first, with never-opened
projects keeping today's created-date order below them. The signal is per user: your
recents reorder your list only, and nobody else's opens move anything for you.

Scope covers both project types the dashboard lists: single videos and dual comparisons.

## 2. Decisions taken

| Question | Decision |
|---|---|
| Pin one item, or order by recency? | Full recency ordering, no cap |
| Where does the record live? | New Supabase table, RLS-scoped to the user |
| What counts as "opening"? | The editor successfully loading the project, from any entry path |
| Does the list say why a row is on top? | Yes, one mono token in the existing meta line |

## 3. Why not reuse `video_watch_progress`

`video_watch_progress` already stores a per-user, per-video row with an `updatedAt`, so it
looks like the natural home. Two properties rule it out:

- `migrations/20260704_watch_progress.sql`: `"videoId" uuid NOT NULL REFERENCES public.videos (id)`.
  The dashboard lists **projects**, and a dual project's identity lives in
  `comparison_videos`. The table structurally cannot record an opened comparison.
- `useWatchProgress.onTimeUpdate` begins with `if (!isPlaying) return;`. Opening a video,
  scrubbing it, and reading its annotations without pressing play never touches `updatedAt`.
  The requirement is "last opened", not "last watched".

## 4. Data model

New table, shaped like `annotations` rather than like `video_watch_progress`.
`getProjectCountsBatched` shows `annotations` already carries nullable `videoId` +
`comparisonVideoId`; that is this codebase's established answer to "a row that points at
either project type", so it is the shape to mirror.

`migrations/20260821_project_opens.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.project_opens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  "videoId" uuid REFERENCES public.videos (id) ON DELETE CASCADE,
  "comparisonVideoId" uuid REFERENCES public.comparison_videos (id) ON DELETE CASCADE,
  "openedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_opens_one_target
    CHECK (num_nonnulls("videoId", "comparisonVideoId") = 1),
  CONSTRAINT project_opens_user_video_key UNIQUE ("userId", "videoId"),
  CONSTRAINT project_opens_user_comparison_key UNIQUE ("userId", "comparisonVideoId")
);

CREATE INDEX IF NOT EXISTS idx_project_opens_user_recent
  ON public.project_opens ("userId", "openedAt" DESC);
```

Three details that are load-bearing:

- **Plain unique constraints, not partial unique indexes.** Postgres treats NULLs as
  distinct, so dual rows (`videoId` NULL) never collide on `project_opens_user_video_key`,
  and single rows never collide on the comparison one. A partial index would be the
  tidier-looking choice and would break the write: `ON CONFLICT` cannot infer a partial
  unique index unless the statement repeats the index predicate, which PostgREST (and
  therefore `supabase.upsert()`) does not emit. Both constraints must be plain for
  `onConflict: 'userId,videoId'` and `onConflict: 'userId,comparisonVideoId'` to resolve.
- **`ON DELETE CASCADE` on both foreign keys.** Deleting a video or a comparison takes its
  open-records with it; no orphan sweep, no rows pointing at nothing.
- **RLS in the same migration.** SELECT / INSERT / UPDATE policies on `auth.uid() = "userId"`.
  This is per-user visibility data by definition, so it does not inherit the
  "no RLS, consistent with the rest of the schema (pending RLS phase)" note carried by
  `20260704_watch_progress.sql`.

```sql
ALTER TABLE public.project_opens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own opens" ON public.project_opens
  FOR SELECT TO authenticated USING (auth.uid() = "userId");
CREATE POLICY "Users can record their own opens" ON public.project_opens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = "userId");
CREATE POLICY "Users can update their own opens" ON public.project_opens
  FOR UPDATE TO authenticated
  USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");
```

INSERT and UPDATE are both required: the write is an upsert, and the second open of the
same project is an UPDATE of the existing row.

## 5. Write path

### 5.1 Service

`src/services/recentOpensService.ts`, following `watchProgressService`'s contract exactly:
every failure is logged with `console.warn` and swallowed. This is informational ordering,
and a failed write must never interrupt viewing a video.

```ts
export type OpenTarget = { videoId: string } | { comparisonVideoId: string };

recordOpen(userId: string, target: OpenTarget): Promise<boolean>
getRecentOpens(userId: string): Promise<Record<string, string>>  // projectId -> openedAt
```

`recordOpen` must send `openedAt: new Date().toISOString()` in the upsert payload, not lean
on the column default. `DEFAULT now()` fires on INSERT only, and PostgREST builds the
`DO UPDATE SET` clause from the columns actually sent, so omitting it would leave the second
and every later open of a project updating nothing: the row would keep its first-open
timestamp forever and the list would silently order by *first* open. `upsertProgress`
already sets `updatedAt` this way for the same reason.

`getRecentOpens` keys its result by **project id**, which is well-defined because
`ProjectService.mapToProjects` already sets `id: video.id` for singles and
`id: comparisonVideo.id` for duals. One row maps to exactly one key, so no disambiguation
is needed at the call site.

The read is a single query keyed on the user:

```ts
supabase.from('project_opens')
  .select('videoId, comparisonVideoId, openedAt')
  .eq('userId', userId)
  .order('openedAt', { ascending: false })
  .limit(500);
```

Keyed on the user, not `.in(projectIds)` over the ~200 loaded projects: a user's own
recents are small and bounded, and the `(userId, openedAt DESC)` index serves it directly.
The 500 cap is a safety bound, far above the number of projects a person can plausibly
have opened and still care about ordering.

### 5.2 Trigger

`src/composables/useRecordProjectOpen.ts`, instantiated once in `EditorView`.

Every load path in the editor converges on the video store's `currentVideoId` /
`currentComparisonId`:

- `handleProjectSelected`, single branch (`EditorView.vue:1149`) and dual branch
  (`EditorView.vue:1159`) - reached from `loadFromRoute`, so this covers dashboard clicks,
  pasted URLs, `?t=` annotation deep links, and editor-to-editor navigation
- `loadOutputVideo` (`EditorView.vue:1307`) - AWS `outputVideo` links
- `useSharedContent` (lines 110, 130, 167, 203) - share links

So the composable takes the store's `currentVideoId` / `currentComparisonId` plus
`EditorView`'s local `isAppLoading` ref (`EditorView.vue:145`), watches the three together,
and needs no edits to any of those branches.

Two guards:

- **Record only once `isAppLoading` is false.** The video store is a singleton that holds
  the previously-opened video across editor unmount and remount (documented in the
  `onMounted` comment at `EditorView.vue:1349`). Recording on mount without this guard would
  bump whichever project was open last time, not the one being opened now. Waiting for
  `isAppLoading` to settle also means reopening the *same* project in a fresh mount does
  refresh its `openedAt`, even though the watched ids never changed value.
- **Dedupe per mount.** A module-free `lastRecordedKey` local to the composable instance,
  so re-renders and unrelated ref churn cannot double-write. It starts null on each mount,
  which is what makes the reopen-the-same-project case work.

No `userId` means no write, silently: anonymous share-link visitors, and the local dev auth
bypass (which, like folders, cannot satisfy an `auth.uid()` policy).

One accepted imprecision: if a load fails and leaves stale ids in the singleton store, the
watcher records the previously-opened project. That project genuinely was opened recently,
so the effect is a slightly stale timestamp on an already-top row, not a wrong row.

## 6. Read and sort path

### 6.1 Where the sort lives

Not in `ProjectService.mapToProjects`. That is a private static with no user context, shared
by `getUserProjects` and `getAllProjects`; threading a per-user map through it would put a
viewer concern into the shared mapping layer. It keeps returning created-date-descending as
the stable base ordering.

Recency is applied in `DashboardView` as a computed **between `filteredProjects` and
`paginatedProjects`**. This ordering is not cosmetic: `paginatedProjects` slices, so sorting
after it would only float a recent item within page 1.

```
projects -> filterByFolder/search/labels (filteredProjects)
         -> sortByRecentOpens            (orderedProjects)   <- new
         -> slice                        (paginatedProjects)
```

Folder, search and label filters need no special-casing: whatever survives filtering simply
participates in the ordering.

### 6.2 Sort util

`src/utils/projectOrdering.ts`, a pure function so it is testable without a component:

```ts
sortByRecentOpens(
  projects: Project[],
  openedAt: Record<string, string>
): Project[]
```

- Projects with an entry sort first, `openedAt` descending.
- Projects without one follow, preserving the incoming order (which is already created-date
  descending from `mapToProjects`). Implemented as a stable sort over the input, not a
  re-sort on `createdAt`, so the base ordering stays owned by one place.
- An empty map is the identity function.

The comparator is written as three explicit branches - both unopened, exactly one opened,
both opened - rather than an arithmetic difference of two lookups. Subtracting timestamps
that may be `undefined` yields `NaN`, and a comparator returning `NaN` produces arbitrary
order rather than the stable order this relies on. The "never-opened preserve created-date
order" test is what catches a regression here.

### 6.3 Dashboard wiring

`DashboardView.loadData` gains `recentOpens = ref<Record<string, string>>({})`, populated by
one `getRecentOpens(user.value.id)` call alongside the batched loads already there
(`getProjectCountsBatched`, `getProjectLabelData`, `getMergedRangesForVideos`). Same shape
as the existing `annotationCounts` / `commentCounts` / `watchCoverage` maps.

No invalidation plumbing is needed: `DashboardView`'s `onMounted -> loadData` already
re-runs when the user navigates back from the editor, which is exactly when the order
changes. This depends on route components mounting fresh, which they do: `App.vue` renders a
plain `<RouterView />`, and `grep -rn "KeepAlive\|keep-alive" src/` returns nothing. The same
property is what lets `isAppLoading` (a per-mount local ref) re-trigger the write in
section 5.2.

In scope `All`, only the current user's opens reorder the list, because the query filters on
`userId` and RLS enforces it independently.

## 7. UI

`ProjectListItem` gains one optional prop, `openedAt?: string`, and renders one more mono
token in the existing meta line, after the created-date token:

```
Sprint drill
2:14  60FPS  Today  3A  OPENED 5M AGO

Match vs Lima
1:47  Yesterday  OPENED 2H AGO

Uploaded Monday
0:58  4 days ago
```

The token is absent for never-opened rows, matching how the component already suppresses the
watch-coverage chip at 0 rather than printing a meaningless value.

The component's existing `formatDate` resolves only to Today / Yesterday / N days ago, too
coarse for an "opened" timestamp. New util `src/utils/relativeTime.ts`:

```ts
formatRelativeTime(iso: string, now?: Date): string
// JUST NOW | 5M AGO | 2H AGO | YESTERDAY | 3 DAYS AGO | locale date
```

Used by the new token only. The existing created-date token keeps `formatDate` and its
current wording unchanged.

## 8. Tests

| File | Covers |
|---|---|
| `src/utils/__tests__/projectOrdering.test.ts` | opened sort before never-opened; recency order within opened; never-opened preserve created-date order; empty map is identity; entries for absent projects are ignored |
| `src/utils/__tests__/relativeTime.test.ts` | each bucket and its boundaries, with an injected `now` |
| `src/services/__tests__/recentOpensService.test.ts` | single vs dual upsert targets the right `onConflict`; `getRecentOpens` keys by project id across both row shapes; error path warns and returns a safe value rather than throwing |

Service tests follow the supabase chain-mock pattern already used in
`src/services/__tests__/watchProgressService.test.ts`.

## 9. Verification before the implementation hardens

Apply `20260821_project_opens.sql` to a local or branch database and call `recordOpen` twice
for a single video and twice for a comparison. That one exercise confirms all three schema
claims at once: both `onConflict` targets infer against the plain unique constraints, the
`num_nonnulls` CHECK accepts either row shape, and `openedAt` actually advances on the second
call rather than sticking at the first.

## 10. Deployment

Deploys for this project are manual and production lags the branch, so
`migrations/20260821_project_opens.sql` is a hand-apply step and must be called out when the
work is handed over.

Until it is applied, `getRecentOpens` hits a missing table, warns, and returns `{}`, which
makes `sortByRecentOpens` the identity function. The dashboard keeps today's created-date
ordering. Degraded, not broken.

## 11. Accepted consequences

1. **The shared library reads differently per person.** In scope `All`, your ordering is
   yours. "It's the third one down" stops being a thing colleagues can say to each other.
   This is the requested behavior, stated here so it is not discovered later.
2. **A misclick promotes a project.** The trigger is editor-load, not first-play, so opening
   something for two seconds moves it to the top. Self-correcting: opening the intended
   project puts it back above.
