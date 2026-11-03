<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import {
  createMatchTracker,
  type MatchTrackerInstance,
  type MatchTrackerOptions,
  type MomentAvailability,
  type ReplayMoment,
  type TeamId,
  type TrackerBox,
} from '@coenhallie/match-tracker';
import type { PipelineReplay } from '@/composables/usePipelineReplay';
import { replayDrawingFrame } from '@/utils/timelineBinding';

/**
 * The 2D replay: the match tracker widget (@coenhallie/match-tracker) in
 * replay mode, fed the replay's clock and records, so this app and the
 * match share site draw the same, versioned picture.
 *
 * The widget owns the pitch and everything on it: the moments, the
 * attacking/defending row above it, the layers menu, zoom and pan, sizing and
 * the pixel ratio, and its fonts and icons. This component keeps what the
 * widget leaves to its host: loading, the empty and error states, the
 * transport and the frame badge, the drawing layer over the pitch, and the
 * context menu.
 */

const props = defineProps<{
  replay: PipelineReplay;
  /**
   * The teams the match title names, first-named first (pipelineTeamNames),
   * or null when it names none. Team 0 is taken to be the first-named.
   */
  teamNames?: [string, string] | null;
}>();

const emit = defineEmits<{ (e: 'context-menu', ev: MouseEvent): void }>();

/** Where the layers menu keeps its choice: the key the replay always used, so nobody loses theirs. */
const LAYERS_STORAGE_KEY = 'perspecto.replayLayers';

const NOTHING_AVAILABLE: MomentAvailability = {
  goal: false,
  attack: { 0: false, 1: false },
  freeKick: false,
  throwIn: false,
};

/**
 * The teams as the tracker takes them. Without a match in the title, the
 * tracker names them after the colours they are drawn in.
 */
function teamsFor(
  names: [string, string] | null | undefined
): NonNullable<MatchTrackerOptions['teams']> {
  return {
    home: names ? { name: names[0] } : {},
    away: names ? { name: names[1] } : {},
  };
}

// ── The tracker ─────────────────────────────────────────────────────────────

const hostRef = ref<HTMLElement | null>(null);
const tracker = shallowRef<MatchTrackerInstance | null>(null);
/** The pitch's box in the stage, which the HUD is placed on. */
const box = shallowRef<TrackerBox | null>(null);
/** Which moments can be played by hand on the frame on screen. */
const momentAvailability = shallowRef<MomentAvailability>(NOTHING_AVAILABLE);

// The host is only in the stage while the replay is ready, so the tracker is
// made when it appears and destroyed when it goes: on unmount, on an error,
// and on a reload.
watch(
  hostRef,
  (host, _old, onCleanup) => {
    if (!host) return;
    const made = createMatchTracker(host, {
      mode: 'replay',
      locale: 'en',
      layersStorageKey: LAYERS_STORAGE_KEY,
      teams: teamsFor(props.teamNames),
    });
    made.on('box', (next) => {
      box.value = next;
    });
    made.on('availability', (next) => {
      momentAvailability.value = next;
    });
    // The box measured at mount is not sent as an event.
    box.value = made.box;
    momentAvailability.value = made.availability();
    tracker.value = made;
    onCleanup(() => {
      tracker.value = null;
      box.value = null;
      momentAvailability.value = NOTHING_AVAILABLE;
      // Takes the overlay out of the host, with the drawing layer in it.
      made.destroy();
    });
  },
  { flush: 'post' }
);

// Compared name by name: the editor hands over a new array on every render.
watch(
  [() => props.teamNames?.[0], () => props.teamNames?.[1]],
  () => tracker.value?.setOptions({ teams: teamsFor(props.teamNames) })
);

// The replay at its clock, on every tick, pause and seek, and to a tracker as
// soon as it is made. Not 'sync': the replay's clock runs in an animation
// frame, and presenting in the microtask after it, rather than inside it,
// lets the tracker draw this tick in the same display frame as the overlay.
watch(
  [
    tracker,
    () => props.replay.currentTime.value,
    () => props.replay.isPlaying.value,
    () => props.replay.record.value,
    () => props.replay.lookback.value,
  ],
  ([target, time, playing, record, lookback]) => {
    target?.present({ time, playing, record, lookback });
  },
  { flush: 'post' }
);

/** Play `moment` now; for an attack, `team`'s. False when it cannot be played on this frame. */
function triggerMoment(moment: ReplayMoment, team: TeamId = 0): boolean {
  return tracker.value?.trigger(moment, team) ?? false;
}

defineExpose({ triggerMoment, momentAvailability });

// ── The overlay and the HUD ─────────────────────────────────────────────────

/**
 * Not replay.currentFrame: that is the pipeline's own frame_count, which does
 * not start at zero, while drawings are stamped with the zero-based frame for
 * the replay's time. See replayDrawingFrame.
 */
const overlayFrame = computed(() =>
  replayDrawingFrame({
    currentTime: props.replay.currentTime.value,
    fps: props.replay.fps.value,
  })
);

/**
 * The pitch's box, for the HUD. The tracker's host fills the stage, so its
 * box from the host's corner is its box in the stage.
 */
const boxStyle = computed(() => {
  const b = box.value;
  if (!b) return undefined;
  return {
    left: `${b.left}px`,
    top: `${b.top}px`,
    width: `${b.width}px`,
    height: `${b.height}px`,
  };
});

// ── Transport ───────────────────────────────────────────────────────────────
//
// The replay has no video element, so it has no native controls either. These
// mirror the ones SingleVideoPlayer overlays on the video (VideoControls.vue):
// same gestures, same reveal rule, drawn in the pitch HUD's own vocabulary
// rather than reusing that component, whose props and reveal CSS are all about
// a video (volume, mute, speed, `.video-wrapper:hover`).

const hovering = ref(false);

/**
 * Visible while paused, so arriving on the tab shows the controls without
 * having to discover them, and while the pointer is over the stage. Hidden
 * only during playback with the pointer elsewhere, which is exactly when the
 * pitch should be unobstructed.
 *
 * Keyboard focus reveals the bar too, but through a `:has(:focus-visible)`
 * rule rather than this flag. A focusin listener cannot tell the two apart,
 * and clicking play leaves DOM focus on the button, which would pin the bar
 * open for the rest of the session.
 */
const controlsVisible = computed(
  () => !props.replay.isPlaying.value || hovering.value
);

function togglePlay() {
  if (props.replay.isPlaying.value) props.replay.pause();
  else props.replay.play();
}

/**
 * Step one frame.
 *
 * Snapped to the frame grid rather than added to the raw clock: seeking
 * resolves to the last record at or before the target, so a bare
 * `currentTime + 1 / fps` can land a float's width short of the next record
 * and show the same frame twice. The millisecond of slack is far inside one
 * frame at any plausible rate, so it cannot skip past the intended record.
 *
 * Stepping stops playback first. Nudging the clock under a running rAF loop
 * technically works, but the frame you stepped to is gone again immediately.
 */
function step(frames: number) {
  const { replay } = props;
  replay.pause();
  const fps = replay.fps.value;
  const grid = Math.round(replay.currentTime.value * fps) + frames;
  void replay.seek(grid / fps + 0.001);
}

onMounted(() => {
  void props.replay.load();
});

onUnmounted(() => {
  props.replay.dispose();
});
</script>

<template>
  <div
    data-testid="pipeline-stage"
    class="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
    @contextmenu.prevent="emit('context-menu', $event)"
    @pointerenter="hovering = true"
    @pointerleave="hovering = false"
  >
    <div
      v-if="replay.state.value === 'loading' || replay.state.value === 'idle'"
      data-testid="pipeline-loading"
      class="flex flex-col items-center text-center"
    >
      <div
        class="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-gray-300"
      />
      <p class="text-[12px] text-gray-400">
        Loading pipeline data
      </p>
    </div>

    <div
      v-else-if="replay.state.value === 'empty'"
      data-testid="pipeline-empty"
      class="flex flex-col items-center text-center"
    >
      <svg
        class="mb-3 h-8 w-8 text-gray-600"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
        />
      </svg>
      <p class="text-[12px] text-gray-400">
        No pipeline data for this project
      </p>
      <p class="mt-1 text-[11px] text-gray-600">
        Annotations you add here stay separate from the video's.
      </p>
    </div>

    <div
      v-else-if="replay.state.value === 'error'"
      data-testid="pipeline-error"
      class="flex max-w-sm flex-col items-center text-center"
    >
      <p class="text-[12px] text-gray-300">
        Could not load pipeline data
      </p>
      <p class="mt-1 text-[11px] text-gray-500">
        {{ replay.error.value }}
      </p>
      <button
        type="button"
        class="mt-3 rounded border border-white/15 px-3 py-1 text-[11px] text-gray-300 hover:bg-white/5"
        @click="replay.load()"
      >
        Try again
      </button>
    </div>

    <template v-else>
      <!-- The tracker fills the stage and letterboxes the pitch in it. -->
      <div
        ref="hostRef"
        data-testid="pipeline-tracker"
        class="absolute inset-0"
      />

      <!--
        The drawing layer goes in the tracker's overlay, which lies exactly
        over the pitch and is in the page's DOM, so the app's CSS reaches it.
        Its pointer events are off unless the layer turns them on for itself,
        so zoom and pan work through it, and a press on it stops every moment.
      -->
      <Teleport
        v-if="tracker"
        :to="tracker.overlay"
      >
        <slot
          name="overlay"
          :current-frame="overlayFrame"
        />
      </Teleport>

      <!--
        The HUD, on the pitch's box rather than the stage, which has black
        bands either side of the pitch. Over the tracker but outside its
        overlay: a press in the overlay stops every moment, and pressing play
        must not stop a moment played by hand while paused.
      -->
      <div class="pointer-events-none absolute inset-0">
        <div
          class="absolute"
          :style="boxStyle"
          data-testid="pipeline-hud"
        >
          <div
            data-testid="pipeline-frame"
            class="absolute bottom-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-2.5 py-1 font-mono text-[11px] text-white"
          >
            F{{ replay.currentFrame.value }}
            <!--
              The replay holds its clock while data is on its way, so the
              playhead stops. This says why, beside the frame it is holding.
            -->
            <span
              v-if="replay.buffering.value"
              data-testid="pipeline-buffering"
              role="status"
              aria-label="Loading pipeline data"
              title="Loading pipeline data"
              class="h-2.5 w-2.5 animate-spin rounded-full border border-white/25 border-t-white motion-reduce:animate-none"
            />
          </div>

          <div
            class="absolute inset-x-0 bottom-2 flex justify-center"
            data-testid="pipeline-controls"
          >
            <div
              class="flex items-center gap-1 rounded-full bg-black/60 p-1 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-sm transition duration-200 has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:translate-y-0 has-[:focus-visible]:opacity-100 motion-reduce:transition-none"
              :class="
                controlsVisible
                  ? 'pointer-events-auto translate-y-0 opacity-100'
                  : 'translate-y-1 opacity-0'
              "
            >
              <button
                type="button"
                data-testid="pipeline-step-back"
                class="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60 motion-reduce:transition-none"
                aria-label="Previous frame"
                title="Previous frame"
                @click="step(-1)"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                  />
                </svg>
              </button>

              <button
                type="button"
                data-testid="pipeline-play-pause"
                class="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-1 focus-visible:ring-offset-black motion-reduce:transition-none"
                :aria-label="replay.isPlaying.value ? 'Pause' : 'Play'"
                :title="replay.isPlaying.value ? 'Pause' : 'Play'"
                @click="togglePlay"
              >
                <svg
                  v-if="replay.isPlaying.value"
                  class="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
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
                  class="ml-0.5 h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </button>

              <button
                type="button"
                data-testid="pipeline-step-forward"
                class="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60 motion-reduce:transition-none"
                aria-label="Next frame"
                title="Next frame"
                @click="step(1)"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
