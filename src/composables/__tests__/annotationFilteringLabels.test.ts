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
  it('lists the labels in the active group that this video uses, by name', () => {
    const { activeCategory, labelsInActiveCategory } = setup();
    expect(labelsInActiveCategory.value).toEqual([]);
    activeCategory.value = 'PLR';
    // PLR TELEPORT is in the catalog but on no annotation here.
    expect(labelsInActiveCategory.value.map((l) => l.name)).toEqual([
      'PLR DUPLICATE',
      'PLR MISSED',
    ]);
  });

  it('narrows the list to one label', () => {
    const { activeCategory, activeLabelId, sortedAnnotations } = setup();
    activeCategory.value = 'PLR';
    expect(ids(sortedAnnotations.value)).toEqual(['a', 'b', 'd']);
    activeLabelId.value = 'missed';
    expect(ids(sortedAnnotations.value)).toEqual(['a', 'd']);
  });

  it('drops the label when the group changes', async () => {
    const { activeCategory, activeLabelId, sortedAnnotations } = setup();
    activeCategory.value = 'PLR';
    activeLabelId.value = 'missed';
    activeCategory.value = 'BALL';
    await nextTick();
    expect(activeLabelId.value).toBeNull();
    expect(ids(sortedAnnotations.value)).toEqual(['c', 'd']);
  });

  // Deleting the last annotation with a label retires its pill; the filter
  // must not stay on with nothing to show and no pill to turn it off.
  it('drops the label when its last annotation goes', async () => {
    const { annotations, activeCategory, activeLabelId, sortedAnnotations } = setup();
    activeCategory.value = 'PLR';
    activeLabelId.value = 'dup';
    annotations.value = ROWS.filter((r) => r.id !== 'b');
    await nextTick();
    expect(activeLabelId.value).toBeNull();
    expect(ids(sortedAnnotations.value)).toEqual(['a', 'd']);
  });

  it('clears both when going back to All', async () => {
    const { activeCategory, activeLabelId, sortedAnnotations } = setup();
    activeCategory.value = 'PLR';
    activeLabelId.value = 'missed';
    activeCategory.value = null;
    await nextTick();
    expect(activeLabelId.value).toBeNull();
    expect(ids(sortedAnnotations.value)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});
