import { describe, it, expect } from 'vitest';
import { resolveTeamColors } from '@/lib/vis/useColorResolver';
import type { Team } from '@/lib/vis/types';

const team = (over: Partial<Team> = {}): Team =>
  ({ team_id: 0, players: [], ...over }) as Team;

describe('resolveTeamColors', () => {
  it('returns CSS colour strings and an rgb tuple', () => {
    const c = resolveTeamColors(
      team({ ordered_colors: [[232, 205, 204], [207, 112, 129], [137, 54, 57]] }),
      0
    );
    expect(typeof c.fill).toBe('string');
    expect(typeof c.outline).toBe('string');
    expect(typeof c.text).toBe('string');
    expect(c.fillRgb).toHaveLength(3);
  });

  it('returns a usable set for a team carrying no colour data', () => {
    const c = resolveTeamColors(team(), 1);
    expect(c.fill).toBeTruthy();
    expect(c.outline).toBeTruthy();
    expect(c.fillRgb.every((n) => n >= 0 && n <= 255)).toBe(true);
  });

  // The renderer must be able to tell a colour the pipeline reported from one
  // this code chose, so that absence can be drawn as absence rather than as a
  // confident red or blue the pipeline never produced.
  it('reports a colour taken from the frame as detected', () => {
    const c = resolveTeamColors(
      team({ ordered_colors: [[232, 205, 204], [207, 112, 129], [137, 54, 57]] }),
      0
    );
    expect(c.detected).toBe(true);
  });

  it('reports a team carrying no colour data as not detected', () => {
    expect(resolveTeamColors(team(), 1).detected).toBe(false);
  });

  it('reports a team whose ordered_colors is too short to use as not detected', () => {
    expect(resolveTeamColors(team({ ordered_colors: [[1, 2, 3]] }), 0).detected).toBe(
      false
    );
  });

  // Replaces an earlier test that asserted the opposite. Two undetected teams
  // rendering as different colours is the fabrication being removed: the
  // difference came from team_id, not from anything in the frame.
  it('gives the two teams the same undetected fill when neither carries colours', () => {
    expect(resolveTeamColors(team(), 0).fill).toBe(resolveTeamColors(team(), 1).fill);
  });
});
