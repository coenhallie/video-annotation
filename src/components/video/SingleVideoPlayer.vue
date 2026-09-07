<template>
  <div
    ref="containerRef"
    class="video-wrapper"
    :class="{ paused: !isPlaying }"
  >
    <!-- Loading indicator -->
    <div
      v-if="isLoading"
      class="loading-overlay"
    >
      <div class="loading-spinner" />
      <div class="loading-text">
        Loading video...
      </div>
    </div>

    <!-- Error message -->
    <div
      v-if="error"
      class="error-overlay"
    >
      <p class="error-message">
        {{ error }}
      </p>
      <button
        class="retry-button"
        @click="$emit('retry')"
      >
        Try Again
      </button>
    </div>

    <!-- Video Element -->
    <!-- No :src binding: the source is attached in script, see attachSource. -->
    <video
      ref="videoRef"
      class="video-element"
      v-bind="poster ? { poster } : {}"
      crossorigin="anonymous"
      preload="auto"
      @click="togglePlay"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @seeked="onSeeked"
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
    />

    <!--
      Controls, anchored to the picture rather than to the wrapper. The video
      is letterboxed inside the wrapper (max-width/max-height with auto sizing),
      so a wrapper-relative bar can sit far below the picture - a 1920x660 clip
      in this editor puts it nearly 300px into the black band. This frame takes
      the video's own intrinsic width and aspect ratio under the same clamps,
      which resolves it to exactly the rendered picture.
    -->
    <div class="controls-frame">
      <div
        class="controls-frame-box"
        :style="frameBoxStyle"
      >
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
            <slot name="custom-controls" />
          </template>
        </VideoControls>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import { useVideoStore } from '@/stores/video';
import VideoControls from './VideoControls.vue';
import { storeToRefs } from 'pinia';
import {
  openFragmentedMp4,
  type FragmentedMp4Source,
  type RefreshVideoUrl,
} from '@/services/fragmentedMp4Source';
import { sameObject } from '@/utils/fragmentedMp4';
import { frameRateFromMediaTimes } from '@/utils/frameRate';

const props = defineProps<{
  videoUrl: string;
  // Replaces an expired presigned URL for the same object while a fragmented
  // MP4 is streaming, without restarting playback. Without it, the expiry
  // surfaces as an error like any other source. `| undefined` so parents can
  // pass through an unset value under exactOptionalPropertyTypes.
  refreshUrl?: RefreshVideoUrl | undefined;
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

// The picture's own dimensions, read once metadata lands. See the frame comment
// in the template: the controls are positioned against these, not the wrapper.
const intrinsicWidth = ref(0);
const intrinsicHeight = ref(0);

const frameBoxStyle = computed(() => {
  if (!intrinsicWidth.value || !intrinsicHeight.value) return undefined;
  return {
    width: `${intrinsicWidth.value}px`,
    // Load-bearing: the fallback rule sizes the box to the whole wrapper, and
    // an explicit height makes the browser ignore aspect-ratio outright.
    height: 'auto',
    aspectRatio: `${intrinsicWidth.value} / ${intrinsicHeight.value}`,
  };
});

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
    intrinsicWidth.value = videoRef.value.videoWidth;
    intrinsicHeight.value = videoRef.value.videoHeight;
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

/**
 * Publish a frame rate: the store, if this player owns it, and the parent.
 * `totalFrames` follows from it and the duration.
 */
const publishFps = (video: HTMLVideoElement, fps: number) => {
  const totalFrames = Math.floor(video.duration * fps);
  if (!props.disableGlobalStore) {
    videoStore.setFrameData(storeRefs!.currentFrame.value, totalFrames, fps);
  }
  emit('fps-detected', { fps, totalFrames });
};

/**
 * Find the frame rate. Nothing on the element exposes it and the database's
 * `fps` column is a placeholder, so:
 *
 * 1. A fragmented mp4 streaming through MSE declares it in the container,
 *    exactly. That is every pipeline video.
 * 2. Otherwise it is measured from the `mediaTime` of frames the element
 *    presents, which advances by exactly one frame per presented frame however
 *    the wall clock stutters (see utils/frameRate.ts). The previous estimator
 *    counted callbacks against wall-clock time and, under load, settled on 24
 *    for a 25 fps stream - and that number then stamped every annotation.
 *
 * Until either answers, 30 is published so scrubbing before playback still
 * produces frame numbers; presented frames only arrive once the video plays.
 */
const detectFPS = (video: HTMLVideoElement) => {
  if (source?.fps) {
    publishFps(video, source.fps);
    return;
  }

  publishFps(video, 30);

  // Declared as an optional method in types/videoFrameCallback.d.ts, so this
  // narrows without collapsing the fallback branch to never. Safari before
  // 15.4 has no such callback and keeps the 30 published above.
  const requestFrame = video.requestVideoFrameCallback?.bind(video);
  if (!requestFrame) return;

  const mediaTimes: number[] = [];
  const maxSamples = 31; // MIN_FRAME_DELTAS deltas even with a few drops
  const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
    if (videoRef.value !== video) return; // the element moved on
    mediaTimes.push(metadata.mediaTime);
    if (mediaTimes.length < maxSamples) {
      requestFrame(onFrame);
      return;
    }
    const fps = frameRateFromMediaTimes(mediaTimes);
    if (fps) publishFps(video, fps);
  };
  requestFrame(onFrame);
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

const onSeeked = () => {
  // Update store with the actual time the video landed on after seeking.
  // This is critical for remotely-served videos (e.g. AWS S3 presigned URLs)
  // where timeupdate may not fire reliably during/after seeks.
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


const onError = (e: Event | Error) => {
  isLoading.value = false;
  error.value = "Failed to load video.";
  emit('error', e);
};

// Source attachment.
//
// `src` is not bound in the template. A fragmented MP4 (the pipeline's
// output) streams through MSE via fragmentedMp4Source, because Chrome's
// native demuxer reads the whole file before it will paint one; anything
// else gets the URL assigned directly. Both end in the same <video>, so
// nothing downstream - store sync, overlays, dual-player binding - can tell.
let source: FragmentedMp4Source | null = null;
let attachGeneration = 0;

const attachSource = async (url: string) => {
  const video = videoRef.value;
  if (!video) return;
  const generation = ++attachGeneration;
  source?.destroy();
  source = null;

  if (!url) {
    video.removeAttribute('src');
    video.load();
    return;
  }

  const opened = await openFragmentedMp4(video, url, {
    refreshUrl: props.refreshUrl,
    onError,
  });
  // The URL moved on while we were probing.
  if (generation !== attachGeneration) {
    opened?.destroy();
    return;
  }
  if (opened) {
    source = opened;
    video.dataset.source = 'mse';
    opened.attach();
  } else {
    video.dataset.source = 'native';
    video.src = url;
  }
};

onMounted(() => {
  void attachSource(props.videoUrl);
});

onBeforeUnmount(() => {
  source?.destroy();
  source = null;
});

// Expose ref for parent components if needed
defineExpose({
  videoRef,
  containerRef,
  seekFrame
});

// Watchers
watch(() => props.videoUrl, (url) => {
  // A refreshed presigned URL names the same object: hand the running
  // source the new credentials rather than reloading from the top.
  if (source?.alive && sameObject(source.url, url)) {
    source.setUrl(url);
    return;
  }
  isLoading.value = true;
  error.value = null;
  void attachSource(url);
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

/*
 * Positioning frame for the controls. Centred like the video and clamped the
 * same way, so `.controls-frame-box` resolves to the rendered picture's rect
 * and the bar sits on the picture rather than in the letterbox band. Inert
 * itself; only the bar inside it takes pointer events, and only when shown.
 */
.controls-frame {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.controls-frame-box {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
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

/* Sits over the video, so it stays light-on-dark in both themes - but it is
   an outline eyebrow now, not a blue fill. */
.retry-button {
  margin-top: 12px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: transparent;
  color: white;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  transition: border-color 0.15s ease;
}

.retry-button:hover {
  border-color: rgba(255, 255, 255, 0.6);
}

.error-message,
.loading-text {
  font-size: 12px;
}
</style>
