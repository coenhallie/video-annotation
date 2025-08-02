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

    <!-- Show Calculation Button - Always Visible -->
    <div class="mt-4 pt-4 border-t border-gray-200">
      <button
        @click="showCalculationModal = true"
        class="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors font-medium"
      >
        📊 Show Speed Calculation Details
      </button>
    </div>

    <!-- Speed Calculation Modal -->
    <div
      v-if="showCalculationModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showCalculationModal = false"
    >
      <div
        class="bg-white rounded-lg p-6 max-w-4xl max-h-[90vh] overflow-y-auto"
        @click.stop
      >
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-gray-900">
            Speed Calculation Formulas
          </h2>
          <button
            @click="showCalculationModal = false"
            class="text-gray-400 hover:text-gray-600"
          >
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        </div>

        <div class="space-y-6">
          <!-- Center of Mass Calculation -->
          <div class="border-b border-gray-200 pb-4">
            <h3 class="text-lg font-semibold text-gray-800 mb-3">
              1. Center of Mass (CoM) Calculation
            </h3>
            <div class="bg-gray-50 p-4 rounded-lg mb-3">
              <p class="text-sm text-gray-700 mb-2">
                <strong>Formula:</strong>
              </p>
              <div class="font-mono text-sm bg-white p-2 rounded border">
                CoM = Σ(segment_weight × segment_position) / Σ(segment_weight)
              </div>
            </div>
            <div class="text-sm text-gray-600">
              <p>
                <strong>Body Segment Weights (% of total body mass):</strong>
              </p>
              <ul class="list-disc list-inside mt-2 space-y-1">
                <li>Head: 8.26%</li>
                <li>Torso: 48.33%</li>
                <li>Upper Arms: 2.71% each</li>
                <li>Forearms: 1.62% each</li>
                <li>Hands: 0.61% each</li>
                <li>Thighs: 10.5% each</li>
                <li>Shanks: 4.75% each</li>
                <li>Feet: 1.43% each</li>
              </ul>
            </div>
          </div>

          <!-- Velocity Calculation -->
          <div class="border-b border-gray-200 pb-4">
            <h3 class="text-lg font-semibold text-gray-800 mb-3">
              2. Velocity Calculation
            </h3>
            <div class="bg-gray-50 p-4 rounded-lg mb-3">
              <p class="text-sm text-gray-700 mb-2">
                <strong>Formula:</strong>
              </p>
              <div class="font-mono text-sm bg-white p-2 rounded border">
                velocity = (current_position - previous_position) / time_delta
              </div>
              <div class="font-mono text-sm bg-white p-2 rounded border mt-2">
                velocity = {x: (x₁ - x₀)/Δt, y: (y₁ - y₀)/Δt, z: (z₁ - z₀)/Δt}
              </div>
            </div>
            <div class="text-sm text-gray-600">
              <p>Where:</p>
              <ul class="list-disc list-inside mt-1">
                <li>current_position: CoM at current frame</li>
                <li>previous_position: CoM at previous frame</li>
                <li>time_delta: Time difference between frames (seconds)</li>
              </ul>
            </div>
          </div>

          <!-- Speed Calculation -->
          <div class="border-b border-gray-200 pb-4">
            <h3 class="text-lg font-semibold text-gray-800 mb-3">
              3. Speed Calculation
            </h3>
            <div class="bg-gray-50 p-4 rounded-lg mb-3">
              <p class="text-sm text-gray-700 mb-2">
                <strong>Overall Speed Formula:</strong>
              </p>
              <div class="font-mono text-sm bg-white p-2 rounded border">
                speed = √(velocity.x² + velocity.y² + velocity.z²)
              </div>
              <p class="text-sm text-gray-700 mb-2 mt-3">
                <strong>Horizontal Speed Formula:</strong>
              </p>
              <div class="font-mono text-sm bg-white p-2 rounded border">
                horizontal_speed = √(velocity.x² + velocity.z²)
              </div>
            </div>
            <div class="text-sm text-gray-600">
              <p>
                Speed is the magnitude of the velocity vector. Horizontal speed
                excludes vertical movement (y-axis).
              </p>
            </div>
          </div>

          <!-- Landmark Speed Calculation -->
          <div class="border-b border-gray-200 pb-4">
            <h3 class="text-lg font-semibold text-gray-800 mb-3">
              4. Individual Landmark Speed
            </h3>
            <div class="bg-gray-50 p-4 rounded-lg mb-3">
              <p class="text-sm text-gray-700 mb-2">
                <strong>Formula (e.g., Right Foot):</strong>
              </p>
              <div class="font-mono text-sm bg-white p-2 rounded border">
                landmark_speed = √(Δx² + Δy² + Δz²) / time_delta
              </div>
              <div class="font-mono text-sm bg-white p-2 rounded border mt-2">
                where Δx = current_landmark.x - previous_landmark.x
              </div>
            </div>
          </div>

          <!-- Calibration Scaling -->
          <div class="border-b border-gray-200 pb-4">
            <h3 class="text-lg font-semibold text-gray-800 mb-3">
              5. Calibration Scaling
            </h3>
            <div class="bg-gray-50 p-4 rounded-lg mb-3">
              <p class="text-sm text-gray-700 mb-2">
                <strong>Height-based Scaling:</strong>
              </p>
              <div class="font-mono text-sm bg-white p-2 rounded border">
                height_scaling_factor = player_height / 170cm
              </div>
              <p class="text-sm text-gray-700 mb-2 mt-3">
                <strong>Court-based Scaling:</strong>
              </p>
              <div class="font-mono text-sm bg-white p-2 rounded border">
                court_scaling_factor = court_dimension / standard_dimension
              </div>
            </div>
            <div class="text-sm text-gray-600">
              <p>
                All landmark coordinates are multiplied by the scaling factor
                before speed calculations.
              </p>
            </div>
          </div>

          <!-- Current Values -->
          <div>
            <h3 class="text-lg font-semibold text-gray-800 mb-3">
              6. Current Calculation Values
            </h3>

            <!-- Valid Speed Data -->
            <div
              v-if="speedMetrics && speedMetrics.isValid"
              class="bg-blue-50 p-4 rounded-lg"
            >
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>Center of Mass:</strong></p>
                  <p class="font-mono">
                    x: {{ speedMetrics.centerOfMass.x?.toFixed(4) || 'N/A' }}
                  </p>
                  <p class="font-mono">
                    y: {{ speedMetrics.centerOfMass.y?.toFixed(4) || 'N/A' }}
                  </p>
                  <p class="font-mono">
                    z: {{ speedMetrics.centerOfMass.z?.toFixed(4) || 'N/A' }}
                  </p>
                </div>
                <div>
                  <p><strong>Velocity (m/s):</strong></p>
                  <p class="font-mono">
                    x: {{ speedMetrics.velocity.x?.toFixed(4) || 'N/A' }}
                  </p>
                  <p class="font-mono">
                    y: {{ speedMetrics.velocity.y?.toFixed(4) || 'N/A' }}
                  </p>
                  <p class="font-mono">
                    z: {{ speedMetrics.velocity.z?.toFixed(4) || 'N/A' }}
                  </p>
                </div>
                <div>
                  <p><strong>Speeds (m/s):</strong></p>
                  <p class="font-mono">
                    Overall: {{ speedMetrics.speed?.toFixed(4) || 'N/A' }}
                  </p>
                  <p class="font-mono">
                    Horizontal:
                    {{ speedMetrics.generalMovingSpeed?.toFixed(4) || 'N/A' }}
                  </p>
                  <p class="font-mono">
                    Right Foot:
                    {{ speedMetrics.rightFootSpeed?.toFixed(4) || 'N/A' }}
                  </p>
                </div>
                <div>
                  <p><strong>Calibration:</strong></p>
                  <p class="font-mono">
                    Scaling Factor:
                    {{ speedMetrics.scalingFactor?.toFixed(4) || 'N/A' }}
                  </p>
                  <p class="font-mono">
                    Player Height: {{ calibrationSettings.playerHeight }}cm
                  </p>
                  <p class="font-mono">
                    Accuracy: {{ calibrationSettings.calibrationAccuracy }}%
                  </p>
                </div>
              </div>
            </div>

            <!-- No Speed Data Available -->
            <div v-else class="bg-yellow-50 p-4 rounded-lg">
              <div class="text-sm text-yellow-800">
                <p class="font-semibold mb-2">⚠️ No Speed Data Available</p>
                <p class="mb-2">Possible reasons:</p>
                <ul class="list-disc list-inside space-y-1 text-xs">
                  <li>Video is paused or not playing</li>
                  <li>
                    Pose landmarks not detected with sufficient confidence
                  </li>
                  <li>Speed calculator not receiving landmark data</li>
                  <li>Insufficient frame history (need at least 2 frames)</li>
                </ul>

                <!-- Debug Information -->
                <div class="mt-3 p-2 bg-yellow-100 rounded text-xs">
                  <p><strong>Debug Info:</strong></p>
                  <p>speedMetrics exists: {{ !!speedMetrics }}</p>
                  <p>
                    speedMetrics.isValid: {{ speedMetrics?.isValid || false }}
                  </p>
                  <p>
                    centerOfMass exists:
                    {{ speedMetrics?.centerOfMass ? 'yes' : 'no' }}
                  </p>
                  <p>
                    centerOfMass values: x={{
                      speedMetrics?.centerOfMass?.x || 'N/A'
                    }}, y={{ speedMetrics?.centerOfMass?.y || 'N/A' }}, z={{
                      speedMetrics?.centerOfMass?.z || 'N/A'
                    }}
                  </p>
                  <p>
                    velocity exists: {{ speedMetrics?.velocity ? 'yes' : 'no' }}
                  </p>
                  <p>
                    velocity values: x={{ speedMetrics?.velocity?.x || 'N/A' }},
                    y={{ speedMetrics?.velocity?.y || 'N/A' }}, z={{
                      speedMetrics?.velocity?.z || 'N/A'
                    }}
                  </p>
                  <p>speed: {{ speedMetrics?.speed || 'N/A' }}</p>
                  <p>
                    scalingFactor: {{ speedMetrics?.scalingFactor || 'N/A' }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div class="bg-yellow-50 p-4 rounded-lg">
            <h4 class="font-semibold text-yellow-800 mb-2">Important Notes:</h4>
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
        </div>

        <div class="mt-6 flex justify-end">
          <button
            @click="showCalculationModal = false"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
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
const playerHeightInput = ref(props.calibrationSettings.playerHeight);
const courtLength = ref(13.4); // Default badminton court length
const courtWidth = ref(6.1); // Default badminton court width
const showCalculationModal = ref(false);

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
