<template>
  <div class="keypoint-selector">
    <!-- Header with toggle all -->
    <div class="selector-header">
      <h3 class="selector-title">
        Keypoint Selection
      </h3>
      <div class="header-controls">
        <button
          class="toggle-all-btn"
          :class="{ 'all-selected': allSelected }"
          @click="toggleAll"
        >
          {{ allSelected ? 'Deselect All' : 'Select All' }}
        </button>
        <button
          class="reset-btn"
          @click="resetToDefault"
        >
          Reset
        </button>
      </div>
    </div>

    <!-- Quick presets -->
    <div class="preset-section">
      <h4 class="preset-title">
        Quick Presets:
      </h4>
      <div class="preset-buttons">
        <button
          v-for="preset in presets"
          :key="preset.name"
          class="preset-btn"
          :title="preset.description"
          @click="applyPreset(preset)"
        >
          {{ preset.name }}
        </button>
      </div>
    </div>

    <!-- Keypoint groups -->
    <div class="keypoint-groups">
      <div
        v-for="group in keypointGroups"
        :key="group.name"
        class="keypoint-group"
      >
        <div class="group-header">
          <button
            class="group-toggle"
            :class="{ 'group-selected': isGroupSelected(group) }"
            @click="toggleGroup(group)"
          >
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">({{ getSelectedInGroup(group) }}/{{
              group.indices.length
            }})</span>
          </button>
          <button
            class="expand-toggle"
            :class="{ expanded: expandedGroups.includes(group.name) }"
            @click="toggleGroupExpansion(group.name)"
          >
            ▼
          </button>
        </div>

        <div
          class="group-keypoints"
          :class="{ 'group-expanded': expandedGroups.includes(group.name) }"
        >
          <label
            v-for="index in group.indices"
            :key="index"
            class="keypoint-item"
            :class="{ 'keypoint-selected': selectedKeypoints.includes(index) }"
          >
            <input
              type="checkbox"
              :checked="selectedKeypoints.includes(index)"
              class="keypoint-checkbox"
              @change="toggleKeypoint(index)"
            >
            <span class="keypoint-name">{{ LANDMARK_NAMES[index] }}</span>
            <span class="keypoint-index">#{{ index }}</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Selected count -->
    <div class="selection-summary">
      <span class="selected-count">
        {{ selectedKeypoints.length }} of {{ LANDMARK_NAMES.length }} keypoints
        selected
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, toRefs, defineProps, defineEmits } from 'vue';

const props = defineProps({
  selectedKeypoints: {
    type: Array,
    default: () => Array.from({ length: 33 }, (_, i) => i), // All keypoints by default
  },
});

const emit = defineEmits(['update:selectedKeypoints']);

const { selectedKeypoints } = toRefs(props);

// Landmark names (same as in usePoseLandmarker)
const LANDMARK_NAMES = [
  'nose',
  'left_eye_inner',
  'left_eye',
  'left_eye_outer',
  'right_eye_inner',
  'right_eye',
  'right_eye_outer',
  'left_ear',
  'right_ear',
  'mouth_left',
  'mouth_right',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_pinky',
  'right_pinky',
  'left_index',
  'right_index',
  'left_thumb',
  'right_thumb',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot_index',
  'right_foot_index',
];

// Keypoint groups for better organization
const keypointGroups = [
  {
    name: 'Face',
    indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  {
    name: 'Arms & Hands',
    indices: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
  },
  {
    name: 'Torso',
    indices: [23, 24],
  },
  {
    name: 'Legs & Feet',
    indices: [25, 26, 27, 28, 29, 30, 31, 32],
  },
];

// Quick presets for common use cases
const presets = [
  {
    name: 'Upper Body',
    description: 'Face, arms, and torso',
    indices: [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24,
    ],
  },
  {
    name: 'Core Pose',
    description: 'Essential pose points',
    indices: [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28],
  },
  {
    name: 'Face Only',
    description: 'Facial landmarks only',
    indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  {
    name: 'Arms Only',
    description: 'Arm and hand landmarks',
    indices: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
  },
  {
    name: 'Legs Only',
    description: 'Leg and foot landmarks',
    indices: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
  },
];

// State
const expandedGroups = ref(['Face', 'Arms & Hands', 'Torso', 'Legs & Feet']); // All expanded by default

// Computed properties
const allSelected = computed(() => {
  return selectedKeypoints.value.length === LANDMARK_NAMES.length;
});

// Methods
const toggleKeypoint = (index) => {
  const newSelection = [...selectedKeypoints.value];
  const currentIndex = newSelection.indexOf(index);

  if (currentIndex > -1) {
    newSelection.splice(currentIndex, 1);
  } else {
    newSelection.push(index);
  }

  newSelection.sort((a, b) => a - b); // Keep sorted
  emit('update:selectedKeypoints', newSelection);
};

const toggleAll = () => {
  if (allSelected.value) {
    emit('update:selectedKeypoints', []);
  } else {
    emit(
      'update:selectedKeypoints',
      Array.from({ length: LANDMARK_NAMES.length }, (_, i) => i)
    );
  }
};

const resetToDefault = () => {
  emit(
    'update:selectedKeypoints',
    Array.from({ length: LANDMARK_NAMES.length }, (_, i) => i)
  );
};

const toggleGroup = (group) => {
  const groupSelected = isGroupSelected(group);
  const newSelection = [...selectedKeypoints.value];

  if (groupSelected) {
    // Remove all group indices
    group.indices.forEach((index) => {
      const currentIndex = newSelection.indexOf(index);
      if (currentIndex > -1) {
        newSelection.splice(currentIndex, 1);
      }
    });
  } else {
    // Add all group indices
    group.indices.forEach((index) => {
      if (!newSelection.includes(index)) {
        newSelection.push(index);
      }
    });
  }

  newSelection.sort((a, b) => a - b);
  emit('update:selectedKeypoints', newSelection);
};

const toggleGroupExpansion = (groupName) => {
  const index = expandedGroups.value.indexOf(groupName);
  if (index > -1) {
    expandedGroups.value.splice(index, 1);
  } else {
    expandedGroups.value.push(groupName);
  }
};

const isGroupSelected = (group) => {
  return group.indices.every((index) =>
    selectedKeypoints.value.includes(index)
  );
};

const getSelectedInGroup = (group) => {
  return group.indices.filter((index) =>
    selectedKeypoints.value.includes(index)
  ).length;
};

const applyPreset = (preset) => {
  emit(
    'update:selectedKeypoints',
    [...preset.indices].sort((a, b) => a - b)
  );
};
</script>

<style scoped>
.keypoint-selector {
  background: #1f2937;
  border-radius: 8px;
  padding: 16px;
  color: #f9fafb;
  max-height: 600px;
  overflow-y: auto;
  font-size: 14px;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #374151;
}

.selector-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #f9fafb;
}

.header-controls {
  display: flex;
  gap: 8px;
}

.toggle-all-btn,
.reset-btn {
  padding: 6px 12px;
  border: 1px solid #4b5563;
  border-radius: 4px;
  background: #374151;
  color: #f9fafb;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-all-btn:hover,
.reset-btn:hover {
  background: #4b5563;
}

.toggle-all-btn.all-selected {
  background: #dc2626;
  border-color: #dc2626;
}

.preset-section {
  margin-bottom: 16px;
}

.preset-title {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 500;
  color: #d1d5db;
}

.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preset-btn {
  padding: 4px 8px;
  border: 1px solid #4b5563;
  border-radius: 4px;
  background: #374151;
  color: #f9fafb;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-btn:hover {
  background: #4b5563;
  border-color: #6b7280;
}

.keypoint-groups {
  margin-bottom: 16px;
}

.keypoint-group {
  margin-bottom: 12px;
  border: 1px solid #374151;
  border-radius: 6px;
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  background: #374151;
  padding: 8px 12px;
}

.group-toggle {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: none;
  border: none;
  color: #f9fafb;
  cursor: pointer;
  text-align: left;
  padding: 0;
}

.group-toggle:hover {
  color: #d1d5db;
}

.group-toggle.group-selected .group-name {
  color: #10b981;
  font-weight: 600;
}

.group-name {
  font-weight: 500;
}

.group-count {
  font-size: 12px;
  color: #9ca3af;
}

.expand-toggle {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 4px;
  margin-left: 8px;
  transition: transform 0.2s;
}

.expand-toggle.expanded {
  transform: rotate(180deg);
}

.group-keypoints {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
  background: #1f2937;
}

.group-keypoints.group-expanded {
  max-height: 400px;
  padding: 8px;
}

.keypoint-item {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  margin: 2px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.keypoint-item:hover {
  background: #374151;
}

.keypoint-item.keypoint-selected {
  background: #065f46;
}

.keypoint-checkbox {
  margin-right: 8px;
  accent-color: #10b981;
}

.keypoint-name {
  flex: 1;
  font-size: 12px;
}

.keypoint-index {
  font-size: 11px;
  color: #9ca3af;
  font-family: monospace;
}

.selection-summary {
  padding-top: 12px;
  border-top: 1px solid #374151;
  text-align: center;
}

.selected-count {
  font-size: 12px;
  color: #d1d5db;
  font-weight: 500;
}

/* Scrollbar styling */
.keypoint-selector::-webkit-scrollbar {
  width: 6px;
}

.keypoint-selector::-webkit-scrollbar-track {
  background: #1f2937;
}

.keypoint-selector::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 3px;
}

.keypoint-selector::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}
</style>
