import type { Project } from '@/types/project';

/**
 * Order an already-filtered project list by when THIS user last opened each
 * project. Opened projects come first, most recent first; everything else
 * keeps the order it arrived in, which is created-date descending and stays
 * owned by ProjectService.mapToProjects.
 *
 * `openedAt` is keyed by project id: video id for single projects, comparison
 * id for dual ones, matching how mapToProjects assigns Project.id.
 */
export function sortByRecentOpens(
  projects: Project[],
  openedAt: Record<string, string>
): Project[] {
  return [...projects].sort((a, b) => {
    const aOpened = openedAt[a.id];
    const bOpened = openedAt[b.id];
    // Three explicit branches, not a subtraction of two lookups: subtracting
    // an undefined timestamp yields NaN, and a comparator returning NaN gives
    // arbitrary order instead of the stable order the never-opened tail
    // depends on.
    if (!aOpened && !bOpened) return 0;
    if (!aOpened) return 1;
    if (!bOpened) return -1;
    // Both opened. String comparison would work for well-formed UTC ISO-8601,
    // but these come back from PostgREST and may carry an offset, so compare
    // instants.
    return new Date(bOpened).getTime() - new Date(aOpened).getTime();
  });
}

/** A single project's match date (`YYYY-MM-DD`), or null. Comparisons have none. */
function matchDateOf(project: Project): string | null {
  return project.projectType === 'single' ? (project.video.matchDate ?? null) : null;
}

/**
 * Order by match date, latest match first. Projects without one - most of the
 * library, and every comparison - follow in sortByRecentOpens order, as does a
 * tie between two videos of the same date.
 *
 * Match dates are plain `YYYY-MM-DD` strings, so comparing them as strings is
 * comparing them as dates: no time, no offset.
 */
export function sortByMatchDate(
  projects: Project[],
  openedAt: Record<string, string>
): Project[] {
  const byRecent = sortByRecentOpens(projects, openedAt);
  const rank = new Map(byRecent.map((p, i) => [p.id, i]));
  return byRecent.sort((a, b) => {
    const aDate = matchDateOf(a);
    const bDate = matchDateOf(b);
    if (aDate !== bDate) {
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate < bDate ? 1 : -1;
    }
    return rank.get(a.id)! - rank.get(b.id)!;
  });
}
