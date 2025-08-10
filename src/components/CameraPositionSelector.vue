<template>
  <div class="camera-position-selector">
    <!-- Court Minimap -->
    <div class="court-container" @click="handleCourtClick">
      <svg
        ref="courtSvg"
        :width="courtWidth"
        :height="courtHeight"
        class="court-svg"
        viewBox="0 0 134 61"
        preserveAspectRatio="xMidYMid meet"
      >
        <!-- Court outline -->
        <rect
          x="0"
          y="0"
          width="134"
          height="61"
          fill="#4a5568"
          stroke="#e2e8f0"
          stroke-width="0.5"
        />

        <!-- Court lines -->
        <!-- Doubles court (full court) -->
        <rect
          x="0"
          y="0"
          width="134"
          height="61"
          fill="none"
          stroke="#e2e8f0"
          stroke-width="0.5"
        />

        <!-- Singles sidelines (5.18m width) -->
        <!-- Singles sidelines: (6.1 - 5.18) / 2 = 0.46m offset on each side -->
        <!-- 0.46m / 6.1m * 61 = 4.6 units offset -->
        <line
          x1="0"
          y1="4.6"
          x2="134"
          y2="4.6"
          stroke="#e2e8f0"
          stroke-width="0.3"
        />
        <line
          x1="0"
          y1="56.4"
          x2="134"
          y2="56.4"
          stroke="#e2e8f0"
          stroke-width="0.3"
        />

        <!-- Short service lines (1.98m from net on each side) -->
        <!-- Net is at 67 (center), service lines at 67 ± 19.8 -->
        <line
          x1="47.2"
          y1="0"
          x2="47.2"
          y2="61"
          stroke="#e2e8f0"
          stroke-width="0.3"
        />
        <line
          x1="86.8"
          y1="0"
          x2="86.8"
          y2="61"
          stroke="#e2e8f0"
          stroke-width="0.3"
        />

        <!-- Center service line (divides left and right service courts) -->
        <!-- Runs from short service line to back boundary -->
        <line
          x1="67"
          y1="0"
          x2="67"
          y2="47.2"
          stroke="#e2e8f0"
          stroke-width="0.3"
        />
        <line
          x1="67"
          y1="86.8"
          x2="67"
          y2="134"
          stroke="#e2e8f0"
          stroke-width="0.3"
        />

        <!-- Long service line for doubles (0.76m from back) -->
        <!-- 0.76m / 13.4m * 134 = 7.6 units from each end -->
        <line
          x1="7.6"
          y1="0"
          x2="7.6"
          y2="61"
          stroke="#e2e8f0"
          stroke-width="0.2"
        />
        <line
          x1="126.4"
          y1="0"
          x2="126.4"
          y2="61"
          stroke="#e2e8f0"
          stroke-width="0.2"
        />

        <!-- Long service line for singles (at the back) -->
        <!-- Singles long service line is at the back boundary -->

        <!-- Net -->
        <line
          x1="67"
          y1="0"
          x2="67"
          y2="61"
          stroke="#fbbf24"
          stroke-width="1"
        />

        <!-- Camera position indicator -->
        <g
          v-if="cameraPosition"
          :transform="`translate(${cameraPosition.x * 134}, ${
            cameraPosition.y * 61
          })`"
        >
          <!-- Camera icon -->
          <circle r="3" fill="#ef4444" stroke="#fff" stroke-width="0.5" />

          <!-- Viewing direction arrow -->
          <line
            :x1="0"
            :y1="0"
            :x2="Math.cos(viewAngle) * 10"
            :y2="Math.sin(viewAngle) * 10"
            stroke="#ef4444"
            stroke-width="1.5"
            marker-end="url(#arrowhead)"
          />
        </g>

        <!-- Arrow marker definition -->
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
          </marker>
        </defs>

        <!-- Position labels (only show when not showing calibration points) -->
        <g v-if="!showCalibrationPoints">
          <text x="2" y="30" font-size="3" fill="#cbd5e0">L</text>
          <text x="130" y="30" font-size="3" fill="#cbd5e0">R</text>
          <text x="65" y="3" font-size="3" fill="#cbd5e0">Far</text>
          <text x="64" y="59" font-size="3" fill="#cbd5e0">Near</text>
        </g>

        <!-- Calibration point indicators -->
        <g
          v-if="
            calibrationMode &&
            showCalibrationPoints &&
            currentCalibrationStep !== undefined
          "
        >
          <!-- Define calibration points based on mode -->
          <g v-if="calibrationMode === 'full-court'">
            <!-- Top-Left Corner indicator -->
            <circle
              v-if="currentCalibrationStep === 0"
              cx="0"
              cy="0"
              r="4"
              fill="none"
              stroke="#10b981"
              stroke-width="1.5"
              class="pulse-animation"
            />
            <circle
              v-if="currentCalibrationStep === 0"
              cx="0"
              cy="0"
              r="2"
              fill="#10b981"
            />

            <!-- Top-Right Corner indicator -->
            <circle
              v-if="currentCalibrationStep === 1"
              cx="134"
              cy="0"
              r="4"
              fill="none"
              stroke="#10b981"
              stroke-width="1.5"
              class="pulse-animation"
            />
            <circle
              v-if="currentCalibrationStep === 1"
              cx="134"
              cy="0"
              r="2"
              fill="#10b981"
            />

            <!-- Bottom-Right Corner indicator -->
            <circle
              v-if="currentCalibrationStep === 2"
              cx="134"
              cy="61"
              r="4"
              fill="none"
              stroke="#10b981"
              stroke-width="1.5"
              class="pulse-animation"
            />
            <circle
              v-if="currentCalibrationStep === 2"
              cx="134"
              cy="61"
              r="2"
              fill="#10b981"
            />

            <!-- Bottom-Left Corner indicator -->
            <circle
              v-if="currentCalibrationStep === 3"
              cx="0"
              cy="61"
              r="4"
              fill="none"
              stroke="#10b981"
              stroke-width="1.5"
              class="pulse-animation"
            />
            <circle
              v-if="currentCalibrationStep === 3"
              cx="0"
              cy="61"
              r="2"
              fill="#10b981"
            />
          </g>

          <!-- Half-court mode indicators -->
          <g v-if="calibrationMode === 'half-court'">
            <!-- Near-Left Corner -->
            <circle
              v-if="currentCalibrationStep === 0"
              cx="0"
              cy="61"
              r="4"
              fill="none"
              stroke="#10b981"
              stroke-width="1.5"
              class="pulse-animation"
            />
            <circle
              v-if="currentCalibrationStep === 0"
              cx="0"
              cy="61"
              r="2"
              fill="#10b981"
            />

            <!-- Near-Right Corner -->
            <circle
              v-if="currentCalibrationStep === 1"
              cx="134"
              cy="61"
              r="4"
              fill="none"
              stroke="#10b981"
              stroke-width="1.5"
              class="pulse-animation"
            />
            <circle
              v-if="currentCalibrationStep === 1"
              cx="134"
              cy="61"
              r="2"
              fill="#10b981"
            />

            <!-- Net Center -->
            <circle
              v-if="currentCalibrationStep === 2"
              cx="67"
              cy="30.5"
              r="4"
              fill="none"
              stroke="#10b981"
              stroke-width="1.5"
              class="pulse-animation"
            />
            <circle
              v-if="currentCalibrationStep === 2"
              cx="67"
              cy="30.5"
              r="2"
              fill="#10b981"
            />
          </g>

          <!-- Labels for corners -->
          <text
            x="67"
            y="3"
            font-size="2.5"
            fill="#6b7280"
            text-anchor="middle"
          >
            Far Baseline
          </text>
          <text
            x="67"
            y="59"
            font-size="2.5"
            fill="#6b7280"
            text-anchor="middle"
          >
            Near Baseline
          </text>
          <text x="2" y="30" font-size="2.5" fill="#6b7280" writing-mode="tb">
            Left Side
          </text>
          <text x="132" y="30" font-size="2.5" fill="#6b7280" writing-mode="tb">
            Right Side
          </text>
        </g>
      </svg>
    </div>

    <!-- Camera Settings -->
    <div class="camera-settings mt-3 space-y-2">
      <!-- Height input -->
      <div class="setting-row">
        <label class="text-xs font-medium text-gray-600">Height (m):</label>
        <input
          v-model.number="cameraHeight"
          type="number"
          min="1"
          max="10"
          step="0.1"
          class="w-20 px-2 py-1 text-xs border rounded"
          @change="updateCameraSettings"
        />
      </div>

      <!-- Angle control -->
      <div class="setting-row">
        <label class="text-xs font-medium text-gray-600">View Direction:</label>
        <div class="angle-controls flex gap-1">
          <button
            v-for="dir in directions"
            :key="dir.name"
            @click="setViewDirection(dir.angle)"
            :class="[
              'px-2 py-1 text-xs rounded',
              Math.abs(viewAngle - dir.angle) < 0.1
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 hover:bg-gray-300',
            ]"
          >
            {{ dir.name }}
          </button>
        </div>
      </div>

      <!-- Position presets -->
      <div class="setting-row">
        <label class="text-xs font-medium text-gray-600"
          >Quick Positions:</label
        >
        <div class="preset-controls flex flex-wrap gap-1">
          <button
            v-for="preset in presets"
            :key="preset.name"
            @click="applyPreset(preset)"
            class="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
          >
            {{ preset.name }}
          </button>
        </div>
      </div>

      <!-- Info display -->
      <div
        v-if="cameraPosition"
        class="info-display text-xs text-gray-600 mt-2"
      >
        <div>
          Position: {{ (cameraPosition.x * 13.4).toFixed(1) }}m,
          {{ (cameraPosition.y * 6.1).toFixed(1) }}m
        </div>
        <div>Height: {{ cameraHeight }}m</div>
        <div>Angle: {{ ((viewAngle * 180) / Math.PI).toFixed(0) }}°</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

interface CameraPosition {
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
}

interface CameraSettings {
  position: CameraPosition;
  height: number;
  viewAngle: number; // radians
}

const props = defineProps<{
  modelValue?: CameraSettings;
  calibrationMode?:
    | 'full-court'
    | 'half-court'
    | 'service-line'
    | 'reference-lines';
  showCalibrationPoints?: boolean;
  currentCalibrationStep?: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [settings: CameraSettings];
}>();

// Reactive state
const courtWidth = ref(268);
const courtHeight = ref(122);
const cameraPosition = ref<CameraPosition | null>(
  props.modelValue?.position || null
);
const cameraHeight = ref(props.modelValue?.height || 3.5);
const viewAngle = ref(props.modelValue?.viewAngle || Math.PI / 2);
const calibrationMode = computed(() => props.calibrationMode);
const showCalibrationPoints = computed(
  () => props.showCalibrationPoints ?? true
);

// Direction presets
const directions = [
  { name: '↑', angle: -Math.PI / 2 }, // Up (towards far side)
  { name: '↗', angle: -Math.PI / 4 }, // Up-right
  { name: '→', angle: 0 }, // Right
  { name: '↘', angle: Math.PI / 4 }, // Down-right
  { name: '↓', angle: Math.PI / 2 }, // Down (towards near side)
  { name: '↙', angle: (3 * Math.PI) / 4 }, // Down-left
  { name: '←', angle: Math.PI }, // Left
  { name: '↖', angle: (-3 * Math.PI) / 4 }, // Up-left
];

// Position presets
const presets = [
  {
    name: 'Side High',
    position: { x: 0.1, y: 0.5 },
    height: 5,
    angle: 0,
  },
  {
    name: 'Corner',
    position: { x: 0.05, y: 0.9 },
    height: 3,
    angle: -Math.PI / 4,
  },
  {
    name: 'Behind Baseline',
    position: { x: 0.5, y: 0.95 },
    height: 3.5,
    angle: -Math.PI / 2,
  },
  {
    name: 'Elevated Center',
    position: { x: 0.5, y: 0.5 },
    height: 8,
    angle: 0,
  },
  {
    name: 'Umpire Chair',
    position: { x: 0.05, y: 0.5 },
    height: 2.5,
    angle: 0,
  },
];

// Handle court click
function handleCourtClick(event: MouseEvent) {
  const svg = event.currentTarget as SVGElement;
  const rect = svg.getBoundingClientRect();

  // Calculate normalized position (0-1)
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  cameraPosition.value = { x, y };
  updateCameraSettings();
}

// Set view direction
function setViewDirection(angle: number) {
  viewAngle.value = angle;
  updateCameraSettings();
}

// Apply preset
function applyPreset(preset: (typeof presets)[0]) {
  cameraPosition.value = preset.position;
  cameraHeight.value = preset.height;
  viewAngle.value = preset.angle;
  updateCameraSettings();
}

// Update camera settings
function updateCameraSettings() {
  if (cameraPosition.value) {
    const settings: CameraSettings = {
      position: cameraPosition.value,
      height: cameraHeight.value,
      viewAngle: viewAngle.value,
    };
    emit('update:modelValue', settings);
  }
}

// Watch for external changes
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue) {
      cameraPosition.value = newValue.position;
      cameraHeight.value = newValue.height;
      viewAngle.value = newValue.viewAngle;
    }
  },
  { deep: true }
);
</script>

<style scoped>
.camera-position-selector {
  background: white;
  border-radius: 6px;
  padding: 10px;
  border: 1px solid #e5e7eb;
}

.court-container {
  cursor: crosshair;
  border: 2px solid #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
  background: #2d3748;
}

.court-svg {
  display: block;
  width: 100%;
  height: auto;
}

.camera-settings {
  border-top: 1px solid #e2e8f0;
  padding-top: 6px;
}

.controls-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.angle-controls {
  max-width: 120px;
}

.presets-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
}

.info-display {
  background: #f7fafc;
  padding: 6px;
  border-radius: 4px;
  font-family: monospace;
}

.calibration-legend {
  border: 1px solid #e5e7eb;
}

@keyframes pulse {
  0% {
    r: 4;
    opacity: 1;
  }
  50% {
    r: 6;
    opacity: 0.5;
  }
  100% {
    r: 4;
    opacity: 1;
  }
}

.pulse-animation {
  animation: pulse 1.5s ease-in-out infinite;
}
</style>
