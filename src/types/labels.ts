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
  drawingData?: Record<string, unknown>;
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
  // Events
  {
    name: 'EVT MISSED',
    description: 'Clear event in the video but no corresponding event in output.',
    color: '#ef4444', // red-500
    isDefault: true,
    isActive: true,
  },
  {
    name: 'EVT FALSE',
    description: 'Event output when no event is present.',
    color: '#dc2626', // red-600
    isDefault: true,
    isActive: true,
  },
  {
    name: 'EVT TYPE WRONG',
    description:
      'Event timing is roughly correct, but the type of event is wrong (e.g., throw-in vs corner, cross vs shot, goal vs saved shot).',
    color: '#f87171', // red-400
    isDefault: true,
    isActive: true,
  },
  {
    name: 'EVT TIME ERROR',
    description:
      'Event type is correct, but the timestamp is significantly early/late by at least 2 seconds.',
    color: '#b91c1c', // red-700
    isDefault: true,
    isActive: true,
  },
  // Pitch
  {
    name: 'PITCH LINES MISMATCH',
    description:
      "Projected pitch lines (touchline, halfway, boxes) clearly don't align with the real lines in the video.",
    color: '#8b5cf6', // violet-500
    isDefault: true,
    isActive: true,
  },
  {
    name: 'PITCH PROJECTION OFF',
    description:
      'Players/ball consistently appear off the playable area or in wrong zones due to projection or camera model errors (e.g., players "in the stands" or ball outside field when it is clearly inside).',
    color: '#7c3aed', // violet-600
    isDefault: true,
    isActive: true,
  },
  // Team
  {
    name: 'TEAM ASSIGN WRONG',
    description:
      'Player assigned to wrong team (kit/colour vs label disagree) - e.g., "players switching teams because of shadows / far end of pitch".',
    color: '#ec4899', // pink-500
    isDefault: true,
    isActive: true,
  },
  {
    name: 'TEAM COLOR WRONG',
    description: 'Team colours mis-detected and/or misclassified.',
    color: '#db2777', // pink-600
    isDefault: true,
    isActive: true,
  },
  // Non-player officials
  {
    name: 'NPL MISSED',
    description:
      'A clearly visible non-player official is not tracked/rendered for a noticeable period.',
    color: '#6b7280', // gray-500
    isDefault: true,
    isActive: true,
  },
  {
    name: 'NPL WRONG POS',
    description:
      'The non-player official exists but is clearly in the wrong position on the pitch.',
    color: '#374151', // gray-700
    isDefault: true,
    isActive: true,
  },
  // Players
  {
    name: 'PLR MISSED',
    description:
      'A clearly visible player on the pitch is not tracked/rendered for a noticeable period.',
    color: '#3b82f6', // blue-500
    isDefault: true,
    isActive: true,
  },
  {
    name: 'PLR DUPLICATE',
    description:
      'Duplicate or "ghost" player appears (same real player represented twice, or phantom player with no real counterpart).',
    color: '#2563eb', // blue-600
    isDefault: true,
    isActive: true,
  },
  {
    name: 'PLR TELEPORT',
    description:
      'Player jumps an implausible distance between frames (no continuous motion in the video).',
    color: '#60a5fa', // blue-400
    isDefault: true,
    isActive: true,
  },
  {
    name: 'PLR ID SWITCH',
    description:
      'IDs of two players swap (e.g., #9 and #10 exchange tracks mid-sequence) or a single real player gets a new ID mid-clip.',
    color: '#1d4ed8', // blue-700
    isDefault: true,
    isActive: true,
  },
  {
    name: 'PLR WRONG POS',
    description:
      'The player exists but is clearly in the wrong position on the pitch.',
    color: '#06b6d4', // cyan-500
    isDefault: true,
    isActive: true,
  },
  {
    name: 'PLR AS NPL',
    description:
      'The player has been incorrectly categorized as a non-player official.',
    color: '#0891b2', // cyan-600
    isDefault: true,
    isActive: true,
  },
  {
    name: 'PLR KEEPER WRONG POS',
    description: 'A goal keeper class player is in a seriously wrong position.',
    color: '#0e7490', // cyan-700
    isDefault: true,
    isActive: true,
  },
  // Ball
  {
    name: 'BALL MISSED',
    description:
      'Ball is clearly visible in the video but not tracked/rendered for a noticeable segment.',
    color: '#f97316', // orange-500
    isDefault: true,
    isActive: true,
  },
  {
    name: 'BALL WRONG POS',
    description:
      'Ball marker exists but is clearly in the wrong place on the pitch (several metres off, wrong side of line, off the field).',
    color: '#ea580c', // orange-600
    isDefault: true,
    isActive: true,
  },
  {
    name: 'BALL TRAJ IMPLAUSIBLE',
    description:
      'Trajectory is physically impossible or clearly wrong (e.g., teleport jumps, sharp kinks mid-air, long high ball drawn along the ground).',
    color: '#eab308', // yellow-500
    isDefault: true,
    isActive: true,
  },
  {
    name: 'BALL HIGH MISCLASS',
    description:
      'High ball vs ground ball classification clearly wrong (e.g., lob shown as ground pass, or ground ball shown "flying anywhere").',
    color: '#ca8a04', // yellow-600
    isDefault: true,
    isActive: true,
  },
  {
    name: 'BALL WRONG OWNER',
    description:
      "Ball is visually with one player/team but the system's ball-owner / possession assignment says otherwise (e.g., keeper always ends up with the ball or intermediate non-touching player gets it).",
    color: '#c2410c', // orange-700
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
