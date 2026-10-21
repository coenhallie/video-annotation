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
 * which keeps their team visible. Outfield outlines are a dark shade of the
 * team colour: red and the pitch green are close in brightness, so without an
 * edge red players blend into the pitch for anyone who cannot tell red from
 * green. White is kept for NEARBY_OUTLINE.
 */
export const PERSON_COLORS: Record<
  'home' | 'away' | 'goalkeeper' | 'official' | 'unknown',
  PersonColors
> = {
  home: { fill: '#dc2626', outline: '#7f1d1d', text: '#ffffff' },
  away: { fill: '#2563eb', outline: '#1e3a8a', text: '#ffffff' },
  goalkeeper: { fill: '#facc15', outline: '#000000', text: '#000000' },
  official: { fill: '#d946ef', outline: '#000000', text: '#000000' },
  // A team id the export does not define has no home or away to be coloured as.
  unknown: { fill: '#9ca3af', outline: '#000000', text: '#000000' },
}

/**
 * Opacity of players far from the ball, so the eye goes to the play around it.
 * Applied frame by frame with no fade, following the data as it is.
 *
 * Chosen low on purpose (tried 0.6, 0.4 and 0.3 first): the faded players
 * recede strongly. The cost, accepted: this much green showing through turns
 * faded red towards olive and faded blue towards teal, so their team reads
 * less clearly than the solid players'.
 */
export const DIMMED_PLAYER_ALPHA = 0.15

/**
 * Players further than this from the ball are faded (DIMMED_PLAYER_ALPHA).
 * The same distance as NEARBY_METRES, so the solid players and the white rings
 * describe one area: the play around the ball.
 */
export const FOCUS_METRES = 15

/**
 * Outline of the players near the ball: the ball carrier and their teammates
 * within NEARBY_METRES of them. White is used for nothing else, so it reads as
 * the highlight. "Nearby" is worked out here, not reported by the pipeline,
 * which is why it does not borrow the gold possession ring.
 */
export const NEARBY_OUTLINE = '#ffffff'

/**
 * How close to the ball carrier a teammate has to be to be highlighted.
 * Measured on a full match: at 15 m the median is 2 teammates and most frames
 * have 1 to 5. At 10 m 39% of frames have none; from 20 m it is half the team.
 */
export const NEARBY_METRES = 15

/**
 * Seconds for a ring, the white one on the players near the ball or the gold
 * possession ring, to fade in or out during playback. Who has the ball, and
 * so who is near it, changes many times a minute, and rings snapping on and
 * off with it were jarring. Tried 0.4 s first, which still felt abrupt.
 */
export const RING_FADE_S = 0.6
