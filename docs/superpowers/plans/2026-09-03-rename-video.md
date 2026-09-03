# Rename a video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone who can see a video rename it, persist the name server-side, record the rename in the video's history, and make pipeline outputs visible to every signed-in account so a DALF video is shared rather than owned by whoever clicked first.

**Architecture:** One migration adds six permissive RLS policies keyed on `"videoId" LIKE 'aws:%'`, a `rename_video()` SECURITY DEFINER function in the shape of the existing `set_video_qa_status`, and an `AFTER UPDATE` trigger guarded by `WHEN (NEW.title IS DISTINCT FROM OLD.title)` that writes a `'video'` row into `activity_events`. The frontend gains a `renameVideo` service call, a `'video'` branch through the activity phrasing and timeline, and a rename dialog reachable from the two dashboard places a title is shown.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Tailwind, Vitest, Supabase (PostgREST + RLS + plpgsql).

**Spec:** `docs/superpowers/specs/2026-09-03-rename-video-design.md`

## Global Constraints

- **No em dashes** in any prose, comment, commit message or copy. Use a plain dash.
- **No agent attribution** on commits: no `Co-Authored-By` trailer, no generated-with footer.
- **Do not apply the migration.** It is written as a file only. Running it against production is a separate step the user authorises. No `netlify deploy`, no `git push`.
- **Comments explain why, not what.** Match the density and voice of the surrounding files, in particular `migrations/20260825_activity_events.sql` and `migrations/20260821_video_qa_status.sql`.
- The visibility predicate is exactly `"videoId" LIKE 'aws:%'`, matching `videos_aws_video_id_unique`. Do not introduce a marker column.
- Every new policy is `TO authenticated`. Never role `public`.
- Test command for a single file: `npx vitest run <path>`. Whole suite: `npm run test:unit -- --run`. Types: `npx vue-tsc --noEmit -p tsconfig.json`.

---

### Task 1: The migration

**Files:**
- Create: `migrations/20260903_rename_video.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: the PostgREST RPC `rename_video(p_video_id uuid, p_title text) RETURNS videos`, and `activity_events` rows with `entityType = 'video'`, `action = 'updated'`, `summary = {from, to}`.

- [ ] **Step 1: Write the migration file**

Create `migrations/20260903_rename_video.sql`:

```sql
-- migrations/20260903_rename_video.sql
-- Renaming a video, and pipeline outputs as shared material (2026-09-03)
--
-- Three things in one file because they cannot be separated safely: the
-- policies that decide who can see a pipeline output, the function whose
-- predicate mirrors those policies, and the trigger that logs what the function
-- does. Splitting them would leave a window in which set_video_qa_status
-- disagrees with the policies it documents itself as mirroring.
--
-- Design: docs/superpowers/specs/2026-09-03-rename-video-design.md

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Pipeline outputs become visible to every signed-in account.
-- ---------------------------------------------------------------------------
--
-- Every policy here is added, never edited. Permissive policies are OR'd, so an
-- added policy cannot narrow anything that works today, while threading a new
-- clause through the six live expressions would put six working policies at
-- risk to express one idea.
--
-- The predicate is `"videoId" LIKE 'aws:%'`, the same one
-- videos_aws_video_id_unique uses. It is stringly typed deliberately: `aws:` is
-- already how this codebase says "pipeline output" - in that index, in
-- VideoService.isAwsVideo, and in the storage proxy's PostgREST query. A marker
-- column would be a second source of truth to keep in step with the first.
--
-- TO authenticated, never role public. The five existing SELECT policies on
-- videos are role public, which is why `isPublic = true` was not an option
-- here: it would hand pipeline outputs to anon as well.

DROP POLICY IF EXISTS "Signed-in users can view pipeline outputs" ON public.videos;
CREATE POLICY "Signed-in users can view pipeline outputs" ON public.videos
    FOR SELECT TO authenticated
    USING ("videoId" LIKE 'aws:%');

-- The videos policy alone is not enough. The four policies below gate on the
-- video's owner inside their own expressions, so a reader who can now see the
-- video would still find it empty and read-only.

DROP POLICY IF EXISTS "Signed-in users can view annotations on pipeline outputs" ON public.annotations;
CREATE POLICY "Signed-in users can view annotations on pipeline outputs"
    ON public.annotations
    FOR SELECT TO authenticated
    USING (
        annotations."videoId" IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.videos v
            WHERE v.id = annotations."videoId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

DROP POLICY IF EXISTS "Signed-in users can annotate pipeline outputs" ON public.annotations;
CREATE POLICY "Signed-in users can annotate pipeline outputs"
    ON public.annotations
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = annotations."userId"
        AND annotations."videoId" IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.videos v
            WHERE v.id = annotations."videoId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

DROP POLICY IF EXISTS "Signed-in users can read comments on pipeline outputs" ON public.annotation_comments;
CREATE POLICY "Signed-in users can read comments on pipeline outputs"
    ON public.annotation_comments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.annotations a
            JOIN public.videos v ON v.id = a."videoId"
            WHERE a.id = annotation_comments."annotationId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

DROP POLICY IF EXISTS "Signed-in users can comment on pipeline outputs" ON public.annotation_comments;
CREATE POLICY "Signed-in users can comment on pipeline outputs"
    ON public.annotation_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND annotation_comments."userId" = auth.uid()
        AND annotation_comments."isAnonymous" = false
        AND EXISTS (
            SELECT 1 FROM public.annotations a
            JOIN public.videos v ON v.id = a."videoId"
            WHERE a.id = annotation_comments."annotationId"
              AND v."videoId" LIKE 'aws:%'
        )
    );

-- This one looks redundant and is not. activity_events' existing policy already
-- joins videos, so it is tempting to assume a wider videos policy makes it
-- start matching. It does not: that expression re-states the ownership test
-- itself (`v."isPublic" = true OR v."ownerId" = auth.uid()`) rather than
-- deferring to whether the row is visible, so widening videos leaves it exactly
-- as strict as it was.
DROP POLICY IF EXISTS "Signed-in users can view activity on pipeline outputs" ON public.activity_events;
CREATE POLICY "Signed-in users can view activity on pipeline outputs"
    ON public.activity_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.videos v
            WHERE v.id = activity_events."videoId"
              AND v."videoId" LIKE 'aws:%'
        )
    );


-- ---------------------------------------------------------------------------
-- 2. set_video_qa_status keeps its promise.
-- ---------------------------------------------------------------------------
--
-- That function's comment states an invariant: it mirrors the SELECT policies
-- on public.videos, and if those policies change it changes in the same
-- migration. Section 1 changed them. Without this, a non-owner could rename a
-- pipeline output but not set its QA status, which nobody could predict.
--
-- Reproduced in full rather than patched, because there is no way to alter one
-- clause of a function body in place.

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

    IF p_status NOT IN ('not_started', 'in_review', 'failed', 'staging', 'production') THEN
        RAISE EXCEPTION 'Unknown QA status: %', p_status
            USING ERRCODE = '22023';
    END IF;

    -- SECURITY DEFINER bypasses RLS, so this predicate is the only gate on the
    -- write. It mirrors the SELECT policies on public.videos as they stand
    -- after this migration: own, public, pipeline output, and member of a
    -- public comparison. If those policies change, this function changes in the
    -- same migration.
    UPDATE public.videos v
       SET "qaStatus" = p_status,
           "qaStatusUpdatedAt" = now(),
           "qaStatusUpdatedBy" = v_caller,
           "updatedAt" = now()
     WHERE v.id = p_video_id
       AND (
             v."ownerId" = v_caller
          OR v."isPublic" = true
          OR v."videoId" LIKE 'aws:%'
          OR v.id IN (
                 SELECT c."videoAId" FROM public.comparison_videos c WHERE c."isPublic"
                 UNION
                 SELECT c."videoBId" FROM public.comparison_videos c WHERE c."isPublic"
             )
       )
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video % is not visible to the caller', p_video_id
            USING ERRCODE = '42501';
    END IF;

    RETURN v_row;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. The rename.
-- ---------------------------------------------------------------------------
--
-- A function rather than a policy, for the three reasons
-- migrations/20260820_set_video_thumbnail.sql and
-- migrations/20260821_video_qa_status.sql already record between them:
--
--  * RLS is row level, so a permissive UPDATE policy would hand out url,
--    isPublic and ownerId along with title.
--  * Column GRANTs cannot separate owner from non-owner, because both are the
--    same `authenticated` role.
--  * Column GRANTs only bite once table-level UPDATE is revoked, and revoking
--    it would break the presigned-URL refresh, which writes url on every open.
--
-- The predicate deliberately reaches past pipeline outputs to public videos and
-- members of public comparisons: it mirrors what the caller can see, exactly as
-- set_video_qa_status does. Splitting the two, so that a video's QA status is
-- editable by the team but its name is not, would be an inconsistency nobody
-- could predict from the outside. The recovery for a rename by the wrong person
-- is the history entry written below, which records the previous name and who
-- changed it.

CREATE OR REPLACE FUNCTION public.rename_video(p_video_id uuid, p_title text)
RETURNS public.videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_title  text := btrim(coalesce(p_title, ''));
    v_row    public.videos;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Renaming a video requires a signed-in user'
            USING ERRCODE = '42501';
    END IF;

    IF v_title = '' THEN
        RAISE EXCEPTION 'A video name cannot be empty'
            USING ERRCODE = '22023';
    END IF;

    IF length(v_title) > 200 THEN
        RAISE EXCEPTION 'A video name cannot be longer than 200 characters'
            USING ERRCODE = '22023';
    END IF;

    -- "updatedAt" is not set here. update_videos_updated_at, a BEFORE UPDATE
    -- trigger on this table, already maintains it.
    UPDATE public.videos v
       SET title = v_title
     WHERE v.id = p_video_id
       AND (
             v."ownerId" = v_caller
          OR v."isPublic" = true
          OR v."videoId" LIKE 'aws:%'
          OR v.id IN (
                 SELECT c."videoAId" FROM public.comparison_videos c WHERE c."isPublic"
                 UNION
                 SELECT c."videoBId" FROM public.comparison_videos c WHERE c."isPublic"
             )
       )
    RETURNING * INTO v_row;

    -- Not a no-op. A policy-gated UPDATE that matches no row returns 2xx with
    -- zero rows, which the frontend cannot tell from success. FOUND is the right
    -- test and was verified against this database for set_video_qa_status: an
    -- UPDATE ... RETURNING * INTO that matches no row leaves FOUND false.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video % is not visible to the caller', p_video_id
            USING ERRCODE = '42501';
    END IF;

    RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rename_video(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rename_video(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. The rename lands in the video's history.
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_events
    DROP CONSTRAINT IF EXISTS "activity_events_entityType_check";
ALTER TABLE public.activity_events
    ADD CONSTRAINT "activity_events_entityType_check"
    CHECK ("entityType" IN ('annotation', 'comment', 'video'));

CREATE OR REPLACE FUNCTION public.log_video_rename_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor uuid := auth.uid();
BEGIN
    -- Same degrade-to-NULL as log_annotation_activity(): "actorId" references
    -- public.users, and this table must never fail a write it is only
    -- observing. Letting the foreign key raise 23503 here would abort the
    -- rename over a log entry.
    IF v_actor IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN
        v_actor := NULL;
    END IF;

    -- No fallback actor, unlike log_annotation_activity(). rename_video refuses
    -- a null auth.uid(), so an unattributed rename cannot reach here from the
    -- app; one that arrives some other way is genuinely unattributed and should
    -- say so rather than name a plausible owner.
    --
    -- "entityId" is the video's own id. The other two entity types point at
    -- something that can outlive its parent, which is why "entityId" carries no
    -- foreign key; a video event points at the video itself, so the
    -- ON DELETE CASCADE on "videoId" takes this row with it.
    INSERT INTO public.activity_events (
        "videoId", "actorId", "entityType", "entityId", action, summary
    ) VALUES (
        NEW.id, v_actor, 'video', NEW.id, 'updated',
        jsonb_build_object('from', OLD.title, 'to', NEW.title)
    );

    RETURN NULL;
END;
$$;

-- The WHEN clause is the load-bearing part of this trigger.
-- VideoService.findOrCreateOutputVideo and VideoService.refreshAwsVideoUrl both
-- write `url` on every single open of a pipeline output, and ensureAwsThumbnail
-- writes `thumbnailUrl` on some. Anything looser than a title comparison turns
-- every DALF click into a history entry.
--
-- A WHEN clause rather than an IF in the body: the trigger does not fire at all,
-- and it cannot be defeated by a later edit to the function.
--
-- No cascade guard, unlike log_annotation_activity(). This trigger is
-- UPDATE-only, and a deleted video cannot be updated.
DROP TRIGGER IF EXISTS log_video_rename_activity ON public.videos;
CREATE TRIGGER log_video_rename_activity
    AFTER UPDATE ON public.videos
    FOR EACH ROW
    WHEN (NEW.title IS DISTINCT FROM OLD.title)
    EXECUTE FUNCTION public.log_video_rename_activity();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Rollback:
--
-- DROP TRIGGER IF EXISTS log_video_rename_activity ON public.videos;
-- DROP FUNCTION IF EXISTS public.log_video_rename_activity();
-- DROP FUNCTION IF EXISTS public.rename_video(uuid, text);
--
-- DROP POLICY IF EXISTS "Signed-in users can view pipeline outputs" ON public.videos;
-- DROP POLICY IF EXISTS "Signed-in users can view annotations on pipeline outputs" ON public.annotations;
-- DROP POLICY IF EXISTS "Signed-in users can annotate pipeline outputs" ON public.annotations;
-- DROP POLICY IF EXISTS "Signed-in users can read comments on pipeline outputs" ON public.annotation_comments;
-- DROP POLICY IF EXISTS "Signed-in users can comment on pipeline outputs" ON public.annotation_comments;
-- DROP POLICY IF EXISTS "Signed-in users can view activity on pipeline outputs" ON public.activity_events;
--
-- Two things do not come back on their own. The "entityType" constraint cannot
-- be narrowed again while 'video' rows exist, so delete those rows first if the
-- constraint is being restored. And set_video_qa_status has to be restored to
-- its previous four-clause predicate by re-running
-- migrations/20260821_video_qa_status.sql, since rolling back a policy change
-- has to roll back the function that mirrors it.
```

- [ ] **Step 2: Check the file parses without running it**

There is no local Postgres. Verify by eye against these three, which this file copies structurally:
- `migrations/20260821_video_qa_status.sql` - the function shape, the `IF NOT FOUND` guard, the REVOKE/GRANT pair.
- `migrations/20260825_activity_events.sql` - the trigger shape and the degrade-to-NULL actor guard.
- `migrations/20260820_unique_aws_video_id.sql` - the `LIKE 'aws:%'` predicate.

Confirm each of these by reading the file:
- Every `CREATE POLICY` is preceded by a matching `DROP POLICY IF EXISTS`, so the file is re-runnable.
- Every `CREATE POLICY` says `TO authenticated`.
- The trigger has the `WHEN (NEW.title IS DISTINCT FROM OLD.title)` clause.
- `BEGIN;` ... `COMMIT;` wrap the whole file.
- No em dashes anywhere in the comments.

- [ ] **Step 3: Do NOT apply it**

The user applies this. Do not run `supabase db query`. Note in the handoff that the command, when they choose to run it, is:

```bash
supabase db query --linked -f migrations/20260903_rename_video.sql
```

- [ ] **Step 4: Commit**

```bash
git add migrations/20260903_rename_video.sql
git commit -m "feat(db): rename_video, pipeline outputs visible to the team

Six added policies make aws: videos readable, annotatable and commentable
by every signed-in account, rename_video() gives anyone who can see a
video a checked write path to its title, and an AFTER UPDATE trigger
guarded on the title logs the rename into activity_events.

set_video_qa_status gains the same aws: clause in the same file: its own
comment states it mirrors the videos SELECT policies and changes with
them.

Not applied. Run against production with:
  supabase db query --linked -f migrations/20260903_rename_video.sql"
```

---

### Task 2: The service layer

**Files:**
- Modify: `src/services/videoService.ts` (add `renameVideo`; change `findOrCreateOutputVideo` around :655-700 and `refreshAwsVideoUrl` at :810-829)
- Create: `src/services/__tests__/renameVideo.test.ts`
- Create: `src/services/__tests__/outputVideoNonOwner.test.ts`

**Interfaces:**
- Consumes: the `rename_video` RPC from Task 1.
- Produces: `VideoService.renameVideo(videoId: string, title: string): Promise<Video>` - resolves with the updated row, throws `Error` with the database message when the function raises.

- [ ] **Step 1: Write the failing tests for renameVideo**

Create `src/services/__tests__/renameVideo.test.ts`. This mirrors `setQaStatus.test.ts`, which mocks the supabase client at module scope:

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

describe('VideoService.renameVideo', () => {
  it('calls the RPC with the video id and the new title', async () => {
    rpc.mockResolvedValue({ data: { id: 'v1', title: 'Serve trial 3' }, error: null });
    const VideoService = await loadService();

    await VideoService.renameVideo('v1', 'Serve trial 3');

    expect(rpc).toHaveBeenCalledWith('rename_video', {
      p_video_id: 'v1',
      p_title: 'Serve trial 3',
    });
  });

  it('resolves with the row the function returned, not the title it was given', async () => {
    // The function trims. Trusting the input instead of the response would show
    // a name the database did not store.
    rpc.mockResolvedValue({ data: { id: 'v1', title: 'Serve trial 3' }, error: null });
    const VideoService = await loadService();

    const video = await VideoService.renameVideo('v1', '  Serve trial 3  ');

    expect(video.title).toBe('Serve trial 3');
  });

  // The whole reason the rename goes through an RPC: a denied write must never
  // look like a successful one.
  it('throws when the function raises', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Video v9 is not visible to the caller', code: '42501' },
    });
    const VideoService = await loadService();

    await expect(VideoService.renameVideo('v9', 'Nope')).rejects.toThrow(
      'Video v9 is not visible to the caller'
    );
  });

  it('throws when the function returns no row', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const VideoService = await loadService();

    await expect(VideoService.renameVideo('v1', 'Nope')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/__tests__/renameVideo.test.ts`
Expected: FAIL, `VideoService.renameVideo is not a function`.

- [ ] **Step 3: Implement renameVideo**

In `src/services/videoService.ts`, directly after `setQaStatus` (which ends around :860), add:

```ts
  /**
   * The only write path for a video's title.
   *
   * Not a plain `.update()`, for the same reason setQaStatus is not: the videos
   * UPDATE policy is auth.uid() = "ownerId", and a pipeline output is renamed by
   * whoever is working on it rather than by whoever followed the deep link
   * first. The function is SECURITY DEFINER and raises when the caller cannot
   * see the video, so a denied rename arrives here as an error rather than as a
   * silent success.
   *
   * Returns the stored row rather than echoing the requested title: the
   * function trims, so the two can differ.
   */
  static async renameVideo(videoId: string, title: string): Promise<Video> {
    const { data, error } = await supabase.rpc('rename_video', {
      p_video_id: videoId,
      p_title: title,
    });

    if (error) {
      handleServiceError('VideoService.renameVideo', error);
      throw new Error(error.message);
    }
    if (!data) {
      throw new Error('Rename returned no row');
    }
    return data as Video;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/__tests__/renameVideo.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing test for the non-owner url skip**

Create `src/services/__tests__/outputVideoNonOwner.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
const update = vi.fn();
const getVideoUrlForProject = vi.fn();

// A chainable stub in the shape videoService uses: from().select().eq().maybeSingle()
// for the lookup, and from().update().eq() for the url write.
const from = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle }) }),
  update: (...args: unknown[]) => {
    update(...args);
    return { eq: () => Promise.resolve({ data: null, error: null }) };
  },
}));

vi.mock('@/composables/useSupabase', () => ({ supabase: { from, rpc: vi.fn() } }));
vi.mock('@/services/awsStorageService', () => ({
  AwsStorageService: { getVideoUrlForProject },
}));
vi.mock('@/utils/thumbnailGenerator', () => ({ ThumbnailGenerator: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  getVideoUrlForProject.mockResolvedValue('https://s3/fresh-url');
});

const loadService = async () =>
  (await import('@/services/videoService')).VideoService;

const row = (ownerId: string) => ({
  id: 'v1',
  ownerId,
  videoId: 'aws:1b30b3cc',
  title: 'Pipeline Output - 1b30b3cc',
  url: 'https://s3/stale-url',
});

describe('findOrCreateOutputVideo, opened by someone who does not own the row', () => {
  // Before pipeline outputs were team-visible this could not happen: the second
  // user could not see the row at all. Now they can, and the url write they
  // would fall into is owner-gated, so it matches zero rows and .single()
  // raises PGRST116 - breaking their open in a new way.
  it('does not write the url', async () => {
    maybeSingle.mockResolvedValue({ data: row('someone-else'), error: null });
    const VideoService = await loadService();

    await VideoService.findOrCreateOutputVideo('1b30b3cc', 'me');

    expect(update).not.toHaveBeenCalled();
  });

  it('returns the fresh presigned url on the record anyway', async () => {
    maybeSingle.mockResolvedValue({ data: row('someone-else'), error: null });
    const VideoService = await loadService();

    const video = await VideoService.findOrCreateOutputVideo('1b30b3cc', 'me');

    expect(video.url).toBe('https://s3/fresh-url');
    expect(video.id).toBe('v1');
  });
});

describe('findOrCreateOutputVideo, opened by the owner', () => {
  it('still writes the url', async () => {
    maybeSingle.mockResolvedValue({ data: row('me'), error: null });
    const VideoService = await loadService();

    await VideoService.findOrCreateOutputVideo('1b30b3cc', 'me');

    expect(update).toHaveBeenCalledWith({ url: 'https://s3/fresh-url' });
  });
});
```

Note for the implementer: the owner path currently ends in `.update(...).eq(...).select().single()`. The stub above returns a plain resolved object from `.eq()`, so make the owner branch tolerate it, or extend the stub with `select: () => ({ single: () => Promise.resolve({ data: row('me'), error: null }) })` on the object `.eq()` returns. Extend the stub - do not change the production code to fit the test.

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/services/__tests__/outputVideoNonOwner.test.ts`
Expected: FAIL on the first two cases - `update` is called, and the returned url is the stale one or the call throws.

- [ ] **Step 7: Implement the non-owner skips**

In `findOrCreateOutputVideo`, after the presigned URL is fetched and before the `.update({ url: presignedUrl })` block, insert:

```ts
    // A caller who does not own this row cannot write to it: the videos UPDATE
    // policy is owner-gated, so the update below matches zero rows and
    // .single() raises PGRST116. Before pipeline outputs were team-visible this
    // was unreachable, because a non-owner never got this far - they could not
    // see the row and took the insert path instead.
    //
    // Nothing downstream needs the url persisted. loadVideo reads it off the
    // object it is handed, and every dashboard open of an aws: video calls
    // refreshAwsVideoUrl first, so the stored url is a cache that is refetched
    // before use rather than the source of truth.
    if (record.ownerId !== ownerId) {
      return { ...record, url: presignedUrl };
    }
```

In `refreshAwsVideoUrl`, guard the same write. It takes a `Video`, so the owner is on the row, but the caller's id is not a parameter - read it from the session:

```ts
      // Same owner-gated write as findOrCreateOutputVideo. This one is already
      // a silent no-op for a non-owner, since it does not .select() and zero
      // rows returns 2xx, but firing a write that can never land on every open
      // of someone else's video is noise.
      const { data: session } = await supabase.auth.getUser();
      if (session?.user?.id === video.ownerId) {
        await supabase
          .from('videos')
          .update({ url: presignedUrl })
          .eq('id', video.id);
      }
```

Also update the comment on the `!winner` branch inside the `23505` handler, which is now unreachable for `aws:` ids:

```ts
          if (!winner) {
            // Unreachable for aws: ids since pipeline outputs became visible to
            // every signed-in account: a caller who loses the insert race can
            // always read the winner back. Kept as a guard rather than deleted,
            // because it is the only thing standing between a future narrowing
            // of that policy and a raw constraint violation reaching the user.
```

- [ ] **Step 8: Run both service test files**

Run: `npx vitest run src/services/__tests__/renameVideo.test.ts src/services/__tests__/outputVideoNonOwner.test.ts src/services/__tests__/outputVideoThumbnail.test.ts`
Expected: PASS. `outputVideoThumbnail.test.ts` is included because it exercises the same function and must not regress.

- [ ] **Step 9: Commit**

```bash
git add src/services/videoService.ts src/services/__tests__/renameVideo.test.ts src/services/__tests__/outputVideoNonOwner.test.ts
git commit -m "feat: rename a video through the rename_video function

Also stops the presigned-url write when the caller does not own the row.
With pipeline outputs visible to the team, a second opener now finds the
row instead of inserting one, and falls into an owner-gated update that
matches nothing and raises PGRST116."
```

---

### Task 3: A rename in the history

**Files:**
- Modify: `src/types/database.ts:210` (`ActivityEntityType`) and `:218` (`ActivitySummary`)
- Modify: `src/utils/activityPhrasing.ts`
- Modify: `src/utils/__tests__/activityPhrasing.test.ts`
- Modify: `src/components/ActivityTimeline.vue:139-176`

**Interfaces:**
- Consumes: `activity_events` rows with `entityType: 'video'` and `summary: { from, to }` from Task 1.
- Produces: `activityIsSeekable(entry): boolean` and `activityIsDefunct(entry): boolean`, exported from `@/utils/activityPhrasing`, used by `ActivityTimeline.vue`.

- [ ] **Step 1: Widen the types**

In `src/types/database.ts`, line 210:

```ts
export type ActivityEntityType = 'annotation' | 'comment' | 'video';
```

And in `ActivitySummary`, after `surface`:

```ts
  /**
   * A rename, from the video event written by log_video_rename_activity. `from`
   * is null when the row being renamed had no title at all.
   */
  from?: string | null;
  to?: string | null;
```

- [ ] **Step 2: Write the failing phrasing tests**

Append to `src/utils/__tests__/activityPhrasing.test.ts`. The file already has an `entry()` factory at the top; reuse it.

```ts
describe('a video rename', () => {
  const rename = (over: Partial<ActivityEntry> = {}) =>
    entry({
      entityType: 'video',
      action: 'updated',
      entityId: 'v1',
      summary: { from: 'Pipeline Output - 1b30b3cc', to: 'Serve trial 3' },
      // A video event points at the video itself, so there is no annotation to
      // look up and getActivity always resolves it as not live.
      live: false,
      ...over,
    });

  it('reads as "renamed"', () => {
    expect(activityVerb(rename())).toBe('renamed');
  });

  // The old name in the sentence and the new one below it, so the feed reads
  // chronologically instead of asking the reader to work backwards from the
  // name the video has now.
  it('names the old title in the sentence', () => {
    expect(activitySubject(rename())).toBe('Pipeline Output - 1b30b3cc');
  });

  it('puts the new title in the excerpt', () => {
    expect(activityExcerpt(rename())).toBe('Now "Serve trial 3"');
  });

  it('falls back when there was no previous title', () => {
    expect(activitySubject(rename({ summary: { from: null, to: 'Named' } }))).toBe(
      'this video'
    );
  });

  it('is never seekable', () => {
    expect(activityIsSeekable(rename())).toBe(false);
  });

  // The distinction this pair exists for: `live: false` on an annotation means
  // the annotation was deleted, and the timeline strikes it through. A video
  // event is not live either, and striking it through would say the video was
  // deleted.
  it('is not defunct even though it is not live', () => {
    expect(activityIsDefunct(rename())).toBe(false);
  });

  it('a dead annotation is still defunct', () => {
    expect(activityIsDefunct(entry({ live: false }))).toBe(true);
  });

  it('a live annotation is seekable and not defunct', () => {
    expect(activityIsSeekable(entry({ live: true }))).toBe(true);
    expect(activityIsDefunct(entry({ live: true }))).toBe(false);
  });
});
```

Add `activityIsSeekable` and `activityIsDefunct` to the import list at the top of the file.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/activityPhrasing.test.ts`
Expected: FAIL, `activityIsSeekable is not a function` and the verb is `'changed'`.

- [ ] **Step 4: Implement the phrasing**

In `src/utils/activityPhrasing.ts`, add to `VERBS`:

```ts
  // A video event is about the video itself. Only a rename writes one today,
  // which is why 'updated' can be spelled with the specific verb.
  'video:updated': 'renamed',
```

Add a fallback constant beside `FALLBACK_SUBJECT`:

```ts
const FALLBACK_VIDEO_SUBJECT = 'this video';
```

Replace `activitySubject` with:

```ts
export function activitySubject(entry: ActivityEntry): string {
  // A video event names the title the video is moving away from, not the one it
  // has now. The new name goes in the excerpt, so the sentence reads in the
  // order the change happened.
  if (entry.entityType === 'video') {
    const from = entry.summary.from ?? '';
    return from.length > 0 ? from : FALLBACK_VIDEO_SUBJECT;
  }
  const title =
    entry.entityType === 'comment'
      ? entry.summary.annotationTitle
      : entry.summary.title;
  return title && title.length > 0 ? title : FALLBACK_SUBJECT;
}
```

Replace `activityExcerpt` with:

```ts
/** The comment body, or a rename's new name. Empty for annotations. */
export function activityExcerpt(entry: ActivityEntry): string {
  if (entry.entityType === 'video') {
    const to = entry.summary.to ?? '';
    return to.length > 0 ? `Now "${to}"` : '';
  }
  if (entry.entityType !== 'comment') return '';
  return entry.summary.excerpt ?? '';
}
```

Add the two predicates at the end of the file:

```ts
/**
 * Clicking this entry seeks somewhere. Only an entry that names a surviving
 * annotation does.
 */
export function activityIsSeekable(entry: ActivityEntry): boolean {
  return entry.entityType !== 'video' && entry.live;
}

/**
 * The thing this entry names is gone, so the timeline strikes it through.
 *
 * Deliberately not the negation of activityIsSeekable. A video event is not
 * live - there is no annotation behind it to be live - but the video it names
 * is very much still there, and striking it through would say otherwise.
 */
export function activityIsDefunct(entry: ActivityEntry): boolean {
  return entry.entityType !== 'video' && !entry.live;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/activityPhrasing.test.ts`
Expected: PASS, including the pre-existing cases.

- [ ] **Step 6: Render it in the timeline**

In `src/components/ActivityTimeline.vue`, import the two predicates alongside the existing phrasing imports, then replace every `entry.live` in the template with the right one of the two. The `<li>` body becomes:

```vue
              <span
                class="absolute -left-[17px] top-[13px] h-1.5 w-1.5 rounded-full"
                :class="
                  activityIsDefunct(entry)
                    ? 'bg-gray-300 dark:bg-gray-700'
                    : 'bg-gray-400 dark:bg-gray-500'
                "
              />

              <!-- A dead entry is a div, never a button: a control that does
                   nothing when clicked is worse than plain text. It must not
                   take focus and must not show a pointer cursor. A rename is a
                   div for the same reason and greyed for none: there is nothing
                   to seek to, but nothing is gone either. -->
              <component
                :is="activityIsSeekable(entry) ? 'button' : 'div'"
                :type="activityIsSeekable(entry) ? 'button' : undefined"
                data-testid="activity-entry"
                class="block w-full text-left"
                :class="[
                  activityIsSeekable(entry) ? 'cursor-pointer' : 'cursor-default',
                  activityIsDefunct(entry) && 'text-gray-400 dark:text-gray-600',
                ]"
                @click="onEntryClick(entry)"
              >
                <span
                  class="text-[13px]"
                  :class="
                    activityIsDefunct(entry)
                      ? 'text-gray-400 dark:text-gray-600'
                      : 'text-gray-900 dark:text-gray-200'
                  "
                >
                  <span class="font-semibold">{{ entry.actor }}</span>
                  {{ ' ' }}{{ activityVerb(entry) }}{{ ' ' }}
                  <span :class="activityIsDefunct(entry) ? 'line-through' : ''">
                    {{ activitySubject(entry) }}
                  </span>
                </span>

                <span
                  class="ml-2 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400"
                >
                  <!-- A rename happened to the video, not at a position in it.
                       Printing 0:00 would invite a click that seeks nowhere. -->
                  <template v-if="entry.entityType !== 'video'">
                    {{ formatTime(entry.summary.timestamp ?? 0) }}
                    ·
                  </template>
                  <span data-testid="activity-time">{{
                    formatClockTime(entry.createdAt)
                  }}</span>
                </span>

                <span
                  v-if="activityExcerpt(entry)"
                  data-testid="activity-excerpt"
                  class="mt-0.5 block truncate text-[12px] text-gray-500 dark:text-gray-400"
                >
                  {{ activityExcerpt(entry) }}
                </span>
              </component>
```

And in the script block, harden `onEntryClick` so a video entry can never emit:

```ts
const onEntryClick = (entry: ActivityEntry) => {
  if (!activityIsSeekable(entry)) return;
  const id = annotationIdOf(entry);
  if (!id) return;
  emit('select-annotation', id, entry.summary.timestamp ?? 0, entry.summary.surface);
};
```

- [ ] **Step 7: Type-check and run the activity suite**

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx vitest run src/utils/__tests__/activityPhrasing.test.ts src/services/__tests__/activityService.test.ts src/utils/__tests__/historySelection.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/types/database.ts src/utils/activityPhrasing.ts src/utils/__tests__/activityPhrasing.test.ts src/components/ActivityTimeline.vue
git commit -m "feat: show a rename in the video history

Reads 'Coen renamed Pipeline Output - 1b30b3cc' with 'Now \"Serve trial
3\"' beneath it: the old name in the sentence, the new one below, so the
feed reads in the order the change happened.

Splits the timeline's single `live` flag into seekable and defunct. A
video event is not live, because there is no annotation behind it, but
striking it through would say the video was deleted."
```

---

### Task 4: The rename dialog

**Files:**
- Create: `src/components/RenameVideoDialog.vue`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a component with props `{ currentTitle: string; busy?: boolean }` and emits `{ rename: [title: string]; close: [] }`.

- [ ] **Step 1: Write the component**

Create `src/components/RenameVideoDialog.vue`, following `NewFolderDialog.vue` exactly - same `Teleport`, overlay, header, labelled input and footer, so it is the same object as every other dialog in the app:

```vue
<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] overflow-y-auto">
      <div
        class="fixed inset-0 bg-black/50 transition-opacity"
        @click="$emit('close')"
      />

      <div class="flex min-h-screen items-center justify-center px-4 py-10">
        <div
          class="relative w-full max-w-sm rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
          @click.stop
        >
          <div class="border-b border-gray-200 px-4 py-3 dark:border-white/10">
            <h3 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
              Rename video
            </h3>
          </div>

          <div class="px-4 py-4">
            <label
              for="video-name"
              class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
            >
              Video name
            </label>
            <input
              id="video-name"
              ref="nameInput"
              v-model="title"
              type="text"
              maxlength="200"
              class="w-full rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
              placeholder="Untitled video"
              @keydown.enter="submit"
              @keydown.esc="$emit('close')"
            >
            <!-- The consequence, not a warning. Renaming is allowed and
                 ordinary; what is not obvious is that it is not private. -->
            <p class="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
              Everyone sees this name. The change is recorded in this video's
              history.
            </p>
          </div>

          <div
            class="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3 dark:border-white/10"
          >
            <button
              type="button"
              class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              :disabled="!canSubmit"
              class="rounded bg-gray-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 disabled:pointer-events-none disabled:opacity-30 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              @click="submit"
            >
              Rename
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';

const props = defineProps<{
  currentTitle: string;
  busy?: boolean;
}>();

const emit = defineEmits<{
  rename: [title: string];
  close: [];
}>();

const title = ref(props.currentTitle);
const nameInput = ref<HTMLInputElement | null>(null);

/**
 * Disabled on an empty or unchanged name, so Enter on an untouched dialog does
 * nothing rather than writing the name that is already there and putting a
 * pointless entry in the history.
 */
const canSubmit = computed(() => {
  const next = title.value.trim();
  return !props.busy && next.length > 0 && next !== props.currentTitle.trim();
});

const submit = () => {
  if (!canSubmit.value) return;
  emit('rename', title.value.trim());
};

onMounted(async () => {
  await nextTick();
  // Selected, not just focused: the name is usually being replaced outright
  // rather than edited, and a DALF default name has nothing worth keeping.
  nameInput.value?.focus();
  nameInput.value?.select();
});
</script>
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/RenameVideoDialog.vue
git commit -m "feat: rename dialog

One dialog, not two. Opening it and pressing Rename is the confirmation:
stacking an 'are you sure' on top of an explicit rename button would be
ceremony without safety, since the user has already typed the new name."
```

---

### Task 5: Wire it into the dashboard

**Files:**
- Create: `src/utils/projectRename.ts`
- Create: `src/utils/__tests__/projectRename.test.ts`
- Modify: `src/components/ProjectListItem.vue` (emits at :141, template around :49)
- Modify: `src/components/VideoDetailsPanel.vue` (emits at :256, template around :9)
- Modify: `src/views/DashboardView.vue` (state near :51, handler near :141, template at :751 / :799 / :822 / :847)

**Interfaces:**
- Consumes: `VideoService.renameVideo` (Task 2), `RenameVideoDialog` (Task 4).
- Produces: `applyVideoRename(project: Project, updated: Video): boolean` from `@/utils/projectRename` - mutates the project in place and returns whether it did.

- [ ] **Step 1: Write the failing test for the merge**

Create `src/utils/__tests__/projectRename.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyVideoRename } from '@/utils/projectRename';
import type { Project } from '@/types/project';

const project = (): Project =>
  ({
    id: 'v1',
    projectType: 'single',
    title: 'Pipeline Output - 1b30b3cc',
    createdAt: '2026-09-01',
    video: { id: 'v1', title: 'Pipeline Output - 1b30b3cc' },
  }) as unknown as Project;

describe('applyVideoRename', () => {
  // Project.title is a copy mapToProjects takes off the video, so a rename that
  // updated only one of the two would show the old name in the list and the new
  // one in the details panel, or the reverse.
  it('updates both the project title and the video title', () => {
    const p = project();

    const changed = applyVideoRename(p, { id: 'v1', title: 'Serve trial 3' } as never);

    expect(changed).toBe(true);
    expect(p.title).toBe('Serve trial 3');
    expect(p.projectType === 'single' && p.video.title).toBe('Serve trial 3');
  });

  it('ignores a row for a different video', () => {
    const p = project();

    const changed = applyVideoRename(p, { id: 'other', title: 'Nope' } as never);

    expect(changed).toBe(false);
    expect(p.title).toBe('Pipeline Output - 1b30b3cc');
  });

  it('ignores a dual project', () => {
    const p = { ...project(), projectType: 'dual' } as unknown as Project;

    expect(applyVideoRename(p, { id: 'v1', title: 'Nope' } as never)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/projectRename.test.ts`
Expected: FAIL, cannot resolve `@/utils/projectRename`.

- [ ] **Step 3: Implement the merge**

Create `src/utils/projectRename.ts`:

```ts
import type { Project } from '@/types/project';
import type { Video } from '@/types/database';

/**
 * Fold a renamed video back into the project on screen, in place.
 *
 * A pure function rather than logic inside the dashboard, the same shape as
 * mergeQaStatusUpdate: the interesting part is which of the two titles have to
 * move, and that deserves a test that does not need a mounted view.
 *
 * `Project.title` is a copy ProjectService.mapToProjects takes off the video, so
 * both have to move together. Updating one would show the old name in the list
 * and the new one in the details panel, or the reverse.
 *
 * Returns whether anything changed, so a caller can stay silent when nothing
 * did.
 */
export function applyVideoRename(project: Project, updated: Video): boolean {
  if (project.projectType !== 'single') return false;
  // Not reachable through the dialog, which is opened from the row it renames.
  // This function should not depend on that invariant holding in a caller it
  // does not control.
  if (project.video?.id !== updated.id) return false;

  project.title = updated.title;
  project.video.title = updated.title;
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/projectRename.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the entry point on the project row**

In `src/components/ProjectListItem.vue`, add to the emits block at :141:

```ts
  rename: [project: Project];
```

The row itself is a click target that opens the details panel, so the rename control is a button that appears on hover and stops the click from reaching the row.

**Placement matters here.** Do not append it at the end of the row. `QaStatusPillSelect` is deliberately last and fixed-width so both its edges land at the same x on every row, and the comment above it says so; a button after it would break that column. Put the rename beside the title instead, inside the `min-w-0 flex-1` info block. Wrap the existing `<h3>` (:49-51) in a flex row:

```vue
      <div class="flex min-w-0 items-center gap-1">
        <h3 class="truncate text-[13px] font-medium tracking-tight text-gray-900 dark:text-white">
          {{ project.title }}
        </h3>
        <!-- Hover-revealed: a rename is deliberate but infrequent, and a
             permanently visible button beside every title competes with the
             title it is attached to. `shrink-0` so it never squeezes the
             truncating heading. -->
        <button
          v-if="project.projectType === 'single'"
          type="button"
          class="shrink-0 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:text-gray-900 focus:opacity-100 group-hover:opacity-100 dark:text-gray-500 dark:hover:text-gray-200"
          title="Rename"
          @click.stop="emit('rename', project)"
        >
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
      </div>
```

The row's root already carries the `group` class, so `group-hover:opacity-100` works without adding one. `@click.stop` is required: without it the rename click also selects the row.


- [ ] **Step 6: Add the entry point in the details panel**

In `src/components/VideoDetailsPanel.vue`, add to the emits block at :256:

```ts
  rename: [project: Project];
```

The heading at :9 is `{{ project.title }}`. Put a rename button immediately after it, in the same flex row:

```vue
        <button
          v-if="project.projectType === 'single'"
          type="button"
          class="shrink-0 rounded p-1 text-gray-400 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-200"
          title="Rename"
          @click="emit('rename', project)"
        >
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
```

The `v-if` matters: a dual project's title lives on `comparison_videos` and `rename_video` cannot touch it.

- [ ] **Step 7: Wire the dashboard**

In `src/views/DashboardView.vue`:

Imports:

```ts
import RenameVideoDialog from '@/components/RenameVideoDialog.vue';
import { applyVideoRename } from '@/utils/projectRename';
```

State, beside `showNewFolder` at :51:

```ts
const renameTarget = ref<Project | null>(null);
const renameBusy = ref(false);
```

Handlers, beside `onProjectQaStatusUpdated` at :141:

```ts
function openRename(project: Project) {
  if (project.projectType !== 'single') return;
  renameTarget.value = project;
}

async function onRenameVideo(title: string) {
  const project = renameTarget.value;
  if (!project || project.projectType !== 'single') return;

  renameBusy.value = true;
  try {
    // The function trims, so the stored title and the typed one can differ.
    // Taking the response rather than the input is what keeps the list honest.
    const updated = await VideoService.renameVideo(project.video.id, title);
    applyVideoRename(project, updated);
    renameTarget.value = null;
  } catch (err) {
    // The old name stays on screen. A rename that silently did nothing is the
    // failure the RPC's IF NOT FOUND guard exists to make visible, so it must
    // not be swallowed here either.
    notifyError(
      'Could not rename video',
      err instanceof Error ? err.message : 'Please try again.'
    );
  } finally {
    renameBusy.value = false;
  }
}
```

Template - add `@rename="openRename"` to all three `ProjectListItem` / `VideoDetailsPanel` usages that already carry `@qa-status-updated` (:751, :799 and the teleported mobile copy at :847), and add the dialog beside `NewFolderDialog` at :822:

```vue
    <RenameVideoDialog
      v-if="renameTarget"
      :current-title="renameTarget.title"
      :busy="renameBusy"
      @rename="onRenameVideo"
      @close="renameTarget = null"
    />
```

Confirm `VideoService` is already imported in this file; if not, add `import { VideoService } from '@/services/videoService';`.

- [ ] **Step 8: Type-check and run the full suite**

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npm run test:unit -- --run`
Expected: PASS, with the new files included and nothing previously passing now failing.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/utils/projectRename.ts src/utils/__tests__/projectRename.test.ts src/components/ProjectListItem.vue src/components/VideoDetailsPanel.vue src/views/DashboardView.vue
git commit -m "feat: rename a video from the dashboard

Two entry points, both places the title already appears: the project row
and the details panel heading. The list takes its new title from the
function's response rather than from the input, because the function
trims."
```

---

## Verification, after the migration is applied

None of this can run until the user applies the migration. Do not apply it.

Once they have, verify at runtime against `http://127.0.0.1:5175/` following `.claude/skills/verify`. **Run the actor probe first**, before trusting anything else:

```sql
-- 1. The actor probe. This is first because it is the one assumption in the
-- design that has not been probed in this database: auth.uid() resolving inside
-- a trigger that fires inside a SECURITY DEFINER function. It should, because
-- request.jwt.claims is a GUC and SECURITY DEFINER changes the role rather than
-- the GUCs. If it does not, actorId degrades to NULL, the feed reads "Unknown
-- renamed ...", and everything else looks like it worked.
select "actorId", "entityType", action, summary
from public.activity_events
where "entityType" = 'video'
order by "createdAt" desc limit 5;
```

Then, in the browser as the dev-bypass user:

1. Rename a video you own from the dashboard row. The list title changes; the details panel agrees.
2. Open that video and check the History tab: one entry, "renamed", old name in the sentence, `Now "<new>"` beneath, not struck through, not clickable.
3. Open a pipeline output twice and confirm **no** new history rows appear. The url refresh must stay silent.
4. Check the SQL probes in the spec's Testing section for the RLS cases, which the browser cannot reach as a second user.

Report what was written to the live database, and restore anything renamed for the test.

## Notes for the executor

- **This drives live production data.** The dev auth bypass signs in as the real account. Rename only videos you created for the test, or restore the original name and say so in the report.
- The dev server is already running on port 5175 from this checkout. Ports 5173 and 5174 belong to other checkouts on other branches.
- Do not push and do not deploy.
