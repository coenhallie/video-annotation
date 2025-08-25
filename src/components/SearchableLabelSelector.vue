<template>
  <div class="searchable-label-selector">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <label class="block text-sm font-medium text-gray-700">
        Label
        <span
          v-if="required"
          class="text-red-500 ml-1"
        >*</span>
      </label>
      <button
        v-if="!readonly && canManageLabels"
        type="button"
        class="text-xs text-blue-600 hover:text-blue-800 underline"
        @click="$emit('manage-labels')"
      >
        Manage Labels
      </button>
    </div>

    <!-- Selected Label Display -->
    <div
      v-if="selectedLabels.length > 0"
      class="mb-3"
    >
      <div class="flex flex-wrap gap-1">
        <span
          v-for="label in selectedLabelObjects"
          :key="label.id"
          class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
          :style="{
            backgroundColor: label.color + '20',
            color: label.color,
            borderColor: label.color,
          }"
          style="border-width: 1px"
        >
          <div
            class="w-2 h-2 rounded-full mr-1"
            :style="{ backgroundColor: label.color }"
          />
          {{ label.name }}
          <button
            v-if="!readonly"
            type="button"
            class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-black hover:bg-opacity-10 focus:outline-none"
            @click="removeLabel(label.id)"
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

    <!-- Multi-Select Search Input -->
    <div
      v-if="!readonly"
      class="relative"
    >
      <div
        class="min-h-[2.5rem] w-full bg-white border border-gray-300 rounded-md shadow-sm px-3 py-2 cursor-text focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500"
        :class="{
          'rounded-b-none border-b-0': showDropdown,
          'pb-1': selectedLabels.length > 0,
        }"
        @click="focusInput"
      >
        <!-- Selected Labels as Tags (Alternative Display) -->
        <div
          v-if="mode === 'tags' && selectedLabels.length > 0"
          class="flex flex-wrap gap-1 mb-2"
        >
          <span
            v-for="label in selectedLabelObjects"
            :key="label.id"
            class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800"
          >
            <div
              class="w-2 h-2 rounded-full mr-1"
              :style="{ backgroundColor: label.color }"
            />
            {{ label.name }}
            <button
              type="button"
              class="ml-1 inline-flex items-center justify-center w-3 h-3 rounded-full hover:bg-blue-200 focus:outline-none"
              @click.stop="removeLabel(label.id)"
            >
              <svg
                class="w-2 h-2"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
                />
              </svg>
            </button>
          </span>
        </div>

        <!-- Search Input -->
        <div class="flex items-center">
          <div
            class="absolute left-3 flex items-center pointer-events-none"
            :class="{
              'top-3': selectedLabels.length === 0 || mode !== 'tags',
              'top-8': selectedLabels.length > 0 && mode === 'tags',
            }"
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
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            :placeholder="getPlaceholder()"
            class="block w-full pl-8 pr-8 py-0 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 placeholder-gray-500"
            :class="{ 'mt-1': selectedLabels.length > 0 && mode === 'tags' }"
            @focus="openDropdown"
            @keydown="handleKeydown"
            @input="handleInput"
          >
          <button
            type="button"
            class="absolute right-2 flex items-center justify-center w-6 h-6 hover:bg-gray-100 rounded"
            :class="{
              'top-2': selectedLabels.length === 0 || mode !== 'tags',
              'top-7': selectedLabels.length > 0 && mode === 'tags',
            }"
            @click="toggleDropdown"
          >
            <svg
              class="h-4 w-4 text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': showDropdown }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Dropdown Panel -->
      <div
        v-if="showDropdown"
        class="absolute z-10 w-full bg-white shadow-lg max-h-60 rounded-b-md border border-t-0 border-gray-300 py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"
      >
        <!-- Quick Actions -->
        <div
          v-if="searchQuery.trim() && filteredLabels.length === 0"
          class="px-3 py-2 border-b border-gray-200"
        >
          <button
            v-if="canManageLabels"
            type="button"
            class="w-full text-left text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded"
            @click="createNewLabel"
          >
            <svg
              class="w-4 h-4 inline mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            Create "{{ searchQuery.trim() }}"
          </button>
        </div>

        <!-- Default Labels Section -->
        <div v-if="filteredDefaultLabels.length > 0">
          <div class="px-3 py-2 bg-gray-50 border-b border-gray-200">
            <h4
              class="text-xs font-medium text-gray-500 uppercase tracking-wide"
            >
              Default Labels
            </h4>
          </div>
          <div
            v-for="(label, index) in filteredDefaultLabels"
            :key="label.id"
            class="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-50"
            :class="{ 'bg-blue-50': highlightedIndex === index }"
            @click="toggleLabel(label.id)"
            @mouseenter="highlightedIndex = index"
          >
            <div class="flex items-center">
              <div
                class="w-3 h-3 rounded-full mr-2 border border-gray-300"
                :style="{ backgroundColor: label.color }"
              />
              <span class="block truncate text-sm text-gray-900">{{
                label.name
              }}</span>
              <span
                v-if="label.description"
                class="block text-xs text-gray-500 ml-2"
              >{{ label.description }}</span>
            </div>
            <span
              v-if="selectedLabels.includes(label.id)"
              class="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600"
            >
              <svg
                class="h-5 w-5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
            </span>
          </div>
        </div>

        <!-- Custom Labels Section -->
        <div v-if="filteredCustomLabels.length > 0">
          <div
            class="px-3 py-2 bg-gray-50 border-b border-gray-200"
            :class="{ 'border-t': filteredDefaultLabels.length > 0 }"
          >
            <h4
              class="text-xs font-medium text-gray-500 uppercase tracking-wide"
            >
              Custom Labels
            </h4>
          </div>
          <div
            v-for="(label, index) in filteredCustomLabels"
            :key="label.id"
            class="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-50"
            :class="{
              'bg-blue-50':
                highlightedIndex === filteredDefaultLabels.length + index,
            }"
            @click="toggleLabel(label.id)"
            @mouseenter="
              highlightedIndex = filteredDefaultLabels.length + index
            "
          >
            <div class="flex items-center">
              <div
                class="w-3 h-3 rounded-full mr-2 border border-gray-300"
                :style="{ backgroundColor: label.color }"
              />
              <span class="block truncate text-sm text-gray-900">{{
                label.name
              }}</span>
              <span
                v-if="label.description"
                class="block text-xs text-gray-500 ml-2"
              >{{ label.description }}</span>
            </div>
            <span
              v-if="selectedLabels.includes(label.id)"
              class="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600"
            >
              <svg
                class="h-5 w-5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
            </span>
          </div>
        </div>

        <!-- No Labels Found -->
        <div
          v-if="filteredLabels.length === 0 && !searchQuery.trim()"
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
            No labels available.
          </p>
          <button
            v-if="canManageLabels"
            type="button"
            class="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
            @click="$emit('manage-labels')"
          >
            Create a label
          </button>
        </div>

        <!-- No Search Results -->
        <div
          v-if="filteredLabels.length === 0 && searchQuery.trim()"
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
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <p class="mt-2 text-sm text-gray-500">
            No labels match "{{ searchQuery }}".
          </p>
        </div>
      </div>
    </div>

    <!-- Readonly Display -->
    <div
      v-if="readonly && selectedLabels.length === 0"
      class="text-sm text-gray-500 italic"
    >
      No labels assigned
    </div>

    <!-- Click outside to close dropdown -->
    <div
      v-if="showDropdown"
      class="fixed inset-0 z-0"
      @click="closeDropdown"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { LabelService } from '../services/labelService';
import { useAuth } from '../composables/useAuth';
import type { Label } from '../types/labels';

const props = defineProps({
  modelValue: {
    type: Array as () => string[],
    default: () => [],
  },
  projectId: {
    type: String,
    default: null,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
  required: {
    type: Boolean,
    default: false,
  },
  canManageLabels: {
    type: Boolean,
    default: true,
  },
  maxLabels: {
    type: Number,
    default: null,
  },
  mode: {
    type: String as () => 'default' | 'tags',
    default: 'default',
  },
});

const emit = defineEmits([
  'update:modelValue',
  'manage-labels',
  'create-label',
]);

// Auth
const { user } = useAuth();

// State
const labels = ref<Label[]>([]);
const loading = ref(true);
const searchQuery = ref('');
const showDropdown = ref(false);
const searchInput = ref<HTMLInputElement>();
const highlightedIndex = ref(-1);

// Local selected labels
const selectedLabels = ref<string[]>([...props.modelValue]);

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

const selectedLabelObjects = computed(
  () =>
    selectedLabels.value
      .map((id) => labels.value.find((label) => label.id === id))
      .filter(Boolean) as Label[]
);

// Methods
const loadLabels = async () => {
  try {
    loading.value = true;
    const labelsData = await LabelService.getLabels(
      user.value?.id,
      props.projectId
    );
    labels.value = labelsData;
  } catch (error) {
    console.error('Failed to load labels:', error);
  } finally {
    loading.value = false;
  }
};

const toggleLabel = (labelId: string) => {
  const index = selectedLabels.value.indexOf(labelId);

  if (index > -1) {
    // Remove label
    selectedLabels.value.splice(index, 1);
  } else {
    // For single label selection, replace the existing label
    // Always enforce single label selection (max 1)
    selectedLabels.value = [labelId];
  }

  // Close dropdown after selection for single-label mode
  closeDropdown();
};

const removeLabel = (labelId: string) => {
  const index = selectedLabels.value.indexOf(labelId);
  if (index > -1) {
    selectedLabels.value.splice(index, 1);
  }
};

const focusInput = () => {
  searchInput.value?.focus();
};

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value;
  if (showDropdown.value) {
    nextTick(() => {
      searchInput.value?.focus();
    });
  }
};

const openDropdown = () => {
  showDropdown.value = true;
  highlightedIndex.value = -1;
};

const closeDropdown = () => {
  showDropdown.value = false;
  highlightedIndex.value = -1;
  searchQuery.value = '';
};

const handleInput = () => {
  if (!showDropdown.value) {
    openDropdown();
  }
  highlightedIndex.value = -1;
};

const handleKeydown = (event: KeyboardEvent) => {
  const visibleLabels = filteredLabels.value;

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      if (!showDropdown.value) {
        openDropdown();
      } else {
        highlightedIndex.value = Math.min(
          highlightedIndex.value + 1,
          visibleLabels.length - 1
        );
      }
      break;

    case 'ArrowUp':
      event.preventDefault();
      if (showDropdown.value) {
        highlightedIndex.value = Math.max(highlightedIndex.value - 1, -1);
      }
      break;

    case 'Enter':
      event.preventDefault();
      if (showDropdown.value && highlightedIndex.value >= 0) {
        const selectedLabel = visibleLabels[highlightedIndex.value];
        if (selectedLabel) {
          toggleLabel(selectedLabel.id);
        }
      } else if (!showDropdown.value) {
        openDropdown();
      }
      break;

    case 'Escape':
      event.preventDefault();
      closeDropdown();
      searchInput.value?.blur();
      break;

    case 'Backspace':
      if (searchQuery.value === '' && selectedLabels.value.length > 0) {
        // Remove last selected label when backspacing on empty input
        const lastLabel = selectedLabels.value[selectedLabels.value.length - 1];
        if (lastLabel) {
          removeLabel(lastLabel);
        }
      }
      break;

    case 'Tab':
      if (showDropdown.value) {
        closeDropdown();
      }
      break;
  }
};

const getPlaceholder = () => {
  if (selectedLabels.value.length > 0) {
    return 'Change label...';
  }
  return 'Search and select a label...';
};

const createNewLabel = () => {
  emit('create-label', searchQuery.value.trim());
  closeDropdown();
};

// Watchers
watch(
  selectedLabels,
  (newValue) => {
    emit('update:modelValue', newValue);
  },
  { deep: true }
);

watch(
  () => props.modelValue,
  (newValue) => {
    // Only update if the arrays are actually different
    if (
      newValue.length !== selectedLabels.value.length ||
      !newValue.every((val, index) => val === selectedLabels.value[index])
    ) {
      selectedLabels.value = [...newValue];
    }
  },
  { deep: true }
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

<style scoped>
.searchable-label-selector {
  @apply relative;
}
</style>
