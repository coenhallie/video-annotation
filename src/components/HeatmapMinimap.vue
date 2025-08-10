<template>
  <div
    v-if="isVisible"
    class="heatmap-minimap"
    :class="{ 'minimap-expanded': isExpanded }"
  >
    <!-- Header with toggle and controls -->
    <div class="minimap-header">
      <div class="minimap-title">
        <svg class="minimap-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
          />
        </svg>
        <span>Position Heatmap</span>
      </div>
      <div class="minimap-controls">
        <button
          @click="toggleExpanded"
          class="control-button"
          :title="isExpanded ? 'Minimize' : 'Expand'"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              v-if="!isExpanded"
              d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
            />
            <path
              v-else
              d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
            />
          </svg>
        </button>
        <button @click="$emit('close')" class="control-button" title="Close">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Canvas for heatmap visualization -->
    <div class="minimap-content" ref="minimapContent">
      <canvas
        ref="heatmapCanvas"
        :width="canvasWidth"
        :height="canvasHeight"
        class="heatmap-canvas"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
      ></canvas>

      <!-- Current position indicator -->
      <div
        v-if="showCurrentPosition && currentPositionPixels"
        class="current-position-indicator"
        :style="{
          left: currentPositionPixels.x + 'px',
          top: currentPositionPixels.y + 'px',
        }"
      >
        <div class="position-dot"></div>
        <div class="position-pulse"></div>
      </div>

      <!-- Tooltip -->
      <div
        v-if="tooltip.visible"
        class="minimap-tooltip"
        :style="{
          left: tooltip.x + 'px',
          top: tooltip.y + 'px',
        }"
      >
        <div class="tooltip-content">
          <div>Zone: {{ tooltip.zone }}</div>
          <div>Visits: {{ tooltip.count }}</div>
          <div>Intensity: {{ (tooltip.intensity * 100).toFixed(1) }}%</div>
        </div>
      </div>
    </div>

    <!-- Statistics panel -->
    <div v-if="showStatistics" class="minimap-stats">
      <div class="stat-item">
        <span class="stat-label">Total Distance:</span>
        <span class="stat-value">{{ totalDistance.toFixed(1) }}m</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Avg Speed:</span>
        <span class="stat-value">{{ averageSpeed.toFixed(2) }}m/s</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Most Visited:</span>
        <span class="stat-value">{{ mostVisitedZone || 'N/A' }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Samples:</span>
        <span class="stat-value">{{ totalSamples }}</span>
      </div>
    </div>

    <!-- Settings panel -->
    <div v-if="isExpanded" class="minimap-settings">
      <div class="settings-row">
        <label>
          <input
            type="checkbox"
            v-model="showCurrentPosition"
            @change="updateVisualization"
          />
          Show Current Position
        </label>
        <label>
          <input
            type="checkbox"
            v-model="showStatistics"
            @change="updateVisualization"
          />
          Show Statistics
        </label>
      </div>
      <div class="settings-row">
        <label>
          Color Scheme:
          <select v-model="colorScheme" @change="updateVisualization">
            <option value="heat">Heat</option>
            <option value="cool">Cool</option>
            <option value="rainbow">Rainbow</option>
            <option value="grayscale">Grayscale</option>
          </select>
        </label>
      </div>
      <div class="settings-row">
        <label>
          Opacity:
          <input
            type="range"
            v-model.number="heatmapOpacity"
            min="0.1"
            max="1"
            step="0.1"
            @input="updateVisualization"
          />
          {{ (heatmapOpacity * 100).toFixed(0) }}%
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import type { HeatmapData, Point3D } from '../composables/usePositionHeatmap';
import type { CourtDimensions } from '../composables/useCameraCalibration';

// Props
const props = defineProps<{
  isVisible: boolean;
  heatmapData: HeatmapData | null;
  currentPosition: Point3D | null;
  courtDimensions: CourtDimensions;
  totalDistance: number;
  averageSpeed: number;
  mostVisitedZone: string | null;
  totalSamples: number;
  getZoneName: (x: number, y: number) => string;
}>();

// Emits
const emit = defineEmits<{
  close: [];
}>();

// Refs
const minimapContent = ref<HTMLDivElement>();
const heatmapCanvas = ref<HTMLCanvasElement>();

// State
const isExpanded = ref(false);
const showCurrentPosition = ref(true);
const showStatistics = ref(true);
const colorScheme = ref<'heat' | 'cool' | 'rainbow' | 'grayscale'>('heat');
const heatmapOpacity = ref(0.8);

// Canvas dimensions
const canvasWidth = computed(() => (isExpanded.value ? 400 : 250));
const canvasHeight = computed(() => {
  const aspectRatio =
    props.courtDimensions.length / props.courtDimensions.width;
  return Math.round(canvasWidth.value * aspectRatio);
});

// Tooltip state
const tooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  zone: '',
  count: 0,
  intensity: 0,
});

// Current position in pixels
const currentPositionPixels = computed(() => {
  if (!props.currentPosition || !heatmapCanvas.value) return null;

  const scaleX = canvasWidth.value / props.courtDimensions.width;
  const scaleY = canvasHeight.value / props.courtDimensions.length;

  return {
    x: props.currentPosition.x * scaleX,
    y: props.currentPosition.y * scaleY,
  };
});

// Color schemes
const colorSchemes = {
  heat: [
    { stop: 0, color: [0, 0, 255, 0] }, // Transparent blue
    { stop: 0.25, color: [0, 255, 255, 64] }, // Cyan
    { stop: 0.5, color: [0, 255, 0, 128] }, // Green
    { stop: 0.75, color: [255, 255, 0, 192] }, // Yellow
    { stop: 1, color: [255, 0, 0, 255] }, // Red
  ],
  cool: [
    { stop: 0, color: [255, 255, 255, 0] }, // Transparent white
    { stop: 0.25, color: [200, 200, 255, 64] }, // Light blue
    { stop: 0.5, color: [100, 100, 255, 128] }, // Blue
    { stop: 0.75, color: [0, 0, 200, 192] }, // Dark blue
    { stop: 1, color: [0, 0, 100, 255] }, // Very dark blue
  ],
  rainbow: [
    { stop: 0, color: [148, 0, 211, 0] }, // Transparent violet
    { stop: 0.17, color: [75, 0, 130, 64] }, // Indigo
    { stop: 0.33, color: [0, 0, 255, 96] }, // Blue
    { stop: 0.5, color: [0, 255, 0, 128] }, // Green
    { stop: 0.67, color: [255, 255, 0, 160] }, // Yellow
    { stop: 0.83, color: [255, 127, 0, 192] }, // Orange
    { stop: 1, color: [255, 0, 0, 255] }, // Red
  ],
  grayscale: [
    { stop: 0, color: [255, 255, 255, 0] }, // Transparent white
    { stop: 0.25, color: [192, 192, 192, 64] }, // Light gray
    { stop: 0.5, color: [128, 128, 128, 128] }, // Gray
    { stop: 0.75, color: [64, 64, 64, 192] }, // Dark gray
    { stop: 1, color: [0, 0, 0, 255] }, // Black
  ],
};

/**
 * Get color for intensity value
 */
function getColorForIntensity(
  intensity: number
): [number, number, number, number] {
  const scheme = colorSchemes[colorScheme.value];

  // Find the two stops that intensity falls between
  let lowerStop = scheme[0];
  let upperStop = scheme[scheme.length - 1];

  for (let i = 0; i < scheme.length - 1; i++) {
    const currentStop = scheme[i];
    const nextStop = scheme[i + 1];
    if (
      currentStop &&
      nextStop &&
      intensity >= currentStop.stop &&
      intensity <= nextStop.stop
    ) {
      lowerStop = currentStop;
      upperStop = nextStop;
      break;
    }
  }

  if (!lowerStop || !upperStop) {
    return [0, 0, 0, 0];
  }

  // Interpolate between the two colors
  const t =
    (intensity - lowerStop.stop) / (upperStop.stop - lowerStop.stop || 1);

  const color: [number, number, number, number] = [
    Math.round(
      (lowerStop.color[0] ?? 0) +
        ((upperStop.color[0] ?? 0) - (lowerStop.color[0] ?? 0)) * t
    ),
    Math.round(
      (lowerStop.color[1] ?? 0) +
        ((upperStop.color[1] ?? 0) - (lowerStop.color[1] ?? 0)) * t
    ),
    Math.round(
      (lowerStop.color[2] ?? 0) +
        ((upperStop.color[2] ?? 0) - (lowerStop.color[2] ?? 0)) * t
    ),
    Math.round(
      ((lowerStop.color[3] ?? 0) +
        ((upperStop.color[3] ?? 0) - (lowerStop.color[3] ?? 0)) * t) *
        heatmapOpacity.value
    ),
  ];

  return color;
}

/**
 * Draw court lines
 */
function drawCourtLines(ctx: CanvasRenderingContext2D) {
  const scaleX = canvasWidth.value / props.courtDimensions.width;
  const scaleY = canvasHeight.value / props.courtDimensions.length;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;

  // Draw court outline (doubles court)
  ctx.strokeRect(0, 0, canvasWidth.value, canvasHeight.value);

  // Draw net line (center of court)
  ctx.beginPath();
  ctx.moveTo(canvasWidth.value / 2, 0);
  ctx.lineTo(canvasWidth.value / 2, canvasHeight.value);
  ctx.stroke();

  // Draw short service lines (1.98m from net on each side)
  const serviceLineX = 1.98 * scaleX; // 1.98m from net
  ctx.beginPath();
  // Left service line
  ctx.moveTo(canvasWidth.value / 2 - serviceLineX, 0);
  ctx.lineTo(canvasWidth.value / 2 - serviceLineX, canvasHeight.value);
  // Right service line
  ctx.moveTo(canvasWidth.value / 2 + serviceLineX, 0);
  ctx.lineTo(canvasWidth.value / 2 + serviceLineX, canvasHeight.value);
  ctx.stroke();

  // Draw singles sidelines (5.18m width)
  const singlesWidth = 5.18; // meters
  const sidelineOffset =
    ((props.courtDimensions.width - singlesWidth) / 2) * scaleY;
  ctx.beginPath();
  ctx.moveTo(0, sidelineOffset);
  ctx.lineTo(canvasWidth.value, sidelineOffset);
  ctx.moveTo(0, canvasHeight.value - sidelineOffset);
  ctx.lineTo(canvasWidth.value, canvasHeight.value - sidelineOffset);
  ctx.stroke();

  // Draw center service line (divides left and right service courts)
  // Runs from short service line to back boundary on each side of net
  ctx.beginPath();
  // Left side of court (from back to service line)
  ctx.moveTo(0, canvasHeight.value / 2);
  ctx.lineTo(canvasWidth.value / 2 - serviceLineX, canvasHeight.value / 2);
  // Right side of court (from service line to back)
  ctx.moveTo(canvasWidth.value / 2 + serviceLineX, canvasHeight.value / 2);
  ctx.lineTo(canvasWidth.value, canvasHeight.value / 2);
  ctx.stroke();

  // Draw long service lines for doubles (0.76m from back)
  const longServiceLineX = 0.76 * scaleX; // 0.76m from back
  ctx.beginPath();
  ctx.moveTo(longServiceLineX, 0);
  ctx.lineTo(longServiceLineX, canvasHeight.value);
  ctx.moveTo(canvasWidth.value - longServiceLineX, 0);
  ctx.lineTo(canvasWidth.value - longServiceLineX, canvasHeight.value);
  ctx.stroke();
}

/**
 * Draw heatmap
 */
function drawHeatmap(ctx: CanvasRenderingContext2D) {
  if (!props.heatmapData) return;

  const { cells, gridWidth, gridHeight } = props.heatmapData;
  const cellWidth = canvasWidth.value / gridWidth;
  const cellHeight = canvasHeight.value / gridHeight;

  // Create image data for better performance
  const imageData = ctx.createImageData(canvasWidth.value, canvasHeight.value);
  const data = imageData.data;

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const cell = cells[y]?.[x];
      if (!cell || cell.intensity === 0) continue;

      const color = getColorForIntensity(cell.intensity);

      // Fill the cell area in the image data
      const startX = Math.floor(x * cellWidth);
      const endX = Math.floor((x + 1) * cellWidth);
      const startY = Math.floor(y * cellHeight);
      const endY = Math.floor((y + 1) * cellHeight);

      for (let py = startY; py < endY; py++) {
        for (let px = startX; px < endX; px++) {
          const index = (py * canvasWidth.value + px) * 4;

          // Blend with existing color
          const alpha = (color[3] ?? 0) / 255;
          const r = data[index] ?? 0;
          const g = data[index + 1] ?? 0;
          const b = data[index + 2] ?? 0;
          const a = data[index + 3] ?? 0;

          data[index] = r * (1 - alpha) + (color[0] ?? 0) * alpha;
          data[index + 1] = g * (1 - alpha) + (color[1] ?? 0) * alpha;
          data[index + 2] = b * (1 - alpha) + (color[2] ?? 0) * alpha;
          data[index + 3] = Math.min(255, a + (color[3] ?? 0));
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Update visualization
 */
function updateVisualization() {
  if (!heatmapCanvas.value) return;

  const ctx = heatmapCanvas.value.getContext('2d');
  if (!ctx) return;

  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

  // Draw background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

  // Draw court lines
  drawCourtLines(ctx);

  // Draw heatmap
  if (props.heatmapData) {
    drawHeatmap(ctx);
  }
}

/**
 * Handle mouse move for tooltip
 */
function handleMouseMove(event: MouseEvent) {
  if (!heatmapCanvas.value || !props.heatmapData) return;

  const rect = heatmapCanvas.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Convert to world coordinates
  const worldX = (x / canvasWidth.value) * props.courtDimensions.width;
  const worldY = (y / canvasHeight.value) * props.courtDimensions.length;

  // Get zone name
  const zone = props.getZoneName(worldX, worldY);

  // Get cell data
  const { cells, gridWidth, gridHeight } = props.heatmapData;
  const gridX = Math.floor((worldX / props.courtDimensions.width) * gridWidth);
  const gridY = Math.floor(
    (worldY / props.courtDimensions.length) * gridHeight
  );

  const cell = cells[gridY]?.[gridX];

  tooltip.value = {
    visible: true,
    x: x + 10,
    y: y - 30,
    zone,
    count: cell?.count || 0,
    intensity: cell?.intensity || 0,
  };
}

/**
 * Handle mouse leave
 */
function handleMouseLeave() {
  tooltip.value.visible = false;
}

/**
 * Toggle expanded view
 */
function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
  nextTick(() => {
    updateVisualization();
  });
}

// Watch for changes
watch(
  () => [
    props.heatmapData,
    canvasWidth.value,
    canvasHeight.value,
    colorScheme.value,
    heatmapOpacity.value,
  ],
  () => {
    updateVisualization();
  },
  { deep: true }
);

// Lifecycle
onMounted(() => {
  updateVisualization();
});
</script>

<style scoped>
.heatmap-minimap {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 0;
  z-index: 1000;
  transition: all 0.3s ease;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.minimap-expanded {
  width: 420px;
}

.minimap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px 8px 0 0;
}

.minimap-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: white;
  font-size: 14px;
  font-weight: 500;
}

.minimap-icon {
  width: 18px;
  height: 18px;
  color: #4ade80;
}

.minimap-controls {
  display: flex;
  gap: 4px;
}

.control-button {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.control-button svg {
  width: 18px;
  height: 18px;
}

.minimap-content {
  position: relative;
  padding: 10px;
}

.heatmap-canvas {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 4px;
  cursor: crosshair;
}

.current-position-indicator {
  position: absolute;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.position-dot {
  width: 8px;
  height: 8px;
  background: #fff;
  border: 2px solid #4ade80;
  border-radius: 50%;
  position: relative;
  z-index: 2;
}

.position-pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  border: 2px solid #4ade80;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(2);
    opacity: 0;
  }
}

.minimap-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 10;
}

.tooltip-content {
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 12px;
  color: white;
  white-space: nowrap;
}

.tooltip-content div {
  margin: 2px 0;
}

.minimap-stats {
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.stat-label {
  color: rgba(255, 255, 255, 0.6);
}

.stat-value {
  font-weight: 500;
  color: #4ade80;
}

.minimap-settings {
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.settings-row {
  margin-bottom: 8px;
  display: flex;
  gap: 12px;
  align-items: center;
}

.settings-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}

.settings-row input[type='checkbox'] {
  cursor: pointer;
}

.settings-row select {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.settings-row input[type='range'] {
  width: 80px;
  cursor: pointer;
}
</style>
