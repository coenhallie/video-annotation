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

describe('resolution', () => {
  const viewOps = (ops: Op[]) =>
    ops.filter((o) => o.op === 'setTransform').map((o) => o.args);

  /** A canvas with a bitmap twice the frame size, as on a 2x display. */
  function hiDpi() {
    const fake = fakeCanvas();
    Object.assign(fake.canvas, { width: 2560, height: 1440 });
    return fake;
  }

  const ZOOM_2 = { zoom: 2, panX: 0, panY: 0, renderedWidth: 1280 };

  it("draws through the canvas's own resolution", () => {
    const { canvas, ops } = hiDpi();
    const renderer = useRenderer2D(canvas);
    renderer.setView(ZOOM_2);
    renderer.renderFrame(frameWith({}));

    // The view matrix, scaled from frame units into the 2x bitmap.
    expect(viewOps(ops)[1]).toEqual([4, 0, 0, 4, -1280, -720]);
  });

  // A pitch drawn once at frame size and then magnified is what made the lines
  // blur under zoom. It is drawn at the bitmap's size, through the view.
  it('builds the pitch at the canvas resolution, through the view', () => {
    const { canvas } = hiDpi();
    const renderer = useRenderer2D(canvas);
    renderer.setView(ZOOM_2);
    renderer.renderFrame(frameWith({}));

    expect(offscreen.sizes).toEqual([[2560, 1440]]);
    expect(viewOps(offscreen.ops)).toContainEqual([4, 0, 0, 4, -1280, -720]);
  });

  it('rebuilds the pitch only when the view or the resolution changes', () => {
    const { canvas } = hiDpi();
    const renderer = useRenderer2D(canvas);
    renderer.renderFrame(frameWith({}));
    renderer.renderFrame(frameWith({}));
    expect(offscreen.sizes.length).toBe(1);

    renderer.setView(ZOOM_2);
    renderer.renderFrame(frameWith({}));
    renderer.renderFrame(frameWith({}));
    expect(offscreen.sizes.length).toBe(2);

    Object.assign(canvas, { width: 1280, height: 720 });
    renderer.renderFrame(frameWith({}));
    expect(offscreen.sizes.at(-1)).toEqual([1280, 720]);
  });
});
