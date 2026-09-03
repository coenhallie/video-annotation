import { FRAME_W, FRAME_H } from './constants';

export interface PipelineView {
  /** 1 = fit, >1 zoomed in. */
  zoom: number;
  /** Pan in *screen* pixels, as the pointer produced it. */
  panX: number;
  panY: number;
  /**
   * Rendered width of the canvas element in screen pixels. The canvas is
   * letterboxed to fit, so one canvas pixel is `renderedWidth / FRAME_W` screen
   * pixels and a pan measured from pointer deltas has to be divided by that to
   * land in canvas space.
   */
  renderedWidth: number;
}

/** The six values of a 2D affine matrix, in ctx.setTransform order. */
export interface ViewMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY_VIEW: ViewMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/**
 * Reproduce, in canvas space, the CSS transform this surface used to apply to
 * the canvas element: `translate(pan) scale(zoom)` about the element's centre.
 *
 * Doing it here rather than in CSS is what lets a drawing layer sit over the
 * canvas: the element stays put and unscaled, so a Fabric canvas on top of it
 * shares its coordinate system. With the transform on the element, Fabric would
 * compute pointer positions against a box it does not know is scaled, and every
 * stroke would land offset by the zoom factor.
 *
 * Scaling is about the frame centre because that is what `scale()` does to an
 * element already centred with `translate(-50%, -50%)`.
 */
export function computeViewMatrix(view: PipelineView): ViewMatrix {
  const zoom = Number.isFinite(view.zoom) && view.zoom > 0 ? view.zoom : 1;

  // A zero or missing rendered width means the element has not been laid out
  // yet. Treating the scale as 1 keeps the matrix finite; the next render after
  // layout supplies the real value.
  const displayScale =
    Number.isFinite(view.renderedWidth) && view.renderedWidth > 0
      ? view.renderedWidth / FRAME_W
      : 1;

  const panX = Number.isFinite(view.panX) ? view.panX / displayScale : 0;
  const panY = Number.isFinite(view.panY) ? view.panY / displayScale : 0;

  const cx = FRAME_W / 2;
  const cy = FRAME_H / 2;

  // translate(cx + pan) · scale(zoom) · translate(-cx)
  return {
    a: zoom,
    b: 0,
    c: 0,
    d: zoom,
    e: cx + panX - zoom * cx,
    f: cy + panY - zoom * cy,
  };
}

/** Map a point in canvas space through a view matrix. */
export function applyViewMatrix(
  m: ViewMatrix,
  x: number,
  y: number
): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}
