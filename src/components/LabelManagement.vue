<template>
  <div class="label-management w-full bg-white dark:bg-gray-900">
    <!-- Header. The three icon-and-number stat cards said less than one mono
         line: two of the three counts are derivable from the list itself.
         It sticks, and it renders while loading too, so a host's close control
         can sit in the row's flow rather than float over the scrolling list. -->
    <div
      class="sticky top-0 z-20 flex items-baseline gap-2.5 border-b border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-white/10 dark:bg-gray-900"
    >
      <h2 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
        Labels
      </h2>
      <template v-if="!loading">
        <span class="font-mono text-[11px] tracking-wider text-gray-500 dark:text-gray-500">
          {{ labels.length }}
        </span>
        <span
          class="font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
        >
          {{ customLabels.length }} CUSTOM
        </span>
        <span
          v-if="mostUsedLabel"
          class="truncate font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
        >
          · MOST USED {{ mostUsedLabel.name }}
        </span>
      </template>
      <!-- Actions travel together so a host's close control can never land on
           top of the create action. -->
      <div class="ml-auto flex shrink-0 items-center gap-2.5 self-center">
        <button
          v-if="!loading"
          type="button"
          class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
          @click="showCreateForm = true"
        >
          + New label
        </button>
        <slot name="header-actions" />
      </div>
    </div>

    <!-- Loading State -->
    <p
      v-if="loading"
      class="px-4 py-12 text-center text-[12px] text-gray-600 dark:text-gray-400"
    >
      Loading labels…
    </p>

    <!-- Content -->
    <div v-else>
      <!-- Search and Filter -->
      <div class="mb-4 flex flex-wrap items-center gap-2 px-4 pt-4">
        <label
          for="search"
          class="sr-only"
        >Search labels</label>
        <input
          id="search"
          v-model="searchQuery"
          type="text"
          placeholder="Search labels…"
          class="min-w-[10rem] flex-1 rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
        >
        <!-- Scope pills instead of a select: three options that all fit. -->
        <div class="flex shrink-0 items-center gap-1">
          <button
            v-for="option in FILTER_OPTIONS"
            :key="option.value"
            type="button"
            class="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
            :class="
              filterType === option.value
                ? 'bg-gray-900 text-white dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
            "
            @click="filterType = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <!-- Labels List -->
      <div class="px-4 pb-4">
        <ul>
          <li
            v-for="label in filteredLabels"
            :key="label.id"
            class="group flex items-start gap-3 rounded px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
          >
            <span
              class="mt-[7px] h-2 w-2 shrink-0 rounded-full"
              :style="{ backgroundColor: label.color }"
            />

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <p
                  class="truncate text-[13px] font-medium uppercase tracking-[0.06em]"
                  :class="
                    label.isActive
                      ? 'text-gray-700 dark:text-gray-200'
                      : 'text-gray-400 line-through dark:text-gray-600'
                  "
                >
                  {{ label.name }}
                </p>
                <LabelInfoTooltip
                  v-if="label.description"
                  :description="label.description"
                />
              </div>
              <div
                class="mt-1 flex items-center gap-2 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
              >
                <span v-if="label.isDefault">DEFAULT</span>
                <span>{{ formatDate(label.createdAt) }}</span>
                <span v-if="labelStats[label.id]">
                  {{ labelStats[label.id]?.usageCount || 0 }}×
                </span>
              </div>
            </div>

            <!-- Row actions reveal on hover, as they do on an annotation row. -->
            <div
              class="flex shrink-0 items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <button
                type="button"
                class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
                @click="toggleLabelActive(label)"
              >
                {{ label.isActive ? 'Deactivate' : 'Activate' }}
              </button>
              <button
                v-if="!label.isDefault"
                type="button"
                class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
                @click="editLabel(label)"
              >
                Edit
              </button>
              <button
                v-if="!label.isDefault"
                type="button"
                class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
                @click="confirmDeleteLabel(label)"
              >
                Delete
              </button>
            </div>
          </li>
        </ul>

        <div
          v-if="filteredLabels.length === 0"
          class="px-4 py-10 text-center"
        >
          <p class="text-[12px] text-gray-600 dark:text-gray-400">
            No labels found
          </p>
          <p class="mt-1.5 text-[11px] text-gray-500 dark:text-gray-500">
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
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        @click="closeForm"
      >
        <div
          class="w-full max-w-sm rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
          @click.stop
        >
          <div class="border-b border-gray-200 px-4 py-3 dark:border-white/10">
            <h3 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
              {{ editingLabel ? 'Edit label' : 'New label' }}
            </h3>
          </div>

          <form @submit.prevent="saveLabel">
            <div class="space-y-4 px-4 py-4">
              <div>
                <label
                  for="labelName"
                  class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
                >
                  Name *
                </label>
                <input
                  id="labelName"
                  v-model="labelForm.name"
                  type="text"
                  required
                  maxlength="50"
                  class="block w-full rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
                  placeholder="Label name"
                >
              </div>

              <div>
                <label
                  for="labelDescription"
                  class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
                >
                  Description
                </label>
                <textarea
                  id="labelDescription"
                  v-model="labelForm.description"
                  rows="3"
                  maxlength="200"
                  class="block w-full resize-y rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label
                  class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
                >
                  Colour
                </label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="color in LABEL_COLORS"
                    :key="color"
                    type="button"
                    class="h-5 w-5 rounded-full transition-transform"
                    :class="
                      labelForm.color === color
                        ? 'ring-2 ring-gray-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-gray-900'
                        : 'hover:scale-110'
                    "
                    :style="{ backgroundColor: color }"
                    @click="labelForm.color = color"
                  />
                </div>
              </div>
            </div>

            <div
              class="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3 dark:border-white/10"
            >
              <button
                type="button"
                class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
                @click="closeForm"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="!labelForm.name.trim() || saving"
                class="rounded bg-gray-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                {{ saving ? 'Saving…' : editingLabel ? 'Update' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div
        v-if="labelToDelete"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        @click="labelToDelete = null"
      >
        <div
          class="w-full max-w-sm rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
          @click.stop
        >
          <div class="border-b border-gray-200 px-4 py-3 dark:border-white/10">
            <h3 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
              Delete label
            </h3>
          </div>

          <div class="px-4 py-4">
            <p class="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400">
              Are you sure you want to delete "{{ labelToDelete.name }}"?
              {{
                (labelStats[labelToDelete.id]?.usageCount || 0) > 0
                  ? 'This label is currently used in annotations and will be deactivated instead of deleted.'
                  : 'This action cannot be undone.'
              }}
            </p>
          </div>

          <div
            class="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3 dark:border-white/10"
          >
            <button
              type="button"
              class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
              @click="labelToDelete = null"
            >
              Cancel
            </button>
            <button
              type="button"
              :disabled="deleting"
              class="rounded bg-red-600 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              @click="deleteLabel"
            >
              {{ deleting ? 'Deleting…' : 'Delete' }}
            </button>
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
import LabelInfoTooltip from './LabelInfoTooltip.vue';
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

/** The three scopes the list can be narrowed to, as pills rather than a select. */
const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'default', label: 'Default' },
  { value: 'custom', label: 'Custom' },
] as const;

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
        description: labelForm.value.description.trim() || '',
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
        description: labelForm.value.description.trim() || '',
        color: labelForm.value.color,
        // Omitted when signed out: `userId?` on labels means "no owner", which
        // is an absent key, not a key holding undefined.
        ...(user.value?.id ? { userId: user.value.id } : {}),
        ...(props.projectId ? { projectId: props.projectId } : {}),
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
/* The host owns the scrollport: a second one here would nest inside it and let
   the sticky header drift away from the panel's top edge. */
.label-management {
  width: 100%;
  min-height: 500px;
}
</style>
