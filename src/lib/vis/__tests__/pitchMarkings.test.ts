import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  build2DTransform,
  buildPitchCache,
  resolvePitchDimensions,
} from '@/lib/vis/pitchGeometry';
import type { PitchDimensions } from '@/lib/vis/types';
import { stubOffscreenCanvas, type Op } from './recordingCtx';

// Exactly the keys the pipeline's own export carries. It states neither
// center_circle_radius nor penalty_mark_distance in any of its 121,371 frames,
// so those two markings are the ones that must read as assumed.
const AS_EXPORTED: Partial<PitchDimensions> = {
  length: 105,
  width: 68,
  penalty_area_length: 16.5,
  penalty_area_width: 40.32,
  goal_area_length: 5.5,
  goal_area_width: 18.32,
  goal_width: 7.32,
  goal_height: 2.44,
};

describe('resolvePitchDimensions', () => {
  it('reports a dimension the frame states as measured', () => {
    const d = resolvePitchDimensions(AS_EXPORTED);
    expect(d.length).toEqual({ value: 105, assumed: false });
    expect(d.penalty_area_length).toEqual({ value: 16.5, assumed: false });
  });

  it('reports a dimension the frame omits as assumed, with the standard value', () => {
    const d = resolvePitchDimensions(AS_EXPORTED);
    expect(d.center_circle_radius).toEqual({ value: 9.15, assumed: true });
    expect(d.penalty_mark_distance).toEqual({ value: 11, assumed: true });
  });

  it('reports every dimension as assumed when the frame states none', () => {
    const d = resolvePitchDimensions(undefined);
    expect(Object.values(d).every((x) => x.assumed)).toBe(true);
  });
});

describe('buildPitchCache marking fidelity', () => {
  let stub: ReturnType<typeof stubOffscreenCanvas>;

  beforeEach(() => {
    stub = stubOffscreenCanvas();
  });
  afterEach(() => {
    stub.restore();
  });

  const draw = (pd: Partial<PitchDimensions> | undefined): Op[] => {
    buildPitchCache(pd, build2DTransform(pd));
    return stub.ops;
  };

  /** The centre circle is the only large-radius arc on the pitch. */
  const centreCircle = (ops: Op[]) =>
    ops.find((o) => o.op === 'arc' && Number(o.args[2]) > 10);

  /** Penalty marks are the small dots away from the canvas centre. */
  const penaltyMarks = (ops: Op[]) =>
    ops.filter(
      (o) => o.op === 'arc' && Number(o.args[2]) <= 4 && Math.abs(Number(o.args[0]) - 640) > 10
    );

  it('draws the centre circle as assumed when the frame omits its radius', () => {
    const arc = centreCircle(draw(AS_EXPORTED));
    expect(arc).toBeDefined();
    expect(arc!.lineDash.length).toBeGreaterThan(0);
    expect(arc!.globalAlpha).toBeLessThan(1);
  });

  it('draws the penalty marks as assumed when the frame omits their distance', () => {
    const marks = penaltyMarks(draw(AS_EXPORTED));
    expect(marks).toHaveLength(2);
    for (const m of marks) {
      expect(m.lineDash.length).toBeGreaterThan(0);
      expect(m.globalAlpha).toBeLessThan(1);
    }
  });

  it('draws the centre circle solid when the frame states its radius', () => {
    const arc = centreCircle(draw({ ...AS_EXPORTED, center_circle_radius: 9.15 }));
    expect(arc).toBeDefined();
    expect(arc!.lineDash).toEqual([]);
    expect(arc!.globalAlpha).toBe(1);
  });

  it('draws markings the frame states at full strength', () => {
    const ops = draw(AS_EXPORTED);
    // Penalty and goal areas both come from stated dimensions.
    const boxes = ops.filter((o) => o.op === 'strokeRect');
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.lineDash).toEqual([]);
      expect(b.globalAlpha).toBe(1);
    }
  });

  it('leaves no dash or transparency in force after the pitch is drawn', () => {
    const ops = draw(AS_EXPORTED);
    const last = ops.at(-1);
    expect(last).toBeDefined();
    expect(last!.lineDash).toEqual([]);
    expect(last!.globalAlpha).toBe(1);
  });
});
