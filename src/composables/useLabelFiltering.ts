import { ref, computed, watch } from 'vue';
import { LabelService } from '../services/labelService';
import type { FilterState, LabelFilter } from '../types/labels';
import type { PanelAnnotation } from '../components/AnnotationPanel.vue';

const STORAGE_KEY = 'video-annotation-label-filters';

export function useLabelFiltering(projectId?: string) {
  // Filter state
  const filterState = ref<FilterState>({
    labelFilter: {
      selectedLabels: [],
      logic: 'OR',
    },
    severityFilter: [],
    searchQuery: '',
  });

  // Loading state
  const isFiltering = ref(false);

  // Restore filter state from localStorage
  const restoreFilterState = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to ensure all properties exist
        filterState.value = {
          labelFilter: {
            selectedLabels: parsed.labelFilter?.selectedLabels || [],
            logic: parsed.labelFilter?.logic || 'OR',
          },
          severityFilter: parsed.severityFilter || [],
          searchQuery: parsed.searchQuery || '',
        };
      }
    } catch (error) {
      console.warn('Failed to restore filter state:', error);
    }
  };

  // Save filter state to localStorage
  const saveFilterState = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filterState.value));
    } catch (error) {
      console.warn('Failed to save filter state:', error);
    }
  };

  // Watch for filter changes and save to localStorage
  watch(filterState, saveFilterState, { deep: true });

  // Check if any filters are active
  const hasActiveFilters = computed(() => {
    const { labelFilter, severityFilter, searchQuery } = filterState.value;
    return (
      labelFilter.selectedLabels.length > 0 ||
      severityFilter.length > 0 ||
      searchQuery.trim().length > 0
    );
  });

  // Get filtered annotation IDs based on label filter
  const getFilteredAnnotationIds = async (): Promise<string[]> => {
    const { labelFilter } = filterState.value;

    if (labelFilter.selectedLabels.length === 0) {
      return []; // Return empty array if no labels selected
    }

    try {
      isFiltering.value = true;
      return await LabelService.getAnnotationsByLabels(
        labelFilter.selectedLabels,
        labelFilter.logic,
        undefined, // videoId - will be handled by caller
        projectId
      );
    } catch (error) {
      console.error('Failed to get filtered annotation IDs:', error);
      return [];
    } finally {
      isFiltering.value = false;
    }
  };

  // Filter annotations based on all active filters
  const filterAnnotations = async (
    annotations: PanelAnnotation[]
  ): Promise<PanelAnnotation[]> => {
    if (!hasActiveFilters.value) {
      return annotations;
    }

    let filtered = [...annotations];
    const { labelFilter, severityFilter, searchQuery } = filterState.value;

    // Apply label filter
    if (labelFilter.selectedLabels.length > 0) {
      try {
        isFiltering.value = true;

        // Get annotations that match label criteria
        const labelFilteredIds = await LabelService.getAnnotationsByLabels(
          labelFilter.selectedLabels,
          labelFilter.logic,
          undefined,
          projectId
        );

        filtered = filtered.filter((annotation) => {
          // Include only annotations that match labels
          return labelFilteredIds.includes(annotation.id);
        });
      } catch (error) {
        console.error('Failed to apply label filter:', error);
      } finally {
        isFiltering.value = false;
      }
    }

    // Apply severity filter
    if (severityFilter.length > 0) {
      filtered = filtered.filter((annotation) =>
        severityFilter.includes(annotation.severity || 'medium')
      );
    }

    // Apply search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (annotation) =>
          (annotation.content &&
            annotation.content.toLowerCase().includes(query)) ||
          (annotation.title && annotation.title.toLowerCase().includes(query))
      );
    }

    return filtered;
  };

  // Update label filter
  const updateLabelFilter = (newFilter: Partial<LabelFilter>) => {
    filterState.value.labelFilter = {
      ...filterState.value.labelFilter,
      ...newFilter,
    };
  };

  // Update severity filter
  const updateSeverityFilter = (severities: string[]) => {
    filterState.value.severityFilter = severities;
  };

  // Update search query
  const updateSearchQuery = (query: string) => {
    filterState.value.searchQuery = query;
  };

  // Clear all filters
  const clearAllFilters = () => {
    filterState.value = {
      labelFilter: {
        selectedLabels: [],
        logic: 'OR',
      },
      severityFilter: [],
      searchQuery: '',
    };
  };

  // Clear label filter only
  const clearLabelFilter = () => {
    filterState.value.labelFilter = {
      selectedLabels: [],
      logic: 'OR',
    };
  };

  // Get filter summary for display
  const getFilterSummary = (): string => {
    const parts: string[] = [];
    const { labelFilter, severityFilter, searchQuery } = filterState.value;

    if (labelFilter.selectedLabels.length > 0) {
      parts.push(
        `${labelFilter.selectedLabels.length} label(s) with ${labelFilter.logic} logic`
      );
    }

    if (severityFilter.length > 0) {
      parts.push(`${severityFilter.length} severity level(s)`);
    }

    if (searchQuery.trim()) {
      parts.push(`search: "${searchQuery}"`);
    }

    return parts.length > 0 ? parts.join(', ') : 'No filters active';
  };

  // Get count of active filters
  const getActiveFilterCount = computed(() => {
    let count = 0;
    const { labelFilter, severityFilter, searchQuery } = filterState.value;

    if (labelFilter.selectedLabels.length > 0) count++;
    if (severityFilter.length > 0) count++;
    if (searchQuery.trim()) count++;

    return count;
  });

  // Initialize filter state from localStorage
  restoreFilterState();

  return {
    // State
    filterState,
    isFiltering,
    hasActiveFilters,
    getActiveFilterCount,

    // Methods
    filterAnnotations,
    getFilteredAnnotationIds,
    updateLabelFilter,
    updateSeverityFilter,
    updateSearchQuery,
    clearAllFilters,
    clearLabelFilter,
    getFilterSummary,
    restoreFilterState,
    saveFilterState,
  };
}
