import {
  computed,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import {
  CATEGORY_ORDER,
  categoryKeyForLabel,
  type LabelCategoryKey,
} from '@/utils/labelCategories';
import type { LabelColorMap, PanelAnnotation } from '@/types/component-interfaces';
import type { Label } from '@/types/labels';
import { annotationListTime } from '@/utils/annotationTime';

/**
 * A filter group: one of the six label categories, or OTHER for labels whose
 * name carries no category prefix (Review Needed, High Priority, ...). Without
 * OTHER those labels could never be filtered on.
 */
export type AnnotationFilterGroup = LabelCategoryKey | 'OTHER';

const groupOf = (label: Label): AnnotationFilterGroup => categoryKeyForLabel(label) ?? 'OTHER';

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
  /** A comparison orders its rows by video A's position, as the rows show it. */
  isDualMode?: MaybeRefOrGetter<boolean>;
  /** Frame rate behind that position when only a frame was stored. */
  fps?: MaybeRefOrGetter<number>;
}

export function useAnnotationFiltering(options: UseAnnotationFilteringOptions) {
  const { annotations, labelsById, isDualMode = false, fps = 30 } = options;

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
      if (typeof a?.videoATimestamp === 'number') result.videoATimestamp = a.videoATimestamp;
      if (typeof a?.videoBTimestamp === 'number') result.videoBTimestamp = a.videoBTimestamp;
      if (typeof a?.commentCount === 'number') result.commentCount = a.commentCount;
      return result;
    });
  });

  /**
   * The catalog labels attached to an annotation. Labels the viewer cannot
   * read are absent from the catalog, and so from every group.
   */
  const labelsOf = (annotation: PanelAnnotation): Label[] =>
    (annotation.labels ?? [])
      .map((labelId) => labelsById.value[labelId])
      .filter((label): label is Label => !!label);

  /** Every group an annotation belongs to, via the labels attached to it. */
  const categoriesOf = (annotation: PanelAnnotation): AnnotationFilterGroup[] => {
    const keys: AnnotationFilterGroup[] = [];
    for (const label of labelsOf(annotation)) {
      const key = groupOf(label);
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  };

  /** Every catalog label used by at least one annotation in this video. */
  const usedLabels = computed((): Label[] => {
    const byId = new Map<string, Label>();
    for (const annotation of normalizedAnnotations.value) {
      for (const label of labelsOf(annotation)) byId.set(label.id, label);
    }
    return [...byId.values()];
  });

  /**
   * Groups actually represented in this video, in the catalog's own order with
   * OTHER last. Offering the full list would put pills on screen that can only
   * ever empty the list.
   */
  const availableCategories = computed((): AnnotationFilterGroup[] => {
    const present = new Set(usedLabels.value.map(groupOf));
    const groups: AnnotationFilterGroup[] = CATEGORY_ORDER.filter((key) => present.has(key));
    if (present.has('OTHER')) groups.push('OTHER');
    return groups;
  });

  /** null means "All": no group filter. */
  const activeCategory = ref<AnnotationFilterGroup | null>(null);

  /** Narrows the active group to one label. null means the whole group. */
  const activeLabelId = ref<string | null>(null);

  /** The labels of the active group that this video uses, by name. */
  const labelsInActiveCategory = computed((): Label[] => {
    const group = activeCategory.value;
    if (!group) return [];
    return usedLabels.value
      .filter((label) => groupOf(label) === group)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  // A label belongs to one group, so changing group always drops it.
  watch(activeCategory, () => {
    activeLabelId.value = null;
  });

  // Deleting the last annotation in a group, or with a label, retires its pill.
  // Without this the filter would stay on and leave an empty list with no way
  // back.
  watch(availableCategories, (categories) => {
    if (activeCategory.value && !categories.includes(activeCategory.value)) {
      activeCategory.value = null;
    }
  });
  watch(labelsInActiveCategory, (labels) => {
    if (activeLabelId.value && !labels.some((label) => label.id === activeLabelId.value)) {
      activeLabelId.value = null;
    }
  });

  /** Filtered by the active label, else the active group, then ordered by time. */
  const sortedAnnotations = computed((): PanelAnnotation[] => {
    const key = activeCategory.value;
    const labelId = activeLabelId.value;
    const list = labelId
      ? normalizedAnnotations.value.filter((a) => (a.labels ?? []).includes(labelId))
      : key
        ? normalizedAnnotations.value.filter((a) => categoriesOf(a).includes(key))
        : normalizedAnnotations.value;
    const context = { isDualMode: toValue(isDualMode), fps: toValue(fps) };
    return list
      .slice()
      .sort(
        (a, b) => annotationListTime(a, context) - annotationListTime(b, context)
      );
  });

  return {
    normalizedAnnotations,
    sortedAnnotations,
    availableCategories,
    activeCategory,
    labelsInActiveCategory,
    activeLabelId,
  };
}
