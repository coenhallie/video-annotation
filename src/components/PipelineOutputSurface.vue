<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useRenderer2D, type GoalOverlay } from '@/lib/vis/useRenderer2D';
import {
  goalStateAt,
  isGoalFrame,
  planGoal,
  GOAL_SEQUENCE_MS,
  type GoalPlan,
  type GoalState,
} from '@/lib/vis/goalSequence';
import { FRAME_W, FRAME_H } from '@/lib/vis/constants';
import { fitFrameBox, type FrameBox } from '@/lib/vis/viewTransform';
import type { PipelineReplay } from '@/composables/usePipelineReplay';
import { replayDrawingFrame } from '@/utils/timelineBinding';

const props = defineProps<{ replay: PipelineReplay }>();

const overlayFrame = computed(() =>
  replayDrawingFrame({
    currentTime: props.replay.currentTime.value,
    fps: props.replay.fps.value,
  })
);
const emit = defineEmits<{ (e: 'context-menu', ev: MouseEvent): void }>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: ReturnType<typeof useRenderer2D> | null = null;

// Zoom and pan, kept from FootballPitchView: inspecting a cluster of players is
// the common QA gesture and the pitch is small at editor sizes.
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.15;

let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOriginX = 0;
let panOriginY = 0;

const stageRef = ref<HTMLElement | null>(null);
const overlayRef = ref<HTMLElement | null>(null);

/**
 * Zoom and pan are handed to the renderer instead of being applied as a CSS
 * transform on the canvas element.
 *
 * The element has to stay unscaled and unmoved so the drawing layer above it
 * shares its coordinate system: Fabric derives pointer positions from its own
 * element box, so a CSS scale it cannot see would offset every stroke by the
 * zoom factor.
 */
function pushView(): void {
  renderer?.setView({
    zoom: zoom.value,
    panX: panX.value,
    panY: panY.value,
    renderedWidth:
      frameBox.value?.width ?? canvasRef.value?.getBoundingClientRect().width ?? 0,
  });
  // The replay can be paused, so a view change has to repaint by itself rather
  // than waiting for the next frame.
  paint();
}

/**
 * Draw the current frame, with the goal sequence over it while one is playing.
 * Every repaint goes through here, so none of them can draw a frame mid-sequence
 * without it.
 */
function paint(): void {
  const frame = props.replay.frame.value;
  if (frame) renderer?.renderFrame(frame, goalOverlay());
}

watch([zoom, panX, panY], pushView, { flush: 'post' });

// ── Sizing ──────────────────────────────────────────────────────────────────
//
// The canvas, the drawing overlay and the HUD are all placed from one computed
// box, and the canvas bitmap is sized to that box in device pixels. A 1280x720
// bitmap stretched to the display was soft on any 2x screen; see fitFrameBox
// for why CSS clamps could not do either job.

const viewportRef = ref<HTMLElement | null>(null);
const frameBox = ref<FrameBox | null>(null);

const boxStyle = computed(() => {
  const box = frameBox.value;
  if (!box) return undefined;
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
});

function measure(): void {
  const el = viewportRef.value;
  if (!el) return;
  const next = fitFrameBox(el.getBoundingClientRect(), window.devicePixelRatio || 1);
  // A hidden surface measures as nothing. Keep the last box rather than
  // collapse the bitmap to zero, which has nothing to draw into.
  if (next.pixelWidth < 1 || next.pixelHeight < 1) return;
  frameBox.value = next;
  applyBitmapSize();
}

function applyBitmapSize(): void {
  const canvas = canvasRef.value;
  const box = frameBox.value;
  if (!canvas || !box) return;
  // Assigning a canvas's size clears it even when the value is unchanged.
  if (canvas.width !== box.pixelWidth || canvas.height !== box.pixelHeight) {
    canvas.width = box.pixelWidth;
    canvas.height = box.pixelHeight;
  }
  // Repaints too, which a cleared canvas needs while the replay is paused.
  pushView();
}

watch(
  viewportRef,
  (el, _old, onCleanup) => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    measure();
    onCleanup(() => observer.disconnect());
  },
  { flush: 'post' }
);

// Moving the window to a display with a different pixel ratio changes the
// bitmap the box needs without changing its CSS size, so a resize observer
// never hears of it. A resolution media query does, once per ratio.
let dprQuery: MediaQueryList | null = null;

function watchPixelRatio(): void {
  dprQuery?.removeEventListener('change', onPixelRatioChange);
  dprQuery = null;
  if (typeof window.matchMedia !== 'function') return;
  dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  dprQuery.addEventListener('change', onPixelRatioChange);
}

function onPixelRatioChange(): void {
  measure();
  watchPixelRatio();
}

function onWheel(e: WheelEvent) {
  const stage = stageRef.value;
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const mx = e.clientX - rect.left - rect.width / 2;
  const my = e.clientY - rect.top - rect.height / 2;

  const oldZoom = zoom.value;
  const next = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, oldZoom + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP))
  );
  if (next === oldZoom) return;

  const scale = next / oldZoom;
  panX.value = mx - scale * (mx - panX.value);
  panY.value = my - scale * (my - panY.value);
  zoom.value = next;

  if (next <= MIN_ZOOM) {
    panX.value = 0;
    panY.value = 0;
    // panOriginX/Y were captured at pointerdown and are not otherwise updated
    // mid-pan. Without re-capturing them here, the next pointermove computes
    // from the stale origin against the pan we just reset to 0, and the image
    // jumps.
    if (isPanning) {
      panOriginX = 0;
      panOriginY = 0;
      panStartX = e.clientX;
      panStartY = e.clientY;
    }
  }
}

function onPointerDown(e: PointerEvent) {
  if (zoom.value <= MIN_ZOOM) return;
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panOriginX = panX.value;
  panOriginY = panY.value;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!isPanning) return;
  panX.value = panOriginX + (e.clientX - panStartX);
  panY.value = panOriginY + (e.clientY - panStartY);
}

function onPointerUp() {
  isPanning = false;
}

function resetZoom() {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
}

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

// ── Goal sequence ───────────────────────────────────────────────────────────
//
// When playback runs into a frame the pipeline labels GOAL, a ball is shot into
// the net and settles there, in place of the tracked ball. See goalSequence.ts.
//
// It only ever plays during playback, and anything that means someone wants
// the real frame - pausing, seeking, stepping, pressing on the drawing layer -
// stops it at once. A frame looked at or annotated always shows the data.

/** Clock steps larger than this are a seek, not playback. */
const MAX_PLAYBACK_STEP_S = 0.5;

let goal: { plan: GoalPlan; startedMs: number | null; elapsedMs: number } | null = null;
let goalRaf: number | null = null;
// The label usually stays on for many frames: only its first one is a goal.
let goalLabelSeen = false;
let lastStepWasPlayback = false;

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function goalState(): GoalState | null {
  if (!goal) return null;
  // With reduced motion the ball is simply in the net.
  return goalStateAt(goal.plan, prefersReducedMotion() ? GOAL_SEQUENCE_MS : goal.elapsedMs);
}

function goalOverlay(): GoalOverlay | undefined {
  const state = goalState();
  if (!goal || !state) return undefined;
  return {
    ball: state.ball,
    trail: state.trail,
    net: { side: goal.plan.side, y: goal.plan.impact.y, metres: state.netBulge },
  };
}

function goalStep(ms: number): void {
  goalRaf = null;
  if (!goal) return;
  if (goal.startedMs === null) goal.startedMs = ms;
  goal.elapsedMs = ms - goal.startedMs;
  if (goal.elapsedMs >= GOAL_SEQUENCE_MS) {
    stopGoal();
    return;
  }
  paint();
  goalRaf = window.requestAnimationFrame(goalStep);
}

function startGoal(frame: NonNullable<PipelineReplay['frame']['value']>): void {
  // No ball, no telling which goal it went in: better no sequence than one at
  // the wrong end.
  const plan = planGoal(frame);
  if (!plan) return;
  goal = { plan, startedMs: null, elapsedMs: 0 };
  goalRaf = window.requestAnimationFrame(goalStep);
}

function stopGoal(): void {
  if (!goal && goalRaf === null) return;
  if (goalRaf !== null) window.cancelAnimationFrame(goalRaf);
  goalRaf = null;
  goal = null;
  paint();
}

// Synchronous, so it has seen the clock move before the frame watcher sees the
// record that movement brought in.
watch(
  () => props.replay.currentTime.value,
  (now, before) => {
    lastStepWasPlayback =
      props.replay.isPlaying.value && now > before && now - before <= MAX_PLAYBACK_STEP_S;
    if (!lastStepWasPlayback) stopGoal();
  },
  { flush: 'sync' }
);

watch(
  () => props.replay.isPlaying.value,
  (playing) => {
    if (!playing) stopGoal();
  }
);

function ensureRenderer() {
  const canvas = canvasRef.value;
  if (!canvas || renderer) return;
  // jsdom has no 2D context, so this is null under test. The component still
  // mounts and its states still render; only drawing is skipped.
  if (!canvas.getContext('2d')) return;
  renderer = useRenderer2D(canvas);
  if (frameBox.value) {
    applyBitmapSize();
  } else {
    // Not laid out yet. Frame size is a sane bitmap until the box arrives.
    canvas.width = FRAME_W;
    canvas.height = FRAME_H;
    pushView();
  }
}

// flush: 'post' is load-bearing. Vue's default pre-flush timing runs the
// callback BEFORE the component's DOM patch, and load() sets `frame` and then
// `state` synchronously, so with the default both callbacks fire while the
// canvas is still behind v-else and canvasRef is null. The renderer would
// never attach and the pitch would stay blank until an unrelated later frame
// arrived.
watch(
  () => props.replay.frame.value,
  (frame) => {
    if (!frame) return;
    ensureRenderer();
    const labelled = isGoalFrame(frame);
    if (labelled && !goalLabelSeen && !goal && lastStepWasPlayback) startGoal(frame);
    goalLabelSeen = labelled;
    paint();
  },
  { flush: 'post' }
);

watch(
  () => props.replay.state.value,
  (state) => {
    if (state !== 'ready') return;
    ensureRenderer();
    paint();
  },
  { flush: 'post' }
);

onMounted(() => {
  watchPixelRatio();
  void props.replay.load();
});

onUnmounted(() => {
  stopGoal();
  dprQuery?.removeEventListener('change', onPixelRatioChange);
  dprQuery = null;
  props.replay.dispose();
  renderer = null;
});
</script>

<template>
  <div
    ref="stageRef"
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
      <div
        ref="viewportRef"
        data-testid="pipeline-viewport"
        class="absolute inset-0 overflow-hidden"
        :class="{ 'cursor-grab': zoom > 1 }"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @dblclick="resetZoom"
      >
        <!--
          No width/height attributes: the bitmap is sized in script, to the
          box in device pixels, and the box sets the displayed size.
        -->
        <canvas
          ref="canvasRef"
          data-testid="pipeline-canvas"
          class="absolute"
          :style="boxStyle"
        />

        <!--
          Overlay slot, placed in the same computed box as the canvas. A
          drawing layer mounted here shares the canvas's coordinate system
          exactly, which is what the zoom/pan move into the renderer made
          possible.

          pointer-events-none by default so panning and zooming still work
          through it; the drawing layer turns them back on for itself only while
          drawing mode is active.
        -->
        <div class="pointer-events-none absolute inset-0">
          <div
            ref="overlayRef"
            data-testid="pipeline-overlay"
            class="absolute"
            :style="boxStyle"
            @pointerdown.capture="stopGoal"
          >
            <!--
              Not replay.currentFrame: that is the pipeline's own frame_count,
              which does not start at zero, while drawings are stamped with the
              zero-based frame for the replay's time. See replayDrawingFrame.
            -->
            <slot
              name="overlay"
              :current-frame="overlayFrame"
            />
          </div>
        </div>
      </div>

      <!--
        The HUD is anchored to the pitch, not to the stage. The canvas is
        letterboxed inside the stage, so stage-relative badges float in the
        black band beside it. This box is the canvas's own computed box, so it
        is exactly the canvas's rendered rect at any editor size.
      -->
      <div class="pointer-events-none absolute inset-0">
        <div
          class="absolute"
          :style="boxStyle"
          data-testid="pipeline-hud"
        >
          <div
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

          <div
            v-if="zoom > 1"
            class="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white"
          >
            {{ zoom.toFixed(1) }}x
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
