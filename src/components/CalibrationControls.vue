<template>
  <div
    class="calibration-controls bg-white border border-gray-200 p-4 rounded-lg"
  >
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-medium text-gray-900">Speed Calibration</h3>
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
          />
        </div>
        <div class="flex items-center space-x-2">
          <input
            v-model="playerHeightInput"
            type="number"
            min="140"
            max="220"
            class="w-16 px-2 py-1 text-sm bg-white border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
            @input="onPlayerHeightChange"
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
          :width="280"
          :height="180"
        />
      </div>

      <div class="space-y-3">
        <!-- Court Length Input -->
        <div>
          <label class="text-xs text-gray-500 mb-1 block"
            >Court Length (meters)</label
          >
          <input
            v-model="courtLength"
            type="number"
            min="5"
            max="30"
            step="0.1"
            placeholder="13.4"
            class="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
            @input="onCourtDimensionsChange"
          />
        </div>

        <!-- Court Width Input -->
        <div>
          <label class="text-xs text-gray-500 mb-1 block"
            >Court Width (meters)</label
          >
          <input
            v-model="courtWidth"
            type="number"
            min="3"
            max="20"
            step="0.1"
            placeholder="6.1"
            class="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
            @input="onCourtDimensionsChange"
          />
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
            class="text-gray-400 hover:text-gray-600"
            @click="showCalculationModal = false"
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
              />
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

          <!-- Camera Calibration (Homography) -->
          <div class="border-b border-gray-200 pb-4">
            <h3 class="text-lg font-semibold text-gray-800 mb-3">
              6. Camera Calibration (Homography Transformation)
            </h3>
            <div class="bg-gray-50 p-4 rounded-lg mb-3">
              <p class="text-sm text-gray-700 mb-2">
                <strong>What it does:</strong>
              </p>
              <p class="text-sm text-gray-600 mb-3">
                Camera calibration uses homography to transform 2D image
                coordinates (pixels) to real-world 3D coordinates (meters) on
                the court surface. This enables accurate speed and distance
                measurements.
              </p>

              <p class="text-sm text-gray-700 mb-2">
                <strong>Homography Matrix Calculation (DLT Algorithm):</strong>
              </p>
              <div class="font-mono text-sm bg-white p-2 rounded border mb-2">
                H = [h₁₁ h₁₂ h₁₃] [h₂₁ h₂₂ h₂₃] [h₃₁ h₃₂ h₃₃]
              </div>
              <p class="text-sm text-gray-600 mb-3">
                Computed using 4 court corner points via Direct Linear
                Transformation (DLT)
              </p>

              <p class="text-sm text-gray-700 mb-2">
                <strong>Image to World Transformation:</strong>
              </p>
              <div class="font-mono text-sm bg-white p-2 rounded border mb-2">
                [x_world] [h₁₁ h₁₂ h₁₃] [x_image] [y_world] = [h₂₁ h₂₂ h₂₃] ×
                [y_image] [ w ] [h₃₁ h₃₂ h₃₃] [ 1 ] Final: x = x_world/w, y =
                y_world/w
              </div>

              <p class="text-sm text-gray-700 mb-2 mt-3">
                <strong>Calibration Process:</strong>
              </p>
              <ol
                class="list-decimal list-inside text-sm text-gray-600 space-y-1"
              >
                <li>Mark 4 court corners in the video (image coordinates)</li>
                <li>
                  Map to known court dimensions (world coordinates):
                  <ul class="list-disc list-inside ml-4 mt-1">
                    <li>Badminton: 13.4m × 6.1m</li>
                    <li>Tennis: 23.77m × 8.23m</li>
                  </ul>
                </li>
                <li>Calculate homography matrix using SVD</li>
                <li>Validate with reprojection error (target < 10cm)</li>
              </ol>

              <p class="text-sm text-gray-700 mb-2 mt-3">
                <strong>Height Estimation for 3D Points:</strong>
              </p>
              <div class="font-mono text-sm bg-white p-2 rounded border">
                For feet (on court): z = 0 For hips: z ≈ 0.9m For
                head/shoulders: z ≈ 1.5m For hands (variable): z =
                MediaPipe_depth × scaling_factor
              </div>
            </div>

            <div class="text-sm text-gray-600">
              <p class="mb-2">
                <strong>Key Benefits:</strong>
              </p>
              <ul class="list-disc list-inside space-y-1">
                <li>
                  Converts pixel movements to real-world distances (meters)
                </li>
                <li>Accounts for camera perspective and angle</li>
                <li>
                  Enables accurate speed calculations regardless of camera
                  position
                </li>
                <li>Handles different court types and dimensions</li>
              </ul>

              <p class="mt-3">
                <strong>Calibration Accuracy:</strong>
              </p>
              <div class="font-mono text-xs bg-white p-2 rounded border mt-1">
                error = Σ(√((x_reprojected - x_actual)² + (y_reprojected -
                y_actual)²)) / n
              </div>
              <ul class="list-disc list-inside mt-2 space-y-1">
                <li>Excellent: < 10cm average error</li>
                <li>Good: 10-50cm average error</li>
                <li>Poor: > 50cm average error (recalibration recommended)</li>
              </ul>
            </div>
          </div>

          <!-- Current Values -->
          <div>
            <h3 class="text-lg font-semibold text-gray-800 mb-3">
              7. Current Calculation Values
            </h3>

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
                    {{
                      speedMetrics.value.generalMovingSpeed?.toFixed(4) || 'N/A'
                    }}
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
            <div v-else class="bg-gray-50 p-4 rounded-lg">
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>Center of Mass:</strong></p>
                  <p class="font-mono text-gray-500">x: No data</p>
                  <p class="font-mono text-gray-500">y: No data</p>
                  <p class="font-mono text-gray-500">z: No data</p>
                </div>
                <div>
                  <p><strong>Velocity (m/s):</strong></p>
                  <p class="font-mono text-gray-500">x: No data</p>
                  <p class="font-mono text-gray-500">y: No data</p>
                  <p class="font-mono text-gray-500">z: No data</p>
                </div>
                <div>
                  <p><strong>Speeds (m/s):</strong></p>
                  <p class="font-mono text-gray-500">Overall: No data</p>
                  <p class="font-mono text-gray-500">Horizontal: No data</p>
                  <p class="font-mono text-gray-500">Right Foot: No data</p>
                </div>
                <div>
                  <p><strong>Calibration:</strong></p>
                  <p class="font-mono">
                    Scaling Factor:
                    {{
                      calibrationSettings.value?.pixelsPerMeter ||
                      calibrationSettings.pixelsPerMeter
                        ? (
                            (calibrationSettings.value?.pixelsPerMeter ||
                              calibrationSettings.pixelsPerMeter) / 100
                          ).toFixed(4)
                        : '1.0000'
                    }}
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
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            @click="showCalculationModal = false"
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
