// Vendored from datalabelling-frontend/src/lib/vis/ on 2026-08-22. Keep edits
// minimal so the two copies stay diffable.

// ---------------------------------------------------------------------------
// Pitch geometry utilities for the 2D canvas renderer.
// Ported from build2DTransform(), worldToPx(), buildPitchCache() in the
// original index.html (lines 475-550).
// ---------------------------------------------------------------------------

import type { PitchDimensions, Transform2D } from './types'
import { FRAME_W, FRAME_H, PITCH_MARGIN, LINE_COLOR } from './constants'

// ── Default pitch metric values (FIFA standard) ────────────────────────────
const DEFAULT_LENGTH = 105
const DEFAULT_WIDTH = 68
const DEFAULT_PAL = 16.5
const DEFAULT_PAW = 40.32
const DEFAULT_GAL = 5.5
const DEFAULT_GAW = 18.32
const DEFAULT_GW = 7.32
const DEFAULT_CCR = 9.15
const DEFAULT_PMD = 11.0

/**
 * Build a 2D transform that maps world coordinates (in metres, centred on
 * the pitch origin) to pixel coordinates on a FRAME_W x FRAME_H canvas.
 *
 * The transform uniformly scales the pitch so it fits within the canvas
 * minus the configured margin, then centres it.
 */
export function build2DTransform(pd: Partial<PitchDimensions> | undefined): Transform2D {
  const pl = pd?.length ?? DEFAULT_LENGTH
  const pw = pd?.width ?? DEFAULT_WIDTH
  const sx = (FRAME_W - 2 * PITCH_MARGIN) / pl
  const sy = (FRAME_H - 2 * PITCH_MARGIN) / pw
  const sc = Math.min(sx, sy)
  const ox = (FRAME_W - pl * sc) / 2
  const oy = (FRAME_H - pw * sc) / 2
  return { ox, oy, sc, pl, pw }
}

/**
 * Convert a world-space position (x, y) — where (0, 0) is the pitch centre
 * — to canvas pixel coordinates using the given transform.
 */
export function worldToPx(x: number, y: number, t: Transform2D): [number, number] {
  return [t.ox + (x + t.pl / 2) * t.sc, t.oy + (y + t.pw / 2) * t.sc]
}

/**
 * Pre-render all static pitch markings to an OffscreenCanvas so they can be
 * blitted in a single `drawImage` call each frame.
 *
 * Draws:
 *  - Green background (#1e7a1e)
 *  - White 2px lines: outer box, halfway line, centre circle + centre spot
 *  - Penalty areas (both ends)
 *  - Goal areas (both ends)
 *  - Penalty marks
 *  - Goal-line emphasis
 */
export function buildPitchCache(
  pd: Partial<PitchDimensions> | undefined,
  t: Transform2D,
): OffscreenCanvas {
  const oc = new OffscreenCanvas(FRAME_W, FRAME_H)
  const c = oc.getContext('2d')!

  // Background
  c.fillStyle = '#1e7a1e'
  c.fillRect(0, 0, FRAME_W, FRAME_H)

  // Resolved dimensions with defaults
  const D = {
    length: pd?.length ?? DEFAULT_LENGTH,
    width: pd?.width ?? DEFAULT_WIDTH,
    pal: pd?.penalty_area_length ?? DEFAULT_PAL,
    paw: pd?.penalty_area_width ?? DEFAULT_PAW,
    gal: pd?.goal_area_length ?? DEFAULT_GAL,
    gaw: pd?.goal_area_width ?? DEFAULT_GAW,
    gw: pd?.goal_width ?? DEFAULT_GW,
    ccr: pd?.center_circle_radius ?? DEFAULT_CCR,
    pmd: pd?.penalty_mark_distance ?? DEFAULT_PMD,
  }

  // Shorthand for worldToPx using the provided transform
  const p = (x: number, y: number): [number, number] => worldToPx(x, y, t)

  c.strokeStyle = LINE_COLOR
  c.lineWidth = 2

  // ── Outer box ──────────────────────────────────────────────────────────────
  const [tlX, tlY] = p(-D.length / 2, -D.width / 2)
  const [brX, brY] = p(D.length / 2, D.width / 2)
  c.strokeRect(tlX, tlY, brX - tlX, brY - tlY)

  // ── Halfway line ───────────────────────────────────────────────────────────
  const [m1x, m1y] = p(0, -D.width / 2)
  const [m2x, m2y] = p(0, D.width / 2)
  c.beginPath()
  c.moveTo(m1x, m1y)
  c.lineTo(m2x, m2y)
  c.stroke()

  // ── Centre circle + centre spot ────────────────────────────────────────────
  const [cX, cY] = p(0, 0)
  c.beginPath()
  c.arc(cX, cY, D.ccr * t.sc, 0, Math.PI * 2)
  c.stroke()

  c.fillStyle = LINE_COLOR
  c.beginPath()
  c.arc(cX, cY, 2, 0, Math.PI * 2)
  c.fill()

  // ── Helper: draw a stroked rectangle from two world corners ────────────────
  function rect(x1: number, y1: number, x2: number, y2: number) {
    const [ax, ay] = p(x1, y1)
    const [bx, by] = p(x2, y2)
    c.strokeRect(ax, ay, bx - ax, by - ay)
  }

  // ── Helper: draw a filled dot at a world position ──────────────────────────
  function dot(x: number, y: number) {
    const [px_, py_] = p(x, y)
    c.beginPath()
    c.arc(px_, py_, 2, 0, Math.PI * 2)
    c.fill()
  }

  // ── Helper: draw a line between two world positions ────────────────────────
  function line(x1: number, y1: number, x2: number, y2: number) {
    const [ax, ay] = p(x1, y1)
    const [bx, by] = p(x2, y2)
    c.beginPath()
    c.moveTo(ax, ay)
    c.lineTo(bx, by)
    c.stroke()
  }

  // ── Penalty areas ──────────────────────────────────────────────────────────
  rect(-D.length / 2, -D.paw / 2, -D.length / 2 + D.pal, D.paw / 2)
  rect(D.length / 2 - D.pal, -D.paw / 2, D.length / 2, D.paw / 2)

  // ── Goal areas ─────────────────────────────────────────────────────────────
  rect(-D.length / 2, -D.gaw / 2, -D.length / 2 + D.gal, D.gaw / 2)
  rect(D.length / 2 - D.gal, -D.gaw / 2, D.length / 2, D.gaw / 2)

  // ── Penalty marks ──────────────────────────────────────────────────────────
  c.fillStyle = LINE_COLOR
  dot(-D.length / 2 + D.pmd, 0)
  dot(D.length / 2 - D.pmd, 0)

  // ── Goal-line emphasis ─────────────────────────────────────────────────────
  line(-D.length / 2, -D.gw / 2, -D.length / 2, D.gw / 2)
  line(D.length / 2, -D.gw / 2, D.length / 2, D.gw / 2)

  return oc
}
