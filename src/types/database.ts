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
  // For dual video mode - store video-specific drawing data
  drawingA?: {
    paths: DrawingPath[];
    canvasWidth: number;
    canvasHeight: number;
    frame: number;
  };
  drawingB?: {
    paths: DrawingPath[];
    canvasWidth: number;
    canvasHeight: number;
    frame: number;
  };
}

// Base interfaces
export interface DatabaseUser {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
  isPublic: boolean;
  allowAnnotations: boolean; // When true, requires authentication and allows annotations
  videoType: 'url' | 'upload';
  filePath?: string;
  fileSize?: number;
  originalFilename?: string;
  createdAt: string;
  updatedAt: string;
  qaStatus: QaStatus;
  qaStatusUpdatedAt?: string;
  qaStatusUpdatedBy?: string;
}

/**
 * Which surface of a match an annotation was made on. The editor shows the
 * rendered video and the pipeline's data output as two tabs over one video row,
 * and each tab shows only its own annotations.
 */
export type AnnotationSurface = 'video' | 'pipeline';

/**
 * QA completion status of a video. A saved label and nothing more: no code
 * reads it to gate, filter or trigger anything.
 *
 * `failed` is not in the literal request. It is here because a QA control with
 * no way to say "this did not pass" forces reviewers to leave the video in a
 * state that lies.
 */
export type QaStatus =
  | 'not_started'
  | 'in_review'
  | 'failed'
  | 'staging'
  | 'production';

export interface DatabaseAnnotation {
  id: string;
  videoId?: string; // Nullable for comparison annotations
  comparisonVideoId?: string; // For comparison video annotations
  surface: AnnotationSurface; // Which editor tab this annotation belongs to
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
  metadata?: Record<string, unknown>;
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
  allowAnnotations: boolean; // When true, requires authentication and allows annotations
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

export interface DatabaseProjectOpen {
  id: string;
  userId: string;
  videoId: string | null;
  comparisonVideoId: string | null;
  openedAt: string;
}

// Activity log interfaces
export type ActivityEntityType = 'annotation' | 'comment';
export type ActivityAction = 'created' | 'updated' | 'deleted';

/**
 * Snapshot taken at event time. Every field is optional because the row has to
 * survive schema drift in both directions: a deleted annotation has no title
 * left to join to, and a future trigger may add fields this frontend predates.
 */
export interface ActivitySummary {
  title?: string;
  excerpt?: string;
  annotationTitle?: string;
  annotationId?: string;
  timestamp?: number;
  /**
   * Which editor surface the annotation lives on. Optional because rows
   * written before this field existed carry no such key; callers that need to
   * switch surface before selecting must treat its absence as "unknown", not
   * as "video".
   */
  surface?: AnnotationSurface;
}

export interface DatabaseActivityEvent {
  id: string;
  videoId: string | null;
  comparisonVideoId: string | null;
  actorId: string | null;
  actorName: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  summary: ActivitySummary;
  createdAt: string;
}

/** A row with its actor name resolved and its target's liveness decided. */
export interface ActivityEntry extends DatabaseActivityEvent {
  actor: string;
  /** The annotation this entry points at still exists, so clicking can seek. */
  live: boolean;
}

export interface ActivityDayGroup {
  key: string;
  label: string;
  entries: ActivityEntry[];
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
  projectId?: string;
  comparisonVideoId?: string;
  synchronizedFrame?: number;
  startFrame?: number;
  endFrame?: number;
  videoAFrame?: number;
  videoBFrame?: number;
  videoATimestamp?: number;
  videoBTimestamp?: number;
  videoContext?: VideoContext;
  metadata?: Record<string, unknown>;
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
  allowAnnotations: boolean; // When true, requires authentication and allows annotations
  ownerId: string;
  videoType: 'url' | 'upload';
  filePath?: string;
  fileSize?: number;
  originalFilename?: string;
  createdAt: string;
  updatedAt: string;
  qaStatus: QaStatus;
  qaStatusUpdatedAt?: string;
  qaStatusUpdatedBy?: string;
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
  allowAnnotations: boolean; // When true, requires authentication and allows annotations
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
  /** `comparison_videos.userId` - needed to tell an owner from a share visitor. */
  ownerId?: string;
  videoA: Record<string, unknown> | null; // SharedVideoWithCommentPermissions from shareService
  videoB: Record<string, unknown> | null; // SharedVideoWithCommentPermissions from shareService
  isPublic: boolean;
  canComment: boolean;
  allowAnnotations: boolean;
  annotations: Record<string, unknown>[];
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
        // `qaStatus` is optional on insert only because the column is
        // NOT NULL DEFAULT 'not_started'. Omitting it means 'not_started'.
        Insert: Omit<
          DatabaseVideo,
          'id' | 'createdAt' | 'updatedAt' | 'qaStatus'
        > & { qaStatus?: QaStatus };
        Update: Partial<Omit<DatabaseVideo, 'id' | 'createdAt' | 'updatedAt'>>;
      };
      annotations: {
        Row: DatabaseAnnotation;
        // `surface` is optional on insert only because the column is
        // NOT NULL DEFAULT 'video'. Omitting it means 'video'. Four call sites
        // omit it deliberately: annotationService.ts createComparisonAnnotation
        // and the two useComparisonVideoWorkflow inserts, where the value is
        // meaningless, plus any legacy path not yet surface-aware.
        Insert: Omit<
          DatabaseAnnotation,
          'id' | 'createdAt' | 'updatedAt' | 'surface'
        > & { surface?: AnnotationSurface };
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
      project_opens: {
        Row: DatabaseProjectOpen;
        Insert: Omit<DatabaseProjectOpen, 'id'>;
        Update: Partial<Omit<DatabaseProjectOpen, 'id'>>;
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
      set_video_thumbnail: {
        Args: {
          video_id: string;
          thumbnail: string;
        };
        // false when the row already had a thumbnail or no longer exists.
        Returns: boolean;
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
