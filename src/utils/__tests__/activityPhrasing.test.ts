import { describe, it, expect } from 'vitest';
import {
  activityVerb,
  activitySubject,
  activityExcerpt,
  activityDayKey,
  activityDayLabel,
  groupActivityByDay,
  UNKNOWN_ACTOR,
} from '@/utils/activityPhrasing';
import type {
  ActivityAction,
  ActivityEntityType,
  ActivityEntry,
} from '@/types/database';

function entry(over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'e1',
    videoId: 'v1',
    comparisonVideoId: null,
    actorId: 'u1',
    actorName: null,
    entityType: 'annotation',
    entityId: 'a1',
    action: 'created',
    summary: { title: 'Ball out of frame', timestamp: 12.5 },
    createdAt: '2026-08-25T10:00:00.000Z',
    actor: 'Alice',
    live: true,
    ...over,
  };
}

describe('activityVerb', () => {
  const cases: Array<[ActivityEntityType, ActivityAction, string]> = [
    ['annotation', 'created', 'added'],
    ['annotation', 'updated', 'edited'],
    ['annotation', 'deleted', 'removed'],
    ['comment', 'created', 'commented on'],
    ['comment', 'deleted', 'removed a comment on'],
  ];

  it.each(cases)('%s %s reads as "%s"', (entityType, action, verb) => {
    expect(activityVerb(entry({ entityType, action }))).toBe(verb);
  });

  // A comment update cannot happen: the trigger has no UPDATE branch. If one is
  // ever added, this must not render an empty verb.
  it('falls back to a readable verb for an unmodelled pair', () => {
    expect(activityVerb(entry({ entityType: 'comment', action: 'updated' })))
      .toBe('changed a comment on');
  });
});

describe('activitySubject', () => {
  it('uses the annotation title snapshot', () => {
    expect(activitySubject(entry())).toBe('Ball out of frame');
  });

  it('uses the parent title for a comment', () => {
    expect(
      activitySubject(
        entry({
          entityType: 'comment',
          summary: { annotationTitle: 'Offside call', excerpt: 'looks wrong' },
        })
      )
    ).toBe('Offside call');
  });

  it('falls back when the snapshot has no title', () => {
    expect(activitySubject(entry({ summary: {} }))).toBe('an annotation');
  });

  it('falls back when the title is an empty string', () => {
    expect(activitySubject(entry({ summary: { title: '' } }))).toBe(
      'an annotation'
    );
  });
});

describe('activityExcerpt', () => {
  it('returns the comment excerpt', () => {
    expect(
      activityExcerpt(
        entry({ entityType: 'comment', summary: { excerpt: 'looks wrong' } })
      )
    ).toBe('looks wrong');
  });

  it('returns nothing for an annotation', () => {
    expect(activityExcerpt(entry())).toBe('');
  });
});

describe('activityDayKey', () => {
  it('keys by local calendar day', () => {
    expect(activityDayKey('2026-08-25T10:00:00.000Z')).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    );
  });

  it('keys by local calendar day, not UTC', () => {
    // Both ends of a local day. In any timezone with a non-zero offset at least
    // one of these lands on a different UTC date, so a getUTC*-based
    // implementation returns the neighbouring day and fails. Under UTC itself
    // both agree and the test simply passes - it can never false-fail.
    const earlyLocal = new Date(2026, 7, 25, 0, 30);
    const lateLocal = new Date(2026, 7, 25, 23, 30);
    expect(activityDayKey(earlyLocal.toISOString())).toBe('2026-08-25');
    expect(activityDayKey(lateLocal.toISOString())).toBe('2026-08-25');
  });

  it('returns an empty key for an unparseable timestamp', () => {
    expect(activityDayKey('not a date')).toBe('');
  });
});

describe('activityDayLabel', () => {
  const now = new Date('2026-08-25T15:00:00.000Z');

  it('labels today', () => {
    expect(activityDayLabel(activityDayKey(now.toISOString()), now)).toBe(
      'TODAY'
    );
  });

  it('labels yesterday', () => {
    const yesterday = new Date('2026-08-24T15:00:00.000Z');
    expect(
      activityDayLabel(activityDayKey(yesterday.toISOString()), now)
    ).toBe('YESTERDAY');
  });

  it('falls back to a date for anything older', () => {
    const old = new Date('2026-07-01T15:00:00.000Z');
    const label = activityDayLabel(activityDayKey(old.toISOString()), now);
    expect(label).not.toBe('TODAY');
    expect(label).not.toBe('YESTERDAY');
    expect(label.length).toBeGreaterThan(0);
  });
});

describe('groupActivityByDay', () => {
  const now = new Date('2026-08-25T15:00:00.000Z');

  it('groups entries by day, newest day first', () => {
    const groups = groupActivityByDay(
      [
        entry({ id: 'a', createdAt: '2026-08-25T10:00:00.000Z' }),
        entry({ id: 'b', createdAt: '2026-08-24T10:00:00.000Z' }),
        entry({ id: 'c', createdAt: '2026-08-25T09:00:00.000Z' }),
      ],
      now
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('TODAY');
    expect(groups[0].entries.map((e) => e.id)).toEqual(['a', 'c']);
    expect(groups[1].label).toBe('YESTERDAY');
    expect(groups[1].entries.map((e) => e.id)).toEqual(['b']);
  });

  it('returns nothing for no entries', () => {
    expect(groupActivityByDay([], now)).toEqual([]);
  });

  it('keeps entries with an unparseable timestamp in their own group', () => {
    const groups = groupActivityByDay([entry({ createdAt: 'nonsense' })], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(1);
  });

  it('preserves the order it was given and never re-sorts', () => {
    // Two entries on the same day where the second is older than the first,
    // plus an older day group. If the implementation sorts by date descending,
    // it would reorder these and fail.
    const groups = groupActivityByDay(
      [
        entry({ id: 'a', createdAt: '2026-08-25T15:00:00.000Z' }),
        entry({ id: 'b', createdAt: '2026-08-25T09:00:00.000Z' }), // same day, but older
        entry({ id: 'c', createdAt: '2026-08-24T20:00:00.000Z' }), // older day
      ],
      now
    );

    expect(groups).toHaveLength(2);
    // TODAY group should preserve the order: a (newer), then b (older within same day)
    expect(groups[0].entries.map((e) => e.id)).toEqual(['a', 'b']);
    // YESTERDAY group
    expect(groups[1].entries.map((e) => e.id)).toEqual(['c']);
  });
});

describe('UNKNOWN_ACTOR', () => {
  it('is the single spelling of an unresolvable actor', () => {
    expect(UNKNOWN_ACTOR).toBe('Unknown');
  });
});
