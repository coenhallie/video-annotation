import { describe, it, expect } from 'vitest';
import {
  isGoalFrame,
  planGoal,
  goalStateAt,
  GOAL_SEQUENCE_MS,
  NET_DEPTH_METRES,
} from '@/lib/vis/goalSequence';
import type { Frame } from '@/lib/vis/types';

const PITCH = { length: 105, width: 68, goal_width: 7.32 };
const HALF = PITCH.length / 2;

function frame(opts: {
  actions?: string[];
  ball?: { x: number; y: number } | null;
}): Frame {
  return {
    pitch_dimensions: PITCH,
    teams: [],
    balls: opts.ball ? [{ projected_coordinates: opts.ball }] : [],
    state: { actions: (opts.actions ?? []).map((action_type) => ({ action_type })) },
  } as unknown as Frame;
}

describe('isGoalFrame', () => {
  it('recognises a GOAL label, whatever its case or padding', () => {
    for (const label of ['GOAL', 'Goal', ' goal ']) {
      expect(isGoalFrame(frame({ actions: [label] }))).toBe(true);
    }
  });

  // "Goal kick" is in the real export 43 times; it is a restart, not a goal.
  it('does not mistake a goal kick for a goal', () => {
    expect(isGoalFrame(frame({ actions: ['Goal kick'] }))).toBe(false);
  });

  it('finds the label among other actions', () => {
    expect(isGoalFrame(frame({ actions: ['other', 'GOAL'] }))).toBe(true);
  });

  it('is false for a frame without actions', () => {
    expect(isGoalFrame(frame({}))).toBe(false);
  });
});

describe('planGoal', () => {
  it('shoots at the goal nearest the ball', () => {
    expect(planGoal(frame({ ball: { x: 40, y: 2 } }))?.side).toBe(1);
    expect(planGoal(frame({ ball: { x: -30, y: -5 } }))?.side).toBe(-1);
  });

  it('starts from the ball when it is a sensible distance out', () => {
    const plan = planGoal(frame({ ball: { x: 35, y: 6 } }))!;
    expect(plan.start).toEqual({ x: 35, y: 6 });
  });

  // The tracked ball can be anywhere, including 175 m behind the goal line in
  // the real export. A shot from there would be nonsense.
  it('starts in front of goal when the ball is off the pitch or already at the goal', () => {
    for (const ball of [
      { x: 228, y: 1 },
      { x: 53, y: 0.5 },
      { x: 50, y: 40 },
    ]) {
      const plan = planGoal(frame({ ball }))!;
      expect(Math.abs(plan.start.x)).toBeLessThan(HALF - 8);
      expect(Math.abs(plan.start.y)).toBeLessThanOrEqual(PITCH.width / 2);
      expect(Math.sign(plan.start.x)).toBe(plan.side);
    }
  });

  it('aims between the posts', () => {
    const plan = planGoal(frame({ ball: { x: 30, y: 25 } }))!;
    expect(Math.abs(plan.impact.y)).toBeLessThan(PITCH.goal_width / 2);
  });

  it('plans nothing without a usable ball, rather than inventing a goal', () => {
    expect(planGoal(frame({ ball: null }))).toBeNull();
    expect(planGoal(frame({ ball: { x: Number.NaN, y: 0 } }))).toBeNull();
  });
});

describe('goalStateAt', () => {
  const plan = planGoal(frame({ ball: { x: 30, y: 8 } }))!;
  const samples = Array.from({ length: 400 }, (_, i) => (i / 399) * GOAL_SEQUENCE_MS);

  it('starts where the shot is taken from', () => {
    const s = goalStateAt(plan, 0);
    expect(s.ball.x).toBeCloseTo(plan.start.x, 6);
    expect(s.ball.y).toBeCloseTo(plan.start.y, 6);
  });

  it('ends at rest inside the net', () => {
    const end = goalStateAt(plan, GOAL_SEQUENCE_MS).ball;
    expect(Math.abs(end.x)).toBeGreaterThan(HALF);
    expect(Math.abs(end.x)).toBeLessThan(HALF + NET_DEPTH_METRES);
    expect(Math.abs(end.y)).toBeLessThan(PITCH.goal_width / 2);
  });

  // The point of the sequence: the tracked ball sails straight through.
  it('never goes through the back of the net', () => {
    for (const t of samples) {
      expect(Math.abs(goalStateAt(plan, t).ball.x)).toBeLessThanOrEqual(HALF + NET_DEPTH_METRES);
    }
  });

  it('never comes back out over the goal line once it is in', () => {
    const inAt = samples.find((t) => Math.abs(goalStateAt(plan, t).ball.x) > HALF)!;
    for (const t of samples.filter((t) => t >= inAt)) {
      expect(Math.abs(goalStateAt(plan, t).ball.x)).toBeGreaterThan(HALF);
    }
  });

  it('only ever bows the net outwards', () => {
    for (const t of samples) expect(goalStateAt(plan, t).netBulge).toBeGreaterThanOrEqual(0);
  });

  it('bulges the net only once the ball hits it, then lets it settle', () => {
    expect(goalStateAt(plan, 0).netBulge).toBe(0);
    const peak = Math.max(...samples.map((t) => Math.abs(goalStateAt(plan, t).netBulge)));
    expect(peak).toBeGreaterThan(0.3);
    expect(Math.abs(goalStateAt(plan, GOAL_SEQUENCE_MS).netBulge)).toBeLessThan(0.02);
  });

  it('shows the banner from the moment the ball goes in, and fades it out by the end', () => {
    expect(goalStateAt(plan, 0).banner).toBe(0);
    expect(Math.max(...samples.map((t) => goalStateAt(plan, t).banner))).toBe(1);
    expect(goalStateAt(plan, GOAL_SEQUENCE_MS).banner).toBe(0);
  });

  it('holds its final state past the end', () => {
    expect(goalStateAt(plan, GOAL_SEQUENCE_MS * 2)).toEqual(goalStateAt(plan, GOAL_SEQUENCE_MS));
  });
});
