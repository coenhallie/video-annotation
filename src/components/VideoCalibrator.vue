<template>
  <div ref="containerRef" class="video-calibrator">
    <div ref="videoContainerRef" class="video-container">
      <!-- HTML5 Video Element -->
      <video
        ref="videoRef"
        :src="videoUrl"
        class="calibration-video"
        controls
        @loadedmetadata="onVideoLoaded"
        @timeupdate="onTimeUpdate"
      />

      <!-- Canvas Overlay for Drawing -->
      <canvas
        ref="canvasRef"
        class="drawing-canvas"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @click="onClick"
      />
    </div>

    <!-- Drawing Instructions -->
    <div
      v-if="drawingMode && currentlySelectedLine"
      class="drawing-instructions"
    >
      <p>
        Click two points to draw a line for:
        <strong>{{
          currentlySelectedLine.name || currentlySelectedLine.id
        }}</strong>
      </p>
      <p v-if="drawingState.firstPoint">
        Click the second point to complete the line
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';

// Props
interface Props {
  videoUrl: string;
  drawingMode: boolean | string;
  currentlySelectedLine?: {
    id: string;
    name?: string;
    color?: string;
  };
}

const props = withDefaults(defineProps<Props>(), {
  drawingMode: false,
});

// Events
interface LineDrawnPayload {
  start: { x: number; y: number };
  end: { x: number; y: number };
  lineId: string;
}

const emit = defineEmits<{
  'line-drawn': [payload: LineDrawnPayload];
}>();

// Template refs
const containerRef = ref<HTMLDivElement>();
const videoContainerRef = ref<HTMLDivElement>();
const videoRef = ref<HTMLVideoElement>();
const canvasRef = ref<HTMLCanvasElement>();

// Drawing state
const drawingState = ref({
  isDrawing: false,
  firstPoint: null as { x: number; y: number } | null,
  currentLine: null as {
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null,
});

// Canvas context
let ctx: CanvasRenderingContext2D | null = null;

// Completed lines storage
const completedLines = ref<
  Array<{
    start: { x: number; y: number };
    end: { x: number; y: number };
    lineId: string;
    color: string;
  }>
>([]);

// Initialize canvas when video loads
const onVideoLoaded = async () => {
  await nextTick();
  setupCanvas();
};

// Setup canvas dimensions and context
const setupCanvas = () => {
  const video = videoRef.value;
  const canvas = canvasRef.value;

  if (!video || !canvas) return;

  // Set canvas dimensions to match video
  canvas.width = video.videoWidth || video.clientWidth;
  canvas.height = video.videoHeight || video.clientHeight;

  // Update canvas display size to match video display size
  const videoRect = video.getBoundingClientRect();
  canvas.style.width = `${videoRect.width}px`;
  canvas.style.height = `${videoRect.height}px`;

  // Get canvas context
  ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    redrawCanvas();
  }
};

// Handle window resize
const onResize = () => {
  setupCanvas();
};

// Get mouse position relative to canvas
const getMousePosition = (event: MouseEvent) => {
  const canvas = canvasRef.value;
  const video = videoRef.value;
  if (!canvas || !video) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
};

// Mouse event handlers for two-click line drawing
const onClick = (event: MouseEvent) => {
  if (!props.drawingMode || !props.currentlySelectedLine) return;

  const mousePos = getMousePosition(event);

  if (!drawingState.value.firstPoint) {
    // First click - set start point
    drawingState.value.firstPoint = mousePos;
    drawingState.value.isDrawing = true;
  } else {
    // Second click - complete the line
    const lineData: LineDrawnPayload = {
      start: drawingState.value.firstPoint,
      end: mousePos,
      lineId: props.currentlySelectedLine.id,
    };

    // Add to completed lines for visual persistence
    completedLines.value.push({
      ...lineData,
      color: props.currentlySelectedLine.color || '#ff0000',
    });

    // Emit the line-drawn event
    emit('line-drawn', lineData);

    // Reset drawing state
    drawingState.value.firstPoint = null;
    drawingState.value.isDrawing = false;
    drawingState.value.currentLine = null;

    // Redraw canvas
    redrawCanvas();
  }
};

// Handle mouse move for real-time preview
const onMouseMove = (event: MouseEvent) => {
  if (!drawingState.value.isDrawing || !drawingState.value.firstPoint) return;

  const mousePos = getMousePosition(event);
  drawingState.value.currentLine = {
    start: drawingState.value.firstPoint,
    end: mousePos,
  };

  redrawCanvas();
};

// Placeholder handlers for potential drag functionality
const onMouseDown = (event: MouseEvent) => {
  // Currently using click method, but this could be extended for drag drawing
};

const onMouseUp = (event: MouseEvent) => {
  // Currently using click method, but this could be extended for drag drawing
};

// Redraw all lines on canvas
const redrawCanvas = () => {
  if (!ctx || !canvasRef.value) return;

  // Clear canvas
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);

  // Draw completed lines
  completedLines.value.forEach((line) => {
    drawLine(line.start, line.end, line.color, 3);
  });

  // Draw current line being drawn
  if (drawingState.value.currentLine) {
    const color = props.currentlySelectedLine?.color || '#ff0000';
    drawLine(
      drawingState.value.currentLine.start,
      drawingState.value.currentLine.end,
      color,
      3,
      true // preview mode
    );
  }

  // Draw first point if set
  if (drawingState.value.firstPoint) {
    drawPoint(
      drawingState.value.firstPoint,
      props.currentlySelectedLine?.color || '#ff0000'
    );
  }
};

// Draw a line on canvas
const drawLine = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: string,
  width: number,
  isPreview = false
) => {
  if (!ctx) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;

  if (isPreview) {
    ctx.setLineDash([5, 5]); // Dashed line for preview
    ctx.globalAlpha = 0.7;
  } else {
    ctx.setLineDash([]); // Solid line for completed
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.restore();
};

// Draw a point on canvas
const drawPoint = (point: { x: number; y: number }, color: string) => {
  if (!ctx) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
};

// Handle video time updates
const onTimeUpdate = () => {
  // Could be used for time-based functionality if needed
};

// Watch for drawing mode changes
watch(
  () => props.drawingMode,
  (newMode) => {
    if (!newMode) {
      // Reset drawing state when drawing mode is disabled
      drawingState.value.firstPoint = null;
      drawingState.value.isDrawing = false;
      drawingState.value.currentLine = null;
      redrawCanvas();
    }
  }
);

// Watch for selected line changes
watch(
  () => props.currentlySelectedLine,
  () => {
    // Reset drawing state when selected line changes
    drawingState.value.firstPoint = null;
    drawingState.value.isDrawing = false;
    drawingState.value.currentLine = null;
    redrawCanvas();
  }
);

// Lifecycle hooks
onMounted(() => {
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
});
</script>

<style scoped>
.video-calibrator {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  height: 100%;
}

.video-container {
  position: relative;
  display: inline-block;
  max-width: 100%;
  max-height: 100%;
}

.calibration-video {
  display: block;
  max-width: 100%;
  max-height: 100%;
  background: #000;
}

.drawing-canvas {
  position: absolute;
  top: 0;
  left: 0;
  cursor: crosshair;
  pointer-events: auto;
  background: transparent;
}

.drawing-canvas:not([style*='cursor']) {
  cursor: crosshair;
}

.video-container:not(:hover) .drawing-canvas {
  pointer-events: none;
}

.video-container:hover .drawing-canvas {
  pointer-events: auto;
}

.drawing-instructions {
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 8px;
  border-left: 4px solid #007bff;
}

.drawing-instructions p {
  margin: 0.5rem 0;
  font-size: 0.9rem;
}

.drawing-instructions strong {
  color: #007bff;
}

/* Ensure canvas is properly positioned over video */
.video-container {
  line-height: 0; /* Remove any line height that might affect positioning */
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .drawing-instructions {
    padding: 0.75rem;
    font-size: 0.85rem;
  }
}
</style>
