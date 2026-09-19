// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';

vi.mock('@/components/CommentSection.vue', () => ({
  default: { render: () => null },
}));

import AnnotationCard from '@/components/AnnotationCard.vue';

// Deleting an annotation hard-deletes its drawing and its whole comment thread,
// and the trash icon sits where the timecode is until hover. One click must not
// be enough.
function mountCard() {
  const onDelete = vi.fn();
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({
    render: () =>
      h(AnnotationCard, {
        annotation: { id: 'a1', frame: 10, timestamp: 1, content: 'note', labels: [] },
        onDelete,
      }),
  });
  app.mount(root);
  const button = (name: RegExp) =>
    [...document.body.querySelectorAll('button')].find((b) =>
      name.test((b.textContent ?? '').trim())
    );
  const trash = () =>
    root.querySelector<HTMLButtonElement>('button[title="Delete annotation"]')!;
  return { root, onDelete, button, trash, unmount: () => (app.unmount(), root.remove()) };
}

describe('AnnotationCard delete', () => {
  it('asks before deleting', async () => {
    const c = mountCard();
    c.trash().click();
    await nextTick();

    expect(c.onDelete).not.toHaveBeenCalled();
    expect(document.body.textContent).toMatch(/drawing and comments/i);
    c.unmount();
  });

  it('deletes once confirmed', async () => {
    const c = mountCard();
    c.trash().click();
    await nextTick();
    c.button(/^delete$/i)!.click();
    await nextTick();

    expect(c.onDelete).toHaveBeenCalledTimes(1);
    c.unmount();
  });

  it('does nothing when cancelled', async () => {
    const c = mountCard();
    c.trash().click();
    await nextTick();
    c.button(/^cancel$/i)!.click();
    await nextTick();

    expect(c.onDelete).not.toHaveBeenCalled();
    expect(c.button(/^cancel$/i)).toBeUndefined();
    c.unmount();
  });
});
