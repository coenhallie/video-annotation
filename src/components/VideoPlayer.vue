<script setup>
import {
  ref,
  onMounted,
  watch,
  computed,
  defineProps,
  defineEmits,
  nextTick,
} from 'vue';
import { useVideoPlayer } from '../composables/useVideoPlayer.js';

// Props
const props = defineProps({
  videoUrl: {
    type: String,
    required: true,
  },
  videoId: {
    type: String,
    default: 'default-video',
  },
  autoplay: {
    type: Boolean,
    default: false,
  },
  controls: {
    type: Boolean,
    default: true,
  },
  poster: {
    type: String,
    default: '',
  },
});

// Emits
const emit = defineEmits([
  'time-update',
  'frame-update',
  'play',
  'pause',
  'duration-change',
  'fps-detected',
  'error',
  'loaded',
  'video-click',
]);

// Video player composable
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
  increaseSpeed,
  decreaseSpeed,
  resetSpeed,
  formatTime,
  formatFrame,
  formatFrameWithFPS,
  timeToFrame,
  frameToTime,
  detectFPS,
  updateFrameFromTime,
} = useVideoPlayer();

// Template refs
const videoElement = ref(null);
const playerContainer = ref(null);

// Remove redundant progress bar - Timeline handles scrubbing
const isExternalSeeking = ref(false);

onMounted(() => {
  // Component mounted
});

// Watch for the video element to become available
watch(
  videoElement,
  (video) => {
    if (video) {
      playerRef.value = video;

      // Add event listeners for native video events
      video.addEventListener('timeupdate', () => {
        currentTime.value = video.currentTime;
        updateFrameFromTime();
        emit('time-update', {
          currentTime: video.currentTime,
          duration: video.duration || duration.value,
        });
        emit('frame-update', {
          currentFrame: currentFrame.value,
          totalFrames: totalFrames.value,
          fps: fps.value,
        });
      });

      video.addEventListener('durationchange', () => {
        duration.value = video.duration;
        emit('duration-change', video.duration);
        detectFPS();
        emit('fps-detected', {
          fps: fps.value,
          totalFrames: totalFrames.value,
        });
      });

      video.addEventListener('play', () => {
        isPlaying.value = true;
        emit('play');
      });

      video.addEventListener('pause', () => {
        isPlaying.value = false;
        emit('pause');
      });

      video.addEventListener('loadstart', () => {
        isLoading.value = true;
      });

      video.addEventListener('loadeddata', () => {
        duration.value = video.duration;
        if (video.duration > 0) {
          emit('duration-change', video.duration);
        }
        isLoading.value = false;
        emit('loaded');
      });

      video.addEventListener('error', (e) => {
        const errorMsg = `Error loading video: ${
          video.error?.message || 'Unknown error'
        }`;
        error.value = errorMsg;
        emit('error', errorMsg);
      });

      video.addEventListener('volumechange', () => {
        volume.value = video.volume;
        isMuted.value = video.muted;
      });

      // Set initial volume
      video.volume = volume.value;
    }
  },
  { flush: 'post' }
);

// Watch for video URL changes - using post-flush to ensure DOM is updated
watch(
  () => props.videoUrl,
  (newUrl, oldUrl) => {
    if (newUrl) {
      if (videoElement.value) {
        // Update playerRef when video element becomes available
        playerRef.value = videoElement.value;
        videoElement.value.src = newUrl;
        videoElement.value.load();
      }
    }
  },
  { flush: 'post' } // Run after DOM updates - Vue recommended approach
);

// Progress bar handlers removed - Timeline component handles scrubbing

// Volume control
const handleVolumeChange = (event) => {
  const newVolume = parseFloat(event.target.value);
  setVolume(newVolume);
};

// Keyboard shortcuts
const handleKeyDown = (event) => {
  // Only handle if the player container is focused or if no input is focused
  if (document.activeElement?.tagName === 'INPUT') return;

  switch (event.code) {
    case 'Space':
      event.preventDefault();
      togglePlayPause();
      break;
    case 'ArrowLeft':
      event.preventDefault();
      seekTo(Math.max(0, currentTime.value - 10));
      break;
    case 'ArrowRight':
      event.preventDefault();
      seekTo(Math.min(duration.value, currentTime.value + 10));
      break;
    case 'ArrowUp':
      event.preventDefault();
      setVolume(Math.min(1, volume.value + 0.1));
      break;
    case 'ArrowDown':
      event.preventDefault();
      setVolume(Math.max(0, volume.value - 0.1));
      break;
    case 'KeyM':
      event.preventDefault();
      toggleMute();
      break;
    case 'Period': // > key for increase speed
      event.preventDefault();
      increaseSpeed();
      break;
    case 'Comma': // < key for decrease speed
      event.preventDefault();
      decreaseSpeed();
      break;
    case 'Digit1': // 1 key to reset to normal speed
      event.preventDefault();
      resetSpeed();
      break;
  }
};

// Progress percentage removed - Timeline handles progress display

// Handle video click
const handleVideoClick = () => {
  // Pause the video
  pause();
  // Emit video-click event
  emit('video-click');
};

// Expose methods to parent component
defineExpose({
  seekTo,
  play,
  pause,
  togglePlayPause,
  videoElement,
});
</script>

<template>
  <div
    ref="playerContainer"
    class="relative w-full bg-black rounded-lg overflow-hidden shadow-2xl outline-none"
    tabindex="0"
    @keydown="handleKeyDown"
  >
    <!-- Loading indicator -->
    <div
      v-if="isLoading"
      class="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white z-10"
    >
      <div
        class="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin mb-4"
      ></div>
      <p class="text-sm text-gray-300">Loading video...</p>
    </div>

    <!-- Error message -->
    <div
      v-if="error"
      class="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white z-10"
    >
      <svg
        class="w-12 h-12 mb-4 text-gray-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
      <p class="text-sm mb-4 text-gray-300">{{ error }}</p>
      <button @click="error = null" class="btn btn-secondary">Try Again</button>
    </div>

    <!-- Placeholder when no video URL -->
    <div
      v-if="!videoUrl"
      class="flex flex-col items-center justify-center h-96"
    >
      <svg
        class="w-16 h-16 mb-4 text-gray-600"
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
      <h3 class="text-lg font-medium mb-2 text-gray-300">No Video Loaded</h3>
      <p class="text-sm text-center max-w-md text-gray-500">
        Please load a video using the URL input field in the header above to
        start annotating.
      </p>
    </div>

    <!-- Video element -->
    <video
      v-else
      ref="videoElement"
      class="w-full h-auto block cursor-pointer"
      :src="videoUrl"
      :poster="poster"
      :autoplay="autoplay"
      preload="metadata"
      @click="handleVideoClick"
    >
      Your browser does not support the video tag.
    </video>

    <!-- Custom controls -->
    <div
      v-if="controls && videoUrl"
      class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent text-white p-4 transition-opacity duration-300"
      style="z-index: 30"
    >
      <!-- Progress bar removed - Timeline component handles scrubbing -->

      <!-- Control buttons and info -->
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <!-- Play/Pause button -->
          <button
            @click="togglePlayPause"
            class="p-2 rounded-md hover:bg-white/10 transition-colors duration-200 flex items-center justify-center"
            :aria-label="isPlaying ? 'Pause' : 'Play'"
          >
            <svg v-if="isPlaying" class="icon" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
            <svg v-else class="icon" viewBox="0 0 24 24">
              <polygon points="5,3 19,12 5,21"></polygon>
            </svg>
          </button>

          <!-- Volume controls -->
          <div class="flex items-center space-x-2 md:flex hidden">
            <button
              @click="toggleMute"
              class="p-2 rounded-md hover:bg-white/10 transition-colors duration-200"
              :aria-label="isMuted ? 'Unmute' : 'Mute'"
            >
              <svg v-if="isMuted" class="icon" viewBox="0 0 24 24">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
              </svg>
              <svg v-else-if="volume < 0.5" class="icon" viewBox="0 0 24 24">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              <svg v-else class="icon" viewBox="0 0 24 24">
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
              class="w-20 h-1 bg-white/20 rounded-full outline-none cursor-pointer slider"
              :aria-label="'Volume: ' + Math.round(volume * 100) + '%'"
            />
          </div>

          <!-- Speed controls -->
          <div class="flex items-center space-x-2 md:flex hidden">
            <button
              @click="decreaseSpeed"
              class="p-2 rounded-md hover:bg-white/10 transition-colors duration-200"
              :aria-label="'Decrease speed'"
              :disabled="playbackSpeed <= 0.25"
            >
              <svg
                class="icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <polygon points="11,19 2,12 11,5 11,19"></polygon>
                <polygon points="22,19 13,12 22,5 22,19"></polygon>
              </svg>
            </button>

            <div class="relative">
              <select
                :value="playbackSpeed"
                @change="setPlaybackSpeed(parseFloat($event.target.value))"
                class="bg-white/10 text-white text-sm px-2 py-1 rounded border-none outline-none cursor-pointer hover:bg-white/20 transition-colors duration-200"
                :aria-label="'Playback speed: ' + playbackSpeed + 'x'"
              >
                <option value="0.25" class="bg-gray-800 text-white">
                  0.25x
                </option>
                <option value="0.5" class="bg-gray-800 text-white">0.5x</option>
                <option value="1" class="bg-gray-800 text-white">1x</option>
                <option value="1.25" class="bg-gray-800 text-white">
                  1.25x
                </option>
                <option value="1.5" class="bg-gray-800 text-white">1.5x</option>
                <option value="2" class="bg-gray-800 text-white">2x</option>
              </select>
            </div>

            <button
              @click="increaseSpeed"
              class="p-2 rounded-md hover:bg-white/10 transition-colors duration-200"
              :aria-label="'Increase speed'"
              :disabled="playbackSpeed >= 2"
            >
              <svg
                class="icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <polygon points="13,19 22,12 13,5 13,19"></polygon>
                <polygon points="2,19 11,12 2,5 2,19"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom slider styles for volume control */
.slider::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
}

.slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}
</style>
