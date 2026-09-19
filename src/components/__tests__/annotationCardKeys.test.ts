// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, h } from 'vue';

vi.mock('@/components/CommentSection.vue', () => ({
  default: { render: () => null },
}));

import AnnotationCard from '@/components/AnnotationCard.vue';

function mountCard() {
  const onSelect = vi.fn();
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({
    render: () =>
      h(AnnotationCard, {
        annotation: { id: 'a1', frame: 10, timestamp: 1, content: 'note', labels: [] },
        onSelect,
      }),
  });
  app.mount(root);
  return { root, onSelect, unmount: () => (app.unmount(), root.remove()) };
}

const keydown = (el: Element, key: string) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
};

describe('AnnotationCard keyboard', () => {
  it('selects the row on Enter when the row itself has focus', () => {
    const c = mountCard();
    keydown(c.root.querySelector('[role="button"]')!, 'Enter');
    expect(c.onSelect).toHaveBeenCalledTimes(1);
    c.unmount();
  });

  it.each(['Enter', ' '])('leaves %j on the Delete button to the button', (key) => {
    const c = mountCard();
    const del = c.root.querySelector('button[title="Delete annotation"]')!;
    const event = keydown(del, key);
    // preventDefault on the keydown is what stops the browser turning it into a
    // click on the focused button.
    expect(event.defaultPrevented).toBe(false);
    expect(c.onSelect).not.toHaveBeenCalled();
    c.unmount();
  });
});
