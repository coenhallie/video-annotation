<template>
  <div
    class="enhanced-roi-selector absolute inset-0 pointer-events-auto"
    :style="{ zIndex: 15 }"
    @mousedown="startSelection"
    @mousemove="updateSelection"
    @mouseup="endSelection"
    @mouseleave="endSelection"
  >
    <!-- Current ROI Bounding Box -->
    <div
      v-if="currentROI && showROI"
      class="roi-box absolute border-2"
      :class="roiBoxClasses"
      :style="roiBoxStyle"
      @mousedown="startDrag"
    >
      <!-- ROI Label with enhanced info -->
      <div
        class="roi-label absolute -top-8 left-0 px-2 py-1 text-xs rounded shadow-lg"
        :class="roiLabelClasses"
      >
        <div class="font-semibold">
          ROI: {{ Math.round(currentROI.width * canvasWidth) }}×{{
            Math.round(currentROI.height * canvasHeight)
          }}
        </div>
        <div v-if="showConfidenceInLabel" class="text-xs opacity-90">
          Confidence: {{ (roiConfidence * 100).toFixed(1) }}% | Stability:
          {{ (stabilityScore * 100).toFixed(1) }}%
        </div>
      </div>

      <!-- Predicted ROI overlay (ghost) -->
      <div
        v-if="predictedROI && showPrediction"
        class="predicted-roi absolute border border-dashed opacity-50"
        :style="predictedROIStyle"
      ></div>

      <!-- Resize handles -->
      <div
        class="resize-handle absolute w-2 h-2 -top-1 -left-1 cursor-nw-resize"
        :class="handleClasses"
        @mousedown.stop="startResize('nw')"
      ></div>
      <div
        class="resize-handle absolute w-2 h-2 -top-1 -right-1 cursor-ne-resize"
        :class="handleClasses"
        @mousedown.stop="startResize('ne')"
      ></div>
      <div
        class="resize-handle absolute w-2 h-2 -bottom-1 -left-1 cursor-sw-resize"
        :class="handleClasses"
        @mousedown.stop="startResize('sw')"
      ></div>
      <div
        class="resize-handle absolute w-2 h-2 -bottom-1 -right-1 cursor-se-resize"
        :class="handleClasses"
        @mousedown.stop="startResize('se')"
      ></div>

      <!-- Control buttons -->
      <div class="roi-controls absolute -top-8 -right-8 flex gap-1">
        <!-- Adaptive ROI toggle -->
        <button
          class="control-btn w-6 h-6 rounded text-xs"
          :class="
            adaptiveROI ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'
          "
          @click.stop="toggleAdaptiveROI"
          title="Toggle Adaptive ROI"
        >
          A
        </button>

        <!-- Motion prediction toggle -->
        <button
          class="control-btn w-6 h-6 rounded text-xs"
          :class="
            motionPrediction
              ? 'bg-blue-500 text-white'
              : 'bg-gray-500 text-white'
          "
          @click.stop="toggleMotionPrediction"
          title="Toggle Motion Prediction"
        >
          M
        </button>

        <!-- Delete button -->
        <button
          class="control-btn w-6 h-6 rounded text-xs bg-red-500 text-white hover:bg-red-600"
          @click.stop="clearROI"
          title="Delete ROI"
        >
          ×
        </button>
      </div>
    </div>

    <!-- ROI History visualization -->
    <div v-if="showHistory && roiHistory.length > 1" class="roi-history">
      <div
        v-for="(historyItem, index) in recentHistory"
        :key="index"
        class="history-roi absolute border border-gray-400 pointer-events-none"
        :style="getHistoryROIStyle(historyItem, index)"
      ></div>
    </div>

    <!-- Selection preview while drawing -->
    <div
      v-if="isSelecting && selectionBox"
      class="selection-preview absolute border-2 border-dashed border-blue-300"
      :style="selectionBoxStyle"
    ></div>

    <!-- Enhanced instructions overlay -->
    <div
      v-if="!currentROI && showInstructions"
      class="instructions absolute top-4 left-4 bg-black bg-opacity-80 text-white px-4 py-3 rounded-lg text-sm max-w-sm"
    >
      <div class="font-semibold mb-2 text-blue-300">Enhanced ROI Selection</div>
      <div class="text-xs space-y-1">
        <div>• Click and drag to select a region of interest</div>
        <div>• ROI will automatically adapt and track poses</div>
        <div>• Motion prediction helps with fast movements</div>
        <div>• Temporal smoothing reduces jitter</div>
      </div>
    </div>

    <!-- ROI Statistics Panel -->
    <div
      v-if="currentROI && showStats"
      class="roi-stats absolute bottom-4 left-4 bg-black bg-opacity-80 text-white px-3 py-2 rounded text-xs max-w-xs"
    >
      <div class="font-semibold mb-1 text-green-300">ROI Statistics</div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          Size: {{ Math.round(currentROI.width * 100) }}% ×
          {{ Math.round(currentROI.height * 100) }}%
        </div>
        <div>Confidence: {{ (roiConfidence * 100).toFixed(1) }}%</div>
        <div>Stability: {{ (stabilityScore * 100).toFixed(1) }}%</div>
        <div>Velocity: {{ velocityMagnitude.toFixed(3) }}</div>
        <div>History: {{ roiHistory.length }} frames</div>
        <div>Adaptive: {{ adaptiveROI ? 'ON' : 'OFF' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, toRefs } from 'vue';

const props = defineProps({
  // Canvas dimensions
  canvasWidth: {
    type: Number,
    default: 1920,
  },
  canvasHeight: {
    type: Number,
    default: 1080,
  },

  // Enhanced ROI state from pose landmarker
  currentROI: {
    type: Object,
    default: null,
  },

  predictedROI: {
    type: Object,
    default: null,
  },

  roiHistory: {
    type: Array,
    default: () => [],
  },

  roiConfidence: {
    type: Number,
    default: 0,
  },

  stabilityMetrics: {
    type: Object,
    default: () => ({
      stabilityScore: 0,
      velocityEstimate: { x: 0, y: 0 },
      averageSize: { width: 0, height: 0 },
      averagePosition: { x: 0, y: 0 },
    }),
  },

  // Settings
  adaptiveROI: {
    type: Boolean,
    default: false,
  },

  motionPrediction: {
    type: Boolean,
    default: false,
  },

  // Visibility controls
  showROI: {
    type: Boolean,
    default: true,
  },

  showPrediction: {
    type: Boolean,
    default: true,
  },

  showHistory: {
    type: Boolean,
    default: false,
  },

  showInstructions: {
    type: Boolean,
    default: true,
  },

  showStats: {
    type: Boolean,
    default: false,
  },

  showConfidenceInLabel: {
    type: Boolean,
    default: true,
  },

  // Enable/disable selection
  enabled: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits([
  'roi-selected',
  'roi-updated',
  'roi-cleared',
  'adaptive-roi-toggled',
  'motion-prediction-toggled',
]);

const { canvasWidth, canvasHeight, enabled } = toRefs(props);

// Selection state
const isSelecting = ref(false);
const isResizing = ref(false);
const isDragging = ref(false);
const resizeMode = ref('');
const selectionBox = ref(null);
const startPoint = ref({ x: 0, y: 0 });
const dragOffset = ref({ x: 0, y: 0 });

// Computed properties for enhanced visualization
const stabilityScore = computed(() => {
  return props.stabilityMetrics?.stabilityScore || 0;
});

const velocityMagnitude = computed(() => {
  const vel = props.stabilityMetrics?.velocityEstimate || { x: 0, y: 0 };
  return Math.sqrt(vel.x * vel.x + vel.y * vel.y);
});

const recentHistory = computed(() => {
  return props.roiHistory.slice(-5); // Show last 5 frames
});

// Dynamic styling based on ROI quality - transparent background
const roiBoxClasses = computed(() => {
  const confidence = props.roiConfidence;
  const stability = stabilityScore.value;

  if (confidence > 0.8 && stability > 0.8) {
    return 'border-green-400';
  } else if (confidence > 0.6 && stability > 0.6) {
    return 'border-yellow-400';
  } else {
    return 'border-red-400';
  }
});

const roiLabelClasses = computed(() => {
  const confidence = props.roiConfidence;
  const stability = stabilityScore.value;

  if (confidence > 0.8 && stability > 0.8) {
    return 'bg-green-500 text-white';
  } else if (confidence > 0.6 && stability > 0.6) {
    return 'bg-yellow-500 text-white';
  } else {
    return 'bg-red-500 text-white';
  }
});

const handleClasses = computed(() => {
  const confidence = props.roiConfidence;

  if (confidence > 0.8) {
    return 'bg-green-500';
  } else if (confidence > 0.6) {
    return 'bg-yellow-500';
  } else {
    return 'bg-red-500';
  }
});

// Styling functions
const roiBoxStyle = computed(() => {
  if (!props.currentROI) return {};

  return {
    left: props.currentROI.x * 100 + '%',
    top: props.currentROI.y * 100 + '%',
    width: props.currentROI.width * 100 + '%',
    height: props.currentROI.height * 100 + '%',
    backgroundColor: 'transparent',
  };
});

const predictedROIStyle = computed(() => {
  if (!props.predictedROI || !props.currentROI) return {};

  // Calculate relative position to current ROI
  const relativeX =
    ((props.predictedROI.x - props.currentROI.x) / props.currentROI.width) *
    100;
  const relativeY =
    ((props.predictedROI.y - props.currentROI.y) / props.currentROI.height) *
    100;
  const relativeWidth =
    (props.predictedROI.width / props.currentROI.width) * 100;
  const relativeHeight =
    (props.predictedROI.height / props.currentROI.height) * 100;

  return {
    left: relativeX + '%',
    top: relativeY + '%',
    width: relativeWidth + '%',
    height: relativeHeight + '%',
    borderColor: '#60A5FA',
  };
});

const selectionBoxStyle = computed(() => {
  if (!selectionBox.value) return {};

  return {
    left: selectionBox.value.x * 100 + '%',
    top: selectionBox.value.y * 100 + '%',
    width: selectionBox.value.width * 100 + '%',
    height: selectionBox.value.height * 100 + '%',
  };
});

const getHistoryROIStyle = (historyItem, index) => {
  const opacity = 0.1 + (index / recentHistory.value.length) * 0.3;

  return {
    left: historyItem.roi.x * 100 + '%',
    top: historyItem.roi.y * 100 + '%',
    width: historyItem.roi.width * 100 + '%',
    height: historyItem.roi.height * 100 + '%',
    opacity: opacity,
    borderWidth: '1px',
  };
};

// Convert mouse coordinates to normalized coordinates
const getRelativeCoordinates = (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
};

// Start ROI selection
const startSelection = (event) => {
  if (!enabled.value || isResizing.value || isDragging.value) return;
  if (props.currentROI) return; // Don't start new selection if ROI exists

  const coords = getRelativeCoordinates(event);
  startPoint.value = coords;
  isSelecting.value = true;
  selectionBox.value = {
    x: coords.x,
    y: coords.y,
    width: 0,
    height: 0,
  };
};

// Start dragging ROI
const startDrag = (event) => {
  if (!enabled.value || isResizing.value || isSelecting.value) return;
  event.stopPropagation();

  const coords = getRelativeCoordinates(event);
  isDragging.value = true;
  dragOffset.value = {
    x: coords.x - props.currentROI.x,
    y: coords.y - props.currentROI.y,
  };
};

// Update selection while dragging
const updateSelection = (event) => {
  if (!enabled.value) return;

  const coords = getRelativeCoordinates(event);

  if (isSelecting.value) {
    // Creating new selection
    const start = startPoint.value;
    selectionBox.value = {
      x: Math.min(start.x, coords.x),
      y: Math.min(start.y, coords.y),
      width: Math.abs(coords.x - start.x),
      height: Math.abs(coords.y - start.y),
    };
  } else if (isDragging.value && props.currentROI) {
    // Dragging existing ROI
    const newX = Math.max(
      0,
      Math.min(coords.x - dragOffset.value.x, 1 - props.currentROI.width)
    );
    const newY = Math.max(
      0,
      Math.min(coords.y - dragOffset.value.y, 1 - props.currentROI.height)
    );

    const updatedROI = {
      ...props.currentROI,
      x: newX,
      y: newY,
    };

    emit('roi-updated', updatedROI);
  } else if (isResizing.value && props.currentROI) {
    // Resizing ROI
    handleResize(coords);
  }
};

// Handle ROI resizing
const handleResize = (coords) => {
  if (!props.currentROI) return;

  const roi = { ...props.currentROI };
  const mode = resizeMode.value;

  switch (mode) {
    case 'nw':
      roi.width = Math.max(0.05, roi.width + (roi.x - coords.x));
      roi.height = Math.max(0.05, roi.height + (roi.y - coords.y));
      roi.x = Math.max(0, coords.x);
      roi.y = Math.max(0, coords.y);
      break;
    case 'ne':
      roi.width = Math.max(0.05, coords.x - roi.x);
      roi.height = Math.max(0.05, roi.height + (roi.y - coords.y));
      roi.y = Math.max(0, coords.y);
      break;
    case 'sw':
      roi.width = Math.max(0.05, roi.width + (roi.x - coords.x));
      roi.height = Math.max(0.05, coords.y - roi.y);
      roi.x = Math.max(0, coords.x);
      break;
    case 'se':
      roi.width = Math.max(0.05, coords.x - roi.x);
      roi.height = Math.max(0.05, coords.y - roi.y);
      break;
  }

  // Ensure ROI stays within bounds
  roi.x = Math.max(0, Math.min(roi.x, 1 - roi.width));
  roi.y = Math.max(0, Math.min(roi.y, 1 - roi.height));
  roi.width = Math.min(roi.width, 1 - roi.x);
  roi.height = Math.min(roi.height, 1 - roi.y);

  emit('roi-updated', roi);
};

// End selection/dragging/resizing
const endSelection = () => {
  if (isSelecting.value && selectionBox.value) {
    // Only create ROI if selection is large enough
    if (selectionBox.value.width > 0.05 && selectionBox.value.height > 0.05) {
      emit('roi-selected', { ...selectionBox.value });
    }
    isSelecting.value = false;
    selectionBox.value = null;
  }

  if (isDragging.value) {
    isDragging.value = false;
  }

  if (isResizing.value) {
    isResizing.value = false;
    resizeMode.value = '';
  }
};

// Start resizing ROI
const startResize = (mode) => {
  isResizing.value = true;
  resizeMode.value = mode;
};

// Clear ROI
const clearROI = () => {
  emit('roi-cleared');
};

// Toggle adaptive ROI
const toggleAdaptiveROI = () => {
  emit('adaptive-roi-toggled');
};

// Toggle motion prediction
const toggleMotionPrediction = () => {
  emit('motion-prediction-toggled');
};

// No need to return anything in script setup - all variables are automatically exposed
</script>

<style scoped>
.enhanced-roi-selector {
  cursor: crosshair;
}

.roi-box {
  cursor: move;
  transition: all 0.1s ease-out;
}

.resize-handle {
  z-index: 20;
  transition: all 0.1s ease-out;
}

.resize-handle:hover {
  transform: scale(1.2);
}

.control-btn {
  z-index: 20;
  transition: all 0.1s ease-out;
  font-weight: bold;
}

.control-btn:hover {
  transform: scale(1.1);
}

.selection-preview {
  pointer-events: none;
  animation: pulse 1s infinite;
}

.instructions {
  z-index: 20;
  backdrop-filter: blur(4px);
}

.roi-stats {
  z-index: 20;
  backdrop-filter: blur(4px);
  font-family: 'Courier New', monospace;
}

.history-roi {
  transition: opacity 0.2s ease-out;
}

.predicted-roi {
  animation: predictive-pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

@keyframes predictive-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
