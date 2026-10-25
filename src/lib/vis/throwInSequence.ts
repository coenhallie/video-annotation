import type { Frame, PitchDimensions } from './types';
import { resolvePitchDimensions } from './pitchGeometry';
import { frameHasAction } from './actionLabels';

/**
 * The throw-in sequence: when the pipeline labels a frame a throw-in, a ring
 * pulses on the spot it is taken from, on the touchline level with the ball,
 * until play is back on. It used to zoom the view in on that spot as well;
 * that was taken out at the user's request on 2026-10-25.
 *
 * "Back on" is not the ball crossing back over the touchline: measured on a
 * full match, the tracked ball goes over the touchline before only 11 of 60
 * throw-ins, so it mostly never left. Instead the sequence holds while the
 * label is on and while the broadcast has cut away, which the data shows as no
 * new records, or records tracking nobody or no ball, and lets go once valid
 * frames have been flowing again for a few seconds. A cutaway can run for tens
 * of seconds; the ring simply keeps pulsing until it ends.
 *
 * Everything here is a function of its arguments, so it can be tested without
 * a canvas or a clock. Positions are pitch metres, centred on the pitch.
 */

/**
 * How long play must have been back on, frames valid, flowing and unlabelled,
 * before the ring stops. The same throw-in is often labelled again soon after
 * its label goes off (39 times within 3 s on a full match), and the broadcast
 * sometimes cuts away just after: stopping and straight away starting again
 * would be worse than carrying on. It also keeps a label on for well under a
 * second (the median) from reading as a flicker.
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

/**
 * Whether the pipeline labelled this frame a throw-in, however the export
 * writes it ("Throw in", "EventType.THROW_IN"; see actionName).
 */
export function isThrowInFrame(frame: Frame): boolean {
  return frameHasAction(frame, 'throw in');
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
 * Where the throw-in is near: the frame's ball, or where the ball was last seen when the
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
 * Whether the sequence carries on: while the label is on, while the data has a gap
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

/** Where the pulse is, from 0 to 1, repeating every THROW_IN_PULSE_MS. */
export function throwInPulse(elapsedMs: number): number {
  return (
    (((elapsedMs % THROW_IN_PULSE_MS) + THROW_IN_PULSE_MS) % THROW_IN_PULSE_MS) / THROW_IN_PULSE_MS
  );
}
