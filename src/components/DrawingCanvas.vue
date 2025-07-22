<template>
  <div
    ref="canvasContainer"
    class="canvas-container"
    :class="{ 'drawing-mode': isDrawingMode }"
  >
    <canvas ref="fabricCanvas" class="drawing-canvas" />

    <!-- Loading indicator for drawings -->
    <div
      v-if="isLoadingDrawings"
      class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div
        class="bg-white rounded-lg px-4 py-3 flex items-center space-x-3 shadow-lg"
      >
        <div
          class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"
        ></div>
        <span class="text-gray-700 font-medium">Loading drawings...</span>
      </div>
    </div>

    <!-- Debug overlay when drawing mode is active -->
    <div
      v-if="isDrawingMode"
      class="absolute top-2 left-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium z-10"
    >
      Drawing Mode Active
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as fabric from 'fabric';
import type { DrawingData, DrawingPath, SeverityLevel } from '@/types/database';

interface Props {
  currentFrame: number;
  isDrawingMode: boolean;
  selectedTool: 'pen';
  strokeWidth: number;
  severity: SeverityLevel;
  existingDrawings?: DrawingData[];
  isLoadingDrawings?: boolean;
}

interface Emits {
  (e: 'drawing-created', drawing: DrawingData): void;
  (e: 'drawing-updated', drawing: DrawingData): void;
  (e: 'drawing-deleted', drawingId: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  currentFrame: 0,
  isDrawingMode: false,
  selectedTool: 'pen',
  strokeWidth: 3,
  severity: 'medium',
  existingDrawings: () => [],
  isLoadingDrawings: false,
});

const emit = defineEmits<Emits>();

// Template refs
const canvasContainer = ref<HTMLDivElement>();
const fabricCanvas = ref<HTMLCanvasElement>();

// Canvas state
const canvas = ref<fabric.Canvas>();
const canvasWidth = ref(0);
const canvasHeight = ref(0);
const isDrawing = ref(false);
const resizeObserver = ref<ResizeObserver>();

// Drawing session state
const currentDrawingSession = ref<DrawingData | null>(null);
const isInDrawingSession = ref(false);
const sessionTimer = ref<NodeJS.Timeout | null>(null);

// Severity colors mapping
const severityColors = {
  low: '#34d399', // green-400
  medium: '#fbbf24', // amber-400
  high: '#ef4444', // red-500
};

// Initialize Fabric.js canvas
const initCanvas = () => {
  if (!fabricCanvas.value || !canvasContainer.value) {
    return;
  }
  try {
    canvas.value = new fabric.Canvas(fabricCanvas.value, {
      isDrawingMode: false,
      selection: false,
      preserveObjectStacking: true,
    });

    // Configure drawing brush
    const brush = new fabric.PencilBrush(canvas.value);
    brush.width = props.strokeWidth;
    brush.color = severityColors[props.severity];
    canvas.value.freeDrawingBrush = brush;

    // DIAGNOSTIC: Check initial cursor state
    const canvasElement = canvas.value.getElement();

    setupCanvasEvents();
    updateCanvasSize(); // Initial size update
    loadDrawingsForFrame();
  } catch (error) {}
};

// Setup canvas event listeners
const setupCanvasEvents = () => {
  if (!canvas.value) return;
  canvas.value.on('path:created', handlePathCreated);
  canvas.value.on('mouse:down', handleMouseDown);
  canvas.value.on('mouse:move', handleMouseMove);
  canvas.value.on('mouse:up', handleMouseUp);
};

// Handle path creation (when drawing is completed)
const handlePathCreated = (event: { path: fabric.FabricObject }) => {
  const path = event.path as fabric.Path;
  if (!path) {
    return;
  }

  // Create drawing path from the fabric path
  const drawingPath = createDrawingPathFromFabricPath(path);

  // Clear any existing timer
  if (sessionTimer.value) {
    clearTimeout(sessionTimer.value);
  }

  // Add to current drawing session or create new one
  if (!currentDrawingSession.value) {
    // Start new drawing session
    currentDrawingSession.value = {
      paths: [drawingPath],
      canvasWidth: canvasWidth.value,
      canvasHeight: canvasHeight.value,
      frame: props.currentFrame,
    };
    isInDrawingSession.value = true;
  } else {
    // Add to existing drawing session
    currentDrawingSession.value.paths.push(drawingPath);
  }

  // Set timer to finish session after delay
  sessionTimer.value = setTimeout(() => {
    finishDrawingSession();
  }, 1500); // 1.5 second delay to allow for multiple strokes

  if (canvas.value) {
    canvas.value.renderAll();
  }
};

// Convert fabric path to DrawingPath (single path)
const createDrawingPathFromFabricPath = (path: fabric.Path): DrawingPath => {
  const pathData = path.path || [];
  const points = extractPointsFromPath(pathData);

  return {
    points,
    strokeWidth: props.strokeWidth,
    color: severityColors[props.severity],
    timestamp: Date.now(),
  };
};

// Convert fabric path to DrawingData (legacy function, kept for compatibility)
const createDrawingDataFromPath = (path: fabric.Path): DrawingData => {
  const drawingPath = createDrawingPathFromFabricPath(path);

  return {
    paths: [drawingPath],
    canvasWidth: canvasWidth.value,
    canvasHeight: canvasHeight.value,
    frame: props.currentFrame,
  };
};

// Extract points from fabric path data
const extractPointsFromPath = (pathData: any[]): { x: number; y: number }[] => {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < pathData.length; i++) {
    const command = pathData[i];
    if (Array.isArray(command) && command.length >= 3) {
      const x = command[1] / canvasWidth.value;
      const y = command[2] / canvasHeight.value;
      points.push({ x, y });
    }
  }

  return points;
};

// Mouse event handlers
const handleMouseDown = (event: fabric.TEvent) => {
  if (!props.isDrawingMode) return;
  isDrawing.value = true;
  if (event.e) event.e.stopPropagation();
};

const handleMouseMove = (event: fabric.TEvent) => {
  if (!props.isDrawingMode || !isDrawing.value) return;
  if (event.e) event.e.stopPropagation();
};

const handleMouseUp = (event: fabric.TEvent) => {
  if (!props.isDrawingMode) return;
  isDrawing.value = false;
  if (event.e) event.e.stopPropagation();
};

// Finish the current drawing session and emit the complete drawing
const finishDrawingSession = () => {
  if (currentDrawingSession.value && isInDrawingSession.value) {
    emit('drawing-created', currentDrawingSession.value);
    currentDrawingSession.value = null;
    isInDrawingSession.value = false;
  }
};

// Update canvas size to fill the container
const updateCanvasSize = () => {
  if (!canvasContainer.value || !canvas.value) {
    return;
  }
  const { width, height } = canvasContainer.value.getBoundingClientRect();

  // Use fallback dimensions if container has no size (e.g., when video fails to load)
  const fallbackWidth = 800;
  const fallbackHeight = 450;
  const finalWidth = width > 0 ? width : fallbackWidth;
  const finalHeight = height > 0 ? height : fallbackHeight;

  if (finalWidth > 0 && finalHeight > 0) {
    canvasWidth.value = finalWidth;
    canvasHeight.value = finalHeight;
    canvas.value.setDimensions({ width: finalWidth, height: finalHeight });
    canvas.value.renderAll();
    loadDrawingsForFrame(); // Reload drawings with new dimensions
  } else {
  }
};

// Load existing drawings for current frame
const loadDrawingsForFrame = () => {
  if (!canvas.value) return;
  canvas.value.clear();
  const frameDrawings =
    props.existingDrawings?.filter(
      (drawing) => drawing.frame === props.currentFrame
    ) || [];

  frameDrawings.forEach((drawing, drawingIndex) => {
    drawing.paths.forEach((path, pathIndex) => {
      renderDrawingPath(path);
    });
  });
};

// Render a drawing path on canvas
const renderDrawingPath = (drawingPath: DrawingPath) => {
  if (!canvas.value) return;
  const points = drawingPath.points.map((point) => ({
    x: point.x * canvasWidth.value,
    y: point.y * canvasHeight.value,
  }));

  if (points.length < 2) return;

  let pathString = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathString += ` L ${points[i].x} ${points[i].y}`;
  }

  const fabricPath = new fabric.Path(pathString, {
    stroke: drawingPath.color,
    strokeWidth: drawingPath.strokeWidth,
    fill: '',
    selectable: false,
    evented: false,
  });
  canvas.value.add(fabricPath);
};

// Clear all drawings
const clearDrawings = () => {
  if (canvas.value) {
    canvas.value.clear();
  }
};

// Watch for prop changes
watch(
  () => props.isDrawingMode,
  (newValue) => {
    if (canvas.value) {
      canvas.value.isDrawingMode = newValue;

      const canvasElement = canvas.value.getElement();

      // Force cursor update
      if (newValue) {
        canvasElement.style.cursor = 'crosshair';
        // Also try setting it on the container
        if (canvasContainer.value) {
          canvasContainer.value.style.cursor = 'crosshair';
        }
      } else {
        canvasElement.style.cursor = 'default';
        if (canvasContainer.value) {
          canvasContainer.value.style.cursor = 'default';
        }
        // Finish any active drawing session when exiting drawing mode
        finishDrawingSession();
      }
    } else {
      console.warn(
        '🎨 [DrawingCanvas] Canvas not available when trying to set drawing mode'
      );
    }
  }
);

watch(
  () => props.strokeWidth,
  (newValue) => {
    if (canvas.value?.freeDrawingBrush) {
      canvas.value.freeDrawingBrush.width = newValue;
    }
  }
);

watch(
  () => props.severity,
  (newValue) => {
    if (canvas.value?.freeDrawingBrush) {
      canvas.value.freeDrawingBrush.color = severityColors[newValue];
    }
  }
);

watch(
  () => props.currentFrame,
  () => {
    // Finish any active drawing session when frame changes
    finishDrawingSession();
    loadDrawingsForFrame();
  }
);

// Watch for changes to existing drawings and reload them
watch(
  () => props.existingDrawings,
  () => {
    loadDrawingsForFrame();
  },
  { deep: true }
);

// Lifecycle hooks
onMounted(() => {
  nextTick(() => {
    initCanvas();
    if (canvasContainer.value) {
      resizeObserver.value = new ResizeObserver(updateCanvasSize);
      resizeObserver.value.observe(canvasContainer.value);
    }
  });
});

onUnmounted(() => {
  if (resizeObserver.value) {
    resizeObserver.value.disconnect();
  }
  if (canvas.value) {
    canvas.value.dispose();
  }
  if (sessionTimer.value) {
    clearTimeout(sessionTimer.value);
  }
});

// Expose methods for parent component
defineExpose({
  clearDrawings,
});
</script>

<style scoped>
.canvas-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 40;
}
.canvas-container.drawing-mode {
  pointer-events: auto;
  z-index: 100;
  border: 3px solid rgba(59, 130, 246, 0.8);
  background-color: rgba(59, 130, 246, 0.1);
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
}

/* Always show a subtle overlay when canvas exists, even if not in drawing mode */
.canvas-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 40;
  background-color: rgba(255, 255, 255, 0.02);
  min-width: 800px;
  min-height: 450px;
}

.drawing-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
.canvas-container.drawing-mode .drawing-canvas {
  cursor: crosshair;
}
</style>
