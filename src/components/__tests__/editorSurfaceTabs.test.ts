// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import EditorSurfaceTabs from '@/components/EditorSurfaceTabs.vue';
import type { AnnotationSurface } from '@/types/database';

function mountTabs(initial: AnnotationSurface = 'video') {
  const current = ref<AnnotationSurface>(initial);
  const root = document.createElement('div');
  document.body.appendChild(root);

  const app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(EditorSurfaceTabs, {
            modelValue: current.value,
            'onUpdate:modelValue': (next: AnnotationSurface) => {
              current.value = next;
            },
          });
      },
    })
  );
  app.mount(root);

  return {
    root,
    current,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

const tab = (root: HTMLElement, surface: AnnotationSurface) =>
  root.querySelector<HTMLButtonElement>(`[data-testid="surface-tab-${surface}"]`);

describe('EditorSurfaceTabs', () => {
  it('renders a tab for each surface', () => {
    const harness = mountTabs();

    expect(tab(harness.root, 'video')?.textContent).toContain('Video');
    expect(tab(harness.root, 'pipeline')?.textContent).toContain(
      'Pipeline output'
    );

    harness.unmount();
  });

  it('marks the active tab as selected', () => {
    const harness = mountTabs('pipeline');

    expect(tab(harness.root, 'pipeline')?.getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(tab(harness.root, 'video')?.getAttribute('aria-selected')).toBe(
      'false'
    );

    harness.unmount();
  });

  it('emits the new surface on click', async () => {
    const harness = mountTabs('video');

    tab(harness.root, 'pipeline')?.click();
    await nextTick();

    expect(harness.current.value).toBe('pipeline');

    harness.unmount();
  });

  // Clicking the tab you are already on must not emit: every emit triggers an
  // annotation refetch through the watcher in useVideoAnnotations.
  it('does not emit when the active tab is clicked again', async () => {
    const harness = mountTabs('video');
    let emits = 0;

    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(EditorSurfaceTabs, {
              modelValue: 'video' as AnnotationSurface,
              'onUpdate:modelValue': () => {
                emits += 1;
              },
            });
        },
      })
    );
    app.mount(root);

    root.querySelector<HTMLButtonElement>('[data-testid="surface-tab-video"]')?.click();
    await nextTick();

    expect(emits).toBe(0);

    app.unmount();
    root.remove();
    harness.unmount();
  });
});
