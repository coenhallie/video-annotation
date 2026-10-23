import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  nearbyTrackIds,
  possessionTrackIds,
  useRenderer2D,
  type GoalOverlay,
} from '@/lib/vis/useRenderer2D';
import type { AttackGlow } from '@/lib/vis/attackGlow';
import type { Frame } from '@/lib/vis/types';
import {
  THROW_IN_PULSE_COLOR,
  PERSON_COLORS,
  DIMMED_PLAYER_ALPHA,
  NEARBY_OUTLINE,
  PLAYER_RADIUS,
  BALL_RADIUS,
  CARRIER_GROWTH,
} from '@/lib/vis/constants';
import { build2DTransform, worldToPx, PITCH_GRASS } from '@/lib/vis/pitchGeometry';
import { NET_DEPTH_METRES } from '@/lib/vis/goalSequence';
import { trailOpacity } from '@/lib/vis/ballTrail';
import { UPRIGHT, footballPatches, rolled } from '@/lib/vis/football';
import { fakeCanvas, stubOffscreenCanvas, type Op } from './recordingCtx';

const PITCH = { length: 105, width: 68 };

/** A player's circle at (px, py): at its own size, or grown with the ball. */
const isPlayerCircle = (o: Op, px: number, py: number) =>
  o.op === 'arc' &&
  o.args[0] === px &&
  o.args[1] === py &&
  Number(o.args[2]) >= PLAYER_RADIUS &&
  Number(o.args[2]) <= PLAYER_RADIUS * (1 + CARRIER_GROWTH);

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
      (o) => isPlayerCircle(o, px, py)
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

  function render(frame: Frame, overlay?: GoalOverlay | undefined) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(frame, { goal: overlay });
    return ops;
  }

  /** The circle fill of the person standing at (x, y). */
  function fillAt(ops: Op[], x: number, y = 0): Op | undefined {
    const [px, py] = worldToPx(x, y, build2DTransform(PITCH));
    const at = ops.findIndex(
      (o) => isPlayerCircle(o, px, py)
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

  it('draws far players solid when the fade is switched off', () => {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(match([{ team: 0, x: 30 }]), { fadeFar: false });
    expect(fillAt(ops, 30)?.globalAlpha).toBe(1);
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

describe('player labels', () => {
  const withBall = (inPossession: boolean) =>
    frameWith({
      players: [
        {
          track_id: 7,
          person_type: 'PersonType.PLAYER',
          projected_coordinates: { x: 0, y: 0 },
          player_number: 9,
          in_possession: inPossession,
        },
      ],
    });
  const labels = (frame: Frame, rings?: { possession: Map<number, number> }) => {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(
      frame,
      rings ? { rings: { nearby: new Map(), possession: rings.possession } } : {},
    );
    return ops.filter((o) => o.op === 'fillText');
  };

  it('draws the shirt number of the player with the ball, and not the tracking id', () => {
    expect(labels(withBall(true)).map((o) => o.args[0])).toEqual(['9']);
  });

  it('draws no number on a player without the ball', () => {
    expect(labels(withBall(false))).toEqual([]);
    expect(labels(frameWith({}))).toEqual([]);
  });

  it('fades the number in and out with the possession ring', () => {
    const half = labels(withBall(false), { possession: new Map([[7, 0.5]]) });
    expect(half.map((o) => [o.args[0], o.globalAlpha])).toEqual([['9', 0.5]]);
    expect(labels(withBall(true), { possession: new Map() })).toEqual([]);
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
      (o) => isPlayerCircle(o, px, py)
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

  /** Every stroke drawn around the marker at (x, y), in order, with its opacity. */
  function strokesOf(f: Frame, nearby: ReadonlyMap<number, number>, x: number, y = 0) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(f, { rings: { nearby, possession: new Map() } });
    const [px, py] = worldToPx(x, y, build2DTransform(PITCH));
    const at = ops.findIndex(
      (o) => isPlayerCircle(o, px, py)
    );
    // Up to the next marker drawn (its shadow comes first), whoever's it is.
    const end = ops.findIndex(
      (o, i) => i > at && o.op === 'arc' && o.args[0] !== px && isPlayerCircle(o, Number(o.args[0]), Number(o.args[1]))
    );
    return ops
      .slice(at, end === -1 ? undefined : end)
      .filter((o) => o.op === 'stroke' && o.strokeStyle !== '#ffd700')
      .map((o) => ({ color: o.strokeStyle, alpha: o.globalAlpha }));
  }

  // Track ids are 1, 2, ... in the order the people are listed.
  it('lays a ring that is fading in over the usual outline, at its strength', () => {
    const f = frame([{ team: 0, x: 0, ball: true }, { team: 0, x: 14 }]);
    expect(strokesOf(f, new Map([[2, 0.4]]), 14)).toEqual([
      { color: home.outline, alpha: 1 },
      { color: NEARBY_OUTLINE, alpha: 0.4 },
    ]);
  });

  it('draws a ring at full strength in white alone', () => {
    const f = frame([{ team: 0, x: 0, ball: true }, { team: 0, x: 14 }]);
    expect(strokesOf(f, new Map([[2, 1]]), 14)).toEqual([{ color: NEARBY_OUTLINE, alpha: 1 }]);
  });

  // The strengths say who is ringed: one fading out is still drawn after the
  // player has left the area, and one not yet faded in is not drawn at all.
  it('follows the strengths it is given rather than the frame', () => {
    const f = frame([{ team: 0, x: 0, ball: true }, { team: 0, x: 14 }, { team: 0, x: 30 }]);
    expect(strokesOf(f, new Map([[3, 0.5]]), 30)).toEqual([
      { color: home.outline, alpha: 1 },
      { color: NEARBY_OUTLINE, alpha: 0.5 },
    ]);
    expect(strokesOf(f, new Map(), 14)).toEqual([{ color: home.outline, alpha: 1 }]);
  });

  it('fades a ring with its player', () => {
    // Far from the ball, so the marker itself is faded.
    const f = { ...frame([{ team: 0, x: 0, ball: true }, { team: 0, x: 30 }]), balls: [{ projected_coordinates: { x: 0, y: 0 } }] } as Frame;
    const strokes = strokesOf(f, new Map([[2, 0.5]]), 30);
    expect(strokes[1]!.alpha).toBeCloseTo(DIMMED_PLAYER_ALPHA * 0.5, 6);
  });

  it('names the players near the ball carrier by track id', () => {
    const f = frame([
      { team: 0, x: 0, ball: true },
      { team: 0, x: 14 },
      { team: 0, x: 16 },
      { team: 1, x: 3 },
    ]);
    expect([...nearbyTrackIds(f)].sort()).toEqual([1, 2]);
    expect(nearbyTrackIds(frame([{ team: 0, x: 0 }, { team: 0, x: 5 }])).size).toBe(0);
  });

  /** The gold possession ring drawn around the marker at (x, y), if any. */
  function possessionRingOf(f: Frame, possession: ReadonlyMap<number, number> | null, x: number) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(
      f,
      possession ? { rings: { nearby: new Map(), possession } } : {}
    );
    const [px, py] = worldToPx(x, 0, build2DTransform(PITCH));
    // The ring is 4 px out from the circle, at whatever size it is drawn.
    const at = ops.findIndex(
      (o) =>
        o.op === 'arc' &&
        o.args[0] === px &&
        o.args[1] === py &&
        Number(o.args[2]) >= PLAYER_RADIUS + 4 &&
        Number(o.args[2]) <= PLAYER_RADIUS * (1 + CARRIER_GROWTH) + 4
    );
    if (at === -1) return null;
    const stroke = ops.slice(at).find((o) => o.op === 'stroke');
    return stroke?.strokeStyle === '#ffd700' ? { alpha: stroke.globalAlpha } : null;
  }

  it('draws the possession ring on the carrier at once without strengths', () => {
    const f = frame([{ team: 0, x: 0, ball: true }, { team: 0, x: 14 }]);
    expect(possessionRingOf(f, null, 0)).toEqual({ alpha: 1 });
    expect(possessionRingOf(f, null, 14)).toBeNull();
  });

  // As with the white rings, the strengths say who has one: a ring fading out
  // after the ball has gone, and none yet on a player who has just got it.
  it('draws the possession ring at the strength it is given', () => {
    const f = frame([{ team: 0, x: 0, ball: true }, { team: 0, x: 14 }]);
    expect(possessionRingOf(f, new Map([[1, 0.5]]), 0)).toEqual({ alpha: 0.5 });
    expect(possessionRingOf(f, new Map([[2, 0.3]]), 14)).toEqual({ alpha: 0.3 });
    expect(possessionRingOf(f, new Map(), 0)).toBeNull();
  });

  it('names the players with the ball by track id', () => {
    const f = frame([{ team: 0, x: 0, ball: true }, { team: 0, x: 14 }, { team: 1, x: 3 }]);
    expect([...possessionTrackIds(f)]).toEqual([1]);
    expect(possessionTrackIds(frame([{ team: 0, x: 0 }])).size).toBe(0);
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

  function render(overlay?: GoalOverlay | undefined) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(ballFrame, { goal: overlay });
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
    expect(arcAt(ops, 53, 1)).not.toHaveLength(0);
    expect(arcAt(ops, 10, 4)).toHaveLength(0);
  });

  it('draws the tracked ball when there is no sequence', () => {
    expect(arcAt(render(), 10, 4)).not.toHaveLength(0);
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

describe('ball trail', () => {
  const at = (x: number, y: number) => worldToPx(x, y, build2DTransform(PITCH));
  const frame = {
    pitch_dimensions: PITCH,
    teams: [
      {
        team_id: 0,
        players: [{ track_id: 7, person_type: 'PersonType.PLAYER', projected_coordinates: { x: 12, y: 4 } }],
      },
    ],
    balls: [{ projected_coordinates: { x: 10, y: 4 } }],
  } as unknown as Frame;
  // Along x to a turn at (0, 2), then on to the ball.
  const run = [
    { x: -10, y: 2, age: 2.75 },
    { x: -5, y: 2, age: 1.5 },
    { x: 0, y: 2, age: 1 },
    { x: 5, y: 3, age: 0.5 },
    { x: 10, y: 4, age: 0 },
  ];
  const trail = { runs: [run], turns: [run[2]!] };

  function render(layers: Parameters<ReturnType<typeof useRenderer2D>['renderFrame']>[1], f = frame) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(f, layers);
    return ops;
  }
  const white = (o: Op) => o.strokeStyle.startsWith('rgba(255,255,255,');
  const trailStrokes = (ops: Op[]) => ops.filter((o) => o.op === 'stroke' && white(o));
  // The points each trail stroke was drawn through: its style is set after them.
  const lineTos = (ops: Op[]) =>
    trailStrokes(ops).flatMap((stroke) => {
      const end = ops.indexOf(stroke);
      const start = ops.slice(0, end).findLastIndex((o) => o.op === 'stroke' || o.op === 'fill') + 1;
      return ops.slice(start, end).filter((o) => o.op === 'lineTo');
    });
  const dotsAt = (ops: Op[], x: number, y: number) => {
    const [px, py] = at(x, y);
    return ops.filter((o) => o.op === 'arc' && o.args[0] === px && o.args[1] === py && o.args[2] === 2.5);
  };

  it('draws the path through every point, each stretch as strong as its newer end', () => {
    const ops = render({ trail });
    expect(lineTos(ops).map((o) => o.args)).toEqual(run.slice(1).map((p) => at(p.x, p.y)));
    const alphas = trailStrokes(ops).map((o) => Number(/,([\d.]+)\)$/.exec(o.strokeStyle)![1]));
    expect(alphas).toEqual(
      run.slice(1).map((p) => Math.round(trailOpacity(p.age) * 40) / 40),
    );
  });

  it('draws stretches of the same strength as one stroke, joined round', () => {
    const even = [0, 1, 2, 3].map((i) => ({ x: i, y: 0, age: 0 }));
    const ops = render({ trail: { runs: [even], turns: [] } });
    expect(trailStrokes(ops)).toHaveLength(1);
    expect(lineTos(ops)).toHaveLength(3);
  });

  it('leaves out what has faded away entirely', () => {
    const old = [
      { x: -10, y: 2, age: 3.5 },
      { x: -5, y: 2, age: 3.25 },
      { x: 0, y: 2, age: 0.5 },
    ];
    expect(trailStrokes(render({ trail: { runs: [old], turns: [] } }))).toHaveLength(1);
  });

  it('marks each turn with a dot over the path, as strong as the path there', () => {
    const ops = render({ trail });
    const [dot] = dotsAt(ops, 0, 2);
    expect(dot).toBeDefined();
    expect(ops.indexOf(dot!)).toBeGreaterThan(ops.lastIndexOf(trailStrokes(ops).at(-1)!));
    const fill = ops.slice(ops.indexOf(dot!)).find((o) => o.op === 'fill')!;
    expect(fill.globalAlpha).toBeCloseTo(trailOpacity(1));
    expect(dotsAt(ops, -10, 2)).toHaveLength(0);
  });

  it('draws each run apart, with nothing across the gap between them', () => {
    const ops = render({ trail: { runs: [run.slice(0, 2), run.slice(3)], turns: [] } });
    expect(lineTos(ops).map((o) => o.args)).toEqual([at(-5, 2), at(10, 4)]);
  });

  it('draws it over the players and under the ball', () => {
    const ops = render({ trail });
    const line = ops.indexOf(trailStrokes(ops)[0]!);
    const [px, py] = at(12, 4);
    const [bx, by] = at(10, 4);
    const player = ops.findIndex((o) => o.op === 'arc' && o.args[0] === px && o.args[1] === py);
    const ball = ops.findIndex((o) => o.op === 'arc' && o.args[0] === bx && o.args[1] === by && o.args[2] !== 2.5);
    expect(player).toBeLessThan(line);
    expect(line).toBeLessThan(ball);
  });

  it('draws the number of the player with the ball over it, so the path ending there does not hide it', () => {
    const carrying = {
      ...frame,
      teams: [
        {
          team_id: 0,
          players: [
            {
              track_id: 7,
              person_type: 'PersonType.PLAYER',
              projected_coordinates: { x: 10, y: 4 },
              player_number: 25,
              in_possession: true,
            },
          ],
        },
      ],
    } as unknown as Frame;
    const ops = render({ trail }, carrying);
    const number = ops.findIndex((o) => o.op === 'fillText' && o.args[0] === '25');
    const [bx, by] = at(10, 4);
    const ball = ops.findIndex((o) => o.op === 'arc' && o.args[0] === bx && o.args[1] === by && Number(o.args[2]) < PLAYER_RADIUS);
    expect(number).toBeGreaterThan(ops.lastIndexOf(trailStrokes(ops).at(-1)!));
    expect(number).toBeLessThan(ball);
  });

  it('draws none while the goal sequence plays, or when not given one', () => {
    const goal = { ball: { x: 53, y: 1 }, trail: [], net: { side: 1 as const, y: 1, metres: 0 } };
    expect(trailStrokes(render({ trail, goal }))).toHaveLength(0);
    expect(trailStrokes(render({}))).toHaveLength(0);
  });
});

describe('attack glow', () => {
  const T = build2DTransform(PITCH);
  const px = (x: number, y = 0) => worldToPx(x, y, T);
  const player = (track_id: number, x: number, type = 'PersonType.PLAYER') => ({
    track_id,
    person_type: type,
    projected_coordinates: { x, y: 3 },
  });
  // Blue (team 1) has players at x = 5 and x = 20; Red's player and the
  // official stand further up the pitch, and must not count.
  const frame = {
    pitch_dimensions: PITCH,
    teams: [
      { team_id: -1, players: [player(1, 45, 'PersonType.OFFICIAL')] },
      { team_id: 0, players: [player(2, 40)] },
      { team_id: 1, players: [player(7, 5), player(8, 20)] },
    ],
    balls: [{ projected_coordinates: { x: 10, y: 0 } }],
  } as unknown as Frame;
  const BLUE = PERSON_COLORS.away.fill;
  const [lineLeft] = px(-PITCH.length / 2);
  const [lineRight] = px(PITCH.length / 2);

  function render(glow?: AttackGlow | undefined, overlay?: GoalOverlay | undefined, f: Frame = frame) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(f, { goal: overlay, glow });
    return ops;
  }
  /** The shaded attack area: a fill in the team colour inside the goal lines. */
  const areaFills = (ops: Op[]) =>
    ops.filter(
      (o) =>
        o.op === 'fillRect' &&
        o.fillStyle === BLUE &&
        Number(o.args[0]) >= lineLeft - 1e-6 &&
        Number(o.args[0]) + Number(o.args[2]) <= lineRight + 1e-6
    );

  it('shades from the most advanced attacker to the goal line being attacked', () => {
    const area = areaFills(render({ color: BLUE, team: 1, direction: 1, intensity: 1 }))[0]!;
    // fillRect(x, y, w, h): from Blue's player at x = 20 to the goal line.
    expect(area.args[0]).toBeCloseTo(px(20)[0], 6);
    expect(Number(area.args[0]) + Number(area.args[2])).toBeCloseTo(lineRight, 6);
  });

  it('shades the other way for a team attacking the other goal', () => {
    // Attacking toward -x, Blue's most advanced player is the one at x = 5.
    const area = areaFills(render({ color: BLUE, team: 1, direction: -1, intensity: 1 }))[0]!;
    expect(area.args[0]).toBeCloseTo(lineLeft, 6);
    expect(Number(area.args[0]) + Number(area.args[2])).toBeCloseTo(px(5)[0], 6);
  });

  it('is one solid colour rather than fading out', () => {
    const ops = render({ color: BLUE, team: 1, direction: 1, intensity: 1 });
    expect(areaFills(ops)).toHaveLength(1);
    expect(ops.some((o) => o.op === 'fillRect' && o.fillStyle.startsWith('gradient('))).toBe(false);
  });

  it('follows the attackers, not the ball', () => {
    const at = (ballX: number) =>
      areaFills(
        render({ color: BLUE, team: 1, direction: 1, intensity: 1 }, undefined, {
          ...frame,
          balls: [{ projected_coordinates: { x: ballX, y: 0 } }],
        } as Frame)
      )[0]!.args;
    expect(at(-30)).toEqual(at(10));
  });

  it('starts from the ball when no attacker is tracked', () => {
    const noBlue = { ...frame, teams: frame.teams!.filter((t) => t.team_id !== 1) } as Frame;
    const area = areaFills(render({ color: BLUE, team: 1, direction: 1, intensity: 1 }, undefined, noBlue))[0]!;
    expect(area.args[0]).toBeCloseTo(px(10)[0], 6);
  });

  it('lights a bar beyond the goal under attack, outside the net', () => {
    const ops = render({ color: BLUE, team: 1, direction: 1, intensity: 1 });
    const [netBackX] = px(PITCH.length / 2 + NET_DEPTH_METRES);
    const bars = ops.filter((o) => o.op === 'fillRect' && o.fillStyle === BLUE && Number(o.args[0]) > netBackX);
    expect(bars).toHaveLength(1);
  });

  it('puts a halo in the team colour around the ball', () => {
    const ops = render({ color: BLUE, team: 1, direction: 1, intensity: 1 });
    const [bx, by] = px(10);
    const halo = ops.findIndex((o) => o.op === 'arc' && o.args[0] === bx && o.args[1] === by && Number(o.args[2]) > PLAYER_RADIUS);
    expect(halo).toBeGreaterThanOrEqual(0);
    expect(ops.slice(halo).find((o) => o.op === 'fill')?.fillStyle).toBe(BLUE);
  });

  it('fades with its intensity', () => {
    const half = areaFills(render({ color: BLUE, team: 1, direction: 1, intensity: 0.5 }))[0]!;
    const full = areaFills(render({ color: BLUE, team: 1, direction: 1, intensity: 1 }))[0]!;
    expect(half.globalAlpha).toBeCloseTo(full.globalAlpha / 2, 6);
  });

  it('draws nothing at zero intensity, or with no glow at all', () => {
    expect(areaFills(render({ color: BLUE, team: 1, direction: 1, intensity: 0 }))).toHaveLength(0);
    expect(areaFills(render())).toHaveLength(0);
  });

  it('lies under the players', () => {
    const ops = render({ color: BLUE, team: 1, direction: 1, intensity: 1 });
    const areaAt = ops.indexOf(areaFills(ops)[0]!);
    const [pxX, pxY] = px(5, 3);
    const playerAt = ops.findIndex((o) => o.op === 'arc' && o.args[0] === pxX && o.args[1] === pxY);
    expect(areaAt).toBeLessThan(playerAt);
  });

  // The lines must read white through the glow, as on the mockup: the glow
  // goes on the grass, and the markings over it.
  it('lies under the pitch lines, over the grass', () => {
    const ops = render({ color: BLUE, team: 1, direction: 1, intensity: 1 });
    const areaAt = ops.indexOf(areaFills(ops)[0]!);
    const grassAt = ops.findIndex((o) => o.op === 'fillRect' && o.fillStyle === PITCH_GRASS);
    const linesAt = ops.findIndex((o) => o.op === 'drawImage');
    expect(grassAt).toBeGreaterThanOrEqual(0);
    expect(grassAt).toBeLessThan(areaAt);
    expect(linesAt).toBeGreaterThan(areaAt);
  });

  /** The white chevron shapes drawn as part of the glow, as point lists. */
  function chevrons(ops: Op[]) {
    const from = ops.indexOf(areaFills(ops)[0]!);
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

  function renderWithBall(ballX: number, glow: AttackGlow | undefined) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(
      { ...frame, balls: [{ projected_coordinates: { x: ballX, y: 0 } }] } as Frame,
      { glow }
    );
    return ops;
  }
  const centreX = (c: { points: Array<[number, number]> }) => {
    const xs = c.points.map(([x]) => x);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  };

  // The layers menu can hide the shading and the arrows separately.
  it('draws only the arrows when the shading is switched off', () => {
    const ops = render({ color: BLUE, team: 1, direction: 1, intensity: 1, flow: 0.5, shading: false });
    expect(areaFills(ops)).toHaveLength(0);
    expect(ops.some((o) => o.op === 'fillRect' && o.fillStyle === BLUE)).toBe(false);
    // No halo: the team's players are blue too, so look for the halo's arc,
    // bigger round the ball than the ball or any player.
    const [bx, by] = px(10);
    expect(ops.some((o) => o.op === 'arc' && o.args[0] === bx && o.args[1] === by && Number(o.args[2]) > PLAYER_RADIUS)).toBe(false);
    expect(ops.filter((o) => o.op === 'fill' && o.fillStyle === '#ffffff').length).toBeGreaterThanOrEqual(3);
  });

  it('draws only the shading when the arrows are switched off', () => {
    const ops = render({ color: BLUE, team: 1, direction: 1, intensity: 1, flow: 0.5, arrows: false });
    expect(areaFills(ops)).toHaveLength(1);
    const from = ops.indexOf(areaFills(ops)[0]!);
    const to = ops.findIndex((o) => o.op === 'drawImage');
    expect(ops.slice(from, to).some((o) => o.op === 'fill' && o.fillStyle === '#ffffff')).toBe(false);
  });

  it('draws chevrons pointing at the goal being attacked', () => {
    for (const direction of [1, -1] as const) {
      const shapes = chevrons(render({ color: BLUE, team: 1, direction, intensity: 1, flow: 0.5 }));
      expect(shapes.length).toBeGreaterThanOrEqual(3);
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

  // The stagger: centred on the ball, the arrow moved with every jitter and
  // pass of the tracked ball.
  it('keeps the chevrons where they are however the ball moves', () => {
    const glow = { color: BLUE, team: 1 as const, direction: 1 as const, intensity: 1, flow: 0.3 };
    const at10 = chevrons(renderWithBall(10, glow));
    expect(chevrons(renderWithBall(30, glow))).toEqual(at10);
    expect(chevrons(renderWithBall(-20, glow))).toEqual(at10);
  });

  it('centres the stream of chevrons on the half being attacked', () => {
    for (const direction of [1, -1] as const) {
      const shapes = chevrons(render({ color: BLUE, team: 1, direction, intensity: 1, flow: 0.5 }));
      const mean = shapes.reduce((sum, c) => sum + centreX(c), 0) / shapes.length;
      expect(mean).toBeCloseTo(px((direction * PITCH.length) / 4)[0], 6);
    }
  });

  it('moves the chevrons toward the goal as the flow advances', () => {
    for (const direction of [1, -1] as const) {
      const a = chevrons(render({ color: BLUE, team: 1, direction, intensity: 1, flow: 0.2 }));
      const b = chevrons(render({ color: BLUE, team: 1, direction, intensity: 1, flow: 0.3 }));
      expect(b).toHaveLength(a.length);
      a.forEach((c, i) => {
        const moved = centreX(b[i]!) - centreX(c);
        expect(Math.sign(moved)).toBe(direction);
        expect(Math.abs(moved)).toBeGreaterThan(0);
      });
    }
  });

  // One flow cycle must end exactly where the next begins, or the stream
  // would visibly jump once a cycle.
  it('loops without a jump', () => {
    const start = chevrons(render({ color: BLUE, team: 1, direction: 1, intensity: 1, flow: 0 }));
    const end = chevrons(render({ color: BLUE, team: 1, direction: 1, intensity: 1, flow: 0.9999 }));
    const visible = (cs: typeof start) => cs.filter((c) => c.alpha > 0.01);
    expect(visible(end)).toHaveLength(visible(start).length);
    visible(start).forEach((c) => {
      expect(
        visible(end).some((e) => Math.abs(centreX(e) - centreX(c)) < 0.1 && Math.abs(e.alpha - c.alpha) < 0.01)
      ).toBe(true);
    });
  });

  it('fades the chevrons in as they enter and out as they leave', () => {
    const shapes = chevrons(render({ color: BLUE, team: 1, direction: 1, intensity: 1, flow: 0.5 }));
    const alphas = shapes.map((c) => c.alpha);
    expect(Math.min(alphas[0]!, alphas.at(-1)!)).toBeLessThan(Math.max(...alphas));
  });

  it('fades the chevrons with the glow', () => {
    const full = chevrons(render({ color: BLUE, team: 1, direction: 1, intensity: 1, flow: 0.5 }))[1]!.alpha;
    const half = chevrons(render({ color: BLUE, team: 1, direction: 1, intensity: 0.5, flow: 0.5 }))[1]!.alpha;
    expect(half).toBeCloseTo(full / 2, 6);
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

describe('throw-in pulse', () => {
  const T = build2DTransform(PITCH);
  const frame = {
    pitch_dimensions: PITCH,
    teams: [],
    balls: [{ projected_coordinates: { x: 10, y: -30 } }],
  } as unknown as Frame;

  /** The pulse rings drawn: arcs stroked in the pulse colour, after the ball. */
  function pulses(ballPulse?: { x: number; y: number; phase: number }) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(frame, ballPulse ? { ballPulse } : {});
    const rings: Array<{ x: number; y: number; r: number; alpha: number }> = [];
    let arc: Op | null = null;
    for (const o of ops) {
      if (o.op === 'arc') arc = o;
      else if (o.op === 'stroke' && o.strokeStyle === THROW_IN_PULSE_COLOR && arc) {
        rings.push({
          x: Number(arc.args[0]),
          y: Number(arc.args[1]),
          r: Number(arc.args[2]),
          alpha: o.globalAlpha,
        });
      }
    }
    return rings;
  }

  it('draws nothing without a pulse', () => {
    expect(pulses()).toHaveLength(0);
  });

  it('rings the point it is given', () => {
    const [px, py] = worldToPx(10, -30, T);
    const [ring] = pulses({ x: 10, y: -30, phase: 0.3 });
    expect(ring).toMatchObject({ x: px, y: py });
  });

  // A ring that grows out from the ball and fades as it goes: the pulse.
  it('grows and fades as the pulse runs', () => {
    const early = pulses({ x: 10, y: -30, phase: 0.1 })[0]!;
    const late = pulses({ x: 10, y: -30, phase: 0.8 })[0]!;
    expect(late.r).toBeGreaterThan(early.r);
    expect(late.alpha).toBeLessThan(early.alpha);
  });

  it('starts each pulse where the last one ended without a jump', () => {
    const start = pulses({ x: 10, y: -30, phase: 0 })[0]!;
    const end = pulses({ x: 10, y: -30, phase: 0.9999 })[0];
    // Fully faded at the end of one pulse, so the next starting small is not seen to jump.
    expect(end === undefined || end.alpha < 0.01).toBe(true);
    expect(start.alpha).toBeGreaterThan(0.5);
  });
});

describe('the player with the ball', () => {
  const T = build2DTransform(PITCH);
  const player = (track_id: number, x: number, ball = false) => ({
    track_id,
    person_type: 'PersonType.PLAYER',
    projected_coordinates: { x, y: 0 },
    player_number: track_id,
    in_possession: ball,
  });
  // Track 1 has the ball at x = 0; track 2 stands beside them at x = 1.
  const frame = {
    pitch_dimensions: PITCH,
    teams: [{ team_id: 0, players: [player(1, 0, true), player(2, 1)] }],
    balls: [],
  } as unknown as Frame;

  function render(possession?: Map<number, number>) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(
      frame,
      possession ? { rings: { nearby: new Map(), possession } } : {},
    );
    return ops;
  }
  /** The radius of the circle of the person at x, and where it was drawn. */
  const circleAt = (ops: Op[], x: number) => {
    const [px, py] = worldToPx(x, 0, T);
    const at = ops.findIndex((o) => isPlayerCircle(o, px, py));
    return { at, radius: Number(ops[at]?.args[2]) };
  };
  const goldRing = (ops: Op[]) => {
    const stroke = ops.findIndex((o) => o.op === 'stroke' && o.strokeStyle === '#ffd700');
    return Number(ops.slice(0, stroke).findLast((o) => o.op === 'arc')?.args[2]);
  };

  it('is drawn a quarter bigger, with the gold ring around the bigger circle', () => {
    const ops = render();
    const grown = PLAYER_RADIUS * (1 + CARRIER_GROWTH);
    expect(circleAt(ops, 0).radius).toBeCloseTo(grown);
    expect(circleAt(ops, 1).radius).toBe(PLAYER_RADIUS);
    expect(goldRing(ops)).toBeCloseTo(grown + 4);
  });

  it('grows with the possession ring as it fades in, easing in and out of it', () => {
    const sizes = [0, 0.1, 0.5, 0.9, 1].map((k) => circleAt(render(new Map([[1, k]])), 0).radius);
    expect(sizes[0]).toBe(PLAYER_RADIUS);
    expect(sizes[2]).toBeCloseTo(PLAYER_RADIUS * (1 + CARRIER_GROWTH / 2));
    expect(sizes[4]).toBeCloseTo(PLAYER_RADIUS * (1 + CARRIER_GROWTH));
    // Slow at either end, so it does not start or stop with a jolt.
    expect(sizes[1]! - sizes[0]!).toBeLessThan((sizes[2]! - sizes[0]!) / 5);
    expect(sizes[4]! - sizes[3]!).toBeLessThan((sizes[4]! - sizes[2]!) / 5);
  });

  it('is drawn over the players around them, so its bigger circle is not covered', () => {
    const ops = render();
    expect(circleAt(ops, 0).at).toBeGreaterThan(circleAt(ops, 1).at);
  });
});

describe('the ball', () => {
  const T = build2DTransform(PITCH);
  const ballAt = (z = 0) =>
    ({
      pitch_dimensions: PITCH,
      teams: [],
      balls: [{ projected_coordinates: { x: 10, y: 4, z } }],
    }) as unknown as Frame;
  const [bx, by] = worldToPx(10, 4, T);

  function render(frame: Frame, layers: Parameters<ReturnType<typeof useRenderer2D>['renderFrame']>[1] = {}) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(frame, layers);
    return ops;
  }
  const disc = (ops: Op[]) =>
    ops.find((o) => o.op === 'arc' && o.args[0] === bx && o.args[1] === by && o.op === 'arc');
  /** The black patches drawn on the ball: each a filled outline. */
  const patches = (ops: Op[]) => {
    const from = ops.findIndex((o) => o.op === 'clip');
    return ops.slice(from).filter((o) => o.op === 'fill' && o.fillStyle === '#1a1a1a');
  };

  it('is a white football with black patches, kept inside its outline', () => {
    const ops = render(ballAt());
    expect(disc(ops)?.args[2]).toBe(BALL_RADIUS);
    expect(ops.find((o, i) => i > ops.indexOf(disc(ops)!) && o.op === 'fill')?.fillStyle).toBe('#ffffff');
    expect(ops.some((o) => o.op === 'clip')).toBe(true);
    expect(patches(ops)).toHaveLength(footballPatches(UPRIGHT).length);
  });

  it('draws its patches where the spin it is given has turned them', () => {
    const spin = rolled(rolled(UPRIGHT, 3, 1, BALL_RADIUS), 3, 1, BALL_RADIUS);
    const lines = (ops: Op[]) => ops.filter((o) => o.op === 'lineTo' || o.op === 'moveTo').map((o) => o.args);
    const [first] = footballPatches(spin);
    const turned = render(ballAt(), { ballSpin: spin });
    expect(lines(turned)).toContainEqual([bx + first![0]![0] * BALL_RADIUS, by + first![0]![1] * BALL_RADIUS]);
    expect(lines(turned)).not.toEqual(lines(render(ballAt())));
  });

  it('is still drawn bigger and tinted the higher it is in the air', () => {
    const ops = render(ballAt(4));
    const r = Number(disc(ops)?.args[2]);
    expect(r).toBeGreaterThan(BALL_RADIUS);
    expect(r).toBeLessThan(PLAYER_RADIUS);
    expect(ops.find((o, i) => i > ops.indexOf(disc(ops)!) && o.op === 'fill')?.fillStyle).toBe('#c8ffff');
  });
});

describe('the player who has just received the ball', () => {
  const T = build2DTransform(PITCH);
  // Track 1 has the ball, which is on their circle.
  const frame = {
    pitch_dimensions: PITCH,
    teams: [
      {
        team_id: 0,
        players: [
          {
            track_id: 1,
            person_type: 'PersonType.PLAYER',
            projected_coordinates: { x: 0, y: 0 },
            player_number: 10,
            in_possession: true,
          },
        ],
      },
    ],
    balls: [{ projected_coordinates: { x: 0.3, y: 0 } }],
  } as unknown as Frame;
  const [cx, cy] = worldToPx(0, 0, T);

  function render(received?: Map<number, number>) {
    const { canvas, ops } = fakeCanvas();
    useRenderer2D(canvas).renderFrame(frame, received ? { received } : {});
    // Everything drawn after the ball: its patches are clipped to it.
    const ball = ops.findIndex((o) => o.op === 'clip');
    return ops.slice(ops.slice(ball).findIndex((o) => o.op === 'restore') + ball);
  }
  const circleOver = (after: Op[]) => {
    const at = after.findIndex((o) => isPlayerCircle(o, cx, cy));
    return at < 0 ? undefined : after.slice(at).find((o) => o.op === 'fill');
  };

  it('covers the ball with their circle and number, so the number shows', () => {
    const after = render(new Map([[1, 1]]));
    expect(circleOver(after)?.fillStyle).toBe(PERSON_COLORS.home.fill);
    expect(circleOver(after)?.globalAlpha).toBe(1);
    expect(after.filter((o) => o.op === 'fillText').map((o) => o.args[0])).toEqual(['10']);
  });

  it('fades the cover out at the strength it is given, to show the ball again', () => {
    const after = render(new Map([[1, 0.4]]));
    expect(circleOver(after)?.globalAlpha).toBeCloseTo(0.4);
    expect(after.find((o) => o.op === 'fillText')?.globalAlpha).toBeCloseTo(0.4);
  });

  it('draws nothing over the ball otherwise', () => {
    expect(circleOver(render())).toBeUndefined();
    expect(circleOver(render(new Map()))).toBeUndefined();
  });
});
