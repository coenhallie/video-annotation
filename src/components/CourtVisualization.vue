<template>
  <svg
    :viewBox="viewBox"
    class="w-full h-full"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- Background -->
    <rect :width="svgWidth" :height="svgHeight" fill="#f3f4f6" stroke="none" />

    <!-- Court surface -->
    <rect
      :x="courtBounds.x"
      :y="courtBounds.y"
      :width="courtBounds.width"
      :height="courtBounds.height"
      :fill="courtColor"
      stroke="none"
      :opacity="isVisible ? 1 : 0.3"
    />

    <!-- Court lines based on calibration mode -->
    <g v-if="calibrationMode === 'full-court'">
      <!-- Full court lines -->
      <!-- Singles court boundary -->
      <rect
        :x="courtX"
        :y="courtY"
        :width="courtWidth"
        :height="courtLength"
        fill="none"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />

      <!-- Net line -->
      <line
        :x1="courtX - netExtension"
        :y1="centerY"
        :x2="courtX + courtWidth + netExtension"
        :y2="centerY"
        :stroke="netColor"
        :stroke-width="netWidth"
        :opacity="lineOpacity"
      />

      <!-- Service lines -->
      <line
        :x1="courtX"
        :y1="centerY - serviceLineDistance"
        :x2="courtX + courtWidth"
        :y2="centerY - serviceLineDistance"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />
      <line
        :x1="courtX"
        :y1="centerY + serviceLineDistance"
        :x2="courtX + courtWidth"
        :y2="centerY + serviceLineDistance"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />

      <!-- Center service line -->
      <line
        :x1="centerX"
        :y1="centerY - serviceLineDistance"
        :x2="centerX"
        :y2="centerY + serviceLineDistance"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />

      <!-- Baseline center marks (tennis) -->
      <line
        v-if="courtType === 'tennis'"
        :x1="centerX"
        :y1="courtY"
        :x2="centerX"
        :y2="courtY - 10"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />
      <line
        v-if="courtType === 'tennis'"
        :x1="centerX"
        :y1="courtY + courtLength"
        :x2="centerX"
        :y2="courtY + courtLength + 10"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />
    </g>

    <g v-else-if="calibrationMode === 'half-court'">
      <!-- Half court visualization -->
      <!-- Singles court boundary (half) -->
      <rect
        :x="courtX"
        :y="centerY"
        :width="courtWidth"
        :height="courtLength / 2"
        fill="none"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />

      <!-- Net line -->
      <line
        :x1="courtX - netExtension"
        :y1="centerY"
        :x2="courtX + courtWidth + netExtension"
        :y2="centerY"
        :stroke="netColor"
        :stroke-width="netWidth"
        :opacity="lineOpacity"
      />

      <!-- Service line (visible half) -->
      <line
        :x1="courtX"
        :y1="centerY + serviceLineDistance"
        :x2="courtX + courtWidth"
        :y2="centerY + serviceLineDistance"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />

      <!-- Center service line (visible half) -->
      <line
        :x1="centerX"
        :y1="centerY"
        :x2="centerX"
        :y2="centerY + serviceLineDistance"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />

      <!-- Faded other half indication -->
      <rect
        :x="courtX"
        :y="courtY"
        :width="courtWidth"
        :height="courtLength / 2"
        fill="none"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity * 0.2"
        stroke-dasharray="10,10"
      />
    </g>

    <g
      v-else-if="
        calibrationMode === 'service-courts' || calibrationMode === 'minimal'
      "
    >
      <!-- Service courts focus -->
      <!-- Service boxes only -->
      <rect
        :x="courtX"
        :y="centerY - serviceLineDistance"
        :width="courtWidth / 2"
        :height="serviceLineDistance * 2"
        fill="none"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />
      <rect
        :x="centerX"
        :y="centerY - serviceLineDistance"
        :width="courtWidth / 2"
        :height="serviceLineDistance * 2"
        fill="none"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />

      <!-- Net line -->
      <line
        :x1="courtX - netExtension"
        :y1="centerY"
        :x2="courtX + courtWidth + netExtension"
        :y2="centerY"
        :stroke="netColor"
        :stroke-width="netWidth"
        :opacity="lineOpacity"
      />

      <!-- Center line -->
      <line
        :x1="centerX"
        :y1="centerY - serviceLineDistance"
        :x2="centerX"
        :y2="centerY + serviceLineDistance"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity"
      />

      <!-- Baseline (faded, for optional points) -->
      <line
        :x1="courtX"
        :y1="courtY + courtLength"
        :x2="courtX + courtWidth"
        :y2="courtY + courtLength"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity * 0.3"
        stroke-dasharray="5,5"
      />

      <!-- Faded court outline -->
      <rect
        :x="courtX"
        :y="courtY"
        :width="courtWidth"
        :height="courtLength"
        fill="none"
        :stroke="lineColor"
        :stroke-width="lineWidth"
        :opacity="lineOpacity * 0.15"
        stroke-dasharray="10,10"
      />
    </g>

    <!-- Calibration points indicators -->
    <g v-if="showCalibrationPoints">
      <!-- Required calibration points based on mode -->
      <g v-for="point in requiredPoints" :key="point.id">
        <!-- Pulsing animation for next point -->
        <g v-if="point.id === nextPoint && !point.collected">
          <circle
            :cx="point.x"
            :cy="point.y"
            :r="pointRadius * 2"
            fill="none"
            stroke="#3b82f6"
            :stroke-width="2"
            opacity="0.5"
            class="pulse-ring"
          />
          <circle
            :cx="point.x"
            :cy="point.y"
            :r="pointRadius * 1.5"
            fill="none"
            stroke="#3b82f6"
            :stroke-width="2"
            opacity="0.7"
            class="pulse-ring-delayed"
          />
        </g>

        <circle
          :cx="point.x"
          :cy="point.y"
          :r="
            point.id === nextPoint && !point.collected
              ? pointRadius * 1.2
              : pointRadius
          "
          :fill="
            point.collected
              ? '#10b981'
              : point.id === nextPoint
              ? '#3b82f6'
              : '#ef4444'
          "
          :opacity="point.collected ? 0.8 : point.id === nextPoint ? 1 : 0.6"
          stroke="white"
          :stroke-width="point.id === nextPoint && !point.collected ? 3 : 2"
          :class="{
            'pulse-point': point.id === nextPoint && !point.collected,
          }"
        />
        <text
          :x="point.x"
          :y="point.y - pointRadius - 3"
          :font-size="
            point.id === nextPoint && !point.collected
              ? fontSize * 1.1
              : fontSize
          "
          :fill="
            point.id === nextPoint && !point.collected ? '#3b82f6' : '#1f2937'
          "
          text-anchor="middle"
          font-weight="bold"
        >
          {{ point.label }}
        </text>
      </g>

      <!-- Optional calibration points -->
      <g v-for="point in optionalPoints" :key="point.id">
        <!-- Pulsing animation for next optional point -->
        <g v-if="point.id === nextPoint && !point.collected">
          <circle
            :cx="point.x"
            :cy="point.y"
            :r="pointRadius * 1.5"
            fill="none"
            stroke="#3b82f6"
            :stroke-width="1"
            opacity="0.5"
            stroke-dasharray="3,3"
            class="pulse-ring"
          />
        </g>

        <circle
          :cx="point.x"
          :cy="point.y"
          :r="
            point.id === nextPoint && !point.collected
              ? pointRadius
              : pointRadius * 0.8
          "
          :fill="
            point.collected
              ? '#10b981'
              : point.id === nextPoint
              ? '#3b82f6'
              : '#6b7280'
          "
          :opacity="point.collected ? 0.6 : point.id === nextPoint ? 0.8 : 0.4"
          stroke="white"
          :stroke-width="point.id === nextPoint && !point.collected ? 2 : 1"
          :stroke-dasharray="point.id === nextPoint ? 'none' : '3,3'"
          :class="{
            'pulse-point': point.id === nextPoint && !point.collected,
          }"
        />
        <text
          :x="point.x"
          :y="point.y - pointRadius - 3"
          :font-size="
            point.id === nextPoint && !point.collected
              ? fontSize
              : fontSize * 0.8
          "
          :fill="
            point.id === nextPoint && !point.collected ? '#3b82f6' : '#6b7280'
          "
          text-anchor="middle"
          font-weight="point.id === nextPoint && !point.collected ? 'bold' : 'normal'"
        >
          {{ point.label }}
        </text>
      </g>
    </g>

    <!-- Camera position indicator -->
    <g v-if="showCameraPosition && cameraPosition">
      <circle
        :cx="cameraPosition.x"
        :cy="cameraPosition.y"
        r="8"
        fill="#3b82f6"
        stroke="white"
        stroke-width="2"
      />
      <path
        :d="cameraViewCone"
        fill="#3b82f6"
        opacity="0.2"
        stroke="#3b82f6"
        stroke-width="1"
      />
      <text
        :x="cameraPosition.x"
        :y="cameraPosition.y - 12"
        font-size="10"
        fill="#3b82f6"
        text-anchor="middle"
        font-weight="bold"
      >
        Camera
      </text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue';
import type {
  CourtDimensions,
  CameraSettings,
} from '../composables/useCameraCalibration';

const props = defineProps({
  calibrationMode: {
    type: String as PropType<string>,
    default: 'full-court',
  },
  courtType: {
    type: String as PropType<'badminton' | 'tennis'>,
    default: 'badminton',
  },
  courtDimensions: {
    type: Object as PropType<CourtDimensions>,
    default: () => ({
      length: 13.4,
      width: 5.18,
      serviceLineDistance: 1.98,
      centerLineLength: 4.72,
      netHeight: 1.55,
    }),
  },
  showCalibrationPoints: {
    type: Boolean,
    default: false,
  },
  collectedPoints: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
  showCameraPosition: {
    type: Boolean,
    default: false,
  },
  cameraSettings: {
    type: Object as PropType<CameraSettings>,
    default: null,
  },
  nextPoint: {
    type: String as PropType<string | null>,
    default: null,
  },
  width: {
    type: Number,
    default: 400,
  },
  height: {
    type: Number,
    default: 600,
  },
});

// SVG dimensions and scaling - use props for dynamic sizing
const svgWidth = computed(() => props.width || 200);
const svgHeight = computed(() => props.height || 300);
const padding = 40;

// Calculate court dimensions in SVG coordinates
const scale = computed(() => {
  const maxCourtWidth = svgWidth.value - 2 * padding;
  const maxCourtHeight = svgHeight.value - 2 * padding;

  const widthScale = maxCourtWidth / (props.courtDimensions.width * 1.2); // Add some margin
  const lengthScale = maxCourtHeight / props.courtDimensions.length;

  return Math.min(widthScale, lengthScale);
});

const courtWidth = computed(() => props.courtDimensions.width * scale.value);
const courtLength = computed(() => props.courtDimensions.length * scale.value);
const courtX = computed(() => (svgWidth.value - courtWidth.value) / 2);
const courtY = computed(() => (svgHeight.value - courtLength.value) / 2);
const centerX = computed(() => courtX.value + courtWidth.value / 2);
const centerY = computed(() => courtY.value + courtLength.value / 2);
const serviceLineDistance = computed(
  () => props.courtDimensions.serviceLineDistance * scale.value
);

// Doubles court dimensions (for badminton/tennis)
const doublesCourtWidth = computed(() => {
  if (props.courtType === 'badminton') {
    return 6.1 * scale.value; // Badminton doubles width
  } else if (props.courtType === 'tennis') {
    return 10.97 * scale.value; // Tennis doubles width
  }
  return courtWidth.value;
});

const doublesCourtX = computed(
  () => (svgWidth.value - doublesCourtWidth.value) / 2
);

// Visual properties
const courtColor = computed(() => {
  if (props.courtType === 'badminton') {
    return '#f0f9ff'; // Very light blue for badminton
  } else {
    return '#f0fdf4'; // Very light green for tennis
  }
});

// Muted, subtle colors for court lines
const lineColor = '#9ca3af'; // Muted gray
const netColor = '#f87171'; // Softer red
const lineWidth = 1.5;
const netWidth = 2;
const netExtension = 20;
const lineOpacity = computed(() => {
  // Reduced opacity for more subtle appearance
  switch (props.calibrationMode) {
    case 'full-court':
    case 'full-court':
      return 0.4;
    case 'half-court':
      return 0.35;
    case 'service-courts':
    case 'minimal':
      return 0.3;
    default:
      return 0.25;
  }
});

const showDoubles = computed(() => {
  return (
    props.calibrationMode === 'full-court' ||
    props.calibrationMode === 'full-court'
  );
});

// ViewBox based on calibration mode
const viewBox = computed(() => {
  switch (props.calibrationMode) {
    case 'half-court':
      // Focus on half court
      return `0 ${svgHeight.value / 4} ${svgWidth.value} ${
        svgHeight.value * 0.75
      }`;
    case 'service-courts':
    case 'minimal': {
      // Zoom in on service courts area but include baseline for optional points
      // Calculate to ensure baseline points are visible
      const topY = centerY.value - serviceLineDistance.value * 1.5;
      const bottomY = courtY.value + courtLength.value + 20; // Include baseline with extra padding
      const viewHeight = bottomY - topY;
      const viewX = padding / 2;
      const viewWidth = svgWidth.value - padding;
      return `${viewX} ${topY} ${viewWidth} ${viewHeight}`;
    }
    default:
      // Full view
      return `0 0 ${svgWidth.value} ${svgHeight.value}`;
  }
});

// Court bounds for background
const courtBounds = computed(() => {
  switch (props.calibrationMode) {
    case 'half-court':
      return {
        x: courtX.value - 10,
        y: centerY.value - 10,
        width: courtWidth.value + 20,
        height: courtLength.value / 2 + 20,
      };
    case 'service-courts':
    case 'minimal':
      // Show full court background to include baseline area
      return {
        x: courtX.value - 10,
        y: courtY.value - 10,
        width: courtWidth.value + 20,
        height: courtLength.value + 20,
      };
    default:
      return {
        x: courtX.value - 10,
        y: courtY.value - 10,
        width: courtWidth.value + 20,
        height: courtLength.value + 20,
      };
  }
});

// Visibility flag
const isVisible = computed(() => {
  // Check if the selected area is visible based on mode
  return true; // Always visible for now, can be enhanced based on camera position
});

// Calculate required calibration points based on mode
const requiredPoints = computed(() => {
  const points: any[] = [];
  const collected = new Set(props.collectedPoints);

  switch (props.calibrationMode) {
    case 'full-court':
      // All corners and key points
      points.push(
        {
          id: 'corner-tl',
          x: courtX.value,
          y: courtY.value,
          label: 'TL',
          collected: collected.has('corner-tl'),
        },
        {
          id: 'corner-tr',
          x: courtX.value + courtWidth.value,
          y: courtY.value,
          label: 'TR',
          collected: collected.has('corner-tr'),
        },
        {
          id: 'corner-bl',
          x: courtX.value,
          y: courtY.value + courtLength.value,
          label: 'BL',
          collected: collected.has('corner-bl'),
        },
        {
          id: 'corner-br',
          x: courtX.value + courtWidth.value,
          y: courtY.value + courtLength.value,
          label: 'BR',
          collected: collected.has('corner-br'),
        },
        {
          id: 'net-left',
          x: courtX.value,
          y: centerY.value,
          label: 'NL',
          collected: collected.has('net-left'),
        },
        {
          id: 'net-right',
          x: courtX.value + courtWidth.value,
          y: centerY.value,
          label: 'NR',
          collected: collected.has('net-right'),
        },
        {
          id: 'net-center',
          x: centerX.value,
          y: centerY.value,
          label: 'NC',
          collected: collected.has('net-center'),
        },
        {
          id: 'service-left',
          x: courtX.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SL',
          collected: collected.has('service-left'),
        },
        {
          id: 'service-right',
          x: courtX.value + courtWidth.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SR',
          collected: collected.has('service-right'),
        }
      );
      break;

    case 'half-court':
      points.push(
        {
          id: 'net-left',
          x: courtX.value,
          y: centerY.value,
          label: 'NL',
          collected: collected.has('net-left'),
        },
        {
          id: 'net-right',
          x: courtX.value + courtWidth.value,
          y: centerY.value,
          label: 'NR',
          collected: collected.has('net-right'),
        },
        {
          id: 'net-center',
          x: centerX.value,
          y: centerY.value,
          label: 'NC',
          collected: collected.has('net-center'),
        },
        {
          id: 'service-left',
          x: courtX.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SL',
          collected: collected.has('service-left'),
        },
        {
          id: 'service-right',
          x: courtX.value + courtWidth.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SR',
          collected: collected.has('service-right'),
        },
        {
          id: 'sideline-mid-left',
          x: courtX.value,
          y: centerY.value + courtLength.value / 4,
          label: 'ML',
          collected: collected.has('sideline-mid-left'),
        },
        {
          id: 'sideline-mid-right',
          x: courtX.value + courtWidth.value,
          y: centerY.value + courtLength.value / 4,
          label: 'MR',
          collected: collected.has('sideline-mid-right'),
        }
      );
      break;

    case 'service-courts':
      points.push(
        {
          id: 'net-left',
          x: courtX.value,
          y: centerY.value,
          label: 'NL',
          collected: collected.has('net-left'),
        },
        {
          id: 'net-right',
          x: courtX.value + courtWidth.value,
          y: centerY.value,
          label: 'NR',
          collected: collected.has('net-right'),
        },
        {
          id: 'net-center',
          x: centerX.value,
          y: centerY.value,
          label: 'NC',
          collected: collected.has('net-center'),
        },
        {
          id: 'service-left',
          x: courtX.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SL',
          collected: collected.has('service-left'),
        },
        {
          id: 'service-right',
          x: courtX.value + courtWidth.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SR',
          collected: collected.has('service-right'),
        },
        {
          id: 'service-center-left',
          x: centerX.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SCL',
          collected: collected.has('service-center-left'),
        },
        {
          id: 'service-center-right',
          x: centerX.value,
          y: centerY.value - serviceLineDistance.value,
          label: 'SCR',
          collected: collected.has('service-center-right'),
        }
      );
      break;

    case 'minimal':
      points.push(
        {
          id: 'net-center',
          x: centerX.value,
          y: centerY.value,
          label: 'NC',
          collected: collected.has('net-center'),
        },
        {
          id: 'service-left',
          x: courtX.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SL',
          collected: collected.has('service-left'),
        },
        {
          id: 'service-right',
          x: courtX.value + courtWidth.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SR',
          collected: collected.has('service-right'),
        },
        {
          id: 'service-center-left',
          x: centerX.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SCL',
          collected: collected.has('service-center-left'),
        },
        {
          id: 'service-center-right',
          x: centerX.value,
          y: centerY.value - serviceLineDistance.value,
          label: 'SCR',
          collected: collected.has('service-center-right'),
        }
      );
      break;

    default:
      // Full court mode
      points.push(
        {
          id: 'corner-tl',
          x: courtX.value,
          y: courtY.value,
          label: '1',
          collected: collected.has('corner-tl'),
        },
        {
          id: 'corner-tr',
          x: courtX.value + courtWidth.value,
          y: courtY.value,
          label: '2',
          collected: collected.has('corner-tr'),
        },
        {
          id: 'corner-br',
          x: courtX.value + courtWidth.value,
          y: courtY.value + courtLength.value,
          label: '3',
          collected: collected.has('corner-br'),
        },
        {
          id: 'corner-bl',
          x: courtX.value,
          y: courtY.value + courtLength.value,
          label: '4',
          collected: collected.has('corner-bl'),
        }
      );
  }

  return points;
});

// Optional calibration points
const optionalPoints = computed(() => {
  const points: any[] = [];
  const collected = new Set(props.collectedPoints);

  switch (props.calibrationMode) {
    case 'full-court':
      points.push(
        {
          id: 'service-center-left',
          x: centerX.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SCL',
          collected: collected.has('service-center-left'),
        },
        {
          id: 'service-center-right',
          x: centerX.value,
          y: centerY.value - serviceLineDistance.value,
          label: 'SCR',
          collected: collected.has('service-center-right'),
        },
        {
          id: 'baseline-center',
          x: centerX.value,
          y: courtY.value + courtLength.value,
          label: 'BC',
          collected: collected.has('baseline-center'),
        }
      );
      break;

    case 'half-court':
      points.push(
        {
          id: 'service-center-left',
          x: centerX.value,
          y: centerY.value + serviceLineDistance.value,
          label: 'SCL',
          collected: collected.has('service-center-left'),
        },
        {
          id: 'service-center-right',
          x: centerX.value,
          y: centerY.value - serviceLineDistance.value,
          label: 'SCR',
          collected: collected.has('service-center-right'),
        }
      );
      break;

    case 'service-courts':
      points.push(
        {
          id: 'baseline-left',
          x: courtX.value,
          y: courtY.value + courtLength.value,
          label: 'BL',
          collected: collected.has('baseline-left'),
        },
        {
          id: 'baseline-right',
          x: courtX.value + courtWidth.value,
          y: courtY.value + courtLength.value,
          label: 'BR',
          collected: collected.has('baseline-right'),
        }
      );
      break;

    case 'minimal':
      points.push(
        {
          id: 'net-left',
          x: courtX.value,
          y: centerY.value,
          label: 'NL',
          collected: collected.has('net-left'),
        },
        {
          id: 'net-right',
          x: courtX.value + courtWidth.value,
          y: centerY.value,
          label: 'NR',
          collected: collected.has('net-right'),
        }
      );
      break;
  }

  return points;
});

// Camera position in SVG coordinates
const cameraPosition = computed(() => {
  if (!props.cameraSettings?.position) return null;

  // Convert normalized camera position (0-1) to SVG coordinates
  const x = courtX.value + props.cameraSettings.position.x * courtWidth.value;
  const y = courtY.value + props.cameraSettings.position.y * courtLength.value;

  return { x, y };
});

// Camera view cone path
const cameraViewCone = computed(() => {
  if (!cameraPosition.value) return '';

  const viewAngle = props.cameraSettings?.viewAngle || 0;
  const viewDistance = 100; // pixels
  const coneAngle = Math.PI / 4; // 45 degrees cone

  const x = cameraPosition.value.x;
  const y = cameraPosition.value.y;

  // Calculate cone endpoints
  const x1 = x + viewDistance * Math.cos(viewAngle - coneAngle);
  const y1 = y + viewDistance * Math.sin(viewAngle - coneAngle);
  const x2 = x + viewDistance * Math.cos(viewAngle + coneAngle);
  const y2 = y + viewDistance * Math.sin(viewAngle + coneAngle);

  return `M ${x} ${y} L ${x1} ${y1} L ${x2} ${y2} Z`;
});

// Slightly reduced visual properties for more compact display
const pointRadius = 5;
const fontSize = 8;

// Mode label
const modeLabel = computed(() => {
  const modeNames: Record<string, string> = {
    'full-court': 'Full Court Calibration',
    'half-court': 'Half Court Calibration',
    'service-courts': 'Service Courts Focus',
    minimal: 'Minimal Calibration',
  };
  return modeNames[props.calibrationMode] || 'Court Calibration';
});

// Court dimensions label
const courtDimensionsLabel = computed(() => {
  const courtName = props.courtType === 'badminton' ? 'Badminton' : 'Tennis';
  return `${courtName} Court: ${props.courtDimensions.length}m × ${props.courtDimensions.width}m`;
});
</script>

<style scoped>
.court-visualization {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.5rem;
  box-shadow: inset 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

/* Pulsing animation for next point */
@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.pulse-point {
  animation: pulse 2s ease-in-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}

.pulse-ring {
  animation: pulse-ring 2s ease-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}

.pulse-ring-delayed {
  animation: pulse-ring 2s ease-out infinite;
  animation-delay: 1s;
  transform-origin: center;
  transform-box: fill-box;
}
</style>
