<template>
  <div class="camera-position-selector bg-gray-50 rounded-lg p-4 space-y-4">
    <!-- Court Minimap -->
    <div
      class="court-container bg-gray-800 rounded-md p-2 cursor-pointer border-2 border-dashed border-gray-600 hover:border-blue-500 transition-colors"
      @click="handleCourtClick"
    >
      <svg
        ref="courtSvg"
        :width="courtWidth"
        :height="courtHeight"
        class="w-full h-auto"
        viewBox="0 0 134 61"
        preserveAspectRatio="xMidYMid meet"
      >
        <!-- Court outline -->
        <rect
          x="0"
          y="0"
          width="134"
          height="61"
          fill="none"
          stroke="hsl(210 14% 48%)"
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
          stroke="hsl(210 14% 48%)"
          stroke-width="0.5"
        />

        <!-- Singles sidelines -->
        <line
          x1="0"
          y1="4.6"
          x2="134"
          y2="4.6"
          stroke="hsl(210 14% 48%)"
          stroke-width="0.3"
        />
        <line
          x1="0"
          y1="56.4"
          x2="134"
          y2="56.4"
          stroke="hsl(210 14% 48%)"
          stroke-width="0.3"
        />

        <!-- Short service lines -->
        <line
          x1="47.2"
          y1="0"
          x2="47.2"
          y2="61"
          stroke="hsl(210 14% 48%)"
          stroke-width="0.3"
        />
        <line
          x1="86.8"
          y1="0"
          x2="86.8"
          y2="61"
          stroke="hsl(210 14% 48%)"
          stroke-width="0.3"
        />

        <!-- Center service line -->
        <line
          x1="67"
          y1="0"
          x2="67"
          y2="47.2"
          stroke="hsl(210 14% 48%)"
          stroke-width="0.3"
        />
        <line
          x1="67"
          y1="86.8"
          x2="67"
          y2="134"
          stroke="hsl(210 14% 48%)"
          stroke-width="0.3"
        />

        <!-- Long service line for doubles -->
        <line
          x1="7.6"
          y1="0"
          x2="7.6"
          y2="61"
          stroke="hsl(210 14% 48%)"
          stroke-width="0.2"
        />
        <line
          x1="126.4"
          y1="0"
          x2="126.4"
          y2="61"
          stroke="hsl(210 14% 48%)"
          stroke-width="0.2"
        />

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
          class="transition-transform"
        >
          <circle
            r="4"
            fill="#3b82f6"
            opacity="0.3"
            class="animate-pulse"
          />
          <circle
            r="2.5"
            fill="#3b82f6"
            stroke="#fff"
            stroke-width="0.5"
          />
          <line
            :x1="0"
            :y1="0"
            :x2="Math.cos(viewAngle) * 10"
            :y2="Math.sin(viewAngle) * 10"
            stroke="#3b82f6"
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
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="#3b82f6"
            />
          </marker>
        </defs>

        <!-- Position labels -->
        <g v-if="!showCalibrationPoints">
          <text
            x="5"
            y="32"
            font-size="4"
            fill="#6b7280"
            class="font-sans"
          >
            L
          </text>
          <text
            x="125"
            y="32"
            font-size="4"
            fill="#6b7280"
            class="font-sans"
          >
            R
          </text>
          <text
            x="67"
            y="7"
            font-size="4"
            fill="#6b7280"
            text-anchor="middle"
            class="font-sans"
          >
            Far
          </text>
          <text
            x="67"
            y="56"
            font-size="4"
            fill="#6b7280"
            text-anchor="middle"
            class="font-sans"
          >
            Near
          </text>
        </g>

        <!-- Calibration point indicators -->
        <g
          v-if="
            calibrationMode &&
              showCalibrationPoints &&
              currentCalibrationStep !== undefined
          "
        >
          <g :class="{ 'pulse-animation': isCurrentStep(0) }">
            <circle
              v-if="currentCalibrationStep === 0"
              cx="0"
              cy="0"
              r="2"
              fill="#10b981"
            />
          </g>
          <g :class="{ 'pulse-animation': isCurrentStep(1) }">
            <circle
              v-if="currentCalibrationStep === 1"
              cx="134"
              cy="0"
              r="2"
              fill="#10b981"
            />
          </g>
          <g :class="{ 'pulse-animation': isCurrentStep(2) }">
            <circle
              v-if="currentCalibrationStep === 2"
              cx="134"
              cy="61"
              r="2"
              fill="#10b981"
            />
          </g>
          <g :class="{ 'pulse-animation': isCurrentStep(3) }">
            <circle
              v-if="currentCalibrationStep === 3"
              cx="0"
              cy="61"
              r="2"
              fill="#10b981"
            />
          </g>

          <text
            x="67"
            y="5"
            font-size="3"
            fill="#6b7280"
            text-anchor="middle"
          >
            Far Baseline
          </text>
          <text
            x="67"
            y="58"
            font-size="3"
            fill="#6b7280"
            text-anchor="middle"
          >
            Near Baseline
          </text>
        </g>
      </svg>
    </div>

    <!-- Camera Settings -->
    <div class="camera-settings space-y-3">
      <!-- Height input -->
      <div class="setting-row">
        <label class="setting-label">Height (m)</label>
        <div class="flex items-center space-x-2">
          <input
            v-model.number="cameraHeight"
            type="range"
            min="1"
            max="10"
            step="0.1"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            @change="updateCameraSettings"
          >
          <input
            v-model.number="cameraHeight"
            type="number"
            min="1"
            max="10"
            step="0.1"
            class="w-20 text-center bg-gray-100 border border-gray-300 rounded-md shadow-sm"
            @change="updateCameraSettings"
          >
        </div>
      </div>

      <!-- Angle control -->
      <div class="setting-row">
        <label class="setting-label">Viewing Direction</label>
        <div class="grid grid-cols-8 gap-1 p-1 bg-gray-200 rounded-full">
          <button
            v-for="dir in directions"
            :key="dir.name"
            :class="[
              'p-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500',
              Math.abs(viewAngle - dir.angle) < 0.1
                ? 'bg-blue-500 text-white shadow'
                : 'hover:bg-gray-300',
            ]"
            :title="`View ${dir.label || dir.name}`"
            @click="setViewDirection(dir.angle)"
          >
            {{ dir.name }}
          </button>
        </div>
      </div>

      <!-- Position presets -->
      <div class="setting-row">
        <label class="setting-label">Position Presets</label>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="preset in presets"
            :key="preset.name"
            class="preset-button"
            :title="`Set camera to ${preset.name} position`"
            @click="applyPreset(preset)"
          >
            {{ preset.name }}
          </button>
        </div>
      </div>

      <!-- Info display -->
      <div
        v-if="cameraPosition"
        class="p-3 bg-gray-100 rounded-md text-sm text-gray-600 space-y-1"
      >
        <div class="flex items-center">
          <span class="w-20">Position:</span>
          <span class="font-mono">{{ (cameraPosition.x * 13.4).toFixed(1) }}m,
            {{ (cameraPosition.y * 6.1).toFixed(1) }}m</span>
        </div>
        <div class="flex items-center">
          <span class="w-20">Height:</span>
          <span class="font-mono">{{ cameraHeight.toFixed(1) }}m</span>
        </div>
        <div class="flex items-center">
          <span class="w-20">Angle:</span>
          <span class="font-mono">{{ ((viewAngle * 180) / Math.PI).toFixed(0) }}°</span>
        </div>
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

const isCurrentStep = (step: number) => {
  return props.currentCalibrationStep === step;
};

// Direction presets with labels
const directions = [
  { name: '↑', label: 'Far', angle: -Math.PI / 2 }, // Up (towards far side)
  { name: '↗', label: 'Far-Right', angle: -Math.PI / 4 }, // Up-right
  { name: '→', label: 'Right', angle: 0 }, // Right
  { name: '↘', label: 'Near-Right', angle: Math.PI / 4 }, // Down-right
  { name: '↓', label: 'Near', angle: Math.PI / 2 }, // Down (towards near side)
  { name: '↙', label: 'Near-Left', angle: (3 * Math.PI) / 4 }, // Down-left
  { name: '←', label: 'Left', angle: Math.PI }, // Left
  { name: '↖', label: 'Far-Left', angle: (-3 * Math.PI) / 4 }, // Up-left
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
.setting-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.setting-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(55 65 81);
}

.preset-button {
  width: 100%;
  text-align: center;
  background-color: rgb(229 231 235);
  border: 1px solid rgb(209 213 219);
  border-radius: 0.375rem;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgb(55 65 81);
  transition: all 0.15s ease-in-out;
}

.preset-button:hover {
  background-color: rgb(209 213 219);
}

.preset-button:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgb(59 130 246), 0 0 0 4px rgb(59 130 246 / 0.1);
}

.pulse-animation {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    stroke-opacity: 1;
    stroke-width: 1.5;
  }
  50% {
    stroke-opacity: 0.3;
    stroke-width: 2.5;
  }
  100% {
    stroke-opacity: 1;
    stroke-width: 1.5;
  }
}
</style>
