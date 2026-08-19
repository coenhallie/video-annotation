/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getAllFolders = vi.fn();
const buildFolderTree = vi.fn(() => []);
vi.mock('@/services/folderService', () => ({
  FolderService: {
    getAllFolders: (...args: unknown[]) => getAllFolders(...args),
    buildFolderTree: (...args: unknown[]) => buildFolderTree(...args),
  },
}));

describe('useDashboardFolders.filterByFolder', () => {
  it('returns the list unchanged when no folder is selected (folderProjectIds null)', async () => {
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');
    const list = [{ id: 'a' }, { id: 'b' }] as any;
    expect(f.filterByFolder(list)).toEqual(list);
  });

  it('restricts the list to the folder member ids when a folder is active', async () => {
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');
    f.folderProjectIds.value = new Set(['b']);
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as any;
    expect(f.filterByFolder(list).map((p: any) => p.id)).toEqual(['b']);
  });
});

const folder = (id: string) => ({
  id,
  name: id,
  parentId: null,
  ownerId: 'u1',
  sortOrder: 0,
  createdAt: '2026-08-19T00:00:00Z',
  updatedAt: '2026-08-19T00:00:00Z',
});

describe('useDashboardFolders.loadFolders - stale selection', () => {
  beforeEach(() => {
    localStorage.clear();
    getAllFolders.mockReset();
    buildFolderTree.mockReset();
    buildFolderTree.mockReturnValue([]);
  });

  it('forgets a stored folder id that no longer exists', async () => {
    localStorage.setItem('dashboardFolderId', 'gone');
    getAllFolders.mockResolvedValue([folder('f1')]);
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');
    expect(f.currentFolderId.value).toBe('gone');

    await f.loadFolders();

    expect(f.currentFolderId.value).toBeNull();
    expect(localStorage.getItem('dashboardFolderId')).toBeNull();
  });

  it('keeps a stored folder id that still exists', async () => {
    localStorage.setItem('dashboardFolderId', 'f1');
    getAllFolders.mockResolvedValue([folder('f1')]);
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');

    await f.loadFolders();

    expect(f.currentFolderId.value).toBe('f1');
    expect(localStorage.getItem('dashboardFolderId')).toBe('f1');
  });

  it('keeps the selection when the load fails, rather than reconciling against nothing', async () => {
    localStorage.setItem('dashboardFolderId', 'f1');
    getAllFolders.mockRejectedValue(new Error('permission denied for table folders'));
    const { useDashboardFolders } = await import('@/composables/useDashboardFolders');
    const f = useDashboardFolders(() => 'u1');

    await f.loadFolders();

    expect(f.currentFolderId.value).toBe('f1');
  });
});
