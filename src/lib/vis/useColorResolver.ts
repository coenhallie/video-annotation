// Vendored from datalabelling-frontend/src/lib/vis/ on 2026-08-22. Keep edits
// minimal so the two copies stay diffable.

// ---------------------------------------------------------------------------
// Pure helper that resolves a Team's colour data into a usable TeamColors
// object. Ported from resolveTeamColors() in the original index.html
// (lines 381-411).
// ---------------------------------------------------------------------------

import type { Team, TeamColors } from './types'

/**
 * Convert a raw colour channel array (0-1 or 0-255) to an RGB tuple in 0-255.
 * Returns [0, 0, 0] when the input is missing or too short.
 */
function toRgb(color: number[] | undefined | null): [number, number, number] {
  if (!color || color.length < 3) return [0, 0, 0]
  const sc = Math.max(...color) <= 1.0 ? 255 : 1
  return [
    Math.round(color[0] * sc),
    Math.round(color[1] * sc),
    Math.round(color[2] * sc),
  ]
}

/** Format an RGB tuple as a CSS `rgb(…)` string. */
function css(arr: [number, number, number]): string {
  return `rgb(${arr[0]},${arr[1]},${arr[2]})`
}

/** Darken an RGB tuple by `factor` (0 = black, 1 = unchanged). */
function darken(
  rgb: [number, number, number],
  factor: number,
): [number, number, number] {
  return [
    Math.round(rgb[0] * factor),
    Math.round(rgb[1] * factor),
    Math.round(rgb[2] * factor),
  ]
}

/** Pick black or white for text based on the perceived luminance of the fill. */
function textForFill(rgb: [number, number, number]): [number, number, number] {
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
  return lum > 140 ? [0, 0, 0] : [255, 255, 255]
}

/**
 * Neutral stand-in used when the frame reported no colour for a team.
 *
 * Identical for every team on purpose. The previous fallback picked red for
 * `team_id` 0 and blue for 1, which drew a confident shirt colour out of
 * nothing but the team's index - on this pipeline's output that happens on
 * 16.6% of team entries. `detected: false` lets the renderer draw the absence
 * as an absence instead.
 */
const UNDETECTED: TeamColors = {
  fill: 'rgba(20,20,20,0.55)',
  outline: '#e5e7eb',
  text: '#e5e7eb',
  fillRgb: [20, 20, 20],
  detected: false,
}

/**
 * Resolve a team's colour information into fill / outline / text colours.
 *
 * Resolution priority:
 *  1. `color_rgb` — the detected primary shirt colour from the pipeline.
 *  2. `ordered_colors` — an array of 3+ colour triplets [fill, outline, text].
 *  3. `colors` + `color_weights` — flat channel array sorted by weight.
 *  4. Nothing in the frame said anything: `UNDETECTED`.
 *
 * `teamId` is retained so the signature still matches the vendored copy. It no
 * longer selects a colour, because a colour chosen from the team's index is not
 * something the pipeline reported.
 */
export function resolveTeamColors(team: Team, teamId: number): TeamColors {
  void teamId
  // ── Priority 1: color_rgb (preferred primary shirt colour) ────────────────
  const cr = team.color_rgb
  if (Array.isArray(cr) && cr.length >= 3) {
    const fillRgb = toRgb(cr)
    return {
      fill: css(fillRgb),
      outline: css(darken(fillRgb, 0.5)),
      text: css(textForFill(fillRgb)),
      fillRgb,
      detected: true,
    }
  }

  // ── Priority 2: ordered_colors ────────────────────────────────────────────
  const oc = team.ordered_colors
  if (Array.isArray(oc) && oc.length >= 3) {
    const fillRgb = toRgb(oc[0])
    return {
      fill: css(fillRgb),
      outline: css(toRgb(oc[1])),
      text: css(toRgb(oc[2])),
      fillRgb,
      detected: true,
    }
  }

  // ── Priority 2: colors (flat) + optional color_weights ────────────────────
  const colors = team.colors
  const weights = team.color_weights

  if (Array.isArray(colors) && colors.length >= 3) {
    if (weights && weights.length * 3 <= colors.length) {
      // Sort colour indices by descending weight
      const idxs = Array.from({ length: weights.length }, (_, i) => i).sort(
        (a, b) => weights[b] - weights[a],
      )
      const pick = (i: number): [number, number, number] =>
        toRgb(colors.slice(idxs[i] * 3, idxs[i] * 3 + 3))
      const r0 = pick(0)
      return {
        fill: css(r0),
        outline: css(pick(1)),
        text: css(pick(2)),
        fillRgb: r0,
        detected: true,
      }
    }

    // No weights — just take the first triplet
    const r0 = toRgb(colors.slice(0, 3))
    return { fill: css(r0), outline: 'black', text: 'white', fillRgb: r0, detected: true }
  }

  // ── Nothing in the frame reported a colour ────────────────────────────────
  return UNDETECTED
}
