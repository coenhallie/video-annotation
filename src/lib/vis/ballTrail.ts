import type { Frame, Player } from './types';
import type { PhaseRecord } from './teamPhase';

/**
 * The ball's trail: a line from where a player played the ball to where the
 * ball is now, while it travels, and behind it the path the ball took before
 * that, as one line joined end to end. Each pass runs from where it was
 * played to where it was received; between one pass and the next, a straight
 * line runs from where it was received to where the player played it on, the
 * ground they carried it over. A move of several passes shows as one path,
 * turning wherever the ball changed hands. Like the team phase it is worked
 * out here from the pipeline's own frames, not reported by the pipeline.
 *
 * The ball has left a player once it is more than RELEASE_METRES from them,
 * not when their possession flag goes: the flag drops out for a frame or two
 * at a time while a player still has the ball at their feet. Until then the
 * point the line starts from follows the player, by track id. By the same
 * measure a flag on a player further than that from the ball is not taken to
 * mean they have it: on the Manchester City vs PSG export 1 flag in 30 is, up
 * to 24 m away, and each drew a line from that player to the ball. A player the
 * pipeline is not tracking (no track id, or -1) cannot be told apart from
 * anyone else it is not tracking, so the line starts from where they last had
 * the flag.
 *
 * A pass ends where the ball is when someone has it again, or where it was
 * last seen TRAIL_HOLD_S after it was played if nobody has had it by then (a
 * shot, a clearance, the ball going out). A ball a player plays and gets back
 * themselves was a touch, not a pass. Each line stays on screen for
 * TRAIL_HISTORY_S after the ball reached its end, fading over the last
 * TRAIL_FADE_S of that, so the path fades away from its oldest end.
 *
 * Only frames within TRAIL_LOOKBACK_S of the frame asked about are read, so
 * the answer is the same whether the replay played into the frame or seeked
 * to it.
 */

/** Further than this from the player, the ball has left them. */
export const RELEASE_METRES = 2.5;
/** How long a pass can travel before it ends where the ball then is. */
export const TRAIL_HOLD_S = 3;
/** How long a line stays on screen after the ball reached its end. */
export const TRAIL_HISTORY_S = 6;
/** How long a line takes to fade out at the end of TRAIL_HISTORY_S. */
export const TRAIL_FADE_S = 1.5;
/**
 * A pass played on from closer than this to where the one before it was
 * received starts where that one ended, rather than with a line too short to
 * see between them.
 */
export const JOIN_METRES = 1;
/**
 * How far back the trail reads: past the start of the oldest pass still on
 * screen (ended TRAIL_HISTORY_S ago, after travelling up to TRAIL_HOLD_S),
 * with room before that for the frame its player last had the flag in.
 */
export const TRAIL_LOOKBACK_S = TRAIL_HISTORY_S + TRAIL_HOLD_S + 4;

export interface Point {
  x: number;
  y: number;
}

/** One stretch of the ball's path: a pass, or the ground carried between two. */
export interface TrailLine {
  from: Point;
  to: Point;
  /** How strongly it is drawn, from 0 to 1: below 1 only as it fades out. */
  strength: number;
}

export interface BallTrail {
  /**
   * The path the ball has taken, oldest first, each line starting where the
   * one before it ended.
   */
  lines: TrailLine[];
  /**
   * Where the ball in flight now was played from, or null when it is not in
   * flight. Its line ends at the frame's own ball; the path, when there is
   * one, ends where it starts.
   */
  from: Point | null;
}

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Whether two trails draw the same, so a caller can keep the one it has. */
export function sameTrail(a: BallTrail | null, b: BallTrail | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.from === null || b.from === null ? a.from !== b.from : !samePoint(a.from, b.from)) {
    return false;
  }
  return (
    a.lines.length === b.lines.length &&
    a.lines.every((p, i) => {
      const q = b.lines[i]!;
      return samePoint(p.from, q.from) && samePoint(p.to, q.to) && p.strength === q.strength;
    })
  );
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

/**
 * The player flagged with the ball, and their team, unless the ball is
 * tracked further than RELEASE_METRES from them. Officials never have it.
 */
function carrierOf(frame: Frame, ball: Point | null): { player: Player; teamId: number } | null {
  for (const team of frame.teams ?? []) {
    const teamId = team.team_id ?? -1;
    if (teamId === -1) continue;
    for (const player of team.players ?? []) {
      if (!player.in_possession) continue;
      const at = position(player);
      if (ball && at && Math.hypot(ball.x - at.x, ball.y - at.y) > RELEASE_METRES) continue;
      return { player, teamId };
    }
  }
  return null;
}

type TrackId = NonNullable<Player['track_id']>;

/** The player who last had the ball, until it leaves them. */
interface Holder {
  id: TrackId | null;
  teamId: number;
  at: Point | null;
}

/** The ball since it left a player, until someone has it or it stops. */
interface Flight {
  from: Point;
  by: TrackId | null;
  at: number;
  /** Where it was last seen. */
  ball: Point | null;
}

/** A track id that names one player, rather than "not tracked". */
function followable(id: Player['track_id']): TrackId | null {
  return id != null && Number(id) >= 0 ? id : null;
}

function findPlayer(frame: Frame, teamId: number, id: TrackId): Player | null {
  const team = (frame.teams ?? []).find((t) => (t.team_id ?? -1) === teamId);
  return (team?.players ?? []).find((p) => p.track_id === id) ?? null;
}

/** The trail at `records[index]`, from the records before it; null for none. */
export function ballTrailAt(records: PhaseRecord[], index: number): BallTrail | null {
  const now = records[index];
  if (!now) return null;

  let start = index;
  while (start > 0 && (records[start - 1]?.t ?? -Infinity) >= now.t - TRAIL_LOOKBACK_S) start--;

  // Who last had the ball, and the ball in flight once it has left them.
  let holder: Holder | null = null;
  let flight: Flight | null = null;
  const lines: { from: Point; to: Point; endedAt: number }[] = [];
  const land = (landed: Flight, to: Point | null, endedAt: number) => {
    if (to) lines.push({ from: landed.from, to, endedAt });
  };

  for (let i = start; i <= index; i++) {
    const record = records[i];
    if (!record) continue;
    const { t, frame } = record;
    const ball = ballOf(frame);
    const carrier = carrierOf(frame, ball);

    if (carrier) {
      const id = followable(carrier.player.track_id);
      if (flight) {
        // Played and got back by the same player: a touch, not a pass.
        if (id === null || id !== flight.by) {
          land(flight, ball ?? position(carrier.player) ?? flight.ball, t);
        }
        flight = null;
      }
      holder = { id, teamId: carrier.teamId, at: position(carrier.player) };
      continue;
    }

    if (flight) {
      if (ball) flight.ball = ball;
      // Nobody has had it in time: it ends where it was last seen.
      if (t - flight.at > TRAIL_HOLD_S) {
        land(flight, flight.ball, t);
        flight = null;
        holder = null;
      }
      continue;
    }

    if (holder) {
      if (holder.id !== null) {
        const player = findPlayer(frame, holder.teamId, holder.id);
        const at = player && position(player);
        if (at) holder.at = at;
      }
      const from: Point | null = holder.at;
      if (ball && from && Math.hypot(ball.x - from.x, ball.y - from.y) > RELEASE_METRES) {
        // Joined to the path so far: across the ground the ball was carried
        // over since it last ended, or straight on from there when that is
        // too short to see.
        const end = lines.at(-1)?.to;
        let playedFrom: Point = from;
        if (end && Math.hypot(from.x - end.x, from.y - end.y) < JOIN_METRES) playedFrom = end;
        else if (end) lines.push({ from: end, to: from, endedAt: t });
        flight = { from: playedFrom, by: holder.id, at: t, ball };
        holder = null;
      }
    }
  }

  const shown = lines
    .map(({ from, to, endedAt }) => ({
      from,
      to,
      strength: Math.min(1, (TRAIL_HISTORY_S - (now.t - endedAt)) / TRAIL_FADE_S),
    }))
    .filter((p) => p.strength > 0);
  const from = flight && ballOf(now.frame) ? flight.from : null;
  return shown.length > 0 || from ? { lines: shown, from } : null;
}
