<template>
  <div v-if="isCalibrating" class="calibration-overlay">
    <!-- Semi-transparent overlay -->
    <div class="overlay-backdrop" @click.stop>
      <!-- Canvas for drawing calibration points and court outline -->
      <canvas
        ref="calibrationCanvas"
        class="calibration-canvas"
        :width="canvasWidth"
        :height="canvasHeight"
        @click="handleCanvasClick"
        @mousemove="handleMouseMove"
      />

      <!-- Instructions panel -->
      <div class="calibration-instructions">
        <h3 class="text-lg font-semibold mb-3">Camera Calibration</h3>

        <!-- Calibration Mode Selector -->
        <div class="calibration-mode-selector mb-4">
          <label class="text-sm font-medium text-gray-700 block mb-2">
            Calibration Method:
          </label>
          <select
            v-model="calibrationMode"
            @change="resetCalibration"
            class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="full-court">Full Court (4 corners)</option>
            <option value="half-court">Half Court (2 corners + net)</option>
            <option value="service-line">Service Line + Net</option>
            <option value="reference-lines">Two Reference Lines</option>
          </select>
          <p class="text-xs text-gray-500 mt-1">
            {{ getModeDescription(calibrationMode) }}
          </p>
        </div>

        <div class="instruction-steps">
          <div
            v-for="(step, index) in calibrationSteps"
            :key="index"
            :class="[
              'step-item',
              {
                active: currentStep === index,
                completed: currentStep > index,
              },
            ]"
          >
            <div class="step-number">{{ index + 1 }}</div>
            <div class="step-text">{{ step.label }}</div>
          </div>
        </div>

        <div class="current-instruction">
          <p class="text-sm text-gray-600 mt-4">
            {{ calibrationSteps[currentStep]?.instruction }}
          </p>
        </div>

        <!-- Court type selector -->
        <div class="court-selector mt-4">
          <label class="text-sm font-medium text-gray-700 block mb-2">
            Court Type:
          </label>
          <div class="flex gap-2">
            <button
              :class="[
                'px-3 py-1 text-sm rounded',
                courtType === 'badminton'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
              ]"
              @click="setCourtType('badminton')"
            >
              Badminton
            </button>
            <button
              :class="[
                'px-3 py-1 text-sm rounded',
                courtType === 'tennis'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
              ]"
              @click="setCourtType('tennis')"
            >
              Tennis
            </button>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="action-buttons mt-6 flex gap-2">
          <button
            v-if="currentStep > 0"
            class="px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded"
            @click="undoLastPoint"
          >
            Undo
          </button>
          <button
            v-if="currentStep === 4"
            class="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded"
            @click="confirmCalibration"
          >
            Confirm Calibration
          </button>
          <button
            class="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
            @click="cancelCalibration"
          >
            Cancel
          </button>
        </div>

        <!-- Calibration status -->
        <div v-if="calibrationError !== null" class="mt-4">
          <div
            :class="[
              'p-3 rounded text-sm',
              calibrationError < 0.1
                ? 'bg-green-100 text-green-800'
                : calibrationError < 0.5
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800',
            ]"
          >
            <strong>Calibration Accuracy:</strong>
            {{ (calibrationError * 100).toFixed(2) }}cm average error
            <span v-if="calibrationError < 0.1" class="ml-2">✓ Excellent</span>
            <span v-else-if="calibrationError < 0.5" class="ml-2">⚠ Good</span>
            <span v-else class="ml-2">✗ Poor - Try again</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useCameraCalibration } from '../composables/useCameraCalibration';

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
const calibrationCanvas = ref<HTMLCanvasElement | null>(null);
const canvasWidth = ref(1920);
const canvasHeight = ref(1080);
const currentStep = ref(0);
const calibrationPoints = ref<Array<{ x: number; y: number }>>([]);
const mousePosition = ref<{ x: number; y: number } | null>(null);
const courtType = ref<'badminton' | 'tennis'>('badminton');
const calibrationError = ref<number | null>(null);
const calibrationMode = ref<
  'full-court' | 'half-court' | 'service-line' | 'reference-lines'
>('full-court');

// Court dimensions in meters
const courtDimensions = {
  badminton: { length: 13.4, width: 6.1 },
  tennis: { length: 23.77, width: 8.23 },
};

// Get calibration steps based on mode
const calibrationSteps = computed(() => {
  switch (calibrationMode.value) {
    case 'full-court':
      return [
        {
          label: 'Top-Left Corner',
          instruction:
            'Click on the top-left corner of the singles court (near net, left side)',
        },
        {
          label: 'Top-Right Corner',
          instruction:
            'Click on the top-right corner of the singles court (near net, right side)',
        },
        {
          label: 'Bottom-Right Corner',
          instruction:
            'Click on the bottom-right corner of the singles court (far baseline, right side)',
        },
        {
          label: 'Bottom-Left Corner',
          instruction:
            'Click on the bottom-left corner of the singles court (far baseline, left side)',
        },
        {
          label: 'Review',
          instruction:
            'Review the calibration. Click "Confirm" if correct, or "Undo" to adjust.',
        },
      ];

    case 'half-court':
      return [
        {
          label: 'Net Left',
          instruction:
            'Click on the left side of the net (where it meets the singles sideline)',
        },
        {
          label: 'Net Right',
          instruction:
            'Click on the right side of the net (where it meets the singles sideline)',
        },
        {
          label: 'Service Line',
          instruction:
            'Click on the service line (center of the visible half court)',
        },
        {
          label: 'Review',
          instruction:
            'Review the calibration. The system will extrapolate the full court.',
        },
      ];

    case 'service-line':
      return [
        {
          label: 'Net Center',
          instruction: 'Click on the center of the net',
        },
        {
          label: 'Service Line Center',
          instruction:
            'Click on the center of the service line (1.98m from net)',
        },
        {
          label: 'Side Reference',
          instruction:
            'Click on any singles sideline point for angle reference',
        },
        {
          label: 'Review',
          instruction:
            'Review the calibration. Using known 1.98m service line distance.',
        },
      ];

    case 'reference-lines':
      return [
        {
          label: 'First Line Start',
          instruction: 'Click on the start of the first reference line',
        },
        {
          label: 'First Line End',
          instruction: 'Click on the end of the first reference line',
        },
        {
          label: 'Second Line Start',
          instruction: 'Click on the start of a parallel reference line',
        },
        {
          label: 'Second Line End',
          instruction: 'Click on the end of the parallel reference line',
        },
        {
          label: 'Enter Distance',
          instruction:
            'Enter the real-world distance between these lines in meters',
        },
      ];

    default:
      return [];
  }
});

// Get mode description
function getModeDescription(mode: string): string {
  switch (mode) {
    case 'full-court':
      return 'Best accuracy - requires all 4 court corners visible';
    case 'half-court':
      return 'Good accuracy - for when only one half of the court is visible';
    case 'service-line':
      return 'Moderate accuracy - uses net and service line (1.98m distance)';
    case 'reference-lines':
      return 'Flexible - use any two parallel lines with known distance';
    default:
      return '';
  }
}

// Watch for activation
watch(
  () => props.isActive,
  (active) => {
    if (active) {
      startCalibration();
    } else {
      cancelCalibration();
    }
  }
);

// Start calibration process
function startCalibration() {
  if (!props.videoElement) {
    console.error('No video element provided for calibration');
    return;
  }

  isCalibrating.value = true;
  currentStep.value = 0;
  calibrationPoints.value = [];
  calibrationError.value = null;

  // Set canvas dimensions to match video
  canvasWidth.value = props.videoElement.videoWidth || 1920;
  canvasHeight.value = props.videoElement.videoHeight || 1080;

  // Draw initial frame
  requestAnimationFrame(() => drawCalibrationFrame());
}

// Handle canvas click
function handleCanvasClick(event: MouseEvent) {
  if (!calibrationCanvas.value) return;

  const maxPoints = getMaxPointsForMode();
  if (currentStep.value >= maxPoints) return;

  const rect = calibrationCanvas.value.getBoundingClientRect();
  const scaleX = canvasWidth.value / rect.width;
  const scaleY = canvasHeight.value / rect.height;

  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  // Add calibration point
  calibrationPoints.value.push({ x, y });
  currentStep.value++;

  // Check if we have enough points for the current mode
  if (calibrationPoints.value.length === maxPoints) {
    performCalibration();
  }

  drawCalibrationFrame();
}

// Get maximum points needed for current mode
function getMaxPointsForMode(): number {
  switch (calibrationMode.value) {
    case 'full-court':
      return 4;
    case 'half-court':
      return 3;
    case 'service-line':
      return 3;
    case 'reference-lines':
      return 4;
    default:
      return 4;
  }
}

// Handle mouse move for preview
function handleMouseMove(event: MouseEvent) {
  const maxPoints = getMaxPointsForMode();
  if (!calibrationCanvas.value || currentStep.value >= maxPoints) {
    mousePosition.value = null;
    return;
  }

  const rect = calibrationCanvas.value.getBoundingClientRect();
  const scaleX = canvasWidth.value / rect.width;
  const scaleY = canvasHeight.value / rect.height;

  mousePosition.value = {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };

  drawCalibrationFrame();
}

// Draw calibration frame
function drawCalibrationFrame() {
  if (!calibrationCanvas.value || !props.videoElement) return;

  const ctx = calibrationCanvas.value.getContext('2d');
  if (!ctx) return;

  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

  // Draw video frame
  ctx.drawImage(
    props.videoElement,
    0,
    0,
    canvasWidth.value,
    canvasHeight.value
  );

  // Apply semi-transparent overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

  // Draw calibration points
  calibrationPoints.value.forEach((point, index) => {
    // Draw point
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`${index + 1}`, point.x - 4, point.y - 12);
  });

  // Draw lines between points
  if (calibrationPoints.value.length > 1) {
    ctx.beginPath();
    const firstPoint = calibrationPoints.value[0];
    if (firstPoint) {
      ctx.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < calibrationPoints.value.length; i++) {
        const point = calibrationPoints.value[i];
        if (point) {
          ctx.lineTo(point.x, point.y);
        }
      }

      // Close the shape if we have 4 points
      if (calibrationPoints.value.length === 4) {
        ctx.lineTo(firstPoint.x, firstPoint.y);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.fill();
      }
    }

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw preview point at mouse position
  if (mousePosition.value && currentStep.value < 4) {
    ctx.beginPath();
    ctx.arc(mousePosition.value.x, mousePosition.value.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw preview line from last point
    if (calibrationPoints.value.length > 0) {
      const lastPoint =
        calibrationPoints.value[calibrationPoints.value.length - 1];
      if (lastPoint) {
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(mousePosition.value.x, mousePosition.value.y);
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}

// Perform calibration based on mode
function performCalibration() {
  const dims = courtDimensions[courtType.value];
  let calibrationPointPairs: any[] = [];

  switch (calibrationMode.value) {
    case 'full-court': {
      if (calibrationPoints.value.length !== 4) return;

      // Standard 4-corner calibration
      const normalizedPoints = calibrationPoints.value.map((p) => ({
        x: p.x / canvasWidth.value,
        y: p.y / canvasHeight.value,
      }));

      const worldPoints = [
        { x: -dims.width / 2, y: 0, z: 0 }, // Top-left
        { x: dims.width / 2, y: 0, z: 0 }, // Top-right
        { x: dims.width / 2, y: dims.length, z: 0 }, // Bottom-right
        { x: -dims.width / 2, y: dims.length, z: 0 }, // Bottom-left
      ];

      calibrationPointPairs = normalizedPoints.map((imgPoint, i) => ({
        image: imgPoint,
        world: worldPoints[i],
      }));
      break;
    }

    case 'half-court': {
      if (calibrationPoints.value.length !== 3) return;

      // Use net points and service line to extrapolate
      const netLeft = calibrationPoints.value[0];
      const netRight = calibrationPoints.value[1];
      const serviceLine = calibrationPoints.value[2];

      // Service line is 1.98m from net in badminton
      const serviceLineDistance = 1.98;

      // Calculate baseline position by extrapolating
      const netCenterY = (netLeft.y + netRight.y) / 2;
      const serviceToNet = serviceLine.y - netCenterY;
      const baselineY =
        netCenterY + (serviceToNet * dims.length) / serviceLineDistance;

      // Create 4 points for calibration
      const points = [
        netLeft,
        netRight,
        { x: netRight.x, y: baselineY },
        { x: netLeft.x, y: baselineY },
      ];

      const normalizedPoints = points.map((p) => ({
        x: p.x / canvasWidth.value,
        y: p.y / canvasHeight.value,
      }));

      const worldPoints = [
        { x: -dims.width / 2, y: 0, z: 0 }, // Net left
        { x: dims.width / 2, y: 0, z: 0 }, // Net right
        { x: dims.width / 2, y: dims.length, z: 0 }, // Baseline right
        { x: -dims.width / 2, y: dims.length, z: 0 }, // Baseline left
      ];

      calibrationPointPairs = normalizedPoints.map((imgPoint, i) => ({
        image: imgPoint,
        world: worldPoints[i],
      }));
      break;
    }

    case 'service-line': {
      if (calibrationPoints.value.length !== 3) return;

      // Use net center, service line center, and side reference
      const netCenter = calibrationPoints.value[0];
      const serviceCenter = calibrationPoints.value[1];
      const sideRef = calibrationPoints.value[2];

      // Calculate pixel distance for 1.98m service line
      const pixelDistance = Math.sqrt(
        Math.pow(serviceCenter.x - netCenter.x, 2) +
          Math.pow(serviceCenter.y - netCenter.y, 2)
      );
      const pixelsPerMeter = pixelDistance / 1.98;

      // Estimate court width from side reference
      const halfWidthPixels = Math.abs(sideRef.x - netCenter.x);
      const estimatedHalfWidth = halfWidthPixels / pixelsPerMeter;

      // Create 4 calibration points
      const points = [
        { x: netCenter.x - halfWidthPixels, y: netCenter.y },
        { x: netCenter.x + halfWidthPixels, y: netCenter.y },
        {
          x: netCenter.x + halfWidthPixels,
          y: netCenter.y + dims.length * pixelsPerMeter,
        },
        {
          x: netCenter.x - halfWidthPixels,
          y: netCenter.y + dims.length * pixelsPerMeter,
        },
      ];

      const normalizedPoints = points.map((p) => ({
        x: p.x / canvasWidth.value,
        y: p.y / canvasHeight.value,
      }));

      const worldPoints = [
        { x: -dims.width / 2, y: 0, z: 0 },
        { x: dims.width / 2, y: 0, z: 0 },
        { x: dims.width / 2, y: dims.length, z: 0 },
        { x: -dims.width / 2, y: dims.length, z: 0 },
      ];

      calibrationPointPairs = normalizedPoints.map((imgPoint, i) => ({
        image: imgPoint,
        world: worldPoints[i],
      }));
      break;
    }

    case 'reference-lines': {
      if (calibrationPoints.value.length !== 4) return;

      // Use two parallel lines with assumed 3m distance
      // In a real implementation, we'd prompt for the actual distance
      const referenceDistance = 3.0;

      const normalizedPoints = calibrationPoints.value.map((p) => ({
        x: p.x / canvasWidth.value,
        y: p.y / canvasHeight.value,
      }));

      const worldPoints = [
        { x: 0, y: 0, z: 0 },
        { x: referenceDistance, y: 0, z: 0 },
        { x: referenceDistance, y: referenceDistance, z: 0 },
        { x: 0, y: referenceDistance, z: 0 },
      ];

      calibrationPointPairs = normalizedPoints.map((imgPoint, i) => ({
        image: imgPoint,
        world: worldPoints[i],
      }));
      break;
    }
  }

  if (calibrationPointPairs.length >= 4) {
    // Set calibration points and perform calibration
    cameraCalibration.setCalibrationPoints(calibrationPointPairs);
    cameraCalibration.setCourtDimensions(dims);

    const success = cameraCalibration.calibrate();

    if (success) {
      calibrationError.value = cameraCalibration.calibrationError.value;
      currentStep.value = getMaxPointsForMode(); // Move to review step
      console.log(`Calibration successful using ${calibrationMode.value} mode`);
      console.log(
        'Calibration error:',
        calibrationError.value?.toFixed(3),
        'meters'
      );
    } else {
      console.error('Calibration failed');
      calibrationError.value = Infinity;
    }
  }
}

// Undo last point
function undoLastPoint() {
  if (calibrationPoints.value.length > 0) {
    calibrationPoints.value.pop();
    currentStep.value = Math.max(0, currentStep.value - 1);
    calibrationError.value = null;
    drawCalibrationFrame();
  }
}

// Reset calibration when mode changes
function resetCalibration() {
  calibrationPoints.value = [];
  currentStep.value = 0;
  calibrationError.value = null;
  drawCalibrationFrame();
}

// Confirm calibration
function confirmCalibration() {
  if (cameraCalibration.isCalibrated.value) {
    const calibrationData = {
      homographyMatrix: cameraCalibration.homographyMatrix.value,
      courtDimensions: cameraCalibration.courtDimensions.value,
      calibrationError: cameraCalibration.calibrationError.value,
      calibrationPoints: calibrationPoints.value,
      courtType: courtType.value,
    };

    emit('calibration-complete', calibrationData);
    isCalibrating.value = false;
  }
}

// Cancel calibration
function cancelCalibration() {
  cameraCalibration.resetCalibration();
  isCalibrating.value = false;
  currentStep.value = 0;
  calibrationPoints.value = [];
  calibrationError.value = null;
  emit('calibration-cancelled');
}

// Set court type
function setCourtType(type: 'badminton' | 'tennis') {
  courtType.value = type;

  // Re-calibrate if we already have 4 points
  if (calibrationPoints.value.length === 4) {
    performCalibration();
  }
}

// Animation frame for continuous drawing
let animationFrameId: number | null = null;

function animate() {
  drawCalibrationFrame();
  animationFrameId = requestAnimationFrame(animate);
}

onMounted(() => {
  if (props.isActive) {
    startCalibration();
  }
});

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
});
</script>

<style scoped>
.calibration-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
}

.overlay-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
}

.calibration-canvas {
  max-width: 90%;
  max-height: 80vh;
  cursor: crosshair;
  border: 2px solid #10b981;
  border-radius: 8px;
}

.calibration-instructions {
  position: absolute;
  top: 20px;
  right: 20px;
  background: white;
  padding: 20px;
  border-radius: 8px;
  width: 320px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.instruction-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.step-item.active {
  background: #dbeafe;
  border-left: 3px solid #3b82f6;
}

.step-item.completed {
  opacity: 0.6;
}

.step-item.completed .step-number {
  background: #10b981;
  color: white;
}

.step-number {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
}

.step-item.active .step-number {
  background: #3b82f6;
  color: white;
}

.step-text {
  flex: 1;
  font-size: 14px;
  color: #374151;
}

.current-instruction {
  margin-top: 16px;
  padding: 12px;
  background: #f3f4f6;
  border-radius: 4px;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-buttons button {
  flex: 1;
  transition: all 0.2s;
}
</style>
