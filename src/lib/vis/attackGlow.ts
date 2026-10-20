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
/** Gap between the back of the net and the bar, and the bar's width, in metres. */
const BAR_GAP_METRES = 0.5;
const BAR_WIDTH_METRES = 0.6;
const BAR_BLUR = 16;

function transparent(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
}

/**
 * Show the attack: a glow across the pitch from the ball to the goal being
 * attacked, a lit bar beyond that goal's net, and a halo around the ball, all
 * in the attacking team's colour and all scaled by the glow's intensity.
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
