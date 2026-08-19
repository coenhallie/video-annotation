import { describe, it, expect, vi, beforeEach } from 'vitest';

let deleteError: { code: string; message: string } | null = null;

const pfChain = {
  delete: vi.fn(() => pfChain),
  eq: vi.fn(() => Promise.resolve({ error: deleteError })),
};
const fromMock = vi.fn((_table: string) => pfChain);
vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (t: string) => fromMock(t) },
}));

beforeEach(() => {
  deleteError = null;
  fromMock.mockClear();
  pfChain.delete.mockClear();
  pfChain.eq.mockClear();
});

describe('FolderService.moveProjectToFolder(toFolderId: null) - unfiling', () => {
  it('rethrows a DELETE error that is not "table missing"', async () => {
    deleteError = {
      code: '42501',
      message: 'permission denied for table project_folders',
    };
    const { FolderService } = await import('@/services/folderService');
    await expect(
      FolderService.moveProjectToFolder('p1', 'f1', null)
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('tolerates a DELETE error when the table does not exist (42P01)', async () => {
    deleteError = {
      code: '42P01',
      message: 'relation "project_folders" does not exist',
    };
    const { FolderService } = await import('@/services/folderService');
    await expect(
      FolderService.moveProjectToFolder('p1', 'f1', null)
    ).resolves.toBeUndefined();
  });
});
