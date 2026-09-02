# QA status label per video

Date: 2026-08-21
Status: approved, not yet implemented

## Problem

A match that reaches the labelling dashboard goes through QA, and then it either
sits unreleased, gets released to staging, or gets released to production. Today
none of that is recorded anywhere. Whether a given video has been checked, and
where it got to, lives in people's heads and in chat.

The ask is one simple control per video that records that state.

## Scope

In scope:

- One QA status per `videos` row, persisted, with five values.
- An editable control in the dashboard details panel and in the editor header.
- A read-only token on the dashboard project row.
- Attribution: who set it, and when.

Out of scope, deliberately:

- Any behaviour attached to a label. Nothing reads `qaStatus` to gate, trigger,
  deploy, notify or filter. These are labels that get saved and shown, and that
  is the whole feature. Stated by the requester in as many words.
- Filtering or sorting the dashboard by status. Obvious next ask, not this one.
- Realtime sync of the value between open clients.
- A status history table.
- Comparison (dual) projects. See Limitations.
- Closing the shared-visibility gap. See Limitations.

## Values

Five, ordered as the work flows:

| Value | Meaning |
| --- | --- |
| `not_started` | Nobody has looked at it. Renders as `UNREVIEWED` |
| `in_review` | Being QA'd right now |
| `failed` | QA found blocking issues |
| `staging` | Tested, released to staging |
| `production` | Tested, released to production |

The literal ask named only tested-and-released-to-staging-or-production. `failed`
is added because a QA control with no way to say "this did not pass" forces
reviewers to leave the video in a state that lies, and `not_started` has to exist
because it is what every one of the 171 existing rows is.

One ordered enum rather than two fields (QA outcome x release target). Two fields
is a 3x3 grid that has to invent rules for combinations like failed-QA-in-
production, in exchange for precision nobody asked for.

## Data model

Three columns on `videos`. No new table, no new row.

```sql
ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS "qaStatus" text NOT NULL DEFAULT 'not_started';

ALTER TABLE public.videos
    DROP CONSTRAINT IF EXISTS videos_qa_status_check;

ALTER TABLE public.videos
    ADD CONSTRAINT videos_qa_status_check
    CHECK ("qaStatus" IN ('not_started', 'in_review', 'failed', 'staging', 'production'));

ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS "qaStatusUpdatedAt" timestamptz;

ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS "qaStatusUpdatedBy" uuid
        REFERENCES public.users(id) ON DELETE SET NULL;
```

`NOT NULL DEFAULT 'not_started'` is the load-bearing part, for the same reason it
was on `annotations.surface`: every existing row backfills to a real value. A
nullable column means the control renders empty on all 171 rows and every read
site has to invent a fallback.

`qaStatusUpdatedBy` is `ON DELETE SET NULL`, not cascade. Deleting a user must
never delete the video they last touched.

### Why a column and not a `video_qa_status` table

A side table keeps `videos` untouched and would generalise to comparisons the way
`annotations` does with its nullable `videoId` / `comparisonVideoId` pair. It
costs a join or a second fetch on the dashboard list, the details panel and the
editor, plus upsert semantics for a row that may not exist yet. That is real
weight for generality this feature does not need. A column rides along on the
`select *` those three places already do.

### Why not a status column on `comparison_videos` too

Deliberately skipped. Comparisons are made by hand in the app; the things that go
through QA and get released are pipeline outputs, which are always `videos` rows.
Mirroring the column would double the write path and the UI for a case nobody
asked for.

## Write path

Direct `UPDATE` on `videos` is `auth.uid() = "ownerId"` today, verified against
prod. QA is done by people who are not the uploader, so the status has to be
settable by any signed-in user who can see the video.

Row-level security is row level, not column level. Opening the UPDATE policy to
`authenticated` would also let any account rename, re-URL, or flip `isPublic` on
any video in the system. So the write goes through a function instead, and the
UPDATE policy is not touched.

```sql
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
    -- whole function exists to avoid.
    --
    -- FOUND is the right test here and was verified against this database, not
    -- assumed: an UPDATE ... RETURNING * INTO that matches no row leaves FOUND
    -- false and the target variable null. (SELECT INTO and UPDATE INTO differ
    -- enough in this area that the check is worth not guessing at.) Do not
    -- "simplify" this to a v_row.id IS NULL test without re-running that probe.
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

The raise on `NOT FOUND` is the point of the design. A policy-gated write that
matches no row returns 2xx with zero rows affected, which the frontend cannot
tell from success. This branch has already been bitten by that class of bug twice
(see the orphan cleanup in `findOrCreateOutputVideo` and the deploy gate notes).
An exception reaches the client as a PostgREST error and cannot be mistaken.

`RETURNS public.videos` so the caller gets the authoritative
`qaStatusUpdatedAt` / `qaStatusUpdatedBy` back rather than guessing them.

## Frontend

### Service

`VideoService.setQaStatus(videoId, status): Promise<Video>` wraps the RPC and
routes failures through `handleServiceError`, matching every other method on that
class. RPC is already the house pattern for writes that need more than a policy
(`annotationService.ts:505`, `commentService.ts:155`).

Reads need no code at all. `Project.video` is a full `Video` row, so the three
new fields arrive wherever a video already does, once added to `DatabaseVideo`
and `Video` in `src/types/database.ts`.

### Where the control lives

| Component | Treatment |
| --- | --- |
| `VideoDetailsPanel` | The editable control, in its own bordered block under the stat row, matching the Watched block above it. |
| `AnnotationPanel` | The same control, as one bordered row directly under the panel header and above the category filter. QA finishes in the editor; making people go back to the library, find the video and inspect it just to record the verdict is how a status goes stale. |
| `ProjectListItem` | Read-only pill in a fixed-width column at the right edge of the row, after the watch-coverage chip. |

Not `EditorHeader`. That row is `AppHeader`, shared with the dashboard, and it
holds identity plus three icon buttons under a stated rule of one hover colour
for all of them, because three competing accents were the loudest thing in the
old bar. A five-value dropdown there would be the loudest thing in the new one.
The annotation rail is the editor's per-video sidebar and the direct analogue of
`VideoDetailsPanel`, so the control goes in the same kind of bordered block it
occupies there.

Two cases render no control at all, in the rail and everywhere else:

- Dual projects. The column is on `videos`.
- Shared-link and anonymous views (`isSharedVideo`, `isSharedComparison`, or no
  signed-in user). A share recipient is outside the QA process, and the RPC would
  reject them anyway. Hiding it is better than showing a control that always
  fails, and it keeps internal release state out of an external share.

There is no read-only-for-some-users case to design for: any signed-in user who
can see a video can also write its status, so the same predicate covers both.

### Visual language

The app is deliberately monochrome: mono meta tokens, one hover colour per
region, no competing accents. The status control follows that and adds nothing
new.

- Token text: `font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-400`,
  the same class the duration, FPS, date and annotation-count tokens use.
- Section heading in the details panel: the existing eyebrow,
  `text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400`.
- Labels render uppercase: `UNREVIEWED`, `IN REVIEW`, `FAILED`, `STAGING`,
  `PRODUCTION`. The label functions are total: anything that is not one of the
  five, `undefined` included, renders as `UNREVIEWED` with the `not_started`
  treatment, and warns once to the console. A pill with no text is a 96px empty
  outline that reads as a progress bar, and that is exactly what a frontend
  running ahead of the migration produces on every row.
- One exception to the greyscale: `FAILED` is `text-red-600 dark:text-red-400`,
  the app's only accent, already used for destructive and error states. It is the
  one status that has to catch the eye in a list of 171 rows.
- The control is a native `<select>`, already used in `video/VideoControls.vue`
  for playback speed. Keyboard, screen reader and mobile behaviour come free, and
  it needs no menu, no popover, no outside-click handling. Styled
  `appearance-none` with no border until hover and focus, so at rest it reads as
  one more meta token that happens to be editable.
### The dashboard pill

The list row is where the status has to be readable at a glance across 171 rows,
so it gets more shape than a bare meta token: a pill, in a fixed-width column at
the right edge, after the watch-coverage chip. Because the pill is the last
element in the row and has a fixed width, both its edges land at the same x on
every row, and the column scans vertically. That is the entire reason for the
fixed width; a hug-content pill would put every left edge somewhere different and
you would be back to reading row by row.

This knowingly reverses a decision recorded in `ProjectListItem.vue`: everything
below the title was flattened into one mono meta line "so the row has a single
reading order instead of pills competing along both edges." The reversal is
narrow and keeps the reason intact. One pill, at one edge, in one column. The
meta line stays flat, and nothing returns to the left edge.

Every row shows a pill, including `not_started`. This is the one place the
suppressed-at-zero rule the watch chip uses does not apply: the point of the
column is telling states apart at a glance, and an empty slot cannot be told from
a row whose data has not arrived.

Three visual weights, which is as much separation as the palette allows without
adding accents:

| Status | Treatment |
| --- | --- |
| `not_started` | Faint grey border, muted grey text. Present but recedes. |
| `in_review` | Grey border, meta-grey text. |
| `failed` | Red border and red text, `text-red-600 dark:text-red-400`. |
| `staging` | Grey border, full-strength foreground text. |
| `production` | Solid fill: dark background with white text in light mode, inverted in dark mode. The terminal state, and the only one that reads as filled. |

A colour per state would scan faster still, and was rejected: five new accents in
an app whose own header comment says three were already the loudest thing in the
bar. Weight carries the difference instead of hue, which also survives
colour-blind viewing and greyscale printing.

Under the details panel control, attribution on one grey line:
`SET BY <name> · <relative time>`, using `formatRelativeTime` and the owner name
already resolved by `fetchOwners`. Hidden when `qaStatusUpdatedAt` is null.

In the editor rail the same line renders as `SET · <relative time>`, with no
name. The rail has no owner lookup: `EditorView` holds the video as a
`Partial<Video>` and `fetchOwners` is keyed on owner ids the dashboard has
already batched. Showing the timestamp without a name beats showing nothing, and
beats resolving a name that would be the owner rather than the person who set the
status. It goes away with the same follow-up that fixes the details panel's
owner-versus-setter approximation.

### Behaviour

The select applies optimistically: the local value changes on `change`, the RPC
runs, and on failure the previous value is restored and a toast fires through
`useNotifications`. The optimistic path is what keeps a five-value dropdown from
feeling like a form submission; the rollback is what keeps it honest.

Last write wins. Two reviewers setting a status at the same moment means one of
them silently loses, and the `SET BY` line is what makes that visible afterwards.
Acceptable for a label; realtime sync is out of scope.

## Limitations

**Most videos are visible only to their uploader.** Checked against prod: of 63
pipeline outputs (`videoId LIKE 'aws:%'`), spread across 4 owners, only 2 are
visible to anyone but their owner. RLS on `videos` allows SELECT on your own
rows, public rows, and rows in a public comparison, so
`getAllProjects({ scope: 'all' })` returns far less than "all". This predates the
feature and is not fixed by it: in practice the QA control will mostly be set and
read by the uploader. Making it a team signal means opening SELECT on `videos` to
`authenticated`, which is a separate decision with its own blast radius, to be
raised separately.

**No pipeline meaning.** `staging` and `production` are hand-set bookkeeping. If
a deploy system is the real source of truth for those two, the label will drift
and start lying. Stated and accepted: the requester wants labels that are saved,
not an integration.

**Per video row, not per surface.** The editor shows Video and Pipeline output as
two tabs over one `videos` row, and annotations are scoped per tab by
`annotations.surface`. QA status is deliberately not: one status describes the
match, and the control shows the same value on both tabs.

## Testing

Unit, alongside the existing suites in `src/components/__tests__` and
`src/services/__tests__`:

- `ProjectListItem` renders a pill for all five values, `not_started` included.
- Every pill has the same width, so the column aligns.
- `ProjectListItem` renders no pill for a dual project.
- `FAILED` carries the accent class and no other status does; `production` is the
  only filled pill.
- `VideoService.setQaStatus` returns the updated row on success, and surfaces a
  raised exception as a thrown error rather than a silent resolve.
- The details panel select rolls back to the previous value and notifies when the
  service throws.

Against the database, before the frontend merges, since neither can be caught by
a unit test:

- Call the RPC as a non-owner on a private video. Expect an exception, not a 2xx
  with the value unchanged.
- Call it as a non-owner on a public video. Expect success and correct
  attribution.
- Call it with a bogus status. Expect the explicit raise.
- Confirm `anon` cannot execute it. Not by inference from a null `auth.uid()`,
  which is a different thing: ask the catalog directly.

  ```sql
  select has_function_privilege('anon',          'public.set_video_qa_status(uuid,text)', 'EXECUTE') as anon_can,
         has_function_privilege('authenticated', 'public.set_video_qa_status(uuid,text)', 'EXECUTE') as auth_can;
  ```

  Expect false, true.

- Confirm the function's visibility predicate is not broader than the table's
  own SELECT policies. It is documented as mirroring them, and a `SECURITY
  DEFINER` function that `RETURNS public.videos` hands the caller a whole row, so
  a predicate wider than the policies would leak a row they cannot otherwise
  read.

  ```sql
  select policyname, qual from pg_policies
  where tablename = 'videos' and cmd = 'SELECT';
  ```

  Checked against prod on 2026-08-21, before the function existed: the three
  SELECT policies are `auth.uid() = "ownerId"`, `"isPublic" = true`, and
  membership of a public comparison. The function's three predicate branches are
  exactly those. Re-run this whenever either side changes.

`videos.id` is `uuid` and `users.id` is `uuid`, both confirmed against prod, so
the `set_video_qa_status(uuid, text)` signature resolves and the REVOKE and GRANT
lines target a function that exists.

## Rollout

Migration first, to prod, verified; frontend after. Same rule the last two commits
on this branch encode, and for the same reason: the frontend reads columns and
calls a function that must already exist.

Note that this branch will then carry two frontend changes pending against live
schema, `annotations.surface` and the QA columns.
