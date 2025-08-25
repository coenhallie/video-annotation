<template>
  <div
    class="calibration-controls bg-white border border-gray-200 p-4 rounded-lg"
  >
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-medium text-gray-900">
        Speed Calibration
      </h3>
      <div class="flex items-center space-x-2" />
    </div>

    <!-- Player Height Calibration -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <label class="text-sm font-medium text-gray-700">Player Height</label>
      </div>

      <div class="flex items-center space-x-3">
        <div class="flex-1">
          <input
            v-model="playerHeightInput"
            type="range"
            min="140"
            max="220"
            step="1"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            @input="onPlayerHeightChange"
          >
        </div>
        <div class="flex items-center space-x-2">
          <input
            v-model="playerHeightInput"
            type="number"
            min="140"
            max="220"
            class="w-16 px-2 py-1 text-sm bg-white border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
            @input="onPlayerHeightChange"
          >
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
        <label class="text-sm font-medium text-gray-700">Court Calibration</label>
      </div>

      <!-- Dynamic Court Visualization -->
      <div class="mb-4">
        <CourtVisualization
          :calibration-mode="calibrationMode"
          :court-type="courtType"
          :court-dimensions="currentCourtDimensions"
          :show-calibration-points="showCalibrationPoints"
          :collected-points="collectedCalibrationPoints"
          :show-camera-position="false"
          :width="400"
          :height="300"
        />
      </div>

      <div class="space-y-3">
        <!-- Court Length Input -->
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Court Length (meters)</label>
          <input
            v-model="courtLength"
            type="number"
            min="5"
            max="30"
            step="0.1"
            placeholder="13.4"
            class="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
            @input="onCourtDimensionsChange"
          >
        </div>

        <!-- Court Width Input -->
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Court Width (meters)</label>
          <input
            v-model="courtWidth"
            type="number"
            min="3"
            max="20"
            step="0.1"
            placeholder="6.1"
            class="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
            @input="onCourtDimensionsChange"
          >
        </div>

        <!-- Preset Buttons -->
        <div class="flex space-x-2">
          <button
            class="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            @click="setCourtPreset('badminton')"
          >
            Badminton
          </button>
          <button
            class="flex-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            @click="setCourtPreset('tennis')"
          >
            Tennis
          </button>
        </div>

        <div class="text-xs text-gray-500">
          Default: Badminton (13.4m × 6.1m), Tennis (23.8m × 8.2m)
        </div>
      </div>
    </div>

    <!-- Calibration Status -->
    <div class="border-t border-gray-200 pt-4">
      <div
        v-if="calibrationSettings.isCalibrated"
        class="mt-2 text-xs text-gray-500"
      />
    </div>

    <!-- Show Calculation Button - Always Visible -->
    <div class="border-gray-200">
      <button
        class="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors font-medium"
        @click="showCalculationModal = true"
      >
        Show Speed Calculation Details
      </button>
    </div>

    <!-- Speed Calculation Formulas Modal -->
    <SpeedCalculationFormulasModal
      :show="showCalculationModal"
      @close="showCalculationModal = false"
    >
      <template #current-values>
        <!-- Valid Speed Data -->
        <div
          v-if="
            speedMetrics && speedMetrics.value && speedMetrics.value.isValid
          "
          class="bg-blue-50 p-4 rounded-lg"
        >
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p><strong>Center of Mass:</strong></p>
              <p class="font-mono">
                x:
                {{ speedMetrics.value.centerOfMass.x?.toFixed(4) || 'N/A' }}
              </p>
              <p class="font-mono">
                y:
                {{ speedMetrics.value.centerOfMass.y?.toFixed(4) || 'N/A' }}
              </p>
              <p class="font-mono">
                z:
                {{ speedMetrics.value.centerOfMass.z?.toFixed(4) || 'N/A' }}
              </p>
            </div>
            <div>
              <p><strong>Velocity (m/s):</strong></p>
              <p class="font-mono">
                x: {{ speedMetrics.value.velocity.x?.toFixed(4) || 'N/A' }}
              </p>
              <p class="font-mono">
                y: {{ speedMetrics.value.velocity.y?.toFixed(4) || 'N/A' }}
              </p>
              <p class="font-mono">
                z: {{ speedMetrics.value.velocity.z?.toFixed(4) || 'N/A' }}
              </p>
            </div>
            <div>
              <p><strong>Speeds (m/s):</strong></p>
              <p class="font-mono">
                Overall: {{ speedMetrics.value.speed?.toFixed(4) || 'N/A' }}
              </p>
              <p class="font-mono">
                Horizontal:
                {{ speedMetrics.value.generalMovingSpeed?.toFixed(4) || 'N/A' }}
              </p>
              <p class="font-mono">
                Right Foot:
                {{ speedMetrics.value.rightFootSpeed?.toFixed(4) || 'N/A' }}
              </p>
            </div>
            <div>
              <p><strong>Calibration:</strong></p>
              <p class="font-mono">
                Scaling Factor:
                {{ speedMetrics.value.scalingFactor?.toFixed(4) || 'N/A' }}
              </p>
              <p class="font-mono">
                Player Height:
                {{
                  calibrationSettings.value?.playerHeight ||
                    calibrationSettings.playerHeight
                }}cm
              </p>
              <p class="font-mono">
                Accuracy:
                {{
                  calibrationSettings.value?.calibrationAccuracy ||
                    calibrationSettings.calibrationAccuracy
                }}%
              </p>
            </div>
          </div>
        </div>

        <!-- No Speed Data Available -->
        <div
          v-else
          class="bg-gray-50 p-4 rounded-lg"
        >
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p><strong>Center of Mass:</strong></p>
              <p class="font-mono text-gray-500">
                x: No data
              </p>
              <p class="font-mono text-gray-500">
                y: No data
              </p>
              <p class="font-mono text-gray-500">
                z: No data
              </p>
            </div>
            <div>
              <p><strong>Velocity (m/s):</strong></p>
              <p class="font-mono text-gray-500">
                x: No data
              </p>
              <p class="font-mono text-gray-500">
                y: No data
              </p>
              <p class="font-mono text-gray-500">
                z: No data
              </p>
            </div>
            <div>
              <p><strong>Speeds (m/s):</strong></p>
              <p class="font-mono text-gray-500">
                Overall: No data
              </p>
              <p class="font-mono text-gray-500">
                Horizontal: No data
              </p>
              <p class="font-mono text-gray-500">
                Right Foot: No data
              </p>
            </div>
            <div>
              <p><strong>Calibration:</strong></p>
              <p class="font-mono text-gray-500">
                Scaling Factor: {{ calibrationSettings.scalingFactor || 1.0 }}
              </p>
              <p class="font-mono text-gray-500">
                Player Height:
                {{
                  calibrationSettings.value?.playerHeight ||
                    calibrationSettings.playerHeight
                }}cm
              </p>
              <p class="font-mono text-gray-500">
                Accuracy:
                {{
                  calibrationSettings.value?.calibrationAccuracy ||
                    calibrationSettings.calibrationAccuracy
                }}%
              </p>
            </div>
          </div>
          <div
            class="mt-3 p-3 bg-yellow-100 rounded border-l-4 border-yellow-400"
          >
            <p class="text-sm text-yellow-700">
              <strong>Status:</strong>
              {{
                speedMetrics && speedMetrics.value
                  ? 'Speed data invalid or not ready'
                  : 'No speed data available - start video playback to see live calculations'
              }}
            </p>
          </div>
        </div>

        <!-- Notes -->
        <div class="bg-yellow-50 p-4 rounded-lg mt-4">
          <h4 class="font-semibold text-yellow-800 mb-2">
            Important Notes:
          </h4>
          <ul class="text-sm text-yellow-700 space-y-1">
            <li>
              • All calculations use MediaPipe Pose landmarks in 3D world
              coordinates
            </li>
            <li>• Speed values are clamped to maximum 50 m/s for safety</li>
            <li>
              • Temporal smoothing is applied using a 10-frame history window
            </li>
            <li>• Landmark visibility threshold is 0.5 (50% confidence)</li>
            <li>
              • Time delta calculations use video.currentTime for accuracy
            </li>
          </ul>
        </div>
      </template>
    </SpeedCalculationFormulasModal>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import SpeedCalculationFormulasModal from './SpeedCalculationFormulasModal.vue';

// Props
const props = defineProps({
  calibrationSettings: {
    type: Object,
    required: true,
  },
  speedMetrics: {
    type: Object,
    default: () => ({
      centerOfMass: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      generalMovingSpeed: 0,
      rightFootSpeed: 0,
      scalingFactor: 1,
      isValid: false,
    }),
  },
  onSetPlayerHeight: {
    type: Function,
    required: true,
  },
  onSetCourtDimensions: {
    type: Function,
    required: true,
  },
  onResetCalibration: {
    type: Function,
    required: true,
  },
});

// Emits

// Local state
const playerHeightInput = ref(
  props.calibrationSettings.value?.playerHeight ||
    props.calibrationSettings.playerHeight
);
const courtLength = ref(13.4); // Default badminton court length
const courtWidth = ref(6.1); // Default badminton court width
const showCalculationModal = ref(false);

// Computed
const accuracyColorClass = computed(() => {
  const accuracy =
    props.calibrationSettings.value?.calibrationAccuracy ||
    props.calibrationSettings.calibrationAccuracy;
  if (accuracy >= 70) return 'bg-green-600 text-white';
  if (accuracy >= 40) return 'bg-yellow-600 text-white';
  return 'bg-red-600 text-white';
});

// Watch for external changes to calibration settings
watch(
  () =>
    props.calibrationSettings.value?.playerHeight ||
    props.calibrationSettings.playerHeight,
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
  if (
    props.calibrationSettings.value?.useHeightCalibration ||
    props.calibrationSettings.useHeightCalibration
  ) {
    onPlayerHeightChange();
  }
};

const onCourtCalibrationToggle = () => {
  if (
    !(
      props.calibrationSettings.value?.useCourtCalibration ||
      props.calibrationSettings.useCourtCalibration
    )
  ) {
    // Reset court calibration when disabled by applying default badminton dimensions
    courtLength.value = 13.4;
    courtWidth.value = 6.1;
    onCourtDimensionsChange();
  } else {
    // Apply current dimensions when enabled
    onCourtDimensionsChange();
  }
};

const onCourtDimensionsChange = () => {
  if (
    (props.calibrationSettings.value?.useCourtCalibration ||
      props.calibrationSettings.useCourtCalibration) &&
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
};
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
