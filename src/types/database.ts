// types/database.ts

export type SeverityLevel = 'low' | 'medium' | 'high';
export type PermissionLevel = 'view' | 'comment' | 'edit';
export type ActionType = 'created' | 'updated' | 'deleted' | 'shared';
export type AnnotationType = 'text' | 'drawing';

// Comparison video types
export type ComparisonType = 'side_by_side' | 'overlay' | 'split';
export type SyncMode = 'time_based' | 'frame_based' | 'manual';
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
  video_id: string;
  user_id: string;
  // project_id?: string; // Removed: column doesn't exist in database
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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;

  // Populated video references
  video_a?: Video;
  video_b?: Video;

  // Computed properties
  annotation_count?: number;
  comparison_annotation_count?: number;
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
  const result = {
    video_id,
    user_id,
    // project_id, // Removed: column doesn't exist in database
    content: appAnnotation.content,
    title: appAnnotation.title,
    severity: appAnnotation.severity,
    color: appAnnotation.color,
    timestamp: appAnnotation.timestamp,
    frame: appAnnotation.frame,
    start_frame: appAnnotation.frame, // For point-in-time annotations, start_frame equals frame
    end_frame: appAnnotation.frame, // For point-in-time annotations, end_frame equals frame
    duration: 0, // Default duration for point-in-time annotations
    duration_frames: 1, // Default duration_frames for point-in-time annotations
    annotation_type: appAnnotation.annotationType,
    drawing_data: appAnnotation.drawingData,
  };

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
  };
}

// Enhanced annotation transformation for comparison videos
export function transformAppAnnotationToComparisonDatabase(
  appAnnotation: Annotation,
  video_id: string,
  user_id: string,
  comparison_video_id?: string,
  video_context: VideoContext = 'individual',
  synchronized_frame?: number,
  project_id?: string
): AnnotationInsert {
  const result = {
    video_id,
    user_id,
    // project_id, // Removed: column doesn't exist in database
    content: appAnnotation.content,
    title: appAnnotation.title,
    severity: appAnnotation.severity,
    color: appAnnotation.color,
    timestamp: appAnnotation.timestamp,
    frame: appAnnotation.frame,
    start_frame: appAnnotation.frame,
    end_frame: appAnnotation.frame,
    duration: 0, // Default duration for point-in-time annotations
    duration_frames: 1, // Default duration_frames for point-in-time annotations
    annotation_type: appAnnotation.annotationType,
    drawing_data: appAnnotation.drawingData,
    // Note: comparison_video_id, video_context, synchronized_frame are not supported in current database schema
  };

  return result;
}
