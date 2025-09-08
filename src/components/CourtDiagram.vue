<template>
  <div class="court-diagram">
    <svg
      :width="svgWidth"
      :height="svgHeight"
      viewBox="0 0 800 400"
      class="court-svg"
      @mouseleave="handleMouseLeave"
    >
      <!-- Court background -->
      <rect
        x="50"
        y="50"
        width="700"
        height="300"
        fill="#2d5a27"
        stroke="#ffffff"
        stroke-width="2"
        class="court-background"
      />

      <!-- Out-of-bounds area (for camera placement visualization) -->
      <rect
        x="0"
        y="0"
        width="800"
        height="400"
        fill="#1a3d1a"
        fill-opacity="0.3"
        class="out-of-bounds"
      />

      <!-- Badminton court lines - Simplified to 3 essential lines -->
      <g class="court-lines">
        <!-- Long Service Line for Doubles (back boundary) -->
        <line
          :id="'service-long-doubles'"
          x1="150"
          y1="310"
          x2="650"
          y2="310"
          :stroke="getLineColor('service-long-doubles')"
          :stroke-width="getLineWidth('service-long-doubles')"
          :class="getLineClass('service-long-doubles')"
          @click="handleLineClick('service-long-doubles')"
          @mouseenter="handleLineHover('service-long-doubles')"
          @mouseleave="handleLineLeave('service-long-doubles')"
        />

        <!-- Center Line (dividing service courts) -->
        <line
          :id="'center-line'"
          x1="400"
          y1="90"
          x2="400"
          y2="310"
          :stroke="getLineColor('center-line')"
          :stroke-width="getLineWidth('center-line')"
          :class="getLineClass('center-line')"
          @click="handleLineClick('center-line')"
          @mouseenter="handleLineHover('center-line')"
          @mouseleave="handleLineLeave('center-line')"
        />

        <!-- Short Service Line (front boundary) -->
        <line
          :id="'service-short'"
          x1="150"
          y1="140"
          x2="650"
          y2="140"
          :stroke="getLineColor('service-short')"
          :stroke-width="getLineWidth('service-short')"
          :class="getLineClass('service-short')"
          @click="handleLineClick('service-short')"
          @mouseenter="handleLineHover('service-short')"
          @mouseleave="handleLineLeave('service-short')"
        />

        <!-- Net line (for reference, not selectable) -->
        <line
          x1="50"
          y1="200"
          x2="750"
          y2="200"
          stroke="#666666"
          stroke-width="1"
          stroke-dasharray="5,5"
          opacity="0.5"
        />

        <!-- Court outline (for reference) -->
        <rect
          x="150"
          y="50"
          width="500"
          height="300"
          fill="none"
          stroke="#999999"
          stroke-width="1"
          opacity="0.3"
        />
      </g>

      <!-- Camera position indicator (if provided) -->
      <g v-if="cameraPosition" class="camera-indicator">
        <circle
          :cx="cameraPosition.x"
          :cy="cameraPosition.y"
          r="8"
          fill="#ff4444"
          stroke="#ffffff"
          stroke-width="2"
          class="camera-position"
        />
        <text
          :x="cameraPosition.x"
          :y="cameraPosition.y - 15"
          text-anchor="middle"
          fill="#ffffff"
          font-size="12"
          font-weight="bold"
        >
          Camera
        </text>
      </g>

      <!-- Perspective grid overlay (if enabled) -->
      <g v-if="showPerspectiveGrid" class="perspective-grid">
        <defs>
          <pattern
            id="perspectiveGrid"
            x="0"
            y="0"
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="#ffffff"
              stroke-width="0.5"
              opacity="0.3"
            />
          </pattern>
        </defs>
        <rect
          x="50"
          y="50"
          width="700"
          height="300"
          fill="url(#perspectiveGrid)"
        />
      </g>
    </svg>

    <!-- Line selection legend -->
    <div v-if="selectedLines.length > 0" class="selection-legend">
      <h4>Selected Lines:</h4>
      <div class="selected-lines-list">
        <div
          v-for="lineId in selectedLines"
          :key="lineId"
          class="selected-line-item"
        >
          <div
            class="line-color-indicator"
            :style="{ backgroundColor: getSelectedLineColor(lineId) }"
          />
          <span>{{ formatLineLabel(lineId) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

// Props
interface Props {
  courtType?: 'tennis' | 'badminton';
  selectedLines?: string[];
  availableLines?: string[];
  cameraPosition?: { x: number; y: number } | null;
  showPerspectiveGrid?: boolean;
  svgWidth?: number;
  svgHeight?: number;
}

const props = withDefaults(defineProps<Props>(), {
  courtType: 'tennis',
  selectedLines: () => [],
  availableLines: () => [],
  cameraPosition: null,
  showPerspectiveGrid: false,
  svgWidth: 800,
  svgHeight: 400,
});

// Emits
const emit = defineEmits<{
  'line-selected': [lineId: string];
  'line-deselected': [lineId: string];
  'line-hovered': [lineId: string];
  'line-unhovered': [lineId: string];
}>();

// State
const hoveredLine = ref<string | null>(null);

// Selection colors for different lines
const selectionColors = [
  '#ff4444', // Red
  '#44ff44', // Green
  '#4444ff', // Blue
  '#ffff44', // Yellow
  '#ff44ff', // Magenta
  '#44ffff', // Cyan
];

// Computed properties
const isLineSelected = (lineId: string): boolean => {
  return props.selectedLines.includes(lineId);
};

const isLineAvailable = (lineId: string): boolean => {
  return (
    props.availableLines.length === 0 || props.availableLines.includes(lineId)
  );
};

const isLineHovered = (lineId: string): boolean => {
  return hoveredLine.value === lineId;
};

// Methods
const getLineColor = (lineId: string): string => {
  if (isLineSelected(lineId)) {
    return getSelectedLineColor(lineId);
  }
  if (isLineHovered(lineId) && isLineAvailable(lineId)) {
    return '#ffffff';
  }
  if (isLineAvailable(lineId)) {
    return '#cccccc';
  }
  return '#666666';
};

const getLineWidth = (lineId: string): number => {
  if (isLineSelected(lineId)) {
    return 4;
  }
  if (isLineHovered(lineId) && isLineAvailable(lineId)) {
    return 3;
  }
  return 2;
};

const getLineClass = (lineId: string): string => {
  const classes = ['court-line'];

  if (isLineSelected(lineId)) {
    classes.push('selected');
  }
  if (isLineAvailable(lineId)) {
    classes.push('available');
  }
  if (isLineHovered(lineId)) {
    classes.push('hovered');
  }

  return classes.join(' ');
};

const getSelectedLineColor = (lineId: string): string => {
  const index = props.selectedLines.indexOf(lineId);
  if (index >= 0) {
    return selectionColors[index % selectionColors.length] || '#ffffff';
  }
  return '#ffffff';
};

const formatLineLabel = (lineId: string): string => {
  return lineId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Event handlers
const handleLineClick = (lineId: string): void => {
  if (!isLineAvailable(lineId)) {
    return;
  }

  if (isLineSelected(lineId)) {
    emit('line-deselected', lineId);
  } else {
    emit('line-selected', lineId);
  }
};

const handleLineHover = (lineId: string): void => {
  if (isLineAvailable(lineId)) {
    hoveredLine.value = lineId;
    emit('line-hovered', lineId);
  }
};

const handleLineLeave = (lineId: string): void => {
  if (hoveredLine.value === lineId) {
    hoveredLine.value = null;
    emit('line-unhovered', lineId);
  }
};

const handleMouseLeave = (): void => {
  if (hoveredLine.value) {
    const lineId = hoveredLine.value;
    hoveredLine.value = null;
    emit('line-unhovered', lineId);
  }
};
</script>

<style scoped>
.court-diagram {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background-color: #1a1a1a;
  border-radius: 8px;
}

.court-svg {
  border: 1px solid #333;
  border-radius: 4px;
  background-color: #0a0a0a;
}

.court-line {
  cursor: pointer;
  transition: all 0.2s ease;
}

.court-line.available:hover {
  filter: drop-shadow(0 0 4px currentColor);
}

.court-line.selected {
  filter: drop-shadow(0 0 6px currentColor);
}

.court-line:not(.available) {
  cursor: not-allowed;
  opacity: 0.5;
}

.camera-position {
  filter: drop-shadow(0 0 4px #ff4444);
}

.selection-legend {
  background-color: #2a2a2a;
  padding: 1rem;
  border-radius: 6px;
  border: 1px solid #444;
  min-width: 200px;
}

.selection-legend h4 {
  margin: 0 0 0.5rem 0;
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 600;
}

.selected-lines-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.selected-line-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #cccccc;
  font-size: 0.8rem;
}

.line-color-indicator {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid #666;
}

.out-of-bounds {
  pointer-events: none;
}

.perspective-grid {
  pointer-events: none;
}
</style>
