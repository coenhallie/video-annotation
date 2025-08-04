<template>
  <div
    class="speed-visualization absolute inset-0 pointer-events-none"
    :style="{ zIndex: 15 }"
  >
    <!-- Speed Visualization Toggle Control -->
    <div
      v-if="showToggleControl && videoLoaded"
      class="absolute opacity-95 top-4 left-4 pointer-events-auto"
    >
      <button
        class="btn btn-ghost btn-sm bg-white border border-gray-200 rounded-lg shadow-md"
        :title="
          speedVisualizationEnabled
            ? 'Hide speed visualization'
            : 'Show speed visualization'
        "
        :aria-label="
          speedVisualizationEnabled
            ? 'Hide speed visualization'
            : 'Show speed visualization'
        "
        @click="toggleSpeedVisualization"
      >
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          :class="{
            'text-gray-700': speedVisualizationEnabled,
            'text-gray-400': !speedVisualizationEnabled,
          }"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <span class="text-sm font-medium">
          {{ speedVisualizationEnabled ? 'Speed: ON' : 'Speed: OFF' }}
        </span>
      </button>
    </div>

    <!-- Speed metrics overlay -->
    <svg
      v-if="
        speedVisualizationEnabled &&
        showSpeed &&
        speedMetrics &&
        speedMetrics.value &&
        speedMetrics.value.isValid
      "
      class="absolute inset-0 w-full h-full pointer-events-none"
      :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
      preserveAspectRatio="none"
    >
      <!-- Center of Mass point -->
      <g v-if="showCenterOfMass" class="center-of-mass">
        <circle
          :cx="comCanvasCoord.x"
          :cy="comCanvasCoord.y"
          :r="comRadius"
          :fill="comColor"
          :stroke="comStrokeColor"
          :stroke-width="comStrokeWidth"
          opacity="0.9"
        />
        <!-- CoM label -->
        <text
          v-if="showLabels"
          :x="comCanvasCoord.x + comRadius + 5"
          :y="comCanvasCoord.y - comRadius - 5"
          :fill="labelColor"
          :font-size="labelFontSize"
          font-family="Arial, sans-serif"
          font-weight="bold"
          text-shadow="1px 1px 2px rgba(0, 0, 0, 0.8)"
        >
          CoM
        </text>
      </g>

      <!-- Velocity vector -->
      <g
        v-if="showVelocityVector && velocityMagnitude > minVelocityThreshold"
        class="velocity-vector"
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" :fill="velocityColor" />
          </marker>
        </defs>

        <!-- Velocity line -->
        <line
          :x1="comCanvasCoord.x"
          :y1="comCanvasCoord.y"
          :x2="velocityEndPoint.x"
          :y2="velocityEndPoint.y"
          :stroke="velocityColor"
          :stroke-width="velocityLineWidth"
          stroke-linecap="round"
          marker-end="url(#arrowhead)"
          opacity="0.8"
        />

        <!-- Velocity magnitude label -->
        <text
          v-if="showLabels"
          :x="velocityEndPoint.x + 5"
          :y="velocityEndPoint.y - 5"
          :fill="velocityColor"
          :font-size="labelFontSize"
          font-family="Arial, sans-serif"
          font-weight="bold"
          text-shadow="1px 1px 2px rgba(0, 0, 0, 0.8)"
        >
          {{ velocityMagnitude.toFixed(2) }} m/s
        </text>
      </g>
    </svg>

    <!-- Speed display panel -->
    <div
      v-if="
        videoLoaded &&
        speedVisualizationEnabled &&
        showSpeedPanel &&
        speedMetrics &&
        speedMetrics.value &&
        speedMetrics.value.isValid
      "
      class="absolute opacity-95 top-4 right-4 bg-white border border-gray-200 rounded-lg shadow-md p-4 pointer-events-auto"
      style="min-width: 200px"
      role="region"
      aria-label="Speed metrics display"
    >
      <h3 class="text-lg font-medium mb-2 text-center text-gray-900">
        Movement Speed
      </h3>

      <!-- Speed gauge -->
      <div class="mb-3">
        <div class="flex justify-between items-center mb-1">
          <span class="text-sm text-gray-600">Overall Speed:</span>
          <span
            class="text-xl font-mono"
            :class="getSpeedColorClass(speedMetrics.value.speed)"
          >
            {{ speedMetrics.value.speed.toFixed(2) }} m/s
          </span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div
            class="h-2 rounded-full transition-all duration-300"
            :class="getSpeedBarColorClass(speedMetrics.value.speed)"
            :style="{
              width: `${Math.min(
                100,
                (speedMetrics.value.speed / maxSpeedForBar) * 100
              )}%`,
            }"
          />
        </div>
      </div>

      <!-- New speed metrics -->
      <div class="space-y-2 mb-3 text-sm">
        <div class="flex justify-between items-center">
          <span class="text-gray-600">Horizontal Speed:</span>
          <span class="font-mono text-gray-700">
            {{ speedMetrics.value.generalMovingSpeed?.toFixed(2) || '0.00' }}
            m/s
          </span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-gray-600">Right Foot Speed:</span>
          <span class="font-mono text-gray-500">
            {{ speedMetrics.value.rightFootSpeed?.toFixed(2) || '0.00' }} m/s
          </span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-gray-600">CoM Height:</span>
          <span class="font-mono text-gray-700">
            {{ speedMetrics.value.centerOfGravityHeight?.toFixed(2) || '0.00' }}
            m
          </span>
        </div>
      </div>

      <!-- Chart Toggle Button -->
      <div class="mb-3 pt-2 border-t border-gray-200">
        <button
          class="w-full btn btn-ghost btn-sm bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-100 transition-colors duration-200"
          :title="
            isChartVisible
              ? 'Hide horizontal speed chart'
              : 'Show horizontal speed chart'
          "
          :aria-label="
            isChartVisible
              ? 'Hide horizontal speed chart'
              : 'Show horizontal speed chart'
          "
          @click="toggleChart"
        >
          <svg
            class="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            :class="{
              'text-blue-600': isChartVisible,
              'text-gray-500': !isChartVisible,
            }"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <span class="text-sm font-medium">
            {{ isChartVisible ? 'Hide Chart' : 'Show Chart' }}
          </span>
        </button>
      </div>

      <!-- Velocity components -->
      <div v-if="showVelocityComponents" class="text-xs space-y-1">
        <div class="flex justify-between">
          <span class="text-gray-600">X:</span>
          <span class="font-mono text-gray-700">{{
            speedMetrics.value.velocity.x.toFixed(3)
          }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">Y:</span>
          <span class="font-mono text-gray-700">{{
            speedMetrics.value.velocity.y.toFixed(3)
          }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">Z:</span>
          <span class="font-mono text-gray-700">{{
            speedMetrics.value.velocity.z.toFixed(3)
          }}</span>
        </div>
      </div>

      <!-- Center of Mass coordinates -->
      <div
        v-if="showCoMCoordinates"
        class="text-xs space-y-1 mt-2 pt-2 border-t border-gray-200"
      >
        <div class="text-sm font-medium mb-1 text-gray-900">
          Center of Mass:
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">X:</span>
          <span class="font-mono text-gray-700">{{
            speedMetrics.value.centerOfMass.x.toFixed(3)
          }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">Y:</span>
          <span class="font-mono text-gray-700">{{
            speedMetrics.value.centerOfMass.y.toFixed(3)
          }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">Z:</span>
          <span class="font-mono text-gray-700">{{
            speedMetrics.value.centerOfMass.z.toFixed(3)
          }}</span>
        </div>
      </div>

      <!-- Center of Gravity coordinates -->
      <div
        v-if="showCoMCoordinates && speedMetrics.value.centerOfGravity"
        class="text-xs space-y-1 mt-2 pt-2 border-t border-gray-200"
      >
        <div class="text-sm font-medium mb-1 text-blue-900">
          Center of Gravity:
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">X:</span>
          <span class="font-mono text-blue-700">{{
            speedMetrics.value.centerOfGravity.x.toFixed(3)
          }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">Y:</span>
          <span class="font-mono text-blue-700">{{
            speedMetrics.value.centerOfGravity.y.toFixed(3)
          }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">Z:</span>
          <span class="font-mono text-blue-700">{{
            speedMetrics.value.centerOfGravity.z.toFixed(3)
          }}</span>
        </div>

        <!-- Difference between CoM and CoG -->
        <div class="mt-2 pt-1 border-t border-gray-100">
          <div class="text-xs font-medium mb-1 text-purple-900">
            Difference (CoG - CoM):
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">ΔX:</span>
            <span class="font-mono text-purple-700">{{
              (
                speedMetrics.value.centerOfGravity.x -
                speedMetrics.value.centerOfMass.x
              ).toFixed(3)
            }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">ΔY:</span>
            <span class="font-mono text-purple-700">{{
              (
                speedMetrics.value.centerOfGravity.y -
                speedMetrics.value.centerOfMass.y
              ).toFixed(3)
            }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">ΔZ:</span>
            <span class="font-mono text-purple-700">{{
              (
                speedMetrics.value.centerOfGravity.z -
                speedMetrics.value.centerOfMass.z
              ).toFixed(3)
            }}</span>
          </div>
        </div>
      </div>

      <!-- Speed Chart Component -->
      <SpeedChart
        v-if="isChartVisible"
        :speed-metrics="speedMetrics.value"
        :timestamp="currentTimestamp"
        :current-frame="currentFrame"
        :visible="isChartVisible"
      />
    </div>

    <!-- No speed data indicator -->
    <div
      v-if="
        videoLoaded &&
        speedVisualizationEnabled &&
        showSpeed &&
        (!speedMetrics || !speedMetrics.value || !speedMetrics.value.isValid) &&
        showNoSpeedIndicator
      "
      class="absolute opacity-95 top-4 right-4 bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-sm text-gray-600 pointer-events-auto"
      role="status"
      aria-live="polite"
    >
      No speed data available
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import SpeedChart from './SpeedChart.vue';

// Define props with proper TypeScript-like syntax
const props = defineProps({
  // Speed data
  speedMetrics: {
    type: Object,
    default: null,
  },

  // Canvas dimensions - should match actual video dimensions
  canvasWidth: {
    type: Number,
    default: 1920, // Default HD width, should be updated with actual video width
  },
  canvasHeight: {
    type: Number,
    default: 1080, // Default HD height, should be updated with actual video height
  },

  // Visibility controls
  showSpeed: {
    type: Boolean,
    default: true,
  },
  showToggleControl: {
    type: Boolean,
    default: true,
  },
  showCenterOfMass: {
    type: Boolean,
    default: true,
  },
  showVelocityVector: {
    type: Boolean,
    default: true,
  },
  showSpeedPanel: {
    type: Boolean,
    default: true,
  },
  showLabels: {
    type: Boolean,
    default: true,
  },
  showVelocityComponents: {
    type: Boolean,
    default: false,
  },
  showCoMCoordinates: {
    type: Boolean,
    default: false,
  },
  showNoSpeedIndicator: {
    type: Boolean,
    default: true,
  },
  videoLoaded: {
    type: Boolean,
    default: false,
  },

  // Styling options - updated to grayscale
  comColor: {
    type: String,
    default: '#374151', // gray-700
  },
  comStrokeColor: {
    type: String,
    default: '#ffffff',
  },
  comRadius: {
    type: Number,
    default: 8,
  },
  comStrokeWidth: {
    type: Number,
    default: 2,
  },
  velocityColor: {
    type: String,
    default: '#6b7280', // gray-500
  },
  velocityLineWidth: {
    type: Number,
    default: 3,
  },
  labelColor: {
    type: String,
    default: '#374151', // gray-700
  },
  labelFontSize: {
    type: Number,
    default: 12,
  },

  // Velocity vector settings
  velocityScale: {
    type: Number,
    default: 100, // Scale factor for velocity vector length
  },
  minVelocityThreshold: {
    type: Number,
    default: 0.01, // Minimum velocity to show vector
  },
  maxVelocityLength: {
    type: Number,
    default: 200, // Maximum pixel length for velocity vector
  },

  // Speed panel settings
  maxSpeedForBar: {
    type: Number,
    default: 5.0, // Maximum speed for progress bar (m/s)
  },

  // Current timestamp for chart
  currentTimestamp: {
    type: Number,
    default: 0,
  },

  // Current frame for chart
  currentFrame: {
    type: Number,
    default: 0,
  },
});

// Define emits
const emit = defineEmits(['speed-visualization-toggled', 'chart-toggled']);

// Speed visualization toggle state
const speedVisualizationEnabled = ref(true);

// Chart visibility toggle state
const isChartVisible = ref(false);

// Watch speedMetrics prop for debugging
watch(
  () => props.speedMetrics,
  (newSpeedMetrics) => {
    console.log('🔍 [SpeedVisualization] speedMetrics prop received:', {
      speedMetrics: newSpeedMetrics,
      isNull: newSpeedMetrics === null,
      isUndefined: newSpeedMetrics === undefined,
      isValid: newSpeedMetrics?.value?.isValid || newSpeedMetrics?.isValid,
      hasSpeed:
        newSpeedMetrics?.value?.speed !== undefined ||
        newSpeedMetrics?.speed !== undefined,
      speedValue: newSpeedMetrics?.value?.speed || newSpeedMetrics?.speed,
      hasIsValidProperty:
        'isValid' in (newSpeedMetrics?.value || newSpeedMetrics || {}),
      allProperties: newSpeedMetrics?.value
        ? Object.keys(newSpeedMetrics.value)
        : newSpeedMetrics
        ? Object.keys(newSpeedMetrics)
        : 'no properties',
    });
  },
  { immediate: true, deep: true }
);

// Watch speedVisualizationEnabled for debugging
watch(
  () => speedVisualizationEnabled.value,
  (newValue) => {
    console.log(
      '🔍 [SpeedVisualization] speedVisualizationEnabled changed:',
      newValue
    );
  },
  { immediate: true }
);

// Watch videoLoaded for debugging
watch(
  () => props.videoLoaded,
  (newValue) => {
    console.log('🔍 [SpeedVisualization] videoLoaded changed:', newValue);
  },
  { immediate: true }
);

// Toggle speed visualization
const toggleSpeedVisualization = () => {
  speedVisualizationEnabled.value = !speedVisualizationEnabled.value;
  emit('speed-visualization-toggled', speedVisualizationEnabled.value);
};

// Toggle chart visibility
const toggleChart = () => {
  console.log(
    '🔄 [SpeedVisualization] Chart toggle clicked, current state:',
    isChartVisible.value
  );
  isChartVisible.value = !isChartVisible.value;
  console.log(
    '🔄 [SpeedVisualization] Chart toggle new state:',
    isChartVisible.value
  );
  onChartToggled(isChartVisible.value);
};

// Convert normalized coordinates to canvas coordinates
// This matches the coordinate system used by pose landmarks (0-1 range)
const normalizedToCanvas = (normalizedCoord) => {
  return {
    x: normalizedCoord.x * props.canvasWidth,
    y: normalizedCoord.y * props.canvasHeight,
  };
};

// Center of Mass canvas coordinates
const comCanvasCoord = computed(() => {
  if (
    !props.speedMetrics ||
    !props.speedMetrics.value ||
    !props.speedMetrics.value.isValid
  ) {
    return { x: 0, y: 0 };
  }
  // Use normalized coordinates instead of world coordinates for proper alignment
  return normalizedToCanvas(props.speedMetrics.value.centerOfMass);
});

// Velocity magnitude
const velocityMagnitude = computed(() => {
  if (
    !props.speedMetrics ||
    !props.speedMetrics.value ||
    !props.speedMetrics.value.isValid
  ) {
    return 0;
  }
  return props.speedMetrics.value.speed;
});

// Velocity vector end point
const velocityEndPoint = computed(() => {
  if (
    !props.speedMetrics ||
    !props.speedMetrics.value ||
    !props.speedMetrics.value.isValid ||
    velocityMagnitude.value < props.minVelocityThreshold
  ) {
    return comCanvasCoord.value;
  }

  const velocity = props.speedMetrics.value.velocity;
  const scale = props.velocityScale;

  // Calculate vector length, capped at maximum
  let vectorLength = velocityMagnitude.value * scale;
  if (vectorLength > props.maxVelocityLength) {
    vectorLength = props.maxVelocityLength;
  }

  // For normalized coordinates, velocity is in normalized space
  // Scale the velocity vector appropriately for display
  const normalizedVel = {
    x: velocity.x,
    y: velocity.y,
  };

  // Convert velocity to pixel space and apply to canvas coordinates
  return {
    x: comCanvasCoord.value.x + normalizedVel.x * vectorLength,
    y: comCanvasCoord.value.y + normalizedVel.y * vectorLength, // No Y flip needed for normalized coords
  };
});

// Speed color classes for display - converted to grayscale
const getSpeedColorClass = (speed) => {
  if (speed < 0.5) return 'text-gray-700';
  if (speed < 1.5) return 'text-gray-500';
  if (speed < 3.0) return 'text-gray-400';
  return 'text-gray-300';
};

const getSpeedBarColorClass = (speed) => {
  if (speed < 0.5) return 'bg-gray-700';
  if (speed < 1.5) return 'bg-gray-500';
  if (speed < 3.0) return 'bg-gray-400';
  return 'bg-gray-300';
};

// Handle chart toggle event
const onChartToggled = (isVisible) => {
  emit('chart-toggled', isVisible);
};
</script>

<style scoped>
.speed-visualization {
  user-select: none;
  /* Optimize rendering performance */
  will-change: transform;
  transform: translateZ(0);
}

/* Optimize SVG rendering */
svg {
  shape-rendering: optimizeSpeed;
  text-rendering: optimizeSpeed;
}

/* Smooth transitions for speed bar */
.transition-all {
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
