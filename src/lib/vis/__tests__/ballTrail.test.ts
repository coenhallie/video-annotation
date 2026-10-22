import { describe, it, expect } from 'vitest';
import {
  ballTrailAt,
  sameTrail,
  RELEASE_METRES,
  TRAIL_FADE_S,
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
    expect(last(records)).toEqual({ from: { x: 0, y: 0 }, strength: 1 });
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

  it('ends the trail when someone has the ball again', () => {
    const records = pass(30);
    const caught = records.map((r, i) =>
      i < 25
        ? r
        : {
            ...r,
            frame: frame([{ team: 1, id: 9, x: 8, ball: true }], { x: 8, y: 0 }),
          },
    );
    expect(ballTrailAt(caught, 24)).not.toBeNull();
    expect(ballTrailAt(caught, 25)).toBeNull();
  });

  it('fades out over the end of the hold, then ends', () => {
    // Released at frame 15; the trail lasts TRAIL_HOLD_S from there.
    const steps = 15 + Math.round(TRAIL_HOLD_S / DT) + 2;
    const records = pass(steps);
    const at = (s: number) => ballTrailAt(records, 15 + Math.round(s / DT));
    expect(at(TRAIL_HOLD_S - TRAIL_FADE_S - DT)?.strength).toBe(1);
    const fading = at(TRAIL_HOLD_S - TRAIL_FADE_S / 2)?.strength ?? 0;
    expect(fading).toBeGreaterThan(0.3);
    expect(fading).toBeLessThan(0.7);
    expect(at(TRAIL_HOLD_S + DT)).toBeNull();
  });

  it('has no trail on a frame without a tracked ball', () => {
    const records = pass(16);
    records.push({ t: records.at(-1)!.t + DT, frame: frame([{ team: 0, id: 7, x: 0 }], null) });
    expect(last(records)).toBeNull();
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
    const a = { from: { x: 1, y: 2 }, strength: 1 };
    expect(sameTrail(a, { from: { x: 1, y: 2 }, strength: 1 })).toBe(true);
    expect(sameTrail(a, { from: { x: 1, y: 3 }, strength: 1 })).toBe(false);
    expect(sameTrail(a, { from: { x: 1, y: 2 }, strength: 0.5 })).toBe(false);
    expect(sameTrail(a, null)).toBe(false);
    expect(sameTrail(null, null)).toBe(true);
  });
});
