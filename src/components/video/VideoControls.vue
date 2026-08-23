<template>
  <div
    class="video-controls"
    :class="{ 'is-paused': !isPlaying }"
  >
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
          class="control-button primary"
          :aria-label="isPlaying ? 'Pause' : 'Play'"
          :title="isPlaying ? 'Pause' : 'Play'"
          @click="$emit('toggle-play')"
        >
          <svg
            v-if="isPlaying"
            class="control-icon"
            viewBox="0 0 24 24"
          >
            <rect
              x="6"
              y="4"
              width="4"
              height="16"
              rx="1"
            />
            <rect
              x="14"
              y="4"
              width="4"
              height="16"
              rx="1"
            />
          </svg>
          <svg
            v-else
            class="control-icon nudge-right"
            viewBox="0 0 24 24"
          >
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

        <span class="controls-divider" />

        <!-- Volume controls -->
        <div class="volume-controls">
          <button
            class="control-button"
            :aria-label="isMuted ? 'Unmute' : 'Mute'"
            :title="isMuted ? 'Unmute (M)' : 'Mute (M)'"
            @click="$emit('toggle-mute')"
          >
            <svg
              v-if="isMuted"
              class="control-icon"
              viewBox="0 0 24 24"
            >
              <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
              <line
                x1="23"
                y1="9"
                x2="17"
                y2="15"
              />
              <line
                x1="17"
                y1="9"
                x2="23"
                y2="15"
              />
            </svg>
            <svg
              v-else-if="volume < 0.5"
              class="control-icon"
              viewBox="0 0 24 24"
            >
              <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <svg
              v-else
              class="control-icon"
              viewBox="0 0 24 24"
            >
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
          >
        </div>

        <span class="controls-divider" />

        <!-- Speed controls -->
        <div class="speed-controls">
          <select
            :value="playbackRate"
            class="speed-select"
            :aria-label="'Playback speed: ' + playbackRate + 'x'"
            @change="(e) => $emit('speed-change', parseFloat((e.target as HTMLSelectElement).value))"
          >
            <option value="0.1">
              0.1x
            </option>
            <option value="0.25">
              0.25x
            </option>
            <option value="0.5">
              0.5x
            </option>
            <option value="1">
              1x
            </option>
            <option value="1.25">
              1.25x
            </option>
            <option value="1.5">
              1.5x
            </option>
            <option value="2">
              2x
            </option>
          </select>
        </div>
      </div>

      <!-- Right side slot for extra controls like Pose/Calibration toggle -->
      <div class="controls-right">
        <slot name="right-controls" />
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
/*
 * Drawn to match the pipeline replay's transport (PipelineOutputSurface.vue):
 * one floating pill on the media rather than a full-width gradient bar, ghost
 * icon buttons around a filled play button, and the same reveal rule - always
 * visible while paused, on hover otherwise.
 */
.video-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  opacity: 0;
  /* The bar spans the picture's full width but only the pill and the slot are
     meant to be clickable, so the container never takes pointer events itself
     and hands its children an inherited switch instead. Left interactive, it
     covers a strip across the bottom of the picture and eats clicks meant for
     the video - and while hidden it did exactly that. */
  pointer-events: none;
  --controls-interactive: none;
  transform: translateY(4px);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
  z-index: 20;
}

/*
 * Reveal. Written without :global() on purpose: `:global(.video-wrapper:hover)
 * .video-controls` compiles to plain `.video-wrapper:hover` - the descendant is
 * dropped - so the old rule raised the WRAPPER's opacity and never the bar's,
 * leaving the controls reachable only by hovering the strip they occupy. A
 * scoped selector already leaves ancestor classes unscoped, so these match.
 *
 * Both wrappers are listed because the dual player mounts this component
 * outside .video-wrapper; `.is-paused` covers the paused case for both, since
 * only the single player's wrapper carries a .paused class.
 */
.video-wrapper:hover .video-controls,
.dual-video-wrapper:hover .video-controls,
.video-controls.is-paused,
.video-controls:has(:focus-visible) {
  opacity: 1;
  --controls-interactive: auto;
  transform: translateY(0);
}

.controls-content {
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
}

.controls-left {
  pointer-events: var(--controls-interactive);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.6);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.3);
  outline: 1px solid rgba(255, 255, 255, 0.1);
  outline-offset: -1px;
  backdrop-filter: blur(4px);
}

.control-button {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  transition: background-color 0.2s, color 0.2s;
}

.control-button:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.control-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
}

/* The one filled element: playback is the primary action on this bar. */
.control-button.primary {
  width: 32px;
  height: 32px;
  background: #fff;
  color: #000;
}

.control-button.primary:hover {
  background: rgba(255, 255, 255, 0.9);
  color: #000;
}

.control-button.primary:focus-visible {
  box-shadow:
    0 0 0 1px #000,
    0 0 0 3px rgba(255, 255, 255, 0.6);
}

.control-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2px;
  fill: currentColor;
}

/* The play triangle reads off-centre in a circle without this. */
.control-icon.nudge-right {
  margin-left: 2px;
}

.controls-divider {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: rgba(255, 255, 255, 0.15);
  flex: none;
}

/* Volume controls specific */
.volume-controls {
  display: flex;
  align-items: center;
  position: relative;
}

/* Show slider on hover */
.volume-slider {
  width: 0;
  opacity: 0;
  transition: all 0.2s ease;
  overflow: hidden;
  margin: 0;
  /* The element's own box is the drag target, so it stays finger-sized and the
     hairline look comes from the track pseudo-elements below. */
  height: 16px;
  accent-color: #fff;
  cursor: pointer;
}

.volume-slider::-webkit-slider-runnable-track {
  height: 2px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.3);
}

.volume-slider::-moz-range-track {
  height: 2px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.3);
}

.volume-controls:hover .volume-slider,
.volume-slider:focus-visible {
  width: 64px;
  opacity: 1;
  margin: 0 6px 0 2px;
}

/* Speed controls specific */
.speed-select {
  appearance: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  border: none;
  border-radius: 9999px;
  padding: 4px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  outline: none;
  /* Keeps the native option list dark instead of system-light. */
  color-scheme: dark;
  transition: background-color 0.2s, color 0.2s;
}

.speed-select:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.speed-select:focus-visible {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
}

.controls-right {
  pointer-events: var(--controls-interactive);
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
}

@media (prefers-reduced-motion: reduce) {
  .video-controls,
  .control-button,
  .volume-slider,
  .speed-select {
    transition: none;
  }
}
</style>
