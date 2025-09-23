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
          class="control-button"
          :title="isExpanded ? 'Minimize' : 'Expand'"
          @click="toggleExpanded"
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
        <button class="control-button" title="Close" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Canvas for heatmap visualization -->
    <div ref="minimapContent" class="minimap-content">
      <canvas
        ref="heatmapCanvas"
        :width="canvasWidth"
        :height="canvasHeight"
        :style="{
          width: canvasWidth + 'px',
          height: canvasHeight + 'px',
        }"
        class="heatmap-canvas"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
      />

      <!-- Current position indicator -->
      <div
        v-if="showCurrentPosition && currentPositionPixels"
        class="current-position-indicator"
        :style="{
          left: currentPositionPixels.x + 'px',
          top: currentPositionPixels.y + 'px',
        }"
      >
        <div class="position-dot" />
        <div class="position-pulse" />
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
        <span class="stat-value">{{ formattedTotalDistance }}m</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Avg Speed:</span>
        <span class="stat-value">{{ formattedAverageSpeed }}m/s</span>
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
            v-model="showCurrentPosition"
            type="checkbox"
            @change="updateVisualization"
          />
          Show Current Position
        </label>
        <label>
          <input
            v-model="showStatistics"
            type="checkbox"
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
            v-model.number="heatmapOpacity"
            type="range"
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
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import type { HeatmapData, Point3D } from '../composables/usePositionHeatmap';
import type { CourtDimensions } from '../composables/useCameraCalibration';

// Props
type CameraEdge = 'top' | 'bottom' | 'left' | 'right';

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
  cameraEdge?: CameraEdge | null;
}>();

const DEFAULT_COURT_WIDTH = 6.1;
const DEFAULT_COURT_LENGTH = 13.4;

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
const HEATMAP_DEBUG_PREFIX = '[HeatmapDebug]';

const orientationEdge = computed<CameraEdge>(() => props.cameraEdge ?? 'top');
const isSideline = computed(
  () => orientationEdge.value === 'left' || orientationEdge.value === 'right'
);
const courtWidth = computed(
  () => props.courtDimensions.width || DEFAULT_COURT_WIDTH
);
const courtLength = computed(
  () => props.courtDimensions.length || DEFAULT_COURT_LENGTH
);
const aspectRatio = computed(() => courtLength.value / courtWidth.value);

const formatMetric = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  const absValue = Math.abs(value);
  const maxFractionDigits = absValue >= 10 ? 1 : absValue >= 1 ? 2 : 3;

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
};

const formattedTotalDistance = computed(() =>
  formatMetric(props.totalDistance)
);

const formattedAverageSpeed = computed(() =>
  formatMetric(props.averageSpeed)
);

// Canvas dimensions (smaller footprint with orientation awareness)
// Keep minimap footprint compact but expandable when settings are open
const baseShortEdge = computed(() => (isExpanded.value ? 240 : 150));

const canvasWidth = computed(() => {
  if (isSideline.value) {
    return Math.round(baseShortEdge.value);
  }
  return Math.round(baseShortEdge.value * aspectRatio.value);
});

const canvasHeight = computed(() => {
  if (isSideline.value) {
    return Math.round(baseShortEdge.value * aspectRatio.value);
  }
  return Math.round(baseShortEdge.value);
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
  return mapWorldToCanvas(
    props.currentPosition.x ?? 0,
    props.currentPosition.y ?? 0
  );
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const mapNormalizedToDisplay = (nx: number, ny: number) => {
  const edge = orientationEdge.value;
  switch (edge) {
    case 'bottom':
      return { u: ny, v: 1 - nx };
    case 'top':
      return { u: 1 - ny, v: nx };
    case 'left':
      return { u: nx, v: 1 - ny };
    case 'right':
      return { u: 1 - nx, v: ny };
    default:
      return { u: ny, v: 1 - nx };
  }
};

const mapDisplayToNormalized = (u: number, v: number) => {
  const edge = orientationEdge.value;
  switch (edge) {
    case 'bottom':
      return { nx: 1 - v, ny: u };
    case 'top':
      return { nx: v, ny: 1 - u };
    case 'left':
      return { nx: u, ny: 1 - v };
    case 'right':
      return { nx: 1 - u, ny: v };
    default:
      return { nx: 1 - v, ny: u };
  }
};

const mapNormalizedToCanvas = (nx: number, ny: number) => {
  const { u, v } = mapNormalizedToDisplay(nx, ny);
  return {
    x: u * canvasWidth.value,
    y: v * canvasHeight.value,
  };
};

const mapWorldToCanvas = (x: number, y: number) => {
  const nx = clamp((x + courtWidth.value / 2) / courtWidth.value, 0, 1);
  const ny = clamp((y + courtLength.value / 2) / courtLength.value, 0, 1);
  return mapNormalizedToCanvas(nx, ny);
};

const mapCanvasToWorld = (x: number, y: number) => {
  const u = clamp(x / canvasWidth.value, 0, 1);
  const v = clamp(y / canvasHeight.value, 0, 1);
  const { nx, ny } = mapDisplayToNormalized(u, v);

  const worldX = nx * courtWidth.value - courtWidth.value / 2;
  const worldY = ny * courtLength.value - courtLength.value / 2;
  return { worldX, worldY, nx, ny };
};

type WorldPoint = { x: number; y: number };

const mapWorldPoint = (point: WorldPoint) =>
  mapWorldToCanvas(point.x, point.y);

const drawWorldPolygon = (
  ctx: CanvasRenderingContext2D,
  points: WorldPoint[],
  fill: boolean
) => {
  if (!points.length) return;
  const mapped = points.map(mapWorldPoint);
  ctx.beginPath();
  ctx.moveTo(mapped[0]!.x, mapped[0]!.y);
  for (let i = 1; i < mapped.length; i++) {
    ctx.lineTo(mapped[i]!.x, mapped[i]!.y);
  }
  ctx.closePath();
  if (fill) {
    ctx.fill();
  } else {
    ctx.stroke();
  }
};

const drawWorldRect = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fill: boolean
) => {
  drawWorldPolygon(
    ctx,
    [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ],
    fill
  );
};

const strokeWorldLine = (
  ctx: CanvasRenderingContext2D,
  start: WorldPoint,
  end: WorldPoint
) => {
  const mappedStart = mapWorldPoint(start);
  const mappedEnd = mapWorldPoint(end);
  ctx.beginPath();
  ctx.moveTo(mappedStart.x, mappedStart.y);
  ctx.lineTo(mappedEnd.x, mappedEnd.y);
  ctx.stroke();
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

function drawCourtSurface(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight.value);
  gradient.addColorStop(0, '#0f3b21');
  gradient.addColorStop(1, '#0a2616');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

  const shortService = 1.98;
  const singlesWidth = 5.18;
  const singlesPadding = Math.max((courtWidth.value - singlesWidth) / 2, 0);

  // Highlight service boxes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  drawWorldRect(
    ctx,
    -courtWidth.value / 2,
    -shortService,
    courtWidth.value / 2,
    shortService,
    true
  );

  // Highlight doubles alleys
  if (singlesPadding > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    drawWorldRect(
      ctx,
      -courtWidth.value / 2,
      -courtLength.value / 2,
      -courtWidth.value / 2 + singlesPadding,
      courtLength.value / 2,
      true
    );
    drawWorldRect(
      ctx,
      courtWidth.value / 2 - singlesPadding,
      -courtLength.value / 2,
      courtWidth.value / 2,
      courtLength.value / 2,
      true
    );
  }
}

function drawCourtLines(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = Math.max(1, Math.max(canvasWidth.value, canvasHeight.value) * 0.003);
  ctx.lineCap = 'square';

  const width = courtWidth.value;
  const length = courtLength.value;
  const shortService = 1.98;
  const doubleService = 0.76;
  const singlesWidth = 5.18;
  const singlesPadding = Math.max((width - singlesWidth) / 2, 0);
  const baselineMarkLength = 0.2;

  // Outer boundary
  drawWorldPolygon(
    ctx,
    [
      { x: -width / 2, y: -length / 2 },
      { x: width / 2, y: -length / 2 },
      { x: width / 2, y: length / 2 },
      { x: -width / 2, y: length / 2 },
    ],
    false
  );

  // Net
  strokeWorldLine(ctx, { x: -width / 2, y: 0 }, { x: width / 2, y: 0 });

  // Short service lines
  strokeWorldLine(
    ctx,
    { x: -width / 2, y: -shortService },
    { x: width / 2, y: -shortService }
  );
  strokeWorldLine(
    ctx,
    { x: -width / 2, y: shortService },
    { x: width / 2, y: shortService }
  );

  // Doubles long service lines (near baselines)
  const longServiceY = length / 2 - doubleService;
  strokeWorldLine(
    ctx,
    { x: -width / 2, y: -longServiceY },
    { x: width / 2, y: -longServiceY }
  );
  strokeWorldLine(
    ctx,
    { x: -width / 2, y: longServiceY },
    { x: width / 2, y: longServiceY }
  );

  // Singles sidelines
  const leftSinglesX = -width / 2 + singlesPadding;
  const rightSinglesX = width / 2 - singlesPadding;
  strokeWorldLine(
    ctx,
    { x: leftSinglesX, y: -length / 2 },
    { x: leftSinglesX, y: length / 2 }
  );
  strokeWorldLine(
    ctx,
    { x: rightSinglesX, y: -length / 2 },
    { x: rightSinglesX, y: length / 2 }
  );

  // Center service line
  strokeWorldLine(
    ctx,
    { x: 0, y: -shortService },
    { x: 0, y: -longServiceY }
  );
  strokeWorldLine(
    ctx,
    { x: 0, y: shortService },
    { x: 0, y: longServiceY }
  );

  // Baseline marks (0.2m)
  strokeWorldLine(
    ctx,
    { x: -baselineMarkLength / 2, y: -longServiceY },
    { x: baselineMarkLength / 2, y: -longServiceY }
  );
  strokeWorldLine(
    ctx,
    { x: -baselineMarkLength / 2, y: longServiceY },
    { x: baselineMarkLength / 2, y: longServiceY }
  );

  ctx.restore();
}

/**
 * Draw heatmap
 */
function drawHeatmap(ctx: CanvasRenderingContext2D) {
  if (!props.heatmapData) return;

  const { cells, gridWidth, gridHeight } = props.heatmapData;

  for (let gridY = 0; gridY < gridHeight; gridY++) {
    for (let gridX = 0; gridX < gridWidth; gridX++) {
      const cell = cells[gridY]?.[gridX];
      if (!cell || cell.intensity === 0) continue;

      const color = getColorForIntensity(cell.intensity);
      const rgba = `rgba(${color[0] ?? 0}, ${color[1] ?? 0}, ${
        color[2] ?? 0
      }, ${(color[3] ?? 0) / 255})`;
      ctx.fillStyle = rgba;

      const corners = [
        mapNormalizedToCanvas(gridX / gridWidth, gridY / gridHeight),
        mapNormalizedToCanvas((gridX + 1) / gridWidth, gridY / gridHeight),
        mapNormalizedToCanvas(
          (gridX + 1) / gridWidth,
          (gridY + 1) / gridHeight
        ),
        mapNormalizedToCanvas(gridX / gridWidth, (gridY + 1) / gridHeight),
      ];

      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) {
        ctx.lineTo(corners[i]!.x, corners[i]!.y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

/**
 * Update visualization
 */
function updateVisualization() {
  if (!heatmapCanvas.value || !props.isVisible) return;

  const ctx = heatmapCanvas.value.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;

  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

  drawCourtSurface(ctx);

  // Draw heatmap
  if (props.heatmapData) {
    drawHeatmap(ctx);
  }

  drawCourtLines(ctx);
}

/**
 * Handle mouse move for tooltip
 */
function handleMouseMove(event: MouseEvent) {
  if (!heatmapCanvas.value || !props.heatmapData) return;

  const rect = heatmapCanvas.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const { worldX: centeredX, worldY: centeredY, nx, ny } =
    mapCanvasToWorld(x, y);

  // Get zone name
  const zone = props.getZoneName(centeredX, centeredY);

  // Get cell data
  const { cells, gridWidth, gridHeight } = props.heatmapData;
  const gridX = Math.floor(clamp(nx, 0, 0.999999) * gridWidth);
  const gridY = Math.floor(clamp(ny, 0, 0.999999) * gridHeight);

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
    props.isVisible,
    canvasWidth.value,
    canvasHeight.value,
    colorScheme.value,
    heatmapOpacity.value,
    courtWidth.value,
    courtLength.value,
  ],
  () => {
    updateVisualization();
  },
  { deep: true }
);

// Debug watch for props changes
watch(
  () => [props.totalDistance, props.averageSpeed, props.currentPosition],
  (newValues, oldValues) => {
    console.debug(`${HEATMAP_DEBUG_PREFIX} 🗺️ [HeatmapMinimap] Props updated`, {
      totalDistance: { old: oldValues?.[0], new: newValues[0] },
      averageSpeed: { old: oldValues?.[1], new: newValues[1] },
      currentPosition: { old: oldValues?.[2], new: newValues[2] },
    });
  },
  { deep: true }
);

// Lifecycle
onMounted(() => {
  updateVisualization();
});

watch(
  () => props.isVisible,
  (visible) => {
    if (visible) {
      nextTick(() => updateVisualization());
    }
  }
);

watch(orientationEdge, () => {
  nextTick(() => updateVisualization());
});
</script>

<style scoped>
.heatmap-minimap {
  position: absolute;
  bottom: 16px;
  right: 16px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 0;
  z-index: 1000;
  transition: all 0.25s ease;
  box-shadow: 0 3px 5px rgba(0, 0, 0, 0.28);
}

.minimap-expanded {
  width: auto;
}

.minimap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px 6px 0 0;
}

.minimap-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: white;
  font-size: 13px;
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
  padding: 3px;
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
  width: 16px;
  height: 16px;
}

.minimap-content {
  position: relative;
  padding: 6px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.heatmap-canvas {
  display: block;
  border-radius: 4px;
  cursor: crosshair;
}

.current-position-indicator {
  position: absolute;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.position-dot {
  width: 7px;
  height: 7px;
  background: #fff;
  border: 1.5px solid #4ade80;
  border-radius: 50%;
  position: relative;
  z-index: 2;
}

.position-pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 18px;
  height: 18px;
  border: 1.5px solid #4ade80;
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
  padding: 5px 8px;
  font-size: 11px;
  color: white;
  white-space: nowrap;
}

.tooltip-content div {
  margin: 2px 0;
}

.minimap-stats {
  padding: 8px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
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
  padding: 8px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.settings-row {
  margin-bottom: 6px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.settings-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
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
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.settings-row input[type='range'] {
  width: 72px;
  cursor: pointer;
}
</style>
