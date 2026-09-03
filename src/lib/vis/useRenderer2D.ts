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

// ---------------------------------------------------------------------------
// 2D canvas rendering composable.
// Ported from render2DFrame(), draw2DPlayer(), draw2DBall(), draw2DOverlay()
// in the original index.html (lines 552-631).
//
// Usage:
//   const { renderFrame, invalidateCache } = useRenderer2D(canvas)
// ---------------------------------------------------------------------------

import type { Player, Ball, TeamColors, Frame, Transform2D } from './types'
import { FRAME_H, PLAYER_RADIUS } from './constants'
import { build2DTransform, worldToPx, buildPitchCache } from './pitchGeometry'
import { resolveTeamColors } from './useColorResolver'
import {
  computeViewMatrix,
  IDENTITY_VIEW,
  type PipelineView,
  type ViewMatrix,
} from './viewTransform'

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

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Render a single frame.  Draws the cached pitch background,
   * iterates teams/players/balls, and paints the HUD overlay.
   */
  function renderFrame(frame: Frame): void {
    if (!frame) return

    const pd = frame.pitch_dimensions

    // Lazily build / cache transform and pitch image
    if (!transform2d) transform2d = build2DTransform(pd)
    if (!pitchCache) pitchCache = buildPitchCache(pd, transform2d)

    // Cleared to transparent, not filled: panning used to slide the canvas
    // element and reveal the stage behind it, and letting the stage show
    // through here keeps that looking the same.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(view.a, view.b, view.c, view.d, view.e, view.f)

    // Blit the pre-rendered pitch
    ctx.drawImage(pitchCache, 0, 0)

    // ── Teams + players ────────────────────────────────────────────────────
    for (const team of frame.teams ?? []) {
      const tid = team.team_id ?? -1
      const colors = resolveTeamColors(team, tid)
      for (const player of team.players ?? []) {
        draw2DPlayer(player, colors, tid)
      }
    }

    // ── Balls ──────────────────────────────────────────────────────────────
    for (const ball of frame.balls ?? []) {
      draw2DBall(ball)
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

  /**
   * Draw a single player as a filled circle with shadow, outline, optional
   * possession ring, jersey number, and track ID label.
   */
  function draw2DPlayer(player: Player, colors: TeamColors, teamId: number): void {
    const coords = player.projected_coordinates
    const x = coords?.x
    const y = coords?.y
    if (x == null || y == null || isNaN(x) || isNaN(y)) return
    if (!transform2d) return

    const [px, py] = worldToPx(x, y, transform2d)
    const pt = String(player.person_type ?? '').toUpperCase()
    const tid = teamId

    // Resolve fill / outline / text colours based on person type
    let fill: string
    let outline: string
    let textColor: string
    // Dashed means "the frame reported no colour for this team". Only the
    // team-coloured branch can be undetected: the other two are keyed on
    // person_type, which the frame does state.
    let undetected = false

    if (pt.includes('GOALKEEPER')) {
      fill = '#00af4b'
      outline = '#000'
      textColor = '#000'
    } else if (pt.includes('OFFICIAL') || tid === -1) {
      fill = '#323232'
      outline = '#000'
      textColor = '#f0f0f0'
    } else {
      fill = colors.fill
      outline = colors.outline
      textColor = colors.text
      undetected = !colors.detected
    }

    // Shadow (offset 1px down-right)
    ctx.beginPath()
    ctx.arc(px + 1, py + 1, PLAYER_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fill()

    // Player circle
    ctx.beginPath()
    ctx.arc(px, py, PLAYER_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = outline
    ctx.lineWidth = 2
    if (undetected) ctx.setLineDash([3, 3])
    ctx.stroke()
    if (undetected) ctx.setLineDash([])

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
      ctx.fillStyle = textColor
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
  function draw2DBall(ball: Ball): void {
    const coords = ball.projected_coordinates
    const x = coords?.x
    const y = coords?.y
    const z = coords?.z ?? 0
    if (x == null || y == null || isNaN(x) || isNaN(y)) return
    if (!transform2d) return

    const [px, py] = worldToPx(x, y, transform2d)

    // Radius grows with z (clamped 0-6), base radius 4px, min 3px
    const r = Math.max(3, Math.round(4 + Math.min(6, Math.max(0, z)) * 0.6))

    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fillStyle = z <= 0.5 ? '#ffffff' : '#c8ffff'
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.stroke()
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
