import { describe, it, expect } from 'vitest';
import {
  computeViewMatrix,
  applyViewMatrix,
  IDENTITY_VIEW,
} from '../viewTransform';
import { FRAME_W, FRAME_H } from '../constants';

const CX = FRAME_W / 2;
const CY = FRAME_H / 2;

/** The default: fit, no pan, laid out at exactly frame size. */
const fit = { zoom: 1, panX: 0, panY: 0, renderedWidth: FRAME_W };

describe('computeViewMatrix', () => {
  it('is the identity at zoom 1 with no pan', () => {
    expect(computeViewMatrix(fit)).toEqual(IDENTITY_VIEW);
  });

  // The surface resets pan to 0 whenever zoom returns to 1, so "fit" must be
  // pixel-identical to the untransformed render it replaced.
  it('is the identity at zoom 1 regardless of how the canvas is laid out', () => {
    expect(computeViewMatrix({ ...fit, renderedWidth: 640 })).toEqual(
      IDENTITY_VIEW
    );
    expect(computeViewMatrix({ ...fit, renderedWidth: 1920 })).toEqual(
      IDENTITY_VIEW
    );
  });

  it('scales about the frame centre, so the centre pixel does not move', () => {
    const m = computeViewMatrix({ ...fit, zoom: 3 });
    expect(applyViewMatrix(m, CX, CY)).toEqual({ x: CX, y: CY });
  });

  it('magnifies distances from the centre by the zoom factor', () => {
    const m = computeViewMatrix({ ...fit, zoom: 2 });
    const p = applyViewMatrix(m, CX + 100, CY + 50);
    expect(p.x).toBeCloseTo(CX + 200, 6);
    expect(p.y).toBeCloseTo(CY + 100, 6);
  });

  // Pan arrives as pointer deltas in screen pixels. When the canvas is drawn at
  // half size, dragging 100 screen pixels has to move 200 canvas pixels for the
  // image to track the cursor.
  it('converts screen-pixel pan into canvas pixels via the rendered width', () => {
    const m = computeViewMatrix({
      zoom: 2,
      panX: 100,
      panY: -40,
      renderedWidth: FRAME_W / 2,
    });
    const p = applyViewMatrix(m, CX, CY);
    expect(p.x).toBeCloseTo(CX + 200, 6);
    expect(p.y).toBeCloseTo(CY - 80, 6);
  });

  it('applies pan one-to-one when the canvas is drawn at frame size', () => {
    const m = computeViewMatrix({ ...fit, zoom: 2, panX: 30, panY: 70 });
    const p = applyViewMatrix(m, CX, CY);
    expect(p.x).toBeCloseTo(CX + 30, 6);
    expect(p.y).toBeCloseTo(CY + 70, 6);
  });

  // Called during the first render, before the element has a box.
  it('survives an unlaid-out canvas without producing NaN', () => {
    const m = computeViewMatrix({ zoom: 2, panX: 10, panY: 10, renderedWidth: 0 });
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
  });

  it('falls back to fit for a nonsensical zoom', () => {
    expect(computeViewMatrix({ ...fit, zoom: 0 })).toEqual(IDENTITY_VIEW);
    expect(computeViewMatrix({ ...fit, zoom: Number.NaN })).toEqual(IDENTITY_VIEW);
  });
});
