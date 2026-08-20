import { describe, it, expect } from 'vitest';
import { sortByRecentOpens } from '@/utils/projectOrdering';
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
