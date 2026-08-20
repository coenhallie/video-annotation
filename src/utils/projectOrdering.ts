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
