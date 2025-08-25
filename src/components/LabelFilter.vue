<template>
  <div>
    <!-- Filter Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center space-x-2">
        <svg
          class="w-5 h-5 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z"
          />
        </svg>
        <h3 class="text-sm font-medium text-gray-900">
          Filter by Labels
        </h3>
        <span
          v-if="selectedLabels.length > 0"
          class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
        >
          {{ selectedLabels.length }} selected
        </span>
      </div>

      <!-- Clear All -->
      <button
        v-if="selectedLabels.length > 0"
        class="text-xs text-gray-500 hover:text-gray-700 underline"
        @click="clearAllFilters"
      >
        Clear all
      </button>
    </div>

    <!-- Search Labels -->
    <div class="mb-3">
      <div class="relative">
        <div
          class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
        >
          <svg
            class="h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search labels..."
          class="block w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        >
      </div>
    </div>

    <!-- Label List -->
    <div class="max-h-64 overflow-y-auto border border-gray-200 rounded-md">
      <!-- Default Labels Section -->
      <div v-if="filteredDefaultLabels.length > 0">
        <div class="px-3 py-2 bg-gray-50 border-b border-gray-200">
          <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Default Labels
          </h4>
        </div>
        <div class="divide-y divide-gray-200">
          <label
            v-for="label in filteredDefaultLabels"
            :key="label.id"
            class="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
          >
            <input
              v-model="selectedLabels"
              :value="label.id"
              type="checkbox"
              class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            >
            <div class="ml-3 flex items-center flex-1">
              <div
                class="w-3 h-3 rounded-full mr-2 border border-gray-300"
                :style="{ backgroundColor: label.color }"
              />
              <span class="text-sm text-gray-900">{{ label.name }}</span>
              <span
                v-if="labelStats[label.id]"
                class="ml-auto text-xs text-gray-500"
              >
                {{ labelStats[label.id]?.usageCount || 0 }}
              </span>
            </div>
          </label>
        </div>
      </div>

      <!-- Custom Labels Section -->
      <div v-if="filteredCustomLabels.length > 0">
        <div
          class="px-3 py-2 bg-gray-50 border-b border-gray-200"
          :class="{ 'border-t': filteredDefaultLabels.length > 0 }"
        >
          <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Custom Labels
          </h4>
        </div>
        <div class="divide-y divide-gray-200">
          <label
            v-for="label in filteredCustomLabels"
            :key="label.id"
            class="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
          >
            <input
              v-model="selectedLabels"
              :value="label.id"
              type="checkbox"
              class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            >
            <div class="ml-3 flex items-center flex-1">
              <div
                class="w-3 h-3 rounded-full mr-2 border border-gray-300"
                :style="{ backgroundColor: label.color }"
              />
              <span class="text-sm text-gray-900">{{ label.name }}</span>
              <span
                v-if="labelStats[label.id]"
                class="ml-auto text-xs text-gray-500"
              >
                {{ labelStats[label.id]?.usageCount || 0 }}
              </span>
            </div>
          </label>
        </div>
      </div>

      <!-- No Labels Found -->
      <div
        v-if="filteredLabels.length === 0"
        class="px-3 py-8 text-center"
      >
        <svg
          class="mx-auto h-8 w-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
        <p class="mt-2 text-sm text-gray-500">
          {{
            searchQuery
              ? 'No labels match your search.'
              : 'No labels available.'
          }}
        </p>
      </div>
    </div>

    <!-- Selected Labels Display -->
    <div
      v-if="selectedLabels.length > 0"
      class="mt-4"
    >
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Selected Labels
        </h4>
      </div>
      <div class="flex flex-wrap gap-1">
        <span
          v-for="labelId in selectedLabels"
          :key="labelId"
          class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
        >
          <div
            class="w-2 h-2 rounded-full mr-1 border border-blue-300"
            :style="{ backgroundColor: getLabelById(labelId)?.color }"
          />
          {{ getLabelById(labelId)?.name }}
          <button
            class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-600 focus:outline-none"
            @click="removeLabel(labelId)"
          >
            <svg
              class="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { LabelService } from '../services/labelService';
import { useAuth } from '../composables/useAuth';
import type { Label, LabelStats, FilterLogic } from '../types/labels';

const props = defineProps({
  projectId: {
    type: String,
    default: null,
  },
  modelValue: {
    type: Object,
    default: () => ({
      selectedLabels: [],
      logic: 'OR',
    }),
  },
});

const emit = defineEmits(['update:modelValue', 'filter-changed']);

// Auth
const { user } = useAuth();

// State
const labels = ref<Label[]>([]);
const labelStats = ref<Record<string, LabelStats>>({});
const loading = ref(true);
const searchQuery = ref('');

// Filter state
const selectedLabels = ref<string[]>(props.modelValue.selectedLabels || []);

// Computed
const filteredLabels = computed(() => {
  let filtered = labels.value.filter((label) => label.isActive);

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(
      (label) =>
        label.name.toLowerCase().includes(query) ||
        (label.description && label.description.toLowerCase().includes(query))
    );
  }

  return filtered;
});

const filteredDefaultLabels = computed(() =>
  filteredLabels.value.filter((label) => label.isDefault)
);

const filteredCustomLabels = computed(() =>
  filteredLabels.value.filter((label) => !label.isDefault)
);

const hasActiveFilters = computed(() => selectedLabels.value.length > 0);

// Methods
const loadLabels = async () => {
  try {
    loading.value = true;
    const [labelsData, statsData] = await Promise.all([
      LabelService.getLabels(user.value?.id, props.projectId),
      LabelService.getLabelStats(user.value?.id, props.projectId),
    ]);

    labels.value = labelsData;

    // Convert stats array to object for easier lookup
    labelStats.value = {};
    statsData.forEach((stat) => {
      labelStats.value[stat.labelId] = stat;
    });
  } catch (error) {
    console.error('Failed to load labels:', error);
  } finally {
    loading.value = false;
  }
};

const getLabelById = (labelId: string): Label | undefined => {
  return labels.value.find((label) => label.id === labelId);
};

const removeLabel = (labelId: string) => {
  selectedLabels.value = selectedLabels.value.filter((id) => id !== labelId);
};

const clearAllFilters = () => {
  selectedLabels.value = [];
};

// Watchers
watch(
  selectedLabels,
  () => {
    const filterState = {
      selectedLabels: selectedLabels.value,
      logic: 'OR' as FilterLogic, // Always use OR logic for simplicity
    };

    emit('update:modelValue', filterState);
    emit('filter-changed', filterState);
  },
  { deep: true }
);

// Initialize from props
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue) {
      selectedLabels.value = newValue.selectedLabels || [];
      // filterLogic is always OR, no need to update from props
    }
  },
  { immediate: true }
);

// Lifecycle
onMounted(() => {
  loadLabels();
});

// Watch for project changes
watch(
  () => props.projectId,
  () => {
    loadLabels();
  }
);
</script>
