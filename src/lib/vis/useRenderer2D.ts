// Vendored from datalabelling-frontend/src/lib/vis/ on 2026-08-22. Keep edits
// minimal so the two copies stay diffable. Deliberate differences from the
// vendored copy:
//  - the unused FRAME_W import was dropped, because it lints as an error here.
//  - draw2DOverlay no longer draws the frame-count label. It is drawn onto the
//    canvas bitmap, which is zoomed and panned, so the label slid off-screen
//    under zoom. PipelineOutputSurface.vue draws its own fixed frame label.
//  - zoom/pan is applied here via setView() rather than as a CSS transform on
//    the canvas element. The element has to stay unscaled so a drawing layer
//    can share its coordinate system; see viewTransform.ts.
//  - the canvas bitmap is whatever size the surface gives it - one pixel per
//    device pixel - and drawing is scaled from frame units into it. The pitch
//    cache is built at that size through the current view, and rebuilt when
//    either changes, instead of once at 1280x720 and then magnified.
//  - players are coloured by role from fixed colours (constants.ts,
//    PERSON_COLORS): home red, away blue, goalkeepers yellow ringed in their
//    team's colour, officials magenta. The vendored copy coloured each team
//    from the kit colours the pipeline detected; that resolver is gone.
//  - players further than FOCUS_METRES from the ball are faded
//    (DIMMED_PLAYER_ALPHA) and drawn underneath the rest, and while a team has
//    the ball the carrier and their teammates within NEARBY_METRES are
//    outlined in white.
//  - goals (posts and a faint net) are drawn on every frame, and renderFrame
//    takes an optional goal-sequence overlay whose ball replaces the tracked
//    one (goalNets.ts, goalSequence.ts).

// ---------------------------------------------------------------------------
// 2D canvas rendering composable.
// Ported from render2DFrame(), draw2DPlayer(), draw2DBall(), draw2DOverlay()
// in the original index.html (lines 552-631).
//
// Usage:
//   const { renderFrame, invalidateCache } = useRenderer2D(canvas)
// ---------------------------------------------------------------------------

import type { Player, Ball, Frame, Transform2D } from './types'
import {
  FRAME_W,
  FRAME_H,
  PLAYER_RADIUS,
  PERSON_COLORS,
  DIMMED_PLAYER_ALPHA,
  FOCUS_METRES,
  NEARBY_OUTLINE,
  NEARBY_METRES,
} from './constants'
import { build2DTransform, worldToPx, buildPitchCache } from './pitchGeometry'
import { drawGoalNets, type NetBulge } from './goalNets'
import {
  computeViewMatrix,
  IDENTITY_VIEW,
  type PipelineView,
  type ViewMatrix,
} from './viewTransform'

/**
 * What the goal sequence draws over a frame: its own ball, where that ball just
 * was, and the net it hit. Positions in pitch metres. See goalSequence.ts.
 */
export interface GoalOverlay {
  ball: { x: number; y: number }
  trail: { x: number; y: number }[]
  net: NetBulge
}

/**
 * Create a 2D renderer bound to a specific canvas element.
 *
 * Returns:
 *  - `renderFrame(frame)` — draws the given Frame.
 *  - `invalidateCache()` — clears the cached pitch image and transform so
 *     they are rebuilt on the next render (call when switching back from 3D).
 */
export function useRenderer2D(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!

  // Zoom and pan live here rather than as a CSS transform on the canvas
  // element. The element has to stay unscaled so a drawing layer can sit over it
  // in the same coordinate system - see viewTransform.ts.
  let view: ViewMatrix = IDENTITY_VIEW

  // Internal (non-reactive) caches — rebuilt lazily on first render or after
  // invalidateCache().
  let transform2d: Transform2D | null = null
  let pitchCache: OffscreenCanvas | null = null
  // The bitmap size and matrix the cache was drawn for. A pan, a zoom or a
  // resize changes it, and only then is the pitch drawn again.
  let pitchKey = ''

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Render a single frame.  Draws the cached pitch background,
   * iterates teams/players/balls, and paints the HUD overlay.
   */
  function renderFrame(frame: Frame, overlay?: GoalOverlay): void {
    if (!frame) return

    const pd = frame.pitch_dimensions

    if (!transform2d) transform2d = build2DTransform(pd)

    // Everything is drawn in frame units (1280x720). The bitmap is sized to
    // the display, so scale frame units into it, then apply the view.
    const sx = canvas.width / FRAME_W
    const sy = canvas.height / FRAME_H
    const matrix: [number, number, number, number, number, number] = [
      sx * view.a,
      sy * view.b,
      sx * view.c,
      sy * view.d,
      sx * view.e,
      sy * view.f,
    ]

    const key = `${canvas.width}x${canvas.height}:${matrix.join(',')}`
    if (!pitchCache || key !== pitchKey) {
      pitchCache = buildPitchCache(pd, transform2d, {
        width: canvas.width,
        height: canvas.height,
        matrix,
      })
      pitchKey = key
    }

    // Cleared to transparent, not filled: panning used to slide the canvas
    // element and reveal the stage behind it, and letting the stage show
    // through here keeps that looking the same.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // The pitch is already drawn through the view, pixel for pixel.
    ctx.drawImage(pitchCache, 0, 0)

    ctx.setTransform(...matrix)

    // Goals, faint, on every frame; a struck net bows out while it is hit.
    drawGoalNets(ctx as CanvasRenderingContext2D, pd, transform2d, overlay?.net)

    // ── Teams + players ────────────────────────────────────────────────────
    // Players far from the ball are faded and drawn first, so the play around
    // the ball sits on top where markers overlap. Officials are never faded.
    // During the goal sequence the focus follows its ball, not the tracked one.
    const focus = overlay?.ball ?? trackedBall(frame)
    const carrier = ballCarrier(frame)
    const withBall = carrier?.teamId ?? null
    const people = (frame.teams ?? []).flatMap((team) => {
      const tid = team.team_id ?? -1
      return (team.players ?? []).map((player) => ({
        player,
        tid,
        faded: isFarFromBall(player, tid, focus),
      }))
    })
    for (const faded of [true, false]) {
      ctx.globalAlpha = faded ? DIMMED_PLAYER_ALPHA : 1
      for (const p of people) {
        if (p.faded !== faded) continue
        draw2DPlayer(p.player, p.tid, p.tid === withBall && isNearCarrier(p.player, carrier))
      }
    }
    ctx.globalAlpha = 1

    // During the goal sequence its ball replaces the tracked one, which near a
    // goal tends to jump about or go straight through the net.
    if (overlay) {
      overlay.trail.forEach((p, i) => {
        draw2DBall({ projected_coordinates: p }, 0.45 / (i + 1))
      })
      draw2DBall({ projected_coordinates: overlay.ball })
    } else {
      for (const ball of frame.balls ?? []) {
        draw2DBall(ball)
      }
    }

    // ── Overlay HUD ────────────────────────────────────────────────────────
    const fc = frame.frame_data?.[0]?.frame_count ?? null
    const actions = frame.state?.actions ?? []
    draw2DOverlay(fc, actions)
  }

  /**
   * Clear cached pitch image and transform.  Call this when switching back
   * from 3D mode so the next render rebuilds everything.
   */
  function invalidateCache(): void {
    pitchCache = null
    transform2d = null
  }

  // ── Internal drawing helpers ──────────────────────────────────────────────

  /** The player with the ball in this frame and their team, or null. */
  function ballCarrier(
    frame: Frame,
  ): { teamId: number; x: number; y: number } | null {
    for (const team of frame.teams ?? []) {
      const tid = team.team_id ?? -1
      if (tid === -1) continue
      const player = (team.players ?? []).find((p) => p.in_possession)
      if (!player) continue
      const { x, y } = player.projected_coordinates ?? {}
      // Possession still counts without a usable position; only "nearby" needs one.
      return { teamId: tid, x: x ?? NaN, y: y ?? NaN }
    }
    return null
  }

  /** The tracked ball's position, or null when the frame has none usable. */
  function trackedBall(frame: Frame): { x: number; y: number } | null {
    for (const ball of frame.balls ?? []) {
      const { x, y } = ball.projected_coordinates ?? {}
      if (x != null && y != null && !isNaN(x) && !isNaN(y)) return { x, y }
    }
    return null
  }

  /** A player, not an official, further than FOCUS_METRES from the ball. */
  function isFarFromBall(
    player: Player,
    teamId: number,
    ball: { x: number; y: number } | null,
  ): boolean {
    if (!ball || teamId === -1) return false
    if (String(player.person_type ?? '').toUpperCase().includes('OFFICIAL')) return false
    const x = player.projected_coordinates?.x
    const y = player.projected_coordinates?.y
    if (x == null || y == null) return false
    return Math.hypot(x - ball.x, y - ball.y) > FOCUS_METRES
  }

  /** Within NEARBY_METRES of the carrier, on the pitch (the carrier included). */
  function isNearCarrier(
    player: Player,
    carrier: { x: number; y: number } | null,
  ): boolean {
    const x = player.projected_coordinates?.x
    const y = player.projected_coordinates?.y
    if (!carrier || x == null || y == null) return false
    return Math.hypot(x - carrier.x, y - carrier.y) <= NEARBY_METRES
  }

  /**
   * Draw a single player as a filled circle with shadow, outline, optional
   * possession ring, jersey number, and track ID label.
   */
  function draw2DPlayer(player: Player, teamId: number, nearBall = false): void {
    const coords = player.projected_coordinates
    const x = coords?.x
    const y = coords?.y
    if (x == null || y == null || isNaN(x) || isNaN(y)) return
    if (!transform2d) return

    const [px, py] = worldToPx(x, y, transform2d)
    const pt = String(player.person_type ?? '').toUpperCase()

    // Fixed colours by role; see PERSON_COLORS. Team 0 is home, team 1 away.
    const team =
      teamId === 0 ? PERSON_COLORS.home : teamId === 1 ? PERSON_COLORS.away : null
    let colors = team ?? PERSON_COLORS.unknown
    let outline = colors.outline
    let outlineWidth = 2
    if (pt.includes('GOALKEEPER')) {
      colors = PERSON_COLORS.goalkeeper
      // Ringed in their team's colour, so which team they keep for still shows.
      outline = team?.fill ?? colors.outline
      outlineWidth = 3
    } else if (pt.includes('OFFICIAL') || teamId === -1) {
      colors = PERSON_COLORS.official
      outline = colors.outline
    }
    // White marks the players around the ball, and only them.
    if (nearBall) outline = NEARBY_OUTLINE

    // Shadow (offset 1px down-right)
    ctx.beginPath()
    ctx.arc(px + 1, py + 1, PLAYER_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fill()

    // Player circle
    ctx.beginPath()
    ctx.arc(px, py, PLAYER_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = colors.fill
    ctx.fill()
    ctx.strokeStyle = outline
    ctx.lineWidth = outlineWidth
    ctx.stroke()

    // Possession ring (gold)
    if (player.in_possession) {
      ctx.beginPath()
      ctx.arc(px, py, PLAYER_RADIUS + 4, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffd700'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Jersey number (centred inside the circle)
    const num = player.player_number
    if (num != null && Number(num) > 0) {
      ctx.fillStyle = colors.text
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(Math.round(Number(num))), px, py)
    }

    // Track ID (above the player)
    const trackId = player.track_id
    if (trackId != null && Number(trackId) >= 0) {
      ctx.fillStyle = '#aaaaaa'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(String(trackId), px, py - PLAYER_RADIUS - 2)
    }
  }

  /**
   * Draw a single ball.  Radius and colour vary with the z (height)
   * coordinate: taller balls are slightly larger and tinted cyan.
   */
  function draw2DBall(ball: Ball, alpha = 1): void {
    const coords = ball.projected_coordinates
    const x = coords?.x
    const y = coords?.y
    const z = coords?.z ?? 0
    if (x == null || y == null || isNaN(x) || isNaN(y)) return
    if (!transform2d) return

    const [px, py] = worldToPx(x, y, transform2d)

    // Radius grows with z (clamped 0-6), base radius 4px, min 3px
    const r = Math.max(3, Math.round(4 + Math.min(6, Math.max(0, z)) * 0.6))

    const before = ctx.globalAlpha
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fillStyle = z <= 0.5 ? '#ffffff' : '#c8ffff'
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.globalAlpha = before
  }

  /**
   * Draw the action-type text (bottom-left).
   *
   * The frame-count label used to be drawn here too (top-left), but that put
   * it inside the canvas bitmap, which the surface's zoom/pan is a CSS
   * transform on - so it slid off-screen under zoom instead of staying put
   * like an overlay should. PipelineOutputSurface.vue now draws that label
   * itself, fixed outside the canvas. `frameCount` stays a parameter so this
   * still mirrors the vendored signature.
   */
  function draw2DOverlay(
    frameCount: number | null | undefined,
    actions: { action_type?: string }[],
  ): void {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 16px sans-serif'

    const at = actions
      .filter((a) => a.action_type)
      .map((a) => String(a.action_type).trim())
      .join(', ')

    if (at) {
      ctx.font = '600 14px sans-serif'
      ctx.textBaseline = 'bottom'
      ctx.fillText(at, 20, FRAME_H - 20)
    }
  }

  /**
   * Set the zoom/pan applied to every subsequent frame. Takes the surface's raw
   * view - screen-pixel pan included - and resolves it into canvas space.
   */
  function setView(next: PipelineView): void {
    view = computeViewMatrix(next)
  }

  return { renderFrame, invalidateCache, setView }
}
