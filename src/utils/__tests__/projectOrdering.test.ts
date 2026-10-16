import { describe, it, expect } from 'vitest';
import { sortByMatchDate, sortByRecentOpens } from '@/utils/projectOrdering';
import type { Project } from '@/types/project';

// Only id and createdAt matter to the comparator; the cast keeps the fixture
// readable instead of building a full Video record per project.
const project = (id: string, createdAt: string): Project =>
  ({
    id,
    projectType: 'single',
    title: id,
    createdAt,
    video: { id, duration: 10 },
  }) as unknown as Project;

// Arrives created-date descending, the way mapToProjects hands it over.
const NEWEST = project('newest', '2026-08-20T00:00:00Z');
const MIDDLE = project('middle', '2026-08-10T00:00:00Z');
const OLDEST = project('oldest', '2026-08-01T00:00:00Z');
const INCOMING = [NEWEST, MIDDLE, OLDEST];

const ids = (list: Project[]) => list.map((p) => p.id);

describe('sortByRecentOpens', () => {
  it('is the identity ordering when nothing has been opened', () => {
    expect(ids(sortByRecentOpens(INCOMING, {}))).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);
  });

  it('floats an opened project above newer never-opened ones', () => {
    const result = sortByRecentOpens(INCOMING, {
      oldest: '2026-08-21T09:00:00Z',
    });
    expect(ids(result)).toEqual(['oldest', 'newest', 'middle']);
  });

  it('orders opened projects most recent first', () => {
    const result = sortByRecentOpens(INCOMING, {
      oldest: '2026-08-21T09:00:00Z',
      newest: '2026-08-21T11:00:00Z',
    });
    expect(ids(result)).toEqual(['newest', 'oldest', 'middle']);
  });

  it('keeps never-opened projects in created-date order below the opened ones', () => {
    const result = sortByRecentOpens(INCOMING, {
      middle: '2026-08-21T09:00:00Z',
    });
    expect(ids(result)).toEqual(['middle', 'newest', 'oldest']);
  });

  it('ignores entries for projects that are not in the list', () => {
    const result = sortByRecentOpens(INCOMING, {
      'filtered-out': '2026-08-21T11:00:00Z',
    });
    expect(ids(result)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('does not mutate the input array', () => {
    const input = [...INCOMING];
    sortByRecentOpens(input, { oldest: '2026-08-21T09:00:00Z' });
    expect(ids(input)).toEqual(['newest', 'middle', 'oldest']);
  });
});

describe('sortByMatchDate', () => {
  const withMatch = (id: string, matchDate: string | null): Project =>
    ({
      id,
      projectType: 'single',
      title: id,
      createdAt: '2026-08-01T00:00:00Z',
      video: { id, duration: 10, matchDate },
    }) as unknown as Project;

  const dual = (id: string): Project =>
    ({
      id,
      projectType: 'dual',
      title: id,
      createdAt: '2026-08-01T00:00:00Z',
    }) as unknown as Project;

  it('puts the latest match first', () => {
    const list = [
      withMatch('early', '2026-09-01'),
      withMatch('late', '2026-10-14'),
      withMatch('middle', '2026-10-01'),
    ];
    expect(ids(sortByMatchDate(list, {}))).toEqual(['late', 'middle', 'early']);
  });

  // Most of the library has no match date. It stays reachable, after the
  // dated videos, in the same last-opened order the default sort uses.
  it('lists everything without a match date after, by last opened', () => {
    const list = [
      withMatch('undated-a', null),
      dual('comparison'),
      withMatch('dated', '2026-10-14'),
      withMatch('undated-b', null),
    ];
    const opened = {
      'undated-b': '2026-10-16T10:00:00Z',
      comparison: '2026-10-15T10:00:00Z',
    };
    expect(ids(sortByMatchDate(list, opened))).toEqual([
      'dated',
      'undated-b',
      'comparison',
      'undated-a',
    ]);
  });

  it('breaks a tie on the same match date by last opened', () => {
    const list = [withMatch('a', '2026-10-14'), withMatch('b', '2026-10-14')];
    expect(ids(sortByMatchDate(list, { b: '2026-10-16T10:00:00Z' }))).toEqual(['b', 'a']);
  });

  it('does not reorder the list it is handed', () => {
    const list = [withMatch('early', '2026-09-01'), withMatch('late', '2026-10-14')];
    sortByMatchDate(list, {});
    expect(ids(list)).toEqual(['early', 'late']);
  });
});
