<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import {
  nearbyTrackIds,
  possessionTrackIds,
  useRenderer2D,
  type BallPulse,
  type GoalOverlay,
  type TrackId,
} from '@/lib/vis/useRenderer2D';
import {
  isThrowInFrame,
  isValidFrame,
  throwInBall,
  throwInCamera,
  throwInWeight,
  throwInHolds,
  throwInPulse,
  type ThrowInEase,
  THROW_IN_REPEAT_S,
  THROW_IN_STALE_S,
} from '@/lib/vis/throwInSequence';
import { CHEVRON_FLOW_PERIOD_S, type AttackGlow } from '@/lib/vis/attackGlow';
import {
  goalCamera,
  goalCameraWeight,
  goalStateAt,
  isGoalFrame,
  planGoal,
  GOAL_SEQUENCE_MS,
  type GoalPlan,
  type GoalState,
} from '@/lib/vis/goalSequence';
import { FRAME_W, FRAME_H, PERSON_COLORS, RING_FADE_S } from '@/lib/vis/constants';
import type { TeamId, TeamState } from '@/lib/vis/teamPhase';
import {
  cameraFromView,
  fitFrameBox,
  viewFromCamera,
  type Camera,
  type FrameBox,
} from '@/lib/vis/viewTransform';
import type { PipelineReplay } from '@/composables/usePipelineReplay';
import { replayDrawingFrame } from '@/utils/timelineBinding';

const props = defineProps<{
  replay: PipelineReplay;
  /**
   * The teams the match title names, first-named first (pipelineTeamNames),
   * or null when it names none. Team 0 is taken to be the first-named.
   */
  teamNames?: [string, string] | null;
}>();

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
    renderedWidth: renderedWidth(),
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
  if (frame) {
    renderer?.renderFrame(frame, {
      goal: goalOverlay(),
      glow: glowValue(),
      rings: { nearby: new Map(nearbyRings), possession: new Map(possessionRings) },
      ballPulse: throwInPulseLayer(),
    });
  }
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

/**
 * A row kept clear above the pitch for the team phase labels, so they never
 * sit over it: anything on the near touchline would be hidden under them.
 */
const LABEL_ROW_PX = 40;

function measure(): void {
  const el = viewportRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const fitted = fitFrameBox(
    {
      left: rect.left,
      top: rect.top + LABEL_ROW_PX,
      width: rect.width,
      height: Math.max(0, rect.height - LABEL_ROW_PX),
    },
    window.devicePixelRatio || 1
  );
  // fitFrameBox places the box within the area it was given, below the row.
  const next = { ...fitted, top: fitted.top + LABEL_ROW_PX };
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
  releaseSequenceCamera();
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
  releaseSequenceCamera();
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
  releaseSequenceCamera();
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
//
// While it plays, the view zooms in on the shot and the net and eases back out
// to the view the user had. Stopping it puts that view straight back; zooming
// or panning during it hands the view to the user for good.

/** Clock steps larger than this are a seek, not playback. */
const MAX_PLAYBACK_STEP_S = 0.5;

let goal: {
  plan: GoalPlan;
  startedMs: number | null;
  elapsedMs: number;
  // The user's view and the goal's framing. Null once the user takes the view
  // over, and with reduced motion, when the view does not move at all.
  camera: { from: Camera; to: Camera } | null;
} | null = null;
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

function renderedWidth(): number {
  return frameBox.value?.width ?? canvasRef.value?.getBoundingClientRect().width ?? 0;
}

function showCamera(cam: Camera): void {
  const view = viewFromCamera(cam, renderedWidth());
  zoom.value = view.zoom;
  panX.value = view.panX;
  panY.value = view.panY;
}

/** Between two cameras: zoom eased geometrically, so it feels even both ways. */
function blendCamera(from: Camera, to: Camera, k: number): Camera {
  return {
    zoom: from.zoom * (to.zoom / from.zoom) ** k,
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
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
  if (goal.camera) {
    const { from, to } = goal.camera;
    showCamera(blendCamera(from, to, goalCameraWeight(goal.elapsedMs)));
  }
  paint();
  goalRaf = window.requestAnimationFrame(goalStep);
}

function startGoal(frame: NonNullable<PipelineReplay['frame']['value']>): void {
  // No ball, no telling which goal it went in: better no sequence than one at
  // the wrong end.
  const plan = planGoal(frame);
  if (!plan) return;
  const from = cameraFromView({
    zoom: zoom.value,
    panX: panX.value,
    panY: panY.value,
    renderedWidth: renderedWidth(),
  });
  goal = {
    plan,
    startedMs: null,
    elapsedMs: 0,
    camera: prefersReducedMotion()
      ? null
      : { from, to: goalCamera(plan, frame.pitch_dimensions) },
  };
  goalRaf = window.requestAnimationFrame(goalStep);
}

/** The user has zoomed or panned: the view is theirs, and stays where they put it. */
function releaseSequenceCamera(): void {
  if (goal) goal.camera = null;
  if (throwIn) throwIn.camera = null;
}

function stopGoal(): void {
  if (!goal && goalRaf === null) return;
  if (goalRaf !== null) window.cancelAnimationFrame(goalRaf);
  goalRaf = null;
  const camera = goal?.camera;
  goal = null;
  if (camera) showCamera(camera.from);
  paint();
}

// Synchronous, so it has seen the clock move before the frame watcher sees the
// record that movement brought in.
watch(
  () => props.replay.currentTime.value,
  (now, before) => {
    lastStepWasPlayback =
      props.replay.isPlaying.value && now > before && now - before <= MAX_PLAYBACK_STEP_S;
    if (!lastStepWasPlayback) {
      stopGoal();
      stopThrowIn();
      // After a seek, back or forward, a label is not the last throw-in
      // labelled again, however close in time.
      throwInEndedAt = null;
    }
  },
  { flush: 'sync' }
);

watch(
  () => props.replay.isPlaying.value,
  (playing) => {
    if (playing) return;
    stopGoal();
    stopThrowIn();
    settleGlow();
    settleRings();
    paint();
  }
);

// ── Throw-in sequence ───────────────────────────────────────────────────────
//
// When playback runs into a frame the pipeline labels a throw-in, the view
// zooms in on the ball and a ring pulses around it, until play is back on:
// the label is over and valid frames have been flowing again for a few
// seconds, not a cutaway (see throwInSequence.ts). Then it eases back out to the view the user had.
//
// Unlike the goal sequence it draws nothing in place of the data, but it does
// move the view, so the same things stop it: pausing, seeking, stepping and
// pressing on the drawing layer put the user's view straight back, and
// zooming or panning hands the view to the user. Reduced motion keeps the
// view where it is and holds the ring still.

let throwIn: {
  /** Where the view zooms in: the ball when the label began. */
  ball: { x: number; y: number };
  startedMs: number | null;
  elapsedMs: number;
  /** Which way the view is easing: in, or back out once it lets go. */
  ease: ThrowInEase;
  /** Replay time the label, a gap or an empty frame last held it. */
  busyAt: number;
  camera: { from: Camera; to: Camera } | null;
} | null = null;
let throwInRaf: number | null = null;
// The label stays on for many frames: only its first one starts a sequence.
let throwInLabelSeen = false;
/** Replay time the last sequence ended at, for THROW_IN_REPEAT_S. */
let throwInEndedAt: number | null = null;
/** Replay time the record on screen arrived: a gap in the data leaves it behind. */
let frameArrivedAt = 0;
/** Where the ball was last seen, for a label frame that has none. */
let lastBallSeen: { x: number; y: number } | null = null;

/** The pulse around the ball while a sequence plays: the ball on screen, or where it began. */
function throwInPulseLayer(): BallPulse | undefined {
  if (!throwIn) return undefined;
  const frame = props.replay.frame.value;
  const ball = (frame && throwInBall(frame, null)) ?? throwIn.ball;
  return {
    ...ball,
    phase: prefersReducedMotion() ? 0.3 : throwInPulse(throwIn.elapsedMs),
  };
}

function throwInStep(ms: number): void {
  throwInRaf = null;
  if (!throwIn) return;
  if (throwIn.startedMs === null) throwIn.startedMs = ms;
  throwIn.elapsedMs = ms - throwIn.startedMs;
  const frame = props.replay.frame.value;
  const now = props.replay.currentTime.value;
  let weight = throwInWeight(throwIn.ease, throwIn.elapsedMs);
  if (frame) {
    const state = {
      labelled: isThrowInFrame(frame),
      valid: isValidFrame(frame),
      stale: now - frameArrivedAt > THROW_IN_STALE_S,
    };
    const busy = state.labelled || !state.valid || state.stale;
    if (busy) throwIn.busyAt = now;
    const holds = throwInHolds({ ...state, quietS: now - throwIn.busyAt });
    // Labelled again, or cut away from, while easing out: turn back in from
    // where the zoom has got to. Let go after holding: start back out.
    const towards = throwIn.ease.towards === 0 ? (busy ? 1 : 0) : holds ? 1 : 0;
    if (towards !== throwIn.ease.towards) {
      throwIn.ease = { towards, fromWeight: weight, startMs: throwIn.elapsedMs };
      weight = throwInWeight(throwIn.ease, throwIn.elapsedMs);
    }
  }
  if (throwIn.ease.towards === 0 && weight === 0) {
    stopThrowIn();
    return;
  }
  if (throwIn.camera) showCamera(blendCamera(throwIn.camera.from, throwIn.camera.to, weight));
  paint();
  throwInRaf = window.requestAnimationFrame(throwInStep);
}

function startThrowIn(frame: NonNullable<PipelineReplay['frame']['value']>): void {
  const ball = throwInBall(frame, lastBallSeen);
  if (!ball) return;
  const from = cameraFromView({
    zoom: zoom.value,
    panX: panX.value,
    panY: panY.value,
    renderedWidth: renderedWidth(),
  });
  throwIn = {
    ball,
    startedMs: null,
    elapsedMs: 0,
    ease: { towards: 1, fromWeight: 0, startMs: 0 },
    busyAt: props.replay.currentTime.value,
    camera: prefersReducedMotion()
      ? null
      : { from, to: throwInCamera(ball, frame.pitch_dimensions) },
  };
  throwInRaf = window.requestAnimationFrame(throwInStep);
}

/** End the sequence, putting back the view it started from unless the user took it over. */
function stopThrowIn(): void {
  if (!throwIn && throwInRaf === null) return;
  if (throwInRaf !== null) window.cancelAnimationFrame(throwInRaf);
  throwInRaf = null;
  const camera = throwIn?.camera;
  throwIn = null;
  throwInEndedAt = props.replay.currentTime.value;
  if (camera) showCamera(camera.from);
  paint();
}

/** Someone wants the real frame and their own view: end both sequences. */
function stopSequences(): void {
  stopGoal();
  stopThrowIn();
}

// ── Team phase labels ───────────────────────────────────────────────────────
//
// Which team is attacking and which defending, from the replay's phase (see
// teamPhase.ts). Named after the match title's teams when it names them, the
// first-named as team 0: the export names neither team, and DALF names the
// home team first, which is also the team drawn red. An assumption, as
// nothing says which team the pipeline numbered 0. Without a match in the
// title the teams are called Red and Blue, the colours they are drawn in.

const PHASE_TEAMS: Record<TeamId, { name: string; color: string }> = {
  0: { name: 'Red', color: PERSON_COLORS.home.fill },
  1: { name: 'Blue', color: PERSON_COLORS.away.fill },
};

const STATE_TEXT: Record<TeamState, string> = {
  attacking: 'Attacking',
  defending: 'Defending',
};

const phaseLabels = computed(() => {
  const phase = props.replay.phase.value;
  if (!phase) return null;
  return ([0, 1] as const).map((team) => {
    const state = phase.states[team];
    return {
      team,
      ...PHASE_TEAMS[team],
      name: props.teamNames?.[team] ?? PHASE_TEAMS[team].name,
      state,
      text: state ? STATE_TEXT[state] : null,
      // Only an attacking team is filled: a team that merely has the ball,
      // or nobody clearly having it, leaves both labels plain.
      filled: state === 'attacking',
    };
  });
});

const phaseDescription = computed(() =>
  (phaseLabels.value ?? [])
    .map((l) => (l.text ? `${l.name} ${l.text.toLowerCase()}` : l.name))
    .join(', ')
);

// ── Attack glow ─────────────────────────────────────────────────────────────
//
// While a team is attacking (see teamPhase.ts), a glow across the pitch toward
// the goal it attacks, a lit bar beyond that goal and a halo round the ball
// (attackGlow.ts). During playback it fades in and out over GLOW_FADE_S, so a
// short attack is a gentle pulse rather than a flash. Anywhere else - a seek,
// a step, a pause - it shows the frame's own state at once: a frame being
// looked at should not be partway through a fade. Reduced motion never fades.
//
// The chevrons in it flow toward the goal with the replay's clock, so they are
// still while paused and the same at a given moment however the replay got
// there. Reduced motion holds them still.

const GLOW_FADE_S = 1;

let glow: (AttackGlow & { target: 0 | 1 }) | null = null;
let glowRaf: number | null = null;
let lastGlowMs: number | null = null;

/** The glow the current phase calls for, before any fading. */
function glowTarget(): Omit<AttackGlow, 'intensity'> | null {
  const phase = props.replay.phase.value;
  if (!phase) return null;
  const team =
    phase.states[0] === 'attacking' ? 0 : phase.states[1] === 'attacking' ? 1 : null;
  if (team === null) return null;
  const direction = phase.attacks[team];
  // Without a direction there is no goal to glow towards.
  if (direction === null) return null;
  return { color: PHASE_TEAMS[team].color, team, direction };
}

function glowValue(): AttackGlow | undefined {
  if (!glow || glow.intensity <= 0) return undefined;
  const cycles = props.replay.currentTime.value / CHEVRON_FLOW_PERIOD_S;
  return {
    color: glow.color,
    team: glow.team,
    direction: glow.direction,
    intensity: glow.intensity,
    flow: prefersReducedMotion() ? 0 : cycles - Math.floor(cycles),
  };
}

function stopGlowLoop(): void {
  if (glowRaf !== null) window.cancelAnimationFrame(glowRaf);
  glowRaf = null;
  lastGlowMs = null;
}

function glowStep(ms: number): void {
  glowRaf = null;
  if (!glow) return;
  // Capped, so a tab that was in the background does not jump to the end.
  const dt = lastGlowMs === null ? 0 : Math.min(0.1, (ms - lastGlowMs) / 1000);
  lastGlowMs = ms;
  const step = dt / GLOW_FADE_S;
  glow.intensity =
    glow.target > glow.intensity
      ? Math.min(glow.target, glow.intensity + step)
      : Math.max(glow.target, glow.intensity - step);
  if (glow.intensity === glow.target) {
    lastGlowMs = null;
    if (glow.target === 0) glow = null;
    paint();
    return;
  }
  paint();
  glowRaf = window.requestAnimationFrame(glowStep);
}

/** Bring the glow in line with the phase, fading if `fade`, else at once. */
function updateGlow(fade: boolean): void {
  const target = glowTarget();
  if (!fade) {
    stopGlowLoop();
    glow = target ? { ...target, intensity: 1, target: 1 } : null;
    return;
  }
  if (target) {
    // The same attack carries on from wherever its fade has got to; a new one
    // starts from nothing.
    const same = glow?.team === target.team && glow.direction === target.direction;
    glow = { ...target, intensity: same && glow ? glow.intensity : 0, target: 1 };
  } else if (glow) {
    // Fading out keeps the colour and direction of the attack that ended.
    glow.target = 0;
  }
  if (glow && glow.intensity !== glow.target && glowRaf === null) {
    glowRaf = window.requestAnimationFrame(glowStep);
  }
}

/** Finish any fade at once: the frame on screen shows its own state. */
function settleGlow(): void {
  stopGlowLoop();
  if (!glow) return;
  glow.intensity = glow.target;
  if (glow.target === 0) glow = null;
}

// ── Rings ───────────────────────────────────────────────────────────────────
//
// The white rings on the players near the ball (nearbyTrackIds) and the gold
// possession ring on the carrier (possessionTrackIds). Who has the ball, and
// so who is near it, changes many times a minute, and the data loses the
// carrier for a frame or two at a time: rings snapping on and off with it were
// jarring. So during playback each fades in and out over RING_FADE_S of replay
// time. Anywhere else they show the frame's own rings at once, like the glow,
// and reduced motion never fades.

/** How strong each ring is, by track id. Absent means no ring. */
const nearbyRings = new Map<TrackId, number>();
const possessionRings = new Map<TrackId, number>();

/** Rings partway through a fade, which need a repaint as the clock moves. */
function ringsFading(): boolean {
  for (const rings of [nearbyRings, possessionRings]) {
    for (const strength of rings.values()) if (strength < 1) return true;
  }
  return false;
}

/** Fade `rings` toward `target` by `dt` seconds, or set them to it at once. */
function fadeRings(rings: Map<TrackId, number>, target: Set<TrackId>, dt: number | null): void {
  if (dt === null) {
    rings.clear();
    for (const id of target) rings.set(id, 1);
    return;
  }
  const step = dt / RING_FADE_S;
  for (const id of target) if (!rings.has(id)) rings.set(id, 0);
  for (const [id, strength] of rings) {
    const next = target.has(id) ? Math.min(1, strength + step) : Math.max(0, strength - step);
    if (next > 0) rings.set(id, next);
    else rings.delete(id);
  }
}

/** Fade both kinds of ring toward the frame's own by `dt` seconds, or set them. */
function updateRings(dt: number | null): void {
  const frame = props.replay.frame.value;
  fadeRings(nearbyRings, frame ? nearbyTrackIds(frame) : new Set(), dt);
  fadeRings(possessionRings, frame ? possessionTrackIds(frame) : new Set(), dt);
}

/** Finish any fade at once: the frame on screen shows its own rings. */
function settleRings(): void {
  updateRings(null);
}

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
//
// One watcher for everything a tick of the replay can change, so a tick paints
// once however many of them changed. The record and its phase arrive together
// on most ticks; the clock alone moves on the rest, as it ticks at display rate
// and records arrive at the data's rate, and then only a glow needs a repaint,
// for its chevrons to flow smoothly rather than in steps.
watch(
  [
    () => props.replay.frame.value,
    () => props.replay.phase.value,
    () => props.replay.currentTime.value,
  ],
  ([frame, phase, now], [prevFrame, prevPhase, before]) => {
    const playing =
      props.replay.isPlaying.value && lastStepWasPlayback && !prefersReducedMotion();
    if (phase !== prevPhase) updateGlow(playing);
    if (!frame) return;
    if (frame !== prevFrame) {
      ensureRenderer();
      frameArrivedAt = now;
      const labelled = isGoalFrame(frame);
      if (labelled && !goalLabelSeen && !goal && lastStepWasPlayback) {
        // The goal frames the shot from the user's own view, not a throw-in's.
        stopThrowIn();
        startGoal(frame);
      }
      goalLabelSeen = labelled;
      const thrown = isThrowInFrame(frame);
      if (
        thrown &&
        !throwInLabelSeen &&
        !throwIn &&
        !goal &&
        lastStepWasPlayback &&
        (throwInEndedAt === null || now - throwInEndedAt >= THROW_IN_REPEAT_S)
      ) {
        startThrowIn(frame);
      }
      throwInLabelSeen = thrown;
      lastBallSeen = throwInBall(frame, lastBallSeen);
    }
    // A fade that has just finished still needs the paint that shows its end.
    const wasFading = ringsFading();
    updateRings(playing ? Math.max(0, now - before) : null);
    if (
      frame !== prevFrame ||
      phase !== prevPhase ||
      glowValue() ||
      wasFading ||
      ringsFading()
    ) {
      paint();
    }
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
  stopThrowIn();
  stopGlowLoop();
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
            @pointerdown.capture="stopSequences"
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
          <!--
            In the row kept clear above the pitch (LABEL_ROW_PX), centred on
            it. Worked out by the app rather than reported by the pipeline,
            which the title says on hover.
          -->
          <div
            v-if="phaseLabels"
            data-testid="pipeline-phase"
            role="group"
            :aria-label="phaseDescription"
            title="Worked out from the tracking data: a team is attacking once it has kept the ball for 3 seconds, and the other team is then defending."
            class="pointer-events-auto absolute inset-x-0 bottom-full mx-auto mb-1.5 grid w-max max-w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
          >
            <!--
              Two equal columns either side of "vs", as wide as the longer
              label needs, so "vs" stays centred; a name too long for the row
              is cut short, and shown in full on hover.
            -->
            <template
              v-for="(l, i) in phaseLabels"
              :key="l.team"
            >
              <span
                v-if="i === 1"
                class="text-[10px] font-semibold uppercase tracking-widest text-white/60"
                aria-hidden="true"
              >vs</span>
              <div
                :data-testid="`pipeline-phase-team-${l.team}`"
                :data-state="l.state ?? 'none'"
                :title="l.name"
                class="flex min-w-[9.5rem] items-center gap-3 whitespace-nowrap rounded-md border-2 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-lg transition-colors duration-200 motion-reduce:transition-none"
                :class="[l.filled ? '' : 'bg-black/60', l.team === 1 ? 'justify-end' : '']"
                :style="{ borderColor: l.color, backgroundColor: l.filled ? l.color : undefined }"
                aria-hidden="true"
              >
                <!-- Mirrored for team 1, so both states sit either side of "vs". -->
                <span
                  v-if="l.team === 0"
                  class="min-w-0 truncate font-bold"
                >{{ l.name }}</span>
                <span
                  v-if="l.text"
                  class="shrink-0 text-[10px] tracking-widest"
                  :class="l.team === 0 ? 'ml-auto' : 'mr-auto'"
                >{{ l.text }}</span>
                <span
                  v-if="l.team === 1"
                  class="min-w-0 truncate font-bold"
                >{{ l.name }}</span>
              </div>
            </template>
          </div>

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
