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

  it('gives the two teams different fills when neither carries colours', () => {
    expect(resolveTeamColors(team(), 0).fill).not.toBe(
      resolveTeamColors(team(), 1).fill
    );
  });
});
