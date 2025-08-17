// types/database.ts

// Legacy severity type - kept for backward compatibility but deprecated
export type SeverityLevel = 'low' | 'medium' | 'high';
export type AnnotationType = 'text' | 'drawing';

// Comparison video types
export type VideoContext = 'individual' | 'video_a' | 'video_b' | 'comparison';

// Drawing-specific types
export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingPath {
  points: DrawingPoint[];
  strokeWidth: number;
  color: string;
  timestamp: number;
}

export interface DrawingData {
  paths: DrawingPath[];
  canvasWidth: number;
  canvasHeight: number;
  frame: number;
}

// Base interfaces
export interface DatabaseUser {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseVideo {
  id: string;
  ownerId: string;
  title: string;
  url: string;
  videoId: string;
  fps: number;
  duration: number;
  totalFrames: number;
  thumbnailUrl?: string;
  metadata?: Record<string, any>;
  isPublic: boolean;
  videoType: 'url' | 'upload';
  filePath?: string;
  fileSize?: number;
  originalFilename?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseAnnotation {
  id: string;
  videoId?: string; // Nullable for comparison annotations
  comparisonVideoId?: string; // For comparison video annotations
  userId: string;
  projectId?: string;
  content: string;
  title: string;
  severity: SeverityLevel;
  color: string;
  timestamp: number;
  frame?: number;
  startFrame: number;
  endFrame?: number;
  duration: number;
  durationFrames: number;
  annotationType: AnnotationType;
  drawingData?: DrawingData;
  videoContext?: VideoContext; // Context for comparison annotations
  synchronizedFrame?: number; // For synchronized comparison annotations
  // Dual video frame tracking fields
  videoAFrame?: number; // Frame number for video A in dual mode
  videoBFrame?: number; // Frame number for video B in dual mode
  videoATimestamp?: number; // Timestamp for video A in dual mode
  videoBTimestamp?: number; // Timestamp for video B in dual mode
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseComparisonVideo {
  id: string;
  userId: string;
  title: string;
  description?: string;
  videoAId: string;
  videoBId: string;
  duration?: number;
  fps?: number;
  totalFrames?: number;
  thumbnailUrl?: string;
  thumbnailLayout?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

// Label system interfaces
export interface DatabaseLabel {
  id: string;
  name: string;
  description?: string;
  color: string;
  isDefault: boolean;
  isActive: boolean;
  userId?: string;
  projectId?: string;
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseAnnotationLabel {
  id: string;
  annotationId: string;
  labelId: string;
  createdAt: string;
}

// Comment system interfaces
export interface DatabaseComment {
  id: string;
  annotationId: string;
  userId: string | null;
  sessionId: string | null;
  content: string;
  userDisplayName: string | null;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseAnonymousSession {
  sessionId: string;
  displayName: string;
  createdAt: string;
  lastActive: string;
  videoId: string | null;
  comparisonVideoId?: string | null;
}

// Application-specific interfaces (for Vue components)
export interface Annotation {
  id: string | number; // Support both UUID and legacy timestamp IDs
  content: string;
  title: string;
  severity: SeverityLevel;
  color: string;
  timestamp: number;
  frame: number;
  annotationType: AnnotationType;
  drawingData?: DrawingData;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  duration: number;
  durationFrames: number;
}

export interface Video {
  id: string;
  title: string;
  url: string;
  videoId: string;
  fps: number;
  duration: number;
  totalFrames: number;
  thumbnailUrl?: string;
  isPublic: boolean;
  ownerId: string;
  videoType: 'url' | 'upload';
  filePath?: string;
  fileSize?: number;
  originalFilename?: string;
  createdAt: string;
  updatedAt: string;
}

// Application interface for comparison videos
export interface ComparisonVideo {
  id: string;
  userId: string;
  title: string;
  description?: string;
  videoAId: string;
  videoBId: string;
  duration?: number;
  fps?: number;
  totalFrames?: number;
  thumbnailUrl?: string;
  thumbnailLayout?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;

  // Populated video references
  videoA?: Video;
  videoB?: Video;

  // Computed properties
  annotationCount?: number;
  comparisonAnnotationCount?: number;
}

// Application-level comment interfaces
export interface CommentUser {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
}

export interface Comment {
  id: string;
  annotationId: string;
  content: string;
  userId: string | null;
  sessionId: string | null;
  userDisplayName: string | null;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
  user?: CommentUser;
}

export interface AnonymousSession {
  sessionId: string;
  displayName: string;
  createdAt: string;
  lastActive: string;
  videoId: string | null;
  comparisonVideoId?: string | null;
}

// New interface for shared comparison videos
export interface SharedComparisonVideoWithCommentPermissions {
  id: string;
  title: string;
  description?: string;
  videoA: any | null; // Will be SharedVideoWithCommentPermissions from shareService
  videoB: any | null; // Will be SharedVideoWithCommentPermissions from shareService
  isPublic: boolean;
  canComment: boolean;
  annotations: any[];
  thumbnailUrl?: string;
  duration?: number;
  fps?: number;
  totalFrames?: number;
}

// Union type for mixed video lists (individual + comparison)
export type VideoEntity = Video | ComparisonVideo;

// Supabase client types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: DatabaseUser;
        Insert: Omit<DatabaseUser, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<DatabaseUser, 'id' | 'createdAt' | 'updatedAt'>>;
      };
      videos: {
        Row: DatabaseVideo;
        Insert: Omit<DatabaseVideo, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<DatabaseVideo, 'id' | 'createdAt' | 'updatedAt'>>;
      };
      annotations: {
        Row: DatabaseAnnotation;
        Insert: Omit<DatabaseAnnotation, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<
          Omit<DatabaseAnnotation, 'id' | 'createdAt' | 'updatedAt'>
        >;
      };
      comparison_videos: {
        Row: DatabaseComparisonVideo;
        Insert: Omit<DatabaseComparisonVideo, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<
          Omit<DatabaseComparisonVideo, 'id' | 'createdAt' | 'updatedAt'>
        >;
      };
      annotation_comments: {
        Row: DatabaseComment;
        Insert: Omit<DatabaseComment, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<
          Omit<DatabaseComment, 'id' | 'createdAt' | 'updatedAt'>
        >;
      };
      anonymous_sessions: {
        Row: DatabaseAnonymousSession;
        Insert: Omit<DatabaseAnonymousSession, 'createdAt' | 'lastActive'>;
        Update: Partial<
          Omit<DatabaseAnonymousSession, 'sessionId' | 'createdAt'>
        >;
      };
      labels: {
        Row: DatabaseLabel;
        Insert: Omit<DatabaseLabel, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<DatabaseLabel, 'id' | 'createdAt' | 'updatedAt'>>;
      };
      annotation_labels: {
        Row: DatabaseAnnotationLabel;
        Insert: Omit<DatabaseAnnotationLabel, 'id' | 'createdAt'>;
        Update: Partial<Omit<DatabaseAnnotationLabel, 'id' | 'createdAt'>>;
      };
    };
    Functions: {
      get_annotations_at_frame: {
        Args: {
          p_video_id: string;
          p_frame: number;
        };
        Returns: Array<{
          id: string;
          content: string;
          title: string;
          severity: SeverityLevel;
          color: string;
          frame: number;
        }>;
      };
      update_session_activity: {
        Args: {
          p_video_id: string;
          p_user_id: string;
        };
        Returns: void;
      };
      get_comparison_annotations_at_frame: {
        Args: {
          p_comparison_video_id: string;
          p_frame: number;
          p_video_a_id: string;
          p_video_b_id: string;
        };
        Returns: Array<{
          id: string;
          content: string;
          title: string;
          severity: SeverityLevel;
          color: string;
          frame: number;
          video_context: VideoContext;
        }>;
      };
      set_session_context: {
        Args: {
          session_id: string;
        };
        Returns: void;
      };
      cleanup_old_anonymous_sessions: {
        Args: {};
        Returns: void;
      };
    };
  };
}

// Utility types for data transformation
export type AnnotationInsert =
  Database['public']['Tables']['annotations']['Insert'];
export type AnnotationUpdate =
  Database['public']['Tables']['annotations']['Update'];
export type VideoInsert = Database['public']['Tables']['videos']['Insert'];
export type VideoUpdate = Database['public']['Tables']['videos']['Update'];
export type ComparisonVideoInsert =
  Database['public']['Tables']['comparison_videos']['Insert'];
export type ComparisonVideoUpdate =
  Database['public']['Tables']['comparison_videos']['Update'];
export type CommentInsert =
  Database['public']['Tables']['annotation_comments']['Insert'];
export type CommentUpdate =
  Database['public']['Tables']['annotation_comments']['Update'];
export type AnonymousSessionInsert =
  Database['public']['Tables']['anonymous_sessions']['Insert'];
export type AnonymousSessionUpdate =
  Database['public']['Tables']['anonymous_sessions']['Update'];
export type LabelInsertDB = Database['public']['Tables']['labels']['Insert'];
export type LabelUpdateDB = Database['public']['Tables']['labels']['Update'];
export type AnnotationLabelInsertDB =
  Database['public']['Tables']['annotation_labels']['Insert'];
export type AnnotationLabelUpdateDB =
  Database['public']['Tables']['annotation_labels']['Update'];

// Note: Transformation functions removed - database now uses camelCase matching frontend

// Type guards for video entities
export function isComparisonVideo(
  entity: VideoEntity
): entity is ComparisonVideo {
  return 'videoAId' in entity && 'videoBId' in entity;
}

export function isIndividualVideo(entity: VideoEntity): entity is Video {
  return 'videoId' in entity && !('videoAId' in entity);
}

// Note: All transformation functions removed - database now uses camelCase matching frontend
