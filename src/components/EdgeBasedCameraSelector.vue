<template>
  <div class="edge-based-camera-selector">
    <!-- Header -->
    <div class="selector-header">
      <h3 class="text-lg font-semibold text-gray-900">Camera Position</h3>
      <p class="text-sm text-gray-600 mt-1">
        Click on a court edge to position the camera
      </p>
    </div>

    <!-- Court Visualization with Interactive Edges -->
    <div class="court-container">
      <svg
        :width="svgWidth"
        :height="svgHeight"
        viewBox="0 0 900 500"
        class="court-svg"
        @mouseleave="handleMouseLeave"
      >
        <!-- Background for out-of-bounds area -->
        <rect
          x="0"
          y="0"
          width="900"
          height="500"
          fill="#f3f4f6"
          class="out-of-bounds-bg"
        />

        <!-- Court surface (optimized size to balance visibility and camera space) -->
        <rect
          x="150"
          y="125"
          width="600"
          height="250"
          fill="#2d5a27"
          stroke="#ffffff"
          stroke-width="2"
          class="court-surface"
        />

        <!-- Interactive Edge Zones (invisible but clickable) -->
        <!-- Top Edge -->
        <rect
          x="150"
          y="45"
          width="600"
          height="80"
          fill="transparent"
          :class="getEdgeClass('top')"
          @mouseenter="handleEdgeHover('top')"
          @mouseleave="handleEdgeLeave('top')"
          @click="handleEdgeClick('top')"
        />

        <!-- Bottom Edge -->
        <rect
          x="150"
          y="375"
          width="600"
          height="80"
          fill="transparent"
          :class="getEdgeClass('bottom')"
          @mouseenter="handleEdgeHover('bottom')"
          @mouseleave="handleEdgeLeave('bottom')"
          @click="handleEdgeClick('bottom')"
        />

        <!-- Left Edge -->
        <rect
          x="70"
          y="125"
          width="80"
          height="250"
          fill="transparent"
          :class="getEdgeClass('left')"
          @mouseenter="handleEdgeHover('left')"
          @mouseleave="handleEdgeLeave('left')"
          @click="handleEdgeClick('left')"
        />

        <!-- Right Edge -->
        <rect
          x="750"
          y="125"
          width="80"
          height="250"
          fill="transparent"
          :class="getEdgeClass('right')"
          @mouseenter="handleEdgeHover('right')"
          @mouseleave="handleEdgeLeave('right')"
          @click="handleEdgeClick('right')"
        />

        <!-- Visual Edge Highlights with improved visibility -->
        <!-- Top Edge Highlight -->
        <g v-if="hoveredEdge === 'top' || selectedEdge === 'top'">
          <rect
            x="150"
            y="45"
            width="600"
            height="80"
            :fill="getEdgeHighlightColor('top')"
            :opacity="hoveredEdge === 'top' ? 0.15 : 0.08"
            class="edge-zone-fill"
          />
          <line
            x1="150"
            y1="125"
            x2="750"
            y2="125"
            :stroke="getEdgeHighlightColor('top')"
            :stroke-width="getEdgeHighlightWidth('top')"
            stroke-linecap="round"
            class="edge-highlight"
          />
          <rect
            x="150"
            y="110"
            width="600"
            height="15"
            :fill="getEdgeHighlightColor('top')"
            :opacity="0.2"
            class="edge-glow"
          />
        </g>

        <!-- Bottom Edge Highlight -->
        <g v-if="hoveredEdge === 'bottom' || selectedEdge === 'bottom'">
          <rect
            x="150"
            y="375"
            width="600"
            height="80"
            :fill="getEdgeHighlightColor('bottom')"
            :opacity="hoveredEdge === 'bottom' ? 0.15 : 0.08"
            class="edge-zone-fill"
          />
          <line
            x1="150"
            y1="375"
            x2="750"
            y2="375"
            :stroke="getEdgeHighlightColor('bottom')"
            :stroke-width="getEdgeHighlightWidth('bottom')"
            stroke-linecap="round"
            class="edge-highlight"
          />
          <rect
            x="150"
            y="375"
            width="600"
            height="15"
            :fill="getEdgeHighlightColor('bottom')"
            :opacity="0.2"
            class="edge-glow"
          />
        </g>

        <!-- Left Edge Highlight -->
        <g v-if="hoveredEdge === 'left' || selectedEdge === 'left'">
          <rect
            x="70"
            y="125"
            width="80"
            height="250"
            :fill="getEdgeHighlightColor('left')"
            :opacity="hoveredEdge === 'left' ? 0.15 : 0.08"
            class="edge-zone-fill"
          />
          <line
            x1="150"
            y1="125"
            x2="150"
            y2="375"
            :stroke="getEdgeHighlightColor('left')"
            :stroke-width="getEdgeHighlightWidth('left')"
            stroke-linecap="round"
            class="edge-highlight"
          />
          <rect
            x="135"
            y="125"
            width="15"
            height="250"
            :fill="getEdgeHighlightColor('left')"
            :opacity="0.2"
            class="edge-glow"
          />
        </g>

        <!-- Right Edge Highlight -->
        <g v-if="hoveredEdge === 'right' || selectedEdge === 'right'">
          <rect
            x="750"
            y="125"
            width="80"
            height="250"
            :fill="getEdgeHighlightColor('right')"
            :opacity="hoveredEdge === 'right' ? 0.15 : 0.08"
            class="edge-zone-fill"
          />
          <line
            x1="750"
            y1="125"
            x2="750"
            y2="375"
            :stroke="getEdgeHighlightColor('right')"
            :stroke-width="getEdgeHighlightWidth('right')"
            stroke-linecap="round"
            class="edge-highlight"
          />
          <rect
            x="750"
            y="125"
            width="15"
            height="250"
            :fill="getEdgeHighlightColor('right')"
            :opacity="0.2"
            class="edge-glow"
          />
        </g>

        <!-- Court Lines (for reference) -->
        <g class="court-lines" opacity="0.5" pointer-events="none">
          <!-- Net -->
          <line
            x1="450"
            y1="125"
            x2="450"
            y2="375"
            stroke="#ffffff"
            stroke-width="2"
            stroke-dasharray="5,5"
          />

          <!-- Service lines -->
          <line
            x1="305"
            y1="187"
            x2="305"
            y2="313"
            stroke="#ffffff"
            stroke-width="1"
          />
          <line
            x1="595"
            y1="187"
            x2="595"
            y2="313"
            stroke="#ffffff"
            stroke-width="1"
          />

          <!-- Center service lines -->
          <line
            x1="305"
            y1="187"
            x2="595"
            y2="187"
            stroke="#ffffff"
            stroke-width="1"
          />
          <line
            x1="305"
            y1="313"
            x2="595"
            y2="313"
            stroke="#ffffff"
            stroke-width="1"
          />

          <!-- Center line -->
          <line
            x1="450"
            y1="187"
            x2="450"
            y2="313"
            stroke="#ffffff"
            stroke-width="1"
          />
        </g>

        <!-- Camera Position Indicator -->
        <g v-if="cameraPosition" class="camera-indicator" pointer-events="none">
          <defs>
            <filter
              id="camera-shadow"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
              <feOffset dx="0" dy="2" result="offsetblur" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.3" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- Camera icon -->
          <g :transform="`translate(${cameraPosition.x}, ${cameraPosition.y})`">
            <!-- Shadow circle -->
            <circle
              r="15"
              fill="#000000"
              opacity="0.1"
              transform="translate(0, 3)"
            />

            <!-- Main camera circle -->
            <circle
              r="12"
              fill="#3b82f6"
              stroke="#ffffff"
              stroke-width="2"
              filter="url(#camera-shadow)"
            />

            <!-- Camera lens -->
            <circle r="5" fill="#1e40af" />

            <!-- View direction indicator -->
            <line
              x1="0"
              y1="0"
              :x2="Math.cos(cameraAngle) * 25"
              :y2="Math.sin(cameraAngle) * 25"
              stroke="#3b82f6"
              stroke-width="3"
              stroke-linecap="round"
              opacity="0.7"
            />

            <!-- Distance label -->
            <text
              :x="0"
              :y="-20"
              text-anchor="middle"
              fill="#1f2937"
              font-size="14"
              font-weight="600"
            >
              {{
                typeof distanceFromEdge === 'number'
                  ? distanceFromEdge.toFixed(1)
                  : '5.0'
              }}m
            </text>
          </g>
        </g>

        <!-- Edge Labels -->
        <g class="edge-labels" pointer-events="none">
          <text
            x="450"
            y="85"
            text-anchor="middle"
            :fill="selectedEdge === 'top' ? '#3b82f6' : '#6b7280'"
            font-size="14"
            font-weight="500"
            class="edge-label"
          >
            Far Baseline
          </text>
          <text
            x="450"
            y="425"
            text-anchor="middle"
            :fill="selectedEdge === 'bottom' ? '#3b82f6' : '#6b7280'"
            font-size="14"
            font-weight="500"
            class="edge-label"
          >
            Near Baseline
          </text>
          <text
            x="110"
            y="250"
            text-anchor="middle"
            :fill="selectedEdge === 'left' ? '#3b82f6' : '#6b7280'"
            font-size="14"
            font-weight="500"
            transform="rotate(-90, 110, 250)"
            class="edge-label"
          >
            Left Sideline
          </text>
          <text
            x="790"
            y="250"
            text-anchor="middle"
            :fill="selectedEdge === 'right' ? '#3b82f6' : '#6b7280'"
            font-size="14"
            font-weight="500"
            transform="rotate(90, 790, 250)"
            class="edge-label"
          >
            Right Sideline
          </text>
        </g>
      </svg>
    </div>

    <!-- Camera Controls Panel (Horizontal Layout) -->
    <div v-if="selectedEdge" class="camera-controls-panel">
      <div class="controls-horizontal-grid">
        <!-- Distance Control -->
        <div class="control-group">
          <label class="control-label">
            Distance from {{ getEdgeLabel(selectedEdge) }}
          </label>
          <div class="control-input-group">
            <input
              v-model="distanceFromEdge"
              type="range"
              :min="minDistance"
              :max="maxDistance"
              step="0.5"
              class="control-slider"
              @input="updateCameraPosition"
            />
            <div class="input-with-unit">
              <input
                v-model.number="distanceFromEdge"
                type="number"
                :min="minDistance"
                :max="maxDistance"
                step="0.5"
                class="control-input"
                @input="updateCameraPosition"
              />
              <span class="input-unit">m</span>
            </div>
          </div>
          <div class="slider-range-labels">
            <span>{{ minDistance }}m</span>
            <span>{{ maxDistance }}m</span>
          </div>
        </div>

        <!-- Height Control -->
        <div class="control-group">
          <label class="control-label">Camera Height</label>
          <div class="control-input-group">
            <input
              v-model="cameraHeight"
              type="range"
              min="1.5"
              max="2"
              step="0.1"
              class="control-slider"
              @input="updateCameraPosition"
            />
            <div class="input-with-unit">
              <input
                v-model.number="cameraHeight"
                type="number"
                min="1.5"
                max="2"
                step="0.1"
                class="control-input"
                @input="updateCameraPosition"
              />
              <span class="input-unit">m</span>
            </div>
          </div>
          <div class="slider-range-labels">
            <span>1.5m</span>
            <span>2m</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Position Summary -->
    <div v-if="cameraPosition" class="position-summary">
      <h4 class="text-sm font-medium text-gray-700 mb-2">
        Camera Position Summary
      </h4>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">Edge:</span>
          <span class="summary-value">{{ getEdgeLabel(selectedEdge) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Distance:</span>
          <span class="summary-value"
            >{{
              typeof distanceFromEdge === 'number'
                ? distanceFromEdge.toFixed(1)
                : '5.0'
            }}m</span
          >
        </div>
        <div class="summary-item">
          <span class="summary-label">Height:</span>
          <span class="summary-value"
            >{{
              typeof cameraHeight === 'number'
                ? cameraHeight.toFixed(1)
                : '3.5'
            }}m</span
          >
        </div>
        <div class="summary-item">
          <span class="summary-label">3D Position:</span>
          <span class="summary-value font-mono text-xs">
            ({{ camera3DPosition.x.toFixed(1) }},
            {{ camera3DPosition.y.toFixed(1) }},
            {{ camera3DPosition.z.toFixed(1) }})
          </span>
        </div>
      </div>
    </div>

    <!-- Comparison with Alternative Methods -->
    <div class="method-comparison">
      <button
        class="comparison-toggle"
        @click="showComparison = !showComparison"
      >
        <span>{{ showComparison ? 'Hide' : 'Show' }} Alternative Methods</span>
        <svg
          :class="['toggle-icon', showComparison ? 'rotate-180' : '']"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <div v-if="showComparison" class="comparison-content">
        <div class="method-grid">
          <div class="method-card active">
            <h5 class="method-title">Edge Selection (Current)</h5>
            <div class="method-pros">
              <span class="pro-label">Pros:</span>
              <ul>
                <li>Intuitive court-relative positioning</li>
                <li>Precise distance control</li>
                <li>Clear spatial relationship</li>
                <li>Consistent camera placement</li>
              </ul>
            </div>
            <div class="method-score">
              <span class="score-label">Accuracy:</span>
              <div class="score-bar high" />
            </div>
          </div>

          <div class="method-card">
            <h5 class="method-title">Free-form Dragging</h5>
            <div class="method-pros">
              <span class="pro-label">Pros:</span>
              <ul>
                <li>Complete freedom</li>
                <li>Quick positioning</li>
              </ul>
              <span class="con-label">Cons:</span>
              <ul>
                <li>Less precise</li>
                <li>Difficult to replicate</li>
              </ul>
            </div>
            <div class="method-score">
              <span class="score-label">Accuracy:</span>
              <div class="score-bar medium" />
            </div>
          </div>

          <div class="method-card">
            <h5 class="method-title">Coordinate Input</h5>
            <div class="method-pros">
              <span class="pro-label">Pros:</span>
              <ul>
                <li>Exact positioning</li>
                <li>Reproducible</li>
              </ul>
              <span class="con-label">Cons:</span>
              <ul>
                <li>Not intuitive</li>
                <li>Requires knowledge</li>
              </ul>
            </div>
            <div class="method-score">
              <span class="score-label">Accuracy:</span>
              <div class="score-bar high" />
            </div>
          </div>

          <div class="method-card">
            <h5 class="method-title">Preset Templates</h5>
            <div class="method-pros">
              <span class="pro-label">Pros:</span>
              <ul>
                <li>Fast setup</li>
                <li>Standard positions</li>
              </ul>
              <span class="con-label">Cons:</span>
              <ul>
                <li>Limited options</li>
                <li>Not customizable</li>
              </ul>
            </div>
            <div class="method-score">
              <span class="score-label">Accuracy:</span>
              <div class="score-bar low" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

// Types
type EdgeType = 'top' | 'bottom' | 'left' | 'right';

interface CameraPosition3D {
  x: number;
  y: number;
  z: number;
}

interface Props {
  modelValue?: {
    edge: EdgeType | null;
    distance: number;
    height: number;
    position3D?: CameraPosition3D;
  };
  courtDimensions?: {
    length: number;
    width: number;
  };
  svgWidth?: number;
  svgHeight?: number;
}

// Props and Emits
const props = withDefaults(defineProps<Props>(), {
  courtDimensions: () => ({ length: 23.77, width: 10.97 }), // Tennis court dimensions
  svgWidth: 900,
  svgHeight: 500,
});

const emit = defineEmits<{
  'update:modelValue': [
    value: {
      edge: EdgeType | null;
      distance: number;
      height: number;
      position3D: CameraPosition3D;
    }
  ];
  'edge-selected': [edge: EdgeType];
  'position-changed': [position: CameraPosition3D];
}>();

// State
const selectedEdge = ref<EdgeType | null>(props.modelValue?.edge || null);
const hoveredEdge = ref<EdgeType | null>(null);
const distanceFromEdge = ref<number>(props.modelValue?.distance || 3);
const cameraHeight = ref<number>(props.modelValue?.height || 1.75);
const showComparison = ref(false);

// Constants
const minDistance = 1;
const maxDistance = 5;

// SVG coordinate mapping (adjusted for optimized court size)
const courtBounds = {
  left: 150,
  right: 750,
  top: 125,
  bottom: 375,
};

// Computed
const cameraPosition = computed(() => {
  if (!selectedEdge.value) return null;

  const distance = Number(distanceFromEdge.value) || 3;
  // Reduced scale factor for less visual movement
  const scaleFactor = 15; // Further reduced to keep camera closer to court
  let x = 0;
  let y = 0;

  switch (selectedEdge.value) {
    case 'top':
      x = (courtBounds.left + courtBounds.right) / 2;
      y = Math.max(25, courtBounds.top - distance * scaleFactor); // Ensure it stays within bounds
      break;
    case 'bottom':
      x = (courtBounds.left + courtBounds.right) / 2;
      y = Math.min(475, courtBounds.bottom + distance * scaleFactor);
      break;
    case 'left':
      x = Math.max(25, courtBounds.left - distance * scaleFactor);
      y = (courtBounds.top + courtBounds.bottom) / 2;
      break;
    case 'right':
      x = Math.min(875, courtBounds.right + distance * scaleFactor);
      y = (courtBounds.top + courtBounds.bottom) / 2;
      break;
  }

  return { x, y };
});

const cameraAngle = computed(() => {
  if (!selectedEdge.value) return 0;

  switch (selectedEdge.value) {
    case 'top':
      return Math.PI / 2; // Looking down
    case 'bottom':
      return -Math.PI / 2; // Looking up
    case 'left':
      return 0; // Looking right
    case 'right':
      return Math.PI; // Looking left
    default:
      return 0;
  }
});

const camera3DPosition = computed((): CameraPosition3D => {
  const height = Number(cameraHeight.value) || 1.75;
  const distance = Number(distanceFromEdge.value) || 3;

  if (!selectedEdge.value) {
    return { x: 0, y: 0, z: height };
  }

  const { length, width } = props.courtDimensions;
  let x = 0;
  let y = 0;

  switch (selectedEdge.value) {
    case 'top':
      x = width / 2;
      y = -distance;
      break;
    case 'bottom':
      x = width / 2;
      y = length + distance;
      break;
    case 'left':
      x = -distance;
      y = length / 2;
      break;
    case 'right':
      x = width + distance;
      y = length / 2;
      break;
  }

  return { x, y, z: height };
});

// Methods
const getEdgeClass = (edge: EdgeType): string => {
  const classes = ['edge-zone'];
  if (hoveredEdge.value === edge) classes.push('hovered');
  if (selectedEdge.value === edge) classes.push('selected');
  return classes.join(' ');
};

const getEdgeHighlightColor = (edge: EdgeType): string => {
  if (selectedEdge.value === edge) return '#3b82f6';
  if (hoveredEdge.value === edge) return '#60a5fa';
  return '#9ca3af';
};

const getEdgeHighlightWidth = (edge: EdgeType): number => {
  if (selectedEdge.value === edge) return 4;
  if (hoveredEdge.value === edge) return 3;
  return 2;
};

const getEdgeLabel = (edge: EdgeType | null): string => {
  if (!edge) return '';
  const labels: Record<EdgeType, string> = {
    top: 'Far Baseline',
    bottom: 'Near Baseline',
    left: 'Left Sideline',
    right: 'Right Sideline',
  };
  return labels[edge];
};

const handleEdgeHover = (edge: EdgeType) => {
  hoveredEdge.value = edge;
};

const handleEdgeLeave = (edge: EdgeType) => {
  if (hoveredEdge.value === edge) {
    hoveredEdge.value = null;
  }
};

const handleMouseLeave = () => {
  hoveredEdge.value = null;
};

const handleEdgeClick = (edge: EdgeType) => {
  selectedEdge.value = edge;
  emit('edge-selected', edge);
  updateCameraPosition();
};

const updateCameraPosition = () => {
  if (!selectedEdge.value) return;

  // Ensure values are numbers and within bounds
  const distance = Math.min(
    maxDistance,
    Math.max(minDistance, Number(distanceFromEdge.value) || 3)
  );
  const height = Math.min(2, Math.max(1.5, Number(cameraHeight.value) || 1.75));

  const value = {
    edge: selectedEdge.value,
    distance: distance,
    height: height,
    position3D: camera3DPosition.value,
  };

  emit('update:modelValue', value);
  emit('position-changed', camera3DPosition.value);
};

// Watch for external changes
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue) {
      selectedEdge.value = newValue.edge;
      distanceFromEdge.value = newValue.distance;
      cameraHeight.value = newValue.height;
    }
  },
  { deep: true }
);
</script>

<style scoped>
.edge-based-camera-selector {
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
  padding: 1.5rem;
}

.edge-based-camera-selector > * + * {
  margin-top: 1.5rem;
}

.selector-header {
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 1rem;
}

.selector-header h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
}

.selector-header p {
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.court-container {
  background-color: #f9fafb;
  border-radius: 0.5rem;
  padding: 1rem;
}

.court-svg {
  width: 100%;
  height: auto;
  border-radius: 0.375rem;
}

.edge-zone {
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}

.edge-zone:hover {
  fill: rgba(59, 130, 246, 0.12) !important;
}

.edge-zone.hovered {
  opacity: 0.7;
  fill: rgba(59, 130, 246, 0.15) !important;
}

.edge-zone.selected {
  opacity: 0.8;
  fill: rgba(59, 130, 246, 0.18) !important;
}

.edge-zone-fill {
  transition: opacity 0.15s ease-in-out;
  pointer-events: none;
}

.edge-highlight {
  transition: all 0.15s ease-in-out;
  filter: drop-shadow(0 0 8px currentColor);
  pointer-events: none;
}

.edge-glow {
  transition: opacity 0.15s ease-in-out;
  pointer-events: none;
}

.edge-label {
  transition: fill 0.2s;
  user-select: none;
  pointer-events: none;
}

.camera-controls-panel {
  background-color: #f9fafb;
  border-radius: 0.5rem;
  padding: 1rem;
}

.controls-horizontal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2.5rem;
}

@media (max-width: 768px) {
  .controls-horizontal-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.control-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.25rem;
}

.control-input-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.control-slider {
  flex: 1;
  height: 0.5rem;
  background-color: #e5e7eb;
  border-radius: 0.5rem;
  appearance: none;
  cursor: pointer;
}

.control-slider::-webkit-slider-thumb {
  appearance: none;
  width: 1rem;
  height: 1rem;
  background-color: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.control-slider::-moz-range-thumb {
  width: 1rem;
  height: 1rem;
  background-color: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  border: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 4rem;
}

.control-input {
  width: 3.5rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  background-color: white;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  text-align: center;
}

.control-input:focus {
  outline: none;
  ring: 2px;
  ring-color: #3b82f6;
  border-color: #3b82f6;
}

.input-unit {
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 500;
}

.slider-range-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 0.25rem;
}

.slider-range-labels span {
  font-size: 0.75rem;
  color: #6b7280;
}

.position-summary {
  background-color: #eff6ff;
  border-radius: 0.5rem;
  padding: 1rem;
}

.position-summary h4 {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.summary-item {
  display: flex;
  flex-direction: column;
}

.summary-label {
  font-size: 0.75rem;
  color: #6b7280;
}

.summary-value {
  font-size: 0.875rem;
  font-weight: 500;
  color: #111827;
}

.method-comparison {
  border-top: 1px solid #e5e7eb;
  padding-top: 1rem;
}

.comparison-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  background-color: #f9fafb;
  border-radius: 0.375rem;
  transition: background-color 0.15s;
  cursor: pointer;
  border: none;
}

.comparison-toggle:hover {
  background-color: #f3f4f6;
}

.toggle-icon {
  transition: transform 0.2s;
}

.toggle-icon.rotate-180 {
  transform: rotate(180deg);
}

.comparison-content {
  margin-top: 1rem;
}

.comparison-content > * + * {
  margin-top: 1rem;
}

.method-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 1rem;
}

@media (min-width: 768px) {
  .method-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.method-card {
  background-color: #f9fafb;
  border-radius: 0.5rem;
  padding: 1rem;
}

.method-card > * + * {
  margin-top: 0.75rem;
}

.method-card.active {
  background-color: #eff6ff;
  border: 2px solid #bfdbfe;
}

.method-title {
  font-weight: 500;
  color: #111827;
}

.method-pros {
  font-size: 0.875rem;
}

.method-pros > * + * {
  margin-top: 0.25rem;
}

.pro-label,
.con-label {
  font-weight: 500;
  color: #374151;
}

.method-pros ul {
  margin-left: 1rem;
  list-style-type: disc;
  list-style-position: inside;
  color: #6b7280;
}

.method-score {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.score-label {
  font-size: 0.75rem;
  color: #6b7280;
}

.score-bar {
  height: 0.5rem;
  border-radius: 9999px;
  flex: 1;
}

.score-bar.high {
  background-color: #34d399;
  width: 90%;
}

.score-bar.medium {
  background-color: #fbbf24;
  width: 60%;
}

.score-bar.low {
  background-color: #f87171;
  width: 30%;
}

.camera-indicator {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
