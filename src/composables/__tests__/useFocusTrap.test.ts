// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';

function mountDialog() {
  const open = ref(false);
  const outside = document.createElement('button');
  outside.textContent = 'behind';
  document.body.appendChild(outside);
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({
      setup() {
        const panel = ref<HTMLElement | null>(null);
        useFocusTrap(panel, () => open.value);
        return () =>
          open.value
            ? h('div', { ref: panel }, [
                h('button', { id: 'first' }, 'first'),
                h('button', { id: 'disabled', disabled: true }, 'off'),
                h('button', { id: 'last' }, 'last'),
              ])
            : null;
      },
    })
  );
  app.mount(root);
  const tab = (shift = false) => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    return event;
  };
  return { open, outside, tab, unmount: () => (app.unmount(), root.remove(), outside.remove()) };
}

describe('useFocusTrap', () => {
  it('moves focus into the dialog when it opens', async () => {
    const d = mountDialog();
    d.outside.focus();
    d.open.value = true;
    await nextTick();
    await nextTick();
    expect(document.activeElement?.id).toBe('first');
    d.unmount();
  });

  it('wraps Tab at both ends, skipping disabled controls', async () => {
    const d = mountDialog();
    d.open.value = true;
    await nextTick();
    await nextTick();

    (document.getElementById('last') as HTMLElement).focus();
    expect(d.tab().defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('first');

    expect(d.tab(true).defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('last');
    d.unmount();
  });

  it('gives focus back to where it was when the dialog closes', async () => {
    const d = mountDialog();
    d.outside.focus();
    d.open.value = true;
    await nextTick();
    await nextTick();
    d.open.value = false;
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(d.outside);
    d.unmount();
  });
});
