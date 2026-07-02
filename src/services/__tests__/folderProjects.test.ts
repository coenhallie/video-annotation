import { describe, it, expect, vi, beforeEach } from 'vitest';

const videosChain = { select: vi.fn(() => videosChain), eq: vi.fn(() => Promise.resolve({ data: [{ id: 'v1' }, { id: 'v2' }], error: null })) };
const pfChain = { select: vi.fn(() => Promise.resolve({ data: [{ project_id: 'v2' }], error: null })) };
const fromMock = vi.fn((t: string) => (t === 'videos' ? videosChain : pfChain));
vi.mock('@/composables/useSupabase', () => ({ supabase: { from: (t: string) => fromMock(t) } }));

beforeEach(() => { fromMock.mockClear(); videosChain.eq.mockClear(); });

describe('getProjectsInFolder(null, userId) — uncategorized', () => {
  it('filters the videos table by the camelCase ownerId column', async () => {
    const { FolderService } = await import('@/services/folderService');
    const ids = await FolderService.getProjectsInFolder(null, 'u1');
    // queried videos by ownerId (NOT owner_id), and excluded v2 (already in a folder)
    expect(videosChain.eq).toHaveBeenCalledWith('ownerId', 'u1');
    expect(ids).toEqual(['v1']);
  });
});
