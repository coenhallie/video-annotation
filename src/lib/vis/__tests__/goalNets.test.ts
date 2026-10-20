import { describe, it, expect } from 'vitest';
import { drawGoalNets } from '@/lib/vis/goalNets';
import { NET_DEPTH_METRES } from '@/lib/vis/goalSequence';
import { build2DTransform, worldToPx } from '@/lib/vis/pitchGeometry';
import { recordingCtx } from './recordingCtx';

const PITCH = { length: 105, width: 68, goal_width: 7.32 };
const T = build2DTransform(PITCH);

function draw(bulge?: { side: 1 | -1; y: number; metres: number }) {
  const { ctx, ops } = recordingCtx();
  drawGoalNets(ctx as unknown as CanvasRenderingContext2D, PITCH, T, bulge);
  return ops;
}

/** The back-of-net curves: one per goal, bowed through their control point. */
const backCurves = (ops: ReturnType<typeof draw>) =>
  ops.filter((o) => o.op === 'quadraticCurveTo' && o.lineDash.length === 0);

describe('drawGoalNets', () => {
  it('draws both posts of both goals', () => {
    const posts = draw().filter((o) => o.op === 'arc');
    const at = (x: number, y: number) => worldToPx(x, y, T);
    const corners: Array<[number, number]> = [
      [-52.5, -3.66],
      [-52.5, 3.66],
      [52.5, -3.66],
      [52.5, 3.66],
    ];
    for (const [x, y] of corners) {
      const [px, py] = at(x, y);
      expect(posts.some((o) => o.args[0] === px && o.args[1] === py)).toBe(true);
    }
  });

  it('puts the back of each net its depth behind the goal line', () => {
    const [backX] = worldToPx(52.5 + NET_DEPTH_METRES, 0, T);
    const ends = draw().filter((o) => o.op === 'quadraticCurveTo').map((o) => o.args[2]);
    expect(ends).toContain(backX);
  });

  it('draws the net translucent, so it never reads as a measured pitch line', () => {
    const strokes = draw().filter((o) => o.op === 'stroke');
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) expect(s.globalAlpha).toBeLessThan(1);
  });

  it('bows the back of the struck net outwards, and only that one', () => {
    const flat = backCurves(draw());
    const bulged = backCurves(draw({ side: 1, y: 0, metres: 0.5 }));
    // quadraticCurveTo(cpx, cpy, x, y): the control point moves out by twice
    // the bulge, which puts the curve's own peak out by the bulge.
    const ppm = T.sc;
    const right = (curves: typeof flat) => curves.filter((o) => Number(o.args[2]) > 640);
    const left = (curves: typeof flat) => curves.filter((o) => Number(o.args[2]) < 640);
    expect(Number(right(bulged)[0]!.args[0]) - Number(right(flat)[0]!.args[0])).toBeCloseTo(
      2 * 0.5 * ppm,
      6
    );
    expect(left(bulged)[0]!.args).toEqual(left(flat)[0]!.args);
  });

  // The moment of impact has to read at a glance, not only as a few pixels of
  // bulge.
  it('brightens the struck net while it moves, and only that one', () => {
    const fillAlpha = (ops: ReturnType<typeof draw>, side: 'left' | 'right') =>
      ops
        .filter((o) => o.op === 'fill' && o.fillStyle === '#ffffff' && o.globalAlpha < 1)
        .map((o) => o.globalAlpha)[side === 'left' ? 0 : 1];
    const still = draw();
    const struck = draw({ side: 1, y: 0, metres: 0.8 });
    expect(fillAlpha(struck, 'right')).toBeGreaterThan(fillAlpha(still, 'right')!);
    expect(fillAlpha(struck, 'left')).toBe(fillAlpha(still, 'left'));
  });
});
