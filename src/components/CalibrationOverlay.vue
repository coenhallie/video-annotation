<template>
  <div v-show="isCalibrating" class="calibration-overlay">
    <!-- Canvas overlay that directly overlays the video (only show for court points step) -->
    <canvas
      v-if="currentStep === 'court-points'"
      ref="calibrationCanvas"
      class="calibration-canvas"
      :width="canvasWidth"
      :height="canvasHeight"
      @click="handleCanvasClick"
      @mousemove="handleMouseMove"
    />

    <!-- Instructions Panel -->
    <div
      ref="calibrationPanelRef"
      class="calibration-panel"
      :style="{ top: `${panelPosition.y}px`, left: `${panelPosition.x}px` }"
    >
      <div class="panel-header" @mousedown="startDrag">
        <h3>Camera Calibration</h3>
        <div
          class="calibration-quality"
          v-if="calibrationQuality && currentStep === 'court-points'"
        >
          <span
            :class="['quality-badge', `quality-${calibrationQuality.level}`]"
          >
            {{ calibrationQuality.message }}
          </span>
        </div>
      </div>

      <!-- Stepper Navigation -->
      <div class="stepper-navigation">
        <div class="stepper-steps">
          <div
            :class="[
              'step',
              {
                active: currentStep === 'camera-position',
                completed: cameraSettings !== null,
              },
            ]"
          >
            <span class="step-number">1</span>
            <span class="step-label">Camera Position</span>
          </div>
          <div
            class="step-connector"
            :class="{ completed: cameraSettings !== null }"
          ></div>
          <div
            :class="[
              'step',
              {
                active: currentStep === 'court-points',
                completed: isCalibrated,
              },
            ]"
          >
            <span class="step-number">2</span>
            <span class="step-label">Court Points</span>
          </div>
        </div>
      </div>

      <!-- Step 1: Camera Position Selection -->
      <div
        v-if="currentStep === 'camera-position'"
        class="camera-position-step"
      >
        <div class="step-instructions">
          <h4>Step 1: Set Camera Position</h4>
          <p>
            Click on the court diagram to indicate where your camera is
            positioned. This helps improve calibration accuracy by 50-75%.
          </p>
        </div>

        <CameraPositionSelector
          v-if="!cameraSettings"
          @update:model-value="cameraSettings = $event"
          :show-calibration-points="false"
          class="camera-selector-container"
        />
        <CameraPositionSelector
          v-else
          :model-value="cameraSettings"
          @update:model-value="cameraSettings = $event"
          :show-calibration-points="false"
          class="camera-selector-container"
        />

        <div class="camera-position-benefits">
          <div class="benefit-header">
            <svg
              fill="currentColor"
              viewBox="0 0 20 20"
              style="width: 0.875rem; height: 0.875rem; color: #3b82f6"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clip-rule="evenodd"
              />
            </svg>
            <span style="font-weight: 500; color: #1d4ed8"
              >Why Camera Position Matters:</span
            >
          </div>
          <ul class="benefit-list">
            <li>Improves height estimation for 3D tracking</li>
            <li>Better perspective correction</li>
            <li>More accurate speed calculations</li>
            <li>Better depth perception</li>
          </ul>
        </div>

        <div class="step-actions">
          <button @click="skipCameraPosition" class="btn-secondary">
            Skip (Less Accurate)
          </button>
          <button
            @click="proceedToCourtPoints"
            :disabled="!cameraSettings"
            class="btn-primary"
          >
            Next: Court Points
            <svg
              class="w-4 h-4 ml-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Step 2: Court Points Calibration (existing content) -->
      <div v-if="currentStep === 'court-points'">
        <!-- Calibration Mode Selector -->
        <div class="mode-selector">
          <label
            class="block mb-1"
            style="font-size: 0.7rem; font-weight: 500; color: #374151"
          >
            Calibration Mode:
          </label>
          <div class="mode-grid">
            <button
              v-for="mode in calibrationModes"
              :key="mode.id"
              @click="selectMode(mode.id)"
              :class="['mode-button', { active: currentMode?.id === mode.id }]"
              :title="mode.description"
            >
              <span class="mode-name">{{ mode.name }}</span>
              <span class="mode-points">{{ mode.minPoints }} points</span>
            </button>
          </div>
        </div>

        <!-- Current Point Instructions -->
        <div class="point-instructions">
          <div class="instruction-header">
            <span style="font-weight: 500">Next Point:</span>
            <span class="point-counter" style="font-size: 0.625rem">
              {{ collectedPoints.length }} / {{ totalPointsToCollect }}
              <span
                v-if="isCollectingOptionalPoints"
                style="font-size: 0.5rem; color: #6b7280; margin-left: 0.125rem"
              >
                (optional)
              </span>
            </span>
          </div>

          <div class="current-point-info">
            <div class="point-name">
              {{ getPointDescription(nextPoint) }}
              <span
                v-if="isNextPointOptional"
                style="font-size: 0.5rem; color: #3b82f6; margin-left: 0.25rem"
              >
                (Optional - improves accuracy)
              </span>
            </div>
            <div class="point-hint">{{ getPointHint(nextPoint) }}</div>
          </div>

          <!-- Dynamic Court Visualization -->
          <div ref="visualGuideContainer" class="visual-guide-compact">
            <CourtVisualization
              :calibration-mode="currentMode?.id || 'full-court'"
              :court-type="courtType"
              :court-dimensions="courtDimensions"
              :show-calibration-points="true"
              :collected-points="collectedPointIds"
              :next-point="nextPoint"
              :show-camera-position="false"
              :width="visualGuideDimensions.width"
              :height="visualGuideDimensions.height"
            />
          </div>
        </div>

        <!-- Collected Points List -->
        <div class="collected-points" v-if="collectedPoints.length > 0">
          <div class="points-header">
            <span style="font-weight: 500">Collected Points:</span>
            <button
              @click="undoLastPoint"
              class="undo-button"
              v-if="collectedPoints.length > 0"
            >
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style="width: 0.75rem; height: 0.75rem"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                />
              </svg>
              Undo
            </button>
          </div>

          <div class="points-list">
            <div
              v-for="(point, index) in collectedPoints"
              :key="point.id"
              class="point-item"
            >
              <span class="point-index">{{ index + 1 }}</span>
              <span class="point-label">{{
                getPointDescription(point.id)
              }}</span>
              <span
                class="point-confidence"
                :style="{ opacity: point.confidence }"
              >
                {{ (point.confidence * 100).toFixed(0) }}%
              </span>
            </div>
          </div>
        </div>

        <!-- Validation Errors and Messages -->
        <div v-if="hasMessages" :class="getValidationClass()">
          <div class="error-header">
            <svg
              fill="currentColor"
              viewBox="0 0 20 20"
              style="width: 0.75rem; height: 0.75rem"
              :style="{ color: getValidationIconColor() }"
            >
              <path
                v-if="isSuccessMessage()"
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd"
              />
              <path
                v-else-if="isWarningMessage()"
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clip-rule="evenodd"
              />
              <path
                v-else
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            <span
              style="font-weight: 500"
              :style="{ color: getValidationTextColor() }"
            >
              {{ getValidationTitle() }}
            </span>
          </div>
          <ul class="error-list">
            <li v-for="(error, index) in displayErrors" :key="index">
              {{ error }}
            </li>
          </ul>
        </div>

        <!-- Calibration Results -->
        <div v-if="calibrationResult" class="calibration-results">
          <div class="results-header">
            <span style="font-weight: 500">Calibration Results:</span>
          </div>
          <div class="results-grid">
            <div class="result-item">
              <span class="result-label">Accuracy:</span>
              <span class="result-value">
                {{ calibrationResult.error.toFixed(1) }}px
              </span>
            </div>
            <div class="result-item">
              <span class="result-label">Confidence:</span>
              <span class="result-value">
                {{ (calibrationResult.confidence * 100).toFixed(0) }}%
              </span>
            </div>
            <div class="result-item">
              <span class="result-label">Inliers:</span>
              <span class="result-value">
                {{ calibrationResult.inliers.length }}/{{
                  collectedPoints.length
                }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button
          v-if="canCalibrate"
          @click="performCalibration"
          :class="isCollectingOptionalPoints ? 'btn-primary' : 'btn-primary'"
        >
          <svg
            class="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {{ isCollectingOptionalPoints ? 'Calibrate Now' : 'Calibrate' }}
        </button>

        <button
          v-if="isCalibrated"
          @click="confirmCalibration"
          class="btn-success"
        >
          <svg
            class="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
          Confirm
        </button>

        <button @click="resetCalibration" class="btn-secondary">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Reset
        </button>

        <button @click="cancelCalibration" class="btn-danger">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          Cancel
        </button>
      </div>

      <!-- Tips Section -->
      <div class="tips-section">
        <div class="tips-header">
          <svg
            fill="currentColor"
            viewBox="0 0 20 20"
            style="width: 0.75rem; height: 0.75rem; color: #3b82f6"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clip-rule="evenodd"
            />
          </svg>
          <span style="font-size: 0.5rem; font-weight: 500; color: #1d4ed8"
            >Tips:</span
          >
        </div>
        <ul class="tips-list">
          <li>Click precisely on court line intersections</li>
          <li>Zoom in for better accuracy</li>
          <li>Required points must be collected first</li>
          <li>Optional points improve accuracy but aren't necessary</li>
          <li>Aim for sub-10cm error for accurate speed calculations</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  useCameraCalibration,
  CALIBRATION_MODES,
} from '../composables/useCameraCalibration';
import CourtVisualization from './CourtVisualization.vue';
import CameraPositionSelector from './CameraPositionSelector.vue';
import type {
  Point2D,
  CalibrationPoint,
  CameraSettings,
} from '../composables/useCameraCalibration';

// Props
const props = defineProps<{
  videoElement: HTMLVideoElement | null;
  isActive: boolean;
}>();

// Emits
const emit = defineEmits<{
  'calibration-complete': [calibrationData: any];
  'calibration-cancelled': [];
}>();

// Camera calibration composable
const cameraCalibration = useCameraCalibration();

// State
const isCalibrating = ref(false);
const currentStep = ref<'camera-position' | 'court-points'>('camera-position');
const cameraSettings = ref<CameraSettings | null>(null);

// Initialize calibration state based on props
onMounted(() => {
  if (props.isActive) {
    isCalibrating.value = true;
    console.log('EnhancedCalibrationOverlay: Mounted with active state');
  }
});
const calibrationCanvas = ref<HTMLCanvasElement | null>(null);
const canvasWidth = ref(1920);
const canvasHeight = ref(1080);
const mousePosition = ref<Point2D | null>(null);
const collectedPoints = ref<CalibrationPoint[]>([]);
const hoveredPoint = ref<string | null>(null);
const courtType = ref<'badminton' | 'tennis'>('badminton');
const calibrationMessages = ref<string[]>([]);

// Draggable Panel State
const calibrationPanelRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const panelPosition = ref({ x: window.innerWidth - 340, y: 20 }); // Start on right side
const dragOffset = ref({ x: 0, y: 0 });

// Responsive visual guide
const visualGuideContainer = ref<HTMLElement | null>(null);
const visualGuideDimensions = ref({ width: 0, height: 0 });

onMounted(() => {
  if (visualGuideContainer.value) {
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        visualGuideDimensions.value = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
      }
    });

    resizeObserver.observe(visualGuideContainer.value);

    onUnmounted(() => {
      resizeObserver.disconnect();
    });
  }
});

// Court dimensions for visualization
const courtDimensions = computed(() => {
  if (courtType.value === 'badminton') {
    return {
      length: 13.4,
      width: 5.18, // Singles width
      serviceLineDistance: 1.98,
      centerLineLength: 4.72,
      netHeight: 1.55,
    };
  } else {
    return {
      length: 23.77,
      width: 8.23, // Singles width
      serviceLineDistance: 6.4,
      centerLineLength: 11.89,
      netHeight: 0.914,
    };
  }
});

// Collected point IDs for visualization
const collectedPointIds = computed(() => {
  // Ensure we're returning just the IDs as strings
  return collectedPoints.value.map((p) => {
    // Handle both simplified format and full CalibrationPoint format
    if (typeof p === 'object' && 'id' in p) {
      return p.id;
    }
    return p;
  });
});

// Function to update canvas dimensions to match video element
function updateCanvasDimensions() {
  // Only update canvas if we're on the court-points step
  if (
    !props.videoElement ||
    !calibrationCanvas.value ||
    currentStep.value !== 'court-points'
  )
    return;

  const video = props.videoElement;

  // Update canvas internal dimensions to match video's natural dimensions
  canvasWidth.value = video.videoWidth || 1920;
  canvasHeight.value = video.videoHeight || 1080;

  // Position canvas to match video element position
  const videoRect = video.getBoundingClientRect();
  const canvas = calibrationCanvas.value;

  // Apply the same position and size as the video element
  canvas.style.position = 'fixed';
  canvas.style.left = `${videoRect.left}px`;
  canvas.style.top = `${videoRect.top}px`;
  canvas.style.width = `${videoRect.width}px`;
  canvas.style.height = `${videoRect.height}px`;

  // Redraw canvas
  drawCanvas();
}

// Watch for video element changes to update canvas dimensions
watch(
  () => props.videoElement,
  (video) => {
    if (video) {
      // Wait for video metadata to load
      if (video.videoWidth && video.videoHeight) {
        updateCanvasDimensions();
      } else {
        video.addEventListener('loadedmetadata', updateCanvasDimensions, {
          once: true,
        });
      }
    }
  },
  { immediate: true }
);

// Step navigation functions
function skipCameraPosition() {
  console.log('Skipping camera position, proceeding to court points');
  currentStep.value = 'court-points';
  // Update canvas dimensions when switching to court points
  setTimeout(() => updateCanvasDimensions(), 100);
}

function proceedToCourtPoints() {
  if (cameraSettings.value) {
    console.log('Camera settings collected:', cameraSettings.value);
    currentStep.value = 'court-points';
    // Update canvas dimensions when switching to court points
    setTimeout(() => updateCanvasDimensions(), 100);
  }
}

// Watch for active state changes
watch(
  () => props.isActive,
  (active) => {
    console.log('EnhancedCalibrationOverlay: isActive changed to', active);
    if (active && props.videoElement) {
      isCalibrating.value = true;
      currentStep.value = 'camera-position'; // Start with camera position
      console.log('EnhancedCalibrationOverlay: Starting calibration');
      // Update canvas dimensions when calibration starts
      setTimeout(() => updateCanvasDimensions(), 100);
      // Add resize listener
      window.addEventListener('resize', updateCanvasDimensions);

      // Also observe video element position changes
      const resizeObserver = new ResizeObserver(() => {
        updateCanvasDimensions();
      });
      resizeObserver.observe(props.videoElement);

      // Store observer for cleanup
      (window as any).__calibrationResizeObserver = resizeObserver;
    } else if (!active) {
      isCalibrating.value = false;
      console.log('EnhancedCalibrationOverlay: Stopping calibration');
      // Remove resize listener
      window.removeEventListener('resize', updateCanvasDimensions);

      // Clean up resize observer
      const observer = (window as any).__calibrationResizeObserver;
      if (observer) {
        observer.disconnect();
        delete (window as any).__calibrationResizeObserver;
      }
    }
  },
  { immediate: true }
);

// Draggable Panel Logic
function startDrag(event: MouseEvent) {
  if (!calibrationPanelRef.value) return;
  isDragging.value = true;
  const rect = calibrationPanelRef.value.getBoundingClientRect();
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
}

function onDrag(event: MouseEvent) {
  if (!isDragging.value) return;
  panelPosition.value = {
    x: event.clientX - dragOffset.value.x,
    y: event.clientY - dragOffset.value.y,
  };
}

function stopDrag() {
  isDragging.value = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
}

// Computed
const calibrationModes = computed(() => CALIBRATION_MODES);
const currentMode = computed(() => cameraCalibration.currentMode.value);
const calibrationQuality = computed(
  () => cameraCalibration.calibrationQuality.value
);
const calibrationResult = computed(
  () => cameraCalibration.calibrationResult.value
);
const validationErrors = computed(
  () => cameraCalibration.validationErrors.value
);

const displayErrors = computed(() => {
  // Combine validation errors from composable and local calibration messages
  const allMessages = [...validationErrors.value, ...calibrationMessages.value];

  // Convert validation errors to display-friendly format
  return allMessages.map((error) => {
    // Replace cm with px in error messages
    if (error.includes('cm')) {
      return error.replace(/(\d+\.?\d*)\s*cm/g, (match, num) => {
        // If it's a large number that was incorrectly multiplied by 100, divide it back
        const value = parseFloat(num);
        if (value > 1000) {
          return `${(value / 100).toFixed(1)}px`;
        }
        return `${value}px`;
      });
    }
    return error;
  });
});

const hasMessages = computed(() => {
  return (
    validationErrors.value.length > 0 || calibrationMessages.value.length > 0
  );
});
const isCalibrated = computed(() => cameraCalibration.isCalibrated.value);

const nextPoint = computed(() => {
  // Get the next point based on current mode and collected points
  if (!currentMode.value) return null;

  const collected = new Set(collectedPointIds.value);

  // First, check required points
  for (const pointId of currentMode.value.requiredPoints) {
    if (!collected.has(pointId)) {
      return pointId;
    }
  }

  // Then check optional points if all required are collected
  for (const pointId of currentMode.value.optionalPoints) {
    if (!collected.has(pointId)) {
      return pointId;
    }
  }

  return null;
});

const canCalibrate = computed(() => {
  return collectedPoints.value.length >= (currentMode.value?.minPoints || 0);
});

const requiredPointsCount = computed(() => {
  return currentMode.value?.requiredPoints.length || 0;
});

const totalPointsToCollect = computed(() => {
  // Show total including optional points, but indicate when we're in optional territory
  return (
    (currentMode.value?.requiredPoints.length || 0) +
    (currentMode.value?.optionalPoints.length || 0)
  );
});

const isCollectingOptionalPoints = computed(() => {
  return collectedPoints.value.length >= requiredPointsCount.value;
});

const isNextPointOptional = computed(() => {
  if (!nextPoint.value || !currentMode.value) return false;
  return currentMode.value.optionalPoints.includes(nextPoint.value);
});

const getPointDescription = (pointId: string | null) => {
  if (!pointId) return 'All points collected';
  return cameraCalibration.getPointDescription(pointId);
};

const getPointHint = (pointId: string | null) => {
  if (!pointId) return '';
  return cameraCalibration.getPointHint(pointId);
};

// Canvas drawing logic
function drawCanvas() {
  const canvas = calibrationCanvas.value;
  const ctx = canvas?.getContext('2d');
  if (!ctx || !canvas) return;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw collected points
  collectedPoints.value.forEach((point) => {
    // Check if point has direct x,y coordinates (simplified format)
    // or if it's a full CalibrationPoint with image coordinates
    const x = 'x' in point ? point.x : point.image?.x;
    const y = 'y' in point ? point.y : point.image?.y;

    if (x !== undefined && y !== undefined && x !== null && y !== null) {
      ctx.beginPath();
      ctx.arc(x as number, y as number, 5, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(74, 222, 128, 0.8)';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // Draw crosshair at mouse position
  if (mousePosition.value) {
    const { x, y } = mousePosition.value;
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x + 15, y);
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x, y + 15);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// Event handlers
function handleCanvasClick(event: MouseEvent) {
  if (!props.videoElement || !calibrationCanvas.value) return;

  const rect = calibrationCanvas.value.getBoundingClientRect();
  const canvas = calibrationCanvas.value;

  // Scale mouse coordinates to canvas internal dimensions
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  if (nextPoint.value) {
    // Use simplified format for collected points in the component
    collectedPoints.value.push({
      id: nextPoint.value,
      x,
      y,
      confidence: 1, // Assume 100% confidence for manual clicks
    } as any);

    // Force recalculation of nextPoint by triggering reactivity
    collectedPoints.value = [...collectedPoints.value];
  }
}

function handleMouseMove(event: MouseEvent) {
  if (!props.videoElement || !calibrationCanvas.value) return;

  const rect = calibrationCanvas.value.getBoundingClientRect();
  const canvas = calibrationCanvas.value;

  // Scale mouse coordinates to canvas internal dimensions
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  mousePosition.value = { x, y };

  // Redraw canvas on mouse move for crosshair
  drawCanvas();
}

function selectMode(modeId: string) {
  cameraCalibration.setCalibrationMode(modeId);
  // Reset collected points when mode changes
  collectedPoints.value = [];
  // Reset calibration when mode changes
  cameraCalibration.resetCalibration();
}

function undoLastPoint() {
  collectedPoints.value.pop();
}

function performCalibration() {
  if (!canCalibrate.value) return;

  console.log('🎯 Starting calibration with points:', collectedPoints.value);

  // Clear previous calibration points in the composable
  cameraCalibration.resetCalibration();

  // Convert our simplified points to CalibrationPoints and add them
  collectedPoints.value.forEach((point: any) => {
    cameraCalibration.addCalibrationPoint(
      point.id,
      { x: point.x, y: point.y },
      point.confidence
    );
  });

  // Perform calibration
  const result = cameraCalibration.calibrateWithRANSAC();

  if (result) {
    console.log('✅ Calibration successful:', result);
    // The calibrationResult is already reactive and will update the UI
    // Clear previous messages
    calibrationMessages.value = [];

    // If calibration is successful with good accuracy
    if (result.error < 10) {
      calibrationMessages.value = [
        `✅ Calibration successful! Error: ${result.error.toFixed(1)}px`,
      ];
    } else if (result.error < 50) {
      calibrationMessages.value = [
        `⚠️ Calibration complete but accuracy could be improved. Error: ${result.error.toFixed(
          1
        )}px`,
      ];
    } else {
      calibrationMessages.value = [
        `⚠️ Calibration complete but accuracy is low. Error: ${result.error.toFixed(
          1
        )}px. Try clicking more precisely.`,
      ];
    }
  } else {
    console.error('❌ Calibration failed');
    calibrationMessages.value = [
      '❌ Calibration failed. Please try again with more accurate point selection.',
    ];
  }
}

function confirmCalibration() {
  if (isCalibrated.value) {
    emit('calibration-complete', calibrationResult.value);
    isCalibrating.value = false;
  }
}

function resetCalibration() {
  collectedPoints.value = [];
  calibrationMessages.value = [];
  cameraCalibration.resetCalibration();
}

function cancelCalibration() {
  emit('calibration-cancelled');
  isCalibrating.value = false;
}

// Helper functions for validation message styling
function isSuccessMessage() {
  const allMessages = [...validationErrors.value, ...calibrationMessages.value];
  return allMessages.some((error) => error.includes('✅'));
}

function isWarningMessage() {
  const allMessages = [...validationErrors.value, ...calibrationMessages.value];
  return allMessages.some((error) => error.includes('⚠️'));
}

function getValidationClass() {
  if (isSuccessMessage()) return 'validation-success';
  if (isWarningMessage()) return 'validation-warning';
  return 'validation-errors';
}

function getValidationIconColor() {
  if (isSuccessMessage()) return '#10b981';
  if (isWarningMessage()) return '#f59e0b';
  return '#ef4444';
}

function getValidationTextColor() {
  if (isSuccessMessage()) return '#065f46';
  if (isWarningMessage()) return '#92400e';
  return '#b91c1c';
}

function getValidationTitle() {
  if (isSuccessMessage()) return 'Calibration Status:';
  if (isWarningMessage()) return 'Calibration Warning:';
  return 'Issues Detected:';
}

// Watchers
watch(
  collectedPoints,
  () => {
    // Redraw canvas when points change
    drawCanvas();
    // Auto-validate after a short delay
    setTimeout(() => {
      if (collectedPoints.value.length > 1) {
        // Validation happens automatically when points are added
        cameraCalibration.validateCalibration();
      }
    }, 100);
  },
  { deep: true }
);
</script>

<style scoped>
.calibration-overlay {
  position: fixed; /* Changed from absolute to fixed to escape video container */
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999; /* Higher z-index to ensure it's above everything */
  pointer-events: none; /* Overlay doesn't capture clicks, only panel and canvas */
}

.calibration-canvas {
  position: fixed; /* Fixed to match overlay */
  pointer-events: auto; /* Canvas captures clicks for calibration */
  cursor: crosshair;
  z-index: 1; /* Below the panel but above video */
}

.calibration-panel {
  position: fixed; /* Fixed positioning for panel */
  top: 20px;
  right: 20px; /* Moved to right side to avoid overlapping video controls */
  width: 400px; /* Wider panel for better court visualization */
  max-height: calc(100vh - 40px);
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
  pointer-events: auto; /* Panel is interactive */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  font-size: 0.8rem; /* Slightly bigger base font size */
  z-index: 10; /* Above canvas */
}

.panel-header {
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid #e5e7eb;
  cursor: move;
  background-color: #f9fafb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  font-size: 1rem !important;
  margin: 0;
}

/* Stepper Navigation Styles */
.stepper-navigation {
  padding: 0.875rem;
  background-color: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.stepper-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
  opacity: 0.5;
}

.step.active {
  opacity: 1;
}

.step.completed {
  opacity: 0.9;
}

.step-number {
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 50%;
  background-color: #e5e7eb;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.775rem;
  font-weight: 600;
  border: 2px solid #e5e7eb;
  transition: all 0.2s ease;
}

.step.active .step-number {
  background-color: #3b82f6;
  color: white;
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}

.step.completed .step-number {
  background-color: #10b981;
  color: white;
  border-color: #10b981;
}

.step-label {
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 500;
  text-align: center;
  margin-top: 0.25rem;
  white-space: nowrap;
}

.step.active .step-label {
  color: #3b82f6;
  font-weight: 600;
}

.step.completed .step-label {
  color: #10b981;
}

.step-connector {
  width: 3rem;
  height: 2px;
  background-color: #e5e7eb;
  position: relative;
  transition: all 0.3s ease;
}

.step-connector.completed {
  background-color: #10b981;
}

.step-connector.completed::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, #10b981 0%, #10b981 100%);
  animation: fillConnector 0.5s ease-out;
}

@keyframes fillConnector {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}

/* Camera Position Step Styles */
.camera-position-step {
  padding: 0.875rem;
  overflow-y: auto;
  max-height: calc(100vh - 300px);
}

.step-instructions {
  margin-bottom: 1rem;
}

.step-instructions h4 {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 0.5rem 0;
}

.step-instructions p {
  font-size: 0.75rem;
  color: #4b5563;
  line-height: 1.4;
  margin: 0;
}

.camera-selector-container {
  margin: 1rem 0;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.75rem;
  background-color: #f9fafb;
}

.camera-position-benefits {
  background-color: #eff6ff;
  border: 1px solid #dbeafe;
  border-radius: 0.375rem;
  padding: 0.75rem;
  margin: 1rem 0;
}

.benefit-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
}

.benefit-list {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin: 0;
}

.benefit-list li {
  font-size: 0.7rem;
  color: #374151;
  line-height: 1.4;
  margin-bottom: 0.25rem;
}

.step-actions {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

.step-actions button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.step-actions .btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: #9ca3af;
}

.step-actions svg {
  width: 1rem;
  height: 1rem;
}

.point-instructions,
.collected-points,
.validation-errors,
.calibration-results,
.tips-section,
.mode-selector {
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid #e5e7eb;
}

.action-buttons {
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid #e5e7eb;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}

.mode-button {
  padding: 0.4rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  background-color: #fff;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  text-align: left;
}
.mode-button:hover {
  background-color: #f3f4f6;
  border-color: #9ca3af;
}
.mode-button.active {
  background-color: #e0f2fe;
  border-color: #3b82f6;
  font-weight: 600;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4);
}
.mode-name {
  display: block;
  font-size: 0.7rem;
}
.mode-points {
  display: block;
  font-size: 0.6rem;
  color: #6b7280;
}

.instruction-header,
.points-header,
.results-header,
.error-header,
.tips-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
  font-size: 0.7rem;
}

.current-point-info {
  background-color: #eef2ff;
  border-radius: 0.375rem;
  padding: 0.625rem;
}
.point-name {
  font-size: 0.875rem;
  font-weight: bold;
  color: #312e81;
}
.point-hint {
  font-size: 0.7rem;
  color: #4338ca;
  margin-top: 0.25rem;
}

.visual-guide-large {
  width: 100%;
  aspect-ratio: 4 / 3;
  margin-top: 1rem;
  margin-bottom: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: hidden;
  position: relative;
}

.visual-guide-compact {
  width: 100%;
  aspect-ratio: 2 / 3;
  max-height: 250px; /* Much bigger court visualization for better visibility */
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  overflow: hidden;
  position: relative;
  background-color: #f9fafb;
}

.points-list {
  max-height: 120px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 0.25rem;
}
.point-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.7rem;
}
.point-item:last-child {
  border-bottom: none;
}
.point-index {
  font-size: 0.6rem;
  color: #6b7280;
  width: 18px;
}
.point-label {
  flex-grow: 1;
  font-size: 0.7rem;
}
.point-confidence {
  font-size: 0.7rem;
  font-weight: 500;
  color: #374151;
}

.undo-button {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: #4b5563;
  background: none;
  border: none;
  cursor: pointer;
}

.undo-button svg {
  width: 0.875rem;
  height: 0.875rem;
}

.validation-errors {
  background-color: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
  font-size: 0.7rem;
}

.validation-success {
  background-color: #d1fae5;
  border-color: #6ee7b7;
  color: #065f46;
  font-size: 0.7rem;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid #e5e7eb;
}

.validation-warning {
  background-color: #fef3c7;
  border-color: #fbbf24;
  color: #92400e;
  font-size: 0.7rem;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid #e5e7eb;
}
.error-list {
  list-style-type: disc;
  padding-left: 1rem;
  font-size: 0.7rem;
}

.calibration-results {
  background-color: #dbeafe;
  font-size: 0.7rem;
}
.results-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.375rem;
}
.result-item {
  text-align: center;
}
.result-label {
  display: block;
  font-size: 0.6rem;
  color: #4b5563;
}
.result-value {
  font-weight: 600;
  font-size: 0.7rem;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  background-color: #f9fafb;
  padding: 0.625rem;
  border-top: 1px solid #e5e7eb;
}

.tips-section {
  background-color: #eff6ff;
  border-top: 1px solid #dbeafe;
}
.tips-list {
  list-style-type: disc;
  padding-left: 1rem;
  font-size: 0.6rem;
  color: #374151;
  line-height: 1.3;
}

.btn-primary,
.btn-success,
.btn-secondary,
.btn-danger {
  padding: 0.4rem 0.75rem;
  border-radius: 0.25rem;
  border: 1px solid transparent;
  font-weight: 500;
  font-size: 0.7rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-primary svg,
.btn-success svg,
.btn-secondary svg,
.btn-danger svg {
  width: 0.875rem;
  height: 0.875rem;
  margin-right: 0.375rem;
}
.btn-primary {
  background-color: #3b82f6;
  color: white;
}
.btn-success {
  background-color: #10b981;
  color: white;
}
.btn-secondary {
  background-color: #6b7280;
  color: white;
}
.btn-danger {
  background-color: #ef4444;
  color: white;
}

.calibration-quality {
}
.quality-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6rem;
  font-weight: 500;
}
.quality-good {
  background-color: #d1fae5;
  color: #065f46;
}
.quality-ok {
  background-color: #fef3c7;
  color: #92400e;
}
.quality-bad {
  background-color: #fee2e2;
  color: #991b1b;
}
</style>
