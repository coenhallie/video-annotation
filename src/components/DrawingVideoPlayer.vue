<template>
  <div class="drawing-video-player">
    <!-- Video Player with Drawing Canvas Overlay -->
    <div class="flex items-center justify-center p-6 relative">
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
        ref="drawingCanvasRef"
        :current-frame="currentFrame"
        :is-drawing-mode="isDrawingMode"
        :selected-tool="currentTool.type"
        :stroke-width="currentTool.strokeWidth"
        :severity="currentTool.severity"
        :existing-drawings="currentFrameDrawings"
        :is-loading-drawings="drawingCanvas.isLoadingDrawings.value"
        @drawing-created="handleDrawingCreated"
        @drawing-updated="handleDrawingUpdated"
        @drawing-deleted="handleDrawingDeleted"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick, watch } from 'vue';
import VideoPlayer from './VideoPlayer.vue';
import DrawingCanvas from './DrawingCanvas.vue';
import DrawingTools from './DrawingTools.vue';
import { useDrawingCanvas } from '@/composables/useDrawingCanvas';
import type { DrawingData } from '@/types/database';

interface Props {
  videoUrl?: string;
  videoId?: string;
  showDebugPanel?: boolean;
  drawingCanvas?: any;
}

interface Emits {
  (e: 'drawing-created', drawing: DrawingData): void;
  (e: 'drawing-updated', drawing: DrawingData): void;
  (e: 'drawing-deleted', drawingId: string): void;
  (e: 'time-update', data: { currentTime: number; duration: number }): void;
  (
    e: 'frame-update',
    data: { currentFrame: number; totalFrames: number; fps: number }
  ): void;
  (e: 'fps-detected', data: { fps: number; totalFrames: number }): void;
  (e: 'loaded'): void;
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

// Drawing canvas composable - receive from parent instead of creating new instance
const drawingCanvas = props.drawingCanvas || useDrawingCanvas();

// Video state
const videoLoaded = ref(false);
const currentFrame = ref(0);
const totalFrames = ref(0);
const fps = ref(30);
const videoDimensions = ref({ width: 0, height: 0 });

// Use the reactive properties directly from the composable
const { isDrawingMode, currentTool, currentFrameDrawings } = drawingCanvas;

// DIAGNOSTIC: Watch for drawing mode changes to debug reactivity
watch(
  isDrawingMode,
  (newValue) => {
    console.log(
      '🎬 [DrawingVideoPlayer] DIAGNOSTIC: Drawing mode changed to:',
      newValue
    );
  },
  { immediate: true }
);

// DIAGNOSTIC: Also watch the raw state
watch(
  () => drawingCanvas.state.isDrawingMode,
  (newValue) => {
    console.log(
      '🎬 [DrawingVideoPlayer] DIAGNOSTIC: Raw state drawing mode changed to:',
      newValue
    );
  },
  { immediate: true }
);

// Update drawing canvas current frame
const updateCurrentFrame = (frame: number) => {
  currentFrame.value = frame;
  drawingCanvas.currentFrame.value = frame;
};

// Video event handlers
const handleTimeUpdate = (data: { currentTime: number; duration: number }) => {
  // Forward time update to parent
  emit('time-update', data);
};

const handleFrameUpdate = (data: {
  currentFrame: number;
  totalFrames: number;
  fps: number;
}) => {
  updateCurrentFrame(data.currentFrame);
  totalFrames.value = data.totalFrames;
  fps.value = data.fps;
  // Forward frame update to parent
  emit('frame-update', data);
};

const handleFpsDetected = (data: { fps: number; totalFrames: number }) => {
  fps.value = data.fps;
  totalFrames.value = data.totalFrames;
  // Forward fps detected to parent
  emit('fps-detected', data);
};

const handleVideoLoaded = () => {
  videoLoaded.value = true;
  // Forward loaded event to parent
  emit('loaded');

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
  drawingCanvas.addDrawing(drawing);
  emit('drawing-created', drawing);
};

const handleDrawingUpdated = (drawing: DrawingData) => {
  emit('drawing-updated', drawing);
};

const handleDrawingDeleted = (drawingId: string) => {
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
  // Add diagnostic logging
  nextTick(() => {
    console.log(
      'DrawingVideoPlayer - videoPlayerRef.value:',
      videoPlayerRef.value
    );
    console.log(
      'DrawingVideoPlayer - videoPlayerRef.value type:',
      typeof videoPlayerRef.value
    );
    if (videoPlayerRef.value) {
      console.log(
        'DrawingVideoPlayer - videoPlayerRef.value.seekTo:',
        videoPlayerRef.value.seekTo
      );
      console.log(
        'DrawingVideoPlayer - videoPlayerRef.value.videoElement:',
        videoPlayerRef.value.videoElement
      );
    }
  });
});

defineExpose({
  videoPlayerRef,
  drawingCanvas,
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
