import type { Project } from '@/types/project';
import type { Video } from '@/types/database';

/**
 * Fold a renamed video back into the project on screen, in place.
 *
 * A pure function rather than logic inside the dashboard, the same shape as
 * mergeQaStatusUpdate: the interesting part is which of the two titles have to
 * move, and that deserves a test that does not need a mounted view.
 *
 * `Project.title` is a copy ProjectService.mapToProjects takes off the video, so
 * both have to move together. Updating one would show the old name in the list
 * and the new one in the details panel, or the reverse.
 *
 * Returns whether anything changed, so a caller can stay silent when nothing
 * did.
 */
export function applyVideoRename(project: Project, updated: Video): boolean {
  if (project.projectType !== 'single') return false;
  // Not reachable through the dialog, which is opened from the row it renames.
  // This function should not depend on that invariant holding in a caller it
  // does not control.
  if (project.video?.id !== updated.id) return false;

  project.title = updated.title;
  project.video.title = updated.title;
  return true;
}
