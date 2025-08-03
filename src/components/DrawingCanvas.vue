<template>
  <div
    ref="canvasContainer"
    class="canvas-container"
    :class="{ 'drawing-mode': isDrawingMode }"
  >
    <canvas
      ref="fabricCanvas"
      class="drawing-canvas"
      :class="{ 'fade-transition': isTransitioning }"
      :style="{ opacity: canvasOpacity }"
    />

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
/** @typedef {import('@/types/database').DrawingData} DrawingData */
/** @typedef {import('@/types/database').DrawingPath} DrawingPath */
/** @typedef {import('@/types/database').SeverityLevel} SeverityLevel */

interface Props {
  currentFrame: number;
  isDrawingMode: boolean;
  strokeWidth: number;
  severity: SeverityLevel;
  existingDrawings?: DrawingData[];
  isLoadingDrawings?: boolean;
}

interface Emits {
  (e: 'drawing-created', drawing: DrawingData, event?: Event): void;
  (
    e: 'drawing-stroke-added',
    data: { path: DrawingPath; sessionPaths: DrawingPath[]; frame: number }
  ): void;
}

const props = withDefaults(defineProps<Props>(), {
  currentFrame: 0,
  isDrawingMode: false,
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

// Fade transition state
const isTransitioning = ref(false);
const canvasOpacity = ref(1);

// Drawing session state - removed as we now save each drawing immediately

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

// Store accumulated drawing paths for the current session
const currentDrawingSession = ref<{
  paths: DrawingPath[];
  canvasWidth: number;
  canvasHeight: number;
  frame: number;
} | null>(null);

// Handle path creation (when drawing is completed)
const handlePathCreated = (event: { path: fabric.FabricObject }) => {
  const path = event.path as fabric.Path;
  if (!path) {
    return;
  }

  // Create drawing path from the fabric path
  const drawingPath = createDrawingPathFromFabricPath(path);

  // Initialize or update the current drawing session
  if (
    !currentDrawingSession.value ||
    currentDrawingSession.value.frame !== props.currentFrame
  ) {
    // Start new drawing session for this frame
    currentDrawingSession.value = {
      paths: [drawingPath],
      canvasWidth: canvasWidth.value,
      canvasHeight: canvasHeight.value,
      frame: props.currentFrame,
    };
  } else {
    // Add to existing drawing session
    currentDrawingSession.value.paths.push(drawingPath);
  }

  // Emit stroke-added event for real-time visual feedback (but don't save to DB yet)
  emit('drawing-stroke-added', {
    path: drawingPath,
    sessionPaths: currentDrawingSession.value.paths,
    frame: props.currentFrame,
  });

  if (canvas.value) {
    canvas.value.renderAll();
  }
};

// Function to complete the drawing session and emit for saving
const completeDrawingSession = () => {
  if (
    !currentDrawingSession.value ||
    currentDrawingSession.value.paths.length === 0
  ) {
    return;
  }

  // Create a synthetic DOM event with the canvas container as target
  // This allows the UnifiedVideoPlayer to determine which video canvas triggered the drawing
  const syntheticEvent = new Event('drawing-created', { bubbles: true });
  Object.defineProperty(syntheticEvent, 'target', {
    value: canvasContainer.value,
    enumerable: true,
  });

  // Emit the complete drawing session for saving
  emit('drawing-created', currentDrawingSession.value, syntheticEvent);

  // Clear the session
  currentDrawingSession.value = null;
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

// Load existing drawings for current frame with fade transition
const loadDrawingsForFrame = async () => {
  if (!canvas.value) return;

  // Start fade transition
  isTransitioning.value = true;

  // Fade out current drawings
  canvasOpacity.value = 0;

  // Wait for fade out to complete
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Clear and load new drawings
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

  // Fade in new drawings
  canvasOpacity.value = 1;

  // Wait for fade in to complete, then end transition
  setTimeout(() => {
    isTransitioning.value = false;
  }, 150);
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

// Clear drawings for current frame (alias for clearDrawings since we only show current frame)
const clearCurrentFrameDrawings = () => {
  if (canvas.value) {
    canvas.value.clear();
  }
  // Also clear any active drawing session for the current frame
  if (
    currentDrawingSession.value &&
    currentDrawingSession.value.frame === props.currentFrame
  ) {
    currentDrawingSession.value = null;
  }
};

// Add drawing data to the canvas
const addDrawing = (drawingData: any) => {
  if (!canvas.value || !drawingData) return;

  // Clear current canvas first
  canvas.value.clear();

  // Render all paths from the drawing data
  drawingData.paths.forEach((path: any) => {
    renderDrawingPath(path);
  });

  canvas.value.renderAll();
};

// Check if there are drawings on the current frame
const hasDrawingsOnCurrentFrame = (): boolean => {
  if (!canvas.value) {
    return false;
  }

  // Check if there are any objects on the fabric canvas
  const objects = canvas.value.getObjects();
  const hasCanvasObjects = objects.length > 0;

  // Also check if there's an active drawing session for the current frame
  const hasActiveSession =
    currentDrawingSession.value &&
    currentDrawingSession.value.frame === props.currentFrame &&
    currentDrawingSession.value.paths.length > 0;

  // Check if there are existing drawings for this frame from props
  const hasExistingDrawings =
    props.existingDrawings &&
    props.existingDrawings.some(
      (drawing) => drawing.frame === props.currentFrame
    );

  return hasCanvasObjects || hasActiveSession || hasExistingDrawings;
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
        // No need to finish drawing session since we emit drawings immediately
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
  async () => {
    // Load drawings for the new frame with fade transition
    await loadDrawingsForFrame();
  }
);

// Watch for changes to existing drawings and reload them
watch(
  () => props.existingDrawings,
  async () => {
    await loadDrawingsForFrame();
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
  // sessionTimer cleanup removed since we no longer use session timers
});

// Get current drawing session data without completing it
const getCurrentDrawingSession = () => {
  return currentDrawingSession.value;
};

// Enable drawing mode
const enableDrawingMode = () => {
  if (canvas.value) {
    canvas.value.isDrawingMode = true;
    const canvasElement = canvas.value.getElement();
    canvasElement.style.cursor = 'crosshair';
    if (canvasContainer.value) {
      canvasContainer.value.style.cursor = 'crosshair';
    }
  }
};

// Set severity (updates brush color)
const setSeverity = (severity: any) => {
  if (canvas.value?.freeDrawingBrush) {
    canvas.value.freeDrawingBrush.color =
      severityColors[severity as keyof typeof severityColors];
  }
};

// Disable drawing mode
const disableDrawingMode = () => {
  if (canvas.value) {
    canvas.value.isDrawingMode = false;
    const canvasElement = canvas.value.getElement();
    canvasElement.style.cursor = 'default';
    if (canvasContainer.value) {
      canvasContainer.value.style.cursor = 'default';
    }
  }
};

// Expose methods for parent component
defineExpose({
  clearDrawings,
  clearCurrentFrameDrawings,
  addDrawing,
  completeDrawingSession,
  hasDrawingsOnCurrentFrame,
  getCurrentDrawingSession,
  enableDrawingMode,
  disableDrawingMode,
  setSeverity,
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
  transition: opacity 150ms ease-in-out;
}

.drawing-canvas.fade-transition {
  transition: opacity 150ms ease-in-out;
}

.canvas-container.drawing-mode .drawing-canvas {
  cursor: crosshair;
}
</style>
