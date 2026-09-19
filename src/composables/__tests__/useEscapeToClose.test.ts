// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, defineComponent, ref } from 'vue';
import { useEscapeToClose } from '@/composables/useEscapeToClose';

function mountWith(open: boolean) {
  const close = vi.fn();
  const isOpen = ref(open);
  const app = createApp(
    defineComponent({
      setup() {
        useEscapeToClose(() => isOpen.value, close);
        return () => null;
      },
    })
  );
  app.mount(document.createElement('div'));
  return { close, isOpen, unmount: () => app.unmount() };
}

const pressEscape = () =>
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  );

describe('useEscapeToClose', () => {
  it('closes on Escape while open', () => {
    const m = mountWith(true);
    pressEscape();
    expect(m.close).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('does nothing while closed', () => {
    const m = mountWith(false);
    pressEscape();
    expect(m.close).not.toHaveBeenCalled();
    m.unmount();
  });

  // One Escape must close one thing. The dashboard has its own window listener
  // that closes the details panel, and it used to fire for the same key press
  // that closed a dialog on top of it.
  it('keeps the Escape from reaching page-level listeners behind the dialog', () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    const m = mountWith(true);

    pressEscape();

    expect(behind).not.toHaveBeenCalled();
    window.removeEventListener('keydown', behind);
    m.unmount();
  });

  it('stops listening once unmounted', () => {
    const m = mountWith(true);
    m.unmount();
    pressEscape();
    expect(m.close).not.toHaveBeenCalled();
  });
});
