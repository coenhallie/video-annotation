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
      <template #overlays="{ currentTime, currentFrame, videoElement }">
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

        <!-- Pose Visualization -->
        <PoseVisualization
          v-if="videoUrl && poseLandmarker"
          :current-pose="poseLandmarker.getCurrentPose"
          :canvas-width="videoElement?.videoWidth || 1920"
          :canvas-height="videoElement?.videoHeight || 1080"
          :show-pose="poseLandmarker.isEnabled.value"
          :show-skeleton="poseVisualizationSettings.showSkeleton"
          :show-landmarks="poseVisualizationSettings.showLandmarks"
          :show-labels="poseVisualizationSettings.showLabels"
          :show-confidence="poseVisualizationSettings.showConfidence"
          :show-center-of-mass="poseVisualizationSettings.showCenterOfMass"
          :speed-metrics="poseLandmarker?.speedMetrics"
          :selected-keypoints="poseLandmarker?.selectedKeypoints?.value || []"
          :current-r-o-i="roiSettings.currentROI"
          :use-r-o-i="roiSettings.enabled"
        />

        <!-- ROI Selector -->
        <ROISelector
          v-if="videoUrl && poseLandmarker && roiSettings.enabled"
          :canvas-width="videoElement?.videoWidth || 1920"
          :canvas-height="videoElement?.videoHeight || 1080"
          :current-r-o-i="roiSettings.currentROI"
          :predicted-r-o-i="roiSettings.predictedROI"
          :roi-history="roiSettings.roiHistory"
          :roi-confidence="roiSettings.roiConfidence"
          :stability-metrics="roiSettings.stabilityMetrics"
          :motion-prediction="(roiSettings as any).useMotionPrediction"
          :show-roi="roiSettings.showROI"
          :show-prediction="roiSettings.showPrediction"
          :show-history="roiSettings.showHistory"
          :show-instructions="roiSettings.showInstructions"
          :show-stats="roiSettings.showStats"
          :enabled="roiSettings.enabled"
          @roi-selected="(roi) => roiSettings.currentROI = roi"
          @roi-updated="(roi) => roiSettings.currentROI = roi"
          @roi-cleared="() => roiSettings.currentROI = null"
        />
        
        <!-- Heatmap Minimap Layer -->
        <!-- Note: Heatmap logic was tied to videoElement time updates in the old component. 
             If SingleVideoPlayer handles time updates, we need to ensure tracked data is updated. 
             Current logic uses `usePositionHeatmap` which is reactive. -->
      </template>

      <!-- Custom Controls Slot if needed -->
      <template #custom-controls>
         <!-- Pose Toggle Button -->
         <div v-if="poseLandmarker" class="pose-controls">
           <button 
             class="control-button"
             :class="{ 'pose-active': poseLandmarker.isEnabled.value }"
             @click="togglePoseDetection"
           >
             <svg class="control-icon" viewBox="0 0 24 24">
               <path fill="currentColor" d="M12,2A2,2 0 0,1 14,4A2,2 0 0,1 12,6A2,2 0 0,1 10,4A2,2 0 0,1 12,2M10.5,7H13.5A2,2 0 0,1 15.5,9V14.5H13V22H11V16H13V9H11V16H9V22H7V14.5A2,2 0 0,1 9,7H10.5M20,11H22V13H20V11M2,11H4V13H2V11Z" />
             </svg>
           </button>
         </div>
         <!-- ROI Toggle -->
         <button 
            v-if="videoUrl && poseLandmarker"
            class="control-button" 
            :class="{ 'pose-active': roiSettings.enabled }"
            title="Toggle ROI"
            @click="roiSettings.enabled = !roiSettings.enabled"
         >
           <svg class="control-icon" viewBox="0 0 24 24">
             <path fill="currentColor" d="M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M5,19V5H19V19H5M7,7H17V9H7V7M7,11H17V13H7V11M7,15H17V17H7V15Z" />
           </svg>
         </button>
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
      <template #overlays-a="{ currentTime, currentFrame, videoElement }">
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
        
        <PoseVisualization
          v-if="videoAUrl && poseLandmarkerA"
          :current-pose="poseLandmarkerA.getCurrentPose"
          :canvas-width="videoElement?.videoWidth || 1920"
          :canvas-height="videoElement?.videoHeight || 1080"
          :show-pose="poseLandmarkerA.isEnabled.value"
          :current-r-o-i="roiSettingsA.currentROI"
          :use-r-o-i="roiSettingsA.enabled"
        />
      </template>

      <!-- Overlays for Video B -->
      <template #overlays-b="{ currentTime, currentFrame, videoElement }">
        <DrawingCanvas
          v-if="videoBUrl && drawingCanvasB"
          ref="drawingCanvasBRef"
          :current-frame="currentFrame"
          :is-drawing-mode="drawingCanvasB?.isDrawingMode?.value ?? false"
          :stroke-width="drawingCanvasB?.currentTool?.value?.strokeWidth ?? 3"
          :severity="drawingCanvasB?.currentTool?.value?.severity ?? defaultSeverity"
          :current-color="resolveCanvasColor(drawingCanvasB) ?? '#ef4444'"
          :existing-drawings="drawingCanvasB?.allDrawings?.value ?? []"
          :is-loading-drawings="drawingCanvasB?.isLoadingDrawings?.value ?? false"
          @drawing-created="(d) => handleDrawingCreated(d, 'B')"
          @drawing-updated="(d) => handleDrawingUpdated(d, 'B')"
          @drawing-deleted="(id) => handleDrawingDeleted(id, 'B')"
        />

         <PoseVisualization
          v-if="videoBUrl && poseLandmarkerB"
          :current-pose="poseLandmarkerB.getCurrentPose"
          :canvas-width="videoElement?.videoWidth || 1920"
          :canvas-height="videoElement?.videoHeight || 1080"
          :show-pose="poseLandmarkerB.isEnabled.value"
          :current-r-o-i="roiSettingsB.currentROI"
          :use-r-o-i="roiSettingsB.enabled"
        />
      </template>
      
      <template #controls-right>
         <!-- Dual Mode Pose Toggle logic here? -->
      </template>
    </DualVideoPlayer>

    <!-- Shared Components/Modals -->
    <HeatmapMinimap
      :is-visible="showHeatmapMinimap"
      :heatmap-data="heatmapDataComputed"
      :current-position="currentPositionComputed"
      :court-dimensions="courtDimensionsComputed"
      @close="showHeatmapMinimap = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onUnmounted } from 'vue';
import SingleVideoPlayer from './video/SingleVideoPlayer.vue';
import DualVideoPlayer from './video/DualVideoPlayer.vue';
import DrawingCanvas from './DrawingCanvas.vue';
import PoseVisualization from './PoseVisualization.vue';
import ROISelector from './ROISelector.vue';
import HeatmapMinimap from './HeatmapMinimap.vue';
import { useCameraCalibration } from '../composables/useCameraCalibration';
import { usePositionHeatmap } from '../composables/usePositionHeatmap';
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
  poseLandmarker?: any;
  poseLandmarkerA?: any;
  poseLandmarkerB?: any;
  enablePoseDetection?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'single',
  videoUrl: '',
  videoId: 'default-video',
  autoplay: false,
  controls: true,
  poster: '',
  primaryVideo: 'A',
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
  (e: 'toggle-calibration'): void;
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

// Pose Visualization Settings
const poseVisualizationSettings = reactive({
  showSkeleton: true,
  showLandmarks: true,
  showLabels: false,
  showConfidence: true,
  showNoPoseIndicator: true,
  showCenterOfMass: true,
});

const togglePoseDetection = () => {
  if (props.poseLandmarker?.isEnabled) {
    props.poseLandmarker.isEnabled.value = !props.poseLandmarker.isEnabled.value;
  }
};


// Enhanced ROI state
const roiSettings = reactive({
  enabled: false,
  showROI: true,
  showInstructions: true,
  showPrediction: true,
  showHistory: false,
  showStats: true,
  currentROI: null,
  predictedROI: null,
  roiHistory: [],
  roiConfidence: 0,
  stabilityMetrics: {
    stabilityScore: 0,
    velocityEstimate: { x: 0, y: 0 },
    averageSize: { width: 0, height: 0 },
    averagePosition: { x: 0, y: 0 },
  },
  useMotionPrediction: false,
});

const roiSettingsA = reactive({
  enabled: false,
  currentROI: null
});

const roiSettingsB = reactive({
  enabled: false,
  currentROI: null
});

// Calibration & Heatmap (Legacy Logic Ported)
const cameraCalibration = useCameraCalibration();
const showHeatmapMinimap = ref(false);
const positionHeatmap = usePositionHeatmap(cameraCalibration.courtDimensions);

const heatmapDataComputed = computed(() => positionHeatmap.heatmapData.value);
const currentPositionComputed = computed(() => positionHeatmap.currentPosition.value);
const courtDimensionsComputed = computed(() => cameraCalibration.courtDimensions.value);


// Video Control Methods
const seekTo = (time: number) => {
  if (props.mode === 'single') {
    if (singlePlayerRef.value?.videoRef) {
      singlePlayerRef.value.videoRef.currentTime = time;
    }
  } else if (props.mode === 'dual' && dualVideoPlayerRef.value) {
     // For dual mode, we might want to seek both videos or handle via dualVideoPlayer composable
     // But here we can delegate to the ref or composable if available
     // The DashboardView seems to handle dual seek via dualVideoPlayer composable, 
     // but falls back to this component for single mode. 
     // If we need to support dual seek from here:
     // (dualVideoPlayerRef.value as any).seekTo?.(time);
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
