import { describe, it, expect } from 'vitest';
import {
  filterByQaStatus,
  countByQaStatus,
  qaStatusHiddenByFilter,
} from '@/utils/qaStatusFilter';
import type { QaStatus } from '@/types/database';

type Row = { id: string; status: QaStatus | null };
const statusOf = (r: Row) => r.status;

const rows: Row[] = [
  { id: 'a', status: 'not_started' },
  { id: 'b', status: 'failed' },
  { id: 'c', status: 'in_review' },
  { id: 'd', status: 'failed' },
  { id: 'e', status: null }, // a dual project
];

const ids = (list: Row[]) => list.map((r) => r.id);

describe('filterByQaStatus', () => {
  // An empty set means "filter off", the same way activeLabelIds already
  // behaves. Returning nothing here would blank the dashboard on first paint.
  it('returns everything when nothing is selected', () => {
    expect(ids(filterByQaStatus(rows, new Set(), statusOf))).toEqual([
      'a', 'b', 'c', 'd', 'e',
    ]);
  });

  it('keeps only the selected status', () => {
    expect(ids(filterByQaStatus(rows, new Set<QaStatus>(['failed']), statusOf)))
      .toEqual(['b', 'd']);
  });

  it('ORs within the selection', () => {
    const active = new Set<QaStatus>(['failed', 'in_review']);
    expect(ids(filterByQaStatus(rows, active, statusOf))).toEqual(['b', 'c', 'd']);
  });

  // Dual projects have no status, so no selection can match them.
  it('never matches a project with no status', () => {
    for (const status of ['not_started', 'in_review', 'failed', 'staging', 'production'] as QaStatus[]) {
      const kept = filterByQaStatus(rows, new Set([status]), statusOf);
      expect(kept.some((r) => r.id === 'e')).toBe(false);
    }
  });

  it('preserves input order', () => {
    const active = new Set<QaStatus>(['in_review', 'not_started']);
    expect(ids(filterByQaStatus(rows, active, statusOf))).toEqual(['a', 'c']);
  });
});

describe('countByQaStatus', () => {
  it('counts every status, including the empty ones', () => {
    expect(countByQaStatus(rows, statusOf)).toEqual({
      not_started: 1,
      in_review: 1,
      failed: 2,
      staging: 0,
      production: 0,
    });
  });

  it('does not count projects with no status', () => {
    const total = Object.values(countByQaStatus(rows, statusOf)).reduce((a, b) => a + b, 0);
    expect(total).toBe(4); // five rows, one of them null
  });

  // The caller passes an already-narrowed list; the counts describe that list.
  it('reflects the list it is handed', () => {
    const narrowed = rows.filter((r) => r.id === 'b');
    expect(countByQaStatus(narrowed, statusOf).failed).toBe(1);
    expect(countByQaStatus(narrowed, statusOf).not_started).toBe(0);
  });

  it('returns zeros for an empty list rather than an empty object', () => {
    expect(countByQaStatus([], statusOf)).toEqual({
      not_started: 0, in_review: 0, failed: 0, staging: 0, production: 0,
    });
  });
});

// The filter spec asks for a check that the chain composes: status AND label
// together, not either alone. The label half is inline in DashboardView's
// computed, so this asserts the composition at the seam this module owns -
// a status filter applied to an already-label-narrowed list. The rest of the
// chain is covered by the visual pass.
describe('composing with an earlier filter', () => {
  it('ANDs with a list that has already been narrowed', () => {
    const labelNarrowed = rows.filter((r) => r.id === 'b' || r.id === 'c');
    const active = new Set<QaStatus>(['failed']);
    expect(ids(filterByQaStatus(labelNarrowed, active, statusOf))).toEqual(['b']);
  });
});

describe('qaStatusHiddenByFilter', () => {
  it('is false when no filter is active', () => {
    expect(qaStatusHiddenByFilter('failed', new Set())).toBe(false);
  });

  it('is false when the new status is one of the selected ones', () => {
    expect(qaStatusHiddenByFilter('failed', new Set<QaStatus>(['failed', 'staging']))).toBe(false);
  });

  it('is true when the new status is excluded by the active filter', () => {
    expect(qaStatusHiddenByFilter('production', new Set<QaStatus>(['failed']))).toBe(true);
  });
});
