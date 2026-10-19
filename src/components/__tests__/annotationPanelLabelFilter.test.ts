// @vitest-environment jsdom
//
// The editor's annotation filter: group pills (EVT, PLR, ...), and once a group
// is picked, a second row with that group's labels in this video so the list
// can be narrowed to one label. The ordering and narrowing rules have their own
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
const labelPills = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLButtonElement>('[data-testid="filter-label"]')];
const cards = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-testid="card"]')].map((c) => c.textContent);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('AnnotationPanel label filter', () => {
  it('shows no label row until a group is picked', async () => {
    const panel = await mount();
    expect(labelPills(panel.root)).toHaveLength(0);
    panel.unmount();
  });

  it("shows the group's labels once it is picked", async () => {
    const panel = await mount();
    groupPill(panel.root, 'PLR').click();
    await flush();
    expect(labelPills(panel.root).map((b) => b.textContent?.trim())).toEqual([
      'All PLR',
      'PLR DUPLICATE',
      'PLR MISSED',
    ]);
    expect(cards(panel.root)).toEqual(['a1', 'a2']);
    panel.unmount();
  });

  it('narrows the list to the picked label, and back', async () => {
    const panel = await mount();
    groupPill(panel.root, 'PLR').click();
    await flush();
    labelPills(panel.root).find((b) => b.textContent?.includes('PLR MISSED'))!.click();
    await flush();
    expect(cards(panel.root)).toEqual(['a1']);

    labelPills(panel.root).find((b) => b.textContent?.includes('All PLR'))!.click();
    await flush();
    expect(cards(panel.root)).toEqual(['a1', 'a2']);
    panel.unmount();
  });

  it('marks the active label', async () => {
    const panel = await mount();
    groupPill(panel.root, 'PLR').click();
    await flush();
    const missed = () => labelPills(panel.root).find((b) => b.textContent?.includes('PLR MISSED'))!;
    expect(missed().getAttribute('aria-pressed')).toBe('false');
    missed().click();
    await flush();
    expect(missed().getAttribute('aria-pressed')).toBe('true');
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

    labelPills(panel.root).find((b) => b.textContent?.includes('PLR MISSED'))!.click();
    await flush();
    expect(panel.filterChanges.at(-1)).toEqual(['a1']);

    groupPill(panel.root, 'All').click();
    await flush();
    expect(panel.filterChanges.at(-1)).toBeNull();
    panel.unmount();
  });
});

