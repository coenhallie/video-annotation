// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import CommentForm from '@/components/CommentForm.vue';

function mountForm(save: (data: { content: string }) => Promise<void>) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({
    render: () => h(CommentForm, { annotationId: 'a1', save }),
  });
  app.mount(root);
  const textarea = root.querySelector('textarea')!;
  const type = async (text: string) => {
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
    await nextTick();
  };
  const post = () => {
    const button = [...root.querySelectorAll('button')].find((b) =>
      /post/i.test(b.textContent ?? '')
    )!;
    button.click();
  };
  const settle = async () => {
    await Promise.resolve();
    await nextTick();
    await nextTick();
  };
  return { root, textarea, type, post, settle, unmount: () => (app.unmount(), root.remove()) };
}

describe('CommentForm submit', () => {
  it('keeps the text and shows the reason when saving fails', async () => {
    const f = mountForm(async () => {
      throw new Error('You are offline');
    });
    await f.type('an important note');
    f.post();
    await f.settle();

    expect(f.textarea.value).toBe('an important note');
    expect(f.root.textContent).toContain('You are offline');
    f.unmount();
  });

  it('clears the text once the save has succeeded, not before', async () => {
    let finish!: () => void;
    const f = mountForm(() => new Promise<void>((resolve) => (finish = resolve)));
    await f.type('hello');
    f.post();
    await f.settle();
    expect(f.textarea.value).toBe('hello');

    finish();
    await f.settle();
    expect(f.textarea.value).toBe('');
    f.unmount();
  });

  it('ignores a second click while the first save is in flight', async () => {
    const save = vi.fn(() => new Promise<void>(() => {}));
    const f = mountForm(save);
    await f.type('hello');
    f.post();
    await f.settle();
    f.post();
    await f.settle();

    expect(save).toHaveBeenCalledTimes(1);
    f.unmount();
  });
});
