# Timeline Comment Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an annotator type a free-text comment onto a specific video frame straight from the timeline quick pick, by pressing `C`, without touching the sidebar.

**Architecture:** `AnnotationQuickPick` gains a second mode. The root screen keeps its category columns and adds a `C  Comment` row; entering comment mode swaps the columns for a single-line input. Committing emits text that `EditorView` turns into an ordinary annotation with an empty `labelIds`, which `buildAnnotationPayload` already handles. No database, service, or migration work. Comment markers render as a hollow ring on the timeline so they read as notes rather than events.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Tailwind, Vitest (jsdom per-file via `// @vitest-environment jsdom`), mounting with `createApp` + `h` (no `@vue/test-utils` in this repo).

**Spec:** `docs/superpowers/specs/2026-08-17-timeline-comment-annotations-design.md`

## Global Constraints

- **Never use the em dash `—` in prose you write**, including code comments and commit messages. Use a plain dash `-`. Existing file content you are not otherwise rewriting stays as it is.
- **No agent attribution in commits.** No `Co-Authored-By` trailer, no "Generated with Claude Code" footer.
- **A comment is an annotation with no labels.** It must never create a row in the labels catalog.
- **No database, migration, or `annotationService` changes.** If a task seems to need one, stop and raise it.
- **Test baseline before any change: 19 files, 103 tests, all passing** (`npm test`). The suite must stay green.
- **Typecheck baseline: 94 pre-existing errors** (`npx vue-tsc --noEmit 2>&1 | grep -cE "error TS"`). `AnnotationQuickPick.vue` and `VideoTimeline.vue` contribute **zero** of them and must keep contributing zero. `EditorView.vue` contributes 12 and must not grow. Do not attempt to fix pre-existing errors; that is out of scope.
- Category shortcut letters are `E` (EVT), `P` (PITCH), `T` (TEAM), `N` (NPL), `L` (PLR), `B` (BALL). `C` is free at the root screen only.

---

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/components/AnnotationQuickPick.vue` | The panel: pick mode, comment mode, keyboard routing, positioning | Modify |
| `src/components/__tests__/annotationQuickPick.test.ts` | Panel behaviour: mode entry, key routing, commit, reset | Create |
| `src/utils/annotationPayload.ts` | Turns a label or comment plus a frame into a service payload; owns the "what is a comment" predicate | Modify |
| `src/utils/__tests__/annotationPayload.test.ts` | Payload and predicate unit tests | Modify |
| `src/views/EditorView.vue` | Wires panel events to `addAnnotation` and to playback | Modify |
| `src/components/VideoTimeline.vue` | Renders markers; draws comments as hollow rings | Modify |
| `src/components/__tests__/videoTimelineMarkers.test.ts` | Marker rendering for comment vs label annotations | Create |

`DualTimeline.vue` is deliberately untouched: it emits no `open-quick-pick`, so dual mode reaches the panel only via right-click on the player, which already works.

---

## Task 1: Comment mode in AnnotationQuickPick

This is the whole feature's risk. It is done first and in isolation, with no `EditorView` changes, so the panel can be proven correct before anything is wired to it.

**Files:**
- Modify: `src/components/AnnotationQuickPick.vue`
- Test: `src/components/__tests__/annotationQuickPick.test.ts` (create)

**Interfaces:**
- Consumes: `Label` from `@/types/labels`; `groupLabelsByCategory`, `assignLabelShortcuts`, `labelShortName` from `../utils/labelCategories` (all already imported).
- Produces, for Task 3:
  - `(e: 'comment', text: string)` - fired on commit, with **already-trimmed, non-empty** text.
  - `(e: 'comment-mode', active: boolean)` - `true` on entering comment mode, `false` on every exit route (Escape, commit, panel closing, reposition).
  - Existing `select` and `close` emits are unchanged.
  - The root `v-if` becomes `open` alone, so the panel now renders even when the label catalog has no recognised categories.

### Background the implementer needs

`handleKeydown` is registered on `window` in **capture phase** (`AnnotationQuickPick.vue:148`) and calls `preventDefault()` on every single A-Z character. If you add a text input without changing that handler, the input receives **nothing**. The guard added in Step 3 is the difference between this feature working and not working.

The panel is positioned **upward** from `props.y` using a measured height (`position` computed, `measure()`). Any change that alters the panel's height must be followed by `measure()` after `nextTick`, or the panel will sit in the wrong place.

Two global keydown listeners elsewhere (`useVideoPlayer.ts:366`, `DualTimeline.vue:138`) already bail when an `INPUT` or `TEXTAREA` is focused, so Space will not toggle playback while typing. This has been verified; no change is needed there.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/annotationQuickPick.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type Ref } from 'vue';
import AnnotationQuickPick from '@/components/AnnotationQuickPick.vue';
import type { Label } from '@/types/labels';

const makeLabel = (id: string, name: string): Label => ({
  id,
  name,
  color: '#f97316',
  isDefault: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

// BALL category (letter B). "MISSED" takes M, "CAUGHT" takes C, which is what
// makes the "C means comment only at the root" test meaningful.
const CAUGHT = makeLabel('label-caught', 'BALL CAUGHT');
const MISSED = makeLabel('label-missed', 'BALL MISSED');
const LABELS = [MISSED, CAUGHT];

interface Harness {
  root: HTMLElement;
  events: Array<[string, unknown]>;
  open: Ref<boolean>;
  x: Ref<number>;
  y: Ref<number>;
  unmount: () => void;
}

function mountPanel(labels: Label[] = LABELS): Harness {
  const events: Array<[string, unknown]> = [];
  const open = ref(true);
  const x = ref(400);
  const y = ref(400);

  const root = document.createElement('div');
  document.body.appendChild(root);

  const app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(AnnotationQuickPick, {
            open: open.value,
            x: x.value,
            y: y.value,
            labels,
            frame: 300,
            fps: 30,
            onSelect: (label: Label) => events.push(['select', label]),
            onComment: (text: string) => events.push(['comment', text]),
            onCommentMode: (active: boolean) =>
              events.push(['comment-mode', active]),
            onClose: () => events.push(['close', null]),
          });
      },
    })
  );
  app.mount(root);

  return {
    root,
    events,
    open,
    x,
    y,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

/** Dispatch on window, where the panel's capture-phase listener lives. */
const press = (key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
};

const commentInput = (root: HTMLElement) =>
  root.querySelector<HTMLInputElement>('[data-testid="quick-pick-comment"]');

const type = async (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await nextTick();
};

describe('AnnotationQuickPick comment mode', () => {
  it('enters comment mode on C at the root screen', async () => {
    const panel = mountPanel();
    await nextTick();

    press('c');
    await nextTick();

    expect(commentInput(panel.root)).not.toBeNull();
    expect(panel.events).toContainEqual(['comment-mode', true]);
    panel.unmount();
  });

  it('leaves C to its label inside a category', async () => {
    const panel = mountPanel();
    await nextTick();

    press('b'); // BALL category
    await nextTick();
    press('c'); // CAUGHT, not comment
    await nextTick();

    expect(commentInput(panel.root)).toBeNull();
    expect(panel.events).toContainEqual(['select', CAUGHT]);
    expect(panel.events.some(([name]) => name === 'comment-mode')).toBe(false);
    panel.unmount();
  });

  it('lets letters through to the input in comment mode', async () => {
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();

    const event = press('a');

    // The capture-phase window handler must not swallow this, or the input
    // would never receive a character.
    expect(event.defaultPrevented).toBe(false);
    panel.unmount();
  });

  it('commits trimmed text on Enter', async () => {
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();

    const input = commentInput(panel.root) as HTMLInputElement;
    await type(input, '  keeper off his line early  ');
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    await nextTick();

    expect(panel.events).toContainEqual(['comment', 'keeper off his line early']);
    panel.unmount();
  });

  it('does not commit whitespace-only text', async () => {
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();

    const input = commentInput(panel.root) as HTMLInputElement;
    await type(input, '   ');
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    await nextTick();

    expect(panel.events.some(([name]) => name === 'comment')).toBe(false);
    panel.unmount();
  });

  it('returns to the category screen on Escape without closing', async () => {
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();

    press('Escape');
    await nextTick();

    expect(commentInput(panel.root)).toBeNull();
    expect(panel.events).toContainEqual(['comment-mode', false]);
    expect(panel.events.some(([name]) => name === 'close')).toBe(false);
    panel.unmount();
  });

  it('discards the text when comment mode is left', async () => {
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();
    await type(commentInput(panel.root) as HTMLInputElement, 'half a thought');

    press('Escape');
    await nextTick();
    press('c');
    await nextTick();

    expect((commentInput(panel.root) as HTMLInputElement).value).toBe('');
    panel.unmount();
  });

  it('resets comment mode when reopened at a new position', async () => {
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();

    panel.x.value = 700;
    panel.y.value = 500;
    await nextTick();

    expect(commentInput(panel.root)).toBeNull();
    expect(panel.events).toContainEqual(['comment-mode', false]);
    panel.unmount();
  });

  it('reports leaving comment mode when the panel closes', async () => {
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();

    panel.open.value = false;
    await nextTick();

    expect(panel.events).toContainEqual(['comment-mode', false]);
    panel.unmount();
  });

  it('still offers the comment row when no label has a category', async () => {
    const panel = mountPanel([makeLabel('label-loose', 'Something uncategorised')]);
    await nextTick();

    press('c');
    await nextTick();

    expect(commentInput(panel.root)).not.toBeNull();
    panel.unmount();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/annotationQuickPick.test.ts`

Expected: FAIL. Most cases fail on `commentInput(...)` being `null` because nothing renders a `[data-testid="quick-pick-comment"]` element yet. The "still offers the comment row when no label has a category" case fails because the panel's root `v-if` currently requires `categories.length > 0` and renders nothing at all.

- [ ] **Step 3: Add mode state, emits and the keyboard guard**

In `src/components/AnnotationQuickPick.vue`, in `<script setup>`.

Widen the emits declaration:

```ts
const emit = defineEmits<{
  (e: 'select', label: Label): void;
  (e: 'comment', text: string): void;
  (e: 'comment-mode', active: boolean): void;
  (e: 'close'): void;
}>();
```

Add below the existing `activeCategory` ref:

```ts
/** Letter that opens the comment field. Free because no category claims it. */
const COMMENT_LETTER = 'C';

type QuickPickMode = 'pick' | 'comment';

const mode = ref<QuickPickMode>('pick');
const commentText = ref('');
const commentInputRef = ref<HTMLInputElement | null>(null);
```

Add the mode transitions next to `selectCategory`:

```ts
const enterCommentMode = () => {
  if (mode.value === 'comment') return;
  mode.value = 'comment';
  commentText.value = '';
  emit('comment-mode', true);
};

/**
 * Every exit from comment mode goes through here, so a listener that paused
 * playback on the way in is always told on the way out.
 */
const leaveCommentMode = () => {
  if (mode.value !== 'comment') return;
  mode.value = 'pick';
  commentText.value = '';
  emit('comment-mode', false);
};

const resetToRoot = () => {
  activeCategory.value = null;
  leaveCommentMode();
};

/** Whitespace-only text is not a comment, so it never leaves the panel. */
const commitComment = () => {
  const text = commentText.value.trim();
  if (!text) return;
  emit('comment', text);
  leaveCommentMode();
};
```

Replace `back()` with:

```ts
const back = () => {
  if (mode.value === 'comment') {
    leaveCommentMode();
    return;
  }
  if (activeCategory.value) activeCategory.value = null;
  else emit('close');
};
```

Replace the top of `handleKeydown` and add the `C` branch. The full handler becomes:

```ts
const handleKeydown = (event: KeyboardEvent) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  // This listener is on window in capture phase and preventDefault()s every
  // letter, so in comment mode it has to get out of the way or the input
  // receives no characters at all. Escape is the only key it still owns; Enter
  // is handled by the input's own binding.
  if (mode.value === 'comment') {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      back();
    }
    return;
  }

  if (event.key === 'Escape' || event.key === 'Backspace') {
    event.preventDefault();
    event.stopPropagation();
    back();
    return;
  }

  if (event.key.length !== 1) return;
  const key = event.key.toUpperCase();
  if (!/[A-Z]/.test(key)) return;

  if (activeCategory.value) {
    const row = labelRows.value.find((r) => r.letter === key);
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    commit(row.label);
    return;
  }

  // Root screen only. Inside a category assignLabelShortcuts may well have
  // handed C to a label, and the label has to win there.
  if (key === COMMENT_LETTER) {
    event.preventDefault();
    event.stopPropagation();
    enterCommentMode();
    return;
  }

  const group = categories.value.find((c) => c.letter === key);
  if (!group) return;
  event.preventDefault();
  event.stopPropagation();
  selectCategory(group);
};
```

- [ ] **Step 4: Fix the reset and measurement paths**

Still in `<script setup>`. Replace the `props.open` watcher body's reset and add a close-side reset:

```ts
watch(
  () => props.open,
  async (open) => {
    if (open) {
      resetToRoot();
      // Two belts here on purpose. The window listener is capture phase so the
      // player's own global shortcuts cannot consume the keys first, and moving
      // focus into the panel means the keys are delivered to it even if
      // something else owns focus when it opens. Whichever handler runs first
      // stops propagation, so a keystroke is never acted on twice.
      window.addEventListener('keydown', handleKeydown, true);
      await nextTick();
      panelRef.value?.focus({ preventScroll: true });
      measure();
    } else {
      window.removeEventListener('keydown', handleKeydown, true);
      // Closing while typing still has to report the mode change, or a paused
      // video would never be resumed.
      resetToRoot();
    }
  },
  { immediate: true }
);
```

Replace the reposition watcher:

```ts
watch(
  () => [props.x, props.y],
  () => {
    if (props.open) resetToRoot();
  }
);
```

Add a mode watcher next to the existing `activeCategory` one. The comment screen is much shorter than the two columns, and the panel is anchored upward from `props.y`, so it has to be re-measured:

```ts
watch(mode, async () => {
  await nextTick();
  if (mode.value === 'comment') {
    commentInputRef.value?.focus({ preventScroll: true });
  }
  measure();
});
```

- [ ] **Step 5: Render the comment row and the comment screen**

In the `<template>`, change the root `v-if` so a catalog with no recognised categories can still comment:

```html
<div
  v-if="open"
  class="fixed inset-0 z-50"
  @click="emit('close')"
  @contextmenu.prevent="emit('close')"
>
```

Replace the whole `<div class="flex min-h-[220px]">` block (categories column plus label column) with the following. The categories `<ul>` and its rows are unchanged apart from being wrapped in a flex column that carries the border, so the comment row can sit beneath them:

```html
<!-- Comment screen -->
<div v-if="mode === 'comment'" class="px-4 py-4">
  <label
    for="quick-pick-comment"
    class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400"
  >
    Comment
  </label>
  <input
    id="quick-pick-comment"
    ref="commentInputRef"
    v-model="commentText"
    data-testid="quick-pick-comment"
    type="text"
    autocomplete="off"
    placeholder="What happened on this frame?"
    class="w-full rounded border border-gray-300 bg-white px-3 py-2 text-[12px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-orange-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
    @keydown.enter.prevent="commitComment"
  />
</div>

<!-- Pick screen -->
<div v-else class="flex min-h-[220px]">
  <div
    class="flex w-[46%] shrink-0 flex-col border-r border-gray-200 dark:border-gray-700"
  >
    <!-- Categories -->
    <ul v-if="categories.length" class="flex-1 py-1.5">
      <li
        v-for="group in categories"
        :key="group.key"
        class="relative flex cursor-pointer items-center gap-2.5 px-4 py-1.5 transition-colors"
        :class="
          activeCategory?.key === group.key
            ? 'bg-gray-100 dark:bg-gray-700'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
        "
        @mouseenter="selectCategory(group)"
        @click="selectCategory(group)"
      >
        <span
          v-if="activeCategory?.key === group.key"
          class="absolute inset-y-0 left-0 w-[3px]"
          :style="{ backgroundColor: group.labels[0]?.color ?? '#6b7280' }"
        />
        <span
          class="grid h-6 w-6 shrink-0 place-items-center rounded border font-mono text-[11px] font-semibold"
          :class="
            activeCategory?.key === group.key
              ? 'border-transparent text-white'
              : 'border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300'
          "
          :style="
            activeCategory?.key === group.key
              ? { backgroundColor: group.labels[0]?.color ?? '#6b7280' }
              : undefined
          "
        >
          {{ group.letter }}
        </span>
        <span
          class="flex-1 text-[11px] font-medium tracking-[0.1em]"
          :class="
            activeCategory?.key === group.key
              ? 'text-gray-900 dark:text-gray-100'
              : 'text-gray-600 dark:text-gray-400'
          "
        >
          {{ group.key }}
        </span>
        <span class="font-mono text-[10px] text-gray-400 dark:text-gray-500">
          {{ group.labels.length }}
        </span>
      </li>
    </ul>
    <div
      v-else
      class="flex flex-1 items-center justify-center px-4 text-center text-[10px] tracking-[0.12em] text-gray-400 dark:text-gray-500"
    >
      No categories
    </div>

    <!-- Comment, always available: it needs no labels at all -->
    <button
      type="button"
      class="flex w-full items-center gap-2.5 border-t border-gray-200 px-4 py-2 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
      @click="enterCommentMode"
    >
      <span
        class="grid h-6 w-6 shrink-0 place-items-center rounded border border-gray-300 bg-gray-50 font-mono text-[11px] font-semibold text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
      >
        C
      </span>
      <span
        class="flex-1 text-[11px] font-medium tracking-[0.1em] text-gray-600 dark:text-gray-400"
      >
        COMMENT
      </span>
    </button>
  </div>

  <!-- Labels of the active category -->
  <ul v-if="labelRows.length" class="flex-1 py-1.5">
    <li
      v-for="row in labelRows"
      :key="row.label.id"
      class="flex cursor-pointer items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
      :title="row.label.description || row.label.name"
      @click="commit(row.label)"
    >
      <span
        class="grid h-6 w-6 shrink-0 place-items-center rounded border border-gray-300 bg-gray-50 font-mono text-[11px] font-semibold text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
      >
        {{ row.letter }}
      </span>
      <span
        class="h-2 w-2 shrink-0 rounded-full"
        :style="{ backgroundColor: row.label.color }"
      />
      <span
        class="text-[11px] font-medium tracking-[0.08em] text-gray-800 dark:text-gray-200"
      >
        {{ row.text }}
      </span>
    </li>
  </ul>
  <div
    v-else
    class="flex flex-1 items-center justify-center px-6 text-center text-[10px] tracking-[0.12em] text-gray-400 dark:text-gray-500"
  >
    Pick a category
  </div>
</div>
```

Replace the footer's contents:

```html
<footer
  class="border-t border-gray-200 px-4 py-2 text-[9px] tracking-[0.14em] text-gray-400 dark:border-gray-700 dark:text-gray-500"
>
  <span v-if="mode === 'comment'">Enter to save &middot; Esc to go back</span>
  <span v-else-if="activeCategory">Letter to label &middot; Esc to go back</span>
  <span v-else>Letter to pick a category &middot; C to comment &middot; Esc to close</span>
</footer>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/annotationQuickPick.test.ts`

Expected: PASS, 10 tests.

- [ ] **Step 7: Run the full suite and the typecheck**

Run: `npm test`
Expected: 20 files, 113 tests, all passing.

Run: `npx vue-tsc --noEmit 2>&1 | grep -cE "error TS"`
Expected: `94` (the pre-existing baseline, unchanged).

Run: `npx vue-tsc --noEmit 2>&1 | grep -c "AnnotationQuickPick"`
Expected: `0`.

- [ ] **Step 8: Commit**

```bash
git add src/components/AnnotationQuickPick.vue src/components/__tests__/annotationQuickPick.test.ts
git commit -m "feat: add a comment mode to the annotation quick pick"
```

---

## Task 2: Identify a comment annotation

A one-line predicate, but it encodes a non-obvious invariant and belongs next to the builder that creates the condition. Task 4 depends on it.

**Files:**
- Modify: `src/utils/annotationPayload.ts`
- Test: `src/utils/__tests__/annotationPayload.test.ts:1-120` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces, for Task 4: `isCommentAnnotation(annotation: { labels?: string[] | null }): boolean`, exported from `@/utils/annotationPayload`.

Note: the empty-`labelIds` payload shape is **already covered** by the existing test `titles from the content when no label matches` (`annotationPayload.test.ts:39`). Do not duplicate it.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/__tests__/annotationPayload.test.ts`, and add `isCommentAnnotation` to the existing import from `../annotationPayload`:

```ts
describe('isCommentAnnotation', () => {
  it('treats an annotation with no labels as a comment', () => {
    expect(isCommentAnnotation({ labels: [] })).toBe(true);
  });

  it('treats a missing labels array as a comment', () => {
    // A freshly created comment never has one written: useVideoAnnotations
    // only sets labels on the created object when the array is non-empty.
    expect(isCommentAnnotation({})).toBe(true);
    expect(isCommentAnnotation({ labels: null })).toBe(true);
  });

  it('does not treat a labelled annotation as a comment', () => {
    expect(isCommentAnnotation({ labels: ['label-ball-missed'] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/annotationPayload.test.ts`
Expected: FAIL - `isCommentAnnotation is not a function` (or a TS resolution error on the import).

- [ ] **Step 3: Write the implementation**

Append to `src/utils/annotationPayload.ts`:

```ts
/**
 * A comment is an annotation with no labels attached, created by the quick
 * pick's comment mode with an empty labelIds.
 *
 * The same test works for a stored and a just-created comment: annotationService
 * attaches a `labels` array of ids to every loaded annotation, and
 * useVideoAnnotations only sets one on a newly created annotation when the array
 * is non-empty, so a fresh comment simply has no `labels` property.
 */
export function isCommentAnnotation(annotation: {
  labels?: string[] | null;
}): boolean {
  return !annotation.labels?.length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/annotationPayload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/annotationPayload.ts src/utils/__tests__/annotationPayload.test.ts
git commit -m "feat: add a predicate for label-less comment annotations"
```

---

## Task 3: Wire the panel into EditorView

Wiring only. All the branching logic this feature needs was deliberately pushed into the panel (Task 1, trim and empty guards) and into `buildAnnotationPayload` (already tested), so there is nothing here that a unit test could hold onto, and this repo has no `EditorView` tests. Its gate is the typecheck, the unchanged suite, and the runtime check in Task 5.

**Files:**
- Modify: `src/views/EditorView.vue` (import at `:24`, quick pick block at `:275-390`, template at `:1337-1346`)

**Interfaces:**
- Consumes from Task 1: the `comment` and `comment-mode` emits, and the fact that `comment` text arrives trimmed and non-empty.
- Consumes existing: `buildAnnotationPayload` from `@/utils/annotationPayload`, `handleAddAnnotation`, `quickPickSnapshot`, `closeQuickPick`, `notifyError`, `isPlaying` (a `videoStore` ref), `unifiedVideoPlayerRef` (exposes `play()` and `pause()`).

- [ ] **Step 1: Drop the category gate**

`quickPickHasCategories` blocks both open handlers when no label carries a recognised category prefix. A comment needs no labels, so leaving it in place would make commenting impossible for such a catalog.

Delete the import on line 24:

```ts
import { groupLabelsByCategory } from '@/utils/labelCategories';
```

(It has no other use in this file - verify with `grep -n groupLabelsByCategory src/views/EditorView.vue` afterwards, which must return nothing.)

Delete the whole block at `:277-283`:

```ts
// AnnotationQuickPick renders nothing when none of the catalog's labels carry a
// recognised category prefix (see groupLabelsByCategory). The open handlers must
// guard on that same condition, not just a non-empty catalog, or right-click
// would suppress the native context menu while the panel renders nothing.
const quickPickHasCategories = computed(
  () => groupLabelsByCategory(quickPickLabels.value).length > 0
);
```

Delete this line from **both** `openQuickPick` and `openQuickPickAtTime`:

```ts
  if (!quickPickHasCategories.value) return;
```

Every other guard in both handlers stays exactly as it is (`quickPickReadOnly()`, `user.value`, drawing mode, and in `openQuickPick` the `.video-controls` check).

- [ ] **Step 2: Add the comment handlers**

Insert directly after `handleQuickPickSelect` (which ends at `:390`):

```ts
/**
 * Playback pauses while a comment is being typed, so the annotator keeps
 * looking at the frame they are describing, and resumes only if it had been
 * running. The frame itself comes from quickPickSnapshot, taken when the panel
 * opened, so this is purely about what is on screen.
 */
const commentModeWasPlaying = ref(false);

const handleQuickPickCommentMode = (active: boolean) => {
  if (active) {
    commentModeWasPlaying.value = isPlaying.value;
    unifiedVideoPlayerRef.value?.pause();
    return;
  }
  if (commentModeWasPlaying.value) unifiedVideoPlayerRef.value?.play();
  commentModeWasPlaying.value = false;
};

/**
 * A comment is an annotation with no labels: the text is the body, and a real
 * label can be attached later from the sidebar.
 */
const handleQuickPickComment = async (text: string) => {
  const snapshot = quickPickSnapshot.value;
  closeQuickPick();
  if (!snapshot) return;

  // The panel already trims and refuses empty text; this is the same last line
  // of defence as handleAddAnnotation's permission check.
  const content = text.trim();
  if (!content) return;

  try {
    await handleAddAnnotation(
      buildAnnotationPayload({
        labels: quickPickLabels.value,
        labelIds: [],
        content,
        frame: snapshot.frame,
        fps: snapshot.fps,
        dual: snapshot.dual,
      })
    );
  } catch (err) {
    console.error('Failed to create comment from quick pick:', err);
    notifyError(
      'Failed to add comment',
      err instanceof Error
        ? err.message
        : 'The comment could not be saved. Please try again.'
    );
  }
};
```

`unifiedVideoPlayerRef` is declared later in the file (`:393`), which is fine: both functions only read it when the user triggers them, long after setup has run.

- [ ] **Step 3: Bind the new events**

In the template at `:1337`, add two lines to the `<AnnotationQuickPick>` element:

```html
<AnnotationQuickPick
  :open="quickPickOpen"
  :x="quickPickX"
  :y="quickPickY"
  :labels="quickPickLabels"
  :frame="quickPickSnapshot?.frame ?? 0"
  :fps="quickPickSnapshot?.fps ?? 30"
  @select="handleQuickPickSelect"
  @comment="handleQuickPickComment"
  @comment-mode="handleQuickPickCommentMode"
  @close="closeQuickPick"
/>
```

- [ ] **Step 4: Verify nothing regressed**

Run: `grep -n "quickPickHasCategories\|groupLabelsByCategory" src/views/EditorView.vue`
Expected: no output.

Run: `npm test`
Expected: 20 files, 116 tests, all passing (103 baseline + 10 from Task 1 + 3 from Task 2).

Run: `npx vue-tsc --noEmit 2>&1 | grep -cE "error TS"`
Expected: `94`.

Run: `npx vue-tsc --noEmit 2>&1 | grep -c "EditorView"`
Expected: `12` (the pre-existing count for this file, unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/views/EditorView.vue
git commit -m "feat: save timeline comments as label-less annotations"
```

---

## Task 4: Draw comment markers as hollow rings

**Files:**
- Modify: `src/components/VideoTimeline.vue` (`TimelineAnnotation` at `:7-12`, marker markup at `:333-357`)
- Test: `src/components/__tests__/videoTimelineMarkers.test.ts` (create)

**Interfaces:**
- Consumes from Task 2: `isCommentAnnotation` from `@/utils/annotationPayload`.
- Produces: nothing other tasks depend on.

`VideoTimeline` has no store or provide/inject dependencies (it imports only `vue`, `logger` and `formatters`), so it mounts directly in jsdom.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/videoTimelineMarkers.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import VideoTimeline from '@/components/VideoTimeline.vue';

const LABELLED = {
  id: 'annotation-labelled',
  title: 'BALL MISSED',
  timestamp: 10,
  severity: 'high',
  labels: ['label-ball-missed'],
};

const COMMENT = {
  id: 'annotation-comment',
  title: 'keeper off his line early',
  timestamp: 20,
  labels: [] as string[],
};

function mountTimeline() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(VideoTimeline, {
            currentTime: 0,
            duration: 60,
            currentFrame: 0,
            totalFrames: 1800,
            fps: 30,
            annotations: [LABELLED, COMMENT],
          });
      },
    })
  );
  app.mount(root);
  return { root, unmount: () => { app.unmount(); root.remove(); } };
}

const dotFor = (root: HTMLElement, id: string) =>
  root
    .querySelector(`[data-annotation-marker][data-annotation-id="${id}"]`)
    ?.firstElementChild as HTMLElement | undefined;

describe('VideoTimeline markers', () => {
  it('fills a labelled marker with its severity colour', async () => {
    const t = mountTimeline();
    await nextTick();

    const dot = dotFor(t.root, 'annotation-labelled');
    expect(dot).toBeDefined();
    expect(dot!.style.backgroundColor).toBe('rgb(239, 68, 68)'); // high => #ef4444
    expect(dot!.className).toContain('border-white');
    t.unmount();
  });

  it('draws a comment marker as a hollow ring', async () => {
    const t = mountTimeline();
    await nextTick();

    const dot = dotFor(t.root, 'annotation-comment');
    expect(dot).toBeDefined();
    expect(dot!.style.backgroundColor).toBe('');
    expect(dot!.className).toContain('bg-transparent');
    expect(dot!.className).not.toContain('border-white');
    t.unmount();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/videoTimelineMarkers.test.ts`
Expected: FAIL - `dot` is `undefined`, because markers carry no `data-annotation-id` attribute yet.

- [ ] **Step 3: Write the implementation**

In `src/components/VideoTimeline.vue`, add the import beside the existing ones:

```ts
import { isCommentAnnotation } from '@/utils/annotationPayload';
```

Extend the narrowing interface at `:7`:

```ts
/* Narrow annotation typing for the template to satisfy TS plugin */
interface TimelineAnnotation {
  id?: string;
  title?: string;
  timestamp: number;
  severity?: string;
  /** Label ids. Empty or absent means this annotation is a comment. */
  labels?: string[];
}
```

Add beside `getSeverityColor`:

```ts
const isComment = (annotation: TimelineAnnotation) =>
  isCommentAnnotation(annotation);
```

Replace the marker block in the template. Note the new `data-annotation-id`, which is what the test hangs off:

```html
<div
  v-for="annotation in (annotations as unknown as TimelineAnnotation[])"
  :key="annotation?.id ?? `${annotation.timestamp}`"
  data-annotation-marker
  :data-annotation-id="annotation?.id"
  class="absolute top-0 bottom-0 cursor-pointer transition-all duration-200 z-5 hover:scale-110"
  :class="{
    'z-9': (selectedAnnotation as any)?.id === (annotation as any)?.id,
  }"
  :style="getAnnotationStyle(annotation as TimelineAnnotation)"
  :title="`${(annotation as any)?.title ?? 'Annotation'} (${formatTime((annotation as TimelineAnnotation).timestamp)})`"
  @click="handleAnnotationClick(annotation as TimelineAnnotation, $event)"
>
  <!--
    Labels are filled dots; a comment is a hollow ring, so a note reads
    differently from an event at a glance. Same size and hit area either way.
  -->
  <div
    class="w-4 h-4 rounded-full border-2 shadow-lg absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-90"
    :class="[
      isComment(annotation as TimelineAnnotation)
        ? 'border-gray-300 bg-transparent'
        : 'border-white',
      {
        'border-yellow-400 shadow-yellow-400/50 opacity-100 scale-110':
          (selectedAnnotation as any)?.id === (annotation as any)?.id,
      },
    ]"
    :style="
      isComment(annotation as TimelineAnnotation)
        ? undefined
        : { backgroundColor: getSeverityColor((annotation as any)?.severity) }
    "
  />
</div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/videoTimelineMarkers.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test`
Expected: 21 files, 118 tests, all passing.

Run: `npx vue-tsc --noEmit 2>&1 | grep -cE "error TS"`
Expected: `94`.

Run: `npx vue-tsc --noEmit 2>&1 | grep -c "VideoTimeline"`
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add src/components/VideoTimeline.vue src/components/__tests__/videoTimelineMarkers.test.ts
git commit -m "feat: draw comment markers as hollow rings on the timeline"
```

---

## Task 5: Verify in the running app

Unit tests cannot prove that keystrokes reach the input through the real capture-phase listener stack, that the panel sits in the right place after its height changes, or that the annotation lands on the right frame. This task does.

**Files:** none modified. This is a verification gate.

**Interfaces:** consumes everything from Tasks 1, 3 and 4.

Use the project's `verify` skill (`.claude/skills/verify/SKILL.md`) for the launch and drive details. Summary of what it says:

- `npm run dev -- --port 5174 --strictPort --host 127.0.0.1`
- `.env` sets `VITE_DEV_AUTH_BYPASS=true`, so the app auto-signs-in in 2-3 seconds. No login flow.
- Known good test video: **demoshort2**, id `95b16bb2-96af-4495-99d3-3c9bd3abd346`, reachable at `/video/95b16bb2-96af-4495-99d3-3c9bd3abd346`.
- Headless driving: `npm i playwright-core` in a scratch dir, `chromium.launch({ headless: true, channel: 'chrome' })`. Use `waitUntil: 'domcontentloaded'`, never `networkidle`.

- [ ] **Step 1: Launch the dev server and open the editor**

Run the dev server on port 5174 and navigate to `/video/95b16bb2-96af-4495-99d3-3c9bd3abd346`. Wait for the timeline to render.

- [ ] **Step 2: Drive the happy path and screenshot each state**

1. Press play, let it run a few seconds.
2. Left-click the timeline about a third of the way along. Screenshot: the quick pick is open above the pointer, showing the category column, the `C  COMMENT` row beneath it, and the frame code in the header.
3. Press `c`. Screenshot: the comment input, focused, with the same frame code still in the header. Confirm the panel has not drifted off the pointer or off-screen after shrinking.
4. Confirm the video is paused.
5. Type `keeper off his line early`. Screenshot: the characters are all in the input, none lost.
6. Press Enter.

- [ ] **Step 3: Check the result**

Confirm all of:

- The video resumed playing.
- A new marker sits on the timeline at the clicked position, drawn as a hollow ring, visually distinct from any labelled marker.
- The annotation appears in the sidebar with the comment text as its title/body, no label chip, gray colour.
- The marker's frame matches the frame shown in the panel header at step 2, not a later one. This is the frame-snapshot check.

- [ ] **Step 4: Check the escape hatches**

- Open the panel, press `c`, type something, press Escape: it returns to the category screen, the video resumes, and no annotation is created.
- Open the panel, press `c`, click outside the panel: it closes, the video resumes, and no annotation is created.
- Open the panel, press `b` then `c`: this selects the BALL CAUGHT label, **not** comment mode, and creates a labelled annotation.
- Open the panel, press `c`, press Enter with an empty field: nothing is created and the panel stays put.
- With the video playing, press `c` then type a word containing a space: the space goes into the input and does **not** toggle playback.

- [ ] **Step 5: Report**

Report what you saw, with the screenshots. Any pixel-level sloppiness in the panel (misalignment between the comment row and the category rows, the input's focus ring clipped by the panel's `overflow-hidden`, the panel sitting off-centre from the click) is a defect to fix before this task is done.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: <what the runtime check turned up>"
```

If nothing needed fixing, skip this step.

---

## Out of scope, already reported

`VideoTimeline.vue:355` colours every marker by `getSeverityColor(annotation.severity)`, but the quick pick never sets `severity`, so every quick-pick annotation renders amber regardless of its label's colour. Colouring markers by label colour, and replacing the now-inaccurate severity legend below the timeline, restyles every existing marker and is a separate decision. Do not do it in this plan.
