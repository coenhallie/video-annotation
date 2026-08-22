// ---------------------------------------------------------------------------
// 2D canvas constants.
//
// Vendored from datalabelling-frontend/src/lib/vis/constants.ts, trimmed to the
// 2D half. The 3D model URLs, camera-follow distances, animation thresholds and
// cylinder-fallback dimensions are deliberately not carried across: this
// repository renders 2D only and has none of the GLB/HDR assets they name.
// ---------------------------------------------------------------------------

/** Internal canvas width in pixels. */
export const FRAME_W = 1280
/** Internal canvas height in pixels. */
export const FRAME_H = 720
/** Margin (px) between canvas edge and pitch outline. */
export const PITCH_MARGIN = 40
/** Colour used for pitch markings. */
export const LINE_COLOR = '#ffffff'
/** Radius (px) of a player circle on the 2D canvas. */
export const PLAYER_RADIUS = 12
