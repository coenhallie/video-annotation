import { describe, it, expect } from 'vitest';
import { nextTick, ref } from 'vue';
import { useAnnotationFiltering } from '@/composables/useAnnotationFiltering';
import type { LabelColorMap, PanelAnnotation } from '@/types/component-interfaces';
import type { Label } from '@/types/labels';

const label = (id: string, name: string): Label =>
  ({ id, name, color: '#000', isDefault: true }) as unknown as Label;

const LABELS: LabelColorMap = {
  missed: label('missed', 'PLR MISSED'),
  dup: label('dup', 'PLR DUPLICATE'),
  ball: label('ball', 'BALL MISSED'),
  review: label('review', 'Review Needed'),
  unused: label('unused', 'PLR TELEPORT'),
};

const row = (id: string, timestamp: number, labels: string[]): PanelAnnotation =>
  ({ id, timestamp, labels }) as unknown as PanelAnnotation;

const ROWS = [
  row('a', 1, ['missed']),
  row('b', 2, ['dup']),
  row('c', 3, ['ball']),
  row('d', 4, ['missed', 'ball']),
  row('e', 5, ['review']),
  row('f', 6, []),
];

const setup = (rows = ROWS) => {
  const annotations = ref(rows);
  return {
    annotations,
    ...useAnnotationFiltering({ annotations, labelsById: ref(LABELS) }),
  };
};

const ids = (list: PanelAnnotation[]) => list.map((a) => a.id);

describe('useAnnotationFiltering groups', () => {
  // Labels without a group prefix used to be unreachable from the filter.
  it('offers an OTHER group, last, for labels without a group prefix', () => {
    const { availableCategories } = setup();
    expect(availableCategories.value).toEqual(['PLR', 'BALL', 'OTHER']);
  });

  it('leaves OTHER out when no annotation has such a label', () => {
    const { availableCategories } = setup(ROWS.filter((r) => r.id !== 'e'));
    expect(availableCategories.value).toEqual(['PLR', 'BALL']);
  });

  it('filters by OTHER', () => {
    const { activeCategory, sortedAnnotations } = setup();
    activeCategory.value = 'OTHER';
    expect(ids(sortedAnnotations.value)).toEqual(['e']);
  });
});

describe('useAnnotationFiltering individual labels', () => {
  const groupsOf = (options: { group: string; labels: { name: string }[] }[]) =>
    options.map((o) => [o.group, o.labels.map((l) => l.name)]);

  // Under ALL the checklist offers every label this video uses, grouped.
  it('offers every used label, grouped, under All', () => {
    const { labelOptions } = setup();
    expect(groupsOf(labelOptions.value)).toEqual([
      ['PLR', ['PLR DUPLICATE', 'PLR MISSED']],
      ['BALL', ['BALL MISSED']],
      ['OTHER', ['Review Needed']],
    ]);
  });

  it("offers only the active group's labels once a group is picked", () => {
    const { activeCategory, labelOptions } = setup();
    activeCategory.value = 'PLR';
    // PLR TELEPORT is in the catalog but on no annotation here.
    expect(groupsOf(labelOptions.value)).toEqual([['PLR', ['PLR DUPLICATE', 'PLR MISSED']]]);
  });

  it('shows annotations with any of the ticked labels', () => {
    const { toggleLabel, sortedAnnotations } = setup();
    toggleLabel('dup');
    expect(ids(sortedAnnotations.value)).toEqual(['b']);
    toggleLabel('ball');
    expect(ids(sortedAnnotations.value)).toEqual(['b', 'c', 'd']);
    toggleLabel('dup');
    expect(ids(sortedAnnotations.value)).toEqual(['c', 'd']);
  });

  it('refines the active group', () => {
    const { activeCategory, toggleLabel, sortedAnnotations } = setup();
    activeCategory.value = 'PLR';
    expect(ids(sortedAnnotations.value)).toEqual(['a', 'b', 'd']);
    toggleLabel('missed');
    expect(ids(sortedAnnotations.value)).toEqual(['a', 'd']);
  });

  it('clears the ticks when the group changes', async () => {
    const { activeCategory, activeLabelIds, toggleLabel } = setup();
    activeCategory.value = 'PLR';
    toggleLabel('missed');
    activeCategory.value = 'BALL';
    await nextTick();
    expect(activeLabelIds.value).toEqual([]);
  });

  it('clears the ticks on request', () => {
    const { toggleLabel, clearLabels, activeLabelIds, sortedAnnotations } = setup();
    toggleLabel('missed');
    toggleLabel('ball');
    clearLabels();
    expect(activeLabelIds.value).toEqual([]);
    expect(sortedAnnotations.value).toHaveLength(6);
  });

  // Deleting the last annotation with a label retires its tick; the filter
  // must not stay on for a label nobody can untick any more.
  it('drops a ticked label when its last annotation goes', async () => {
    const { annotations, toggleLabel, activeLabelIds, sortedAnnotations } = setup();
    toggleLabel('dup');
    toggleLabel('ball');
    annotations.value = ROWS.filter((r) => r.id !== 'b');
    await nextTick();
    expect(activeLabelIds.value).toEqual(['ball']);
    expect(ids(sortedAnnotations.value)).toEqual(['c', 'd']);
  });
});
