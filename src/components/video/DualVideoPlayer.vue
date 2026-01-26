<template>
  <div class="dual-video-wrapper">
    <div class="videos-grid">
      <!-- Video A -->
      <div class="video-section">
        <span class="video-label">Video A</span>
        <SingleVideoPlayer
          ref="singlePlayerA"
          :video-url="videoAUrl"
          :poster="null"
          :controls="false"
          :disable-global-store="true"
          :is-playing="videoAIsPlaying"
          :current-time="videoACurrentTime"
          :playback-rate="playbackRate"
          :volume="volume"
          :is-muted="isMuted"
          @loaded="(e) => onVideoLoaded('A', e)"
          @error="(e) => onError('A', e)"
        >
          <template #overlays="{ currentTime, currentFrame, videoElement }">
            <slot
              name="overlays-a"
              :current-time="currentTime"
              :current-frame="currentFrame"
              :video-element="videoElement"
            ></slot>
          </template>
        </SingleVideoPlayer>
      </div>

      <!-- Video B -->
      <div class="video-section">
        <span class="video-label">Video B</span>
        <SingleVideoPlayer
          ref="singlePlayerB"
          :video-url="videoBUrl"
          :poster="null"
          :controls="false"
          :disable-global-store="true"
          :is-playing="videoBIsPlaying"
          :current-time="videoBCurrentTime"
          :playback-rate="playbackRate"
          :volume="volume"
          :is-muted="isMuted"
          @loaded="(e) => onVideoLoaded('B', e)"
          @error="(e) => onError('B', e)"
        >
          <template #overlays="{ currentTime, currentFrame, videoElement }">
            <slot
              name="overlays-b"
              :current-time="currentTime"
              :current-frame="currentFrame"
              :video-element="videoElement"
            ></slot>
          </template>
        </SingleVideoPlayer>
      </div>
    </div>

    <!-- Synchronized Controls -->
    <VideoControls
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
        <slot name="controls-right"></slot>
      </template>
    </VideoControls>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import SingleVideoPlayer from './SingleVideoPlayer.vue';
import VideoControls from './VideoControls.vue';
import { useDualVideoPlayer } from '../../composables/useDualVideoPlayer';

const props = defineProps<{
  videoAUrl: string;
  videoBUrl: string;
}>();

const emit = defineEmits<{
  (e: 'video-a-loaded'): void;
  (e: 'video-b-loaded'): void;
  (e: 'error', error: any): void;
}>();

// Component Refs
const singlePlayerA = ref<InstanceType<typeof SingleVideoPlayer> | null>(null);
const singlePlayerB = ref<InstanceType<typeof SingleVideoPlayer> | null>(null);

// Initialize Dual Video Logic
const {
  videoARef,
  videoBRef,
  videoACurrentTime,
  videoBCurrentTime,
  videoAIsPlaying,
  videoBIsPlaying,
  play,
  pause,
  seek, // Use seek for synchronized seeking
  setPlaybackRate: setDualPlaybackRate,
  videoAId,
  videoBId,
  setVideoSources
} = useDualVideoPlayer();

// We need to bind the internal video elements to the composable refs
watch(() => singlePlayerA.value?.videoRef, (el) => {
  if (el) {
    videoARef.value = el;
    // Set source for composable tracking (optional but good for completeness)
    if (props.videoAUrl) {
       // We can't easily access ID here unless passed as prop, defaulting for now
       // setVideoSources handles this if we call it, or we rely on the ref binding and manual url watching in composable?
       // The composable watches videoARef and sets up listeners.
    }
  }
});

watch(() => singlePlayerB.value?.videoRef, (el) => {
  if (el) videoBRef.value = el;
});

// Watch URL props to update composable state
watch(() => [props.videoAUrl, props.videoBUrl], ([urlA, urlB]) => {
  setVideoSources?.(
    { url: urlA, id: 'video-a' },
    { url: urlB, id: 'video-b' }
  );
}, { immediate: true });


// Derived Synchronized State
// We consider "Playing" if either is playing (or maybe Primary is playing?)
// For dual sync mode, they should match.
const isPlaying = computed(() => videoAIsPlaying.value || videoBIsPlaying.value);
const isMuted = ref(false); // Mute state managed locally for now, applied to both
const volume = ref(1); // Volume managed locally, applied to both
const playbackRate = ref(1);

// Controls Handlers
const togglePlay = () => {
  if (isPlaying.value) {
    pause();
  } else {
    play();
  }
};

const seekFrame = (frames: number) => {
  // We need to get current time and add frames
  // Assuming 30fps for simplicity or needing to fetch FPS
  const fps = 30; // TODO: Get actual FPS from state
  const timeStep = frames / fps;
  // Use seek to sync-seek both
  if (videoARef.value) {
      seek(videoARef.value.currentTime + timeStep);
  }
};

const toggleMute = () => {
  isMuted.value = !isMuted.value;
  if(videoARef.value) videoARef.value.muted = isMuted.value;
  if(videoBRef.value) videoBRef.value.muted = isMuted.value;
};

const setVolume = (val: number) => {
  volume.value = val;
  if(videoARef.value) videoARef.value.volume = val;
  if(videoBRef.value) videoBRef.value.volume = val;
};

const setPlaybackRate = (rate: number) => {
  playbackRate.value = rate;
  setDualPlaybackRate(rate);
};

// Events
const onVideoLoaded = (id: 'A' | 'B', e: Event) => {
  if (id === 'A') emit('video-a-loaded');
  else emit('video-b-loaded');
};

const onError = (id: 'A' | 'B', e: any) => {
  emit('error', `${id}: ${e}`);
};

// Expose internal refs/methods for parent access (UnifiedVideoPlayer needs these)
defineExpose({
    videoARef,
    videoBRef,
    // Add other fields as needed by UnifiedVideoPlayer
});
</script>

<style scoped>
.dual-video-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background: black;
  display: flex;
  flex-direction: column;
}

.videos-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  height: 100%;
  gap: 1px;
}

.video-section {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.video-label {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 10;
}
</style>
