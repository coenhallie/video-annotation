<template>
  <div
    class="calibration-controls bg-white border border-gray-200 p-4 rounded-lg"
  >
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-medium text-gray-900">Speed Calibration</h3>
      <div class="flex items-center space-x-2">
        <span class="text-sm text-gray-500">Accuracy:</span>
        <span
          :class="accuracyColorClass"
          class="px-2 py-1 rounded text-xs font-medium"
        >
          {{ calibrationSettings.calibrationAccuracy }}%
        </span>
      </div>
    </div>

    <!-- Player Height Calibration -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <label class="text-sm font-medium text-gray-700">Player Height</label>
        <div class="flex items-center space-x-2">
          <input
            type="checkbox"
            v-model="calibrationSettings.useHeightCalibration"
            @change="onHeightCalibrationToggle"
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span class="text-xs text-gray-500">Enable</span>
        </div>
      </div>

      <div class="flex items-center space-x-3">
        <div class="flex-1">
          <input
            type="range"
            v-model="playerHeightInput"
            @input="onPlayerHeightChange"
            :disabled="!calibrationSettings.useHeightCalibration"
            min="140"
            max="220"
            step="1"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider disabled:bg-gray-100"
          />
        </div>
        <div class="flex items-center space-x-2">
          <input
            type="number"
            v-model="playerHeightInput"
            @input="onPlayerHeightChange"
            :disabled="!calibrationSettings.useHeightCalibration"
            min="140"
            max="220"
            class="w-16 px-2 py-1 text-sm bg-white border border-gray-300 rounded focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
          />
          <span class="text-sm text-gray-500">cm</span>
        </div>
      </div>
      <div class="text-xs text-gray-500 mt-1">
        Range: 140-220 cm (Default: 170 cm average)
      </div>
    </div>

    <!-- Court Calibration -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <label class="text-sm font-medium text-gray-700"
          >Court Calibration</label
        >
        <div class="flex items-center space-x-2">
          <input
            type="checkbox"
            v-model="calibrationSettings.useCourtCalibration"
            @change="onCourtCalibrationToggle"
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span class="text-xs text-gray-500">Enable</span>
        </div>
      </div>

      <div class="space-y-3">
        <!-- Court Length Input -->
        <div>
          <label class="text-xs text-gray-500 mb-1 block"
            >Court Length (meters)</label
          >
          <input
            type="number"
            v-model="courtLength"
            @input="onCourtDimensionsChange"
            :disabled="!calibrationSettings.useCourtCalibration"
            min="5"
            max="30"
            step="0.1"
            placeholder="13.4"
            class="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        <!-- Court Width Input -->
        <div>
          <label class="text-xs text-gray-500 mb-1 block"
            >Court Width (meters)</label
          >
          <input
            type="number"
            v-model="courtWidth"
            @input="onCourtDimensionsChange"
            :disabled="!calibrationSettings.useCourtCalibration"
            min="3"
            max="20"
            step="0.1"
            placeholder="6.1"
            class="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        <!-- Preset Buttons -->
        <div class="flex space-x-2">
          <button
            @click="setCourtPreset('badminton')"
            :disabled="!calibrationSettings.useCourtCalibration"
            class="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-500 text-white rounded transition-colors"
          >
            Badminton
          </button>
          <button
            @click="setCourtPreset('tennis')"
            :disabled="!calibrationSettings.useCourtCalibration"
            class="flex-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-500 text-white rounded transition-colors"
          >
            Tennis
          </button>
        </div>

        <div
          v-if="
            calibrationSettings.useCourtCalibration && courtLength && courtWidth
          "
          class="text-xs text-green-600"
        >
          ✓ Court dimensions: {{ courtLength }}m × {{ courtWidth }}m
        </div>

        <div class="text-xs text-gray-500">
          Default: Badminton (13.4m × 6.1m), Tennis (23.8m × 8.2m)
        </div>
      </div>
    </div>

    <!-- Calibration Status -->
    <div class="border-t border-gray-200 pt-4">
      <div class="flex items-center justify-between text-sm">
        <span class="text-gray-600">Calibration Status:</span>
        <span
          :class="
            calibrationSettings.isCalibrated
              ? 'text-green-600'
              : 'text-amber-600'
          "
        >
          {{ calibrationSettings.isCalibrated ? 'Active' : 'Not Calibrated' }}
        </span>
      </div>

      <div
        v-if="calibrationSettings.isCalibrated"
        class="mt-2 text-xs text-gray-500"
      >
        <div>
          Scaling Factor:
          {{ calibrationSettings.scalingFactor?.toFixed(3) || 'N/A' }}
        </div>
        <div v-if="calibrationSettings.useHeightCalibration">
          Height-based scaling:
          {{ (calibrationSettings.playerHeight / 170).toFixed(3) }}x
        </div>
        <div
          v-if="
            calibrationSettings.useCourtCalibration &&
            calibrationSettings.pixelsToMetersRatio
          "
        >
          Court-based ratio:
          {{ calibrationSettings.pixelsToMetersRatio.toFixed(6) }} m/px
        </div>
      </div>

      <button
        @click="resetAllCalibration"
        class="w-full mt-3 px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
      >
        Reset All Calibration
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

// Props
const props = defineProps({
  calibrationSettings: {
    type: Object,
    required: true,
  },
  onSetPlayerHeight: {
    type: Function,
    required: true,
  },
  onSetCourtDimensions: {
    type: Function,
    required: true,
  },
  onSetCourtReferencePoints: {
    type: Function,
    required: true,
  },
  onResetCalibration: {
    type: Function,
    required: true,
  },
  videoDimensions: {
    type: Object,
    default: () => ({ width: 1920, height: 1080 }),
  },
});

// Emits
const emit = defineEmits(['start-court-calibration']);

// Local state
const playerHeightInput = ref(props.calibrationSettings.playerHeight);
const courtLength = ref(13.4); // Default badminton court length
const courtWidth = ref(6.1); // Default badminton court width
const isCalibrating = ref(false);

// Computed
const accuracyColorClass = computed(() => {
  const accuracy = props.calibrationSettings.calibrationAccuracy;
  if (accuracy >= 70) return 'bg-green-600 text-white';
  if (accuracy >= 40) return 'bg-yellow-600 text-white';
  return 'bg-red-600 text-white';
});

// Watch for external changes to calibration settings
watch(
  () => props.calibrationSettings.playerHeight,
  (newHeight) => {
    playerHeightInput.value = newHeight;
  }
);

// Methods
const onPlayerHeightChange = () => {
  const height = parseInt(playerHeightInput.value);
  if (height >= 140 && height <= 220) {
    props.onSetPlayerHeight(height);
  }
};

const onHeightCalibrationToggle = () => {
  if (props.calibrationSettings.useHeightCalibration) {
    onPlayerHeightChange();
  }
};

const onCourtCalibrationToggle = () => {
  if (!props.calibrationSettings.useCourtCalibration) {
    // Reset court calibration when disabled
    props.calibrationSettings.courtReferencePoints = [];
    props.calibrationSettings.pixelsToMetersRatio = null;
  } else {
    // Apply current dimensions when enabled
    onCourtDimensionsChange();
  }
};

const onCourtDimensionsChange = () => {
  if (
    props.calibrationSettings.useCourtCalibration &&
    courtLength.value &&
    courtWidth.value
  ) {
    const dimensions = {
      width: parseFloat(courtWidth.value),
      height: parseFloat(courtLength.value),
    };

    // Call the parent's court dimension handler
    if (props.onSetCourtDimensions) {
      props.onSetCourtDimensions(dimensions);
    }
  }
};

const setCourtPreset = (sport) => {
  if (sport === 'badminton') {
    courtLength.value = 13.4;
    courtWidth.value = 6.1;
  } else if (sport === 'tennis') {
    courtLength.value = 23.8;
    courtWidth.value = 8.2;
  }
  onCourtDimensionsChange();
};

const resetAllCalibration = () => {
  props.onResetCalibration();
  playerHeightInput.value = 170;
  courtLength.value = 13.4;
  courtWidth.value = 6.1;
  isCalibrating.value = false;
};

// Expose methods for parent component
defineExpose({
  stopCalibration: () => {
    isCalibrating.value = false;
  },
});
</script>

<style scoped>
/* Custom slider styling for light mode */
.slider::-webkit-slider-thumb {
  appearance: none;
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: 2px solid #1e40af;
}

.slider::-moz-range-thumb {
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: 2px solid #1e40af;
}

.slider:disabled::-webkit-slider-thumb {
  background: #d1d5db;
  border-color: #9ca3af;
  cursor: not-allowed;
}

.slider:disabled::-moz-range-thumb {
  background: #d1d5db;
  border-color: #9ca3af;
  cursor: not-allowed;
}

.slider::-webkit-slider-track {
  background: #e5e7eb;
  border-radius: 4px;
}

.slider:disabled::-webkit-slider-track {
  background: #f3f4f6;
}
</style>
