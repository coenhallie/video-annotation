// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, ref } from 'vue';
import SidebarTabs from '@/components/SidebarTabs.vue';
import type { SidebarTab } from '@/types/component-interfaces';

function mount(initial: SidebarTab) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const model = ref<SidebarTab>(initial);
  const changes: SidebarTab[] = [];
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(SidebarTabs, {
          modelValue: model.value,
          'onUpdate:modelValue': (v: SidebarTab) => {
            changes.push(v);
            model.value = v;
          },
        }),
    })
  );
  app.mount(root);
  return {
    changes,
    tab: (id: SidebarTab) =>
      root.querySelector<HTMLElement>(`[data-testid="sidebar-tab-${id}"]`),
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

describe('SidebarTabs', () => {
  it('renders both tabs', () => {
    const w = mount('annotations');
    expect(w.tab('annotations')).not.toBeNull();
    expect(w.tab('history')).not.toBeNull();
    w.unmount();
  });

  it('marks the active tab selected', () => {
    const w = mount('annotations');
    expect(w.tab('annotations')?.getAttribute('aria-selected')).toBe('true');
    expect(w.tab('history')?.getAttribute('aria-selected')).toBe('false');
    w.unmount();
  });

  it('emits when a different tab is clicked', () => {
    const w = mount('annotations');
    w.tab('history')?.click();
    expect(w.changes).toEqual(['history']);
    w.unmount();
  });

  // Every emit costs a refetch in ActivityTimeline's watcher.
  it('does not emit when the active tab is re-clicked', () => {
    const w = mount('annotations');
    w.tab('annotations')?.click();
    expect(w.changes).toEqual([]);
    w.unmount();
  });
});
