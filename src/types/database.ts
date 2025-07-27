// types/database.ts

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
  full_name?: string;
  avatar_url?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DatabaseVideo {
  id: string;
  owner_id: string;
  title: string;
  url: string;
  video_id: string;
  fps: number;
  duration: number;
  total_frames: number;
  thumbnail_url?: string;
  metadata?: Record<string, any>;
  is_public: boolean;
  video_type: 'url' | 'upload';
  file_path?: string;
  file_size?: number;
  original_filename?: string;
  created_at: string;
  updated_at: string;
}

export interface DatabaseAnnotation {
  id: string;
  video_id?: string; // Nullable for comparison annotations
  comparison_video_id?: string; // For comparison video annotations
  user_id: string;
  project_id?: string;
  content: string;
  title: string;
  severity: SeverityLevel;
  color: string;
  timestamp: number;
  frame?: number;
  start_frame: number;
  end_frame?: number;
  duration: number;
  duration_frames: number;
  annotation_type: AnnotationType;
  drawing_data?: DrawingData;
  video_context?: VideoContext; // Context for comparison annotations
  synchronized_frame?: number; // For synchronized comparison annotations
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DatabaseComparisonVideo {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  video_a_id: string;
  video_b_id: string;
  duration?: number;
  fps?: number;
  total_frames?: number;
  thumbnail_url?: string;
  thumbnail_layout?: string;
  is_public: boolean; // NEW FIELD
  created_at: string;
  updated_at: string;
}

// Comment system interfaces
export interface DatabaseComment {
  id: string;
  annotation_id: string;
  user_id: string | null;
  session_id: string | null;
  content: string;
  user_display_name: string | null;
  is_anonymous: boolean;
  created_at: string;
  updated_at: string;
}

export interface DatabaseAnonymousSession {
  session_id: string;
  display_name: string;
  created_at: string;
  last_active: string;
  video_id: string | null;
  comparison_video_id?: string | null;
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
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Video {
  id: string;
  title: string;
  url: string;
  video_id: string;
  fps: number;
  duration: number;
  total_frames: number;
  thumbnail_url?: string;
  is_public: boolean;
  owner_id: string;
  video_type: 'url' | 'upload';
  file_path?: string;
  file_size?: number;
  original_filename?: string;
  created_at: string;
  updated_at: string;
}

// Application interface for comparison videos
export interface ComparisonVideo {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  video_a_id: string;
  video_b_id: string;
  duration?: number;
  fps?: number;
  total_frames?: number;
  thumbnail_url?: string;
  thumbnail_layout?: string;
  is_public: boolean; // NEW FIELD
  created_at: string;
  updated_at: string;

  // Populated video references
  video_a?: Video;
  video_b?: Video;

  // Computed properties
  annotation_count?: number;
  comparison_annotation_count?: number;
}

// Application-level comment interfaces
export interface CommentUser {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

export interface Comment {
  id: string;
  annotation_id: string;
  content: string;
  user_id: string | null;
  session_id: string | null;
  user_display_name: string | null;
  is_anonymous: boolean;
  created_at: string;
  updated_at: string;
  user?: CommentUser;
}

export interface AnonymousSession {
  session_id: string;
  display_name: string;
  created_at: string;
  last_active: string;
  video_id: string | null;
  comparison_video_id?: string | null; // NEW FIELD for comparison video sessions
}

// New interface for shared comparison videos
export interface SharedComparisonVideoWithCommentPermissions {
  id: string;
  title: string;
  description?: string;
  video_a: any | null; // Will be SharedVideoWithCommentPermissions from shareService
  video_b: any | null; // Will be SharedVideoWithCommentPermissions from shareService
  is_public: boolean;
  can_comment: boolean;
  annotations: any[];
  thumbnail_url?: string;
  duration?: number;
  fps?: number;
  total_frames?: number;
}

// Union type for mixed video lists (individual + comparison)
export type VideoEntity = Video | ComparisonVideo;

// Supabase client types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: DatabaseUser;
        Insert: Omit<DatabaseUser, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DatabaseUser, 'id' | 'created_at' | 'updated_at'>>;
      };
      videos: {
        Row: DatabaseVideo;
        Insert: Omit<DatabaseVideo, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<
          Omit<DatabaseVideo, 'id' | 'created_at' | 'updated_at'>
        >;
      };
      annotations: {
        Row: DatabaseAnnotation;
        Insert: Omit<DatabaseAnnotation, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<
          Omit<DatabaseAnnotation, 'id' | 'created_at' | 'updated_at'>
        >;
      };
      comparison_videos: {
        Row: DatabaseComparisonVideo;
        Insert: Omit<
          DatabaseComparisonVideo,
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<
          Omit<DatabaseComparisonVideo, 'id' | 'created_at' | 'updated_at'>
        >;
      };
      annotation_comments: {
        Row: DatabaseComment;
        Insert: Omit<DatabaseComment, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<
          Omit<DatabaseComment, 'id' | 'created_at' | 'updated_at'>
        >;
      };
      anonymous_sessions: {
        Row: DatabaseAnonymousSession;
        Insert: Omit<DatabaseAnonymousSession, 'created_at' | 'last_active'>;
        Update: Partial<
          Omit<DatabaseAnonymousSession, 'session_id' | 'created_at'>
        >;
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

// Helper functions for data transformation
export function transformDatabaseAnnotationToApp(
  dbAnnotation: DatabaseAnnotation
): Annotation {
  const result = {
    id: dbAnnotation.id,
    content: dbAnnotation.content,
    title: dbAnnotation.title,
    severity: dbAnnotation.severity,
    color: dbAnnotation.color,
    timestamp: dbAnnotation.timestamp,
    frame: dbAnnotation.frame,
    annotationType: dbAnnotation.annotation_type,
    drawingData: dbAnnotation.drawing_data,
    user_id: dbAnnotation.user_id,
    created_at: dbAnnotation.created_at,
    updated_at: dbAnnotation.updated_at,
  };

  return result;
}

export function transformAppAnnotationToDatabase(
  appAnnotation: Annotation,
  video_id: string,
  user_id: string,
  project_id?: string
): AnnotationInsert {
  console.log('🔧 [Database] Transforming annotation to database format:', {
    video_id,
    user_id,
    project_id,
    annotationType: appAnnotation.annotationType,
    frame: appAnnotation.frame,
  });

  const result = {
    video_id,
    user_id,
    project_id: project_id || null, // Now supported in database
    content: appAnnotation.content || '',
    title: appAnnotation.title || 'Untitled Annotation',
    severity: appAnnotation.severity || 'medium',
    color: appAnnotation.color || '#6b7280',
    timestamp: appAnnotation.timestamp || 0,
    frame: appAnnotation.frame || 0,
    start_frame: appAnnotation.frame || 0, // For point-in-time annotations, start_frame equals frame
    end_frame: appAnnotation.frame || 0, // For point-in-time annotations, end_frame equals frame
    duration: 0, // Default duration for point-in-time annotations
    duration_frames: 1, // Default duration_frames for point-in-time annotations
    annotation_type: appAnnotation.annotationType || 'text',
    drawing_data: appAnnotation.drawingData || null,
    // New columns for comparison support
    comparison_video_id: null, // Will be set by comparison-specific functions
    video_context: 'individual' as VideoContext, // Default to individual video context
    synchronized_frame: null, // Will be set for comparison annotations
  };

  console.log('✅ [Database] Transformed annotation result:', result);
  return result;
}

export function transformDatabaseVideoToApp(dbVideo: DatabaseVideo): Video {
  return {
    id: dbVideo.id,
    title: dbVideo.title,
    url: dbVideo.url,
    video_id: dbVideo.video_id,
    fps: dbVideo.fps,
    duration: dbVideo.duration,
    total_frames: dbVideo.total_frames,
    thumbnail_url: dbVideo.thumbnail_url,
    is_public: dbVideo.is_public,
    owner_id: dbVideo.owner_id,
    video_type: dbVideo.video_type,
    file_path: dbVideo.file_path,
    file_size: dbVideo.file_size,
    original_filename: dbVideo.original_filename,
    created_at: dbVideo.created_at,
    updated_at: dbVideo.updated_at,
  };
}

// Type guards for video entities
export function isComparisonVideo(
  entity: VideoEntity
): entity is ComparisonVideo {
  return 'video_a_id' in entity && 'video_b_id' in entity;
}

export function isIndividualVideo(entity: VideoEntity): entity is Video {
  return 'video_id' in entity && !('video_a_id' in entity);
}

// Transformation functions for comparison videos
export function transformDatabaseComparisonVideoToApp(
  dbComparisonVideo: DatabaseComparisonVideo,
  videoA?: Video,
  videoB?: Video
): ComparisonVideo {
  // Calculate duration and fps from videos if not available in comparison
  const duration =
    dbComparisonVideo.duration ||
    (videoA && videoB ? Math.max(videoA.duration, videoB.duration) : undefined);
  const fps = dbComparisonVideo.fps || (videoA ? videoA.fps : undefined);
  const total_frames =
    dbComparisonVideo.total_frames ||
    (videoA && videoB
      ? Math.max(videoA.total_frames, videoB.total_frames)
      : undefined);

  return {
    id: dbComparisonVideo.id,
    user_id: dbComparisonVideo.user_id,
    title: dbComparisonVideo.title,
    description: dbComparisonVideo.description,
    video_a_id: dbComparisonVideo.video_a_id,
    video_b_id: dbComparisonVideo.video_b_id,
    duration,
    fps,
    total_frames,
    thumbnail_url: dbComparisonVideo.thumbnail_url,
    thumbnail_layout: dbComparisonVideo.thumbnail_layout,
    is_public: dbComparisonVideo.is_public,
    created_at: dbComparisonVideo.created_at,
    updated_at: dbComparisonVideo.updated_at,
    video_a: videoA,
    video_b: videoB,
  };
}

export function transformAppComparisonVideoToDatabase(
  appComparisonVideo: Partial<ComparisonVideo>,
  user_id: string
): ComparisonVideoInsert {
  return {
    user_id,
    title: appComparisonVideo.title!,
    description: appComparisonVideo.description,
    video_a_id: appComparisonVideo.video_a_id!,
    video_b_id: appComparisonVideo.video_b_id!,
    duration: appComparisonVideo.duration,
    fps: appComparisonVideo.fps,
    total_frames: appComparisonVideo.total_frames,
    thumbnail_url: appComparisonVideo.thumbnail_url,
    thumbnail_layout: appComparisonVideo.thumbnail_layout || 'side-by-side',
    is_public: appComparisonVideo.is_public || false,
  };
}

// Enhanced annotation transformation for comparison videos
export function transformAppAnnotationToComparisonDatabase(
  appAnnotation: Annotation,
  video_id: string | null,
  user_id: string,
  comparison_video_id?: string,
  video_context: VideoContext = 'individual',
  synchronized_frame?: number,
  project_id?: string
): AnnotationInsert {
  console.log(
    '🔧 [Database] Transforming comparison annotation to database format:',
    {
      video_id,
      user_id,
      comparison_video_id,
      video_context,
      synchronized_frame,
      project_id,
    }
  );

  // For comparison annotations, video_id should be null and comparison_video_id should be set
  const actualVideoId = comparison_video_id ? null : video_id;

  // Map video context from dual video player format to database format
  const mappedVideoContext =
    video_context === 'A'
      ? 'video_a'
      : video_context === 'B'
      ? 'video_b'
      : video_context || 'individual';

  const result = {
    video_id: actualVideoId,
    user_id,
    project_id: project_id || null, // Now supported in database
    content: appAnnotation.content || '',
    title: appAnnotation.title || 'Untitled Annotation',
    severity: appAnnotation.severity || 'medium',
    color: appAnnotation.color || '#6b7280',
    timestamp: appAnnotation.timestamp || 0,
    frame: appAnnotation.frame || null, // Use null for optional frame field
    start_frame: appAnnotation.frame || 0, // Required field, use 0 as fallback
    end_frame: appAnnotation.frame || null, // Use null for point-in-time annotations
    duration: 0, // Default duration for point-in-time annotations
    duration_frames: 1, // Default duration_frames for point-in-time annotations
    annotation_type: appAnnotation.annotationType || 'text',
    drawing_data: appAnnotation.drawingData || null,
    // Now supported comparison columns
    comparison_video_id: comparison_video_id || null,
    video_context: mappedVideoContext,
    synchronized_frame: synchronized_frame || null,
  };

  console.log(
    '✅ [Database] Transformed comparison annotation result:',
    result
  );
  return result;
}

// Comment transformation functions
export function transformDatabaseCommentToApp(dbComment: any): Comment {
  return {
    id: dbComment.id,
    annotation_id: dbComment.annotation_id,
    content: dbComment.content,
    user_id: dbComment.user_id,
    session_id: dbComment.session_id,
    user_display_name: dbComment.user_display_name,
    is_anonymous: dbComment.is_anonymous,
    created_at: dbComment.created_at,
    updated_at: dbComment.updated_at,
    user: dbComment.user,
  };
}

export function transformAppCommentToDatabase(
  appComment: Partial<Comment>,
  annotation_id: string,
  user_id?: string,
  session_id?: string
): CommentInsert {
  return {
    annotation_id,
    user_id: user_id || null,
    session_id: session_id || null,
    content: appComment.content!,
    user_display_name: appComment.user_display_name || null,
    is_anonymous: appComment.is_anonymous || false,
  };
}

export function transformDatabaseAnonymousSessionToApp(
  dbSession: DatabaseAnonymousSession
): AnonymousSession {
  return {
    session_id: dbSession.session_id,
    display_name: dbSession.display_name,
    created_at: dbSession.created_at,
    last_active: dbSession.last_active,
    video_id: dbSession.video_id,
  };
}
