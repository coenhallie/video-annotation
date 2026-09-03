import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useRenderer2D } from '@/lib/vis/useRenderer2D';
import type { Frame } from '@/lib/vis/types';
import { fakeCanvas, stubOffscreenCanvas, type Op } from './recordingCtx';

const PITCH = { length: 105, width: 68 };

function frameWith(teamOver: Record<string, unknown>): Frame {
  return {
    pitch_dimensions: PITCH,
    teams: [
      {
        team_id: 0,
        players: [
          {
            track_id: 7,
            person_type: 'PersonType.PLAYER',
            projected_coordinates: { x: 0, y: 0 },
            player_number: 9,
          },
        ],
        ...teamOver,
      },
    ],
    balls: [],
  } as unknown as Frame;
}

/** Ops belonging to the player circle: the arc at pitch centre and what follows. */
function strokesAfterFirstArc(ops: Op[]): Op[] {
  const start = ops.findIndex((o) => o.op === 'arc');
  return ops.slice(start).filter((o) => o.op === 'stroke');
}

// The pitch cache draws to its own surface, so its ops stay out of the ones
// under test here.
let offscreen: ReturnType<typeof stubOffscreenCanvas>;

beforeEach(() => {
  offscreen = stubOffscreenCanvas();
});

afterEach(() => {
  offscreen.restore();
});

describe('draw2DPlayer colour fidelity', () => {
  it('outlines a player whose team reported no colour with a dashed stroke', () => {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(frameWith({}));

    const dashed = strokesAfterFirstArc(ops).filter((o) => o.lineDash.length > 0);
    expect(dashed.length).toBeGreaterThan(0);
  });

  it('outlines a player whose team reported a colour with a solid stroke', () => {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(
      frameWith({
        ordered_colors: [
          [232, 205, 204],
          [207, 112, 129],
          [137, 54, 57],
        ],
      })
    );

    for (const stroke of strokesAfterFirstArc(ops)) {
      expect(stroke.lineDash).toEqual([]);
    }
  });

  it('does not fill an undetected player with a team-coloured circle', () => {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(frameWith({}));

    const fills = ops.filter((o) => o.op === 'fill').map((o) => o.fillStyle);
    // The old fallback painted team 0 solid red out of nothing but its index.
    expect(fills).not.toContain('#e03030');
    expect(fills).toContain('rgba(20,20,20,0.55)');
  });
});


describe('view transform', () => {
  const viewOps = (ops: Op[]) =>
    ops.filter((o) => o.op === 'setTransform').map((o) => o.args);

  // Fit is the overwhelmingly common case and has to be byte-identical to the
  // untransformed render this replaced.
  it('draws through the identity when no view has been set', () => {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(frameWith({}));

    // Reset-then-apply: the second is the view actually drawn through.
    expect(viewOps(ops)[1]).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('clears before applying the view, so a pan cannot smear the last frame', () => {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(frameWith({}));

    const clearAt = ops.findIndex((o) => o.op === 'clearRect');
    const drawAt = ops.findIndex((o) => o.op === 'drawImage');
    expect(clearAt).toBeGreaterThanOrEqual(0);
    expect(clearAt).toBeLessThan(drawAt);
  });

  it('draws through the matrix a set view resolves to', () => {
    const { canvas, ops } = fakeCanvas();
    const renderer = useRenderer2D(canvas);
    renderer.setView({ zoom: 2, panX: 0, panY: 0, renderedWidth: 1280 });
    renderer.renderFrame(frameWith({}));

    // Scaling about the frame centre: e = cx - zoom*cx = 640 - 1280 = -640.
    expect(viewOps(ops)[1]).toEqual([2, 0, 0, 2, -640, -360]);
  });
});
