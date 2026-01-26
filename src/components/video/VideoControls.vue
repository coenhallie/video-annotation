<template>
  <div class="video-controls">
    <div class="controls-content">
      <div class="controls-left">
        <!-- Previous Frame button -->
        <button
          class="control-button"
          aria-label="Previous Frame"
          title="Previous Frame (Left Arrow)"
          @click="$emit('prev-frame')"
        >
          <svg
            class="control-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </button>

        <!-- Play/Pause button -->
        <button
          class="control-button"
          :aria-label="isPlaying ? 'Pause' : 'Play'"
          @click="$emit('toggle-play')"
        >
          <svg v-if="isPlaying" class="control-icon" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
          <svg v-else class="control-icon" viewBox="0 0 24 24">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </button>

        <!-- Next Frame button -->
        <button
          class="control-button"
          aria-label="Next Frame"
          title="Next Frame (Right Arrow)"
          @click="$emit('next-frame')"
        >
          <svg
            class="control-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>
        </button>

        <!-- Volume controls -->
        <div class="volume-controls">
          <button
            class="control-button"
            :aria-label="isMuted ? 'Unmute' : 'Mute'"
            @click="$emit('toggle-mute')"
          >
            <svg v-if="isMuted" class="control-icon" viewBox="0 0 24 24">
              <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
            <svg
              v-else-if="volume < 0.5"
              class="control-icon"
              viewBox="0 0 24 24"
            >
              <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <svg v-else class="control-icon" viewBox="0 0 24 24">
              <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            :value="isMuted ? 0 : volume"
            class="volume-slider"
            :aria-label="'Volume: ' + Math.round(volume * 100) + '%'"
            @input="(e) => $emit('volume-change', parseFloat((e.target as HTMLInputElement).value))"
          />
        </div>

        <!-- Speed controls -->
        <div class="speed-controls">
          <select
            :value="playbackRate"
            class="speed-select"
            :aria-label="'Playback speed: ' + playbackRate + 'x'"
            @change="(e) => $emit('speed-change', parseFloat((e.target as HTMLSelectElement).value))"
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
      
      <!-- Right side slot for extra controls like Pose/Calibration toggle -->
      <div class="controls-right">
        <slot name="right-controls"></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  playbackRate: number;
}>();

defineEmits<{
  (e: 'toggle-play'): void;
  (e: 'prev-frame'): void;
  (e: 'next-frame'): void;
  (e: 'toggle-mute'): void;
  (e: 'volume-change', value: number): void;
  (e: 'speed-change', value: number): void;
}>();
</script>

<style scoped>
.video-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0));
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 20;
}

/* Show controls: when hovering video wrapper OR when explicitly visible (e.g. paused) */
:global(.video-wrapper:hover) .video-controls,
.video-controls:hover,
:global(.video-wrapper.paused) .video-controls {
  opacity: 1;
}

.controls-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.control-button {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.control-button:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.control-icon {
  width: 24px;
  height: 24px;
  stroke-width: 2px;
  fill: currentColor;
}

/* Volume controls specific */
.volume-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

/* Show slider on hover */
.volume-slider {
  width: 0;
  opacity: 0;
  transition: all 0.3s ease;
  overflow: hidden;
  margin: 0;
}

.volume-controls:hover .volume-slider {
  width: 80px;
  opacity: 1;
  margin-left: 5px;
}

/* Speed controls specific */
.speed-select {
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 12px;
  outline: none;
}
</style>
