import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import {
  CATEGORY_ORDER,
  categoryKeyForLabel,
  type LabelCategoryKey,
} from '@/utils/labelCategories';
import type { LabelColorMap, PanelAnnotation } from '@/types/component-interfaces';

export interface UseAnnotationFilteringOptions {
  /** Reactive list of annotations from the parent. */
  annotations: Ref<PanelAnnotation[]> | ComputedRef<PanelAnnotation[]>;
  /**
   * The label catalog, keyed by id. Annotations store label ids, and a label's
   * category lives in its name, so categorising a row needs the catalog. Labels
   * the viewer cannot read are simply absent, and their annotations then carry
   * no category - they stay visible under "All" and never under a pill.
   */
  labelsById: Ref<LabelColorMap> | ComputedRef<LabelColorMap>;
}

export function useAnnotationFiltering(options: UseAnnotationFilteringOptions) {
  const { annotations, labelsById } = options;

  // Default color for annotations without specific labels
  const defaultAnnotationColor = '#6b7280'; // gray-500

  // Normalize raw annotations into a consistent shape
  const normalizedAnnotations = computed((): PanelAnnotation[] => {
    const anns = annotations.value ?? [];
    const list = Array.isArray(anns) ? anns : [];
    return list.map((it: PanelAnnotation): PanelAnnotation => {
      const a = it || ({} as PanelAnnotation);
      const result: PanelAnnotation = {
        id: a?.id ?? '',
        title: a?.title ?? '',
        content: a?.content ?? '',
        color: a?.color ?? defaultAnnotationColor,
        timestamp: typeof a?.timestamp === 'number' ? a.timestamp : 0,
        annotationType: a?.annotationType ?? 'text',
        drawingData: a?.drawingData ?? null,
        labels: a?.labels ?? [],
      };
      if (typeof a?.frame === 'number') result.frame = a.frame;
      if (typeof a?.startFrame === 'number') result.startFrame = a.startFrame;
      if (typeof a?.endFrame === 'number') result.endFrame = a.endFrame;
      if (typeof a?.duration === 'number') result.duration = a.duration;
      if (typeof a?.durationFrames === 'number') result.durationFrames = a.durationFrames;
      if (typeof a?.videoAFrame === 'number') result.videoAFrame = a.videoAFrame;
      if (typeof a?.videoBFrame === 'number') result.videoBFrame = a.videoBFrame;
      if (typeof a?.commentCount === 'number') result.commentCount = a.commentCount;
      return result;
    });
  });

  /** Every category an annotation belongs to, via the labels attached to it. */
  const categoriesOf = (annotation: PanelAnnotation): LabelCategoryKey[] => {
    const keys: LabelCategoryKey[] = [];
    for (const labelId of annotation.labels ?? []) {
      const label = labelsById.value[labelId];
      if (!label) continue;
      const key = categoryKeyForLabel(label);
      if (key && !keys.includes(key)) keys.push(key);
    }
    return keys;
  };

  /**
   * Categories actually represented in this video, in the catalog's own order.
   * Offering the full list would put pills on screen that can only ever empty
   * the list.
   */
  const availableCategories = computed((): LabelCategoryKey[] => {
    const present = new Set<LabelCategoryKey>();
    for (const annotation of normalizedAnnotations.value) {
      for (const key of categoriesOf(annotation)) present.add(key);
    }
    return CATEGORY_ORDER.filter((key) => present.has(key));
  });

  /** null means "All": no category filter. */
  const activeCategory = ref<LabelCategoryKey | null>(null);

  // Deleting the last annotation in a category retires its pill. Without this
  // the filter would stay on and leave an empty list with no way back.
  watch(availableCategories, (categories) => {
    if (activeCategory.value && !categories.includes(activeCategory.value)) {
      activeCategory.value = null;
    }
  });

  /** Filtered by the active category, then ordered by time. */
  const sortedAnnotations = computed((): PanelAnnotation[] => {
    const key = activeCategory.value;
    const list = key
      ? normalizedAnnotations.value.filter((a) => categoriesOf(a).includes(key))
      : normalizedAnnotations.value;
    return list.slice().sort((a, b) => {
      const ta = a && typeof a.timestamp === 'number' ? a.timestamp : 0;
      const tb = b && typeof b.timestamp === 'number' ? b.timestamp : 0;
      return ta - tb;
    });
  });

  return {
    normalizedAnnotations,
    sortedAnnotations,
    availableCategories,
    activeCategory,
  };
}
