# Filtering the dashboard by QA status

Date: 2026-08-22
Status: approved, not yet implemented

## Problem

Every video now carries a QA status, shown as a pill in a column down the
dashboard list. With 171 videos the column tells you a row's state once you have
found the row, but it cannot answer the question the feature exists for: what is
still unreviewed, and what failed.

Named as the obvious next ask, and deliberately excluded, in
`docs/superpowers/specs/2026-08-21-video-qa-status-design.md`.

## Scope

In scope:

- Multi-select filtering of the dashboard project list by QA status.
- A QA STATUS section in the existing filter dropdown, above the labels.
- A count per status, so the panel answers "how much is left" without filtering.

Out of scope, deliberately:

- Sorting or grouping by status. See "Why no sort" below.
- Filtering anywhere but the dashboard list.
- Persisting the filter across reloads. The label filter does not persist
  either; scope is the only dashboard state that survives, and it is the only
  one worth surviving.
- Any change to what a status means or who can set it.

## Why no sort

Considered and rejected. The list already has a deliberate order: most recently
opened first, shipped in `2026-08-21-recently-opened-ordering-design.md` and
computed per user, so the list reflects your own work. A status sort competes
with that directly, and whichever wins, the other stops being true.

Filtering gets the same result without the collision. Filtering to FAILED gives
you the grouped view a sort would, and inside that result recent-opens ordering
still holds, so the row you touched last is still on top.

Group headers were the third option: one list, a header per status, recency
inside each group. It scans well, but it restructures the list and fights
pagination, which slices a flat array. Not worth it for a five-value enum.

## Semantics

One rule, already established by the label filter and now applied twice:

- **OR within a filter type.** Selecting FAILED and IN REVIEW shows both.
- **AND across filter types.** Status, labels, search text and folder all
  narrow together.

Selecting no status is not the same as selecting all five: an empty set means
the filter is off, exactly as `activeLabelIds` already behaves.

**Dual projects disappear when any status is active.** A comparison has no
`qaStatus` - the column is on `videos` only - so it can match no status. This is
correct rather than incidental, but it is surprising enough to state: turning on
a status filter hides every comparison in the list.

## The panel

The dropdown behind the FILTER button today is a `w-64` card with one header
("Filter by label") and a list of label rows. It gains a second section.

```
┌──────────────────────────────┐
│ FILTER                 CLEAR │
├──────────────────────────────┤
│ QA STATUS                    │
│  ( UNREVIEWED )      169     │
│  ( IN REVIEW   )       0     │
│  ( FAILED      )       2  ✓  │
│  ( STAGING     )       0     │
│  ( PRODUCTION  )       0     │
├──────────────────────────────┤
│ LABELS                       │
│  ● ball missed           ✓   │
│  ● pitch lines mismatch      │
└──────────────────────────────┘
```

Changes to the existing card:

- The header text becomes `Filter`, since the card no longer filters only by
  label. `Clear` clears both types and shows whenever either is active.
- Two section eyebrows, `QA STATUS` and `LABELS`, in the existing eyebrow style
  (`text-[10px] font-semibold uppercase tracking-[0.18em]`), separated by the
  same `border-b` the card header already uses.
- Status rows reuse the existing label-row shape: full-width button, hover
  tint, trailing check when active.

Each status row renders the real `QaStatusPill` rather than plain text. The
option then looks exactly like the thing it filters for, which is the whole
argument for having built a pill in the first place, and it costs no new
component.

Note the pill's remaining home. `2026-08-22-qa-status-inline-edit-design.md`
turns the list's pills into editable selects, so after both changes this panel
is the only place the read-only `QaStatusPill` renders.

All five statuses always render, including ones with a count of zero. The list
is a fixed vocabulary, not a discovered one: hiding empty statuses would make
the panel's contents shift as data changes, and "nothing is in staging" is
itself an answer.

### The counts

Each status shows how many projects carry it, in the mono meta style.

The subtlety worth getting right: a count is computed against the list with
**every other filter applied but not the status filter itself**. Fold the status
filter into its own counts and selecting FAILED drops the other four to zero,
which makes the panel useless exactly when you are using it. Respecting folder,
scope, search and labels keeps the numbers honest about the list you are looking
at.

Counts are of projects the filter could return, so dual projects are excluded
from all five, consistent with them being filtered out.

## State and placement

One ref in `DashboardView`:

```ts
const activeQaStatuses = ref<Set<QaStatus>>(new Set());
```

- Added to the `filteredProjects` chain, after the label filter.
- Added to the existing watcher on `[scope, searchQuery, currentFolderId,
  activeLabelIds]` that resets `currentPage` to 1. A filter that leaves you on
  page 4 of a 2-page result shows an empty list.
- Toggled through a `toggleQaStatusFilter(status)` that replaces the Set rather
  than mutating it, mirroring `toggleLabelFilter`, because the watchers compare
  by reference.
- The FILTER button's active styling and its badge currently key on
  `activeLabelIds.size`. Both become the total across the two filter types.

### A new module, not `qaStatus.ts`

The predicate and the counts go in `src/utils/qaStatusFilter.ts`:

```ts
export function filterByQaStatus<T>(
  projects: T[],
  active: ReadonlySet<QaStatus>,
  statusOf: (project: T) => QaStatus | null
): T[];

export function countByQaStatus<T>(
  projects: T[],
  statusOf: (project: T) => QaStatus | null
): Record<QaStatus, number>;
```

Generic over the project type and taking a `statusOf` accessor, so neither
function needs to know about `Project`'s discriminated union or import it. A
`null` return means "has no status" - the dual-project case - and never matches
a filter, never counts.

Not added to `src/utils/qaStatus.ts`. The final whole-branch review of the QA
status feature flagged that module as already outgrowing its stated contract of
"pure vocabulary" once `resolveQaStatusTarget` and `mergeQaStatusUpdate` landed
in it. Filter logic is the change that would tip it into a junk drawer.

`DashboardView` supplies the accessor, which is the only place that knows the
union:

```ts
const statusOf = (p: Project) =>
  p.projectType === 'single' ? p.video.qaStatus : null;
```

## Testing

Both functions are pure, so none of this needs `DashboardView` mounted:

- An empty active set returns every project, rather than none.
- OR within statuses: FAILED plus IN REVIEW returns both, and nothing else.
- A project whose `statusOf` returns null never matches, whatever is selected.
- Counts cover all five keys, including statuses with zero projects.
- Counts ignore the status filter but reflect the list handed in, verified by
  passing a pre-filtered list and seeing smaller numbers.

In `DashboardView`, one integration-level check that the chain composes: a
status filter and a label filter active together return only projects matching
both, since AND-across-types is the rule most likely to be broken by a later
edit to the chain.

## Limitations

**Counts are of the loaded page set, not the database.** `getAllProjects` loads
every visible project into memory already, and the dashboard filters that array,
so the counts are complete today. If the list ever paginates server-side, the
counts silently become "of what is loaded" and would need to move to a query.

**No indication in the list that a status filter is on**, beyond the FILTER
button's badge and the result count. Acceptable while the badge exists; worth
revisiting if filters ever stack deeper.
