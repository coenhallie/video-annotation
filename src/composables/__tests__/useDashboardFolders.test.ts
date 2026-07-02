/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/folderService', () => ({ FolderService: {} }));

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
