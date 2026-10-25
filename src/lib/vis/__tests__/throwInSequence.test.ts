import { describe, it, expect } from 'vitest';
import {
  isThrowInFrame,
  isValidFrame,
  throwInBall,
  throwInHolds,
  throwInPulse,
  throwInSpot,
  THROW_IN_SETTLE_S,
  THROW_IN_PULSE_MS,
} from '@/lib/vis/throwInSequence';
import type { Frame } from '@/lib/vis/types';

const PITCH = { length: 105, width: 68 };

function frame({
  labels = [] as string[],
  ball = { x: 10, y: 30 } as { x: number; y: number } | null,
  players = 2,
} = {}): Frame {
  return {
    pitch_dimensions: PITCH,
    teams: [
      {
        team_id: 0,
        players: Array.from({ length: players }, (_, i) => ({
          track_id: i + 1,
          person_type: 'PersonType.PLAYER',
          projected_coordinates: { x: i, y: 0 },
        })),
      },
    ],
    balls: ball ? [{ projected_coordinates: ball }] : [],
    state: { actions: labels.map((action_type) => ({ action_type })) },
  } as unknown as Frame;
}

describe('isThrowInFrame', () => {
  it('matches the label however it is written', () => {
    for (const label of ['Throw in', 'THROW_IN', 'throw-in', ' Throw In ', 'Throw  in']) {
      expect(isThrowInFrame(frame({ labels: [label] }))).toBe(true);
    }
  });

  // The Manchester City vs PSG export names its labels "EventType.THROW_IN";
  // without the prefix handled, no throw-in on it ever played.
  it('matches the label with its EventType prefix', () => {
    expect(isThrowInFrame(frame({ labels: ['EventType.THROW_IN'] }))).toBe(true);
    for (const label of ['EventType.BALL_IN_PLAY', 'EventType.CORNER', 'EventType.FREE_KICK']) {
      expect(isThrowInFrame(frame({ labels: [label] }))).toBe(false);
    }
  });

  it('matches only a throw-in', () => {
    for (const label of ['other', 'Goal kick', 'Corner', 'Throw', 'Throw in attempt']) {
      expect(isThrowInFrame(frame({ labels: [label] }))).toBe(false);
    }
    expect(isThrowInFrame(frame())).toBe(false);
  });
});

// A cutaway in the broadcast: the pipeline tracks nobody, or no ball.
describe('isValidFrame', () => {
  it('is a frame with tracked players and a ball', () => {
    expect(isValidFrame(frame())).toBe(true);
  });

  it('is not a frame without players, or without a ball', () => {
    expect(isValidFrame(frame({ players: 0 }))).toBe(false);
    expect(isValidFrame(frame({ ball: null }))).toBe(false);
  });
});

describe('throwInBall', () => {
  it("is the frame's ball", () => {
    expect(throwInBall(frame({ ball: { x: 3, y: -36 } }), null)).toEqual({
      x: 3,
      y: -36,
    });
  });

  it('is where the ball was last seen when the frame has none', () => {
    expect(throwInBall(frame({ ball: null }), { x: 5, y: 33 })).toEqual({
      x: 5,
      y: 33,
    });
    expect(throwInBall(frame({ ball: null }), null)).toBeNull();
  });
});

// A throw-in is taken from the touchline, wherever the tracked ball is.
describe('throwInSpot', () => {
  it('is on the nearer touchline, level with the ball', () => {
    expect(throwInSpot({ x: 10, y: -30 }, PITCH)).toEqual({ x: 10, y: -34 });
    expect(throwInSpot({ x: -20, y: 12 }, PITCH)).toEqual({ x: -20, y: 34 });
  });

  it('brings a ball tracked beyond the touchline back onto it', () => {
    expect(throwInSpot({ x: 3, y: -41 }, PITCH)).toEqual({ x: 3, y: -34 });
  });

  it('stays between the goal lines', () => {
    expect(throwInSpot({ x: 60, y: 30 }, PITCH)).toEqual({ x: 52.5, y: 34 });
  });

  it('follows the pitch it is given', () => {
    expect(throwInSpot({ x: 0, y: 5 }, { length: 100, width: 60 })).toEqual({ x: 0, y: 30 });
  });
});

describe('throwInHolds', () => {
  const base = { labelled: false, valid: true, stale: false, quietS: THROW_IN_SETTLE_S };

  it('lets go once play has been back on for the settle time', () => {
    expect(throwInHolds(base)).toBe(false);
  });

  it('holds while the label is on', () => {
    expect(throwInHolds({ ...base, labelled: true })).toBe(true);
  });

  // The broadcast cut away: no records arrive, or they track nothing.
  it('holds through a stretch with no new frames, or no valid ones', () => {
    expect(throwInHolds({ ...base, stale: true })).toBe(true);
    expect(throwInHolds({ ...base, valid: false })).toBe(true);
  });

  // The same throw-in is often labelled again, or cut away from, a few
  // seconds after the label goes off: stopping and straight away starting
  // again would be worse than carrying on.
  it('holds until play has been back on for the settle time', () => {
    expect(throwInHolds({ ...base, quietS: THROW_IN_SETTLE_S - 0.01 })).toBe(true);
  });
});

describe('throwInPulse', () => {
  it('runs from 0 to 1 and repeats', () => {
    expect(throwInPulse(0)).toBe(0);
    expect(throwInPulse(THROW_IN_PULSE_MS / 2)).toBeCloseTo(0.5, 6);
    expect(throwInPulse(THROW_IN_PULSE_MS * 3 + 10)).toBeCloseTo(10 / THROW_IN_PULSE_MS, 6);
  });
});
