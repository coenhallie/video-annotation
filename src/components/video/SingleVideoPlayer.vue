<template>
  <div ref="containerRef" class="video-wrapper" :class="{ paused: !isPlaying }">
    <!-- Loading indicator -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner" />
      <div class="loading-text">Loading video...</div>
    </div>

    <!-- Error message -->
    <div v-if="error" class="error-overlay">
      <p class="error-message">{{ error }}</p>
      <button class="retry-button" @click="$emit('retry')">Try Again</button>
    </div>

    <!-- Video Element -->
    <video
      ref="videoRef"
      class="video-element"
      :src="videoUrl"
      :poster="poster"
      crossorigin="anonymous"
      preload="auto"
      @click="togglePlay"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @play="onPlay"
      @pause="onPause"
      @error="onError"
    >
      Your browser does not support the video tag.
    </video>

    <!-- Overlays Slot (DrawingCanvas, PoseVisualization, etc) -->
    <slot 
      name="overlays" 
      :current-time="currentTime" 
      :current-frame="currentFrame"
      :video-element="videoRef"
    ></slot>

    <!-- Controls -->
    <VideoControls
      v-if="controls && !isLoading"
      :is-playing="isPlaying"
      :is-muted="isMuted"
      :volume="volume"
      :playback-rate="playbackRate"
      @toggle-play="togglePlay"
      @prev-frame="seekFrame(-1)"
      @next-frame="seekFrame(1)"
      @toggle-mute="toggleMute"
      @volume-change="setVolume"
      @speed-change="setPlaybackRate"
    >
      <template #right-controls>
        <slot name="custom-controls"></slot>
      </template>
    </VideoControls>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useVideoStore } from '@/stores/video';
import VideoControls from './VideoControls.vue';
import { storeToRefs } from 'pinia';

const props = defineProps<{
  videoUrl: string;
  poster?: string;
  autoplay?: boolean;
  controls?: boolean;
  // If true, this component won't auto-bind to the global video store
  disableGlobalStore?: boolean;
  
  // Props for controlled mode (when disableGlobalStore is true)
  currentTime?: number;
  isPlaying?: boolean;
  volume?: number;
  isMuted?: boolean;
  playbackRate?: number;
}>();

const emit = defineEmits<{
  (e: 'retry'): void;
  (e: 'loaded', event: Event): void;
  (e: 'error', error: any): void;
  (e: 'time-update', time: number): void;
  (e: 'duration-change', duration: number): void;
  (e: 'play'): void;
  (e: 'pause'): void;
  (e: 'fps-detected', data: { fps: number; totalFrames: number }): void;
}>();

const videoStore = useVideoStore();
// Conditional access to store refs
const storeRefs = !props.disableGlobalStore ? storeToRefs(videoStore) : null;

// Internal state (used if global store is disabled and no props provided - though usually controlled via props)
const localIsPlaying = ref(false);
const localCurrentTime = ref(0);
const localVolume = ref(1);
const localIsMuted = ref(false);
const localPlaybackRate = ref(1);
const localCurrentFrame = ref(0);

// Computed properties to merge sources of truth
const isPlaying = computed(() => props.disableGlobalStore ? (props.isPlaying ?? localIsPlaying.value) : storeRefs!.isPlaying.value);
const currentTime = computed(() => props.disableGlobalStore ? (props.currentTime ?? localCurrentTime.value) : storeRefs!.currentTime.value);
const volume = computed(() => props.disableGlobalStore ? (props.volume ?? localVolume.value) : storeRefs!.volume.value);
const isMuted = computed(() => props.disableGlobalStore ? (props.isMuted ?? localIsMuted.value) : storeRefs!.isMuted.value);
const playbackRate = computed(() => props.disableGlobalStore ? (props.playbackRate ?? localPlaybackRate.value) : storeRefs!.playbackRate.value);
const currentFrame = computed(() => props.disableGlobalStore ? (props.currentTime ? Math.floor(props.currentTime * 30) : localCurrentFrame.value) : storeRefs!.currentFrame.value);

const videoRef = ref<HTMLVideoElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const isLoading = ref(true);
const error = ref<string | null>(null);

// Video Element API
const togglePlay = () => {
  if (!videoRef.value) return;
  if (videoRef.value.paused) {
    videoRef.value.play();
  } else {
    videoRef.value.pause();
  }
};

const seekFrame = (frames: number) => {
  if (!videoRef.value) return;
  const fps = (!props.disableGlobalStore ? videoStore.fps : 30) || 30; 
  videoRef.value.currentTime += frames / fps;
};

const toggleMute = () => {
  if (!videoRef.value) return;
  videoRef.value.muted = !videoRef.value.muted;
  if (!props.disableGlobalStore) {
    storeRefs!.isMuted.value = videoRef.value.muted;
  } else {
    localIsMuted.value = videoRef.value.muted;
  }
};

const setVolume = (val: number) => {
  if (!videoRef.value) return;
  videoRef.value.volume = val;
  if (!props.disableGlobalStore) {
    storeRefs!.volume.value = val;
  } else {
    localVolume.value = val;
  }
};

const setPlaybackRate = (rate: number) => {
  if (!videoRef.value) return;
  videoRef.value.playbackRate = rate;
  if (!props.disableGlobalStore) {
    storeRefs!.playbackRate.value = rate;
  } else {
    localPlaybackRate.value = rate;
  }
};

// Event Handlers
const onLoadedMetadata = (e: Event) => {
  isLoading.value = false;
  if (videoRef.value) {
    if (!props.disableGlobalStore) {
      videoStore.updateDuration(videoRef.value.duration);
      videoStore.setDimensions(videoRef.value.videoWidth, videoRef.value.videoHeight);
    }
    emit('duration-change', videoRef.value.duration);
  }
  emit('loaded', e);
  if (props.autoplay) videoRef.value?.play();

  // Detect FPS
  if (videoRef.value) {
    detectFPS(videoRef.value);
  }
};

const detectFPS = (video: HTMLVideoElement) => {
  // If requestVideoFrameCallback is supported (Chrome, Edge, Firefox)
  if ('requestVideoFrameCallback' in video) {
    let frameCount = 0;
    let startTime = 0;
    const maxFrames = 30; // Sample 30 frames
    
    // Play briefly to capture frames if paused
    // Play briefly to capture frames if paused
    // We need the video to be playing or seeking to get callbacks
    // If it's paused, we can't reliably get callbacks without playing
    // For now, let's rely on playback. If not playing, we might delay detection until play
    
    const frameCallback = (now: number, _metadata: any) => {
      if (!startTime) startTime = now;
      frameCount++;
      
      if (frameCount < maxFrames) {
        (video as any).requestVideoFrameCallback(frameCallback);
      } else {
        const duration = now - startTime;
        const avgFps = Math.round((frameCount / duration) * 1000);
        
        // Sanity check common frame rates
        const commonRates = [24, 25, 30, 48, 50, 60, 120];
        const closest = commonRates.reduce((prev, curr) => 
          Math.abs(curr - avgFps) < Math.abs(prev - avgFps) ? curr : prev
        );
        
        // If calculated FPS is close to a common rate (within 5%), use common rate
        const finalFps = Math.abs(avgFps - closest) / closest < 0.05 ? closest : avgFps;
        
        // Emit detected FPS
        // Use default emit since we can't easily access the typed emit inside this callback if defined outside
        // But we can use the 'emit' variable from setup
        const totalFrames = Math.floor(video.duration * finalFps);
        
        if (!props.disableGlobalStore) {
             videoStore.setFrameData(
                 storeRefs!.currentFrame.value, 
                 totalFrames, 
                 finalFps
             );
        }
        emit('fps-detected', { fps: finalFps, totalFrames });
      }
    };
    
    // Initialize with default FPS (30) immediately to allow frame calculation before playback
    // This fixes the issue where scrubbing before playing results in frame 0
    const defaultFps = 30;
    const initialTotalFrames = Math.floor(video.duration * defaultFps);
    if (!props.disableGlobalStore) {
      if (videoStore.fps === 0) {
        videoStore.setFrameData(
             storeRefs!.currentFrame.value, 
             initialTotalFrames, 
             defaultFps
        );
      }
    }
    
    (video as any).requestVideoFrameCallback(frameCallback);
  } else {
    // Fallback for Safari/others: Assume 30 or try to parse from metadata if possible (complex)
    // Default to 30
    const defaultFps = 30;
    const totalFrames = Math.floor(video.duration * defaultFps);
    
    if (!props.disableGlobalStore) {
         videoStore.setFrameData(
             storeRefs!.currentFrame.value, 
             totalFrames, 
             defaultFps
         );
    }
    emit('fps-detected', { fps: defaultFps, totalFrames });
  }
};

const onTimeUpdate = () => {
  if (videoRef.value) {
    const time = videoRef.value.currentTime;
    if (!props.disableGlobalStore) {
      videoStore.updateTime(time);
    } else {
      localCurrentTime.value = time;
    }
    emit('time-update', time);
  }
};

const onPlay = () => {
  if (!props.disableGlobalStore) {
    videoStore.setPlaying(true);
  } else {
    localIsPlaying.value = true;
  }
  emit('play');
};

const onPause = () => {
  if (!props.disableGlobalStore) {
    videoStore.setPlaying(false);
  } else {
    localIsPlaying.value = false;
  }
  emit('pause');
};


const onError = (e: Event) => {
  isLoading.value = false;
  error.value = "Failed to load video.";
  emit('error', e);
};

// Expose ref for parent components if needed
defineExpose({
  videoRef,
  containerRef,
  seekFrame
});

// Watchers
watch(() => props.videoUrl, () => {
  isLoading.value = true;
  error.value = null;
});

// Sync store state changes back to video element if they change externally (e.g. timeline click)
watch(currentTime, (newTime) => {
  if (videoRef.value && Math.abs(videoRef.value.currentTime - newTime) > 0.1) {
    videoRef.value.currentTime = newTime;
  }
});

watch(isPlaying, (playing) => {
  if (videoRef.value) {
    if (playing && videoRef.value.paused) videoRef.value.play();
    else if (!playing && !videoRef.value.paused) videoRef.value.pause();
  }
});
</script>

<style scoped>
.video-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background: black;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.video-element {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  z-index: 10;
}

.retry-button {
  margin-top: 10px;
  padding: 8px 16px;
  background: #3b82f6;
  border-radius: 4px;
  color: white;
}
</style>
