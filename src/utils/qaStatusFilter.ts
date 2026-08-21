import type { QaStatus } from '@/types/database';
import { QA_STATUSES } from '@/utils/qaStatus';

/**
 * Narrows a project list to the selected statuses.
 *
 * Generic over the project type and taking a `statusOf` accessor, so this
 * module never imports Project and never has to know about its discriminated
 * union. `statusOf` returning null means "has no status" - the dual-project
 * case - which matches no selection.
 *
 * An empty `active` set means the filter is off and everything passes. It does
 * NOT mean "match nothing": that would blank the dashboard on first paint, and
 * it is the same convention activeLabelIds already follows.
 */
export function filterByQaStatus<T>(
  projects: T[],
  active: ReadonlySet<QaStatus>,
  statusOf: (project: T) => QaStatus | null
): T[] {
  if (active.size === 0) return projects;
  return projects.filter((project) => {
    const status = statusOf(project);
    return status !== null && active.has(status);
  });
}

/**
 * How many of these projects carry each status.
 *
 * Every one of the five keys is always present, zeros included: the filter
 * panel renders a fixed vocabulary, and a missing key would make a row's count
 * read as undefined.
 *
 * The counts describe exactly the list handed in. The caller is responsible for
 * passing a list with every OTHER filter already applied but not the status
 * filter, so that selecting one status does not collapse the other four to
 * zero.
 */
export function countByQaStatus<T>(
  projects: T[],
  statusOf: (project: T) => QaStatus | null
): Record<QaStatus, number> {
  const counts = Object.fromEntries(
    QA_STATUSES.map((status) => [status, 0])
  ) as Record<QaStatus, number>;

  for (const project of projects) {
    const status = statusOf(project);
    if (status !== null) counts[status] += 1;
  }

  return counts;
}
