# Editing QA status from the dashboard list

Date: 2026-08-22
Status: approved, not yet implemented

## Problem

Setting a video's QA status takes three clicks: click the row, wait for the
details panel, use the select. A reviewer working down a list of 171 videos does
that once per video. The status is already visible on every row; only the
editing is behind a panel.

## Scope

In scope:

- The dashboard list's status pill becomes an editable control.
- One shared write path, so the list and the panel cannot drift.

Out of scope, deliberately:

- Bulk edit or multi-select. A different feature with its own questions.
- Any change to who may set a status, or to the five values.
- Attribution in the list row. There is no room, and the details panel has it.
- Comparison projects, which have no status. Their reserved slot stays empty.

## The control

A native `<select>` wearing the pill's shape, not a custom popover.

Same `w-24 shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px]`
geometry and the same five weights from `qaStatusPillClass`, plus
`appearance-none` and `text-center`. At rest it is pixel-identical to the
read-only pill it replaces, so the column keeps scanning exactly as it does now.

A native control rather than a menu we own: keyboard, screen reader, touch and
OS-level list positioning all come free, and the menu opens above or below by
itself near the bottom of a long list. The same reasoning already chose a
native select for the details panel and for playback speed in `VideoControls`.

### Affordance

Nothing at rest. On hover the border firms up and the cursor changes; that is
the entire signal.

The firming is a neutral **ring**, not a border-colour change:
`hover:ring-2 hover:ring-gray-200 dark:hover:ring-white/10`. A border-colour
hover would have to work against five different palettes, and `production` is a
filled pill whose border is part of its fill. A ring sits outside all of that,
costs no layout, and reads the same on every weight.

Focus keeps the convention the panel select already uses,
`focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400`, which clears the
3:1 non-text contrast minimum in both themes.

Rejected: a permanent caret. It would be 171 chevrons in a design that has been
removing ornament, and it eats width the label needs.

## Decomposition

The write path acquires a second caller. It must not acquire a second copy: this
is the logic that produced the one Critical finding in the feature's final
review, where a write resolving after the row swapped wrote one video's row onto
another. Duplicating it would duplicate that class of bug in a component that
renders 171 times.

| File | Responsibility |
| --- | --- |
| `src/composables/useQaStatusWrite.ts` | New. The whole write path: displayed value, `saving`, the target id captured across the await, rollback, error toast. |
| `src/components/QaStatusSelect.vue` | Panel and rail control: eyebrow, select, attribution line. Delegates the write. |
| `src/components/QaStatusPillSelect.vue` | New. The list control: a select wearing the pill. Delegates the write. |
| `src/components/QaStatusPill.vue` | Unchanged, still read-only. Now used by the filter panel's rows rather than the list. |

The composable's contract:

```ts
export function useQaStatusWrite(
  target: () => QaStatusTarget,
  onUpdated: (video: Video) => void
): {
  current: Readonly<Ref<QaStatus>>;
  updatedAt: Readonly<Ref<string | undefined>>;
  saving: Readonly<Ref<boolean>>;
  change: (next: QaStatus) => Promise<void>;
};
```

`target` is a getter, not a value, so the composable can re-read the prop after
an await and compare ids. That comparison is the fix for the swap bug and must
move across intact, not be re-derived: on resolve, if the target's id no longer
matches the id the write started on, apply nothing and emit nothing; on reject,
roll back only if it still matches, but notify either way, because the user
needs to know their save failed even after switching away.

Moving this is a refactor of reviewed, tested code. Its existing tests move with
it and must keep passing unchanged in substance.

## Row interaction

`ProjectListItem`'s row div is both a click target (opens the details panel) and
`draggable="true"`. Both collide with a control inside it:

- `@click.stop` and `@mousedown.stop` on the select, so opening the menu does
  not also select the project.
- `draggable="false"` on the select, so a mousedown on it starts a menu rather
  than a drag.

Neither is defensive. Without the first, every status change also opens the
panel; without the second, the control is unusable by mouse.

Keyboard needs nothing extra: the row's handler is a click handler on a div and
is not keyboard-reachable, so tabbing to the select and pressing Enter or Space
opens the menu with no conflict.

## Write-back

Up, not sideways. `ProjectListItem` emits `qa-status-updated`, and
`DashboardView` folds the result into the project it owns through the existing
`mergeQaStatusUpdate`.

The list row and the details panel already reference the same project object -
`DashboardView`'s `projects` array is not cloned on its way to either - so one
merge updates both surfaces. The row does not mutate its own prop.

## Changing a status while a filter is active

Changing a row's status can immediately drop it out of a filtered list. That is
correct, and consistent with every other filter here, but abrupt when the user
caused it themselves.

So: let the row go, and fire a **success** toast in that one case, naming what
happened - title `Marked staging`, message `Hidden by the current filter.`.
(Sentence case on the status word, not the all-caps `qaStatusLabel` output
verbatim: every other toast title in the app is sentence case, and this one
follows that convention rather than breaking it.) Every other successful write
stays silent, as today. A toast on every change would be noise in a list built
for working down quickly.

The condition is narrow and testable: an active status filter that does not
include the newly chosen status.

## Limitations

**A scanning column is now clickable.** The pill column exists to be read at a
glance, and columns you read are not usually columns you can change by accident.
A stray click can now alter a status. Accepted because the change is one click
to undo, it is attributed to whoever made it, and the alternative is keeping a
three-click edit for the app's most repeated action. Worth revisiting if
accidental changes actually show up.

**No attribution in the row.** The pill has no room for it. The details panel
remains the place that says who set a status and when.

## Testing

The composable, directly, taking over the race tests that live in the select's
suite today:

- A resolved write applies and emits when the target is unchanged.
- A write resolving after the target's id changed applies nothing and emits
  nothing.
- A rejected write rolls back when the target is unchanged.
- A rejected write does NOT roll back after a target change, but still notifies.
- `saving` is released in every one of those cases.

`QaStatusPillSelect`:

- Renders the five options with the pill's geometry and the current value.
- A click on it does not fire the row's click handler.
- Disabled while a write is in flight.

`ProjectListItem`:

- A dual project still reserves the 96px slot and renders no control.
- The `qa-status-updated` emit carries the project and the updated video.

`DashboardView`:

- A change that a filter excludes fires the success toast; one that stays
  visible does not.
