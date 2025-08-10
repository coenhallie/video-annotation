<template>
  <div v-if="isCalibrating" class="enhanced-calibration-overlay">
    <!-- Canvas overlay that directly overlays the video -->
    <canvas
      ref="calibrationCanvas"
      class="calibration-canvas"
      :width="canvasWidth"
      :height="canvasHeight"
      @click="handleCanvasClick"
      @mousemove="handleMouseMove"
    />

    <!-- Enhanced Instructions Panel -->
    <div class="calibration-panel">
      <div class="panel-header">
        <h3 class="text-lg font-semibold">Enhanced Camera Calibration</h3>
        <div class="calibration-quality" v-if="calibrationQuality">
          <span
            :class="['quality-badge', `quality-${calibrationQuality.level}`]"
          >
            {{ calibrationQuality.message }}
          </span>
        </div>
      </div>

      <!-- Calibration Mode Selector -->
      <div class="mode-selector mb-4">
        <label class="text-sm font-medium text-gray-700 block mb-2">
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
          <span class="text-sm font-medium">Next Point:</span>
          <span class="point-counter">
            {{ collectedPoints.length }} / {{ currentMode?.minPoints || 0 }}
          </span>
        </div>

        <div class="current-point-info">
          <div class="point-name">{{ getPointDescription(nextPoint) }}</div>
          <div class="point-hint">{{ getPointHint(nextPoint) }}</div>
        </div>

        <!-- Dynamic Court Visualization -->
        <div class="visual-guide-large">
          <CourtVisualization
            :calibration-mode="currentMode?.id || 'enhanced-full'"
            :court-type="courtType"
            :court-dimensions="courtDimensions"
            :show-calibration-points="true"
            :collected-points="collectedPointIds"
            :next-point="nextPoint"
            :show-camera-position="false"
            :width="360"
            :height="240"
          />
        </div>
      </div>

      <!-- Collected Points List -->
      <div class="collected-points" v-if="collectedPoints.length > 0">
        <div class="points-header">
          <span class="text-sm font-medium">Collected Points:</span>
          <button
            @click="undoLastPoint"
            class="undo-button"
            v-if="collectedPoints.length > 0"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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
            <span class="point-label">{{ getPointDescription(point.id) }}</span>
            <span
              class="point-confidence"
              :style="{ opacity: point.confidence }"
            >
              {{ (point.confidence * 100).toFixed(0) }}%
            </span>
          </div>
        </div>
      </div>

      <!-- Validation Errors -->
      <div v-if="validationErrors.length > 0" class="validation-errors">
        <div class="error-header">
          <svg
            class="w-4 h-4 text-red-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="text-sm font-medium text-red-700">Issues Detected:</span>
        </div>
        <ul class="error-list">
          <li v-for="(error, index) in validationErrors" :key="index">
            {{ error }}
          </li>
        </ul>
      </div>

      <!-- Calibration Results -->
      <div v-if="calibrationResult" class="calibration-results">
        <div class="results-header">
          <span class="text-sm font-medium">Calibration Results:</span>
        </div>
        <div class="results-grid">
          <div class="result-item">
            <span class="result-label">Accuracy:</span>
            <span class="result-value">
              {{ (calibrationResult.error * 100).toFixed(1) }}cm
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

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button
          v-if="canCalibrate"
          @click="performCalibration"
          class="btn-primary"
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
          Calibrate
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
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Reset
        </button>

        <button @click="cancelCalibration" class="btn-danger">
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
            class="w-4 h-4 text-blue-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="text-xs font-medium text-blue-700">Tips:</span>
        </div>
        <ul class="tips-list">
          <li>Click precisely on court line intersections</li>
          <li>Zoom in for better accuracy</li>
          <li>Service courts provide the best reference points</li>
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
import type {
  Point2D,
  CalibrationPoint,
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

// Enhanced calibration composable
const enhancedCalibration = useCameraCalibration();

// State
const isCalibrating = ref(false);
const calibrationCanvas = ref<HTMLCanvasElement | null>(null);
const canvasWidth = ref(1920);
const canvasHeight = ref(1080);
const mousePosition = ref<Point2D | null>(null);
const collectedPoints = ref<CalibrationPoint[]>([]);
const hoveredPoint = ref<string | null>(null);
const courtType = ref<'badminton' | 'tennis'>('badminton');

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
  return collectedPoints.value.map((p) => p.id);
});

// Function to update canvas dimensions to match video element
function updateCanvasDimensions() {
  if (!props.videoElement) return;

  const video = props.videoElement;

  // Update canvas internal dimensions to match video's natural dimensions
  canvasWidth.value = video.videoWidth || 1920;
  canvasHeight.value = video.videoHeight || 1080;

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

// Watch for active state changes
watch(
  () => props.isActive,
  (active) => {
    if (active && props.videoElement) {
      isCalibrating.value = true;
      // Update canvas dimensions when calibration starts
      setTimeout(() => updateCanvasDimensions(), 100);
      // Add resize listener
      window.addEventListener('resize', updateCanvasDimensions);
    } else if (!active) {
      isCalibrating.value = false;
      // Remove resize listener
      window.removeEventListener('resize', updateCanvasDimensions);
    }
  }
);

// Computed
const calibrationModes = computed(() => CALIBRATION_MODES);
const currentMode = computed(() => enhancedCalibration.currentMode.value);
const calibrationQuality = computed(
  () => enhancedCalibration.calibrationQuality.value
);
const calibrationResult = computed(
  () => enhancedCalibration.calibrationResult.value
);
const validationErrors = computed(
  () => enhancedCalibration.validationErrors.value
);
const isCalibrated = computed(() => enhancedCalibration.isCalibrated.value);

const nextPoint = computed(() => {
  return enhancedCalibration.suggestNextPoint();
});

const canCalibrate = computed(() => {
  return collectedPoints.value.length >= (currentMode.value?.minPoints || 0);
});

// Note: Visual coordinates are now handled by the CourtVisualization component

// Point descriptions and hints
const pointDescriptions: Record<string, string> = {
  'corner-tl': 'Top-Left Corner',
  'corner-tr': 'Top-Right Corner',
  'corner-bl': 'Bottom-Left Corner',
  'corner-br': 'Bottom-Right Corner',
  'net-left': 'Net Left Edge',
  'net-right': 'Net Right Edge',
  'net-center': 'Net Center',
  'service-left': 'Left Service Line',
  'service-right': 'Right Service Line',
  'service-center-left': 'Service Center Left',
  'service-center-right': 'Service Center Right',
  'baseline-left': 'Baseline Left',
  'baseline-right': 'Baseline Right',
  'baseline-center': 'Baseline Center',
  'sideline-mid-left': 'Left Sideline Mid',
  'sideline-mid-right': 'Right Sideline Mid',
};

const pointHints: Record<string, string> = {
  'net-center': 'Click where the net tape meets the center line',
  'service-left':
    'Click where the service line meets the left singles sideline',
  'service-right':
    'Click where the service line meets the right singles sideline',
  'service-center-left':
    'Click where the service line meets the center line (left court)',
  'service-center-right':
    'Click where the service line meets the center line (right court)',
  'corner-tl': 'Click the intersection of the net and left singles sideline',
  'corner-tr': 'Click the intersection of the net and right singles sideline',
};

function getPointDescription(pointId: string | null): string {
  if (!pointId) return 'No point selected';
  return pointDescriptions[pointId] || pointId;
}

function getPointHint(pointId: string | null): string {
  if (!pointId) return 'Select a calibration mode to begin';
  return (
    pointHints[pointId] || 'Click precisely on the court line intersection'
  );
}

// Visual coordinates are now handled by the CourtVisualization component

// Methods
function selectMode(modeId: string) {
  enhancedCalibration.setCalibrationMode(modeId);
  collectedPoints.value = [];
  drawCanvas();
}

function handleCanvasClick(event: MouseEvent) {
  if (!calibrationCanvas.value || !nextPoint.value) return;

  const rect = calibrationCanvas.value.getBoundingClientRect();
  // Calculate pixel coordinates relative to the canvas
  const scaleX = canvasWidth.value / rect.width;
  const scaleY = canvasHeight.value / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  // Calculate confidence based on zoom level and click precision
  const confidence = calculateClickConfidence(event);

  // Add point to enhanced calibration (pass pixel coordinates)
  const success = enhancedCalibration.addCalibrationPoint(
    nextPoint.value,
    { x, y },
    confidence
  );

  if (success) {
    // Update local collected points
    collectedPoints.value = [...enhancedCalibration.calibrationPoints.value];
    drawCanvas();
  }
}

function handleMouseMove(event: MouseEvent) {
  if (!calibrationCanvas.value) return;

  const rect = calibrationCanvas.value.getBoundingClientRect();
  // Calculate pixel coordinates for mouse position
  const scaleX = canvasWidth.value / rect.width;
  const scaleY = canvasHeight.value / rect.height;
  mousePosition.value = {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };

  drawCanvas();
}

function calculateClickConfidence(event: MouseEvent): number {
  // Base confidence
  let confidence = 0.8;

  // Increase confidence if user is zoomed in (using ctrl/cmd key as proxy)
  if (event.ctrlKey || event.metaKey) {
    confidence += 0.1;
  }

  // Increase confidence if click is precise (not moving)
  if (event.movementX === 0 && event.movementY === 0) {
    confidence += 0.05;
  }

  return Math.min(1, confidence);
}

function drawCanvas() {
  if (!calibrationCanvas.value) return;

  const ctx = calibrationCanvas.value.getContext('2d');
  if (!ctx) return;

  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

  // Draw court overlay guide (semi-transparent)
  drawCourtGuide(ctx);

  // Draw collected points
  collectedPoints.value.forEach((point, index) => {
    // Points are already in pixel coordinates
    const x = point.image.x;
    const y = point.image.y;

    // Draw point
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(16, 185, 129, ${point.confidence})`;
    ctx.fill();

    // Draw point number
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((index + 1).toString(), x, y);

    // Draw label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '11px Arial';
    ctx.fillText(getPointDescription(point.id), x, y + 20);
  });

  // Draw mouse cursor guide
  if (mousePosition.value && nextPoint.value) {
    // Mouse position is already in pixel coordinates
    const x = mousePosition.value.x;
    const y = mousePosition.value.y;

    // Draw crosshair
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 20, y);
    ctx.lineTo(x + 20, y);
    ctx.moveTo(x, y - 20);
    ctx.lineTo(x, y + 20);
    ctx.stroke();

    // Draw next point label
    ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
    ctx.font = '12px Arial';
    ctx.fillText(getPointDescription(nextPoint.value), x + 25, y - 5);
  }
}

function drawCourtGuide(ctx: CanvasRenderingContext2D) {
  // Draw semi-transparent court lines as guides
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);

  // This would draw estimated court lines based on current calibration
  // For now, just draw a basic grid
  const gridSize = 10;
  for (let i = 0; i <= gridSize; i++) {
    const x = (i / gridSize) * canvasWidth.value;
    const y = (i / gridSize) * canvasHeight.value;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight.value);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth.value, y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

function performCalibration() {
  const success = enhancedCalibration.calibrate();
  if (success) {
    drawCanvas();
  }
}

function confirmCalibration() {
  if (calibrationResult.value) {
    emit('calibration-complete', {
      homographyMatrix: calibrationResult.value.homographyMatrix,
      inverseHomographyMatrix: calibrationResult.value.inverseHomographyMatrix,
      error: calibrationResult.value.error,
      confidence: calibrationResult.value.confidence,
      points: collectedPoints.value,
      mode: currentMode.value?.id,
    });

    isCalibrating.value = false;
  }
}

function resetCalibration() {
  enhancedCalibration.resetCalibration();
  collectedPoints.value = [];
  drawCanvas();
}

function cancelCalibration() {
  emit('calibration-cancelled');
  isCalibrating.value = false;
}

function undoLastPoint() {
  if (collectedPoints.value.length > 0) {
    collectedPoints.value.pop();
    enhancedCalibration.calibrationPoints.value.pop();
    drawCanvas();
  }
}

// Watch for activation
watch(
  () => props.isActive,
  (active) => {
    isCalibrating.value = active;
    if (active) {
      // Initialize with service courts mode for best accuracy
      selectMode('service-courts');

      // Set up canvas dimensions
      if (props.videoElement) {
        canvasWidth.value = props.videoElement.videoWidth || 1920;
        canvasHeight.value = props.videoElement.videoHeight || 1080;
      }

      // Start drawing
      requestAnimationFrame(() => drawCanvas());
    }
  }
);

// Lifecycle
onMounted(() => {
  if (props.isActive) {
    isCalibrating.value = true;
    updateCanvasDimensions();
    // Add resize listener
    window.addEventListener('resize', updateCanvasDimensions);
  }
});

onUnmounted(() => {
  // Clean up resize listener
  window.removeEventListener('resize', updateCanvasDimensions);
  enhancedCalibration.resetCalibration();
});
</script>

<style scoped>
.enhanced-calibration-overlay {
  /* Fill the entire video-wrapper container */
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 10;
}

.calibration-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  border: 2px solid rgba(59, 130, 246, 0.5);
  box-sizing: border-box;
  image-rendering: crisp-edges;
  image-rendering: -moz-crisp-edges;
  image-rendering: -webkit-crisp-edges;
  image-rendering: pixelated;
  pointer-events: auto;
  z-index: 100000; /* Ensure canvas is visible */
}

/* Ensure canvas maintains aspect ratio and panel stays visible */
@media (max-width: 1600px) {
  .calibration-panel {
    width: 380px;
  }

  .visual-guide-large {
    min-height: 240px;
  }
}

@media (max-width: 1400px) {
  .calibration-panel {
    width: 360px;
    right: 10px;
  }
}

@media (max-width: 1200px) {
  .calibration-panel {
    width: 340px;
    right: 10px;
    top: 10px;
  }
}

@media (max-width: 1024px) {
  .calibration-panel {
    width: 320px;
    right: 5px;
    top: 5px;
  }
}

.calibration-panel {
  position: fixed;
  right: 20px;
  top: 20px;
  bottom: 20px;
  width: 420px; /* Slightly wider to accommodate larger visualization */
  max-width: calc(100vw - 40px);
  background: white;
  border-radius: 12px;
  padding: 20px;
  overflow-y: auto;
  overflow-x: hidden;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
  z-index: 100001; /* Ensure panel is above overlay */
  pointer-events: auto;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
}

.calibration-quality {
  display: flex;
  align-items: center;
}

.quality-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.quality-excellent {
  background: #10b981;
  color: white;
}

.quality-good {
  background: #3b82f6;
  color: white;
}

.quality-moderate {
  background: #f59e0b;
  color: white;
}

.quality-poor {
  background: #ef4444;
  color: white;
}

.quality-none {
  background: #6b7280;
  color: white;
}

.mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mode-button {
  padding: 8px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.mode-button:hover {
  border-color: #3b82f6;
  background: #eff6ff;
}

.mode-button.active {
  border-color: #3b82f6;
  background: #3b82f6;
  color: white;
}

.mode-name {
  font-size: 12px;
  font-weight: 600;
}

.mode-points {
  font-size: 10px;
  opacity: 0.7;
  margin-top: 2px;
}

.point-instructions {
  margin: 20px 0;
  padding: 15px;
  background: #f9fafb;
  border-radius: 8px;
}

.instruction-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.point-counter {
  font-size: 12px;
  padding: 2px 8px;
  background: #3b82f6;
  color: white;
  border-radius: 12px;
}

.current-point-info {
  margin: 10px 0;
}

.point-name {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}

.point-hint {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.4;
}

.visual-guide {
  margin-top: 15px;
  padding: 10px;
  background: white;
  border-radius: 6px;
}

.court-diagram {
  width: 100%;
  height: auto;
}

.pulse-point {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    r: 4;
  }
  50% {
    opacity: 0.5;
    r: 6;
  }
}

.collected-points {
  margin: 20px 0;
  padding: 15px;
  background: #f9fafb;
  border-radius: 8px;
}

.visual-guide-large {
  margin: 20px 0;
  padding: 20px;
  background: linear-gradient(to bottom, #ffffff, #f9fafb);
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 280px;
}

.points-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.undo-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 12px;
  color: #6b7280;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.undo-button:hover {
  color: #ef4444;
  border-color: #ef4444;
}

.points-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.point-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: white;
  border-radius: 4px;
  font-size: 12px;
}

.point-index {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3b82f6;
  color: white;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 600;
}

.point-label {
  flex: 1;
  color: #4b5563;
}

.point-confidence {
  font-size: 11px;
  font-weight: 600;
  color: #10b981;
}

.validation-errors {
  margin: 15px 0;
  padding: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.error-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 12px;
  color: #991b1b;
}

.error-list li {
  padding: 4px 0;
  padding-left: 22px;
}

.calibration-results {
  margin: 15px 0;
  padding: 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
}

.results-header {
  margin-bottom: 10px;
  font-weight: 600;
  color: #166534;
}

.results-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.result-label {
  color: #6b7280;
}

.result-value {
  font-weight: 600;
  color: #166534;
}

.action-buttons {
  display: flex;
  gap: 8px;
  margin: 20px 0;
}

.action-buttons button {
  flex: 1;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-success {
  background: #10b981;
  color: white;
}

.btn-success:hover {
  background: #059669;
}

.btn-secondary {
  background: #6b7280;
  color: white;
}

.btn-secondary:hover {
  background: #4b5563;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

.tips-section {
  margin-top: 20px;
  padding: 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
}

.tips-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.tips-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 11px;
  color: #1e40af;
}

.tips-list li {
  padding: 3px 0;
  padding-left: 22px;
  position: relative;
}

.tips-list li:before {
  content: '•';
  position: absolute;
  left: 10px;
}
</style>
