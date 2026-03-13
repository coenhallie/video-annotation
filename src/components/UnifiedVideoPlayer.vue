<!-- eslint-disable vue/comment-directive -->
<template>
  <div class="unified-video-player">
    <!-- Single Video Mode -->
    <SingleVideoPlayer
      v-if="mode === 'single'"
      ref="singlePlayerRef"
      :video-url="videoUrl"
      :poster="posterAttr"
      :autoplay="autoplayAttr"
      :controls="controlsAttr"
      @loaded="onSingleVideoLoaded"
      @error="onSingleVideoError"
      @time-update="(t) => emit('time-update', { currentTime: t, duration: singlePlayerRef?.videoRef?.duration || 0 })"
      @play="emit('play')"
      @pause="emit('pause')"
      @fps-detected="(data) => emit('fps-detected', data)"
    >
      <template #overlays="{ currentFrame }">
        <!-- Drawing Canvas -->
        <DrawingCanvas
          v-if="videoUrl && drawingCanvas"
          ref="singleDrawingCanvasRef"
          :current-frame="currentFrame"
          :is-drawing-mode="drawingCanvas?.isDrawingMode?.value ?? false"
          :stroke-width="drawingCanvas?.currentTool?.value?.strokeWidth ?? 3"
          :severity="drawingCanvas?.currentTool?.value?.severity ?? defaultSeverity"
          :current-color="resolveCanvasColor(drawingCanvas) ?? '#ef4444'"
          :existing-drawings="drawingCanvas?.allDrawings?.value ?? []"
          :is-loading-drawings="drawingCanvas?.isLoadingDrawings?.value ?? false"
          @drawing-created="handleDrawingCreated"
          @drawing-updated="handleDrawingUpdated"
          @drawing-deleted="handleDrawingDeleted"
        />
      </template>

      <!-- Custom Controls Slot if needed -->
      <template #custom-controls>
        <slot name="custom-controls"></slot>
      </template>
    </SingleVideoPlayer>

    <!-- Dual Video Mode -->
    <DualVideoPlayer
      v-else-if="mode === 'dual'"
      ref="dualPlayerRef"
      :video-a-url="videoAUrl || ''"
      :video-b-url="videoBUrl || ''"
      @video-a-loaded="emit('video-a-loaded')"
      @video-b-loaded="emit('video-b-loaded')"
      @error="(e) => emit('error', e)"
    >
      <!-- Overlays for Video A -->
      <template #overlays-a="{ currentFrame }">
        <DrawingCanvas
          v-if="videoAUrl && drawingCanvasA"
          ref="drawingCanvasARef"
          :current-frame="currentFrame"
          :is-drawing-mode="drawingCanvasA?.isDrawingMode?.value ?? false"
          :stroke-width="drawingCanvasA?.currentTool?.value?.strokeWidth ?? 3"
          :severity="drawingCanvasA?.currentTool?.value?.severity ?? defaultSeverity"
          :current-color="resolveCanvasColor(drawingCanvasA) ?? '#ef4444'"
          :existing-drawings="drawingCanvasA?.allDrawings?.value ?? []"
          :is-loading-drawings="drawingCanvasA?.isLoadingDrawings?.value ?? false"
          @drawing-created="(d) => handleDrawingCreated(d, 'A')"
          @drawing-updated="(d) => handleDrawingUpdated(d, 'A')"
          @drawing-deleted="(id) => handleDrawingDeleted(id, 'A')"
        />
        
      </template>

      <template #controls-right>
         <slot name="controls-right"></slot>
      </template>
    </DualVideoPlayer>


  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onUnmounted } from 'vue';
import { useVideoStore } from '@/stores/video';
import SingleVideoPlayer from './video/SingleVideoPlayer.vue';
import DualVideoPlayer from './video/DualVideoPlayer.vue';
import DrawingCanvas from './DrawingCanvas.vue';
import type { DualVideoPlayer as DualVideoPlayerType, DualVideoPlayerState } from '../composables/useDualVideoPlayer';
import type { SeverityLevel } from '../types/database';

// Types
// Fallback local type to satisfy TS if path alias not resolved
type DrawingData = {
  id?: string;
  frame?: number;
  paths?: any[];
  [k: string]: any;
};

interface DrawingCanvasLike {
  isDrawingMode: { value: boolean };
  currentTool: {
    value: { type: string; strokeWidth: number; severity: SeverityLevel };
  };
  allDrawings: { value: any[] };
  isLoadingDrawings: { value: boolean };
  setVideoSize?: (w: number, h: number) => void;
  disableDrawingMode?: () => void;
  getCurrentColor?: { value?: string } | (() => string);
  [key: string]: any;
}

type OptionalDrawingCanvas = Partial<DrawingCanvasLike> | null | undefined;
type VideoState = Partial<DualVideoPlayerState> | Record<string, unknown>;

// Props
interface Props {
  mode?: 'single' | 'dual';
  videoUrl?: string; // Single video props
  videoId?: string;
  autoplay?: boolean;
  controls?: boolean;
  poster?: string;
  drawingCanvas?: OptionalDrawingCanvas;
  
  // Dual video props
  videoAUrl?: string;
  videoAId?: string;
  videoBUrl?: string;
  videoBId?: string;
  drawingCanvasA?: OptionalDrawingCanvas;
  drawingCanvasB?: OptionalDrawingCanvas;
  videoAState?: VideoState;
  videoBState?: VideoState;
  dualVideoPlayer?: Partial<DualVideoPlayerType> | null;
  
  // Annotation/Pose props
  projectId?: string;
  comparisonVideoId?: string;
  user?: unknown;
}


const props = withDefaults(defineProps<Props>(), {
  mode: 'single',
  videoUrl: '',
  videoId: 'default-video',
  autoplay: false,
  controls: true,
  poster: '',
  videoAUrl: '',
  videoAId: 'video-a',
  videoBUrl: '',
  videoBId: 'video-b',
  drawingCanvas: undefined,
  drawingCanvasA: undefined,
  drawingCanvasB: undefined,
  videoAState: () => ({}),
  videoBState: () => ({}),
  dualVideoPlayer: null,
  projectId: '',
  comparisonVideoId: '',
  user: undefined
});

// Emits
const emit = defineEmits<{
  (e: 'time-update', data: { currentTime: number; duration: number; videoId?: string }): void;
  (e: 'frame-update', data: { currentFrame: number; totalFrames: number; fps: number; videoId?: string }): void;
  (e: 'play'): void;
  (e: 'pause'): void;
  (e: 'duration-change', duration: number): void;
  (e: 'fps-detected', data: { fps: number; totalFrames: number }): void;
  (e: 'error', error: string): void;
  (e: 'loaded', data?: any): void;
  (e: 'video-click'): void;
  (e: 'drawing-created', drawing: DrawingData, videoContext?: string): void;
  (e: 'drawing-updated', drawing: DrawingData, videoContext?: string): void;
  (e: 'drawing-deleted', drawingId: string, videoContext?: string): void;
  (e: 'video-a-loaded'): void;
  (e: 'video-b-loaded'): void;
  (e: 'pose-detected', poseData: any, videoContext?: string): void;
  (e: 'pose-detection-error', error: string, videoContext?: string): void;
}>();

// Refs
const singlePlayerRef = ref<InstanceType<typeof SingleVideoPlayer> | null>(null);
const dualPlayerRef = ref<InstanceType<typeof DualVideoPlayer> | null>(null);
const singleDrawingCanvasRef = ref<InstanceType<typeof DrawingCanvas> | null>(null);
const drawingCanvasARef = ref<InstanceType<typeof DrawingCanvas> | null>(null);
const drawingCanvasBRef = ref<InstanceType<typeof DrawingCanvas> | null>(null);

// Computed attributes
const posterAttr = computed(() => props.poster ?? '');
const autoplayAttr = computed(() => props.autoplay ?? false);
const controlsAttr = computed(() => props.controls ?? true);
const defaultSeverity: SeverityLevel = 'medium';

// Utils
const resolveCanvasColor = (canvas: OptionalDrawingCanvas): string | undefined => {
  if (!canvas) return undefined;
  const maybeCanvas = canvas as Partial<DrawingCanvasLike>;
  const source = maybeCanvas.getCurrentColor;
  if (typeof source === 'function') return source();
  if (source && typeof source === 'object' && 'value' in source) {
    const value = (source as { value?: string }).value;
    if (typeof value === 'string') return value;
  }
  return undefined;
};

// Event Handlers
const onSingleVideoLoaded = (e: Event) => {
  emit('loaded', e);
};

const onSingleVideoError = (e: any) => {
  emit('error', String(e));
};

const handleDrawingCreated = (drawing: DrawingData, videoContext?: string) => {
  emit('drawing-created', drawing, videoContext);
};

const handleDrawingUpdated = (drawing: DrawingData, videoContext?: string) => {
  emit('drawing-updated', drawing, videoContext);
};

const handleDrawingDeleted = (drawingId: string, videoContext?: string) => {
  emit('drawing-deleted', drawingId, videoContext);
};




// Video Control Methods
const videoStore = useVideoStore();

const seekTo = (time: number) => {
  if (props.mode === 'single') {
    if (singlePlayerRef.value?.videoRef) {
      singlePlayerRef.value.videoRef.currentTime = time;
      // Immediately update the store so frame number and time display update
      // without waiting for the timeupdate event (which is unreliable during seeking,
      // especially for remotely-served videos like AWS S3 presigned URLs)
      videoStore.updateTime(time);
    }
  } else if (props.mode === 'dual' && dualPlayerRef.value) {
     // For dual mode, we might want to seek both videos or handle via dualVideoPlayer composable
     // But here we can delegate to the ref or composable if available
     // The DashboardView seems to handle dual seek via dualVideoPlayer composable,
     // but falls back to this component for single mode.
     // If we need to support dual seek from here:
     // (dualPlayerRef.value as any).seekTo?.(time);
  }
};

const play = () => {
    if (props.mode === 'single') {
        singlePlayerRef.value?.videoRef?.play();
    } else {
        dualPlayerRef.value?.play();
    }
}

const pause = () => {
    if (props.mode === 'single') {
        singlePlayerRef.value?.videoRef?.pause();
    } else {
        dualPlayerRef.value?.pause();
    }
}

const stepFrame = (frames: number) => {
  if (props.mode === 'single') {
    singlePlayerRef.value?.seekFrame(frames);
  } else {
    dualPlayerRef.value?.seekFrame(frames);
  }
};

// Fade transition stub/helper
const performVideoFadeTransition = async (callback: () => void) => {
  // Simple implementation: fade out, callback, fade in
  // For now, just execute callback to restore functionality immediately
  // TODO: Add visual fade effect
  callback();
};


// Expose methods that parent components expect
defineExpose({
  singleDrawingCanvasRef,
  drawingCanvasARef,
  drawingCanvasBRef,
  getCurrentVideoElement: () => singlePlayerRef.value?.videoRef || null,
  getCurrentVideoContainer: () => singlePlayerRef.value?.containerRef || null,
  seekTo,
  play,
  pause,
  stepFrame,
  performVideoFadeTransition
});
</script>

<style scoped>
.unified-video-player {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: #000;
  display: flex;
  flex-direction: column;
}

.control-button {
  background: rgba(0,0,0,0.5);
  border: none;
  border-radius: 4px;
  color: white;
  padding: 5px;
  cursor: pointer;
  margin-right: 5px;
}
.control-button.pose-active {
  color: #3b82f6; 
  background: rgba(59, 130, 246, 0.2);
}
.control-icon {
  width: 24px;
  height: 24px;
}
</style>
