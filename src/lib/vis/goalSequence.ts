import type { Frame } from './types';
import { resolvePitchDimensions } from './pitchGeometry';

/**
 * The goal sequence: when the pipeline labels a frame GOAL, the replay shows a
 * ball being shot into the net and settling there, in place of the tracked
 * ball, which around a goal tends to jump about or sail straight through.
 *
 * Everything here is a function of the plan and the time since it started, so
 * it can be tested without a canvas or a clock. Positions are pitch metres,
 * centred on the pitch, the same space as the frame's own coordinates.
 */

/** Depth of the net behind the goal line. The export does not state one. */
export const NET_DEPTH_METRES = 2;

/** Length of the whole sequence, shot to banner fade. */
export const GOAL_SEQUENCE_MS = 3200;

/** How far in front of the goal a shot starts when the ball gives no usable start. */
const FALLBACK_SHOT_METRES = 14;
/** Closer than this to the goal line, the ball is too near for a visible shot. */
const MIN_SHOT_METRES = 8;
/** Room kept between the ball and the net, so it is drawn touching it, not through it. */
const NET_MARGIN = 0.3;
/** How far the ball comes back off the back of the net. */
const REBOUND_METRES = 0.9;
/** And how much further it rolls before it stops. */
const SETTLE_METRES = 0.15;

const REBOUND_MS = 450;
const SETTLE_MS = 600;
const BANNER_IN_MS = 180;
const BANNER_OUT_MS = 450;

/** Peak outward bulge of the back of the net, in metres, and how it dies away. */
const BULGE_METRES = 1.0;
const BULGE_DECAY_MS = 300;
const BULGE_PERIOD_MS = 440;

interface Point {
  x: number;
  y: number;
}

export interface GoalPlan {
  /** +1 for the goal at positive x, -1 for the one at negative x. */
  side: 1 | -1;
  /** Where the shot is taken from. */
  start: Point;
  /** Where the ball crosses the goal line. */
  impact: Point;
  /** Where it hits the back of the net. */
  back: Point;
  /** Where it comes to rest. */
  rest: Point;
  /** Duration of the shot itself, from the start to the back of the net. */
  shotMs: number;
  /** When, within the shot, the ball crosses the goal line. */
  inMs: number;
  halfLength: number;
  goalWidth: number;
}

export interface GoalState {
  ball: Point;
  /** Where the ball just was, most recent first, while it is travelling fast. */
  trail: Point[];
  /** Outward bulge of the back of the net at the impact point, in metres. */
  netBulge: number;
  /** Opacity of the GOAL banner, 0 to 1. */
  banner: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: Point, b: Point, k: number): Point => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
});
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const easeOutQuad = (u: number) => 1 - (1 - u) * (1 - u);
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;

/**
 * Whether the pipeline labelled this frame a goal. Matched whole, ignoring case
 * and padding, so "Goal kick" (a restart, and common) never counts.
 */
export function isGoalFrame(frame: Frame): boolean {
  return (frame.state?.actions ?? []).some(
    (a) => String(a.action_type ?? '').trim().toUpperCase() === 'GOAL'
  );
}

/**
 * Plan the sequence from the frame the GOAL label first appears on.
 *
 * Null when the frame has no usable ball: without one there is no telling which
 * goal it went in, and a goal at the wrong end is worse than none.
 */
export function planGoal(frame: Frame): GoalPlan | null {
  const ball = (frame.balls ?? [])
    .map((b) => b.projected_coordinates)
    .find((c) => finite(c?.x) && finite(c?.y));
  if (!ball) return null;

  const dims = resolvePitchDimensions(frame.pitch_dimensions);
  const halfLength = dims.length.value / 2;
  const halfWidth = dims.width.value / 2;
  const goalWidth = dims.goal_width.value;
  const side: 1 | -1 = ball.x < 0 ? -1 : 1;

  // The tracked ball is the natural place to shoot from, unless it is off the
  // pitch (it has been projected far behind a goal) or already at the goal.
  const usable =
    Math.abs(ball.x) <= halfLength - MIN_SHOT_METRES && Math.abs(ball.y) <= halfWidth;
  const start: Point = usable
    ? { x: ball.x, y: ball.y }
    : { x: side * (halfLength - FALLBACK_SHOT_METRES), y: clamp(ball.y, -10, 10) };

  // Aimed between the posts, leaning a little towards the side it came from.
  const postRoom = goalWidth / 2 - 0.6;
  const impact: Point = { x: side * halfLength, y: clamp(start.y * 0.12, -postRoom, postRoom) };

  // Carry on along the line of the shot to the back of the net, kept inside
  // the side netting.
  const along = (NET_DEPTH_METRES - NET_MARGIN) / Math.abs(impact.x - start.x);
  const back: Point = {
    x: side * (halfLength + NET_DEPTH_METRES - NET_MARGIN),
    y: clamp(impact.y + (impact.y - start.y) * along, -postRoom, postRoom),
  };
  const rest: Point = {
    x: side * (halfLength + NET_DEPTH_METRES - NET_MARGIN - REBOUND_METRES - SETTLE_METRES),
    y: back.y * 0.85,
  };

  // Longer shots take a little longer, within what still reads as a strike.
  const shotLength = dist(start, impact) + dist(impact, back);
  const shotMs = clamp(380 + shotLength * 14, 450, 900);
  // easeOutQuad(u) = fraction of the distance covered, solved for the line.
  const inMs = shotMs * (1 - Math.sqrt(1 - dist(start, impact) / shotLength));

  return { side, start, impact, back, rest, shotMs, inMs, halfLength, goalWidth };
}

function shotPosition(plan: GoalPlan, t: number): Point {
  const first = dist(plan.start, plan.impact);
  const total = first + dist(plan.impact, plan.back);
  const covered = easeOutQuad(clamp(t / plan.shotMs, 0, 1)) * total;
  return covered <= first
    ? lerp(plan.start, plan.impact, first > 0 ? covered / first : 1)
    : lerp(plan.impact, plan.back, (covered - first) / (total - first || 1));
}

/** The state of the sequence `t` milliseconds after it started. */
export function goalStateAt(plan: GoalPlan, t: number): GoalState {
  const time = clamp(t, 0, GOAL_SEQUENCE_MS);
  const reboundEnd = plan.shotMs + REBOUND_MS;
  const settleEnd = reboundEnd + SETTLE_MS;
  const bounced: Point = {
    x: plan.back.x - plan.side * REBOUND_METRES,
    y: plan.back.y * 0.9,
  };

  let ball: Point;
  let trail: Point[] = [];
  if (time <= plan.shotMs) {
    ball = shotPosition(plan, time);
    trail = [16, 32, 48]
      .map((ago) => time - ago)
      .filter((at) => at > 0)
      .map((at) => shotPosition(plan, at));
  } else if (time <= reboundEnd) {
    ball = lerp(plan.back, bounced, easeOutCubic((time - plan.shotMs) / REBOUND_MS));
  } else if (time <= settleEnd) {
    ball = lerp(bounced, plan.rest, easeOutCubic((time - reboundEnd) / SETTLE_MS));
  } else {
    ball = { ...plan.rest };
  }

  const sinceHit = time - plan.shotMs;
  // A damped ripple that only ever bows the net outwards: a net pushed out by
  // the ball sags back to rest, it does not spring in past it towards the ball.
  const netBulge =
    sinceHit <= 0
      ? 0
      : BULGE_METRES *
        Math.exp(-sinceHit / BULGE_DECAY_MS) *
        (1 + Math.cos((2 * Math.PI * sinceHit) / BULGE_PERIOD_MS)) /
        2;

  const fadeIn = clamp((time - plan.inMs) / BANNER_IN_MS, 0, 1);
  const fadeOut = clamp((GOAL_SEQUENCE_MS - time) / BANNER_OUT_MS, 0, 1);
  const banner = time < plan.inMs ? 0 : Math.min(fadeIn, fadeOut);

  return { ball, trail, netBulge, banner };
}
