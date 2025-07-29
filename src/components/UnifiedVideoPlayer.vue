<template>
  <div class="unified-video-player">
    <!-- Single Video Mode -->
    <div v-if="mode === 'single'" class="single-video-container">
      <div class="video-wrapper">
        <!-- Loading indicator for single video -->
        <div v-if="singleVideoState.isLoading" class="loading-overlay">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading video...</div>
        </div>

        <!-- Error message -->
        <div v-if="singleVideoState.error" class="error-overlay">
          <svg
            class="error-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <p class="error-message">{{ singleVideoState.error }}</p>
          <button @click="singleVideoState.error = null" class="retry-button">
            Try Again
          </button>
        </div>

        <!-- Placeholder when no video URL -->
        <div v-if="!videoUrl" class="no-video-placeholder">
          <svg
            class="placeholder-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <h3 class="placeholder-title">No Video Loaded</h3>
          <p class="placeholder-description">
            Please upload a MP4 video to start annotating.
          </p>
        </div>

        <!-- Single Video Element -->
        <video
          v-else
          ref="singleVideoElement"
          class="video-element"
          :class="{ 'video-fade-transition': isVideoTransitioning }"
          :style="{ opacity: videoOpacity }"
          :src="videoUrl"
          :poster="poster"
          :autoplay="autoplay"
          preload="metadata"
          @click="handleVideoClick"
        >
          Your browser does not support the video tag.
        </video>

        <!-- Drawing Canvas Overlay for Single Video -->
        <DrawingCanvas
          v-if="videoUrl && drawingCanvas"
          ref="singleDrawingCanvasRef"
          :current-frame="currentFrame"
          :is-drawing-mode="drawingCanvas.isDrawingMode.value"
          :selected-tool="drawingCanvas.currentTool.value.type"
          :stroke-width="drawingCanvas.currentTool.value.strokeWidth"
          :severity="drawingCanvas.currentTool.value.severity"
          :existing-drawings="drawingCanvas.allDrawings.value"
          :is-loading-drawings="drawingCanvas.isLoadingDrawings.value"
          @drawing-created="handleDrawingCreated"
          @drawing-updated="handleDrawingUpdated"
          @drawing-deleted="handleDrawingDeleted"
        />

        <!-- Custom controls for single video -->
        <div v-if="controls && videoUrl" class="video-controls">
          <div class="controls-content">
            <div class="controls-left">
              <!-- Play/Pause button -->
              <button
                @click="togglePlayPause"
                class="control-button"
                :aria-label="isPlaying ? 'Pause' : 'Play'"
              >
                <svg v-if="isPlaying" class="control-icon" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                <svg v-else class="control-icon" viewBox="0 0 24 24">
                  <polygon points="5,3 19,12 5,21"></polygon>
                </svg>
              </button>

              <!-- Volume controls -->
              <div class="volume-controls">
                <button
                  @click="toggleMute"
                  class="control-button"
                  :aria-label="isMuted ? 'Unmute' : 'Mute'"
                >
                  <svg v-if="isMuted" class="control-icon" viewBox="0 0 24 24">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                    <line x1="23" y1="9" x2="17" y2="15"></line>
                    <line x1="17" y1="9" x2="23" y2="15"></line>
                  </svg>
                  <svg
                    v-else-if="volume < 0.5"
                    class="control-icon"
                    viewBox="0 0 24 24"
                  >
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                  <svg v-else class="control-icon" viewBox="0 0 24 24">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  :value="isMuted ? 0 : volume"
                  @input="handleVolumeChange"
                  class="volume-slider"
                  :aria-label="'Volume: ' + Math.round(volume * 100) + '%'"
                />
              </div>

              <!-- Speed controls -->
              <div class="speed-controls">
                <select
                  :value="playbackSpeed"
                  @change="setPlaybackSpeed(parseFloat($event.target.value))"
                  class="speed-select"
                  :aria-label="'Playback speed: ' + playbackSpeed + 'x'"
                >
                  <option value="0.1">0.1x</option>
                  <option value="0.25">0.25x</option>
                  <option value="0.5">0.5x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dual Video Mode -->
    <div v-else-if="mode === 'dual'" class="dual-video-container">
      <div class="videos-grid">
        <!-- Video A -->
        <div class="video-section">
          <div class="video-label">Video A</div>
          <div class="video-wrapper">
            <!-- Loading indicator for Video A -->
            <div
              v-if="!videoAState?.isLoaded && videoAUrl"
              class="loading-overlay"
            >
              <div class="loading-spinner"></div>
              <div class="loading-text">Loading Video A...</div>
            </div>

            <!-- Video A Element -->
            <video
              v-if="videoAUrl"
              ref="videoAElement"
              class="video-element"
              :class="{ 'video-fade-transition': isVideoTransitioning }"
              :style="{ opacity: videoOpacity }"
              :src="videoAUrl"
              preload="metadata"
              @click="handleVideoClick"
            >
              Your browser does not support the video tag.
            </video>

            <!-- Drawing Canvas Overlay for Video A -->
            <DrawingCanvas
              v-if="videoAUrl && drawingCanvasA"
              ref="drawingCanvasARef"
              :current-frame="currentFrame"
              :is-drawing-mode="drawingCanvasA.isDrawingMode.value"
              :selected-tool="drawingCanvasA.currentTool.value.type"
              :stroke-width="drawingCanvasA.currentTool.value.strokeWidth"
              :severity="drawingCanvasA.currentTool.value.severity"
              :existing-drawings="drawingCanvasA.allDrawings.value"
              :is-loading-drawings="drawingCanvasA.isLoadingDrawings.value"
              @drawing-created="
                (drawing, event) => handleDrawingCreated(drawing, event)
              "
              @drawing-updated="
                (drawing, event) => handleDrawingUpdated(drawing, event)
              "
              @drawing-deleted="
                (drawingId, event) => handleDrawingDeleted(drawingId, event)
              "
            />
          </div>
        </div>

        <!-- Video B -->
        <div class="video-section">
          <div class="video-label">Video B</div>
          <div class="video-wrapper">
            <!-- Loading indicator for Video B -->
            <div
              v-if="!videoBState?.isLoaded && videoBUrl"
              class="loading-overlay"
            >
              <div class="loading-spinner"></div>
              <div class="loading-text">Loading Video B...</div>
            </div>

            <!-- Video B Element -->
            <video
              v-if="videoBUrl"
              ref="videoBElement"
              class="video-element"
              :class="{ 'video-fade-transition': isVideoTransitioning }"
              :style="{ opacity: videoOpacity }"
              :src="videoBUrl"
              preload="metadata"
              @click="handleVideoClick"
            >
              Your browser does not support the video tag.
            </video>

            <!-- Drawing Canvas Overlay for Video B -->
            <DrawingCanvas
              v-if="videoBUrl && drawingCanvasB"
              ref="drawingCanvasBRef"
              :current-frame="currentFrame"
              :is-drawing-mode="drawingCanvasB.isDrawingMode.value"
              :selected-tool="drawingCanvasB.currentTool.value.type"
              :stroke-width="drawingCanvasB.currentTool.value.strokeWidth"
              :severity="drawingCanvasB.currentTool.value.severity"
              :existing-drawings="drawingCanvasB.allDrawings.value"
              :is-loading-drawings="drawingCanvasB.isLoadingDrawings.value"
              @drawing-created="
                (drawing, event) => handleDrawingCreated(drawing, event)
              "
              @drawing-updated="
                (drawing, event) => handleDrawingUpdated(drawing, event)
              "
              @drawing-deleted="
                (drawingId, event) => handleDrawingDeleted(drawingId, event)
              "
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import DrawingCanvas from './DrawingCanvas.vue';
import { useVideoPlayer } from '../composables/useVideoPlayer.js';
import type { DrawingData } from '@/types/database';

interface Props {
  mode?: 'single' | 'dual';
  // Single video props
  videoUrl?: string;
  videoId?: string;
  autoplay?: boolean;
  controls?: boolean;
  poster?: string;
  drawingCanvas?: any;
  // Dual video props
  videoAUrl?: string;
  videoAId?: string;
  videoBUrl?: string;
  videoBId?: string;
  drawingCanvasA?: any;
  drawingCanvasB?: any;
  videoAState?: any;
  videoBState?: any;
  dualVideoPlayer?: any;
  // FPS compatibility props for dual video mode
  fpsCompatible?: boolean;
  primaryVideo?: string;
  // Annotation-related props
  projectId?: string;
  comparisonVideoId?: string;
  user?: any;
}

interface Emits {
  (
    e: 'time-update',
    data: { currentTime: number; duration: number; videoId?: string }
  ): void;
  (
    e: 'frame-update',
    data: {
      currentFrame: number;
      totalFrames: number;
      fps: number;
      videoId?: string;
    }
  ): void;
  (e: 'play'): void;
  (e: 'pause'): void;
  (e: 'duration-change', duration: number): void;
  (e: 'fps-detected', data: { fps: number; totalFrames: number }): void;
  (e: 'error', error: string): void;
  (e: 'loaded'): void;
  (e: 'video-click'): void;
  (e: 'drawing-created', drawing: DrawingData, videoContext?: string): void;
  (e: 'drawing-updated', drawing: DrawingData, videoContext?: string): void;
  (e: 'drawing-deleted', drawingId: string, videoContext?: string): void;
  (e: 'video-a-loaded'): void;
  (e: 'video-b-loaded'): void;
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'single',
  videoUrl: '',
  videoId: 'default-video',
  autoplay: false,
  controls: true,
  poster: '',
  fpsCompatible: true,
  primaryVideo: 'A',
});

const emit = defineEmits<Emits>();

// Video player composable for shared functionality
const {
  playerRef,
  playerState,
  isPlaying,
  currentTime,
  duration,
  isLoading,
  error,
  volume,
  isMuted,
  playbackSpeed,
  fps,
  currentFrame,
  totalFrames,
  play,
  pause,
  togglePlayPause,
  seekTo,
  setVolume,
  toggleMute,
  setPlaybackSpeed,
  startListening,
  stopListening,
  detectFPS,
  updateFrameFromTime,
} = useVideoPlayer();

// Template refs
const singleVideoElement = ref<HTMLVideoElement | null>(null);
const videoAElement = ref<HTMLVideoElement | null>(null);
const videoBElement = ref<HTMLVideoElement | null>(null);
const singleDrawingCanvasRef = ref();
const drawingCanvasARef = ref();
const drawingCanvasBRef = ref();

// Single video state
const singleVideoState = ref({
  isLoading: false,
  error: null,
});

// Video fade transition state
const isVideoTransitioning = ref(false);
const videoOpacity = ref(1);

// Setup video event listeners
const setupVideoEventListeners = (
  videoElement: HTMLVideoElement,
  videoState: any,
  videoLabel?: string
) => {
  if (!videoElement) return;

  const videoId = videoLabel
    ? `video-${videoLabel.toLowerCase()}`
    : props.videoId;

  videoElement.addEventListener('timeupdate', () => {
    currentTime.value = videoElement.currentTime;
    updateFrameFromTime();
    emit('time-update', {
      currentTime: videoElement.currentTime,
      duration: videoElement.duration || duration.value,
      videoId,
    });
    emit('frame-update', {
      currentFrame: currentFrame.value,
      totalFrames: totalFrames.value,
      fps: fps.value,
      videoId,
    });
  });

  videoElement.addEventListener('durationchange', () => {
    duration.value = videoElement.duration;
    emit('duration-change', videoElement.duration);
    detectFPS();
    emit('fps-detected', {
      fps: fps.value,
      totalFrames: totalFrames.value,
    });
  });

  videoElement.addEventListener('play', () => {
    isPlaying.value = true;
    emit('play');
  });

  videoElement.addEventListener('pause', () => {
    isPlaying.value = false;
    emit('pause');
  });

  videoElement.addEventListener('loadstart', () => {
    if (props.mode === 'single') {
      singleVideoState.value.isLoading = true;
    } else if (videoState) {
      videoState.isLoaded = false;
    }
  });

  videoElement.addEventListener('loadeddata', () => {
    duration.value = videoElement.duration;
    if (videoElement.duration > 0) {
      emit('duration-change', videoElement.duration);
    }

    if (props.mode === 'single') {
      singleVideoState.value.isLoading = false;
      emit('loaded');
    } else if (videoState) {
      videoState.isLoaded = true;
      if (videoLabel === 'A') {
        emit('video-a-loaded');
      } else if (videoLabel === 'B') {
        emit('video-b-loaded');
      }
    }
  });

  videoElement.addEventListener('error', (e) => {
    const errorMsg = `Error loading video: ${
      videoElement.error?.message || 'Unknown error'
    }`;

    if (props.mode === 'single') {
      singleVideoState.value.error = errorMsg;
    }

    emit('error', errorMsg);
  });

  videoElement.addEventListener('volumechange', () => {
    volume.value = videoElement.volume;
    isMuted.value = videoElement.muted;
  });

  // Set initial volume
  videoElement.volume = volume.value;
};

// Watch for video elements and set up event listeners
watch(
  singleVideoElement,
  (video) => {
    if (video && props.mode === 'single') {
      playerRef.value = video;
      setupVideoEventListeners(video, null);
    }
  },
  { flush: 'post' }
);

watch(
  videoAElement,
  (video) => {
    if (video && props.mode === 'dual') {
      if (props.videoAState) {
        setupVideoEventListeners(video, props.videoAState, 'A');
      }
      if (props.dualVideoPlayer) {
        props.dualVideoPlayer.videoARef.value = video;
      }
    }
  },
  { flush: 'post' }
);

watch(
  videoBElement,
  (video) => {
    if (video && props.mode === 'dual') {
      if (props.videoBState) {
        setupVideoEventListeners(video, props.videoBState, 'B');
      }
      if (props.dualVideoPlayer) {
        props.dualVideoPlayer.videoBRef.value = video;
      }
    }
  },
  { flush: 'post' }
);

// Watch for canvas refs and set them in dual video player
watch(
  [drawingCanvasARef, drawingCanvasBRef],
  ([canvasA, canvasB]) => {
    if (
      props.mode === 'dual' &&
      props.dualVideoPlayer &&
      props.dualVideoPlayer.setCanvasRefs
    ) {
      props.dualVideoPlayer.setCanvasRefs(canvasA, canvasB);
    }
  },
  { flush: 'post' }
);

// Watch for video URL changes
watch(
  () => props.videoUrl,
  (newUrl) => {
    if (newUrl && singleVideoElement.value) {
      playerRef.value = singleVideoElement.value;
      singleVideoElement.value.src = newUrl;
      singleVideoElement.value.load();
    }
  },
  { flush: 'post' }
);

// Watch for dual video URL changes
watch(
  () => [props.videoAUrl, props.videoBUrl],
  ([newVideoAUrl, newVideoBUrl]) => {
    console.log('🔍 [UnifiedVideoPlayer] Video URLs changed:', {
      mode: props.mode,
      videoAUrl: newVideoAUrl,
      videoBUrl: newVideoBUrl,
      videoAElement: !!videoAElement.value,
      videoBElement: !!videoBElement.value,
    });

    if (props.mode === 'dual') {
      if (newVideoAUrl && videoAElement.value) {
        console.log(
          '🔍 [UnifiedVideoPlayer] Setting Video A src:',
          newVideoAUrl
        );
        videoAElement.value.src = newVideoAUrl;
        videoAElement.value.load();
      }
      if (newVideoBUrl && videoBElement.value) {
        console.log(
          '🔍 [UnifiedVideoPlayer] Setting Video B src:',
          newVideoBUrl
        );
        videoBElement.value.src = newVideoBUrl;
        videoBElement.value.load();
      }
    }
  },
  { flush: 'post', immediate: true }
);

// Volume control
const handleVolumeChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const newVolume = parseFloat(target.value);
  setVolume(newVolume);
};

// Handle video fade transition when seeking to a new frame
const performVideoFadeTransition = async (seekFunction: () => void) => {
  // Start fade transition
  isVideoTransitioning.value = true;

  // Fade out video
  videoOpacity.value = 0;

  // Wait for fade out to complete
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Perform the seek operation
  seekFunction();

  // Wait a bit for the video to update the frame
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Fade in video
  videoOpacity.value = 1;

  // Wait for fade in to complete, then end transition
  setTimeout(() => {
    isVideoTransitioning.value = false;
  }, 150);
};

// Handle video click
const handleVideoClick = () => {
  pause();
  emit('video-click');
};

// Drawing event handlers
const handleDrawingCreated = (drawing: DrawingData, event?: Event) => {
  if (props.mode === 'dual') {
    // Determine which video the drawing came from based on the canvas ref
    const target = event?.target as HTMLElement;
    const canvasA = drawingCanvasARef.value?.$el;
    const canvasB = drawingCanvasBRef.value?.$el;

    let videoContext = 'A'; // default
    if (target && canvasB && (target === canvasB || canvasB.contains(target))) {
      videoContext = 'B';
    }

    console.log(
      `🎨 [UnifiedVideoPlayer] Drawing created on video ${videoContext}:`,
      drawing
    );

    // CRITICAL FIX: Pass the detected video context to the parent
    emit('drawing-created', drawing, videoContext);
  } else {
    emit('drawing-created', drawing);
  }
};

const handleDrawingUpdated = (drawing: DrawingData, event?: Event) => {
  if (props.mode === 'dual') {
    // Determine which video the drawing came from
    const target = event?.target as HTMLElement;
    const canvasA = drawingCanvasARef.value?.$el;
    const canvasB = drawingCanvasBRef.value?.$el;

    let videoContext = 'A'; // default
    if (target && canvasB && (target === canvasB || canvasB.contains(target))) {
      videoContext = 'B';
    }

    console.log(
      `🎨 [UnifiedVideoPlayer] Drawing updated on video ${videoContext}:`,
      drawing
    );

    // CRITICAL FIX: Pass the detected video context to the parent
    emit('drawing-updated', drawing, videoContext);
  } else {
    emit('drawing-updated', drawing);
  }
};

const handleDrawingDeleted = (drawingId: string, event?: Event) => {
  if (props.mode === 'dual') {
    // Determine which video the drawing came from
    const target = event?.target as HTMLElement;
    const canvasA = drawingCanvasARef.value?.$el;
    const canvasB = drawingCanvasBRef.value?.$el;

    let videoContext = 'A'; // default
    if (target && canvasB && (target === canvasB || canvasB.contains(target))) {
      videoContext = 'B';
    }

    console.log(
      `🎨 [UnifiedVideoPlayer] Drawing deleted on video ${videoContext}:`,
      drawingId
    );

    // CRITICAL FIX: Pass the detected video context to the parent
    emit('drawing-deleted', drawingId, videoContext);
  } else {
    emit('drawing-deleted', drawingId);
  }
};

// Lifecycle
onMounted(() => {
  startListening();

  // Set up video dimensions for drawing canvas
  nextTick(() => {
    if (
      props.mode === 'single' &&
      singleVideoElement.value &&
      props.drawingCanvas
    ) {
      const video = singleVideoElement.value;
      props.drawingCanvas.setVideoSize(
        video.videoWidth || 1920,
        video.videoHeight || 1080
      );
    }
  });
});

onUnmounted(() => {
  stopListening();
});

// Expose methods to parent component
defineExpose({
  seekTo,
  play,
  pause,
  togglePlayPause,
  performVideoFadeTransition,
  singleVideoElement,
  videoAElement,
  videoBElement,
  // Expose drawing canvas refs for annotation panel
  singleDrawingCanvasRef,
  drawingCanvasARef,
  drawingCanvasBRef,
});
</script>

<style scoped>
.unified-video-player {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
}

.single-video-container,
.dual-video-container {
  width: 100%;
}

.video-wrapper {
  position: relative;
  width: 100%;
  background: black;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.video-element {
  width: 100%;
  height: auto;
  display: block;
  cursor: pointer;
  transition: opacity 150ms ease-in-out;
}

.video-element.video-fade-transition {
  transition: opacity 150ms ease-in-out;
}

/* Loading States */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: 0.5rem;
}

.loading-spinner {
  width: 3rem;
  height: 3rem;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top: 3px solid #ffffff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

.loading-text {
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Error States */
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  color: white;
  text-align: center;
  padding: 2rem;
}

.error-icon {
  width: 3rem;
  height: 3rem;
  margin-bottom: 1rem;
  color: #ef4444;
}

.error-message {
  font-size: 0.875rem;
  margin-bottom: 1rem;
  color: #d1d5db;
}

.retry-button {
  background: #374151;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.retry-button:hover {
  background: #4b5563;
}

/* Placeholder */
.no-video-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 24rem;
  color: #9ca3af;
  text-align: center;
  padding: 2rem;
}

.placeholder-icon {
  width: 4rem;
  height: 4rem;
  margin-bottom: 1rem;
  color: #6b7280;
}

.placeholder-title {
  font-size: 1.125rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #d1d5db;
}

.placeholder-description {
  font-size: 0.875rem;
  max-width: 28rem;
  color: #9ca3af;
}

/* Dual Video Layout */
.videos-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  width: 100%;
}

.video-section {
  position: relative;
}

.video-label {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  z-index: 20;
}

/* Controls */
.video-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
  color: white;
  padding: 1rem;
  z-index: 30;
}

.controls-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.control-button {
  padding: 0.5rem;
  border-radius: 0.375rem;
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.control-button:hover {
  background: rgba(255, 255, 255, 0.1);
}

.control-icon {
  width: 1.25rem;
  height: 1.25rem;
  fill: currentColor;
}

.volume-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.volume-slider {
  width: 5rem;
  height: 0.25rem;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  outline: none;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  appearance: none;
  width: 0.75rem;
  height: 0.75rem;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 0.75rem;
  height: 0.75rem;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.speed-controls {
  position: relative;
}

.speed-select {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 0.875rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  border: none;
  outline: none;
  cursor: pointer;
  transition: background-color 0.2s;
}

.speed-select:hover {
  background: rgba(255, 255, 255, 0.2);
}

.speed-select option {
  background: #1f2937;
  color: white;
}

/* Responsive */
@media (max-width: 768px) {
  .videos-grid {
    grid-template-columns: 1fr;
  }

  .volume-controls,
  .speed-controls {
    display: none;
  }
}
</style>
