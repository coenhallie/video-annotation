import { ref } from 'vue';
import type { Ref } from 'vue';
import { FolderService } from '@/services/folderService';
import type { Folder, FolderTreeNode } from '@/types/folder';
import type { Project } from '@/types/project';

const FOLDER_KEY = 'dashboardFolderId';

export function useDashboardFolders(getUserId: () => string | undefined) {
  const folders: Ref<Folder[]> = ref([]);
  const folderTree: Ref<FolderTreeNode[]> = ref([]);
  const currentFolderId: Ref<string | null> = ref(
    localStorage.getItem(FOLDER_KEY) || null
  );
  const dragOverFolderId: Ref<string | null> = ref(null);
  // null = no folder filter; a Set = restrict to these project ids.
  const folderProjectIds: Ref<Set<string> | null> = ref(null);

  async function loadFolders() {
    const uid = getUserId();
    if (!uid) return;
    try {
      folders.value = await FolderService.getAllFolders();
      folderTree.value = FolderService.buildFolderTree(folders.value);
    } catch (err) {
      // Missing folders table etc. — degrade to no folders, never hard-fail.
      console.warn('[useDashboardFolders] loadFolders failed', err);
      folders.value = [];
      folderTree.value = [];
    }
  }

  async function refreshFolderContents() {
    const uid = getUserId();
    if (!uid || currentFolderId.value === null) {
      folderProjectIds.value = null;
      return;
    }
    try {
      const ids = await FolderService.getProjectsInFolder(currentFolderId.value, uid);
      folderProjectIds.value = new Set(ids);
    } catch (err) {
      console.warn('[useDashboardFolders] refreshFolderContents failed', err);
      folderProjectIds.value = new Set();
    }
  }

  function persist() {
    if (currentFolderId.value) localStorage.setItem(FOLDER_KEY, currentFolderId.value);
    else localStorage.removeItem(FOLDER_KEY);
  }

  function selectFolder(node: FolderTreeNode | null) {
    currentFolderId.value = node?.id ?? null;
    persist();
  }

  async function createFolder(name: string, parentId: string | null) {
    const uid = getUserId();
    if (!uid) return;
    await FolderService.createFolder(name, uid, parentId);
    await loadFolders();
  }

  async function renameFolder(node: FolderTreeNode, newName: string) {
    await FolderService.updateFolder(node.id, { name: newName });
    await loadFolders();
  }

  async function deleteFolder(node: FolderTreeNode) {
    await FolderService.deleteFolder(node.id);
    if (currentFolderId.value === node.id) selectFolder(null);
    await loadFolders();
  }

  async function fileProject(projectId: string, toFolderId: string | null) {
    await FolderService.moveProjectToFolder(projectId, null, toFolderId);
    await refreshFolderContents();
  }

  function filterByFolder(list: Project[]): Project[] {
    const ids = folderProjectIds.value;
    if (!ids) return list;
    return list.filter((p) => ids.has(p.id));
  }

  return {
    folders,
    folderTree,
    currentFolderId,
    dragOverFolderId,
    folderProjectIds,
    loadFolders,
    refreshFolderContents,
    selectFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    fileProject,
    filterByFolder,
  };
}
