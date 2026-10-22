import type { Frame, Player } from './types';
import { PHASE_LOOKBACK_S, type PhaseRecord } from './teamPhase';

/**
 * The ball's trail: a line from where a player played the ball to where the
 * ball is now, drawn while it travels to whoever gets it next. Like the team
 * phase it is worked out here from the pipeline's own frames, not reported by
 * the pipeline.
 *
 * The ball has left a player once it is more than RELEASE_METRES from them,
 * not when their possession flag goes: the flag drops out for a frame or two
 * at a time while a player still has the ball at their feet. Until then the
 * point the line starts from follows the player, by track id. A player the
 * pipeline is not tracking (no track id, or -1) cannot be told apart from
 * anyone else it is not tracking, so the line starts from where they last had
 * the flag.
 *
 * The trail lasts until someone has the ball again, or for TRAIL_HOLD_S after
 * the ball left, fading over the last TRAIL_FADE_S of that. A frame without a
 * tracked ball has no trail: there is nothing for it to end at.
 *
 * Only frames within TRAIL_LOOKBACK_S of the frame asked about are read, the
 * same history the team phase reads, so the answer is the same whether the
 * replay played into the frame or seeked to it.
 */

/** Further than this from the player, the ball has left them. */
export const RELEASE_METRES = 2.5;
/** How long the trail lasts after the ball left, if nobody gets it first. */
export const TRAIL_HOLD_S = 3;
/** How long the trail takes to fade out at the end of TRAIL_HOLD_S. */
export const TRAIL_FADE_S = 0.3;
/** How far back the trail looks for the player who last had the ball. */
export const TRAIL_LOOKBACK_S = PHASE_LOOKBACK_S;

interface Point {
  x: number;
  y: number;
}

export interface BallTrail {
  /** Where the ball was played from, in pitch metres. */
  from: Point;
  /** How strongly it is drawn, from 0 to 1: below 1 only as it fades out. */
  strength: number;
}

/** Whether two trails draw the same, so a caller can keep the one it has. */
export function sameTrail(a: BallTrail | null, b: BallTrail | null): boolean {
  if (a === null || b === null) return a === b;
  return a.from.x === b.from.x && a.from.y === b.from.y && a.strength === b.strength;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function position(player: Player): Point | null {
  const { x, y } = player.projected_coordinates ?? {};
  return finite(x) && finite(y) ? { x, y } : null;
}

/** The tracked ball's position, or null when the frame has none usable. */
function ballOf(frame: Frame): Point | null {
  for (const ball of frame.balls ?? []) {
    const { x, y } = ball.projected_coordinates ?? {};
    if (finite(x) && finite(y)) return { x, y };
  }
  return null;
}

/** The player flagged with the ball, and their team; officials never are. */
function carrierOf(frame: Frame): { player: Player; teamId: number } | null {
  for (const team of frame.teams ?? []) {
    const teamId = team.team_id ?? -1;
    if (teamId === -1) continue;
    const player = (team.players ?? []).find((p) => p.in_possession);
    if (player) return { player, teamId };
  }
  return null;
}

/** A track id that names one player, rather than "not tracked". */
function followable(id: Player['track_id']): id is NonNullable<Player['track_id']> {
  return id != null && Number(id) >= 0;
}

function findPlayer(frame: Frame, teamId: number, id: NonNullable<Player['track_id']>) {
  const team = (frame.teams ?? []).find((t) => (t.team_id ?? -1) === teamId);
  return (team?.players ?? []).find((p) => p.track_id === id) ?? null;
}

/** The trail at `records[index]`, from the records before it; null for none. */
export function ballTrailAt(records: PhaseRecord[], index: number): BallTrail | null {
  const now = records[index];
  if (!now || carrierOf(now.frame) || !ballOf(now.frame)) return null;

  let start = index;
  while (start > 0 && (records[start - 1]?.t ?? -Infinity) >= now.t - TRAIL_LOOKBACK_S) start--;

  // The last frame anyone had the ball in.
  let held = index - 1;
  while (held >= start && !(records[held] && carrierOf(records[held]!.frame))) held--;
  const heldRecord = records[held];
  if (held < start || !heldRecord) return null;
  const carrier = carrierOf(heldRecord.frame)!;

  // Follow them until the ball is far enough from them to have left.
  let from = position(carrier.player);
  const id = followable(carrier.player.track_id) ? carrier.player.track_id : null;
  let releasedAt: number | null = null;
  for (let i = held + 1; i <= index; i++) {
    const record = records[i];
    if (!record) continue;
    if (id !== null) {
      const holder = findPlayer(record.frame, carrier.teamId, id);
      const at = holder && position(holder);
      if (at) from = at;
    }
    const ball = ballOf(record.frame);
    if (ball && from && Math.hypot(ball.x - from.x, ball.y - from.y) > RELEASE_METRES) {
      releasedAt = record.t;
      break;
    }
  }
  if (releasedAt === null || !from) return null;

  const left = TRAIL_HOLD_S - (now.t - releasedAt);
  const strength = Math.min(1, left / TRAIL_FADE_S);
  return strength > 0 ? { from, strength } : null;
}
