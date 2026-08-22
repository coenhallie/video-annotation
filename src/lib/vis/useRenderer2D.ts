// Vendored from datalabelling-frontend/src/lib/vis/ on 2026-08-22. Keep edits
// minimal so the two copies stay diffable.

// ---------------------------------------------------------------------------
// 2D canvas rendering composable.
// Ported from render2DFrame(), draw2DPlayer(), draw2DBall(), draw2DOverlay()
// in the original index.html (lines 552-631).
//
// Usage:
//   const { renderFrame, invalidateCache } = useRenderer2D(canvas)
// ---------------------------------------------------------------------------

import type { Player, Ball, TeamColors, Frame, Transform2D } from './types'
import { FRAME_W, FRAME_H, PLAYER_RADIUS } from './constants'
import { build2DTransform, worldToPx, buildPitchCache } from './pitchGeometry'
import { resolveTeamColors } from './useColorResolver'

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
   * Draw the frame-count label (top-left) and action-type text (bottom-left).
   */
  function draw2DOverlay(
    frameCount: number | null | undefined,
    actions: { action_type?: string }[],
  ): void {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 16px sans-serif'

    if (frameCount != null) {
      ctx.fillText(`Frame ${frameCount}`, 20, 20)
    }

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

  return { renderFrame, invalidateCache }
}
