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
