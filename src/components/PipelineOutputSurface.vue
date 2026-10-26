<script setup lang="ts">
import { ref, reactive, watch, onMounted, onUnmounted, computed } from 'vue';
import {
  nearbyTrackIds,
  possessionTrackIds,
  useRenderer2D,
  type GoalOverlay,
  type TrackId,
} from '@/lib/vis/useRenderer2D';
import {
  ATTACK_IN_MS,
  ATTACK_OUT_MS,
  ATTACK_PULSE_MS,
  ATTACK_SHOW_MS,
  type AttackIndicator,
} from '@/lib/vis/attackIndicator';
import type { BallTrail } from '@/lib/vis/ballTrail';
import {
  FREE_KICK_IN_MS,
  FREE_KICK_LABEL_HOLD_S,
  FREE_KICK_OUT_MS,
  FREE_KICK_REARM_S,
  FREE_KICK_SHOW_MS,
  FREE_KICK_STALL_S,
  isFreeKickFrame,
  playMoved,
  type FreeKickBanner,
} from '@/lib/vis/freeKick';
import freeKickIconUrl from '@/assets/free-kick.svg';
import {
  REPLAY_LAYERS,
  readReplayLayers,
  writeReplayLayers,
  type ReplayLayerKey,
} from '@/lib/vis/replayLayers';
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
import {
  BALL_RADIUS,
  FRAME_W,
  FRAME_H,
  PERSON_COLORS,
  POSSESSION_FADE_IN_S,
  RECEIVE_FADE_S,
  RECEIVE_SHOW_S,
  RING_FADE_S,
} from '@/lib/vis/constants';
import { rolled, UPRIGHT, type Spin } from '@/lib/vis/football';
import { build2DTransform, worldToPx } from '@/lib/vis/pitchGeometry';
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
import type { Frame } from '@/lib/vis/types';

const props = defineProps<{
  replay: PipelineReplay;
  /**
   * The teams the match title names, first-named first (pipelineTeamNames),
   * or null when it names none. Team 0 is taken to be the first-named.
   */
  teamNames?: [string, string] | null;
}>();

// ── Layers ──────────────────────────────────────────────────────────────────
//
// What the replay draws over the data can be shown or hidden piece by piece
// from the layers menu (replayLayers.ts). Hiding a layer only stops it being
// drawn: the data, and what is worked out from it, stay as they are.

function layerStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const layers = reactive(readReplayLayers(layerStorage()));
const layersOpen = ref(false);

function toggleLayer(key: ReplayLayerKey): void {
  layers[key] = !layers[key];
  writeReplayLayers(layerStorage(), { ...layers });
  // A sequence switched off mid-way ends now, putting the user's view back.
  if (key === 'goal' && !layers.goal) stopGoal();
  if (key === 'attack' && !layers.attack) stopAttack();
  if (key === 'freeKick' && !layers.freeKick) stopFreeKick();
  if (key === 'ringFades' && !layers.ringFades) settleRings();
  paint();
}

function onLayersKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') layersOpen.value = false;
}

watch(layersOpen, (open) => {
  if (open) document.addEventListener('keydown', onLayersKeydown);
  else document.removeEventListener('keydown', onLayersKeydown);
});

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
    const goal = goalOverlay();
    rollBall(frame, goal);
    const attackShown = attackValue();
    // The attack holds the ball, and the trail that leads to it, where they
    // were when it was shown, until it starts to go.
    const held = attackShown?.ball && !attackShown.leaving ? attackMoment : null;
    renderer?.renderFrame(frame, {
      goal,
      attack: attackShown,
      freeKick: freeKickValue(),
      rings: {
        nearby: layers.nearbyRings ? new Map(nearbyRings) : new Map(),
        possession: new Map(possessionRings),
      },
      fadeFar: layers.farFade,
      trail: layers.ballTrail
        ? ((held ? held.trail : props.replay.ballTrail.value) ?? undefined)
        : undefined,
      ballSpin: attackMoment ? attackMoment.spin : ballSpin,
      received: receivedCovers(),
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
      stopAttack();
      stopFreeKick();
      // Wherever the clock went, nothing seen before counts from here: the
      // frame watcher notes the label again if the new record carries it.
      freeKickLabelAt = null;
      playMovedAt = now;
    }
  },
  { flush: 'sync' }
);

watch(
  () => props.replay.isPlaying.value,
  (playing) => {
    if (playing) return;
    stopGoal();
    stopAttack();
    stopFreeKick();
    settleRings();
    paint();
  }
);

/** Someone wants the real frame and their own view: end every sequence. */
function stopSequences(): void {
  stopGoal();
  stopAttack();
  stopFreeKick();
}

// ── Attack ──────────────────────────────────────────────────────────────────
//
// When playback runs into an attack (see teamPhase.ts) with the ball in the
// other team's half, the attack is shown for ATTACK_SHOW_MS: the pitch shaded
// from the attacking team's own goal line to a toothed edge pointing at the
// goal it attacks, the same width for every attack, as on the design, with
// its name over "Attack" just behind that edge (attackIndicator.ts). Everyone
// on the pitch fades out, and the ball is held where it was when the attack
// was shown, its border pulsing. Play carries on underneath; when the time is
// up it all fades out over ATTACK_OUT_MS onto play as it now is.
//
// An attack is shown once, the first time it is seen in the other team's half.
// Like the goal sequence it only ever plays during playback, and anything that
// means someone wants the real frame - pausing, seeking, stepping, pressing on
// the drawing layer - stops it at once. An attack a seek or a step lands in
// the middle of is not shown when play then carries on.
//
// The team is named after the match title's teams when it names them, the
// first-named as team 0: the export names neither team, and DALF names the
// home team first, which is also the team drawn red. An assumption, as nothing
// says which team the pipeline numbered 0. Without a match in the title the
// teams are called Red and Blue, the colours they are drawn in.

const PHASE_TEAMS: Record<TeamId, { name: string; color: string }> = {
  0: { name: 'Red', color: PERSON_COLORS.home.fill },
  1: { name: 'Blue', color: PERSON_COLORS.away.fill },
};

const teamName = (team: TeamId) => props.teamNames?.[team] ?? PHASE_TEAMS[team].name;

// ── Team phase labels ───────────────────────────────────────────────────────
//
// Which team is attacking and which defending, from the replay's phase (see
// teamPhase.ts), in a row above the pitch, named as the attack is.

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
      name: teamName(team),
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

let attackMoment: {
  team: TeamId;
  color: string;
  direction: 1 | -1;
  /** The ball, its trail and how it was turned when the attack was shown. */
  ball: { x: number; y: number };
  trail: BallTrail | null;
  spin: Spin;
  startedMs: number | null;
  elapsedMs: number;
} | null = null;
let attackRaf: number | null = null;
/**
 * The attack last seen, as team and direction, so each is shown once; null
 * while nobody is attacking.
 */
let attackSeen: string | null = null;

/** The attack the current phase says is under way, if any. */
function attackTarget(): { team: TeamId; direction: 1 | -1; color: string } | null {
  const phase = props.replay.phase.value;
  if (!phase) return null;
  const team =
    phase.states[0] === 'attacking' ? 0 : phase.states[1] === 'attacking' ? 1 : null;
  if (team === null) return null;
  const direction = phase.attacks[team];
  // Without a direction there is no telling which half is the other team's.
  if (direction === null) return null;
  return { team, direction, color: PHASE_TEAMS[team].color };
}

function attackValue(): AttackIndicator | undefined {
  const m = attackMoment;
  if (!m) return undefined;
  const e = m.elapsedMs;
  const still = prefersReducedMotion();
  const coming = Math.min(1, e / ATTACK_IN_MS);
  const leaving = !still && e >= ATTACK_SHOW_MS;
  const going = leaving ? Math.max(0, 1 - (e - ATTACK_SHOW_MS) / ATTACK_OUT_MS) : 1;
  const intensity = still ? 1 : leaving ? going : coming;
  const playersFade = still ? 1 : leaving ? going : Math.max(0, coming * 2 - 1);
  return {
    team: m.team,
    color: m.color,
    name: teamName(m.team),
    direction: m.direction,
    intensity,
    leaving,
    playersFade,
    ball: m.ball,
    ...(still ? {} : { pulse: (e / ATTACK_PULSE_MS) % 1 }),
  };
}

function attackStep(ms: number): void {
  attackRaf = null;
  if (!attackMoment) return;
  if (attackMoment.startedMs === null) attackMoment.startedMs = ms;
  attackMoment.elapsedMs = ms - attackMoment.startedMs;
  const end = prefersReducedMotion() ? ATTACK_SHOW_MS : ATTACK_SHOW_MS + ATTACK_OUT_MS;
  if (attackMoment.elapsedMs >= end) {
    stopAttack();
    return;
  }
  paint();
  attackRaf = window.requestAnimationFrame(attackStep);
}

function startAttack(
  target: { team: TeamId; direction: 1 | -1; color: string },
  ball: { x: number; y: number }
): void {
  attackMoment = {
    ...target,
    ball,
    trail: props.replay.ballTrail.value,
    spin: ballSpin,
    startedMs: null,
    elapsedMs: 0,
  };
  attackRaf = window.requestAnimationFrame(attackStep);
}

/** End the attack at once, back to the frame as it is. */
function stopAttack(): void {
  if (!attackMoment && attackRaf === null) return;
  if (attackRaf !== null) window.cancelAnimationFrame(attackRaf);
  attackRaf = null;
  attackMoment = null;
  paint();
}

/**
 * Show the attack on `frame` if it has just reached the other team's half
 * during playback. Called for every frame drawn, after the goal sequence has
 * had its say.
 */
function maybeStartAttack(frame: Frame): void {
  const target = attackTarget();
  const key = target ? `${target.team}:${target.direction}` : null;
  // Landed on by a seek or a step: whatever attack is under way has been
  // seen, and is not shown when play carries on.
  if (!lastStepWasPlayback || key === null) {
    attackSeen = key;
    return;
  }
  if (!target || key === attackSeen) return;
  const ball = shownBall(frame, undefined);
  // Not yet in the other team's half: not shown until it is.
  if (!ball || target.direction * ball.x <= 0) return;
  attackSeen = key;
  if (layers.attack && !goal && !freeKick && !attackMoment) startAttack(target, ball);
}

// ── Free kick ───────────────────────────────────────────────────────────────
//
// When playback runs into a frame the pipeline labels a free kick, "FREE KICK"
// is shown across the middle of the pitch, as on the design, fading in as
// everyone on the pitch fades out (freeKick.ts).
//
// A free kick is usually prepared off camera, and while the broadcast is away
// the data stops: it loses the ball, then repeats everyone's last positions,
// or has no records at all, and the pitch stands still. So the banner stays
// for at least FREE_KICK_SHOW_MS, and after that for as long as the label is
// on or play is stopped; once neither is true, with everyone moving and the
// ball back, it fades out onto play as it is.
//
// The label flickers on and off over a few records around one free kick, so
// it is shown once, the first time it is seen after being off for
// FREE_KICK_REARM_S. Like the other sequences it only ever plays during
// playback, anything that means someone wants the real frame stops it at
// once, and a free kick a seek or a step lands in is not shown when play then
// carries on. It takes over from an attack, and a goal takes over from it.

let freeKick: {
  startedMs: number | null;
  elapsedMs: number;
  /** When it started to fade out, in ms from its start; null until then. */
  leavingFromMs: number | null;
} | null = null;
let freeKickRaf: number | null = null;
/** The replay time the free kick label was last seen at, or null. */
let freeKickLabelAt: number | null = null;
/** The replay time anyone on the pitch, or the ball, last moved at. */
let playMovedAt = 0;
/** The free kick icon, once it has loaded. */
let freeKickIcon: HTMLImageElement | null = null;

/**
 * Whether the free kick is still being taken: its label is on, nobody has
 * moved for FREE_KICK_STALL_S of replay time, or the ball is not tracked.
 */
function freeKickUnderWay(): boolean {
  const now = props.replay.currentTime.value;
  const labelOn = freeKickLabelAt !== null && now - freeKickLabelAt < FREE_KICK_LABEL_HOLD_S;
  const frame = props.replay.frame.value;
  const ballGone = !frame || shownBall(frame, undefined) === null;
  return labelOn || ballGone || now - playMovedAt >= FREE_KICK_STALL_S;
}

function freeKickValue(): FreeKickBanner | undefined {
  const m = freeKick;
  if (!m) return undefined;
  const intensity = prefersReducedMotion()
    ? 1
    : m.leavingFromMs !== null
      ? Math.max(0, 1 - (m.elapsedMs - m.leavingFromMs) / FREE_KICK_OUT_MS)
      : Math.min(1, m.elapsedMs / FREE_KICK_IN_MS);
  return { intensity, playersFade: intensity, icon: freeKickIcon };
}

function freeKickStep(ms: number): void {
  freeKickRaf = null;
  if (!freeKick) return;
  if (freeKick.startedMs === null) freeKick.startedMs = ms;
  freeKick.elapsedMs = ms - freeKick.startedMs;
  if (
    freeKick.leavingFromMs === null &&
    freeKick.elapsedMs >= FREE_KICK_SHOW_MS &&
    !freeKickUnderWay()
  ) {
    if (prefersReducedMotion()) {
      stopFreeKick();
      return;
    }
    freeKick.leavingFromMs = freeKick.elapsedMs;
  }
  if (
    freeKick.leavingFromMs !== null &&
    freeKick.elapsedMs - freeKick.leavingFromMs >= FREE_KICK_OUT_MS
  ) {
    stopFreeKick();
    return;
  }
  paint();
  freeKickRaf = window.requestAnimationFrame(freeKickStep);
}

/** End the free kick at once, back to the frame as it is. */
function stopFreeKick(): void {
  if (!freeKick && freeKickRaf === null) return;
  if (freeKickRaf !== null) window.cancelAnimationFrame(freeKickRaf);
  freeKickRaf = null;
  freeKick = null;
  paint();
}

/**
 * Note whether play moved on `frame`, and show the free kick if it is one
 * that playback has just run into. Called for every frame drawn, after the
 * goal sequence has had its say.
 */
function updateFreeKick(frame: Frame, prevFrame: Frame | null | undefined, now: number): void {
  if (!lastStepWasPlayback || !prevFrame || playMoved(prevFrame, frame)) playMovedAt = now;
  const labelled = isFreeKickFrame(frame);
  // Landed on by a seek or a step: a free kick under way has been seen.
  if (!lastStepWasPlayback) {
    freeKickLabelAt = labelled ? now : null;
    return;
  }
  if (!labelled) return;
  const fresh = freeKickLabelAt === null || now - freeKickLabelAt > FREE_KICK_REARM_S;
  freeKickLabelAt = now;
  if (!fresh || !layers.freeKick || goal || freeKick) return;
  stopAttack();
  freeKick = { startedMs: null, elapsedMs: 0, leavingFromMs: null };
  freeKickRaf = window.requestAnimationFrame(freeKickStep);
}

function loadFreeKickIcon(): void {
  if (typeof Image === 'undefined') return;
  const icon = new Image();
  icon.onload = () => {
    freeKickIcon = icon;
    paint();
  };
  icon.src = freeKickIconUrl;
}

// ── Rings ───────────────────────────────────────────────────────────────────
//
// The white rings on the players near the ball (nearbyTrackIds) and the gold
// possession ring on the carrier (possessionTrackIds). Who has the ball, and
// so who is near it, changes many times a minute, and the data loses the
// carrier for a frame or two at a time: rings snapping on and off with it were
// jarring. So during playback each fades in and out over RING_FADE_S of replay
// time. Anywhere else they show the frame's own rings at once, like the attack,
// and reduced motion never fades.

/** How strong each ring is, by track id. Absent means no ring. */
const nearbyRings = new Map<TrackId, number>();
const possessionRings = new Map<TrackId, number>();

/**
 * Rings partway through a fade, or a player drawn over the ball having just
 * received it, which need a repaint as the clock moves.
 */
function ringsFading(): boolean {
  if (received.size > 0) return true;
  for (const rings of [nearbyRings, possessionRings]) {
    for (const strength of rings.values()) if (strength < 1) return true;
  }
  return false;
}

/**
 * Fade `rings` toward `target` by `dt` seconds, or set them to it at once.
 * They fade in over `fadeIn` seconds and out over RING_FADE_S.
 */
function fadeRings(
  rings: Map<TrackId, number>,
  target: Set<TrackId>,
  dt: number | null,
  fadeIn = RING_FADE_S,
): void {
  if (dt === null) {
    rings.clear();
    for (const id of target) rings.set(id, 1);
    return;
  }
  for (const id of target) if (!rings.has(id)) rings.set(id, 0);
  for (const [id, strength] of rings) {
    const next = target.has(id)
      ? Math.min(1, strength + dt / fadeIn)
      : Math.max(0, strength - dt / RING_FADE_S);
    if (next > 0) rings.set(id, next);
    else rings.delete(id);
  }
}

/**
 * Fade both kinds of ring toward the frame's own by `dt` seconds, or set them,
 * and move on who is drawn over the ball by `receiveDt`: that plays whether
 * the rings fade or not.
 */
function updateRings(dt: number | null, receiveDt: number | null = dt): void {
  const frame = props.replay.frame.value;
  const withBall = frame ? possessionTrackIds(frame) : new Set<TrackId>();
  updateReceived(withBall, receiveDt);
  fadeRings(nearbyRings, frame ? nearbyTrackIds(frame) : new Set(), dt);
  fadeRings(possessionRings, withBall, dt, POSSESSION_FADE_IN_S);
}

// ── Receiving the ball ──────────────────────────────────────────────────────
//
// The ball sits on the circle of the player with it, over their number. So
// during playback a player who receives it is drawn over it for
// RECEIVE_SHOW_S, their number showing, and then fades over RECEIVE_FADE_S
// to show the ball again. A player receives the ball when they get it having
// not had it for RING_FADE_S: the data loses the carrier for a frame or two at
// a time, which does not count. This is kept apart from the possession ring,
// which does not fade with ring fades switched off. Anywhere else, and under
// reduced motion, nobody is drawn over the ball.

/** Seconds since each player received the ball, while they are drawn over it. */
const received = new Map<TrackId, number>();
/** Seconds since each player last had the ball, for RING_FADE_S after. */
const hadBall = new Map<TrackId, number>();

/** Start and move on each player drawn over the ball, by `dt` seconds, or clear them. */
function updateReceived(withBall: Set<TrackId>, dt: number | null): void {
  if (dt === null) {
    // Whoever has the ball here has had it: playing on, they did not just get it.
    received.clear();
    hadBall.clear();
    for (const id of withBall) hadBall.set(id, 0);
    return;
  }
  for (const [id, since] of received) {
    if (since + dt >= RECEIVE_SHOW_S + RECEIVE_FADE_S) received.delete(id);
    else received.set(id, since + dt);
  }
  for (const [id, since] of hadBall) {
    if (since + dt > RING_FADE_S) hadBall.delete(id);
    else hadBall.set(id, since + dt);
  }
  for (const id of withBall) {
    if (!hadBall.has(id)) received.set(id, 0);
    hadBall.set(id, 0);
  }
}

/** How strongly each player who has just received the ball is drawn over it. */
function receivedCovers(): Map<TrackId, number> {
  const covers = new Map<TrackId, number>();
  for (const [id, since] of received) {
    const fading = (since - RECEIVE_SHOW_S) / RECEIVE_FADE_S;
    covers.set(id, fading <= 0 ? 1 : 1 - fading * fading * (3 - 2 * fading));
  }
  return covers;
}

/** Finish any fade at once: the frame on screen shows its own rings. */
function settleRings(): void {
  updateRings(null);
}

// ── Ball roll ───────────────────────────────────────────────────────────────
//
// The ball is drawn as a football, and during playback it rolls the way it
// moves on screen (football.ts). How it is turned carries on from frame to
// frame, so it is kept here. A seek, a step while paused, or a jump in the
// ball's tracking moves it without rolling it, and reduced motion never rolls
// it.

/**
 * Further than this in one step, in metres, the tracked ball has jumped
 * rather than moved: 45 m/s, as in ballTrail.ts, over a frame and a half.
 */
const MAX_ROLL_STEP_METRES = 2.7;

let ballSpin: Spin = UPRIGHT;
/** Where the ball was last drawn, in metres, and whether it was the goal's. */
let rolledFrom: { x: number; y: number } | null = null;
let rolledGoal = false;

/** The ball the frame is drawn with: the goal sequence's, or the tracked one. */
function shownBall(frame: Frame, goal: GoalOverlay | undefined): { x: number; y: number } | null {
  if (goal) return goal.ball;
  for (const ball of frame.balls ?? []) {
    const { x, y } = ball.projected_coordinates ?? {};
    if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
      return { x, y };
    }
  }
  return null;
}

/** Roll the ball on from where it was last drawn, if it is moving in play. */
function rollBall(frame: Frame, goal: GoalOverlay | undefined): void {
  const at = shownBall(frame, goal);
  const moving =
    (goal !== undefined || (props.replay.isPlaying.value && lastStepWasPlayback)) &&
    !prefersReducedMotion();
  // Between the tracked ball and the goal's, the ball did not travel.
  const sameBall = (goal !== undefined) === rolledGoal;
  rolledGoal = goal !== undefined;
  if (at && rolledFrom && moving && sameBall) {
    const dx = at.x - rolledFrom.x;
    const dy = at.y - rolledFrom.y;
    if (Math.hypot(dx, dy) <= MAX_ROLL_STEP_METRES) {
      // Rolled on screen, where it is drawn at BALL_RADIUS.
      const t = build2DTransform(frame.pitch_dimensions);
      const [x0, y0] = worldToPx(rolledFrom.x, rolledFrom.y, t);
      const [x1, y1] = worldToPx(at.x, at.y, t);
      ballSpin = rolled(ballSpin, x1 - x0, y1 - y0, BALL_RADIUS);
    }
  }
  rolledFrom = at;
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
// once however many of them changed. The record, its phase and its trail
// arrive together on most ticks; the clock alone moves on the rest, as it
// ticks at display rate and records arrive at the data's rate, and then only
// fading rings need a repaint.
watch(
  [
    () => props.replay.frame.value,
    () => props.replay.phase.value,
    () => props.replay.currentTime.value,
    () => props.replay.ballTrail.value,
  ],
  ([frame, phase, now, trail], [prevFrame, prevPhase, before, prevTrail]) => {
    const playing =
      props.replay.isPlaying.value && lastStepWasPlayback && !prefersReducedMotion();
    if (!frame) return;
    if (frame !== prevFrame) {
      ensureRenderer();
      const labelled = isGoalFrame(frame);
      if (labelled && layers.goal && !goalLabelSeen && !goal && lastStepWasPlayback) {
        // The goal takes over from an attack or a free kick still showing.
        stopAttack();
        stopFreeKick();
        startGoal(frame);
      }
      goalLabelSeen = labelled;
      updateFreeKick(frame, prevFrame, now);
      maybeStartAttack(frame);
    }
    // A fade that has just finished still needs the paint that shows its end.
    const wasFading = ringsFading();
    const step = playing ? Math.max(0, now - before) : null;
    updateRings(layers.ringFades ? step : null, step);
    if (
      frame !== prevFrame ||
      phase !== prevPhase ||
      trail !== prevTrail ||
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
  loadLabelFont();
  loadFreeKickIcon();
  void props.replay.load();
});

/**
 * The attack's label and the free kick's title are drawn on the canvas in web
 * fonts, which a canvas does not wait for: until they arrive, text is drawn in
 * a fallback, and nothing redraws a paused replay once they have. So load
 * every weight they use, and repaint when they are in.
 */
function loadLabelFont(): void {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts?.load) return;
  Promise.all([
    fonts.load('600 16px Montserrat'),
    fonts.load('700 16px Montserrat'),
    fonts.load('italic 900 16px Inter'),
  ]).then(
    () => paint(),
    () => {
      // Unavailable: the fallback stands.
    }
  );
}

onUnmounted(() => {
  document.removeEventListener('keydown', onLayersKeydown);
  stopGoal();
  stopAttack();
  stopFreeKick();
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
            v-if="phaseLabels && layers.phaseLabels"
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

          <!--
            The layers menu: what the replay draws over the data, each shown
            or hidden at once. Top right, clear of the transport and the
            frame and zoom badges.
          -->
          <div class="pointer-events-auto absolute right-2 top-2">
            <button
              type="button"
              data-testid="pipeline-layers-toggle"
              class="flex h-7 items-center gap-1.5 rounded-full bg-black/60 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-white/80 shadow-lg ring-1 ring-white/10 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-white/60 motion-reduce:transition-none"
              :aria-expanded="layersOpen"
              aria-haspopup="menu"
              title="Show or hide what is drawn over the data"
              @click="layersOpen = !layersOpen"
            >
              <svg
                class="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M2 18l10 5 10-5"
                />
              </svg>
              Layers
            </button>
            <div
              v-if="layersOpen"
              data-testid="pipeline-layers-backdrop"
              class="fixed inset-0 z-40"
              @click="layersOpen = false"
            />
            <div
              v-if="layersOpen"
              data-testid="pipeline-layers-menu"
              role="menu"
              aria-label="Layers"
              class="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-md border border-white/10 bg-gray-900/95 py-1 text-white shadow-xl"
            >
              <button
                v-for="layer in REPLAY_LAYERS"
                :key="layer.key"
                type="button"
                role="menuitemcheckbox"
                data-testid="pipeline-layer-option"
                :data-layer="layer.key"
                :aria-checked="layers[layer.key]"
                class="flex w-full items-start gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none motion-reduce:transition-none"
                @click="toggleLayer(layer.key)"
              >
                <span
                  class="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border"
                  :class="layers[layer.key] ? 'border-white bg-white text-gray-900' : 'border-white/40'"
                  aria-hidden="true"
                >
                  <svg
                    v-if="layers[layer.key]"
                    class="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="m5 13 4 4L19 7"
                    />
                  </svg>
                </span>
                <span class="min-w-0">
                  <span class="block text-[12px] leading-tight">{{ layer.label }}</span>
                  <span class="block text-[10px] leading-tight text-white/50">{{ layer.hint }}</span>
                </span>
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
