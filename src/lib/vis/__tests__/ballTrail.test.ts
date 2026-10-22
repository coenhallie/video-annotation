import { describe, it, expect } from 'vitest';
import {
  ballTrailAt,
  sameTrail,
  RELEASE_METRES,
  TRAIL_FADE_S,
  TRAIL_HISTORY_S,
  TRAIL_HOLD_S,
  TRAIL_LOOKBACK_S,
} from '@/lib/vis/ballTrail';
import type { Frame } from '@/lib/vis/types';
import type { PhaseRecord } from '@/lib/vis/teamPhase';

const DT = 0.04;

interface Person {
  team: number;
  id: number | null;
  x: number;
  y?: number;
  ball?: boolean;
}

function frame(people: Person[], ball: { x: number; y: number } | null): Frame {
  const teams = [-1, 0, 1].map((team_id) => ({
    team_id,
    players: people
      .filter((p) => p.team === team_id)
      .map((p) => ({
        track_id: p.id,
        person_type: team_id === -1 ? 'PersonType.OFFICIAL' : 'PersonType.PLAYER',
        projected_coordinates: { x: p.x, y: p.y ?? 0 },
        in_possession: Boolean(p.ball),
      })),
  }));
  return {
    pitch_dimensions: { length: 105, width: 68 },
    teams,
    balls: ball ? [{ projected_coordinates: { ...ball, z: 0 } }] : [],
  } as unknown as Frame;
}

/** One record per step, DT apart, from `make(i)`. */
function play(steps: number, make: (i: number) => Frame): PhaseRecord[] {
  return Array.from({ length: steps }, (_, i) => ({ t: 1000 + i * DT, frame: make(i) }));
}

const last = (records: PhaseRecord[]) => ballTrailAt(records, records.length - 1);

/**
 * Player 7 (team 0, at x = 0) has the ball for 10 frames, then plays it along
 * x at 0.5 m a frame, with nobody flagged after that.
 */
function pass(steps: number, carrier: Partial<Person> = {}, ball = (i: number) => i) {
  return play(steps, (i) =>
    frame(
      [
        { team: 0, id: 7, x: 0, ball: i < 10, ...carrier },
        { team: 1, id: 9, x: 30 },
      ],
      { x: i < 10 ? 0.5 : (ball(i) - 9) * 0.5, y: 0 },
    ),
  );
}

describe('ballTrailAt', () => {
  it('starts the trail where the ball was played from once it has left the player', () => {
    // Frame 15 is the first with the ball over 2.5 m away (3 m).
    const records = pass(16);
    expect(ballTrailAt(records, 14)).toBeNull();
    expect(last(records)).toEqual({ lines: [], from: { x: 0, y: 0 } });
  });

  it('has no trail while a player has the ball', () => {
    const records = pass(10);
    expect(last(records)).toBeNull();
  });

  // The possession flag drops out for a frame or two while a player still has
  // the ball at their feet: that is not a pass.
  it('has no trail while the ball stays at the feet of a player who lost the flag', () => {
    const records = play(30, (i) =>
      frame([{ team: 0, id: 7, x: i * 0.3, ball: i % 3 === 0 }], { x: i * 0.3 + 1, y: 0 }),
    );
    for (let i = 0; i < records.length; i++) expect(ballTrailAt(records, i)).toBeNull();
  });

  it('follows the player who had the ball, by track id, until it leaves them', () => {
    // They run on with the ball (flag gone) for 5 frames, then it leaves them.
    const records = play(25, (i) => {
      const at = Math.min(i, 15) * 0.4;
      const ball = i <= 15 ? at + 1 : at + 1 + (i - 15) * 0.6;
      return frame([{ team: 0, id: 7, x: at, ball: i < 10 }], { x: ball, y: 0 });
    });
    expect(last(records)?.from).toEqual({ x: 6, y: 0 });
  });

  it('does not follow an untracked player: it starts where they last had the flag', () => {
    // An untracked opponent stands where an untracked carrier would be looked
    // up; following "track -1" would start the trail from them.
    const records = play(20, (i) =>
      frame(
        [
          { team: 0, id: -1, x: 0, ball: i < 10 },
          { team: 0, id: -1, x: -20 },
          { team: 1, id: -1, x: 1 },
        ],
        { x: i < 10 ? 0.5 : (i - 9) * 0.5, y: 0 },
      ),
    );
    expect(last(records)?.from).toEqual({ x: 0, y: 0 });
  });

  /** Player 7 passes to 8 at x = 8; at frame 40 player 8 passes on along y. */
  function chain(steps: number) {
    return play(steps, (i) => {
      const people: Person[] = [
        { team: 0, id: 7, x: 0, ball: i < 10 },
        { team: 0, id: 8, x: 8, ball: i >= 25 && i < 40 },
      ];
      const ball =
        i < 10 ? { x: 0.5, y: 0 } : i < 25 ? { x: Math.min(8, (i - 9) * 0.5), y: 0 } : i < 40 ? { x: 8, y: 0.5 } : { x: 8, y: (i - 39) * 0.5 };
      return frame(people, ball);
    });
  }

  it('keeps a pass, from where it was played to where it was received, once it lands', () => {
    const records = chain(30);
    expect(ballTrailAt(records, 24)).toEqual({ lines: [], from: { x: 0, y: 0 } });
    expect(ballTrailAt(records, 25)).toEqual({
      lines: [{ from: { x: 0, y: 0 }, to: { x: 8, y: 0.5 }, strength: 1 }],
      from: null,
    });
  });

  it('joins the passes of a move: the next starts where the one before was received', () => {
    // Player 8 plays it on from 0.5 m from where it reached them: too close
    // for a line of its own between the two.
    const records = chain(50);
    expect(last(records)).toEqual({
      lines: [{ from: { x: 0, y: 0 }, to: { x: 8, y: 0.5 }, strength: 1 }],
      from: { x: 8, y: 0.5 },
    });
  });

  it('joins a pass to the next across the ground the ball was carried over', () => {
    // Player 8 receives at x = 8, runs on with it to x = 14, then passes along y.
    const records = play(60, (i) => {
      const run = i < 25 ? 8 : Math.min(14, 8 + (i - 25) * 0.4);
      const people: Person[] = [
        { team: 0, id: 7, x: 0, ball: i < 10 },
        { team: 0, id: 8, x: run, ball: i >= 25 && i < 45 },
      ];
      const ball =
        i < 10
          ? { x: 0.5, y: 0 }
          : i < 25
            ? { x: Math.min(8, (i - 9) * 0.5), y: 0 }
            : i < 45
              ? { x: run, y: 0.5 }
              : { x: 14, y: (i - 44) * 0.6 };
      return frame(people, ball);
    });
    expect(last(records)).toEqual({
      lines: [
        { from: { x: 0, y: 0 }, to: { x: 8, y: 0.5 }, strength: 1 },
        { from: { x: 8, y: 0.5 }, to: { x: 14, y: 0 }, strength: 1 },
      ],
      from: { x: 14, y: 0 },
    });
  });

  it('fades a pass out over the end of its time on screen, then drops it', () => {
    // The pass lands at frame 25, and nothing else happens after.
    const steps = 25 + Math.round(TRAIL_HISTORY_S / DT) + 2;
    const records = play(steps, (i) =>
      i < 40 ? chain(40)[i]!.frame : frame([{ team: 0, id: 8, x: 8, ball: true }], { x: 8, y: 0.5 }),
    );
    const at = (s: number) => ballTrailAt(records, 25 + Math.round(s / DT));
    expect(at(TRAIL_HISTORY_S - TRAIL_FADE_S - DT)?.lines[0]?.strength).toBe(1);
    const fading = at(TRAIL_HISTORY_S - TRAIL_FADE_S / 2)?.lines[0]?.strength ?? 0;
    expect(fading).toBeGreaterThan(0.3);
    expect(fading).toBeLessThan(0.7);
    expect(at(TRAIL_HISTORY_S + DT)).toBeNull();
  });

  it('ends a pass nobody receives where the ball was last seen, once the hold is up', () => {
    // Released at frame 15; the ball runs on until frame 30, then stops.
    const records = play(15 + Math.round(TRAIL_HOLD_S / DT) + 5, (i) =>
      frame([{ team: 0, id: 7, x: 0, ball: i < 10 }], { x: i < 10 ? 0.5 : (Math.min(i, 30) - 9) * 0.5, y: 0 }),
    );
    expect(last(records)).toEqual({
      lines: [{ from: { x: 0, y: 0 }, to: { x: 10.5, y: 0 }, strength: 1 }],
      from: null,
    });
  });

  it('leaves no line for a ball a player plays and gets back themselves', () => {
    const records = play(40, (i) =>
      frame([{ team: 0, id: 7, x: 0, ball: i < 10 || i >= 20 }], { x: i < 10 || i >= 20 ? 0.5 : 3, y: 0 }),
    );
    expect(ballTrailAt(records, 15)?.from).toEqual({ x: 0, y: 0 });
    expect(last(records)).toBeNull();
  });

  it('has no trail on a frame without a tracked ball', () => {
    const records = pass(16);
    records.push({ t: records.at(-1)!.t + DT, frame: frame([{ team: 0, id: 7, x: 0 }], null) });
    expect(last(records)).toBeNull();
    // A pass that has landed still shows: it does not end at the ball.
    const landed = chain(30);
    landed.push({ t: landed.at(-1)!.t + DT, frame: frame([{ team: 0, id: 8, x: 8 }], null) });
    expect(last(landed)?.lines).toHaveLength(1);
  });

  it('does not take a flag on a player far from the ball to mean they have it', () => {
    // Mid-pass, an opponent 20 m away is flagged for a frame.
    const records = pass(20).map((r, i) =>
      i === 17
        ? { ...r, frame: frame([{ team: 0, id: 7, x: 0 }, { team: 1, id: 9, x: 24, ball: true }], { x: 4, y: 0 }) }
        : r,
    );
    expect(last(records)).toEqual({ lines: [], from: { x: 0, y: 0 } });
  });

  it('never takes an official for the player who had the ball', () => {
    const records = play(20, (i) =>
      frame([{ team: -1, id: 50, x: 0, ball: i < 10 }], { x: i < 10 ? 0.5 : (i - 9) * 0.5, y: 0 }),
    );
    expect(last(records)).toBeNull();
  });

  it('looks back no further than its lookback for who had the ball', () => {
    // The ball sits by the player, flag gone, for longer than the lookback,
    // then leaves: who had it is no longer known.
    const quiet = Math.round((TRAIL_LOOKBACK_S + 1) / DT);
    const records = play(10 + quiet + 6, (i) =>
      frame([{ team: 0, id: 7, x: 0, ball: i < 10 }], {
        x: i < 10 + quiet ? 1 : 1 + (i - 10 - quiet) * RELEASE_METRES,
        y: 0,
      }),
    );
    expect(last(records)).toBeNull();
  });
});

describe('sameTrail', () => {
  it('tells trails that draw the same from those that do not', () => {
    const pass = { from: { x: 0, y: 0 }, to: { x: 8, y: 0 }, strength: 1 };
    const a = { lines: [pass], from: { x: 1, y: 2 } };
    expect(sameTrail(a, { lines: [{ ...pass }], from: { x: 1, y: 2 } })).toBe(true);
    expect(sameTrail(a, { lines: [pass], from: { x: 1, y: 3 } })).toBe(false);
    expect(sameTrail(a, { lines: [pass], from: null })).toBe(false);
    expect(sameTrail(a, { lines: [{ ...pass, strength: 0.5 }], from: { x: 1, y: 2 } })).toBe(false);
    expect(sameTrail(a, { lines: [], from: { x: 1, y: 2 } })).toBe(false);
    expect(sameTrail(a, null)).toBe(false);
    expect(sameTrail(null, null)).toBe(true);
  });
});
