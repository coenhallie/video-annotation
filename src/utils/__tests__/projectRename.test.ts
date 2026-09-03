import { describe, it, expect } from 'vitest';
import { applyVideoRename } from '@/utils/projectRename';
import type { Project } from '@/types/project';
import type { Video } from '@/types/database';

const project = (): Project =>
  ({
    id: 'v1',
    projectType: 'single',
    title: 'Pipeline Output - 1b30b3cc',
    createdAt: '2026-09-01',
    video: { id: 'v1', title: 'Pipeline Output - 1b30b3cc' },
  }) as unknown as Project;

const renamed = (id: string, title: string) => ({ id, title }) as unknown as Video;

describe('applyVideoRename', () => {
  // Project.title is a copy mapToProjects takes off the video, so a rename that
  // updated only one of the two would show the old name in the list and the new
  // one in the details panel, or the reverse.
  it('updates both the project title and the video title', () => {
    const p = project();

    const changed = applyVideoRename(p, renamed('v1', 'Serve trial 3'));

    expect(changed).toBe(true);
    expect(p.title).toBe('Serve trial 3');
    expect(p.projectType === 'single' && p.video.title).toBe('Serve trial 3');
  });

  it('ignores a row for a different video', () => {
    const p = project();

    const changed = applyVideoRename(p, renamed('other', 'Nope'));

    expect(changed).toBe(false);
    expect(p.title).toBe('Pipeline Output - 1b30b3cc');
  });

  it('ignores a dual project', () => {
    const p = { ...project(), projectType: 'dual' } as unknown as Project;

    expect(applyVideoRename(p, renamed('v1', 'Nope'))).toBe(false);
  });
});
