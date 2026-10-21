import { describe, it, expect } from 'vitest';
import {
  isThrowInFrame,
  isValidFrame,
  throwInBall,
  throwInCamera,
  throwInWeight,
  throwInHolds,
  throwInPulse,
  THROW_IN_IN_MS,
  THROW_IN_OUT_MS,
  THROW_IN_SETTLE_S,
  THROW_IN_ZOOM,
  THROW_IN_PULSE_MS,
} from '@/lib/vis/throwInSequence';
import { build2DTransform, worldToPx } from '@/lib/vis/pitchGeometry';
import { FRAME_W, FRAME_H } from '@/lib/vis/constants';
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

describe('throwInCamera', () => {
  const t = build2DTransform(PITCH);

  it('centres on the ball, zoomed in', () => {
    const cam = throwInCamera({ x: 0, y: 0 }, PITCH);
    const [bx, by] = worldToPx(0, 0, t);
    expect(cam).toEqual({ zoom: THROW_IN_ZOOM, x: bx, y: by });
  });

  // A throw-in is at the touchline, often with the ball tracked beyond it.
  it('never shows past the edge of the frame', () => {
    const cam = throwInCamera({ x: 50, y: -40 }, PITCH);
    expect(cam.y).toBeCloseTo(FRAME_H / (2 * THROW_IN_ZOOM), 6);
    expect(cam.x).toBeCloseTo(FRAME_W - FRAME_W / (2 * THROW_IN_ZOOM), 6);
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
  // seconds after the label goes off: zooming out and straight back in
  // would be worse than staying in.
  it('holds until play has been back on for the settle time', () => {
    expect(throwInHolds({ ...base, quietS: THROW_IN_SETTLE_S - 0.01 })).toBe(true);
  });

  it('does not let go before the zoom in has finished', () => {
    expect(THROW_IN_SETTLE_S * 1000).toBeGreaterThanOrEqual(THROW_IN_IN_MS);
  });
});

describe('throwInWeight', () => {
  it('eases in from where it starts', () => {
    const ease = { towards: 1 as const, fromWeight: 0, startMs: 1000 };
    expect(throwInWeight(ease, 1000)).toBe(0);
    const mid = throwInWeight(ease, 1000 + THROW_IN_IN_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(throwInWeight(ease, 1000 + THROW_IN_IN_MS)).toBe(1);
    expect(throwInWeight(ease, 60_000)).toBe(1);
  });

  it('eases out to nothing', () => {
    const ease = { towards: 0 as const, fromWeight: 1, startMs: 5000 };
    expect(throwInWeight(ease, 5000)).toBe(1);
    const mid = throwInWeight(ease, 5000 + THROW_IN_OUT_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(throwInWeight(ease, 5000 + THROW_IN_OUT_MS)).toBe(0);
  });

  // Turning round partway: back in from wherever the zoom out had got to,
  // with no jump.
  it('starts a turn from the weight it turns at', () => {
    const out = { towards: 0 as const, fromWeight: 1, startMs: 0 };
    const at = throwInWeight(out, THROW_IN_OUT_MS / 3);
    const back = { towards: 1 as const, fromWeight: at, startMs: THROW_IN_OUT_MS / 3 };
    expect(throwInWeight(back, THROW_IN_OUT_MS / 3)).toBeCloseTo(at, 9);
    expect(throwInWeight(back, THROW_IN_OUT_MS / 3 + 10)).toBeGreaterThan(at);
    expect(throwInWeight(back, THROW_IN_OUT_MS / 3 + THROW_IN_IN_MS)).toBe(1);
  });
});

describe('throwInPulse', () => {
  it('runs from 0 to 1 and repeats', () => {
    expect(throwInPulse(0)).toBe(0);
    expect(throwInPulse(THROW_IN_PULSE_MS / 2)).toBeCloseTo(0.5, 6);
    expect(throwInPulse(THROW_IN_PULSE_MS * 3 + 10)).toBeCloseTo(10 / THROW_IN_PULSE_MS, 6);
  });
});
