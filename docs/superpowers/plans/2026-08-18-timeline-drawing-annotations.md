# Timeline Drawing Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user press `D` in the timeline quick pick, draw on the video, and press Enter to save the strokes as an annotation, in the same flow that already produces labels and comments.

**Architecture:** A third mode (`draw`) is added to `AnnotationQuickPick` alongside `pick` and `comment`. In draw mode the panel's full-screen backdrop becomes click-through and the panel collapses to a toolbar, so the drawing canvas underneath receives the pointer. The panel itself never touches a canvas: it emits `draw-mode`, `draw`, `draw-undo`, `draw-color` and `draw-width`, and `EditorView` translates those into `useDrawingCoordinator` calls, exactly as it already translates `comment-mode` into pause and resume.

**Tech Stack:** Vue 3 `<script setup>` with TypeScript, Tailwind CSS 4, Fabric.js 6 for the canvas, Vitest with jsdom for tests.

**Spec:** `docs/superpowers/specs/2026-08-18-timeline-drawing-annotations-design.md`

## Global Constraints

- **No em dashes** anywhere: code, comments, commit messages, docs. Use a plain dash.
- **No agent attribution** on commits: no `Co-Authored-By` trailer.
- Run tests with `npm test` (`vitest run`). Test files live beside their subject in `__tests__/` and are named `<subject>.test.ts`. Component tests need `// @vitest-environment jsdom` as the first line, because `vitest.config.ts` sets the default environment to `node`.
- Comments explain **why**, not what. Match the density and tone of the surrounding code, which is heavily commented at decision points and bare elsewhere.
- The six drawing colours are exactly `#ef4444`, `#f97316`, `#fbbf24`, `#22c55e`, `#3b82f6`, `#ffffff`. The three stroke widths are exactly `2`, `4`, `8`.
- Every exit from draw mode must emit `draw-mode(false)` exactly once. `openQuickPick` and `openQuickPickAtTime` both bail while `isDrawingMode` is true, so a stranded mode locks the user out of the entire flow.

---

## File Structure

**Modified:**

- `src/utils/annotationPayload.ts` - title fallback, widened save rule, two new predicates. The single place that decides what an annotation is.
- `src/components/DrawingCanvas.vue` - two new exposed methods (`undoLastStroke`, `discardCurrentSession`) and the visual cleanup.
- `src/types/component-interfaces.ts` - `DrawingCanvasExpose` gains the two methods.
- `src/composables/useDrawingCoordinator.ts` - single/dual branching for the new canvas methods, plus `setStrokeWidth`, `getInProgressDrawing` and `retainDrawing`. Consumers stay free of `isDual()`.
- `src/components/AnnotationQuickPick.vue` - the `draw` mode, its toolbar and its keyboard branch.
- `src/views/EditorView.vue` - the `draw-*` handlers, mirroring the existing `comment` ones.
- `src/components/VideoTimeline.vue` - marker shape and legend.

**Created:**

- `src/components/__tests__/drawingCanvas.test.ts` - session-level tests against a faked Fabric module.
- `src/composables/__tests__/useDrawingCoordinator.test.ts` - single and dual routing for the new methods.

**Test files extended:** `src/utils/__tests__/annotationPayload.test.ts`, `src/components/__tests__/annotationQuickPick.test.ts`, `src/components/__tests__/videoTimelineMarkers.test.ts`.

---

## Task 1: A drawing is a saveable annotation

**Files:**
- Modify: `src/utils/annotationPayload.ts`
- Test: `src/utils/__tests__/annotationPayload.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `hasDrawingStrokes(drawingData?: DrawingData | null): boolean`, `isDrawingAnnotation(annotation: { annotationType?: string | null; drawingData?: DrawingData | null }): boolean`, and a widened `isSaveableAnnotation(input: { labels?: string[] | null; content?: string | null; drawingData?: DrawingData | null }): boolean`. `buildAnnotationPayload` unchanged in signature.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/__tests__/annotationPayload.test.ts`. At the top of the file, add `hasDrawingStrokes` and `isDrawingAnnotation` to the existing named import from `../annotationPayload`, and add a type import beside the existing `Label` one:

```ts
import type { DrawingData } from '@/types/database';
```

Add this fixture just below the `ballMissed` fixture:

```ts
const strokes: DrawingData = {
  paths: [
    {
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
      strokeWidth: 4,
      color: '#ef4444',
      timestamp: 1,
    },
  ],
  canvasWidth: 800,
  canvasHeight: 450,
  frame: 300,
};
```

Then append these tests:

```ts
describe('buildAnnotationPayload drawing titles', () => {
  it('titles a bare drawing Drawing', () => {
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: '',
      frame: 300,
      fps: 30,
      drawingData: strokes,
    });

    expect(payload.title).toBe('Drawing');
    expect(payload.annotationType).toBe('drawing');
    expect(payload.color).toBe(DEFAULT_ANNOTATION_COLOR);
  });

  it('still prefers the label name over the drawing fallback', () => {
    const payload = buildAnnotationPayload({
      labels: [ballMissed],
      labelIds: [ballMissed.id],
      content: '',
      frame: 300,
      fps: 30,
      drawingData: strokes,
    });

    expect(payload.title).toBe('BALL MISSED');
  });

  it('still prefers the content over the drawing fallback', () => {
    const payload = buildAnnotationPayload({
      labels: [],
      labelIds: [],
      content: 'keeper off his line',
      frame: 300,
      fps: 30,
      drawingData: strokes,
    });

    expect(payload.title).toBe('keeper off his line');
  });
});

describe('hasDrawingStrokes', () => {
  it('is true for a single-mode drawing with paths', () => {
    expect(hasDrawingStrokes(strokes)).toBe(true);
  });

  it('is true for a dual-mode drawing with paths on one video', () => {
    expect(
      hasDrawingStrokes({
        paths: [],
        canvasWidth: 800,
        canvasHeight: 450,
        frame: 300,
        drawingB: {
          paths: strokes.paths,
          canvasWidth: 800,
          canvasHeight: 450,
          frame: 300,
        },
      })
    ).toBe(true);
  });

  it('is false for an empty shell of either shape', () => {
    expect(
      hasDrawingStrokes({
        paths: [],
        canvasWidth: 800,
        canvasHeight: 450,
        frame: 300,
      })
    ).toBe(false);
    expect(hasDrawingStrokes(null)).toBe(false);
    expect(hasDrawingStrokes()).toBe(false);
  });
});

describe('isSaveableAnnotation with drawings', () => {
  it('accepts a label-less drawing with no text', () => {
    // What the quick pick creates. The sidebar has to accept it too, or it
    // could never re-save a drawing it opened.
    expect(
      isSaveableAnnotation({ labels: [], content: '', drawingData: strokes })
    ).toBe(true);
  });

  it('rejects an empty drawing with no label and no text', () => {
    expect(
      isSaveableAnnotation({
        labels: [],
        content: '',
        drawingData: {
          paths: [],
          canvasWidth: 800,
          canvasHeight: 450,
          frame: 300,
        },
      })
    ).toBe(false);
  });

  it('still rejects more than one label, drawing or not', () => {
    expect(
      isSaveableAnnotation({ labels: ['a', 'b'], drawingData: strokes })
    ).toBe(false);
  });
});

describe('isDrawingAnnotation', () => {
  it('is true for a drawing with strokes', () => {
    expect(
      isDrawingAnnotation({ annotationType: 'drawing', drawingData: strokes })
    ).toBe(true);
  });

  it('is false for a comment', () => {
    expect(
      isDrawingAnnotation({ annotationType: 'text', drawingData: null })
    ).toBe(false);
  });

  it('is false for a drawing type with no strokes left', () => {
    expect(isDrawingAnnotation({ annotationType: 'drawing' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/utils/__tests__/annotationPayload.test.ts`
Expected: FAIL. `hasDrawingStrokes` and `isDrawingAnnotation` are not exported, and the `Drawing` title test reports `Untitled`.

- [ ] **Step 3: Implement**

In `src/utils/annotationPayload.ts`, change the `title` line inside `buildAnnotationPayload`:

```ts
    title:
      primaryLabel?.name ||
      content.slice(0, 50) ||
      (drawingData ? 'Drawing' : 'Untitled'),
```

Add `hasDrawingStrokes` above `isSaveableAnnotation`:

```ts
/**
 * True when a drawing actually carries strokes. Single mode keeps its paths at
 * the top level and dual mode nests one drawing per video, and both shapes have
 * an empty form that is not a drawing: `addDrawing` builds a dual wrapper whose
 * top-level `paths` is deliberately empty.
 */
export function hasDrawingStrokes(drawingData?: DrawingData | null): boolean {
  if (!drawingData) return false;
  return [drawingData, drawingData.drawingA, drawingData.drawingB].some(
    (drawing) => (drawing?.paths?.length ?? 0) > 0
  );
}
```

Replace `isSaveableAnnotation` and its doc comment with:

```ts
/**
 * What counts as a saveable annotation: exactly one label, or no label at all
 * plus something of its own to say. That something is text, which is a comment,
 * or strokes, which is a drawing. Both are created by the quick pick from the
 * timeline, and the sidebar has to accept both or it could never re-save one it
 * opened, which is what attaching a label would otherwise demand and that turns
 * the annotation into something else.
 *
 * Neither a label nor any content of its own is still not an annotation.
 */
export function isSaveableAnnotation(input: {
  labels?: string[] | null;
  content?: string | null;
  drawingData?: DrawingData | null;
}): boolean {
  const labelCount = input.labels?.length ?? 0;
  if (labelCount === 1) return true;
  if (labelCount !== 0) return false;
  if ((input.content ?? '').trim().length > 0) return true;
  return hasDrawingStrokes(input.drawingData);
}
```

Add `isDrawingAnnotation` below `isCommentAnnotation`:

```ts
/**
 * A drawing is an annotation whose content is its strokes. The type alone is
 * not enough: an annotation can be marked `drawing` and carry an empty shell,
 * and drawing it as a drawing on the timeline would be a lie about a marker
 * that shows nothing when you click it.
 */
export function isDrawingAnnotation(annotation: {
  annotationType?: string | null;
  drawingData?: DrawingData | null;
}): boolean {
  return (
    annotation.annotationType === 'drawing' &&
    hasDrawingStrokes(annotation.drawingData)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/utils/__tests__/annotationPayload.test.ts`
Expected: PASS, including the pre-existing tests. The `falls back to Untitled` test still passes because it passes no `drawingData`.

- [ ] **Step 5: Update the stale comment in AnnotationForm**

`src/components/AnnotationForm.vue` around line 201 says "Drawings remain optional either way", which is now wrong. Replace that comment block above `isSaveDisabled` with:

```ts
// Exactly one label, or no label and content of its own: text, which is a
// comment, or strokes, which is a drawing. Both are created by the quick pick
// from the timeline; the rule lives in annotationPayload so the sidebar and the
// quick pick cannot drift apart on what a valid annotation is.
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/annotationPayload.ts src/utils/__tests__/annotationPayload.test.ts src/components/AnnotationForm.vue
git commit -m "feat: treat a bare drawing as a saveable annotation"
```

---

## Task 2: Undo and discard on the drawing canvas

**Files:**
- Modify: `src/components/DrawingCanvas.vue`
- Modify: `src/types/component-interfaces.ts:22-28`
- Test: `src/components/__tests__/drawingCanvas.test.ts` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `DrawingCanvas` exposes `undoLastStroke(): void` and `discardCurrentSession(): Promise<void>`. `DrawingCanvasExpose` declares both as optional, matching the style of the members already there.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/drawingCanvas.test.ts`. Fabric needs a real 2D context, which jsdom does not provide, so the module is faked. The fake records what the component asks of it, which is exactly what these tests are about.

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import DrawingCanvas from '@/components/DrawingCanvas.vue';

/**
 * Fabric wants a real 2D context, which jsdom has none of. The component's
 * contract with it is small - construct, listen, size, add, remove, render -
 * so a recorder standing in for it tests the session logic honestly and
 * without a headless browser.
 *
 * Declared through vi.hoisted because vi.mock is hoisted above the imports,
 * and a plain class declaration would still be in its temporal dead zone when
 * the factory runs.
 */
const { FakeCanvas } = vi.hoisted(() => {
  class FakeCanvas {
    static instances: FakeCanvas[] = [];
    handlers: Record<string, (payload: unknown) => void> = {};
    objects: unknown[] = [];
    disposed = false;
    isDrawingMode = false;
    freeDrawingBrush: { width: number; color: string } | undefined;

    constructor() {
      FakeCanvas.instances.push(this);
    }
    on(event: string, handler: (payload: unknown) => void) {
      this.handlers[event] = handler;
    }
    add(object: unknown) {
      this.objects.push(object);
    }
    remove(object: unknown) {
      this.objects = this.objects.filter((candidate) => candidate !== object);
    }
    getObjects() {
      return this.objects;
    }
    clear() {
      this.objects = [];
    }
    renderAll() {}
    setDimensions() {}
    getElement() {
      return document.createElement('canvas');
    }
    dispose() {
      this.disposed = true;
    }
  }
  return { FakeCanvas };
});

vi.mock('fabric', () => ({
  Canvas: FakeCanvas,
  PencilBrush: class {
    width = 0;
    color = '';
  },
  Path: class {
    constructor(public pathString: string, public options: unknown) {}
  },
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
});

/**
 * One finished stroke, in the shape fabric hands to path:created: an event
 * whose `path` is a fabric Path, whose own `path` is the command list.
 */
const fabricPathEvent = () => ({
  path: {
    path: [
      ['M', 100, 100],
      ['L', 200, 200],
    ],
  },
});

function mountCanvas(existingDrawings: unknown[] = []) {
  FakeCanvas.instances = [];
  const root = document.createElement('div');
  document.body.appendChild(root);
  const instance = ref<any>(null);

  const app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(DrawingCanvas, {
            ref: instance,
            currentFrame: 300,
            isDrawingMode: true,
            strokeWidth: 4,
            severity: 'medium',
            existingDrawings,
          });
      },
    })
  );
  app.mount(root);

  return {
    get component() {
      return instance.value;
    },
    get canvas() {
      return FakeCanvas.instances[0];
    },
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

/**
 * The canvas is built inside onMounted's own nextTick, so nothing exists to
 * assert against until two ticks have gone by.
 */
const ready = async () => {
  await nextTick();
  await nextTick();
};

/**
 * Finish a stroke the way fabric does: the object lands on the canvas and the
 * path:created handler turns it into a session path.
 */
const draw = async (harness: ReturnType<typeof mountCanvas>) => {
  harness.canvas.add({});
  harness.canvas.handlers['path:created']?.(fabricPathEvent() as never);
  await nextTick();
};

describe('DrawingCanvas undoLastStroke', () => {
  it('removes the last stroke from the session and the canvas', async () => {
    const harness = mountCanvas();
    await ready();
    await draw(harness);
    await draw(harness);
    expect(harness.component.getCurrentDrawingSession().paths).toHaveLength(2);

    harness.component.undoLastStroke();

    expect(harness.component.getCurrentDrawingSession().paths).toHaveLength(1);
    expect(harness.canvas.getObjects()).toHaveLength(1);
    harness.unmount();
  });

  it('ends the session once the last stroke is undone', async () => {
    const harness = mountCanvas();
    await ready();
    await draw(harness);

    harness.component.undoLastStroke();

    expect(harness.component.getCurrentDrawingSession()).toBeNull();
    expect(harness.canvas.getObjects()).toHaveLength(0);
    harness.unmount();
  });

  it('leaves persisted drawings alone when there is nothing of ours to undo', async () => {
    // The canvas also holds drawings loaded for this frame. Undo owns the
    // strokes of the current session and nothing else.
    const harness = mountCanvas();
    await ready();
    harness.canvas.add({ persisted: true });

    harness.component.undoLastStroke();

    expect(harness.canvas.getObjects()).toHaveLength(1);
    harness.unmount();
  });
});

describe('DrawingCanvas discardCurrentSession', () => {
  it('drops the session and puts back what is persisted', async () => {
    const persisted = {
      frame: 300,
      canvasWidth: 800,
      canvasHeight: 450,
      paths: [
        {
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.4, y: 0.4 },
          ],
          strokeWidth: 4,
          color: '#ef4444',
          timestamp: 1,
        },
      ],
    };
    const harness = mountCanvas([persisted]);
    await ready();
    await draw(harness);

    await harness.component.discardCurrentSession();

    expect(harness.component.getCurrentDrawingSession()).toBeNull();
    // Exactly the persisted stroke, re-rendered: not the empty canvas that
    // clearDrawings would leave behind.
    expect(harness.canvas.getObjects()).toHaveLength(1);
    harness.unmount();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/__tests__/drawingCanvas.test.ts`
Expected: FAIL with `harness.component.undoLastStroke is not a function`.

- [ ] **Step 3: Implement the two methods**

In `src/components/DrawingCanvas.vue`, add both functions just above the existing `getCurrentDrawingSession` definition near the end of the script block:

```ts
/**
 * Undo owns the strokes of the current session and nothing else. The canvas
 * also holds the drawings loaded for this frame, and they are below the
 * session's own objects in fabric's stack, so with no session path to pop there
 * is nothing here to remove: otherwise Undo would eat somebody else's saved
 * drawing off the screen.
 */
const undoLastStroke = () => {
  const session = currentDrawingSession.value;
  if (!session || session.paths.length === 0) return;

  session.paths.pop();
  if (session.paths.length === 0) {
    currentDrawingSession.value = null;
  }

  if (!canvas.value || canvas.value.disposed) return;
  const objects = canvas.value.getObjects();
  const last = objects[objects.length - 1];
  if (!last) return;
  canvas.value.remove(last);
  canvas.value.renderAll();
};

/**
 * Throws away the strokes drawn since the session began and puts back exactly
 * what is persisted for this frame.
 *
 * Deliberately narrower than clearDrawings and than the coordinator's
 * clearDrawingsWithRefs: the latter also drops the frame's entry from the
 * composable's map, so cancelling a new drawing would take an older saved one
 * off the screen with it.
 */
const discardCurrentSession = async () => {
  currentDrawingSession.value = null;
  await loadDrawingsForFrame(true);
};
```

Extend `defineExpose` at the bottom of the file:

```ts
defineExpose({
  clearDrawings,
  completeDrawingSession,
  hasDrawingsOnCurrentFrame,
  getCurrentDrawingSession,
  undoLastStroke,
  discardCurrentSession,
});
```

In `src/types/component-interfaces.ts`, extend `DrawingCanvasExpose`:

```ts
export interface DrawingCanvasExpose {
  hasDrawingsOnCurrentFrame?: () => boolean;
  clearDrawings?: () => void;
  getCurrentDrawingSession?: () => DrawingData | null;
  completeDrawingSession?: (videoContext?: 'A' | 'B') => void;
  clearCurrentFrameDrawings?: () => void;
  undoLastStroke?: () => void;
  discardCurrentSession?: () => Promise<void> | void;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/__tests__/drawingCanvas.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/DrawingCanvas.vue src/types/component-interfaces.ts src/components/__tests__/drawingCanvas.test.ts
git commit -m "feat: add undo and discard to the drawing canvas"
```

---

## Task 3: Clean up the drawing overlay

**Files:**
- Modify: `src/components/DrawingCanvas.vue` (template block lines 29-35, style block lines 599-641)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Presentation only.

No test: this is CSS and a removed debug element, verified by eye in Task 8. The existing `drawingCanvas.test.ts` must still pass, which is what proves nothing behavioural moved.

- [ ] **Step 1: Remove the debug badge**

Delete this block from the template in `src/components/DrawingCanvas.vue`:

```html
    <!-- Debug overlay when drawing mode is active -->
    <div
      v-if="isDrawingMode"
      class="absolute top-2 left-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium z-10"
    >
      Drawing Mode Active
    </div>
```

- [ ] **Step 2: Replace the style block**

Replace the entire `<style scoped>` block at the end of the file with:

```css
<style scoped>
.canvas-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 40;
}

/*
  Drawing mode is announced by the quick pick's own toolbar, so the overlay only
  has to say where the surface is: a hairline in the app's accent at the video's
  edge, and the crosshair the canvas already sets.
*/
.canvas-container.drawing-mode {
  pointer-events: auto;
  z-index: 100;
  box-shadow: inset 0 0 0 1px rgba(249, 115, 22, 0.6);
}

.drawing-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transition: opacity 150ms ease-in-out;
}

.canvas-container.drawing-mode .drawing-canvas {
  cursor: crosshair;
}
</style>
```

What this drops, and why each was wrong:

- `min-width: 800px` / `min-height: 450px` on an `inset: 0` overlay, which forces the canvas larger than the video on any smaller player and puts the strokes out of register with the frame.
- A second `.canvas-container` rule that silently re-declared the first, including an always-on `rgba(255, 255, 255, 0.02)` wash over every video.
- `height: 700px` on the canvas, which has nothing to do with the video's height.
- The 3px blue border, the blue background tint, the blue glow and the `.fade-transition` duplicate of the transition already on `.drawing-canvas`.

- [ ] **Step 3: Verify nothing behavioural moved**

Run: `npm test`
Expected: PASS, whole suite.

- [ ] **Step 4: Commit**

```bash
git add src/components/DrawingCanvas.vue
git commit -m "style: size the drawing overlay to the video and drop its debug chrome"
```

---

## Task 4: Coordinator support for the new canvas methods

**Files:**
- Modify: `src/composables/useDrawingCoordinator.ts`
- Test: `src/composables/__tests__/useDrawingCoordinator.test.ts` (create)

**Interfaces:**
- Consumes: `DrawingCanvasExpose.undoLastStroke` and `.discardCurrentSession` from Task 2; `hasDrawingStrokes` from Task 1.
- Produces, all on the object `useDrawingCoordinator` returns:
  - `setStrokeWidth(width: number): void`
  - `undoLastStroke(canvasRefs: CanvasRefs): void`
  - `discardInProgressDrawing(canvasRefs: CanvasRefs): void`
  - `getInProgressDrawing(canvasRefs: CanvasRefs): DrawingData | null`
  - `retainDrawing(drawingData: DrawingData): void`

  where `CanvasRefs` is the shape already used by `getDrawingData`: `{ single?: DrawingCanvasExpose | null; a?: DrawingCanvasExpose | null; b?: DrawingCanvasExpose | null }`.

- [ ] **Step 1: Write the failing test**

Create `src/composables/__tests__/useDrawingCoordinator.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { useDrawingCoordinator } from '@/composables/useDrawingCoordinator';
import { useDrawingCanvas } from '@/composables/useDrawingCanvas';
import type { DrawingData } from '@/types/database';

const session = (frame: number): DrawingData => ({
  frame,
  canvasWidth: 800,
  canvasHeight: 450,
  paths: [
    {
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
      strokeWidth: 4,
      color: '#ef4444',
      timestamp: 1,
    },
  ],
});

const fakeRef = (current: DrawingData | null) => ({
  getCurrentDrawingSession: vi.fn(() => current),
  completeDrawingSession: vi.fn(),
  undoLastStroke: vi.fn(),
  discardCurrentSession: vi.fn(),
  clearDrawings: vi.fn(),
});

function setup(mode: 'single' | 'dual') {
  const playerMode = ref<'single' | 'dual'>(mode);
  const singleCanvas = useDrawingCanvas();
  const canvasA = useDrawingCanvas();
  const canvasB = useDrawingCanvas();
  const coordinator = useDrawingCoordinator({
    playerMode,
    singleCanvas,
    canvasA,
    canvasB,
  });
  return { coordinator, singleCanvas, canvasA, canvasB };
}

describe('useDrawingCoordinator stroke width', () => {
  it('sets the width on the single canvas in single mode', () => {
    const { coordinator, singleCanvas, canvasA } = setup('single');
    coordinator.setStrokeWidth(8);
    expect(singleCanvas.currentTool.value.strokeWidth).toBe(8);
    expect(canvasA.currentTool.value.strokeWidth).toBe(3);
  });

  it('sets the width on both canvases in dual mode', () => {
    const { coordinator, canvasA, canvasB } = setup('dual');
    coordinator.setStrokeWidth(2);
    expect(canvasA.currentTool.value.strokeWidth).toBe(2);
    expect(canvasB.currentTool.value.strokeWidth).toBe(2);
  });
});

describe('useDrawingCoordinator getInProgressDrawing', () => {
  it('reads the session without completing it', () => {
    // completeDrawingSession fires drawing-created, which useVideoEventHandlers
    // forwards into the sidebar form's draft. The quick pick must not.
    const { coordinator } = setup('single');
    const single = fakeRef(session(300));

    const drawing = coordinator.getInProgressDrawing({ single });

    expect(drawing?.paths).toHaveLength(1);
    expect(drawing?.frame).toBe(300);
    expect(single.completeDrawingSession).not.toHaveBeenCalled();
  });

  it('is null when nothing has been drawn', () => {
    const { coordinator } = setup('single');
    expect(coordinator.getInProgressDrawing({ single: fakeRef(null) })).toBeNull();
  });

  it('is null when the session exists but carries no strokes', () => {
    const { coordinator } = setup('single');
    const empty = { ...session(300), paths: [] };
    expect(coordinator.getInProgressDrawing({ single: fakeRef(empty) })).toBeNull();
  });

  it('nests one drawing per video in dual mode', () => {
    const { coordinator } = setup('dual');

    const drawing = coordinator.getInProgressDrawing({
      a: fakeRef(session(300)),
      b: fakeRef(null),
    });

    expect(drawing?.drawingA?.paths).toHaveLength(1);
    expect(drawing?.drawingB).toBeUndefined();
  });
});

describe('useDrawingCoordinator undo and discard', () => {
  it('routes both to the single canvas in single mode', () => {
    const { coordinator } = setup('single');
    const single = fakeRef(session(300));

    coordinator.undoLastStroke({ single });
    coordinator.discardInProgressDrawing({ single });

    expect(single.undoLastStroke).toHaveBeenCalledTimes(1);
    expect(single.discardCurrentSession).toHaveBeenCalledTimes(1);
  });

  it('routes both to each canvas in dual mode', () => {
    const { coordinator } = setup('dual');
    const a = fakeRef(session(300));
    const b = fakeRef(session(300));

    coordinator.undoLastStroke({ a, b });
    coordinator.discardInProgressDrawing({ a, b });

    expect(a.undoLastStroke).toHaveBeenCalledTimes(1);
    expect(b.undoLastStroke).toHaveBeenCalledTimes(1);
    expect(a.discardCurrentSession).toHaveBeenCalledTimes(1);
    expect(b.discardCurrentSession).toHaveBeenCalledTimes(1);
  });
});

describe('useDrawingCoordinator retainDrawing', () => {
  it('keeps a just-saved drawing in single-mode canvas state', () => {
    const { coordinator, singleCanvas } = setup('single');

    coordinator.retainDrawing(session(300));

    expect(singleCanvas.getDrawingsForFrame(300)).toHaveLength(1);
  });

  it('keeps a just-saved dual drawing under its own video', () => {
    const { coordinator, canvasA } = setup('dual');
    const drawing = session(300);

    coordinator.retainDrawing({
      paths: [],
      canvasWidth: 800,
      canvasHeight: 450,
      frame: 300,
      drawingA: {
        paths: drawing.paths,
        canvasWidth: 800,
        canvasHeight: 450,
        frame: 300,
      },
    });

    expect(canvasA.getDrawingsForFrame(300)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/composables/__tests__/useDrawingCoordinator.test.ts`
Expected: FAIL with `coordinator.setStrokeWidth is not a function`.

- [ ] **Step 3: Implement**

In `src/composables/useDrawingCoordinator.ts`, add the import:

```ts
import { hasDrawingStrokes } from '@/utils/annotationPayload';
```

Add a named type just below `DrawingCoordinatorOptions`, and use it for the new functions (leave the existing inline shapes on `getDrawingData`, `clearDrawingsWithRefs` and `hasDrawingsOnCurrentFrame` alone: retyping them is churn this change does not need):

```ts
/** The DrawingCanvas component instances, as EditorView holds them. */
export interface DrawingCanvasRefs {
  single?: DrawingCanvasExpose | null;
  a?: DrawingCanvasExpose | null;
  b?: DrawingCanvasExpose | null;
}
```

Add `setStrokeWidth` next to `setCustomColor`:

```ts
  function setStrokeWidth(width: number) {
    if (isDual()) {
      canvasA.setStrokeWidth(width);
      canvasB.setStrokeWidth(width);
    } else {
      singleCanvas.setStrokeWidth(width);
    }
  }
```

Add the rest in a new section above `storeDrawingInDraft`:

```ts
  // --------------------------------------------------------------------------
  // The in-progress drawing, for callers that own their own save
  // --------------------------------------------------------------------------

  /**
   * Reads the strokes drawn so far without completing the session.
   *
   * Deliberately not getDrawingData: that one calls completeDrawingSession,
   * which emits drawing-created, which useVideoEventHandlers forwards into the
   * sidebar form's draft. A caller that stores the drawing itself would
   * otherwise leave a copy attached to the sidebar's next new annotation.
   */
  function getInProgressDrawing(canvasRefs: DrawingCanvasRefs): DrawingData | null {
    if (isDual()) {
      const a = canvasRefs.a?.getCurrentDrawingSession?.() ?? null;
      const b = canvasRefs.b?.getCurrentDrawingSession?.() ?? null;
      if (!hasDrawingStrokes(a) && !hasDrawingStrokes(b)) return null;

      // The wrapper's own measurements come from a video that actually drew,
      // so a stale empty session on the other one cannot supply them.
      const primary = (hasDrawingStrokes(a) ? a : b)!;
      const data: DrawingData = {
        paths: [],
        canvasWidth: primary.canvasWidth,
        canvasHeight: primary.canvasHeight,
        frame: primary.frame,
      };
      if (hasDrawingStrokes(a)) data.drawingA = { ...a! };
      if (hasDrawingStrokes(b)) data.drawingB = { ...b! };
      return data;
    }

    const session = canvasRefs.single?.getCurrentDrawingSession?.() ?? null;
    if (!hasDrawingStrokes(session)) return null;
    return {
      paths: session!.paths,
      frame: session!.frame,
      canvasWidth: session!.canvasWidth,
      canvasHeight: session!.canvasHeight,
    };
  }

  function undoLastStroke(canvasRefs: DrawingCanvasRefs) {
    if (isDual()) {
      canvasRefs.a?.undoLastStroke?.();
      canvasRefs.b?.undoLastStroke?.();
    } else {
      canvasRefs.single?.undoLastStroke?.();
    }
  }

  /**
   * Throws away the strokes of the current session, leaving anything already
   * saved on this frame untouched. Must run before drawing mode is disabled:
   * DrawingCanvas completes a session that still has paths when the mode goes
   * off, which would save what the user just cancelled.
   */
  function discardInProgressDrawing(canvasRefs: DrawingCanvasRefs) {
    if (isDual()) {
      canvasRefs.a?.discardCurrentSession?.();
      canvasRefs.b?.discardCurrentSession?.();
    } else {
      canvasRefs.single?.discardCurrentSession?.();
    }
  }

  /**
   * Puts a drawing that has just been stored into canvas state, so the strokes
   * stay on screen instead of blinking out until the annotations watcher folds
   * the new annotation back in.
   */
  function retainDrawing(drawingData: DrawingData) {
    if (isDual()) {
      if (drawingData.drawingA) canvasA.addDrawing(drawingData.drawingA, 'A');
      if (drawingData.drawingB) canvasB.addDrawing(drawingData.drawingB, 'B');
    } else {
      singleCanvas.addDrawing(drawingData);
    }
  }
```

Extend the returned object:

```ts
    getDrawingData,
    getInProgressDrawing,
    undoLastStroke,
    discardInProgressDrawing,
    retainDrawing,
    ...
    setCustomColor,
    clearCustomColor,
    setStrokeWidth,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/composables/__tests__/useDrawingCoordinator.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useDrawingCoordinator.ts src/composables/__tests__/useDrawingCoordinator.test.ts
git commit -m "feat: give the drawing coordinator undo, discard and in-progress reads"
```

---

## Task 5: Draw mode in the quick pick

**Files:**
- Modify: `src/components/AnnotationQuickPick.vue`
- Test: `src/components/__tests__/annotationQuickPick.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. The panel touches no canvas.
- Produces, for Task 6 to bind to: props `drawColor: string` (default `'#ef4444'`) and `drawWidth: number` (default `4`); emits `draw`, `draw-mode(active: boolean)`, `draw-undo`, `draw-color(color: string)`, `draw-width(width: number)`.

- [ ] **Step 1: Write the failing tests**

In `src/components/__tests__/annotationQuickPick.test.ts`, extend `mountPanel` so the harness carries the new props and listeners. Replace the `h(AnnotationQuickPick, {...})` call and the `Harness` interface with:

```ts
interface Harness {
  root: HTMLElement;
  events: Array<[string, unknown]>;
  open: Ref<boolean>;
  x: Ref<number>;
  y: Ref<number>;
  drawColor: Ref<string>;
  drawWidth: Ref<number>;
  unmount: () => void;
}

function mountPanel(labels: Label[] = LABELS): Harness {
  const events: Array<[string, unknown]> = [];
  const open = ref(true);
  const x = ref(400);
  const y = ref(400);
  const drawColor = ref('#ef4444');
  const drawWidth = ref(4);

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
            drawColor: drawColor.value,
            drawWidth: drawWidth.value,
            onSelect: (label: Label) => events.push(['select', label]),
            onComment: (text: string) => events.push(['comment', text]),
            onCommentMode: (active: boolean) =>
              events.push(['comment-mode', active]),
            onDraw: () => events.push(['draw', null]),
            onDrawMode: (active: boolean) => events.push(['draw-mode', active]),
            onDrawUndo: () => events.push(['draw-undo', null]),
            onDrawColor: (color: string) => events.push(['draw-color', color]),
            onDrawWidth: (width: number) => events.push(['draw-width', width]),
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
    drawColor,
    drawWidth,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}
```

Then append the new suite at the end of the file:

```ts
const toolbar = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[data-testid="quick-pick-draw"]');

describe('AnnotationQuickPick draw mode', () => {
  it('enters draw mode on D at the root screen', async () => {
    const panel = mountPanel();
    await nextTick();

    press('d');
    await nextTick();

    expect(toolbar(panel.root)).not.toBeNull();
    expect(panel.events).toContainEqual(['draw-mode', true]);
    panel.unmount();
  });

  it('leaves D to a label inside a category', async () => {
    // No label here holds D, so the test is that the panel does not fall back
    // to the root meaning: a category screen answers to its own letters only.
    const panel = mountPanel();
    await nextTick();

    press('b'); // BALL category
    await nextTick();
    press('d');
    await nextTick();

    expect(toolbar(panel.root)).toBeNull();
    expect(panel.events.some(([name]) => name === 'draw-mode')).toBe(false);
    panel.unmount();
  });

  it('lets clicks through to the canvas underneath', async () => {
    // The backdrop is fixed inset-0, so unless it stops taking pointer events
    // the user cannot touch the video at all.
    const panel = mountPanel();
    await nextTick();
    const backdrop = panel.root.firstElementChild as HTMLElement;
    expect(backdrop.className).not.toContain('pointer-events-none');

    press('d');
    await nextTick();

    expect(backdrop.className).toContain('pointer-events-none');
    panel.unmount();
  });

  it('swallows the transport keys that would clear the canvas', async () => {
    // Space and the arrows reach useVideoPlayer's document listener otherwise.
    // A frame change makes DrawingCanvas clear the canvas and start a fresh
    // session, and the strokes are gone with no way back.
    const panel = mountPanel();
    await nextTick();
    press('d');
    await nextTick();

    expect(press(' ').defaultPrevented).toBe(true);
    expect(press('ArrowLeft').defaultPrevented).toBe(true);
    expect(press('ArrowRight').defaultPrevented).toBe(true);
    panel.unmount();
  });

  it('picks a colour with the number keys', async () => {
    const panel = mountPanel();
    await nextTick();
    press('d');
    await nextTick();

    press('4');
    await nextTick();

    expect(panel.events).toContainEqual(['draw-color', '#22c55e']);
    panel.unmount();
  });

  it('steps the stroke width with the bracket keys', async () => {
    const panel = mountPanel();
    await nextTick();
    press('d');
    await nextTick();

    press(']');
    await nextTick();
    expect(panel.events).toContainEqual(['draw-width', 8]);

    panel.drawWidth.value = 8;
    await nextTick();
    press('[');
    await nextTick();
    expect(panel.events).toContainEqual(['draw-width', 4]);
    panel.unmount();
  });

  it('does not step past either end of the width range', async () => {
    const panel = mountPanel();
    panel.drawWidth.value = 8;
    await nextTick();
    press('d');
    await nextTick();

    press(']');
    await nextTick();

    expect(panel.events.some(([name]) => name === 'draw-width')).toBe(false);
    panel.unmount();
  });

  it('undoes on U and on the platform undo chord', async () => {
    const panel = mountPanel();
    await nextTick();
    press('d');
    await nextTick();

    press('u');
    press('z', { metaKey: true });
    await nextTick();

    expect(
      panel.events.filter(([name]) => name === 'draw-undo')
    ).toHaveLength(2);
    panel.unmount();
  });

  it('commits on Enter without leaving draw mode', async () => {
    // Saving is asynchronous and can fail. The listener closes the panel only
    // once the annotation is stored, so the strokes have to survive the emit.
    const panel = mountPanel();
    await nextTick();
    press('d');
    await nextTick();

    press('Enter');
    await nextTick();

    expect(panel.events).toContainEqual(['draw', null]);
    expect(toolbar(panel.root)).not.toBeNull();
    expect(
      panel.events.some(([name, value]) => name === 'draw-mode' && value === false)
    ).toBe(false);
    panel.unmount();
  });

  it('returns to the root on Escape and closes on a second one', async () => {
    const panel = mountPanel();
    await nextTick();
    press('d');
    await nextTick();

    press('Escape');
    await nextTick();
    expect(toolbar(panel.root)).toBeNull();
    expect(panel.events).toContainEqual(['draw-mode', false]);

    press('Escape');
    await nextTick();
    expect(panel.events).toContainEqual(['close', null]);
    panel.unmount();
  });

  it('reports leaving draw mode once when closed', async () => {
    const panel = mountPanel();
    await nextTick();
    press('d');
    await nextTick();

    panel.open.value = false;
    await nextTick();

    expect(
      panel.events.filter(([name, value]) => name === 'draw-mode' && value === false)
    ).toHaveLength(1);
    panel.unmount();
  });

  it('resets draw mode when reopened at a new position', async () => {
    const panel = mountPanel();
    await nextTick();
    press('d');
    await nextTick();

    panel.x.value = 600;
    panel.y.value = 200;
    await nextTick();

    expect(toolbar(panel.root)).toBeNull();
    panel.unmount();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/__tests__/annotationQuickPick.test.ts`
Expected: FAIL. The comment-mode suite still passes; every draw-mode test fails because no toolbar renders.

- [ ] **Step 3: Add the mode, its state and its emits**

In the `<script setup>` of `src/components/AnnotationQuickPick.vue`:

Extend the props:

```ts
  fps: { type: Number, default: 30 },
  /** Brush colour, owned by the editor so the toolbar shows what the canvas uses. */
  drawColor: { type: String, default: '#ef4444' },
  drawWidth: { type: Number, default: 4 },
```

Extend the emits:

```ts
const emit = defineEmits<{
  (e: 'select', label: Label): void;
  (e: 'comment', text: string): void;
  (e: 'comment-mode', active: boolean): void;
  (e: 'draw'): void;
  (e: 'draw-mode', active: boolean): void;
  (e: 'draw-undo'): void;
  (e: 'draw-color', color: string): void;
  (e: 'draw-width', width: number): void;
  (e: 'close'): void;
}>();
```

Below `COMMENT_LETTER`, add:

```ts
/** Letter that opens the drawing tools. Free for the same reason C is. */
const DRAW_LETTER = 'D';

/**
 * Six colours, addressed by 1-6. A trimmed selection of useDrawingCanvas's
 * palette: enough to separate two annotators and few enough to stay in a row
 * and in the fingers.
 */
const DRAW_COLORS = [
  '#ef4444',
  '#f97316',
  '#fbbf24',
  '#22c55e',
  '#3b82f6',
  '#ffffff',
];

const DRAW_WIDTHS = [2, 4, 8];

type QuickPickMode = 'pick' | 'comment' | 'draw';
```

(and delete the old `type QuickPickMode = 'pick' | 'comment';` line).

Below `leaveCommentMode`, add:

```ts
const enterDrawMode = () => {
  if (mode.value === 'draw') return;
  mode.value = 'draw';
  emit('draw-mode', true);
};

/**
 * Every exit from draw mode goes through here. A listener that paused playback
 * and turned the canvas on must always be told on the way out: EditorView's two
 * open handlers both bail while drawing mode is on, so a stranded flag locks
 * the user out of the whole quick pick, not just out of playback.
 */
const leaveDrawMode = () => {
  if (mode.value !== 'draw') return;
  mode.value = 'pick';
  emit('draw-mode', false);
};

/**
 * The width steps by position rather than by value, so the ends of the range
 * simply stop instead of wrapping round to the other extreme mid-stroke.
 */
const stepWidth = (direction: -1 | 1) => {
  const current = DRAW_WIDTHS.indexOf(props.drawWidth);
  const from = current === -1 ? 1 : current;
  const next = Math.min(Math.max(from + direction, 0), DRAW_WIDTHS.length - 1);
  if (DRAW_WIDTHS[next] !== props.drawWidth) emit('draw-width', DRAW_WIDTHS[next]);
};
```

Extend `resetToRoot`:

```ts
const resetToRoot = () => {
  activeCategory.value = null;
  leaveCommentMode();
  leaveDrawMode();
};
```

Extend `back`:

```ts
const back = () => {
  if (mode.value === 'comment') {
    leaveCommentMode();
    return;
  }
  if (mode.value === 'draw') {
    leaveDrawMode();
    return;
  }
  if (activeCategory.value) activeCategory.value = null;
  else emit('close');
};
```

- [ ] **Step 4: Add the keyboard branch**

Insert `handleDrawKeydown` immediately above `handleKeydown`:

```ts
/**
 * Draw mode is modal: the panel is a toolbar and the video below it is a
 * canvas, so anything this branch does not own is still swallowed rather than
 * handed to the player. Space and the arrows are why. They reach
 * useVideoPlayer's document listener otherwise, and the frame change makes
 * DrawingCanvas clear its canvas and start a fresh session, taking the strokes
 * with it.
 */
const handleDrawKeydown = (event: KeyboardEvent) => {
  const stop = () => {
    event.preventDefault();
    event.stopPropagation();
  };

  if (event.metaKey || event.ctrlKey) {
    // The one chord worth owning here. Everything else stays the browser's.
    if (event.key.toLowerCase() === 'z') {
      stop();
      emit('draw-undo');
    }
    return;
  }
  if (event.altKey) return;

  const key = event.key;

  if (key === 'Escape') {
    stop();
    back();
    return;
  }
  if (key === 'Enter') {
    stop();
    emit('draw');
    return;
  }
  if (key === 'u' || key === 'U') {
    stop();
    emit('draw-undo');
    return;
  }
  if (key === '[' || key === ']') {
    stop();
    stepWidth(key === '[' ? -1 : 1);
    return;
  }

  const swatch = Number(key);
  if (Number.isInteger(swatch) && swatch >= 1 && swatch <= DRAW_COLORS.length) {
    stop();
    emit('draw-color', DRAW_COLORS[swatch - 1]);
    return;
  }

  if (key === ' ' || key === 'ArrowLeft' || key === 'ArrowRight' || key.length === 1) {
    stop();
  }
};
```

Then change the head of `handleKeydown`. The draw branch has to come before the modifier guard, because the undo chord is a modifier combination:

```ts
const handleKeydown = (event: KeyboardEvent) => {
  // First, because draw mode owns a modifier chord of its own.
  if (mode.value === 'draw') {
    handleDrawKeydown(event);
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
```

And add the `D` case at the root, immediately after the existing `COMMENT_LETTER` block:

```ts
  if (key === DRAW_LETTER) {
    event.preventDefault();
    event.stopPropagation();
    enterDrawMode();
    return;
  }
```

- [ ] **Step 5: Render the toolbar**

In the template, the backdrop element becomes click-through in draw mode:

```html
  <div
    v-if="open"
    class="fixed inset-0 z-50"
    :class="{ 'pointer-events-none': mode === 'draw' }"
    @click="emit('close')"
    @contextmenu.prevent="emit('close')"
  >
```

and the panel element takes its own pointer events back:

```html
    <div
      ref="panelRef"
      tabindex="-1"
      class="absolute overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl outline-none dark:border-gray-700 dark:bg-gray-800"
      :class="{ 'pointer-events-auto': mode === 'draw' }"
      :style="{ ...position, width: `${PANEL_W}px` }"
      @click.stop
      @keydown="handleKeydown"
    >
```

Insert the toolbar between the comment screen's closing `</div>` and the `<!-- Pick screen -->` comment, and change the pick screen's `v-else` to stay last:

```html
      <!-- Draw screen: a toolbar, because the surface being annotated is the
           video itself and the panel has to keep out of its way. -->
      <div
        v-else-if="mode === 'draw'"
        data-testid="quick-pick-draw"
        class="flex items-center gap-3 px-4 py-2.5"
      >
        <div class="flex items-center gap-1.5">
          <button
            v-for="(color, index) in DRAW_COLORS"
            :key="color"
            type="button"
            :data-testid="`quick-pick-draw-color-${index + 1}`"
            :title="`${index + 1}`"
            class="h-6 w-6 rounded-full border transition-transform"
            :class="
              color === drawColor
                ? 'scale-110 border-gray-900 dark:border-gray-100'
                : 'border-gray-300 hover:scale-110 dark:border-gray-600'
            "
            :style="{ backgroundColor: color }"
            @click="emit('draw-color', color)"
          />
        </div>

        <span class="h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-700" />

        <div class="flex items-center gap-1.5">
          <button
            v-for="width in DRAW_WIDTHS"
            :key="width"
            type="button"
            :data-testid="`quick-pick-draw-width-${width}`"
            class="grid h-6 w-6 place-items-center rounded border transition-colors"
            :class="
              width === drawWidth
                ? 'border-gray-900 bg-gray-100 dark:border-gray-100 dark:bg-gray-700'
                : 'border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700/50'
            "
            @click="emit('draw-width', width)"
          >
            <span
              class="rounded-full bg-gray-700 dark:bg-gray-200"
              :style="{ width: `${width}px`, height: `${width}px` }"
            />
          </button>
        </div>

        <span class="h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-700" />

        <button
          type="button"
          data-testid="quick-pick-draw-undo"
          class="flex items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
          @click="emit('draw-undo')"
        >
          <span
            class="grid h-6 w-6 shrink-0 place-items-center rounded border border-gray-300 bg-gray-50 font-mono text-[11px] font-semibold text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
          >
            U
          </span>
          <span class="text-[11px] font-medium tracking-[0.1em] text-gray-600 dark:text-gray-400">
            UNDO
          </span>
        </button>

        <button
          type="button"
          data-testid="quick-pick-draw-save"
          class="ml-auto flex items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
          @click="emit('draw')"
        >
          <span
            class="grid h-6 w-6 shrink-0 place-items-center rounded border border-gray-300 bg-gray-50 font-mono text-[11px] font-semibold text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
          >
            &crarr;
          </span>
          <span class="text-[11px] font-medium tracking-[0.1em] text-gray-800 dark:text-gray-200">
            SAVE
          </span>
        </button>
      </div>
```

Add the `D  DRAWING` row directly below the existing `C  COMMENT` button, inside the same left column:

```html
          <button
            type="button"
            class="flex w-full items-center gap-2.5 border-t border-gray-200 px-4 py-2 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
            @click="enterDrawMode"
          >
            <span
              class="grid h-6 w-6 shrink-0 place-items-center rounded border border-gray-300 bg-gray-50 font-mono text-[11px] font-semibold text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
            >
              D
            </span>
            <span
              class="flex-1 text-[11px] font-medium tracking-[0.1em] text-gray-600 dark:text-gray-400"
            >
              DRAWING
            </span>
          </button>
```

Extend the footer:

```html
      <footer
        class="border-t border-gray-200 px-4 py-2 text-[9px] tracking-[0.14em] text-gray-400 dark:border-gray-700 dark:text-gray-500"
      >
        <span v-if="mode === 'comment'">Enter to save &middot; Esc to go back</span>
        <span v-else-if="mode === 'draw'">Enter to save &middot; U to undo &middot; Esc to cancel</span>
        <span v-else-if="activeCategory">Letter to label &middot; Esc to go back</span>
        <span v-else>Letter to pick a category &middot; C to comment &middot; D to draw &middot; Esc to close</span>
      </footer>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- src/components/__tests__/annotationQuickPick.test.ts`
Expected: PASS, the comment suite and all 12 draw-mode tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/AnnotationQuickPick.vue src/components/__tests__/annotationQuickPick.test.ts
git commit -m "feat: add a drawing mode to the annotation quick pick"
```

---

## Task 6: Wire draw mode to the canvas in the editor

**Files:**
- Modify: `src/views/EditorView.vue` (handlers near the existing `handleQuickPickComment` around lines 386-480; template binding at lines 1431-1441)

**Interfaces:**
- Consumes: the panel's five `draw-*` emits and two `draw*` props from Task 5; `getInProgressDrawing`, `undoLastStroke`, `discardInProgressDrawing`, `retainDrawing`, `setStrokeWidth` from Task 4; `buildAnnotationPayload` from Task 1.
- Produces: nothing consumed by a later task.

No unit test: `EditorView` has none today, it needs a live Supabase session and a real video, and faking that would test the fake. Task 8 covers it end to end, which is the same bargain the comment path already made.

- [ ] **Step 1: Add the state and the canvas-ref accessor**

In the script of `src/views/EditorView.vue`, directly below the `handleQuickPickCommentMode` function:

```ts
// ── Quick pick drawing ───────────────────────────────────────────────────────

/**
 * The toolbar's own copy of the brush settings. It is pushed into the
 * coordinator on the way into draw mode and on every change, so the swatch
 * that looks selected is the colour the brush actually carries.
 */
const quickPickDrawColor = ref('#ef4444');
const quickPickDrawWidth = ref(4);

const drawModeWasPlaying = ref(false);
/** Blocks a second Enter while the first insert is still in flight. */
const drawingSaving = ref(false);

/** The DrawingCanvas instances, exposed by UnifiedVideoPlayer. */
const drawingCanvasRefs = () => ({
  single: (unifiedVideoPlayerRef.value as any)?.singleDrawingCanvasRef ?? null,
  a: (unifiedVideoPlayerRef.value as any)?.drawingCanvasARef ?? null,
  b: (unifiedVideoPlayerRef.value as any)?.drawingCanvasBRef ?? null,
});
```

- [ ] **Step 2: Add the mode, colour, width and undo handlers**

Below the block from Step 1:

```ts
const handleQuickPickDrawMode = (active: boolean) => {
  if (active) {
    drawModeWasPlaying.value = isPlaybackRunning();
    unifiedVideoPlayerRef.value?.pause();
    drawingCoordinator.setCustomColor(quickPickDrawColor.value);
    drawingCoordinator.setStrokeWidth(quickPickDrawWidth.value);
    drawingCoordinator.enableDrawingMode();
    return;
  }

  // Order matters: DrawingCanvas completes a session that still holds paths
  // when drawing mode goes off, which would store what the user just
  // cancelled. Discarding first leaves it nothing to complete. On the save
  // path the session has already been read and retained, so this only clears
  // the way.
  drawingCoordinator.discardInProgressDrawing(drawingCanvasRefs());
  drawingCoordinator.disableDrawingMode();
  if (drawModeWasPlaying.value) unifiedVideoPlayerRef.value?.play();
  drawModeWasPlaying.value = false;
};

const handleQuickPickDrawColor = (color: string) => {
  quickPickDrawColor.value = color;
  drawingCoordinator.setCustomColor(color);
};

const handleQuickPickDrawWidth = (width: number) => {
  quickPickDrawWidth.value = width;
  drawingCoordinator.setStrokeWidth(width);
};

const handleQuickPickDrawUndo = () => {
  drawingCoordinator.undoLastStroke(drawingCanvasRefs());
};
```

- [ ] **Step 3: Add the save handler**

Below the undo handler:

```ts
/**
 * The canvas stamps the player's frame; the annotation carries the frame the
 * panel snapshotted before the seek, and an asynchronous seek can leave those
 * one apart. They have to agree exactly: clicking the annotation drives the
 * canvas from annotation.frame, and DrawingCanvas renders a drawing only where
 * drawing.frame matches, so a frame's difference is an empty canvas.
 */
const stampSnapshotFrame = (
  drawingData: DrawingData,
  snapshot: { frame: number; dual: { videoAFrame: number; videoBFrame: number } | null }
) => {
  if (snapshot.dual) {
    if (drawingData.drawingA) drawingData.drawingA.frame = snapshot.dual.videoAFrame;
    if (drawingData.drawingB) drawingData.drawingB.frame = snapshot.dual.videoBFrame;
    return;
  }
  drawingData.frame = snapshot.frame;
};

/**
 * A drawing is an annotation with no labels and no text: the strokes are the
 * content, and a real label can be attached later from the sidebar.
 *
 * Like the comment path and unlike the label path, the panel closes only once
 * the annotation is stored. A failed label save costs one keystroke to redo; a
 * failed drawing save would cost strokes, so on failure the toolbar stays open
 * with the drawing on the canvas and the video still paused, which is the state
 * to press Enter again from.
 */
const handleQuickPickDrawing = async () => {
  if (drawingSaving.value) return;

  const snapshot = quickPickSnapshot.value;
  if (!snapshot) {
    closeQuickPick();
    return;
  }

  // Read without completing: completeDrawingSession emits drawing-created,
  // which useVideoEventHandlers forwards into the sidebar form's draft.
  const drawingData = drawingCoordinator.getInProgressDrawing(drawingCanvasRefs());
  // Enter on an untouched canvas is a no-op, not a gray Untitled row.
  if (!drawingData) return;

  stampSnapshotFrame(drawingData, snapshot);

  drawingSaving.value = true;
  try {
    const created = await handleAddAnnotation(
      buildAnnotationPayload({
        labels: quickPickLabels.value,
        labelIds: [],
        content: '',
        frame: snapshot.frame,
        fps: snapshot.fps,
        dual: snapshot.dual,
        drawingData,
      })
    );

    // addAnnotation also bails without throwing when its context is
    // incomplete, so a falsy result is a failure too and must not take the
    // strokes down with it.
    if (!created) {
      notifyError(
        'Failed to add drawing',
        'The drawing could not be saved. Please try again.'
      );
      return;
    }

    // Keep the strokes on screen rather than blinking them out until the
    // annotations watcher folds the new annotation back in.
    drawingCoordinator.retainDrawing(drawingData);

    // Closing resets the panel, which reports leaving draw mode and so turns
    // the canvas off and resumes playback, exactly once.
    closeQuickPick();
  } catch (err) {
    console.error('Failed to create drawing from quick pick:', err);
    notifyError(
      'Failed to add drawing',
      err instanceof Error
        ? err.message
        : 'The drawing could not be saved. Please try again.'
    );
  } finally {
    drawingSaving.value = false;
  }
};
```

Also add `drawingSaving.value = false;` next to the existing `commentSaving.value = false;` inside `closeQuickPick`, for the same reason the comment guard is cleared there.

Check the imports at the top of the file: add `DrawingData` to the existing `@/types/database` type import if it is not already there.

- [ ] **Step 4: Bind the panel**

Extend the `<AnnotationQuickPick>` element in the template:

```html
      <AnnotationQuickPick
        :open="quickPickOpen"
        :x="quickPickX"
        :y="quickPickY"
        :labels="quickPickLabels"
        :frame="quickPickSnapshot?.frame ?? 0"
        :fps="quickPickSnapshot?.fps ?? 30"
        :draw-color="quickPickDrawColor"
        :draw-width="quickPickDrawWidth"
        @select="handleQuickPickSelect"
        @comment="handleQuickPickComment"
        @comment-mode="handleQuickPickCommentMode"
        @draw="handleQuickPickDrawing"
        @draw-mode="handleQuickPickDrawMode"
        @draw-undo="handleQuickPickDrawUndo"
        @draw-color="handleQuickPickDrawColor"
        @draw-width="handleQuickPickDrawWidth"
        @close="closeQuickPick"
      />
```

- [ ] **Step 5: Verify it builds and the suite still passes**

Run: `npm run build`
Expected: succeeds with no new TypeScript or Vue compiler errors.

Run: `npm test`
Expected: PASS, whole suite.

- [ ] **Step 6: Commit**

```bash
git add src/views/EditorView.vue
git commit -m "feat: save a quick pick drawing as an annotation"
```

---

## Task 7: Give a drawing its own timeline marker

**Files:**
- Modify: `src/components/VideoTimeline.vue` (marker at lines 346-379, legend at lines 418-450)
- Test: `src/components/__tests__/videoTimelineMarkers.test.ts`

**Interfaces:**
- Consumes: `isDrawingAnnotation` from Task 1.
- Produces: nothing.

- [ ] **Step 1: Write the failing tests**

In `src/components/__tests__/videoTimelineMarkers.test.ts`, add the fixture below `UNHYDRATED`:

```ts
const DRAWING = {
  id: 'annotation-drawing',
  title: 'Drawing',
  timestamp: 40,
  labels: [] as string[],
  annotationType: 'drawing',
  drawingData: {
    frame: 1200,
    canvasWidth: 800,
    canvasHeight: 450,
    paths: [
      {
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.2, y: 0.2 },
        ],
        strokeWidth: 4,
        color: '#ef4444',
        timestamp: 1,
      },
    ],
  },
};

const LABELLED_DRAWING = {
  id: 'annotation-labelled-drawing',
  title: 'BALL MISSED',
  timestamp: 50,
  severity: 'low',
  labels: ['label-ball-missed'],
  annotationType: 'drawing',
  drawingData: DRAWING.drawingData,
};
```

and add both to the `annotations` array passed in `mountTimeline`:

```ts
            annotations: [LABELLED, COMMENT, UNHYDRATED, DRAWING, LABELLED_DRAWING],
```

Then append:

```ts
describe('VideoTimeline drawing markers', () => {
  it('squares off a drawing marker', async () => {
    const t = mountTimeline();
    await nextTick();

    const marker = dotFor(t.root, 'annotation-drawing');
    expect(marker!.className).toContain('rounded-sm');
    expect(marker!.className).toContain('border-gray-300');
    expect(marker!.style.backgroundColor).toBe('');
    t.unmount();
  });

  it('leaves the comment marker round', async () => {
    const t = mountTimeline();
    await nextTick();

    const marker = dotFor(t.root, 'annotation-comment');
    expect(marker!.className).toContain('rounded-full');
    expect(marker!.className).not.toContain('rounded-sm');
    t.unmount();
  });

  it('lets the label win over the drawing', async () => {
    // A label says what the annotation is about whatever else it carries, so
    // an annotation with both is still drawn as its label.
    const t = mountTimeline();
    await nextTick();

    const marker = dotFor(t.root, 'annotation-labelled-drawing');
    expect(marker!.className).toContain('rounded-full');
    expect(marker!.style.backgroundColor).toBe('rgb(52, 211, 153)'); // low => #34d399
    t.unmount();
  });

  it('emits exactly one border colour per marker', async () => {
    const t = mountTimeline();
    await nextTick();

    for (const id of [
      'annotation-labelled',
      'annotation-comment',
      'annotation-unhydrated',
      'annotation-drawing',
      'annotation-labelled-drawing',
    ]) {
      const classes = dotFor(t.root, id)!.className.split(/\s+/);
      expect(classes.filter((name) => name.startsWith('border-')).length).toBe(2);
    }
    t.unmount();
  });
});
```

The count of 2 in the last test is `border-2` plus exactly one `border-<colour>`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/__tests__/videoTimelineMarkers.test.ts`
Expected: FAIL. The drawing marker currently renders `rounded-full`, because a label-less drawing satisfies `isCommentAnnotation`.

- [ ] **Step 3: Implement**

In the script of `src/components/VideoTimeline.vue`, extend the import and replace the `isComment` helper at lines 231-232:

```ts
import { isCommentAnnotation, isDrawingAnnotation } from '@/utils/annotationPayload';
```

```ts
/**
 * Precedence: a label says what an annotation is about whatever else it
 * carries, so only a label-less annotation gets one of the outline treatments,
 * and its own content decides which. See isCommentAnnotation.
 */
const isDrawing = (annotation: TimelineAnnotation) =>
  isCommentAnnotation(annotation) && isDrawingAnnotation(annotation);

const isComment = (annotation: TimelineAnnotation) =>
  isCommentAnnotation(annotation) && !isDrawingAnnotation(annotation);

/**
 * One place, so exactly one border colour class can ever come out of it.
 * Drawings and comments share the outline; the shape is what separates them,
 * which reads better than a fill difference at this size.
 */
const markerClasses = (annotation: TimelineAnnotation) => {
  const shape = isDrawing(annotation) ? 'rounded-sm' : 'rounded-full';
  if (isSelected(annotation)) {
    return `${shape} border-yellow-400 shadow-yellow-400/50 opacity-100 scale-110`;
  }
  if (isDrawing(annotation) || isComment(annotation)) {
    return `${shape} border-gray-300 bg-transparent`;
  }
  return `${shape} border-white`;
};

const markerStyle = (annotation: TimelineAnnotation) =>
  isDrawing(annotation) || isComment(annotation)
    ? undefined
    : { backgroundColor: getSeverityColor((annotation as any)?.severity) };
```

Replace the marker element and the comment above it:

```html
          <!--
            Labels are filled dots, a comment is a hollow ring, and a drawing is
            a square, so a note and a sketch each read differently from an event
            at a glance. Same size and hit area for all three.
          -->
          <div
            class="w-4 h-4 border-2 shadow-lg absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-90"
            :class="markerClasses(annotation as TimelineAnnotation)"
            :style="markerStyle(annotation as TimelineAnnotation)"
          />
```

Add the legend entry directly after the existing `Comment` entry:

```html
        <div class="flex items-center space-x-1.5 text-xs text-gray-400">
          <div
            class="w-2 h-2 rounded-sm border"
            style="border-color: #d1d5db"
          />
          <span>Drawing</span>
        </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/__tests__/videoTimelineMarkers.test.ts`
Expected: PASS, the pre-existing marker tests and the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/components/VideoTimeline.vue src/components/__tests__/videoTimelineMarkers.test.ts
git commit -m "feat: draw drawing markers as squares on the timeline"
```

---

## Task 8: Verify the whole flow in the real app

**Files:** none. Nothing is committed from this task unless a defect is found.

**Interfaces:**
- Consumes: everything above.
- Produces: a defect list, or a clean report.

- [ ] **Step 1: Run the full suite and the build**

Run: `npm test`
Expected: PASS, whole suite, no skipped files.

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 2: Launch the app**

Use the project's `verify` skill, which documents how this app is built, launched and driven. Sign in, open a video in the editor.

- [ ] **Step 3: Walk the happy path in single mode**

1. Play the video, then click the timeline at a moment worth marking.
2. The quick pick opens above the pointer, showing `C  COMMENT` and `D  DRAWING` under the categories. Playback continues.
3. Press `D`. The panel collapses to the toolbar. Playback pauses. The video shows the crosshair and the thin orange edge.
4. Draw two strokes on the video.
5. Press `4`. Draw a third stroke: it is green.
6. Press `]`. Draw a fourth: it is thicker.
7. Press `U`. The fourth stroke disappears and nothing else does.
8. Press `Enter`.

Confirm: the panel closes, the drawing stays on the video, playback resumes, a square marker appears on the timeline at the frame that was clicked, and the legend below the timeline reads `Drawing`.

- [ ] **Step 4: Check the frame the drawing landed on**

Scrub away from the marker and back, then click the marker. The drawing must reappear on the same frame the marker sits on. This is the check that the snapshot frame stamping works: a one-frame mismatch shows an empty canvas here and nowhere else.

- [ ] **Step 5: Check the sidebar**

The new annotation appears in the sidebar titled `Drawing`, with no label. Open it for editing and press Update without attaching a label: it must save rather than refuse.

Then open the sidebar's add-annotation form. Its drawing section must be empty, with no strokes carried over from the timeline drawing. That is the check on the `drawing-created` cross-talk.

- [ ] **Step 6: Check cancel and the transport keys**

1. Click the timeline near the existing drawing, press `D`, draw a stroke, press `Esc`.
   Confirm: the new stroke disappears, the previously saved drawing on that frame is still there, the panel is back on the category screen, and a second `Esc` closes it and resumes playback.
2. Click the timeline, press `D`, draw a stroke, press `Space`.
   Confirm: the video does not resume and the stroke is still on the canvas. Repeat with the left and right arrow keys.

- [ ] **Step 7: Check dual mode**

Open a comparison. Right-click a video to open the quick pick, press `D`, draw on video A, press `Enter`. Confirm the annotation is created and the drawing renders on video A when scrubbing back to it.

Video B is expected to have no drawing surface. See "Reported, not in scope" below: this is pre-existing and not a regression.

- [ ] **Step 8: Look hard at the result**

Check both light and dark themes, and check that:

- the toolbar does not cover the part of the video that most wants drawing on. If it does, change the `position` computed in `AnnotationQuickPick` to pin the toolbar bottom-centre in draw mode, and re-run steps 3 to 6.
- the selected colour swatch and the selected width are unmistakable, and the white swatch is visible against the panel in light mode.
- the drawing overlay is exactly the size of the video, with no oversized canvas, no white wash and no leftover blue chrome.
- the square marker and the round comment marker are distinguishable at a glance on a busy timeline.

- [ ] **Step 9: Report**

If everything passes, say so plainly with the commands run. If anything fails, fix it in a follow-up commit with its own test where a test can catch it, and re-run this task from Step 1.

---

## Reported, not in scope

Found while planning. Neither is caused or worsened by this change, and neither is fixed here.

1. **Video B has no drawing canvas in dual mode.** `DualVideoPlayer` provides an `overlays-b` slot (`src/components/video/DualVideoPlayer.vue:51`) and `UnifiedVideoPlayer` exposes a `drawingCanvasBRef`, but it never fills that slot: only `overlays-a` is bound. So `canvasB`, `drawingB` and every dual branch in `useDrawingCoordinator` are wired to a canvas that is never mounted, and drawing in a comparison works on video A only. Filling the slot is about 18 lines mirroring the video A block, but it turns on a surface that has never run, so it wants its own change and its own testing.

2. **The drawing overlay covers the video controls.** `.canvas-container` is `inset: 0` on the video wrapper, which includes the control bar, so play, pause and volume are unreachable while drawing mode is on. Pre-existing on the sidebar path. Excluding the controls from the overlay, or insetting it to the video's own box, is a separate change.
