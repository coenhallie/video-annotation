import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import { useLabelFiltering } from './useLabelFiltering';
import type { PanelAnnotation } from '@/types/component-interfaces';

export interface UseAnnotationFilteringOptions {
  /** Reactive list of annotations from the parent. */
  annotations: Ref<PanelAnnotation[]> | ComputedRef<PanelAnnotation[]>;
  /** Project ID used by the label filtering service. */
  projectId?: string;
}

export function useAnnotationFiltering(options: UseAnnotationFilteringOptions) {
  const { annotations, projectId } = options;

  // Default color for annotations without specific labels
  const defaultAnnotationColor = '#6b7280'; // gray-500

  // Initialize label filtering composable
  const {
    filterState,
    hasActiveFilters,
    getActiveFilterCount,
    filterAnnotations,
    updateLabelFilter,
    clearAllFilters,
  } = useLabelFiltering(projectId);

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

  // Filtered annotations based on label filters
  const filteredAnnotations = ref<PanelAnnotation[]>([]);

  // Watch for annotation or filter changes and apply filtering
  watch(
    [normalizedAnnotations, filterState],
    async () => {
      if (hasActiveFilters.value) {
        filteredAnnotations.value = await filterAnnotations(
          normalizedAnnotations.value
        );
      } else {
        filteredAnnotations.value = normalizedAnnotations.value;
      }
    },
    { immediate: true, deep: true }
  );

  // Sort by timestamp ascending
  const sortedAnnotations = computed(() => {
    return filteredAnnotations.value.slice().sort((a, b) => {
      const ta = a && typeof a.timestamp === 'number' ? a.timestamp : 0;
      const tb = b && typeof b.timestamp === 'number' ? b.timestamp : 0;
      return ta - tb;
    });
  });

  // Computed style for annotations list — scrollable after 7 annotations
  const annotationsListStyle = computed(() => {
    const annotationCardHeight = 120; // pixels
    const maxAnnotations = 7;
    const maxHeight = annotationCardHeight * maxAnnotations;

    if (sortedAnnotations.value.length > maxAnnotations) {
      return {
        maxHeight: `${maxHeight}px`,
        overflowY: 'auto' as const,
        overflowX: 'hidden' as const,
      };
    }
    return {};
  });

  return {
    // State
    filterState,
    hasActiveFilters,
    getActiveFilterCount,
    normalizedAnnotations,
    filteredAnnotations,
    sortedAnnotations,
    annotationsListStyle,

    // Methods
    filterAnnotations,
    updateLabelFilter,
    clearAllFilters,
  };
}
