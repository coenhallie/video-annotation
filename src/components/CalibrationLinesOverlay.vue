<template>
  <Transition name="fade">
    <svg
      v-if="show && lines.length > 0"
      class="calibration-lines-overlay"
      :viewBox="`0 0 ${videoDisplayArea.width} ${videoDisplayArea.height}`"
      preserveAspectRatio="none"
      :style="{
        left: `${videoDisplayArea.x}px`,
        top: `${videoDisplayArea.y}px`,
        width: `${videoDisplayArea.width}px`,
        height: `${videoDisplayArea.height}px`,
      }"
    >
      <!-- Draw each calibration line with animation -->
      <g v-for="(line, index) in scaledLines" :key="`line-${index}`">
        <line
          v-if="line && line.start && line.end"
          :x1="line.start.x"
          :y1="line.start.y"
          :x2="line.end.x"
          :y2="line.end.y"
          :stroke="line.color || getLineColor(index)"
          stroke-width="3"
          stroke-linecap="round"
          :opacity="lineOpacity"
          class="calibration-line"
          :style="{
            animationDelay: `${index * 0.2}s`,
          }"
        />

        <!-- Add labels for each line -->
        <text
          v-if="showLabels && line && line.start && line.end"
          :x="(line.start.x + line.end.x) / 2"
          :y="(line.start.y + line.end.y) / 2 - 10"
          :fill="line.color || getLineColor(index)"
          font-size="14"
          font-weight="bold"
          text-anchor="middle"
          :opacity="lineOpacity"
          class="line-label"
          :style="{
            animationDelay: `${index * 0.2 + 0.1}s`,
          }"
        >
          {{ getLineName(index) }}
        </text>

        <!-- Add end point indicators -->
        <circle
          v-if="showEndPoints && line && line.start && line.end"
          :cx="line.start.x"
          :cy="line.start.y"
          r="6"
          :fill="line.color || getLineColor(index)"
          :opacity="lineOpacity * 0.8"
          class="line-endpoint"
          :style="{
            animationDelay: `${index * 0.2}s`,
          }"
        />
        <circle
          v-if="showEndPoints && line && line.start && line.end"
          :cx="line.end.x"
          :cy="line.end.y"
          r="6"
          :fill="line.color || getLineColor(index)"
          :opacity="lineOpacity * 0.8"
          class="line-endpoint"
          :style="{
            animationDelay: `${index * 0.2}s`,
          }"
        />
      </g>

      <!-- Success message -->
      <g v-if="showSuccessMessage" class="success-message-group">
        <rect
          x="50%"
          y="20"
          width="300"
          height="60"
          rx="10"
          fill="rgba(34, 197, 94, 0.95)"
          transform="translate(-150, 0)"
        />
        <text
          x="50%"
          y="50"
          fill="white"
          font-size="18"
          font-weight="bold"
          text-anchor="middle"
          class="success-text"
        >
          ✓ Calibration Applied
        </text>
        <text
          x="50%"
          y="70"
          fill="white"
          font-size="14"
          text-anchor="middle"
          opacity="0.9"
        >
          Court lines detected successfully
        </text>
      </g>
    </svg>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import {
  calculateVideoDisplayArea,
  convertVideoToDisplayCoordinates,
} from '../utils/videoDisplayArea';
import type { VideoDisplayArea } from '../utils/videoDisplayArea';

interface CalibrationLine {
  start: { x: number; y: number };
  end: { x: number; y: number };
  color?: string;
  name?: string;
  videoDimensions?: { width: number; height: number };
}

interface Props {
  show: boolean;
  lines: CalibrationLine[];
  videoElement?: HTMLVideoElement;
  videoContainer?: HTMLElement;
  videoWidth?: number;
  videoHeight?: number;
  duration?: number; // How long to show the overlay (in ms)
  showLabels?: boolean;
  showEndPoints?: boolean;
  showSuccessMessage?: boolean;
  fadeOut?: boolean; // Whether to fade out gradually
}

const props = withDefaults(defineProps<Props>(), {
  videoWidth: 1920,
  videoHeight: 1080,
  duration: 3000,
  showLabels: true,
  showEndPoints: true,
  showSuccessMessage: true,
  fadeOut: true,
});

const emit = defineEmits<{
  'overlay-hidden': [];
}>();

const lineOpacity = ref(1);
let fadeTimer: number | null = null;
let hideTimer: number | null = null;

const lineNames = ['Back Boundary', 'Center Line', 'Service Line'];
const lineColors = ['#3b82f6', '#22c55e', '#ef4444'];

// Calculate video display area with proper page positioning
const videoDisplayArea = computed((): VideoDisplayArea => {
  if (props.videoElement && props.videoContainer) {
    // Get the actual display area relative to the container
    const displayArea = calculateVideoDisplayArea(
      props.videoElement,
      props.videoContainer
    );

    // Get the container's position on the page for absolute positioning
    const containerRect = props.videoContainer.getBoundingClientRect();

    // Adjust the display area to be relative to the page, not the container
    const pageRelativeArea = {
      ...displayArea,
      x: containerRect.left + displayArea.x,
      y: containerRect.top + displayArea.y,
    };

    console.log(
      'CalibrationLinesOverlay - Video display area (page-relative):',
      pageRelativeArea
    );
    console.log('CalibrationLinesOverlay - Container position:', {
      left: containerRect.left,
      top: containerRect.top,
    });
    console.log('CalibrationLinesOverlay - Video natural dimensions:', {
      width: props.videoElement.videoWidth,
      height: props.videoElement.videoHeight,
    });

    return pageRelativeArea;
  }
  // Fallback to full video dimensions
  console.log('CalibrationLinesOverlay - Using fallback dimensions');
  return {
    x: 0,
    y: 0,
    width: props.videoWidth,
    height: props.videoHeight,
    scaleX: 1,
    scaleY: 1,
  };
});

// Convert normalized coordinates (0-1 range) to display coordinates
const scaledLines = computed(() => {
  return props.lines
    .map((line) => {
      if (!line || !line.start || !line.end) return null;

      // Check if coordinates are already normalized (values between 0 and 1)
      const isNormalized =
        line.start.x <= 1 &&
        line.start.y <= 1 &&
        line.end.x <= 1 &&
        line.end.y <= 1;

      if (isNormalized) {
        // Scale normalized coordinates to display area dimensions
        return {
          ...line,
          start: {
            x: line.start.x * videoDisplayArea.value.width,
            y: line.start.y * videoDisplayArea.value.height,
          },
          end: {
            x: line.end.x * videoDisplayArea.value.width,
            y: line.end.y * videoDisplayArea.value.height,
          },
        };
      } else {
        // Legacy support: if coordinates are in pixel values, scale them appropriately
        const videoWidth =
          line.videoDimensions?.width || props.videoWidth || 1920;
        const videoHeight =
          line.videoDimensions?.height || props.videoHeight || 1080;

        // Convert to normalized first, then scale to display area
        return {
          ...line,
          start: {
            x: (line.start.x / videoWidth) * videoDisplayArea.value.width,
            y: (line.start.y / videoHeight) * videoDisplayArea.value.height,
          },
          end: {
            x: (line.end.x / videoWidth) * videoDisplayArea.value.width,
            y: (line.end.y / videoHeight) * videoDisplayArea.value.height,
          },
        };
      }
    })
    .filter((line) => line !== null);
});

// Convert video coordinates to display coordinates for SVG
const convertVideoToDisplay = (
  videoX: number,
  videoY: number
): { x: number; y: number } => {
  return convertVideoToDisplayCoordinates(
    videoX,
    videoY,
    videoDisplayArea.value
  );
};

const convertVideoToDisplayX = (videoX: number): number => {
  // For backward compatibility, we need to get the Y coordinate from somewhere
  // Since this is used in template, we'll use 0 as default Y and just return X
  return convertVideoToDisplayCoordinates(videoX, 0, videoDisplayArea.value).x;
};

const convertVideoToDisplayY = (videoY: number): number => {
  // For backward compatibility, we need to get the X coordinate from somewhere
  // Since this is used in template, we'll use 0 as default X and just return Y
  return convertVideoToDisplayCoordinates(0, videoY, videoDisplayArea.value).y;
};

const getLineName = (index: number): string => {
  return lineNames[index] || `Line ${index + 1}`;
};

const getLineColor = (index: number): string => {
  return lineColors[index] || '#ffffff';
};

// Watch for show changes
watch(
  () => props.show,
  (newShow) => {
    if (newShow) {
      // Reset opacity when showing
      lineOpacity.value = 1;

      // Clear any existing timers
      if (fadeTimer) {
        clearTimeout(fadeTimer);
        fadeTimer = null;
      }
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }

      // Start fade out if enabled
      if (props.fadeOut && props.duration > 0) {
        // Start fading after 2/3 of the duration
        const fadeDelay = (props.duration * 2) / 3;
        fadeTimer = window.setTimeout(() => {
          // Gradually reduce opacity
          const fadeSteps = 10;
          const fadeInterval = props.duration / 3 / fadeSteps;
          let currentStep = 0;

          const fadeIntervalId = setInterval(() => {
            currentStep++;
            lineOpacity.value = 1 - currentStep / fadeSteps;

            if (currentStep >= fadeSteps) {
              clearInterval(fadeIntervalId);
              emit('overlay-hidden');
            }
          }, fadeInterval);
        }, fadeDelay);
      } else if (props.duration > 0) {
        // Just hide after duration without fading
        hideTimer = window.setTimeout(() => {
          emit('overlay-hidden');
        }, props.duration);
      }
    } else {
      // Clear timers when hiding
      if (fadeTimer) {
        clearTimeout(fadeTimer);
        fadeTimer = null;
      }
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }
  },
  { immediate: true }
);

// Cleanup on unmount
onMounted(() => {
  return () => {
    if (fadeTimer) clearTimeout(fadeTimer);
    if (hideTimer) clearTimeout(hideTimer);
  };
});
</script>

<style scoped>
.calibration-lines-overlay {
  position: fixed; /* Use fixed positioning to align with page coordinates */
  pointer-events: none;
  z-index: 100;
}

.calibration-line {
  animation: drawLine 0.8s ease-out forwards;
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.5));
}

.line-endpoint {
  animation: fadeInScale 0.5s ease-out forwards;
  transform-origin: center;
}

.line-label {
  animation: fadeIn 0.5s ease-out forwards;
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
  user-select: none;
}

.success-message-group {
  animation: slideDown 0.5s ease-out forwards;
}

.success-text {
  animation: fadeIn 0.8s ease-out forwards;
}

/* Animations */
@keyframes drawLine {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: scale(0);
  }
  to {
    opacity: 0.8;
    transform: scale(1);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideDown {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Transition for the entire overlay */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Pulse animation for success state */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.calibration-line.success {
  animation: drawLine 0.8s ease-out forwards, pulse 2s ease-in-out infinite;
}
</style>
