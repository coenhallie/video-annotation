// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import VideoTimeline from '@/components/VideoTimeline.vue';
import type { Annotation } from '@/types/database';

/**
 * Fill in the columns every annotation row has, so a fixture only has to state
 * what the case under test is actually about. The timeline reads title,
 * timestamp, severity, labels, annotationType and drawingData; the rest are
 * required on the row and irrelevant here.
 */
// The optional keys explicitly admit undefined, so one fixture can be built by
// spreading another - `{ ...DRAWING, labels: [...] }` carries drawingData as
// `DrawingData | null | undefined`, which a plain Partial<Annotation> rejects.
type AnnotationFixture = {
  [K in keyof Annotation]?: Annotation[K] | undefined;
} & { id: string };

const annotation = (fields: AnnotationFixture): Annotation => {
  // Indexable, so the loop below can apply overrides by key without a cast.
  const built: Annotation & Record<string, unknown> = {
    id: fields.id,
    content: '',
    title: '',
    severity: 'medium',
    color: '#6b7280',
    timestamp: 0,
    frame: 0,
    annotationType: 'text',
    duration: 1 / 30,
    durationFrames: 1,
  };
  // Applied key by key, skipping undefined: an override that is undefined means
  // "leave the default", which is not the same as writing undefined into a key
  // the concrete Annotation types as present.
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      built[key] = value;
    }
  }
  return built;
};


const LABELLED = annotation({
  id: 'annotation-labelled',
  title: 'BALL MISSED',
  timestamp: 10,
  severity: 'high',
  labels: ['label-ball-missed'],
});

const COMMENT = annotation({
  id: 'annotation-comment',
  title: 'keeper off his line early',
  timestamp: 20,
  labels: [] as string[],
});

// What useRealtimeAnnotations pushes: a raw annotations row, with no labels
// property at all because the join was never resolved. Its labels are unknown,
// not empty, so it must not be mistaken for a comment.
const UNHYDRATED = annotation({
  id: 'annotation-unhydrated',
  title: 'BALL MISSED',
  timestamp: 30,
  severity: 'low',
});

const DRAWING = annotation({
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
});

const LABELLED_DRAWING = annotation({
  id: 'annotation-labelled-drawing',
  title: 'BALL MISSED',
  timestamp: 50,
  severity: 'low',
  labels: ['label-ball-missed'],
  annotationType: 'drawing',
  drawingData: DRAWING.drawingData,
});

function mountTimeline(
  selectedAnnotation?: Annotation,
  extraProps: Record<string, unknown> = {}
) {
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
            annotations: [LABELLED, COMMENT, UNHYDRATED, DRAWING, LABELLED_DRAWING],
            ...(selectedAnnotation ? { selectedAnnotation } : {}),
            ...extraProps,
          });
      },
    })
  );
  app.mount(root);
  return { root, unmount: () => { app.unmount(); root.remove(); } };
}

/**
 * The bar element that both the click/mousedown handlers and the pointer-time
 * math key off. jsdom never lays anything out, so getBoundingClientRect()
 * reports a zero-size rect by default; stub it to a plausible pixel width so
 * a clientX on a marker maps to a real, non-zero time under the pointer -
 * that gap is exactly what the bug being tested here depends on.
 */
function stubBarRect(root: HTMLElement, width = 1008) {
  const bar = root.querySelector('[data-annotation-marker]')
    ?.parentElement as HTMLElement;
  bar.getBoundingClientRect = () =>
    ({
      width,
      height: 48,
      top: 100,
      left: 0,
      right: width,
      bottom: 148,
      x: 0,
      y: 100,
      toJSON() {},
    }) as DOMRect;
  return bar;
}

function dispatchMouse(
  target: EventTarget,
  type: string,
  clientX: number,
  clientY = 124
) {
  target.dispatchEvent(
    new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true })
  );
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

  it('fills a marker whose labels were never hydrated rather than ringing it', async () => {
    const t = mountTimeline();
    await nextTick();

    const dot = dotFor(t.root, 'annotation-unhydrated');
    expect(dot).toBeDefined();
    expect(dot!.style.backgroundColor).toBe('rgb(52, 211, 153)'); // low => #34d399
    expect(dot!.className).toContain('border-white');
    expect(dot!.className).not.toContain('bg-transparent');
    t.unmount();
  });

  it('shows a selected comment marker with the selection border and no comment border', async () => {
    const t = mountTimeline(COMMENT);
    await nextTick();

    const dot = dotFor(t.root, 'annotation-comment');
    expect(dot).toBeDefined();
    expect(dot!.className).toContain('border-yellow-400');
    expect(dot!.className).not.toContain('border-gray-300');
    expect(dot!.style.backgroundColor).toBe('');
    t.unmount();
  });

  it('shows a selected labelled marker with the selection border and no default border', async () => {
    const t = mountTimeline(LABELLED);
    await nextTick();

    const dot = dotFor(t.root, 'annotation-labelled');
    expect(dot).toBeDefined();
    expect(dot!.className).toContain('border-yellow-400');
    expect(dot!.className).not.toContain('border-white');
    t.unmount();
  });
});

describe('VideoTimeline marker click seeks to the exact timestamp', () => {
  it('emits seek-to-time only with the annotation timestamp, never a pointer-derived time', async () => {
    const seeks: number[] = [];
    const t = mountTimeline(undefined, {
      onSeekToTime: (time: number) => seeks.push(time),
    });
    await nextTick();

    stubBarRect(t.root);
    const marker = t.root.querySelector(
      '[data-annotation-marker][data-annotation-id="annotation-drawing"]'
    ) as HTMLElement;
    expect(marker).toBeTruthy();

    // DRAWING sits at timestamp 40 of a 60s duration, so its exact centre is
    // at x = 40/60 * 1008 = 672. Press a couple of pixels off centre, the
    // same few-pixel miss the manual repro measured on the real timeline, to
    // prove the marker's own timestamp wins over whatever the pointer is
    // sitting on.
    const offCentreX = 674;
    const pointerDerivedTime = (offCentreX / 1008) * 60;
    expect(pointerDerivedTime).not.toBeCloseTo(DRAWING.timestamp, 5);

    dispatchMouse(marker, 'mousedown', offCentreX);
    dispatchMouse(document, 'mouseup', offCentreX);
    dispatchMouse(marker, 'click', offCentreX);

    // The bar's own seek is debounced (SEEK_DEBOUNCE_MS = 16ms) on some
    // paths, so a synchronous-only check could miss a pointer-derived seek
    // that fires late instead of never. Wait past the debounce window before
    // asserting "never", not just "not yet".
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(seeks).toEqual([DRAWING.timestamp]);

    t.unmount();
  });
});

describe('VideoTimeline plain bar interaction is unaffected', () => {
  it('seeks to the pointer time on a click away from any marker', async () => {
    const seeks: number[] = [];
    const t = mountTimeline(undefined, {
      onSeekToTime: (time: number) => seeks.push(time),
    });
    await nextTick();

    stubBarRect(t.root);
    const bar = t.root.querySelector(
      '[data-annotation-marker]'
    )?.parentElement as HTMLElement;

    // x = 300 of 1008 -> nowhere near any of the fixture markers (10..50s).
    dispatchMouse(bar, 'mousedown', 300);
    dispatchMouse(document, 'mouseup', 300);
    dispatchMouse(bar, 'click', 300);

    const expected = (300 / 1008) * 60;
    expect(seeks.length).toBeGreaterThan(0);
    for (const s of seeks) expect(s).toBeCloseTo(expected, 5);

    t.unmount();
  });

  it('opens the quick pick on a plain click release, away from any marker', async () => {
    const quickPicks: unknown[] = [];
    const t = mountTimeline(undefined, {
      onOpenQuickPick: (payload: unknown) => quickPicks.push(payload),
    });
    await nextTick();

    stubBarRect(t.root);
    const bar = t.root.querySelector(
      '[data-annotation-marker]'
    )?.parentElement as HTMLElement;

    dispatchMouse(bar, 'mousedown', 300);
    dispatchMouse(document, 'mouseup', 300);

    expect(quickPicks.length).toBe(1);
    t.unmount();
  });

  it('keeps seeking through a drag scrub that starts on a marker and moves past the threshold', async () => {
    const seeks: number[] = [];
    const t = mountTimeline(undefined, {
      onSeekToTime: (time: number) => seeks.push(time),
    });
    await nextTick();

    stubBarRect(t.root);
    const marker = t.root.querySelector(
      '[data-annotation-marker][data-annotation-id="annotation-drawing"]'
    ) as HTMLElement;

    const startX = 672; // DRAWING's own marker centre
    const endX = 900; // a real drag, well past the quick-pick threshold
    dispatchMouse(marker, 'mousedown', startX);
    dispatchMouse(document, 'mousemove', endX);
    dispatchMouse(document, 'mouseup', endX);

    const expectedEnd = (endX / 1008) * 60;
    expect(seeks.length).toBeGreaterThan(0);
    expect(seeks[seeks.length - 1]).toBeCloseTo(expectedEnd, 5);

    t.unmount();
  });
});

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
