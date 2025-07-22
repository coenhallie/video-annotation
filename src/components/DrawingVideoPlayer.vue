<template>
  <div class="drawing-video-player">
    <div class="flex gap-4">
      <!-- Video Player with Drawing Canvas Overlay -->
      <div class="flex-1 flex items-center justify-center p-6 relative">
        <!-- Video Player -->
        <VideoPlayer
          ref="videoPlayerRef"
          :video-url="videoUrl"
          :video-id="videoId"
          :autoplay="false"
          :controls="true"
          @time-update="handleTimeUpdate"
          @frame-update="handleFrameUpdate"
          @fps-detected="handleFpsDetected"
          @loaded="handleVideoLoaded"
        />

        <!-- Drawing Canvas Overlay - covers entire container -->
        <DrawingCanvas
          v-if="videoLoaded"
          ref="drawingCanvasRef"
          :current-frame="currentFrame"
          :is-drawing-mode="drawingCanvas.isDrawingMode.value"
          :selected-tool="drawingCanvas.currentTool.value.type"
          :stroke-width="drawingCanvas.currentTool.value.strokeWidth"
          :severity="drawingCanvas.currentTool.value.severity"
          :existing-drawings="drawingCanvas.currentFrameDrawings.value"
          @drawing-created="handleDrawingCreated"
          @drawing-updated="handleDrawingUpdated"
          @drawing-deleted="handleDrawingDeleted"
        />
        <!-- Video Info -->
        <div
          v-if="videoLoaded"
          class="absolute bottom-4 left-4 right-4 p-4 bg-gray-50 bg-opacity-90 rounded-lg"
        >
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span class="font-medium text-gray-700">Current Frame:</span>
              <span class="ml-2 text-gray-900">{{ currentFrame }}</span>
            </div>
            <div>
              <span class="font-medium text-gray-700">Total Frames:</span>
              <span class="ml-2 text-gray-900">{{ totalFrames }}</span>
            </div>
            <div>
              <span class="font-medium text-gray-700">FPS:</span>
              <span class="ml-2 text-gray-900">{{ fps }}</span>
            </div>
            <div>
              <span class="font-medium text-gray-700">Dimensions:</span>
              <span class="ml-2 text-gray-900"
                >{{ videoDimensions.width }}x{{ videoDimensions.height }}</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Drawing Tools Panel -->
      <div class="w-80">
        <DrawingTools
          :drawing-canvas="drawingCanvas"
          :current-frame="currentFrame"
          @jump-to-frame="handleJumpToFrame"
        />

        <!-- Drawing Data Debug Panel (for testing) -->
        <div v-if="showDebugPanel" class="mt-4 p-4 bg-gray-100 rounded-lg">
          <h4 class="text-sm font-medium text-gray-900 mb-2">Debug Info</h4>
          <div class="text-xs text-gray-600 space-y-1">
            <div>
              Drawing Mode:
              {{ drawingCanvas.isDrawingMode.value ? 'ON' : 'OFF' }}
            </div>
            <div>Current Tool: {{ drawingCanvas.currentTool.value.type }}</div>
            <div>
              Stroke Width: {{ drawingCanvas.currentTool.value.strokeWidth }}px
            </div>
            <div>Severity: {{ drawingCanvas.currentTool.value.severity }}</div>
            <div>
              Drawings on Frame:
              {{ drawingCanvas.currentFrameDrawings.value.length }}
            </div>
            <div>
              Total Drawings: {{ drawingCanvas.getTotalDrawingsCount.value }}
            </div>
            <div>
              Frames with Drawings:
              {{ drawingCanvas.getFramesWithDrawings.value.length }}
            </div>
          </div>

          <!-- Export/Import Buttons -->
          <div class="mt-3 space-y-2">
            <button
              @click="exportDrawings"
              :disabled="drawingCanvas.getTotalDrawingsCount.value === 0"
              class="w-full px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export Drawings JSON
            </button>
            <button
              @click="importDrawings"
              class="w-full px-3 py-2 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Import Drawings JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import VideoPlayer from './VideoPlayer.vue';
import DrawingCanvas from './DrawingCanvas.vue';
import DrawingTools from './DrawingTools.vue';
import { useDrawingCanvas } from '@/composables/useDrawingCanvas';
import type { DrawingData } from '@/types/database';

interface Props {
  videoUrl?: string;
  videoId?: string;
  showDebugPanel?: boolean;
}

interface Emits {
  (e: 'drawing-created', drawing: DrawingData): void;
  (e: 'drawing-updated', drawing: DrawingData): void;
  (e: 'drawing-deleted', drawingId: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  videoUrl: '',
  videoId: 'test-video',
  showDebugPanel: true,
});

const emit = defineEmits<Emits>();

// Template refs
const videoPlayerRef = ref();
const drawingCanvasRef = ref();

// Drawing canvas composable
const drawingCanvas = useDrawingCanvas();

// Video state
const videoLoaded = ref(false);
const currentFrame = ref(0);
const totalFrames = ref(0);
const fps = ref(30);
const videoDimensions = ref({ width: 0, height: 0 });

// Update drawing canvas current frame
const updateCurrentFrame = (frame: number) => {
  currentFrame.value = frame;
  drawingCanvas.currentFrame.value = frame;
};

// Video event handlers
const handleTimeUpdate = (data: { currentTime: number; duration: number }) => {
  // Time update handled by frame update
};

const handleFrameUpdate = (data: {
  currentFrame: number;
  totalFrames: number;
  fps: number;
}) => {
  updateCurrentFrame(data.currentFrame);
  totalFrames.value = data.totalFrames;
  fps.value = data.fps;
};

const handleFpsDetected = (data: { fps: number; totalFrames: number }) => {
  fps.value = data.fps;
  totalFrames.value = data.totalFrames;
};

const handleVideoLoaded = () => {
  videoLoaded.value = true;

  // Get video dimensions
  nextTick(() => {
    if (videoPlayerRef.value?.videoElement) {
      const video = videoPlayerRef.value.videoElement;
      videoDimensions.value = {
        width: video.videoWidth || 1920,
        height: video.videoHeight || 1080,
      };

      // Update drawing canvas with video dimensions
      drawingCanvas.setVideoSize(
        videoDimensions.value.width,
        videoDimensions.value.height
      );

      // Force canvas to update its size after video is loaded
      setTimeout(() => {
        if (drawingCanvasRef.value) {
          // Trigger a manual resize update on the drawing canvas
          const resizeEvent = new Event('resize');
          window.dispatchEvent(resizeEvent);
        }
      }, 200);
    }
  });
};

// Drawing event handlers
const handleDrawingCreated = (drawing: DrawingData) => {
  console.log('Drawing created:', drawing);
  drawingCanvas.addDrawing(drawing);
  emit('drawing-created', drawing);
};

const handleDrawingUpdated = (drawing: DrawingData) => {
  console.log('Drawing updated:', drawing);
  emit('drawing-updated', drawing);
};

const handleDrawingDeleted = (drawingId: string) => {
  console.log('Drawing deleted:', drawingId);
  emit('drawing-deleted', drawingId);
};

// Frame navigation
const handleJumpToFrame = (frame: number) => {
  if (videoPlayerRef.value) {
    const timeInSeconds = frame / fps.value;
    videoPlayerRef.value.seekTo(timeInSeconds);
  }
};

// Debug functions
const exportDrawings = () => {
  const drawings = drawingCanvas.serializeDrawings();
  const dataStr = JSON.stringify(drawings, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `drawings-${props.videoId}-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const importDrawings = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const drawings = JSON.parse(e.target?.result as string);
        drawingCanvas.deserializeDrawings(drawings);
        console.log('Drawings imported successfully');
      } catch (error) {
        console.error('Error importing drawings:', error);
        alert('Error importing drawings. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  input.click();
};

// Initialize
onMounted(() => {
  console.log('DrawingVideoPlayer mounted');
});
</script>

<style scoped>
.drawing-video-player {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
}

/* Ensure proper stacking context for overlay */
.relative {
  position: relative;
}
</style>
