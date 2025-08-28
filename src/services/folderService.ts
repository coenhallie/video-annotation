import { supabase } from '../composables/useSupabase';
import type {
  Folder,
  FolderWithContents,
  FolderTreeNode,
} from '../types/folder';

export class FolderService {
  /**
   * Create a new folder
   */
  static async createFolder(
    name: string,
    ownerId: string,
    parentId: string | null = null
  ): Promise<Folder> {
    try {
      const { data, error } = await supabase
        .from('folders')
        .insert({
          name,
          owner_id: ownerId,
          parent_id: parentId,
          sort_order: 0,
        })
        .select()
        .single();

      if (error) throw error;

      return this.mapDatabaseToFolder(data);
    } catch (error) {
      console.error('❌ [FolderService] Error creating folder:', error);
      throw error;
    }
  }

  /**
   * Get all folders for a user
   */
  static async getUserFolders(userId: string): Promise<Folder[]> {
    try {
      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .eq('owner_id', userId)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return (data || []).map(this.mapDatabaseToFolder);
    } catch (error) {
      console.error('❌ [FolderService] Error loading folders:', error);
      throw error;
    }
  }

  /**
   * Get folder with its contents (subfolders and project count)
   */
  static async getFolderWithContents(
    folderId: string,
    userId: string
  ): Promise<FolderWithContents> {
    try {
      // Get the folder
      const { data: folderData, error: folderError } = await supabase
        .from('folders')
        .select('*')
        .eq('id', folderId)
        .eq('owner_id', userId)
        .single();

      if (folderError) throw folderError;

      // Get subfolders
      const { data: subfolders, error: subfoldersError } = await supabase
        .from('folders')
        .select('*')
        .eq('parent_id', folderId)
        .eq('owner_id', userId)
        .order('sort_order', { ascending: true });

      if (subfoldersError) throw subfoldersError;

      // Get project count for this folder
      const { count: projectCount, error: countError } = await supabase
        .from('project_folders')
        .select('*', { count: 'exact', head: true })
        .eq('folder_id', folderId);

      if (countError) throw countError;

      // Recursively get contents for subfolders
      const subfoldersWithContents = await Promise.all(
        (subfolders || []).map((subfolder) =>
          this.getFolderWithContents(subfolder.id, userId)
        )
      );

      // Calculate total project count (including nested folders)
      const totalProjectCount =
        (projectCount || 0) +
        subfoldersWithContents.reduce(
          (sum, subfolder) => sum + subfolder.totalProjectCount,
          0
        );

      return {
        ...this.mapDatabaseToFolder(folderData),
        subfolders: subfoldersWithContents,
        projectCount: projectCount || 0,
        totalProjectCount,
      };
    } catch (error) {
      console.error('❌ [FolderService] Error loading folder contents:', error);
      throw error;
    }
  }

  /**
   * Build folder tree structure for UI
   */
  static buildFolderTree(
    folders: Folder[],
    parentId: string | null = null,
    level: number = 0,
    path: string[] = []
  ): FolderTreeNode[] {
    return folders
      .filter((folder) => folder.parentId === parentId)
      .map((folder) => {
        const currentPath = [...path, folder.name];
        const children = this.buildFolderTree(
          folders,
          folder.id,
          level + 1,
          currentPath
        );

        return {
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          children,
          level,
          path: currentPath,
          isExpanded: false,
          isSelected: false,
          isDragOver: false,
          projectCount: 0, // Will be populated separately
          totalProjectCount: 0, // Will be populated separately
          ...(folder.color && { color: folder.color }),
          ...(folder.icon && { icon: folder.icon }),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Update folder (rename, change color, etc.)
   */
  static async updateFolder(
    folderId: string,
    updates: Partial<Pick<Folder, 'name' | 'color' | 'icon' | 'sortOrder'>>
  ): Promise<Folder> {
    try {
      const updateData: any = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.color !== undefined) updateData.color = updates.color;
      if (updates.icon !== undefined) updateData.icon = updates.icon;
      if (updates.sortOrder !== undefined)
        updateData.sort_order = updates.sortOrder;

      const { data, error } = await supabase
        .from('folders')
        .update(updateData)
        .eq('id', folderId)
        .select()
        .single();

      if (error) throw error;

      return this.mapDatabaseToFolder(data);
    } catch (error) {
      console.error('❌ [FolderService] Error updating folder:', error);
      throw error;
    }
  }

  /**
   * Move folder to a different parent
   */
  static async moveFolder(
    folderId: string,
    newParentId: string | null
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('folders')
        .update({ parent_id: newParentId })
        .eq('id', folderId);

      if (error) throw error;
    } catch (error) {
      console.error('❌ [FolderService] Error moving folder:', error);
      throw error;
    }
  }

  /**
   * Delete folder and all its contents
   */
  static async deleteFolder(folderId: string): Promise<void> {
    try {
      console.log('🗑️ [FolderService] Starting folder deletion:', folderId);

      // First, get all subfolders recursively
      const subfolders = await this.getAllSubfolders(folderId);
      console.log(
        '📁 [FolderService] Found subfolders to delete:',
        subfolders.length
      );

      // Delete all project associations for this folder and its subfolders
      const allFolderIds = [folderId, ...subfolders.map((f) => f.id)];
      console.log(
        '🔗 [FolderService] Removing project associations for folders:',
        allFolderIds
      );

      const { error: projectError } = await supabase
        .from('project_folders')
        .delete()
        .in('folder_id', allFolderIds);

      if (projectError) {
        console.warn(
          '⚠️ [FolderService] Error removing project associations (table may not exist):',
          projectError
        );
        // Don't throw error if project_folders table doesn't exist
        if (projectError.code !== '42P01') {
          throw projectError;
        }
      }

      // Delete all subfolders first (deepest first)
      const sortedSubfolders = subfolders.sort((a, b) => b.level - a.level);
      for (const subfolder of sortedSubfolders) {
        console.log('🗑️ [FolderService] Deleting subfolder:', subfolder.name);
        const { error: subfolderError } = await supabase
          .from('folders')
          .delete()
          .eq('id', subfolder.id);

        if (subfolderError) throw subfolderError;
      }

      // Finally, delete the main folder
      console.log('🗑️ [FolderService] Deleting main folder:', folderId);
      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;

      console.log('✅ [FolderService] Folder deletion completed successfully');
    } catch (error) {
      console.error('❌ [FolderService] Error deleting folder:', error);
      throw error;
    }
  }

  /**
   * Get all subfolders recursively with their nesting level
   */
  private static async getAllSubfolders(
    folderId: string
  ): Promise<Array<{ id: string; name: string; level: number }>> {
    const allSubfolders: Array<{ id: string; name: string; level: number }> =
      [];

    const getSubfoldersRecursive = async (
      parentId: string,
      level: number = 1
    ): Promise<void> => {
      const { data: subfolders, error } = await supabase
        .from('folders')
        .select('id, name, parent_id')
        .eq('parent_id', parentId);

      if (error) throw error;

      for (const subfolder of subfolders || []) {
        allSubfolders.push({
          id: subfolder.id,
          name: subfolder.name,
          level,
        });

        // Recursively get subfolders of this subfolder
        await getSubfoldersRecursive(subfolder.id, level + 1);
      }
    };

    await getSubfoldersRecursive(folderId);
    return allSubfolders;
  }

  /**
   * Add project to folder
   */
  static async addProjectToFolder(
    projectId: string,
    folderId: string
  ): Promise<void> {
    try {
      // Simply insert the project into the folder
      // The moveProjectToFolder method already removes any existing entries
      const { error } = await supabase.from('project_folders').insert({
        project_id: projectId,
        folder_id: folderId,
        sort_order: 0,
      });

      if (error) {
        // Ignore unique constraint violations (project already in folder)
        if (error.code === '23505') {
          console.log('ℹ️ [FolderService] Project already in folder, skipping');
          return;
        }
        throw error;
      }
    } catch (error) {
      console.error(
        '❌ [FolderService] Error adding project to folder:',
        error
      );
      throw error;
    }
  }

  /**
   * Remove project from folder
   */
  static async removeProjectFromFolder(
    projectId: string,
    folderId: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('project_folders')
        .delete()
        .eq('project_id', projectId)
        .eq('folder_id', folderId);

      if (error) throw error;
    } catch (error) {
      console.error(
        '❌ [FolderService] Error removing project from folder:',
        error
      );
      throw error;
    }
  }

  /**
   * Move project to a different folder
   */
  static async moveProjectToFolder(
    projectId: string,
    fromFolderId: string | null,
    toFolderId: string | null
  ): Promise<void> {
    try {
      // First, remove the project from ALL folders it might be in
      // This ensures we don't create duplicates
      const { error: deleteError } = await supabase
        .from('project_folders')
        .delete()
        .eq('project_id', projectId);

      if (deleteError) {
        // Only log warning if it's not a "table doesn't exist" error
        if (deleteError.code !== '42P01') {
          console.warn(
            '⚠️ [FolderService] Error removing project from folders:',
            deleteError
          );
        }
      }

      // If moving to a folder (not root), add it
      if (toFolderId) {
        await this.addProjectToFolder(projectId, toFolderId);
      }
    } catch (error) {
      console.error('❌ [FolderService] Error moving project:', error);
      throw error;
    }
  }

  /**
   * Move multiple projects to a folder
   */
  static async moveProjectsToFolder(
    projectIds: string[],
    toFolderId: string | null
  ): Promise<void> {
    try {
      // First, remove all projects from their current folders
      const { error: deleteError } = await supabase
        .from('project_folders')
        .delete()
        .in('project_id', projectIds);

      if (deleteError) throw deleteError;

      // If moving to a folder (not root), add them
      if (toFolderId) {
        const projectFolders = projectIds.map((projectId, index) => ({
          project_id: projectId,
          folder_id: toFolderId,
          sort_order: index,
        }));

        const { error: insertError } = await supabase
          .from('project_folders')
          .insert(projectFolders);

        if (insertError) throw insertError;
      }
    } catch (error) {
      console.error('❌ [FolderService] Error moving projects:', error);
      throw error;
    }
  }

  /**
   * Get projects in a specific folder
   */
  static async getProjectsInFolder(
    folderId: string | null,
    userId: string
  ): Promise<string[]> {
    try {
      if (folderId === null) {
        // Get projects not in any folder
        const { data: allProjects, error: allError } = await supabase
          .from('videos')
          .select('id')
          .eq('owner_id', userId);

        if (allError) throw allError;

        const { data: projectsInFolders, error: folderError } = await supabase
          .from('project_folders')
          .select('project_id');

        // If project_folders table doesn't exist, return all projects
        if (folderError && (folderError as any).code === '42P01') {
          console.warn(
            '⚠️ [FolderService] project_folders table does not exist, returning all projects'
          );
          return (allProjects || []).map((p) => p.id);
        }

        if (folderError) throw folderError;

        const projectsInFoldersSet = new Set(
          (projectsInFolders || []).map((pf) => pf.project_id)
        );

        return (allProjects || [])
          .filter((p) => !projectsInFoldersSet.has(p.id))
          .map((p) => p.id);
      } else {
        // Get projects in specific folder
        const { data, error } = await supabase
          .from('project_folders')
          .select('project_id')
          .eq('folder_id', folderId)
          .order('sort_order', { ascending: true });

        // If project_folders table doesn't exist, return empty array
        if (error && (error as any).code === '42P01') {
          console.warn(
            '⚠️ [FolderService] project_folders table does not exist'
          );
          return [];
        }

        if (error) throw error;

        return (data || []).map((pf) => pf.project_id);
      }
    } catch (error) {
      console.error(
        '❌ [FolderService] Error getting projects in folder:',
        error
      );
      throw error;
    }
  }

  /**
   * Search folders by name
   */
  static async searchFolders(
    userId: string,
    searchTerm: string
  ): Promise<Folder[]> {
    try {
      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .eq('owner_id', userId)
        .ilike('name', `%${searchTerm}%`)
        .order('name', { ascending: true });

      if (error) throw error;

      return (data || []).map(this.mapDatabaseToFolder);
    } catch (error) {
      console.error('❌ [FolderService] Error searching folders:', error);
      throw error;
    }
  }

  /**
   * Map database folder to Folder type
   */
  private static mapDatabaseToFolder(dbFolder: any): Folder {
    return {
      id: dbFolder.id,
      name: dbFolder.name,
      parentId: dbFolder.parent_id,
      ownerId: dbFolder.owner_id,
      color: dbFolder.color,
      icon: dbFolder.icon,
      sortOrder: dbFolder.sort_order || 0,
      createdAt: dbFolder.created_at,
      updatedAt: dbFolder.updated_at,
    };
  }
}
