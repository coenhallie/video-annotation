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

/** Dispatch on window, where the panel's capture-phase listener lives. */
const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
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

  // jsdom never inserts text from a synthetic keydown, so asserting the input
  // stays empty would pass whatever the handler does. defaultPrevented is the
  // only thing here that distinguishes swallowed from delivered.
  it('swallows the auto-repeat of the C that opened the field', async () => {
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();

    const repeated = press('c', { repeat: true });

    expect(repeated.defaultPrevented).toBe(true);
    panel.unmount();
  });

  it('delivers auto-repeat again once a fresh key has been pressed', async () => {
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();

    // Any keydown that is not itself a repeat means the held C is long gone,
    // so holding Backspace to erase must keep working.
    press('a');
    const held = press('Backspace', { repeat: true });

    expect(held.defaultPrevented).toBe(false);
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

  it('keeps the text and stays in comment mode after committing', async () => {
    // Saving is asynchronous and can fail. The listener closes the panel only
    // once the annotation is stored, so the field has to survive the emit or a
    // rejected insert would take the prose with it.
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();

    const input = commentInput(panel.root) as HTMLInputElement;
    await type(input, 'keeper off his line early');
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    await nextTick();

    expect(panel.events).toContainEqual(['comment', 'keeper off his line early']);
    expect(commentInput(panel.root)?.value).toBe('keeper off his line early');
    expect(
      panel.events.some(([name, value]) => name === 'comment-mode' && value === false)
    ).toBe(false);
    panel.unmount();
  });

  it('reports leaving comment mode once when closed after a commit', async () => {
    // The success path is emit then close. Playback must resume exactly once.
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();

    const input = commentInput(panel.root) as HTMLInputElement;
    await type(input, 'keeper off his line early');
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    await nextTick();

    panel.open.value = false;
    await nextTick();

    expect(
      panel.events.filter(([name, value]) => name === 'comment-mode' && value === false)
    ).toHaveLength(1);
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

  it('reports leaving comment mode when the panel unmounts while typing', async () => {
    // Same stranding risk as draw mode: an error boundary elsewhere in the
    // tree can unmount this panel directly while a comment is open, and
    // without onBeforeUnmount reporting the mode change a paused video would
    // never resume.
    const panel = mountPanel();
    await nextTick();
    press('c');
    await nextTick();

    panel.unmount();

    expect(
      panel.events.filter(([name, value]) => name === 'comment-mode' && value === false)
    ).toHaveLength(1);
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
    // the user cannot touch the video at all. The panel has to take pointer
    // events back for itself, or it would be click-through too.
    const panel = mountPanel();
    await nextTick();
    const backdrop = panel.root.firstElementChild as HTMLElement;
    const panelEl = backdrop.firstElementChild as HTMLElement;
    expect(backdrop.className).not.toContain('pointer-events-none');
    expect(panelEl.className).not.toContain('pointer-events-auto');

    press('d');
    await nextTick();

    expect(backdrop.className).toContain('pointer-events-none');
    expect(panelEl.className).toContain('pointer-events-auto');
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

  it('swallows the transport keys even when a modifier is held', async () => {
    // useVideoPlayer's handler switches on event.code and never looks at the
    // modifiers, so a held Alt/Ctrl/Meta does not stop it from seeking or
    // toggling play/pause underneath a modifier chord meant for drawing.
    const panel = mountPanel();
    await nextTick();
    press('d');
    await nextTick();

    expect(press(' ', { altKey: true }).defaultPrevented).toBe(true);
    expect(press('ArrowLeft', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(press('ArrowRight', { metaKey: true }).defaultPrevented).toBe(true);
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

  it('backs out on Escape even with a modifier held', async () => {
    // Cmd/Ctrl+Escape must not fall into the undo-chord branch and be
    // swallowed as a no-op: Escape has to win regardless of what else is down.
    const panel = mountPanel();
    await nextTick();
    press('d');
    await nextTick();

    press('Escape', { metaKey: true });
    await nextTick();

    expect(toolbar(panel.root)).toBeNull();
    expect(panel.events).toContainEqual(['draw-mode', false]);
    panel.unmount();
  });

  it('reports leaving draw mode when the panel unmounts while drawing', async () => {
    // Every other exit routes through leaveDrawMode(), which emits
    // draw-mode(false). An onErrorCaptured boundary elsewhere in the tree can
    // unmount this panel directly, skipping that path entirely unless
    // onBeforeUnmount also reports the mode change.
    const panel = mountPanel();
    await nextTick();
    press('d');
    await nextTick();

    panel.unmount();

    expect(
      panel.events.filter(([name, value]) => name === 'draw-mode' && value === false)
    ).toHaveLength(1);
  });
});
