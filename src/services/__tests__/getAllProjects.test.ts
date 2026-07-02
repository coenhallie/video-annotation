import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserVideos = vi.fn();
const getAllVideos = vi.fn();
const getUserComparisonVideos = vi.fn();
const getAllComparisonVideos = vi.fn();
const fetchOwners = vi.fn();

vi.mock('@/services/videoService', () => ({
  VideoService: { getUserVideos, getAllVideos },
}));
vi.mock('@/services/comparisonVideoService', () => ({
  ComparisonVideoService: { getUserComparisonVideos, getAllComparisonVideos },
}));
vi.mock('@/services/ownerEnrichmentService', () => ({ fetchOwners }));
vi.mock('@/services/annotationService', () => ({ AnnotationService: {} }));
vi.mock('@/services/commentService', () => ({ CommentService: {} }));
// projectService.ts imports the real supabase client at module scope (for
// getProjectCountsBatched), which requires `window` under the node test
// environment. Stub it so importing ProjectService doesn't blow up.
vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  fetchOwners.mockResolvedValue({ u1: { id: 'u1', name: 'Alice' } });
});

const video = (id: string) => ({
  id, ownerId: 'u1', title: 't', videoType: 'url', url: 'http://v', createdAt: '2026-01-01',
});

describe('getAllProjects', () => {
  it("scope 'all' uses getAllVideos and attaches owner", async () => {
    getAllVideos.mockResolvedValue([video('v1')]);
    getAllComparisonVideos.mockResolvedValue([]);
    const { ProjectService } = await import('@/services/projectService');
    const projects = await ProjectService.getAllProjects({ scope: 'all', userId: 'u1' });
    expect(getAllVideos).toHaveBeenCalled();
    expect(getUserVideos).not.toHaveBeenCalled();
    expect(projects[0]?.owner?.name).toBe('Alice');
  });

  it("scope 'mine' uses getUserVideos(userId)", async () => {
    getUserVideos.mockResolvedValue([video('v1')]);
    getUserComparisonVideos.mockResolvedValue([]);
    const { ProjectService } = await import('@/services/projectService');
    await ProjectService.getAllProjects({ scope: 'mine', userId: 'u1' });
    expect(getUserVideos).toHaveBeenCalledWith('u1');
    expect(getAllVideos).not.toHaveBeenCalled();
  });
});
