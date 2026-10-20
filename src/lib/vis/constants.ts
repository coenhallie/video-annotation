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

/** Fill, outline and number colours for one kind of person on the 2D pitch. */
export interface PersonColors {
  fill: string
  outline: string
  text: string
}

/**
 * Fixed colours, by role. The pipeline's detected kit colours are not used.
 *
 * The export says nothing about home and away, only `team_id` 0 and 1, so
 * team 0 is taken as home. Each id keeps the same kit for a whole match, so
 * the convention at least never swaps mid-match.
 *
 * Goalkeepers and officials get colours that cannot be mistaken for either
 * team or for the green pitch. A goalkeeper's outline is their team's colour,
 * which keeps their team visible. Outfield outlines are white because red and
 * the pitch green are close in brightness, so a dark outline would leave red
 * players hard to pick out for anyone who cannot tell red from green.
 */
export const PERSON_COLORS: Record<
  'home' | 'away' | 'goalkeeper' | 'official' | 'unknown',
  PersonColors
> = {
  home: { fill: '#dc2626', outline: '#ffffff', text: '#ffffff' },
  away: { fill: '#2563eb', outline: '#ffffff', text: '#ffffff' },
  goalkeeper: { fill: '#facc15', outline: '#000000', text: '#000000' },
  official: { fill: '#d946ef', outline: '#000000', text: '#000000' },
  // A team id the export does not define has no home or away to be coloured as.
  unknown: { fill: '#9ca3af', outline: '#000000', text: '#000000' },
}

/**
 * Opacity of the team without the ball, so the eye goes to the team that has
 * it. Not lower: at 0.5 the green pitch shows through red enough to read as
 * brown, which looks like a third team rather than a faded red. Applied only while a team has possession, frame by frame and without a
 * fade: possession spells can be a single frame long, and a fade would blur
 * exactly the flicker a reviewer is meant to see.
 */
export const DIMMED_TEAM_ALPHA = 0.6
