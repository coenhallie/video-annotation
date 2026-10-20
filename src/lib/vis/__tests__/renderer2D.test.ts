import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useRenderer2D } from '@/lib/vis/useRenderer2D';
import type { Frame } from '@/lib/vis/types';
import { PERSON_COLORS, DIMMED_TEAM_ALPHA } from '@/lib/vis/constants';
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


// The pitch cache draws to its own surface, so its ops stay out of the ones
// under test here.
let offscreen: ReturnType<typeof stubOffscreenCanvas>;

beforeEach(() => {
  offscreen = stubOffscreenCanvas();
});

afterEach(() => {
  offscreen.restore();
});

describe('draw2DPlayer colours', () => {
  // Kit colours the pipeline detected, which the display now ignores.
  const DETECTED = {
    ordered_colors: [
      [232, 205, 204],
      [207, 112, 129],
      [137, 54, 57],
    ],
  };

  function person(teamId: number, personType: string): Frame {
    return {
      pitch_dimensions: PITCH,
      teams: [
        {
          team_id: teamId,
          ...DETECTED,
          players: [
            {
              track_id: 7,
              person_type: personType,
              projected_coordinates: { x: 0, y: 0 },
              player_number: 9,
            },
          ],
        },
      ],
      balls: [],
    } as unknown as Frame;
  }

  function draw(frame: Frame) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(frame);
    const fills = ops.filter((o) => o.op === 'fill');
    const circleAt = ops.indexOf(fills[1]!);
    return {
      // The first fill is the drop shadow; the second is the circle itself.
      fill: fills[1]?.fillStyle,
      strokes: ops.slice(circleAt).filter((o) => o.op === 'stroke'),
      ops,
    };
  }

  it('draws the home team (team 0) red, whatever kit colour was detected', () => {
    expect(draw(person(0, 'PersonType.PLAYER')).fill).toBe(PERSON_COLORS.home.fill);
  });

  it('draws the away team (team 1) blue, whatever kit colour was detected', () => {
    expect(draw(person(1, 'PersonType.PLAYER')).fill).toBe(PERSON_COLORS.away.fill);
  });

  it("draws a goalkeeper in high-visibility yellow, ringed in their team's colour", () => {
    const home = draw(person(0, 'PersonType.GOALKEEPER'));
    expect(home.fill).toBe(PERSON_COLORS.goalkeeper.fill);
    expect(home.strokes[0]?.strokeStyle).toBe(PERSON_COLORS.home.fill);

    const away = draw(person(1, 'PersonType.GOALKEEPER'));
    expect(away.fill).toBe(PERSON_COLORS.goalkeeper.fill);
    expect(away.strokes[0]?.strokeStyle).toBe(PERSON_COLORS.away.fill);
  });

  it('draws a referee or other official in high-visibility magenta', () => {
    expect(draw(person(-1, 'PersonType.OFFICIAL')).fill).toBe(PERSON_COLORS.official.fill);
  });

  // A team the export does not define has no home or away to be coloured as.
  it('draws a player of an unknown team in neutral grey', () => {
    expect(draw(person(4, 'PersonType.PLAYER')).fill).toBe(PERSON_COLORS.unknown.fill);
  });

  it('keeps the four roles in four different colours', () => {
    const fills = new Set(
      [PERSON_COLORS.home, PERSON_COLORS.away, PERSON_COLORS.goalkeeper, PERSON_COLORS.official].map(
        (c) => c.fill
      )
    );
    expect(fills.size).toBe(4);
  });

  it('draws every outline solid', () => {
    for (const frame of [person(0, 'PersonType.PLAYER'), person(1, 'PersonType.GOALKEEPER')]) {
      for (const stroke of draw(frame).strokes) expect(stroke.lineDash).toEqual([]);
    }
  });
});

describe('possession emphasis', () => {
  type Who = { team: number; type?: string; ball?: boolean };

  function match(people: Who[], ball = true): Frame {
    const teams = new Map<number, unknown[]>();
    people.forEach((p, i) => {
      const list = teams.get(p.team) ?? [];
      list.push({
        track_id: i + 1,
        person_type: p.type ?? 'PersonType.PLAYER',
        projected_coordinates: { x: -40 + i * 10, y: 0 },
        in_possession: Boolean(p.ball),
      });
      teams.set(p.team, list);
    });
    return {
      pitch_dimensions: PITCH,
      teams: [...teams].map(([team_id, players]) => ({ team_id, players })),
      balls: ball ? [{ projected_coordinates: { x: 30, y: 5 } }] : [],
    } as unknown as Frame;
  }

  /** The circle fill of every person drawn with this colour, in draw order. */
  const circles = (ops: Op[], fill: string) =>
    ops.filter((o) => o.op === 'fill' && o.fillStyle === fill);

  function render(...frames: Frame[]) {
    const { canvas, ops } = fakeCanvas();
    const renderer = useRenderer2D(canvas);
    for (const frame of frames) {
      ops.length = 0;
      renderer.renderFrame(frame);
    }
    return ops;
  }

  const { home, away, goalkeeper, official } = PERSON_COLORS;

  it('dims the team without the ball', () => {
    const ops = render(match([{ team: 0, ball: true }, { team: 0 }, { team: 1 }, { team: 1 }]));
    for (const o of circles(ops, home.fill)) expect(o.globalAlpha).toBe(1);
    for (const o of circles(ops, away.fill)) expect(o.globalAlpha).toBe(DIMMED_TEAM_ALPHA);
  });

  it("dims that team's goalkeeper too", () => {
    const ops = render(
      match([{ team: 1, ball: true }, { team: 0, type: 'PersonType.GOALKEEPER' }])
    );
    expect(circles(ops, goalkeeper.fill)[0]?.globalAlpha).toBe(DIMMED_TEAM_ALPHA);
  });

  it('dims nobody when nobody has the ball', () => {
    const ops = render(match([{ team: 0 }, { team: 1 }]));
    for (const o of [...circles(ops, home.fill), ...circles(ops, away.fill)]) {
      expect(o.globalAlpha).toBe(1);
    }
  });

  it('never dims the officials or the ball', () => {
    const ops = render(
      match([{ team: 0, ball: true }, { team: 1 }, { team: -1, type: 'PersonType.OFFICIAL' }])
    );
    expect(circles(ops, official.fill)[0]?.globalAlpha).toBe(1);
    expect(circles(ops, '#ffffff').every((o) => o.globalAlpha === 1)).toBe(true);
  });

  it('follows possession from one frame to the next', () => {
    const ops = render(
      match([{ team: 0, ball: true }, { team: 1 }]),
      match([{ team: 0 }, { team: 1, ball: true }])
    );
    expect(circles(ops, home.fill)[0]?.globalAlpha).toBe(DIMMED_TEAM_ALPHA);
    expect(circles(ops, away.fill)[0]?.globalAlpha).toBe(1);
  });

  // Where players overlap, the team with the ball must not be hidden behind
  // the dimmed one.
  it('draws the team with the ball on top', () => {
    const ops = render(match([{ team: 0, ball: true }, { team: 1 }]));
    const fills = ops.filter((o) => o.op === 'fill');
    const lastAway = fills.lastIndexOf(circles(ops, away.fill).at(-1)!);
    const firstHome = fills.indexOf(circles(ops, home.fill)[0]!);
    expect(firstHome).toBeGreaterThan(lastAway);
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
