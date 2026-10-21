import type { Frame, PitchDimensions } from './types';
import { build2DTransform, resolvePitchDimensions, worldToPx } from './pitchGeometry';
import { FRAME_W, FRAME_H } from './constants';

/**
 * The throw-in sequence: when the pipeline labels a frame a throw-in, the view
 * zooms in on the spot it is taken from, on the touchline level with the ball,
 * a ring pulses there, and the view eases back out once play is back on.
 *
 * "Back on" is not the ball crossing back over the touchline: measured on a
 * full match, the tracked ball goes over the touchline before only 11 of 60
 * throw-ins, so it mostly never left. Instead the sequence holds while the
 * label is on and while the broadcast has cut away, which the data shows as no
 * new records, or records tracking nobody or no ball, and lets go once valid
 * frames have been flowing again for a few seconds. A cutaway can run for tens
 * of seconds; the view simply stays in until it ends.
 *
 * Everything here is a function of its arguments, so it can be tested without
 * a canvas or a clock. Positions are pitch metres, centred on the pitch.
 */

/** How far in the view zooms: about a third of the pitch's length in view. */
export const THROW_IN_ZOOM = 2.6;
/** A quick zoom in, and a gentler way back out. */
export const THROW_IN_IN_MS = 600;
export const THROW_IN_OUT_MS = 900;
/**
 * How long play must have been back on, frames valid, flowing and unlabelled,
 * before the view starts back out. The same throw-in is often labelled again
 * soon after its label goes off (39 times within 3 s on a full match), and
 * the broadcast sometimes cuts away just after: zooming out and straight back
 * in would be worse than staying in. It also keeps a label on for well under
 * a second (the median) from reading as a flicker.
 */
export const THROW_IN_SETTLE_S = 3;
/**
 * A record this much older than the clock means the data has a gap: the
 * replay holds the last frame through it, and nothing new arrives. Records
 * come every 0.04 s, so this is several missed in a row.
 */
export const THROW_IN_STALE_S = 0.25;
/**
 * The same throw-in is often labelled again a few seconds later. A label this
 * soon after the last sequence ended does not start another.
 */
export const THROW_IN_REPEAT_S = 10;
/** One pulse of the ring around the ball. */
export const THROW_IN_PULSE_MS = 1100;

interface Point {
  x: number;
  y: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);

/**
 * Whether the pipeline labelled this frame a throw-in. Case, padding and the
 * separator are ignored ("Throw in", "THROW_IN", "throw-in"), but the label
 * must be the whole of it.
 */
export function isThrowInFrame(frame: Frame): boolean {
  return (frame.state?.actions ?? []).some(
    (a) =>
      String(a.action_type ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, ' ') === 'throw in',
  );
}

/** The frame's ball, if it has a usable one. */
function frameBall(frame: Frame): Point | null {
  for (const ball of frame.balls ?? []) {
    const c = ball.projected_coordinates;
    if (finite(c?.x) && finite(c?.y)) return { x: c.x, y: c.y };
  }
  return null;
}

/**
 * Whether the frame shows the match: someone tracked, and a ball. A frame of
 * a cutaway in the broadcast tracks nobody, or loses the ball.
 */
export function isValidFrame(frame: Frame): boolean {
  if (!frameBall(frame)) return false;
  return (frame.teams ?? []).some((team) =>
    (team.players ?? []).some(
      (p) => finite(p.projected_coordinates?.x) && finite(p.projected_coordinates?.y),
    ),
  );
}

/**
 * Where to zoom in: the frame's ball, or where the ball was last seen when the
 * frame has none. Null when it has never been seen.
 */
export function throwInBall(frame: Frame, lastSeen: Point | null): Point | null {
  return frameBall(frame) ?? lastSeen;
}

/**
 * Where the throw-in is taken from: on the touchline nearer the ball, level
 * with it, and between the goal lines. A throw-in is never taken inside the
 * pitch, wherever the tracked ball is: on a full match it is well inside the
 * pitch when most throw-in labels begin.
 */
export function throwInSpot(ball: Point, pd: Partial<PitchDimensions> | undefined): Point {
  const dims = resolvePitchDimensions(pd);
  const halfLength = dims.length.value / 2;
  const halfWidth = dims.width.value / 2;
  return {
    x: clamp(ball.x, -halfLength, halfLength),
    y: ball.y < 0 ? -halfWidth : halfWidth,
  };
}

/**
 * The view centred on `spot` (throwInSpot), in frame units (1280x720) like
 * the surface's own zoom and pan. Never centred so near an edge that it would
 * show past the frame, which a spot on the touchline would otherwise do.
 */
export function throwInCamera(
  spot: Point,
  pd: Partial<PitchDimensions> | undefined,
): { zoom: number; x: number; y: number } {
  const [bx, by] = worldToPx(spot.x, spot.y, build2DTransform(pd));
  const halfW = FRAME_W / (2 * THROW_IN_ZOOM);
  const halfH = FRAME_H / (2 * THROW_IN_ZOOM);
  return {
    zoom: THROW_IN_ZOOM,
    x: clamp(bx, halfW, FRAME_W - halfW),
    y: clamp(by, halfH, FRAME_H - halfH),
  };
}

/**
 * Whether the view stays in: while the label is on, while the data has a gap
 * (`stale`) or tracks nothing (`!valid`), and until play has been back on for
 * THROW_IN_SETTLE_S (`quietS`, how long none of those has held).
 */
export function throwInHolds(state: {
  labelled: boolean;
  valid: boolean;
  stale: boolean;
  quietS: number;
}): boolean {
  return state.labelled || !state.valid || state.stale || state.quietS < THROW_IN_SETTLE_S;
}

/**
 * Which way the view is easing, from what weight, since when: towards the
 * throw-in's view (1) or back to the user's (0). A turn partway starts from
 * the weight reached, so the view never jumps.
 */
export interface ThrowInEase {
  towards: 0 | 1;
  fromWeight: number;
  startMs: number;
}

/**
 * How far the view is towards the throw-in's at `nowMs`, from 0 (the user's
 * view) to 1. Quick on the way in, gentler on the way out.
 */
export function throwInWeight(ease: ThrowInEase, nowMs: number): number {
  const elapsed = Math.max(0, nowMs - ease.startMs);
  if (ease.towards === 1) {
    if (elapsed >= THROW_IN_IN_MS) return 1;
    return ease.fromWeight + (1 - ease.fromWeight) * easeOutCubic(elapsed / THROW_IN_IN_MS);
  }
  if (elapsed >= THROW_IN_OUT_MS) return 0;
  return ease.fromWeight * (1 - easeInOutCubic(elapsed / THROW_IN_OUT_MS));
}

/** Where the pulse is, from 0 to 1, repeating every THROW_IN_PULSE_MS. */
export function throwInPulse(elapsedMs: number): number {
  return (
    (((elapsedMs % THROW_IN_PULSE_MS) + THROW_IN_PULSE_MS) % THROW_IN_PULSE_MS) / THROW_IN_PULSE_MS
  );
}
