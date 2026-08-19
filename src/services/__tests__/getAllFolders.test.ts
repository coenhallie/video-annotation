import { describe, it, expect, vi, beforeEach } from 'vitest';

const row = (id: string, ownerId: string) => ({
  id,
  name: id,
  parent_id: null,
  owner_id: ownerId,
  color: null,
  icon: null,
  sort_order: 0,
  created_at: '2026-08-19T00:00:00Z',
  updated_at: '2026-08-19T00:00:00Z',
});

const foldersChain: Record<string, ReturnType<typeof vi.fn>> = {
  select: vi.fn(() => foldersChain),
  eq: vi.fn(() => foldersChain),
  order: vi.fn(() =>
    Promise.resolve({ data: [row('f1', 'u1'), row('f2', 'u2')], error: null })
  ),
};
const fromMock = vi.fn(() => foldersChain);
vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (t: string) => fromMock(t) },
}));

beforeEach(() => {
  fromMock.mockClear();
  foldersChain.select.mockClear();
  foldersChain.eq.mockClear();
  foldersChain.order.mockClear();
});

describe('FolderService.getAllFolders', () => {
  it('returns folders from every owner', async () => {
    const { FolderService } = await import('@/services/folderService');
    const folders = await FolderService.getAllFolders();
    expect(fromMock).toHaveBeenCalledWith('folders');
    expect(folders.map((f) => f.ownerId)).toEqual(['u1', 'u2']);
  });

  it('never filters by owner_id', async () => {
    const { FolderService } = await import('@/services/folderService');
    await FolderService.getAllFolders();
    // owner_id is attribution only. Any .eq() here would re-privatise the tree.
    expect(foldersChain.eq).not.toHaveBeenCalled();
  });
});
