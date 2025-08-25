<template>
  <div class="space-y-6">
    <!-- Header with toggle all -->
    <div
      class="flex items-center justify-between pb-4 border-b border-gray-200"
    >
      <h3 class="text-lg font-semibold text-gray-800">
        Keypoint Selection
      </h3>
      <div class="flex items-center space-x-2">
        <button
          class="px-3 py-1 text-sm font-medium rounded-md transition-colors"
          :class="
            allSelected
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          "
          @click="toggleAll"
        >
          {{ allSelected ? 'Deselect All' : 'Select All' }}
        </button>
        <button
          class="px-3 py-1 text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md transition-colors"
          @click="resetToDefault"
        >
          Reset
        </button>
      </div>
    </div>

    <!-- Quick presets -->
    <div>
      <h4 class="text-md font-medium text-gray-700 mb-2">
        Quick Presets
      </h4>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in presets"
          :key="preset.name"
          class="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 rounded-full transition-colors"
          :title="preset.description"
          @click="applyPreset(preset)"
        >
          {{ preset.name }}
        </button>
      </div>
    </div>

    <!-- Keypoint groups -->
    <div class="space-y-3">
      <div
        v-for="group in keypointGroups"
        :key="group.name"
        class="border border-gray-200 rounded-lg overflow-hidden"
      >
        <div
          class="flex items-center bg-gray-50 px-4 py-2 cursor-pointer"
          @click="toggleGroupExpansion(group.name)"
        >
          <button
            class="flex-1 flex items-center justify-between text-left focus:outline-none"
            @click.stop="toggleGroup(group)"
          >
            <span
              class="font-medium text-gray-800"
              :class="{
                'text-blue-600': isGroupSelected(group),
              }"
            >{{ group.name }}</span>
            <span class="text-sm text-gray-500">{{ getSelectedInGroup(group) }}/{{ group.indices.length }}</span>
          </button>
          <button
            class="ml-3 text-gray-500 hover:text-gray-700 transition-transform transform"
            :class="{ 'rotate-180': expandedGroups.includes(group.name) }"
          >
            <svg
              class="w-5 h-5"
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

        <div
          v-show="expandedGroups.includes(group.name)"
          class="p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 bg-white"
        >
          <label
            v-for="index in group.indices"
            :key="index"
            class="flex items-center space-x-2 p-1.5 rounded-md cursor-pointer transition-colors"
            :class="
              selectedKeypoints.includes(index)
                ? 'bg-blue-50'
                : 'hover:bg-gray-100'
            "
          >
            <input
              type="checkbox"
              :checked="selectedKeypoints.includes(index)"
              class="h-4 w-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
              @change="toggleKeypoint(index)"
            >
            <span class="text-sm text-gray-700">{{
              LANDMARK_NAMES[index]
            }}</span>
            <span class="text-xs text-gray-400 font-mono">#{{ index }}</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Selected count -->
    <div
      class="pt-4 border-t border-gray-200 text-center text-sm text-gray-600 font-medium"
    >
      <span>
        {{ selectedKeypoints.length }} of {{ LANDMARK_NAMES.length }} keypoints
        selected
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, toRefs } from 'vue';

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
