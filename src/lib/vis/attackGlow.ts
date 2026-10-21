import type { Frame, PitchDimensions, Transform2D } from './types';
import { resolvePitchDimensions, worldToPx } from './pitchGeometry';
import { NET_DEPTH_METRES } from './goalSequence';

/** Which team is attacking, which way, and how far the glow has faded in. */
export interface AttackGlow {
  /** The attacking team's colour, as a #rrggbb hex. */
  color: string;
  /** The attacking team's team_id in the frame. */
  team: 0 | 1;
  /** The direction along x the team attacks in. */
  direction: 1 | -1;
  /** 0 to 1: how far the glow has faded in. */
  intensity: number;
  /**
   * 0 to 1, repeating: how far the chevrons have flowed toward the goal. The
   * caller advances it with time; 0 and 1 draw the same picture.
   */
  flow?: number;
  /** The shaded area, the bar beyond the goal and the halo round the ball. Default on. */
  shading?: boolean;
  /** The chevrons flowing toward the goal. Default on. */
  arrows?: boolean;
}

/** Opacity of the shaded area in front of the attack. */
const AREA_ALPHA = 0.3;
/** Peak opacity of the halo around the ball. */
const HALO_ALPHA = 0.35;
const HALO_RADIUS = 20;
/** Opacity of the chevrons pointing at the goal under attack. */
const CHEVRON_ALPHA = 0.85;
/** One chevron's height, width and stroke, and the distance between them, in metres. */
const CHEVRON_HEIGHT_METRES = 9;
const CHEVRON_WIDTH_METRES = 4.5;
const CHEVRON_STROKE_METRES = 1.8;
const CHEVRON_SPACING_METRES = 3.2;
/** Chevrons in the stream at once, the first fading in and the last fading out. */
const CHEVRON_SLOTS = 4;
/**
 * Seconds of replay for each chevron to flow one place toward the goal: a
 * steady 4 m/s or so across the pitch, calm enough to read as direction
 * rather than speed.
 */
export const CHEVRON_FLOW_PERIOD_S = 0.8;
/** Gap between the back of the net and the bar, and the bar's width, in metres. */
const BAR_GAP_METRES = 0.5;
const BAR_WIDTH_METRES = 0.6;
const BAR_BLUR = 16;

/**
 * How far up the pitch the attack reaches: the x of the attacking team's
 * player furthest toward the goal it attacks, or null with none tracked.
 */
export function attackFront(frame: Frame, team: 0 | 1, direction: 1 | -1): number | null {
  let front: number | null = null;
  for (const t of frame.teams ?? []) {
    if (t.team_id !== team) continue;
    for (const player of t.players ?? []) {
      const x = player.projected_coordinates?.x;
      if (typeof x !== 'number' || !Number.isFinite(x)) continue;
      if (front === null || direction * x > direction * front) front = x;
    }
  }
  return front;
}

/**
 * A stream of chevrons ("›››") flowing in `direction` through a fixed stretch
 * of pitch centred on (cx, cy): the attack-direction arrow of the
 * match-visualisation design.
 *
 * Fixed in place rather than placed relative to the ball: tied to the ball, it
 * moved with every jitter and pass of the tracked ball and staggered back and
 * forth. Instead `flow` moves each chevron one slot toward the goal per cycle;
 * the first fades in as it enters and the last fades out as it leaves, so one
 * cycle ends exactly where the next begins. Drawn as shapes rather than text,
 * so they need no particular font and stay sharp at any zoom.
 */
function drawChevrons(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  direction: 1 | -1,
  scale: number,
  flow: number,
  alpha: number
): void {
  const h = CHEVRON_HEIGHT_METRES * scale;
  const w = CHEVRON_WIDTH_METRES * scale;
  const k = CHEVRON_STROKE_METRES * scale;
  const spacing = CHEVRON_SPACING_METRES * scale;
  const phase = ((flow % 1) + 1) % 1;
  for (let i = 0; i < CHEVRON_SLOTS; i++) {
    const along = i + phase;
    const visibility = Math.max(0, Math.min(1, along, CHEVRON_SLOTS - along));
    if (visibility <= 0) continue;
    const middle = cx + direction * (along - CHEVRON_SLOTS / 2) * spacing;
    const x0 = middle - w / 2;
    // A chevron pointing right; mirrored about its own middle to point left.
    const right: Array<[number, number]> = [
      [x0, cy - h / 2],
      [x0 + k, cy - h / 2],
      [x0 + w, cy],
      [x0 + k, cy + h / 2],
      [x0, cy + h / 2],
      [x0 + w - k, cy],
    ];
    const points = right.map(
      ([x, y]): [number, number] => [direction === 1 ? x : 2 * middle - x, y]
    );
    ctx.globalAlpha = alpha * visibility;
    ctx.beginPath();
    points.forEach(([x, y], j) => (j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Show the attack: the pitch shaded from `frontX`, how far up the pitch the
 * attack reaches (see attackFront), to the goal being attacked, chevrons
 * flowing toward that goal through the half under attack, a lit bar beyond
 * that goal's net, and a halo around the ball, in the attacking team's colour
 * (the chevrons white) and all scaled by the glow's intensity.
 *
 * Drawn in frame units through the context's current transform, before the
 * players, so it never covers them. Where the team is attacking is worked out
 * by the app (teamPhase.ts), not reported by the pipeline.
 */
export function drawAttackGlow(
  ctx: CanvasRenderingContext2D,
  pd: Partial<PitchDimensions> | undefined,
  t: Transform2D,
  glow: AttackGlow,
  ball: { x: number; y: number },
  frontX: number
): void {
  if (glow.intensity <= 0) return;
  const dims = resolvePitchDimensions(pd);
  const half = dims.length.value / 2;
  const halfWidth = dims.width.value / 2;
  const p = (x: number, y: number) => worldToPx(x, y, t);
  const before = ctx.globalAlpha;

  const [, top] = p(0, -halfWidth);
  const [, bottom] = p(0, halfWidth);
  const [ballX, ballY] = p(Math.min(half, Math.max(-half, ball.x)), ball.y);
  const [frontPx] = p(Math.min(half, Math.max(-half, frontX)), 0);
  const [lineX] = p(glow.direction * half, 0);

  const shading = glow.shading !== false;

  // One flat shade, from the front of the attack to the goal line.
  if (shading && lineX !== frontPx) {
    ctx.globalAlpha = AREA_ALPHA * glow.intensity;
    ctx.fillStyle = glow.color;
    ctx.fillRect(Math.min(frontPx, lineX), top, Math.abs(lineX - frontPx), bottom - top);
  }

  // The direction of the attack, flowing through the middle of the half
  // being attacked.
  if (glow.arrows !== false) {
    const [halfCentre] = p((glow.direction * half) / 2, 0);
    ctx.fillStyle = '#ffffff';
    drawChevrons(
      ctx,
      halfCentre,
      (top + bottom) / 2,
      glow.direction,
      t.sc,
      glow.flow ?? 0,
      CHEVRON_ALPHA * glow.intensity
    );
  }

  if (!shading) {
    ctx.globalAlpha = before;
    return;
  }

  // A bar beyond the net of the goal under attack, lit with a soft glow.
  const barNear = glow.direction * (half + NET_DEPTH_METRES + BAR_GAP_METRES);
  const barFar = glow.direction * (half + NET_DEPTH_METRES + BAR_GAP_METRES + BAR_WIDTH_METRES);
  const [x0] = p(Math.min(barNear, barFar), 0);
  const [x1] = p(Math.max(barNear, barFar), 0);
  ctx.globalAlpha = glow.intensity;
  ctx.fillStyle = glow.color;
  ctx.shadowColor = glow.color;
  ctx.shadowBlur = BAR_BLUR * glow.intensity;
  ctx.fillRect(x0, top, x1 - x0, bottom - top);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // A halo around the ball.
  ctx.globalAlpha = HALO_ALPHA * glow.intensity;
  ctx.fillStyle = glow.color;
  ctx.beginPath();
  ctx.arc(ballX, ballY, HALO_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = before;
}
