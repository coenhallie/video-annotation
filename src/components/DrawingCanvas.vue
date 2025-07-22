<template>
  <div
    ref="canvasContainer"
    :class="[
      'absolute inset-0',
      isDrawingMode ? 'pointer-events-auto' : 'pointer-events-none',
    ]"
    :style="{
      zIndex: isDrawingMode ? 100 : 40,
      border: isDrawingMode ? '2px solid rgba(59, 130, 246, 0.5)' : 'none',
      backgroundColor: isDrawingMode
        ? 'rgba(59, 130, 246, 0.05)'
        : 'transparent',
    }"
  >
    <canvas
      ref="fabricCanvas"
      :class="[
        'absolute top-0 left-0',
        isDrawingMode
          ? 'pointer-events-auto cursor-crosshair'
          : 'pointer-events-none',
      ]"
      :width="canvasWidth"
      :height="canvasHeight"
    />

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
const canvasLeft = ref(0);
const canvasTop = ref(0);
const isDrawing = ref(false);
const currentPath = ref<fabric.Path>();
const resizeObserver = ref<ResizeObserver>();

// Severity colors mapping
const severityColors = {
  low: '#34d399', // green-400
  medium: '#fbbf24', // amber-400
  high: '#ef4444', // red-500
};

// Initialize Fabric.js canvas
const initCanvas = () => {
  if (!fabricCanvas.value) {
    console.error(
      '🎨 [DrawingCanvas] fabricCanvas.value is null, cannot initialize'
    );
    return;
  }

  console.log('🎨 [DrawingCanvas] Initializing Fabric.js canvas');
  console.log('🎨 [DrawingCanvas] Canvas element:', fabricCanvas.value);
  console.log(
    '🎨 [DrawingCanvas] Canvas dimensions:',
    canvasWidth.value,
    'x',
    canvasHeight.value
  );

  try {
    canvas.value = new fabric.Canvas(fabricCanvas.value, {
      isDrawingMode: false,
      selection: false,
      preserveObjectStacking: true,
      renderOnAddRemove: true,
      skipTargetFind: false, // Allow target finding for events
      enableRetinaScaling: true,
      allowTouchScrolling: false, // Prevent touch scrolling interference
      stopContextMenu: true, // Prevent right-click menu
      fireRightClick: false, // Disable right-click events
      fireMiddleClick: false, // Disable middle-click events
      imageSmoothingEnabled: false, // Better performance for drawing
      perPixelTargetFind: true, // More precise event handling
    });

    console.log(
      '🎨 [DrawingCanvas] Fabric canvas created successfully:',
      !!canvas.value
    );
    console.log(
      '🎨 [DrawingCanvas] Canvas element after init:',
      canvas.value.getElement()
    );

    // Configure drawing brush
    const brush = new fabric.PencilBrush(canvas.value);
    brush.width = props.strokeWidth;
    brush.color = severityColors[props.severity];
    canvas.value.freeDrawingBrush = brush;

    console.log('🎨 [DrawingCanvas] Drawing brush configured');

    // Set up event listeners
    setupCanvasEvents();

    // Add direct DOM event listeners for debugging
    setupDOMEventListeners();

    // Force initial render
    canvas.value.renderAll();
    console.log('🎨 [DrawingCanvas] Initial render completed');
  } catch (error) {
    console.error('🎨 [DrawingCanvas] Error initializing canvas:', error);
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

// Setup DOM event listeners for debugging (disabled to prevent conflicts)
const setupDOMEventListeners = () => {
  // Disabled to prevent event conflicts with Fabric.js
  // The Fabric.js canvas handles all mouse/touch events internally
  console.log(
    '🎨 [DrawingCanvas] DOM event listeners disabled to prevent conflicts'
  );
};

// Handle path creation (when drawing is completed)
const handlePathCreated = (event: { path: fabric.FabricObject }) => {
  console.log('🎨 [DrawingCanvas] Path created event:', event);
  const path = event.path as fabric.Path;
  if (!path) return;

  // Convert fabric path to our drawing data format
  const drawingData = createDrawingDataFromPath(path);
  console.log('🎨 [DrawingCanvas] Drawing data created:', drawingData);
  emit('drawing-created', drawingData);
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
      // Normalize coordinates to 0-1 range
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
  console.log('🎨 [DrawingCanvas] Mouse down event - drawing mode active');
  isDrawing.value = true;

  // Prevent event bubbling to avoid conflicts
  if (event.e) {
    event.e.stopPropagation();
  }
};

const handleMouseMove = (event: fabric.TEvent) => {
  if (!props.isDrawingMode || !isDrawing.value) return;
  // Drawing logic handled by fabric.js brush
  // Prevent event bubbling
  if (event.e) {
    event.e.stopPropagation();
  }
};

const handleMouseUp = (event: fabric.TEvent) => {
  if (!props.isDrawingMode) return;
  console.log('🎨 [DrawingCanvas] Mouse up event - drawing completed');
  isDrawing.value = false;

  // Prevent event bubbling
  if (event.e) {
    event.e.stopPropagation();
  }
};

// Update canvas size to fill entire container
const updateCanvasSize = () => {
  if (!canvasContainer.value) {
    console.warn('🎨 [DrawingCanvas] canvasContainer.value is null');
    return;
  }

  const container = canvasContainer.value;

  // Use parent element dimensions for more reliable sizing
  const parentElement = container.parentElement;
  if (!parentElement) {
    console.warn('🎨 [DrawingCanvas] parentElement is null');
    return;
  }

  const parentRect = parentElement.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  console.log('🎨 [DrawingCanvas] Parent rect:', parentRect);
  console.log('🎨 [DrawingCanvas] Container rect:', containerRect);

  // Ensure we have valid dimensions with better fallbacks
  const width = Math.max(parentRect.width || 800, 300);
  const height = Math.max(parentRect.height || 600, 150);

  console.log('🎨 [DrawingCanvas] Calculated dimensions:', width, 'x', height);

  // Only update if dimensions actually changed
  if (
    canvasWidth.value !== Math.floor(width) ||
    canvasHeight.value !== Math.floor(height)
  ) {
    // Canvas fills the entire container
    canvasWidth.value = Math.floor(width);
    canvasHeight.value = Math.floor(height);

    // Ensure canvas container spans full parent
    canvasLeft.value = 0;
    canvasTop.value = 0;

    console.log(
      '🎨 [DrawingCanvas] Canvas dimensions updated to:',
      canvasWidth.value,
      'x',
      canvasHeight.value
    );

    // Update fabric canvas size to fill container
    if (canvas.value) {
      // Set both canvas dimensions and CSS size
      canvas.value.setDimensions({
        width: canvasWidth.value,
        height: canvasHeight.value,
      });

      // Ensure the HTML canvas element matches
      const canvasEl = canvas.value.getElement();
      if (canvasEl) {
        canvasEl.style.width = '100%';
        canvasEl.style.height = '100%';
        canvasEl.style.position = 'absolute';
        canvasEl.style.top = '0';
        canvasEl.style.left = '0';
        canvasEl.style.zIndex = '1';
      }

      // Force canvas to recalculate and render
      canvas.value.calcOffset();
      canvas.value.renderAll();

      console.log(
        '🎨 [DrawingCanvas] Fabric canvas dimensions updated and rendered'
      );
    }
  } else {
    console.log(
      '🎨 [DrawingCanvas] Canvas dimensions unchanged, skipping update'
    );
  }
};

// Load existing drawings for current frame
const loadDrawingsForFrame = () => {
  if (!canvas.value) return;

  // Clear existing drawings
  canvas.value.clear();

  // Load drawings for current frame
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

  // Convert normalized coordinates back to canvas coordinates
  const points = drawingPath.points.map((point) => ({
    x: point.x * canvasWidth.value,
    y: point.y * canvasHeight.value,
  }));

  // Create fabric path from points
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
    console.log('🎨 [DrawingCanvas] Drawing mode changed to:', newValue);
    if (canvas.value) {
      canvas.value.isDrawingMode = newValue;
      canvas.value.skipTargetFind = false; // Always allow target finding

      if (newValue) {
        // Reinitialize the drawing brush when entering drawing mode
        const brush = new fabric.PencilBrush(canvas.value);
        brush.width = props.strokeWidth;
        brush.color = severityColors[props.severity];
        canvas.value.freeDrawingBrush = brush;
        console.log('🎨 [DrawingCanvas] Drawing brush reinitialized');
      }

      // Force cursor update
      if (fabricCanvas.value) {
        fabricCanvas.value.style.cursor = newValue ? 'crosshair' : 'default';
      }

      console.log(
        '🎨 [DrawingCanvas] Fabric canvas drawing mode updated:',
        canvas.value.isDrawingMode
      );
      console.log(
        '🎨 [DrawingCanvas] Canvas cursor set to:',
        newValue ? 'crosshair' : 'default'
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
    loadDrawingsForFrame();
  }
);

watch([canvasWidth, canvasHeight], () => {
  nextTick(() => {
    updateCanvasSize();
    loadDrawingsForFrame();
  });
});

// Setup ResizeObserver to watch for container size changes
const setupResizeObserver = () => {
  if (!canvasContainer.value) return;

  resizeObserver.value = new ResizeObserver((entries) => {
    for (const entry of entries) {
      console.log(
        '🎨 [DrawingCanvas] Container size changed:',
        entry.contentRect
      );
      // Use a small delay to ensure the DOM has settled
      setTimeout(() => {
        updateCanvasSize();
        loadDrawingsForFrame();
      }, 10);
    }
  });

  // Observe the parent element (video container) for size changes
  const parentElement = canvasContainer.value.parentElement;
  if (parentElement) {
    resizeObserver.value.observe(parentElement);
    console.log('🎨 [DrawingCanvas] ResizeObserver setup on parent element');
  }
};

// Lifecycle hooks
onMounted(() => {
  nextTick(() => {
    // Setup ResizeObserver first
    setupResizeObserver();

    // Initial size update with a delay to ensure parent is sized
    setTimeout(() => {
      updateCanvasSize();
      initCanvas();
      loadDrawingsForFrame();
    }, 100);
  });

  // Handle window resize as fallback
  window.addEventListener('resize', updateCanvasSize);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateCanvasSize);

  // Cleanup ResizeObserver
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
  canvas: canvas.value,
});
</script>

<style scoped>
/* Ensure the canvas container fills its parent completely */
.canvas-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.drawing-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/* Ensure the canvas element itself respects the container size */
canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
</style>
