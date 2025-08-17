// Label system types
export interface Label {
  id: string;
  name: string;
  description?: string;
  color: string;
  isDefault: boolean;
  isActive: boolean;
  userId?: string; // null for system labels, user ID for custom labels
  projectId?: string; // null for global labels, project ID for project-specific labels
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LabelInsert {
  name: string;
  description?: string;
  color: string;
  isDefault?: boolean;
  isActive?: boolean;
  userId?: string;
  projectId?: string;
}

export interface LabelUpdate {
  name?: string;
  description?: string | undefined;
  color?: string | undefined;
  isActive?: boolean;
}

// Annotation-Label relationship
export interface AnnotationLabel {
  id: string;
  annotationId: string;
  labelId: string;
  createdAt: string;
}

export interface AnnotationLabelInsert {
  annotationId: string;
  labelId: string;
}

// Extended annotation type with labels
export interface AnnotationWithLabels {
  id: string;
  content: string;
  title: string;
  severity: string; // DEPRECATED: Use labels array instead. Kept for backward compatibility
  color: string;
  timestamp: number;
  frame: number;
  annotationType: string;
  drawingData?: any;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  duration: number;
  durationFrames: number;
  labels: Label[];
}

// Filter types
export type FilterLogic = 'OR' | 'AND';

export interface LabelFilter {
  selectedLabels: string[]; // Array of label IDs
  logic: FilterLogic;
}

export interface FilterState {
  labelFilter: LabelFilter;
  severityFilter: string[]; // DEPRECATED: Use labelFilter instead. Kept for backward compatibility
  searchQuery: string;
}

// Label statistics
export interface LabelStats {
  labelId: string;
  label: Label;
  usageCount: number;
  annotationCount: number;
  lastUsed?: string;
}

// Bulk operations
export interface BulkLabelOperation {
  annotationIds: string[];
  labelIds: string[];
  operation: 'add' | 'remove' | 'replace';
}

// Default system labels (replaces severity levels)
export const DEFAULT_LABELS: Omit<
  Label,
  'id' | 'createdAt' | 'updatedAt' | 'usageCount'
>[] = [
  {
    name: 'Low Priority',
    description: 'Low priority annotation',
    color: '#34d399', // green-400
    isDefault: true,
    isActive: true,
  },
  {
    name: 'Medium Priority',
    description: 'Medium priority annotation',
    color: '#fbbf24', // amber-400
    isDefault: true,
    isActive: true,
  },
  {
    name: 'High Priority',
    description: 'High priority annotation',
    color: '#ef4444', // red-500
    isDefault: true,
    isActive: true,
  },
  {
    name: 'Urgent',
    description: 'Requires immediate attention',
    color: '#dc2626', // red-600
    isDefault: true,
    isActive: true,
  },
  {
    name: 'Review Needed',
    description: 'Needs review or verification',
    color: '#7c3aed', // violet-600
    isDefault: true,
    isActive: true,
  },
  {
    name: 'Technical Issue',
    description: 'Technical problem or bug',
    color: '#ea580c', // orange-600
    isDefault: true,
    isActive: true,
  },
  {
    name: 'Improvement',
    description: 'Suggested improvement',
    color: '#0891b2', // cyan-600
    isDefault: true,
    isActive: true,
  },
];

// Predefined color palette for labels
export const LABEL_COLORS = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#6b7280', // gray-500
  '#dc2626', // red-600
  '#ea580c', // orange-600
  '#ca8a04', // yellow-600
  '#16a34a', // green-600
  '#0891b2', // cyan-600
  '#2563eb', // blue-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
  '#374151', // gray-700
];
