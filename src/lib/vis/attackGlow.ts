import type { PitchDimensions, Transform2D } from './types';
import { resolvePitchDimensions, worldToPx } from './pitchGeometry';
import { NET_DEPTH_METRES } from './goalSequence';

/** Which team is attacking, which way, and how far the glow has faded in. */
export interface AttackGlow {
  /** The attacking team's colour, as a #rrggbb hex. */
  color: string;
  /** The direction along x the team attacks in. */
  direction: 1 | -1;
  /** 0 to 1: how far the glow has faded in. */
  intensity: number;
}

/** Peak opacity of the glow across the pitch. */
const GLOW_ALPHA = 0.55;
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
/** Gap between the back of the net and the bar, and the bar's width, in metres. */
const BAR_GAP_METRES = 0.5;
const BAR_WIDTH_METRES = 0.6;
const BAR_BLUR = 16;

function transparent(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
}

/**
 * Three chevrons ("›››") pointing in `direction`, centred on (cx, cy): the
 * attack-direction arrow of the match-visualisation design. Drawn as shapes
 * rather than text, so they need no particular font and stay sharp at any
 * zoom.
 */
function drawChevrons(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  direction: 1 | -1,
  scale: number
): void {
  const h = CHEVRON_HEIGHT_METRES * scale;
  const w = CHEVRON_WIDTH_METRES * scale;
  const k = CHEVRON_STROKE_METRES * scale;
  const spacing = CHEVRON_SPACING_METRES * scale;
  const total = 2 * spacing + w;
  for (let i = 0; i < 3; i++) {
    const x0 = cx - total / 2 + i * spacing;
    const middle = x0 + w / 2;
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
    ctx.beginPath();
    points.forEach(([x, y], j) => (j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Show the attack: a glow across the pitch from the ball to the goal being
 * attacked, chevrons in it pointing at that goal, a lit bar beyond that goal's
 * net, and a halo around the ball, in the attacking team's colour (the
 * chevrons white) and all scaled by the glow's intensity.
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
  ball: { x: number; y: number }
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
  const [lineX] = p(glow.direction * half, 0);

  // Clear at the ball, the team's colour at the goal line.
  if (lineX !== ballX) {
    const gradient = ctx.createLinearGradient(ballX, 0, lineX, 0);
    gradient.addColorStop(0, transparent(glow.color));
    gradient.addColorStop(1, glow.color);
    ctx.globalAlpha = GLOW_ALPHA * glow.intensity;
    ctx.fillStyle = gradient;
    ctx.fillRect(Math.min(ballX, lineX), top, Math.abs(lineX - ballX), bottom - top);
  }

  // The direction of the attack, centred between the ball and the goal line.
  ctx.globalAlpha = CHEVRON_ALPHA * glow.intensity;
  ctx.fillStyle = '#ffffff';
  drawChevrons(ctx, (ballX + lineX) / 2, (top + bottom) / 2, glow.direction, t.sc);

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
