// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, h } from 'vue';
import ChangelogModal from '@/components/ChangelogModal.vue';

describe('ChangelogModal', () => {
  it('is a labelled dialog that closes on Escape', () => {
    const closed: number[] = [];
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = createApp({
      render: () => h(ChangelogModal, { isVisible: true, onClose: () => closed.push(1) }),
    });
    app.mount(root);

    expect(root.querySelector('[role="dialog"][aria-label="Changelog"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Close"]')).not.toBeNull();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(closed).toEqual([1]);
    app.unmount();
    root.remove();
  });
});
