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
  const frame = ref(300);

  const app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(DrawingCanvas, {
            ref: instance,
            currentFrame: frame.value,
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
      // Asserted non-null: every test calls this only after ready(), by
      // which point initCanvas has constructed the one instance under test.
      return FakeCanvas.instances[0]!;
    },
    setFrame: (value: number) => {
      frame.value = value;
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
 * path:created handler turns it into a session path. Fabric hands the same
 * object to both calls, and the component's undo now tracks that object by
 * identity, so the fake must too.
 */
const draw = async (harness: ReturnType<typeof mountCanvas>) => {
  const event = fabricPathEvent();
  harness.canvas.add(event.path);
  harness.canvas.handlers['path:created']?.(event as never);
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

  it('declines to remove a reloaded object once a session has been left open across a seek', async () => {
    // A timeline click can seek while drawing mode is still open. The seek
    // clears the canvas and re-renders it for the new frame, so the
    // session's own stroke is no longer on the canvas by the time undo
    // runs: the last object there belongs to whatever the reload put there,
    // not to this session. Undo still consumes its own bookkeeping - that
    // part does not depend on what is on the canvas - but declines to
    // remove an object it never put there.
    const harness = mountCanvas();
    await ready();
    await draw(harness);

    // A jump greater than one frame skips the fade transition, so the
    // reload settles within a couple of ticks instead of a 150ms timer.
    harness.setFrame(400);
    await nextTick();
    await nextTick();
    harness.canvas.add({ persisted: true });

    harness.component.undoLastStroke();

    expect(harness.canvas.getObjects()).toHaveLength(1);
    expect(harness.component.getCurrentDrawingSession()).toBeNull();
    harness.unmount();
  });

  it('declines to remove a reloaded object after a round trip back to the drawn frame', async () => {
    // The single-hop case above is not the whole story: seeking away and
    // then back reloads the canvas a second time from persisted drawings,
    // so by the time the frame number matches the session's again, the
    // object sitting on the canvas is still not the session's own - a
    // frame-equality check would wrongly let this one through.
    const harness = mountCanvas();
    await ready();
    await draw(harness);

    harness.setFrame(400);
    await nextTick();
    await nextTick();
    harness.setFrame(300);
    await nextTick();
    await nextTick();
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
