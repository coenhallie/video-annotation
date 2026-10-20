import type { PitchDimensions, Transform2D } from './types';
import { resolvePitchDimensions, worldToPx } from './pitchGeometry';
import { NET_DEPTH_METRES } from './goalSequence';

/** Struck net: which goal, where along it, and how far it bows out, in metres. */
export interface NetBulge {
  side: 1 | -1;
  y: number;
  metres: number;
}

/** Spacing of the net's mesh, in metres. */
const MESH_METRES = 0.6;
const POST_RADIUS = 2.5;

/**
 * Draw both goals: posts on the goal line and a net box behind it.
 *
 * Drawn faint and translucent on purpose. The goal width comes from the frame,
 * but the net's depth is not in the export at all, and reviewers compare the
 * solid pitch lines against the video (PITCH LINES MISMATCH), so nothing here
 * may look like one of them.
 *
 * Drawn in frame units through whatever transform the context already has, and
 * on every frame rather than into the pitch cache, so a bulging net costs a
 * few lines rather than a rebuilt pitch.
 */
export function drawGoalNets(
  ctx: CanvasRenderingContext2D,
  pd: Partial<PitchDimensions> | undefined,
  t: Transform2D,
  bulge?: NetBulge
): void {
  const dims = resolvePitchDimensions(pd);
  const half = dims.length.value / 2;
  const g = dims.goal_width.value / 2;
  const p = (x: number, y: number) => worldToPx(x, y, t);
  const before = ctx.globalAlpha;

  for (const side of [-1, 1] as const) {
    const b = bulge && bulge.side === side ? bulge.metres : 0;
    const by = bulge && bulge.side === side ? bulge.y : 0;
    const line = side * half;
    const backX = side * (half + NET_DEPTH_METRES);
    // A quadratic bows halfway to its control point, so the control sits out
    // by twice the bulge to put the net's peak out by the bulge itself.
    const backCurve = (depthFraction: number) => {
      const x = side * (half + NET_DEPTH_METRES * depthFraction);
      const [x0, y0] = p(x, -g);
      const [cx, cy] = p(x + side * 2 * b * depthFraction, by);
      const [x1, y1] = p(x, g);
      return { x0, y0, cx, cy, x1, y1 };
    };
    // How far the back of the net has moved at a point along it, following the
    // same bow as the curve.
    const bowAt = (y: number) => {
      const span = g + Math.abs(by);
      return b * Math.max(0, 1 - ((y - by) / span) ** 2);
    };

    const back = backCurve(1);
    const [lx0, ly0] = p(line, -g);
    const [lx1, ly1] = p(line, g);

    // Net body, lit up while it is moving so the impact reads at a glance.
    ctx.globalAlpha = 0.08 + Math.min(0.22, Math.abs(b) * 0.25);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(lx0, ly0);
    ctx.lineTo(back.x0, back.y0);
    ctx.quadraticCurveTo(back.cx, back.cy, back.x1, back.y1);
    ctx.lineTo(lx1, ly1);
    ctx.closePath();
    ctx.fill();

    // Side and back netting.
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lx0, ly0);
    ctx.lineTo(back.x0, back.y0);
    ctx.quadraticCurveTo(back.cx, back.cy, back.x1, back.y1);
    ctx.lineTo(lx1, ly1);
    ctx.stroke();

    // Mesh: rows parallel to the goal line, bowing with the back of the net
    // in proportion to their depth, and columns running back into it.
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 0.75;
    for (const f of [0.25, 0.5, 0.75]) {
      const row = backCurve(f);
      ctx.beginPath();
      ctx.moveTo(row.x0, row.y0);
      ctx.quadraticCurveTo(row.cx, row.cy, row.x1, row.y1);
      ctx.stroke();
    }
    for (let y = -g + MESH_METRES; y < g - MESH_METRES / 2; y += MESH_METRES) {
      const [fx, fy] = p(line, y);
      const [tx, ty] = p(backX + side * bowAt(y), y);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    // Posts.
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    for (const y of [-g, g]) {
      const [px, py] = p(line, y);
      ctx.beginPath();
      ctx.arc(px, py, POST_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = before;
}
