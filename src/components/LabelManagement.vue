<template>
  <div class="label-management w-full">
    <!-- Loading State -->
    <div
      v-if="loading"
      class="flex items-center justify-center py-12"
    >
      <div class="text-center">
        <div
          class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"
        />
        <p class="mt-2 text-sm text-gray-600">
          Loading labels...
        </p>
      </div>
    </div>

    <!-- Content -->
    <div v-else>
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-semibold text-gray-900">
            Label Management
          </h2>
          <p class="text-sm text-gray-600 mt-1">
            Create and manage custom labels for your annotations
          </p>
        </div>
        <button
          class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          @click="showCreateForm = true"
        >
          <svg
            class="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Label
        </button>
      </div>

      <!-- Statistics -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white p-4 rounded-lg border border-gray-200">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div
                class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"
              >
                <svg
                  class="w-4 h-4 text-blue-600"
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
              </div>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-500">
                Total Labels
              </p>
              <p class="text-2xl font-semibold text-gray-900">
                {{ labels.length }}
              </p>
            </div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-lg border border-gray-200">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div
                class="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center"
              >
                <svg
                  class="w-4 h-4 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-500">
                Custom Labels
              </p>
              <p class="text-2xl font-semibold text-gray-900">
                {{ customLabels.length }}
              </p>
            </div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-lg border border-gray-200">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div
                class="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center"
              >
                <svg
                  class="w-4 h-4 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-500">
                Most Used
              </p>
              <p class="text-lg font-semibold text-gray-900">
                {{ mostUsedLabel?.name || 'None' }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Search and Filter -->
      <div class="mb-6">
        <div class="flex flex-col sm:flex-row gap-4">
          <div class="flex-1">
            <label
              for="search"
              class="sr-only"
            >Search labels</label>
            <div class="relative">
              <div
                class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
              >
                <svg
                  class="h-5 w-5 text-gray-400"
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
                id="search"
                v-model="searchQuery"
                type="text"
                placeholder="Search labels..."
                class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
            </div>
          </div>
          <div class="flex gap-2">
            <select
              v-model="filterType"
              class="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
            >
              <option value="all">
                All Labels
              </option>
              <option value="default">
                Default Labels
              </option>
              <option value="custom">
                Custom Labels
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Labels List -->
      <div class="bg-white shadow overflow-hidden sm:rounded-md">
        <ul class="divide-y divide-gray-200">
          <li
            v-for="label in filteredLabels"
            :key="label.id"
            class="px-6 py-4"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <div
                  class="w-4 h-4 rounded-full mr-3 border border-gray-300"
                  :style="{ backgroundColor: label.color }"
                />
                <div class="flex-1">
                  <div class="flex items-center">
                    <p class="text-sm font-medium text-gray-900">
                      {{ label.name }}
                    </p>
                    <span
                      v-if="label.isDefault"
                      class="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      Default
                    </span>
                  </div>
                  <p
                    v-if="label.description"
                    class="text-sm text-gray-500 mt-1"
                  >
                    {{ label.description }}
                  </p>
                  <div class="flex items-center mt-2 text-xs text-gray-400">
                    <span>Created {{ formatDate(label.createdAt) }}</span>
                    <span
                      v-if="labelStats[label.id]"
                      class="ml-4"
                    >
                      Used {{ labelStats[label.id]?.usageCount || 0 }} times
                    </span>
                  </div>
                </div>
              </div>
              <div class="flex items-center space-x-2">
                <button
                  v-if="!label.isDefault"
                  class="text-blue-600 hover:text-blue-900 text-sm font-medium"
                  @click="editLabel(label)"
                >
                  Edit
                </button>
                <button
                  v-if="!label.isDefault"
                  class="text-red-600 hover:text-red-900 text-sm font-medium"
                  @click="confirmDeleteLabel(label)"
                >
                  Delete
                </button>
                <button
                  :class="[
                    'text-sm font-medium',
                    label.isActive
                      ? 'text-gray-600 hover:text-gray-900'
                      : 'text-green-600 hover:text-green-900',
                  ]"
                  @click="toggleLabelActive(label)"
                >
                  {{ label.isActive ? 'Deactivate' : 'Activate' }}
                </button>
              </div>
            </div>
          </li>
        </ul>

        <div
          v-if="filteredLabels.length === 0"
          class="px-6 py-12 text-center"
        >
          <svg
            class="mx-auto h-12 w-12 text-gray-400"
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
          <h3 class="mt-2 text-sm font-medium text-gray-900">
            No labels found
          </h3>
          <p class="mt-1 text-sm text-gray-500">
            {{
              searchQuery
                ? 'Try adjusting your search terms.'
                : 'Get started by creating a new label.'
            }}
          </p>
        </div>
      </div>

      <!-- Create/Edit Label Modal -->
      <div
        v-if="showCreateForm || editingLabel"
        class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
        @click="closeForm"
      >
        <div
          class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white"
          @click.stop
        >
          <div class="mt-3">
            <h3 class="text-lg font-medium text-gray-900 mb-4">
              {{ editingLabel ? 'Edit Label' : 'Create New Label' }}
            </h3>

            <form
              class="space-y-4"
              @submit.prevent="saveLabel"
            >
              <div>
                <label
                  for="labelName"
                  class="block text-sm font-medium text-gray-700"
                >
                  Name *
                </label>
                <input
                  id="labelName"
                  v-model="labelForm.name"
                  type="text"
                  required
                  maxlength="50"
                  class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter label name"
                >
              </div>

              <div>
                <label
                  for="labelDescription"
                  class="block text-sm font-medium text-gray-700"
                >
                  Description
                </label>
                <textarea
                  id="labelDescription"
                  v-model="labelForm.description"
                  rows="3"
                  maxlength="200"
                  class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Color *
                </label>
                <div class="grid grid-cols-6 gap-2">
                  <button
                    v-for="color in LABEL_COLORS"
                    :key="color"
                    type="button"
                    :class="[
                      'w-8 h-8 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
                      labelForm.color === color
                        ? 'border-gray-900'
                        : 'border-gray-300',
                    ]"
                    :style="{ backgroundColor: color }"
                    @click="labelForm.color = color"
                  />
                </div>
              </div>

              <div class="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  @click="closeForm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  :disabled="!labelForm.name.trim() || saving"
                  class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{
                    saving ? 'Saving...' : editingLabel ? 'Update' : 'Create'
                  }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div
        v-if="labelToDelete"
        class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
        @click="labelToDelete = null"
      >
        <div
          class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white"
          @click.stop
        >
          <div class="mt-3 text-center">
            <div
              class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100"
            >
              <svg
                class="h-6 w-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mt-2">
              Delete Label
            </h3>
            <div class="mt-2 px-7 py-3">
              <p class="text-sm text-gray-500">
                Are you sure you want to delete "{{ labelToDelete.name }}"?
                {{
                  (labelStats[labelToDelete.id]?.usageCount || 0) > 0
                    ? 'This label is currently used in annotations and will be deactivated instead of deleted.'
                    : 'This action cannot be undone.'
                }}
              </p>
            </div>
            <div class="flex justify-center space-x-3 px-4 py-3">
              <button
                class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                @click="labelToDelete = null"
              >
                Cancel
              </button>
              <button
                :disabled="deleting"
                class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                @click="deleteLabel"
              >
                {{ deleting ? 'Deleting...' : 'Delete' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { LabelService } from '../services/labelService';
import { useAuth } from '../composables/useAuth';
import type { Label, LabelStats } from '../types/labels';
import { LABEL_COLORS, DEFAULT_LABELS } from '../types/labels';

const props = defineProps({
  projectId: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(['label-created', 'label-updated', 'label-deleted']);

// Auth
const { user, isAuthenticated } = useAuth();

// State
const labels = ref<Label[]>([]);
const labelStats = ref<Record<string, LabelStats>>({});
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const error = ref<string | null>(null);

// Form state
const showCreateForm = ref(false);
const editingLabel = ref<Label | null>(null);
const labelToDelete = ref<Label | null>(null);

// Search and filter
const searchQuery = ref('');
const filterType = ref('all');

// Form data
const labelForm = ref({
  name: '',
  description: '',
  color: LABEL_COLORS[0],
});

// Computed
const customLabels = computed(() => {
  if (!labels.value || !Array.isArray(labels.value)) return [];
  return labels.value.filter((label) => !label.isDefault);
});

const mostUsedLabel = computed(() => {
  if (!labelStats.value || typeof labelStats.value !== 'object') return null;
  const stats = Object.values(labelStats.value);
  return stats.length > 0
    ? stats.reduce((max, current) =>
        (current?.usageCount || 0) > (max?.usageCount || 0) ? current : max
      )?.label
    : null;
});

const filteredLabels = computed(() => {
  let filtered = labels.value;

  // Filter by type
  if (filterType.value === 'default') {
    filtered = filtered.filter((label) => label.isDefault);
  } else if (filterType.value === 'custom') {
    filtered = filtered.filter((label) => !label.isDefault);
  }

  // Filter by search query
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

// Methods
const loadLabels = async () => {
  try {
    loading.value = true;
    error.value = null;
    console.log('Loading labels...');
    console.log('User ID:', user.value?.id);
    console.log('Project ID:', props.projectId);

    // Skip loading if no user is authenticated
    if (!user.value?.id) {
      console.warn('No authenticated user, showing demo labels');
      // Show demo/default labels for display purposes
      labels.value = DEFAULT_LABELS.map((label, index) => ({
        ...label,
        id: `demo-${index}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      return;
    }

    // Initialize default labels first if needed
    try {
      await LabelService.initializeDefaultLabels();
    } catch (initError) {
      console.warn('Could not initialize default labels:', initError);
    }

    const [labelsData, statsData] = await Promise.all([
      LabelService.getLabels(user.value?.id, props.projectId || undefined),
      LabelService.getLabelStats(user.value?.id, props.projectId || undefined),
    ]);

    console.log('Labels loaded:', labelsData);
    console.log('Stats loaded:', statsData);

    labels.value = labelsData || [];

    // Convert stats array to object for easier lookup
    labelStats.value = {};
    if (statsData && Array.isArray(statsData)) {
      statsData.forEach((stat) => {
        if (stat && stat.labelId) {
          labelStats.value[stat.labelId] = stat;
        }
      });
    }
  } catch (err: any) {
    console.error('Failed to load labels:', err);
    error.value = err?.message || 'Failed to load labels';
    // Show default labels as fallback
    labels.value = DEFAULT_LABELS.map((label, index) => ({
      ...label,
      id: `fallback-${index}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    labelStats.value = {};
  } finally {
    loading.value = false;
  }
};

const editLabel = (label: Label) => {
  editingLabel.value = label;
  labelForm.value = {
    name: label.name,
    description: label.description || '',
    color: label.color,
  };
};

const closeForm = () => {
  showCreateForm.value = false;
  editingLabel.value = null;
  labelForm.value = {
    name: '',
    description: '',
    color: LABEL_COLORS[0],
  };
};

const saveLabel = async () => {
  try {
    saving.value = true;

    if (editingLabel.value) {
      // Update existing label
      const updated = await LabelService.updateLabel(editingLabel.value.id, {
        name: labelForm.value.name.trim(),
        description: labelForm.value.description.trim() || undefined,
        color: labelForm.value.color,
      });

      const index = labels.value.findIndex((l) => l.id === updated.id);
      if (index !== -1) {
        labels.value[index] = updated;
      }

      emit('label-updated', updated);
    } else {
      // Create new label
      const created = await LabelService.createLabel({
        name: labelForm.value.name.trim(),
        description: labelForm.value.description.trim() || undefined,
        color: labelForm.value.color,
        userId: user.value?.id,
        projectId: props.projectId || undefined,
      });

      labels.value.push(created);
      emit('label-created', created);
    }

    closeForm();
    await loadLabels(); // Refresh to get updated stats
  } catch (error) {
    console.error('Failed to save label:', error);
  } finally {
    saving.value = false;
  }
};

const confirmDeleteLabel = (label: Label) => {
  labelToDelete.value = label;
};

const deleteLabel = async () => {
  if (!labelToDelete.value) return;

  try {
    deleting.value = true;
    const labelId = labelToDelete.value.id;
    await LabelService.deleteLabel(labelId);

    // Remove from local state or mark as inactive
    const index = labels.value.findIndex((l) => l.id === labelId);
    if (index !== -1) {
      const stats = labelStats.value[labelId];
      if (stats && stats.usageCount > 0) {
        // Mark as inactive if in use
        const label = labels.value[index];
        if (label) {
          label.isActive = false;
        }
      } else {
        // Remove completely if not in use
        labels.value.splice(index, 1);
      }
    }

    emit('label-deleted', labelToDelete.value);
    labelToDelete.value = null;
  } catch (error) {
    console.error('Failed to delete label:', error);
  } finally {
    deleting.value = false;
  }
};

const toggleLabelActive = async (label: Label) => {
  try {
    const updated = await LabelService.updateLabel(label.id, {
      isActive: !label.isActive,
    });

    const index = labels.value.findIndex((l) => l.id === updated.id);
    if (index !== -1) {
      labels.value[index] = updated;
    }
  } catch (error) {
    console.error('Failed to toggle label active state:', error);
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString();
};

// Lifecycle
onMounted(async () => {
  console.log('LabelManagement mounted');
  console.log('User:', user.value);
  console.log('Is Authenticated:', isAuthenticated.value);
  console.log('ProjectId:', props.projectId);

  // Load labels immediately
  await loadLabels();
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
.label-management {
  width: 100%;
  min-height: 500px;
  max-height: 70vh;
  overflow-y: auto;
}
</style>
