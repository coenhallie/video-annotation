// @vitest-environment jsdom
//
// The editor's annotation filter: group pills (EVT, PLR, ...), and a filter
// icon whose checklist refines the list to any mix of the current group's
// labels (every label, grouped, under All). The ordering and narrowing rules have their own
// tests in composables/__tests__/annotationFilteringLabels.test.ts; this covers
// the wiring in the panel.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import type { Label } from '@/types/labels';
import type { PanelAnnotation } from '@/types/component-interfaces';

const label = (id: string, name: string): Label =>
  ({ id, name, color: '#123456', isDefault: true }) as unknown as Label;

const LABELS = [
  label('missed', 'PLR MISSED'),
  label('dup', 'PLR DUPLICATE'),
  label('ball', 'BALL MISSED'),
];

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ user: ref({ id: 'u1' }), isAuthenticated: ref(true) }),
}));
vi.mock('@/composables/useGlobalComments', () => ({
  useGlobalComments: () => ({
    markCommentsAsViewed: vi.fn(),
    hasNewComments: () => false,
    getNewCommentCount: () => 0,
    getTotalCommentCount: () => 0,
    initializeCommentCounts: vi.fn(),
    cleanup: vi.fn(),
    onNewComment: vi.fn(() => () => {}),
  }),
}));
vi.mock('@/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({
    labels: ref(LABELS),
    labelsById: ref(Object.fromEntries(LABELS.map((l) => [l.id, l]))),
    load: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
  }),
}));
// Each card renders only its title, so the list can be read off the DOM.
vi.mock('@/components/AnnotationCard.vue', () => ({
  default: {
    props: ['annotation'],
    render(this: { annotation: PanelAnnotation }) {
      return h('div', { 'data-testid': 'card' }, this.annotation.title);
    },
  },
}));
for (const path of [
  '@/components/AnnotationForm.vue',
  '@/components/AnnotationSkeleton.vue',
  '@/components/LabelManagement.vue',
]) {
  vi.doMock(path, () => ({ default: { render: () => null } }));
}

const row = (id: string, labels: string[]): PanelAnnotation =>
  ({ id, title: id, timestamp: Number(id.slice(1)), labels }) as unknown as PanelAnnotation;

const ANNOTATIONS = [row('a1', ['missed']), row('a2', ['dup']), row('a3', ['ball'])];

async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function mount() {
  const { default: AnnotationPanel } = await import('@/components/AnnotationPanel.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const filterChanges: Array<string[] | null> = [];
  const app = createApp({
    render: () =>
      h(AnnotationPanel, {
        annotations: ANNOTATIONS,
        canAnnotate: false,
        onFilterChange: (ids: string[] | null) => filterChanges.push(ids),
      }),
  });
  app.mount(root);
  await flush();
  return { root, filterChanges, unmount: () => { app.unmount(); root.remove(); } };
}

const groupPill = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('[data-testid="filter-group"]')].find(
    (b) => b.textContent?.trim() === name
  )!;
const toggle = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>('[data-testid="label-filter-toggle"]')!;
const menu = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[data-testid="label-filter-menu"]');
const options = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLButtonElement>('[data-testid="label-filter-option"]')];
const option = (root: HTMLElement, name: string) =>
  options(root).find((b) => b.textContent?.trim() === name)!;
const cards = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-testid="card"]')].map((c) => c.textContent);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('AnnotationPanel label filter', () => {
  it('keeps the checklist closed until the filter icon is clicked', async () => {
    const panel = await mount();
    expect(menu(panel.root)).toBeNull();
    toggle(panel.root).click();
    await flush();
    expect(menu(panel.root)).not.toBeNull();
    panel.unmount();
  });

  it('lists every label of this video under All, grouped', async () => {
    const panel = await mount();
    toggle(panel.root).click();
    await flush();
    expect(menu(panel.root)?.textContent?.replace(/\s+/g, ' ')).toContain('PLR');
    expect(options(panel.root).map((b) => b.textContent?.trim())).toEqual([
      'PLR DUPLICATE',
      'PLR MISSED',
      'BALL MISSED',
    ]);
    panel.unmount();
  });

  it("lists only the picked group's labels", async () => {
    const panel = await mount();
    groupPill(panel.root, 'PLR').click();
    await flush();
    toggle(panel.root).click();
    await flush();
    expect(options(panel.root).map((b) => b.textContent?.trim())).toEqual([
      'PLR DUPLICATE',
      'PLR MISSED',
    ]);
    panel.unmount();
  });

  it('shows annotations with any of the ticked labels', async () => {
    const panel = await mount();
    toggle(panel.root).click();
    await flush();
    option(panel.root, 'PLR MISSED').click();
    await flush();
    expect(cards(panel.root)).toEqual(['a1']);
    option(panel.root, 'BALL MISSED').click();
    await flush();
    expect(cards(panel.root)).toEqual(['a1', 'a3']);
    expect(option(panel.root, 'PLR MISSED').getAttribute('aria-checked')).toBe('true');
    expect(option(panel.root, 'PLR DUPLICATE').getAttribute('aria-checked')).toBe('false');
    panel.unmount();
  });

  // The icon says the list is filtered even with the checklist closed.
  it('shows how many labels are ticked on the icon', async () => {
    const panel = await mount();
    expect(toggle(panel.root).textContent?.trim()).toBe('');
    toggle(panel.root).click();
    await flush();
    option(panel.root, 'PLR MISSED').click();
    option(panel.root, 'BALL MISSED').click();
    await flush();
    expect(toggle(panel.root).textContent?.trim()).toBe('2');
    panel.unmount();
  });

  it('clears the ticks', async () => {
    const panel = await mount();
    toggle(panel.root).click();
    await flush();
    option(panel.root, 'PLR MISSED').click();
    await flush();
    [...menu(panel.root)!.querySelectorAll('button')].find((b) => /clear/i.test(b.textContent ?? ''))!.click();
    await flush();
    expect(cards(panel.root)).toEqual(['a1', 'a2', 'a3']);
    panel.unmount();
  });

  // The timeline follows the list: the panel reports which annotations the
  // filter shows, or null when nothing is filtered.
  it('reports what the filter shows, for the timeline', async () => {
    const panel = await mount();
    expect(panel.filterChanges.at(-1)).toBeNull();

    groupPill(panel.root, 'PLR').click();
    await flush();
    expect(panel.filterChanges.at(-1)).toEqual(['a1', 'a2']);

    toggle(panel.root).click();
    await flush();
    option(panel.root, 'PLR MISSED').click();
    await flush();
    expect(panel.filterChanges.at(-1)).toEqual(['a1']);

    groupPill(panel.root, 'All').click();
    await flush();
    expect(panel.filterChanges.at(-1)).toBeNull();
    panel.unmount();
  });

  // Ticking labels under All filters too, so the timeline must hear about it.
  it('reports a label filter under All', async () => {
    const panel = await mount();
    toggle(panel.root).click();
    await flush();
    option(panel.root, 'BALL MISSED').click();
    await flush();
    expect(panel.filterChanges.at(-1)).toEqual(['a3']);
    panel.unmount();
  });
});
