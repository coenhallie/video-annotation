<template>
  <Transition name="fade">
    <svg
      v-if="show && lines.length > 0"
      class="calibration-lines-overlay"
      :viewBox="expandedViewBox"
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
          stroke-width="5"
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
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
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
  displayDimensions?: { width: number; height: number };
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

// Calculate video display area with proper positioning
const videoDisplayArea = computed((): VideoDisplayArea => {
  console.log('🔍 [CalibrationLinesOverlay] Computing video display area...');
  console.log('🔍 [CalibrationLinesOverlay] Props check:', {
    hasVideoElement: !!props.videoElement,
    hasVideoContainer: !!props.videoContainer,
    show: props.show,
    linesCount: props.lines?.length || 0,
  });

  if (!props.videoElement) {
    console.error(
      '❌ [CalibrationLinesOverlay] Video element is null/undefined'
    );
  } else {
    console.log('✅ [CalibrationLinesOverlay] Video element details:', {
      tagName: props.videoElement.tagName,
      videoWidth: props.videoElement.videoWidth,
      videoHeight: props.videoElement.videoHeight,
      clientWidth: props.videoElement.clientWidth,
      clientHeight: props.videoElement.clientHeight,
    });
  }

  if (!props.videoContainer) {
    console.error(
      '❌ [CalibrationLinesOverlay] Video container is null/undefined'
    );
  } else {
    console.log('✅ [CalibrationLinesOverlay] Video container details:', {
      tagName: props.videoContainer.tagName,
      className: props.videoContainer.className,
      clientWidth: props.videoContainer.clientWidth,
      clientHeight: props.videoContainer.clientHeight,
    });
  }

  if (props.videoElement && props.videoContainer) {
    // Get the actual display area relative to the container
    const displayArea = calculateVideoDisplayArea(
      props.videoElement,
      props.videoContainer
    );

    // Get the container's position on the page
    const containerRect = props.videoContainer.getBoundingClientRect();

    // FIXED: Since the overlay wrapper is positioned fixed at page level,
    // we need to use page-relative coordinates for the SVG positioning
    const pageRelativeArea = {
      ...displayArea,
      x: containerRect.left + displayArea.x,
      y: containerRect.top + displayArea.y,
    };

    console.log(
      '🔍 [CalibrationLinesOverlay] Video display area (page-relative):',
      pageRelativeArea
    );
    console.log('🔍 [CalibrationLinesOverlay] Container position:', {
      left: containerRect.left,
      top: containerRect.top,
      width: containerRect.width,
      height: containerRect.height,
    });
    console.log('🔍 [CalibrationLinesOverlay] Video natural dimensions:', {
      width: props.videoElement.videoWidth,
      height: props.videoElement.videoHeight,
    });
    console.log('🔍 [CalibrationLinesOverlay] Display area calculation:', {
      displayArea,
      containerRect: {
        left: containerRect.left,
        top: containerRect.top,
        width: containerRect.width,
        height: containerRect.height,
      },
      pageRelativeArea,
    });

    return pageRelativeArea;
  }
  // Fallback to full container dimensions
  console.error(
    '❌ [CalibrationLinesOverlay] Using fallback dimensions - missing video element or container'
  );
  return {
    x: 0,
    y: 0,
    width: props.videoWidth,
    height: props.videoHeight,
    scaleX: 1,
    scaleY: 1,
  };
});

// Convert normalized coordinates from CalibrationModal to display coordinates
const scaledLines = computed(() => {
  console.log('🔍 [CalibrationLinesOverlay] Computing scaled lines...');
  console.log('🔍 [CalibrationLinesOverlay] Input lines:', props.lines);
  console.log(
    '🔍 [CalibrationLinesOverlay] Lines count:',
    props.lines?.length || 0
  );

  if (!props.lines || props.lines.length === 0) {
    console.error('❌ [CalibrationLinesOverlay] No lines to scale');
    return [];
  }

  const currentDisplayArea = videoDisplayArea.value;

  return props.lines
    .map((line, index) => {
      if (!line || !line.start || !line.end) {
        console.error(
          `❌ [CalibrationLinesOverlay] Line ${index} is invalid:`,
          line
        );
        return null;
      }

      // Check if coordinates are normalized (0-1 range)
      const isNormalized =
        line.start.x <= 1 &&
        line.start.y <= 1 &&
        line.end.x <= 1 &&
        line.end.y <= 1;

      console.log(`🔍 [CalibrationLinesOverlay] Line ${index} analysis:`, {
        index,
        isNormalized,
        line: {
          start: { x: line.start.x, y: line.start.y },
          end: { x: line.end.x, y: line.end.y },
          color: line.color,
          name: line.name,
        },
        displayDimensions: line.displayDimensions,
        videoDimensions: line.videoDimensions,
        currentDisplayArea: {
          width: currentDisplayArea.width,
          height: currentDisplayArea.height,
          x: currentDisplayArea.x,
          y: currentDisplayArea.y,
        },
      });

      const sourceVideoWidth =
        line.videoDimensions?.width ||
        props.videoElement?.videoWidth ||
        props.videoWidth ||
        currentDisplayArea.width;
      const sourceVideoHeight =
        line.videoDimensions?.height ||
        props.videoElement?.videoHeight ||
        props.videoHeight ||
        currentDisplayArea.height;

      const sourceDisplayWidth = line.displayDimensions?.width || null;
      const sourceDisplayHeight = line.displayDimensions?.height || null;

      const maxRatioX =
        sourceDisplayWidth && sourceDisplayWidth > 0
          ? sourceVideoWidth / sourceDisplayWidth
          : null;
      const maxRatioY =
        sourceDisplayHeight && sourceDisplayHeight > 0
          ? sourceVideoHeight / sourceDisplayHeight
          : null;

      const tolerance = 0.02;
      const looksLikeDisplayRatio =
        !isNormalized &&
        maxRatioX !== null &&
        maxRatioY !== null &&
        line.start.x >= 0 &&
        line.end.x >= 0 &&
        line.start.y >= 0 &&
        line.end.y >= 0 &&
        line.start.x <= maxRatioX + tolerance &&
        line.end.x <= maxRatioX + tolerance &&
        line.start.y <= maxRatioY + tolerance &&
        line.end.y <= maxRatioY + tolerance;

      const convertFromVideoPixels = (
        videoX: number,
        videoY: number
      ): { x: number; y: number } => ({
        x: (videoX / sourceVideoWidth) * currentDisplayArea.width,
        y: (videoY / sourceVideoHeight) * currentDisplayArea.height,
      });

      let start;
      let end;

      if (isNormalized) {
        start = {
          x: line.start.x * currentDisplayArea.width,
          y: line.start.y * currentDisplayArea.height,
        };
        end = {
          x: line.end.x * currentDisplayArea.width,
          y: line.end.y * currentDisplayArea.height,
        };
      } else if (looksLikeDisplayRatio && sourceDisplayWidth && sourceDisplayHeight) {
        const startVideo = {
          x: line.start.x * sourceDisplayWidth,
          y: line.start.y * sourceDisplayHeight,
        };
        const endVideo = {
          x: line.end.x * sourceDisplayWidth,
          y: line.end.y * sourceDisplayHeight,
        };
        start = convertFromVideoPixels(startVideo.x, startVideo.y);
        end = convertFromVideoPixels(endVideo.x, endVideo.y);
      } else {
        start = convertFromVideoPixels(line.start.x, line.start.y);
        end = convertFromVideoPixels(line.end.x, line.end.y);
      }

      const scaledLine = {
        ...line,
        start,
        end,
      };

      console.log(`✅ [CalibrationLinesOverlay] Line ${index} scaled:`, {
        original: {
          start: { x: line.start.x, y: line.start.y },
          end: { x: line.end.x, y: line.end.y },
        },
        scaled: {
          start: { x: scaledLine.start.x, y: scaledLine.start.y },
          end: { x: scaledLine.end.x, y: scaledLine.end.y },
        },
        displayArea: {
          width: currentDisplayArea.width,
          height: currentDisplayArea.height,
        },
        sourceDimensions: {
          width: sourceVideoWidth,
          height: sourceVideoHeight,
        },
      });

      return scaledLine;
    })
    .filter((line) => line !== null);
});

// Simple viewBox that matches the video display area exactly
const expandedViewBox = computed(() => {
  // Use exact video display area dimensions without padding
  // This ensures 1:1 coordinate mapping
  return `0 0 ${videoDisplayArea.value.width} ${videoDisplayArea.value.height}`;
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
    console.log('🔵 [CalibrationLinesOverlay] Show prop changed:', newShow);
    console.log('🔵 [CalibrationLinesOverlay] Current state:', {
      show: props.show,
      linesCount: props.lines.length,
      hasVideoElement: !!props.videoElement,
      hasVideoContainer: !!props.videoContainer,
      videoWidth: props.videoWidth,
      videoHeight: props.videoHeight,
      duration: props.duration,
      fadeOut: props.fadeOut,
    });

    if (newShow) {
      console.log('✅ [CalibrationLinesOverlay] Showing overlay');
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
        console.log(
          `⏱️ [CalibrationLinesOverlay] Setting fade timer for ${fadeDelay}ms`
        );
        fadeTimer = window.setTimeout(() => {
          console.log('🎨 [CalibrationLinesOverlay] Starting fade animation');
          // Gradually reduce opacity
          const fadeSteps = 10;
          const fadeInterval = props.duration / 3 / fadeSteps;
          let currentStep = 0;

          const fadeIntervalId = setInterval(() => {
            currentStep++;
            lineOpacity.value = 1 - currentStep / fadeSteps;

            if (currentStep >= fadeSteps) {
              clearInterval(fadeIntervalId);
              console.log(
                '📤 [CalibrationLinesOverlay] Fade complete, emitting overlay-hidden'
              );
              emit('overlay-hidden');
            }
          }, fadeInterval);
        }, fadeDelay);
      } else if (props.duration > 0) {
        // Just hide after duration without fading
        console.log(
          `⏱️ [CalibrationLinesOverlay] Setting hide timer for ${props.duration}ms`
        );
        hideTimer = window.setTimeout(() => {
          console.log(
            '📤 [CalibrationLinesOverlay] Timer complete, emitting overlay-hidden'
          );
          emit('overlay-hidden');
        }, props.duration);
      }
    } else {
      console.log('🔴 [CalibrationLinesOverlay] Hiding overlay');
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

// Watch for lines changes
watch(
  () => props.lines,
  (newLines) => {
    console.log('🔵 [CalibrationLinesOverlay] Lines prop changed:', newLines);
    console.log('🔵 [CalibrationLinesOverlay] Lines details:', {
      count: newLines.length,
      hasNormalizedCoords: newLines.every(
        (line: any) =>
          line.start &&
          line.end &&
          typeof line.start.x === 'number' &&
          typeof line.start.y === 'number'
      ),
      lines: newLines.map((line: any, i: number) => ({
        index: i,
        name: line.name,
        color: line.color,
        start: line.start,
        end: line.end,
        hasVideoDimensions: !!line.videoDimensions,
      })),
    });
  },
  { deep: true }
);

// Watch video element
watch(
  () => props.videoElement,
  (newElement) => {
    console.log('🔵 [CalibrationLinesOverlay] Video element changed:', {
      hasElement: !!newElement,
      elementDetails: newElement
        ? {
            tagName: newElement.tagName,
            videoWidth: newElement.videoWidth,
            videoHeight: newElement.videoHeight,
            clientWidth: newElement.clientWidth,
            clientHeight: newElement.clientHeight,
            readyState: newElement.readyState,
          }
        : null,
    });
  }
);

// Watch video container
watch(
  () => props.videoContainer,
  (newContainer) => {
    console.log('🔵 [CalibrationLinesOverlay] Video container changed:', {
      hasContainer: !!newContainer,
      containerDetails: newContainer
        ? {
            tagName: newContainer.tagName,
            className: newContainer.className,
            clientWidth: newContainer.clientWidth,
            clientHeight: newContainer.clientHeight,
          }
        : null,
    });
  }
);

// Lifecycle hooks
onMounted(() => {
  console.log('🎬 [CalibrationLinesOverlay] Component mounted');
  console.log('🎬 [CalibrationLinesOverlay] Mount state:', {
    show: props.show,
    linesCount: props.lines.length,
    lines: props.lines,
    hasVideoElement: !!props.videoElement,
    hasVideoContainer: !!props.videoContainer,
    videoElementDetails: props.videoElement
      ? {
          tagName: props.videoElement.tagName,
          videoWidth: props.videoElement.videoWidth,
          videoHeight: props.videoElement.videoHeight,
        }
      : null,
    videoContainerDetails: props.videoContainer
      ? {
          tagName: props.videoContainer.tagName,
          clientWidth: props.videoContainer.clientWidth,
          clientHeight: props.videoContainer.clientHeight,
        }
      : null,
  });

  if (props.show && props.lines.length > 0) {
    console.log('✅ [CalibrationLinesOverlay] Starting overlay on mount');
    // The watch with immediate: true should handle this, but let's log it
  } else {
    console.log('⚠️ [CalibrationLinesOverlay] Not showing overlay on mount:', {
      show: props.show,
      linesCount: props.lines.length,
    });
  }
});

onUnmounted(() => {
  console.log('💀 [CalibrationLinesOverlay] Component unmounting');
  if (fadeTimer) {
    clearTimeout(fadeTimer);
    fadeTimer = null;
  }
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
});
</script>

<style scoped>
.calibration-lines-overlay {
  position: absolute; /* Use absolute positioning within the fixed wrapper */
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
