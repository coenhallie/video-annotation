import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useRenderer2D } from '@/lib/vis/useRenderer2D';
import type { Frame } from '@/lib/vis/types';
import {
  PERSON_COLORS,
  DIMMED_PLAYER_ALPHA,
  NEARBY_OUTLINE,
  PLAYER_RADIUS,
} from '@/lib/vis/constants';
import { build2DTransform, worldToPx, PITCH_GRASS } from '@/lib/vis/pitchGeometry';
import { NET_DEPTH_METRES } from '@/lib/vis/goalSequence';
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
    // The person stands at the pitch centre; their circle is the arc there at
    // full player radius (the drop shadow is offset by a pixel).
    const [px, py] = worldToPx(0, 0, build2DTransform(PITCH));
    const circleAt = ops.findIndex(
      (o) => o.op === 'arc' && o.args[0] === px && o.args[1] === py && o.args[2] === PLAYER_RADIUS
    );
    const after = ops.slice(circleAt);
    return {
      fill: after.find((o) => o.op === 'fill')?.fillStyle,
      strokes: after.filter((o) => o.op === 'stroke'),
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

describe('focus around the ball', () => {
  type Who = { team: number; x: number; y?: number; type?: string; ball?: boolean };
  const BALL = { x: 0, y: 0 };

  function match(people: Who[], ball: { x: number; y: number } | null = BALL): Frame {
    const teams = new Map<number, unknown[]>();
    people.forEach((p, i) => {
      const list = teams.get(p.team) ?? [];
      list.push({
        track_id: i + 1,
        person_type: p.type ?? 'PersonType.PLAYER',
        projected_coordinates: { x: p.x, y: p.y ?? 0 },
        in_possession: Boolean(p.ball),
      });
      teams.set(p.team, list);
    });
    return {
      pitch_dimensions: PITCH,
      teams: [...teams].map(([team_id, players]) => ({ team_id, players })),
      balls: ball ? [{ projected_coordinates: ball }] : [],
    } as unknown as Frame;
  }

  function render(frame: Frame, overlay?: Parameters<ReturnType<typeof useRenderer2D>['renderFrame']>[1]) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(frame, overlay);
    return ops;
  }

  /** The circle fill of the person standing at (x, y). */
  function fillAt(ops: Op[], x: number, y = 0): Op | undefined {
    const [px, py] = worldToPx(x, y, build2DTransform(PITCH));
    const at = ops.findIndex(
      (o) => o.op === 'arc' && o.args[0] === px && o.args[1] === py && o.args[2] === PLAYER_RADIUS
    );
    return at < 0 ? undefined : ops.slice(at).find((o) => o.op === 'fill');
  }

  it('dims every player further than the focus radius from the ball, on either team', () => {
    const ops = render(match([{ team: 0, x: 30 }, { team: 1, x: -25 }]));
    expect(fillAt(ops, 30)?.globalAlpha).toBe(DIMMED_PLAYER_ALPHA);
    expect(fillAt(ops, -25)?.globalAlpha).toBe(DIMMED_PLAYER_ALPHA);
  });

  it('keeps players within the radius solid, on either team', () => {
    const ops = render(match([{ team: 0, x: 10 }, { team: 1, x: -6, y: 8 }]));
    expect(fillAt(ops, 10)?.globalAlpha).toBe(1);
    expect(fillAt(ops, -6, 8)?.globalAlpha).toBe(1);
  });

  it('measures the radius from the ball, so it works when nobody has possession', () => {
    const ops = render(match([{ team: 0, x: 40 }], { x: 35, y: 0 }));
    expect(fillAt(ops, 40)?.globalAlpha).toBe(1);
  });

  it('dims a goalkeeper far from the ball like any other player', () => {
    const ops = render(match([{ team: 1, x: 50, type: 'PersonType.GOALKEEPER' }]));
    expect(fillAt(ops, 50)?.globalAlpha).toBe(DIMMED_PLAYER_ALPHA);
  });

  it('never dims the officials, however far away', () => {
    const ops = render(match([{ team: -1, x: 45, type: 'PersonType.OFFICIAL' }]));
    expect(fillAt(ops, 45)?.globalAlpha).toBe(1);
  });

  it('dims nobody in a frame without a ball', () => {
    const ops = render(match([{ team: 0, x: 40 }], null));
    expect(fillAt(ops, 40)?.globalAlpha).toBe(1);
  });

  it('follows the animated ball during the goal sequence', () => {
    const ops = render(match([{ team: 0, x: 48 }]), {
      ball: { x: 50, y: 0 },
      trail: [],
      net: { side: 1, y: 0, metres: 0 },
    });
    expect(fillAt(ops, 48)?.globalAlpha).toBe(1);
  });

  // Where players overlap, the play around the ball must not be hidden behind
  // a faded player.
  it('draws the players near the ball on top of the faded ones', () => {
    const ops = render(match([{ team: 0, x: 3 }, { team: 1, x: 40 }]));
    expect(ops.indexOf(fillAt(ops, 3)!)).toBeGreaterThan(ops.indexOf(fillAt(ops, 40)!));
  });

  it('no longer dims a whole team for not having the ball', () => {
    const ops = render(match([{ team: 0, x: 0, ball: true }, { team: 1, x: 5 }]));
    expect(fillAt(ops, 5)?.globalAlpha).toBe(1);
  });
});

describe('nearby highlight', () => {
  type Who = { team: number; x: number; y?: number; type?: string; ball?: boolean };

  function frame(people: Who[]): Frame {
    const teams = new Map<number, unknown[]>();
    people.forEach((p, i) => {
      const list = teams.get(p.team) ?? [];
      list.push({
        track_id: i + 1,
        person_type: p.type ?? 'PersonType.PLAYER',
        projected_coordinates: { x: p.x, y: p.y ?? 0 },
        in_possession: Boolean(p.ball),
      });
      teams.set(p.team, list);
    });
    return {
      pitch_dimensions: PITCH,
      teams: [...teams].map(([team_id, players]) => ({ team_id, players })),
      balls: [],
    } as unknown as Frame;
  }

  /** The outline drawn around the marker of the person standing at (x, y). */
  function outlineOf(f: Frame, x: number, y = 0): string | undefined {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(f);
    const [px, py] = worldToPx(x, y, build2DTransform(PITCH));
    const at = ops.findIndex(
      (o) => o.op === 'arc' && o.args[0] === px && o.args[1] === py && o.args[2] === PLAYER_RADIUS
    );
    return ops.slice(at).find((o) => o.op === 'stroke')?.strokeStyle;
  }

  const { home, away, goalkeeper } = PERSON_COLORS;

  it('rings teammates within 15 m of the ball carrier in white', () => {
    const f = frame([{ team: 0, x: 0, ball: true }, { team: 0, x: 14 }, { team: 0, x: -9, y: 11 }]);
    expect(outlineOf(f, 14)).toBe(NEARBY_OUTLINE);
    expect(outlineOf(f, -9, 11)).toBe(NEARBY_OUTLINE);
  });

  it('rings the ball carrier too', () => {
    expect(outlineOf(frame([{ team: 0, x: 0, ball: true }]), 0)).toBe(NEARBY_OUTLINE);
  });

  it('does not ring a teammate further than 15 m away', () => {
    const f = frame([{ team: 0, x: 0, ball: true }, { team: 0, x: 16 }]);
    expect(outlineOf(f, 16)).toBe(home.outline);
  });

  it('never rings the other team, however close', () => {
    const f = frame([{ team: 0, x: 0, ball: true }, { team: 1, x: 3 }]);
    expect(outlineOf(f, 3)).toBe(away.outline);
  });

  it('rings nobody when nobody has the ball', () => {
    const f = frame([{ team: 0, x: 0 }, { team: 0, x: 5 }]);
    expect(outlineOf(f, 0)).toBe(home.outline);
    expect(outlineOf(f, 5)).toBe(home.outline);
  });

  it('rings a nearby goalkeeper white instead of in their team colour', () => {
    const f = frame([
      { team: 1, x: 40, ball: true },
      { team: 1, x: 50, type: 'PersonType.GOALKEEPER' },
    ]);
    expect(outlineOf(f, 50)).toBe(NEARBY_OUTLINE);
  });

  it('keeps a distant goalkeeper ringed in their team colour', () => {
    const f = frame([
      { team: 1, x: 0, ball: true },
      { team: 1, x: 50, type: 'PersonType.GOALKEEPER' },
    ]);
    expect(outlineOf(f, 50)).toBe(away.fill);
    expect(goalkeeper.fill).not.toBe(away.fill);
  });

  // White is the highlight now, so it cannot also be every marker's edge.
  it('outlines everyone else in a dark shade of their own colour, not white', () => {
    expect(home.outline).not.toBe(NEARBY_OUTLINE);
    expect(away.outline).not.toBe(NEARBY_OUTLINE);
  });
});

describe('goals and the goal sequence', () => {
  const at = (x: number, y: number) => worldToPx(x, y, build2DTransform(PITCH));
  const ballFrame = {
    pitch_dimensions: PITCH,
    teams: [],
    balls: [{ projected_coordinates: { x: 10, y: 4 } }],
  } as unknown as Frame;

  function render(overlay?: Parameters<ReturnType<typeof useRenderer2D>['renderFrame']>[1]) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(ballFrame, overlay);
    return ops;
  }
  const arcAt = (ops: Op[], x: number, y: number) => {
    const [px, py] = at(x, y);
    return ops.filter((o) => o.op === 'arc' && o.args[0] === px && o.args[1] === py);
  };

  it('draws both goals on every frame', () => {
    const posts = render().filter((o) => o.op === 'arc' && o.args[2] === 2.5);
    expect(posts).toHaveLength(4);
  });

  it('draws the sequence ball in place of the tracked one', () => {
    const ops = render({ ball: { x: 53, y: 1 }, trail: [], net: { side: 1, y: 1, metres: 0 } });
    expect(arcAt(ops, 53, 1)).toHaveLength(1);
    expect(arcAt(ops, 10, 4)).toHaveLength(0);
  });

  it('draws the tracked ball when there is no sequence', () => {
    expect(arcAt(render(), 10, 4)).toHaveLength(1);
  });

  it('draws a fading trail behind a fast ball', () => {
    const ops = render({
      ball: { x: 40, y: 0 },
      trail: [
        { x: 39, y: 0 },
        { x: 38, y: 0 },
      ],
      net: { side: 1, y: 0, metres: 0 },
    });
    const near = arcAt(ops, 39, 0)[0]!;
    const far = arcAt(ops, 38, 0)[0]!;
    const fillAfter = (o: Op) => ops.slice(ops.indexOf(o)).find((x) => x.op === 'fill')!;
    expect(fillAfter(near).globalAlpha).toBeGreaterThan(fillAfter(far).globalAlpha);
    expect(fillAfter(near).globalAlpha).toBeLessThan(1);
  });

  it('bows the struck net', () => {
    const curve = (ops: Op[]) =>
      ops.filter((o) => o.op === 'quadraticCurveTo' && Number(o.args[2]) > 640)[0]!.args[0];
    const still = render({ ball: { x: 54, y: 0 }, trail: [], net: { side: 1, y: 0, metres: 0 } });
    const struck = render({ ball: { x: 54, y: 0 }, trail: [], net: { side: 1, y: 0, metres: 0.5 } });
    expect(Number(curve(struck))).toBeGreaterThan(Number(curve(still)));
  });
});

describe('attack glow', () => {
  const T = build2DTransform(PITCH);
  const px = (x: number, y = 0) => worldToPx(x, y, T);
  const frame = {
    pitch_dimensions: PITCH,
    teams: [
      {
        team_id: 1,
        players: [{ track_id: 7, person_type: 'PersonType.PLAYER', projected_coordinates: { x: 5, y: 3 } }],
      },
    ],
    balls: [{ projected_coordinates: { x: 10, y: 0 } }],
  } as unknown as Frame;
  const BLUE = PERSON_COLORS.away.fill;

  function render(glow?: Parameters<ReturnType<typeof useRenderer2D>['renderFrame']>[2], overlay?: Parameters<ReturnType<typeof useRenderer2D>['renderFrame']>[1]) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(frame, overlay, glow);
    return ops;
  }
  const gradientFills = (ops: Op[]) => ops.filter((o) => o.op === 'fillRect' && o.fillStyle.startsWith('gradient('));

  it('glows from the ball to the goal line being attacked', () => {
    const ops = render({ color: BLUE, direction: 1, intensity: 1 });
    const glow = gradientFills(ops)[0]!;
    const [ballX] = px(10);
    const [lineX] = px(PITCH.length / 2);
    // fillRect(x, y, w, h): from the ball to the goal line.
    expect(glow.args[0]).toBeCloseTo(ballX, 6);
    expect(Number(glow.args[0]) + Number(glow.args[2])).toBeCloseTo(lineX, 6);
    // Clear at the ball, the team's colour at the goal.
    expect(glow.fillStyle).toMatch(new RegExp(`^gradient\\(${ballX},.*->${lineX},.*\\|0:.*,1:${BLUE.replace('#', '\\#')}`));
  });

  it('glows the other way for a team attacking the other goal', () => {
    const glow = gradientFills(render({ color: BLUE, direction: -1, intensity: 1 }))[0]!;
    const [ballX] = px(10);
    const [lineX] = px(-PITCH.length / 2);
    expect(glow.args[0]).toBeCloseTo(lineX, 6);
    expect(Number(glow.args[0]) + Number(glow.args[2])).toBeCloseTo(ballX, 6);
  });

  it('lights a bar beyond the goal under attack, outside the net', () => {
    const ops = render({ color: BLUE, direction: 1, intensity: 1 });
    const [netBackX] = px(PITCH.length / 2 + NET_DEPTH_METRES);
    const bars = ops.filter((o) => o.op === 'fillRect' && o.fillStyle === BLUE && Number(o.args[0]) > netBackX);
    expect(bars).toHaveLength(1);
  });

  it('puts a halo in the team colour around the ball', () => {
    const ops = render({ color: BLUE, direction: 1, intensity: 1 });
    const [bx, by] = px(10);
    const halo = ops.findIndex((o) => o.op === 'arc' && o.args[0] === bx && o.args[1] === by && Number(o.args[2]) > 10);
    expect(halo).toBeGreaterThanOrEqual(0);
    expect(ops.slice(halo).find((o) => o.op === 'fill')?.fillStyle).toBe(BLUE);
  });

  it('fades with its intensity', () => {
    const half = gradientFills(render({ color: BLUE, direction: 1, intensity: 0.5 }))[0]!;
    const full = gradientFills(render({ color: BLUE, direction: 1, intensity: 1 }))[0]!;
    expect(half.globalAlpha).toBeCloseTo(full.globalAlpha / 2, 6);
  });

  it('draws nothing at zero intensity, or with no glow at all', () => {
    expect(gradientFills(render({ color: BLUE, direction: 1, intensity: 0 }))).toHaveLength(0);
    expect(gradientFills(render())).toHaveLength(0);
  });

  it('lies under the players', () => {
    const ops = render({ color: BLUE, direction: 1, intensity: 1 });
    const glowAt = ops.indexOf(gradientFills(ops)[0]!);
    const [pxX, pxY] = px(5, 3);
    const playerAt = ops.findIndex((o) => o.op === 'arc' && o.args[0] === pxX && o.args[1] === pxY);
    expect(glowAt).toBeLessThan(playerAt);
  });

  // The lines must read white through the glow, as on the mockup: the glow
  // goes on the grass, and the markings over it.
  it('lies under the pitch lines, over the grass', () => {
    const ops = render({ color: BLUE, direction: 1, intensity: 1 });
    const glowAt = ops.indexOf(gradientFills(ops)[0]!);
    const grassAt = ops.findIndex((o) => o.op === 'fillRect' && o.fillStyle === PITCH_GRASS);
    const linesAt = ops.findIndex((o) => o.op === 'drawImage');
    expect(grassAt).toBeGreaterThanOrEqual(0);
    expect(grassAt).toBeLessThan(glowAt);
    expect(linesAt).toBeGreaterThan(glowAt);
  });

  /** The white chevron shapes drawn as part of the glow, as point lists. */
  function chevrons(ops: Op[]) {
    const from = ops.indexOf(gradientFills(ops)[0]!);
    const to = ops.findIndex((o) => o.op === 'drawImage');
    const shapes: Array<{ points: Array<[number, number]>; alpha: number }> = [];
    let points: Array<[number, number]> = [];
    for (const o of ops.slice(from, to)) {
      if (o.op === 'moveTo') points = [[Number(o.args[0]), Number(o.args[1])]];
      else if (o.op === 'lineTo') points.push([Number(o.args[0]), Number(o.args[1])]);
      else if (o.op === 'fill' && o.fillStyle === '#ffffff') shapes.push({ points, alpha: o.globalAlpha });
    }
    return shapes;
  }

  it('draws three chevrons pointing at the goal being attacked', () => {
    for (const direction of [1, -1] as const) {
      const shapes = chevrons(render({ color: BLUE, direction, intensity: 1 }));
      expect(shapes).toHaveLength(3);
      for (const { points } of shapes) {
        const ys = points.map(([, y]) => y);
        const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
        const xs = points.map(([x]) => x);
        // The point of the chevron sits on its middle row, furthest towards the goal.
        const tip = direction === 1 ? Math.max(...xs) : Math.min(...xs);
        expect(points.some(([x, y]) => x === tip && Math.abs(y - mid) < 1e-6)).toBe(true);
      }
    }
  });

  it('centres the chevrons between the ball and the goal line', () => {
    const shapes = chevrons(render({ color: BLUE, direction: 1, intensity: 1 }));
    const xs = shapes.flatMap((c) => c.points.map(([x]) => x));
    const [ballX] = px(10);
    const [lineX] = px(PITCH.length / 2);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo((ballX + lineX) / 2, 6);
  });

  it('fades the chevrons with the glow', () => {
    const full = chevrons(render({ color: BLUE, direction: 1, intensity: 1 }))[0]!.alpha;
    const half = chevrons(render({ color: BLUE, direction: 1, intensity: 0.5 }))[0]!.alpha;
    expect(half).toBeCloseTo(full / 2, 6);
  });

  it('starts from the goal-sequence ball while that plays', () => {
    const glow = gradientFills(
      render({ color: BLUE, direction: 1, intensity: 1 }, { ball: { x: 30, y: 0 }, trail: [], net: { side: 1, y: 0, metres: 0 } })
    )[0]!;
    expect(glow.args[0]).toBeCloseTo(px(30)[0], 6);
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
