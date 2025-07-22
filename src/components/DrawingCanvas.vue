<template>
  <div
    ref="canvasContainer"
    class="canvas-container"
    :class="{ 'drawing-mode': isDrawingMode }"
  >
    <canvas ref="fabricCanvas" class="drawing-canvas" />
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
  selectedTool: 'pen' | 'eraser';
  strokeWidth: number;
  severity: SeverityLevel;
  existingDrawings?: DrawingData[];
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

    setupCanvasEvents();
    updateCanvasSize(); // Initial size update
    loadDrawingsForFrame();
  } catch (error) {
    console.error('Error initializing canvas:', error);
  }
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
  const drawingData = createDrawingDataFromPath(path);
  emit('drawing-created', drawingData);
  if (canvas.value) {
    canvas.value.renderAll();
  }
};

// Convert fabric path to DrawingData
const createDrawingDataFromPath = (path: fabric.Path): DrawingData => {
  const pathData = path.path || [];
  const points = extractPointsFromPath(pathData);

  const drawingPath: DrawingPath = {
    points,
    strokeWidth: props.strokeWidth,
    color: severityColors[props.severity],
    timestamp: Date.now(),
  };

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

// Update canvas size to fill the container
const updateCanvasSize = () => {
  if (!canvasContainer.value || !canvas.value) return;
  const { width, height } = canvasContainer.value.getBoundingClientRect();

  if (width > 0 && height > 0) {
    canvasWidth.value = width;
    canvasHeight.value = height;
    canvas.value.setDimensions({ width, height });
    canvas.value.renderAll();
    loadDrawingsForFrame(); // Reload drawings with new dimensions
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

  frameDrawings.forEach((drawing) => {
    drawing.paths.forEach((path) => {
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
    loadDrawingsForFrame();
  }
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
  border: 2px solid rgba(59, 130, 246, 0.5);
  background-color: rgba(59, 130, 246, 0.05);
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
