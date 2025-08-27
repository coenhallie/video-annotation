// Folder structure types for hierarchical project organization

export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // null for root folders
  ownerId: string;
  color?: string; // Optional folder color for visual organization
  icon?: string; // Optional icon identifier
  sortOrder: number; // For custom ordering
  isExpanded?: boolean; // UI state - whether folder is expanded in tree view
  createdAt: string;
  updatedAt: string;
}

export interface FolderWithContents extends Folder {
  subfolders: FolderWithContents[];
  projectCount: number;
  totalProjectCount: number; // Including all nested folders
}

export interface ProjectFolder {
  projectId: string;
  folderId: string;
  sortOrder: number;
  createdAt: string;
}

// Tree node for UI representation
export interface FolderTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  children: FolderTreeNode[];
  level: number;
  path: string[]; // Array of folder names from root to current
  isExpanded: boolean;
  isSelected: boolean;
  isDragOver: boolean;
  projectCount: number;
  totalProjectCount: number;
  color?: string;
  icon?: string;
}

// Breadcrumb item for navigation
export interface BreadcrumbItem {
  id: string;
  name: string;
  path: string[];
}

// Drag and drop data
export interface DragData {
  type: 'folder' | 'project' | 'projects';
  id: string | string[]; // Single ID for folder/project, array for multiple projects
  sourceFolderId?: string;
}

// Bulk operation types
export type BulkOperation = 'move' | 'delete' | 'duplicate' | 'export';

export interface BulkOperationPayload {
  operation: BulkOperation;
  projectIds: string[];
  targetFolderId?: string; // For move operation
}
