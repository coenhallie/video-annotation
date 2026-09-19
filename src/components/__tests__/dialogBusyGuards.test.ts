// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import NewFolderDialog from '@/components/NewFolderDialog.vue';
import DeleteConfirmationDialog from '@/components/DeleteConfirmationDialog.vue';

// Both dialogs stay open while the parent's request runs. Without a busy state
// Enter twice made two identically named folders, and a double confirm fired
// the delete twice (the second one failing with an error toast).
function mount(component: any, props: Record<string, unknown>) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({ render: () => h(component, props) });
  app.mount(root);
  const button = (name: RegExp) =>
    [...document.body.querySelectorAll('button')].find((b) =>
      name.test((b.textContent ?? '').trim())
    )!;
  return { button, unmount: () => (app.unmount(), root.remove()) };
}

describe('dialogs ignore a second submit while busy', () => {
  it('NewFolderDialog', async () => {
    const onCreate = vi.fn();
    const d = mount(NewFolderDialog, { parentFolder: null, busy: true, onCreate });
    const input = document.body.querySelector<HTMLInputElement>('#folder-name')!;
    input.value = 'Drills';
    input.dispatchEvent(new Event('input'));
    await nextTick();

    d.button(/creat/i).click();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(d.button(/creat/i).disabled).toBe(true);
    d.unmount();
  });

  it('DeleteConfirmationDialog', () => {
    const onConfirm = vi.fn();
    const d = mount(DeleteConfirmationDialog, {
      itemType: 'folder', itemName: 'Drills', itemCount: 0, busy: true, onConfirm,
    });

    d.button(/delet/i).click();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(d.button(/delet/i).disabled).toBe(true);
    d.unmount();
  });

  it('both still submit when not busy', async () => {
    const onConfirm = vi.fn();
    const d = mount(DeleteConfirmationDialog, {
      itemType: 'folder', itemName: 'Drills', itemCount: 0, onConfirm,
    });
    d.button(/^delete$/i).click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    d.unmount();
  });
});
