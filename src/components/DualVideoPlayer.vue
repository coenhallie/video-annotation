<template>
  <div class="dual-video-player">
    <!-- Video Container -->
    <div class="videos-container">
      <!-- Video A -->
      <div class="video-section">
        <div class="video-label">Video A</div>
        <div class="video-wrapper">
          <!-- Loading indicator for Video A -->
          <div
            v-if="!videoAState.isLoaded && videoAUrl"
            class="loading-overlay"
          >
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading Video A...</div>
          </div>
          <DrawingVideoPlayer
            ref="videoPlayerARef"
            :video-url="videoAUrl"
            :video-id="videoAId"
            :drawing-canvas="drawingCanvasA"
            :controls="false"
            @time-update="handleTimeUpdate"
            @frame-update="handleFrameUpdate"
            @fps-detected="handleFpsDetected"
            @loaded="handleVideoALoaded"
          />
        </div>
      </div>

      <!-- Video B -->
      <div class="video-section">
        <div class="video-label">Video B</div>
        <div class="video-wrapper">
          <!-- Loading indicator for Video B -->
          <div
            v-if="!videoBState.isLoaded && videoBUrl"
            class="loading-overlay"
          >
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading Video B...</div>
          </div>
          <DrawingVideoPlayer
            ref="videoPlayerBRef"
            :video-url="videoBUrl"
            :video-id="videoBId"
            :drawing-canvas="drawingCanvasB"
            :controls="false"
            @time-update="handleTimeUpdate"
            @frame-update="handleFrameUpdate"
            @fps-detected="handleFpsDetected"
            @loaded="handleVideoBLoaded"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import DrawingVideoPlayer from './DrawingVideoPlayer.vue';

const props = defineProps({
  videoAUrl: String,
  videoAId: String,
  drawingCanvasA: Object,
  videoBUrl: String,
  videoBId: String,
  drawingCanvasB: Object,
  videoAState: Object,
  videoBState: Object,
  dualVideoPlayer: Object,
});

const emit = defineEmits([
  'time-update',
  'frame-update',
  'fps-detected',
  'video-a-loaded',
  'video-b-loaded',
]);

// Refs for video players
const videoPlayerARef = ref(null);
const videoPlayerBRef = ref(null);

// Connect video refs to the dual video player composable
const connectVideoRefs = () => {
  if (!props.dualVideoPlayer) {
    console.warn('DualVideoPlayer: No dualVideoPlayer prop provided');
    return;
  }

  console.log('DualVideoPlayer: Attempting to connect video refs');

  // DIAGNOSTIC: Trace the ref chain step by step for Video A
  console.log('🔍 DIAGNOSTIC - Video A ref chain:');
  console.log('  Step 1 - videoPlayerARef.value:', videoPlayerARef.value);
  console.log(
    '  Step 2 - videoPlayerRef property:',
    videoPlayerARef.value?.videoPlayerRef
  );
  console.log(
    '  Step 3 - videoElement (CORRECTED PATH):',
    videoPlayerARef.value?.videoPlayerRef?.videoElement
  );

  // DIAGNOSTIC: Trace the ref chain step by step for Video B
  console.log('🔍 DIAGNOSTIC - Video B ref chain:');
  console.log('  Step 1 - videoPlayerBRef.value:', videoPlayerBRef.value);
  console.log(
    '  Step 2 - videoPlayerRef property:',
    videoPlayerBRef.value?.videoPlayerRef
  );
  console.log(
    '  Step 3 - videoElement (CORRECTED PATH):',
    videoPlayerBRef.value?.videoPlayerRef?.videoElement
  );

  // DIAGNOSTIC: Check if DrawingVideoPlayer components are mounted
  console.log('🔍 DIAGNOSTIC - Component states:');
  console.log('  videoPlayerARef exists:', !!videoPlayerARef.value);
  console.log('  videoPlayerBRef exists:', !!videoPlayerBRef.value);
  console.log('  videoAUrl:', props.videoAUrl);
  console.log('  videoBUrl:', props.videoBUrl);

  console.log(
    'Video A ref (CORRECTED):',
    videoPlayerARef.value?.videoPlayerRef?.videoElement
  );
  console.log(
    'Video B ref (CORRECTED):',
    videoPlayerBRef.value?.videoPlayerRef?.videoElement
  );

  // Connect Video A
  if (videoPlayerARef.value?.videoPlayerRef?.videoElement) {
    const videoElement = videoPlayerARef.value.videoPlayerRef.videoElement;
    props.dualVideoPlayer.videoARef.value = videoElement;
    console.log('DualVideoPlayer: Connected Video A element:', videoElement);

    // Setup event listeners for this video
    if (props.dualVideoPlayer.setupVideoEventListeners) {
      props.dualVideoPlayer.setupVideoEventListeners(
        videoElement,
        props.dualVideoPlayer.videoAState,
        'A'
      );
      console.log('DualVideoPlayer: Setup event listeners for Video A');
    }
  } else {
    console.warn('DualVideoPlayer: Video A element not available yet');
  }

  // Connect Video B
  if (videoPlayerBRef.value?.videoPlayerRef?.videoElement) {
    const videoElement = videoPlayerBRef.value.videoPlayerRef.videoElement;
    props.dualVideoPlayer.videoBRef.value = videoElement;
    console.log('DualVideoPlayer: Connected Video B element:', videoElement);

    // Setup event listeners for this video
    if (props.dualVideoPlayer.setupVideoEventListeners) {
      props.dualVideoPlayer.setupVideoEventListeners(
        videoElement,
        props.dualVideoPlayer.videoBState,
        'B'
      );
      console.log('DualVideoPlayer: Setup event listeners for Video B');
    }
  } else {
    console.warn('DualVideoPlayer: Video B element not available yet');
  }
};

onMounted(() => {
  console.log('DualVideoPlayer: Component mounted');

  // Try to connect immediately
  connectVideoRefs();

  // Also try after delays to ensure videos are loaded
  setTimeout(connectVideoRefs, 100);
  setTimeout(connectVideoRefs, 500);
  setTimeout(connectVideoRefs, 1000);
});

// Event handlers
const handleTimeUpdate = (data) => {
  // Update dual video player state if available
  if (props.dualVideoPlayer) {
    // Only update from video A to avoid conflicts
    if (data.videoId === props.videoAId) {
      props.dualVideoPlayer.currentTime.value = data.currentTime;
      props.dualVideoPlayer.currentFrame.value = data.currentFrame;
    }
  }
  emit('time-update', data);
};

const handleFrameUpdate = (data) => {
  // Update dual video player state if available
  if (props.dualVideoPlayer) {
    // Only update from video A to avoid conflicts
    if (data.videoId === props.videoAId) {
      props.dualVideoPlayer.currentFrame.value = data.currentFrame;
    }
  }
  emit('frame-update', data);
};

const handleFpsDetected = (data) => {
  // Update dual video player state if available
  if (props.dualVideoPlayer) {
    props.dualVideoPlayer.fps.value = data.fps;
    // Recalculate total frames based on new FPS
    if (props.dualVideoPlayer.duration.value > 0) {
      props.dualVideoPlayer.totalFrames.value = Math.round(
        props.dualVideoPlayer.duration.value * data.fps
      );
    }
  }
  emit('fps-detected', data);
};

const handleVideoALoaded = () => {
  if (props.videoAState) {
    props.videoAState.isLoaded = true;
  }

  // Connect video ref and setup event listeners after loading
  if (
    props.dualVideoPlayer &&
    videoPlayerARef.value?.videoPlayerRef?.videoElement
  ) {
    const videoElement = videoPlayerARef.value.videoPlayerRef.videoElement;
    props.dualVideoPlayer.videoARef.value = videoElement;

    // Setup event listeners for automatic synchronization
    if (props.dualVideoPlayer.setupVideoEventListeners) {
      props.dualVideoPlayer.setupVideoEventListeners(
        videoElement,
        props.dualVideoPlayer.videoAState,
        'A'
      );
    }
  }

  emit('video-a-loaded');
};

const handleVideoBLoaded = () => {
  if (props.videoBState) {
    props.videoBState.isLoaded = true;
  }

  // Connect video ref and setup event listeners after loading
  if (
    props.dualVideoPlayer &&
    videoPlayerBRef.value?.videoPlayerRef?.videoElement
  ) {
    const videoElement = videoPlayerBRef.value.videoPlayerRef.videoElement;
    props.dualVideoPlayer.videoBRef.value = videoElement;

    // Setup event listeners for automatic synchronization
    if (props.dualVideoPlayer.setupVideoEventListeners) {
      props.dualVideoPlayer.setupVideoEventListeners(
        videoElement,
        props.dualVideoPlayer.videoBState,
        'B'
      );
    }
  }

  emit('video-b-loaded');
};
</script>

<style scoped>
.videos-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  width: 100%;
}

.video-section {
  position: relative;
}

.video-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
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
  z-index: 10;
}

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
  z-index: 5;
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

@media (max-width: 768px) {
  .videos-container {
    grid-template-columns: 1fr;
  }
}
</style>
