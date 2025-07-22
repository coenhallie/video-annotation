// types/database.ts

export type SeverityLevel = 'low' | 'medium' | 'high';
export type PermissionLevel = 'view' | 'comment' | 'edit';
export type ActionType = 'created' | 'updated' | 'deleted' | 'shared';
export type AnnotationType = 'text' | 'drawing';

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
  content: string;
  title: string;
  severity: SeverityLevel;
  color: string;
  timestamp: number;
  frame: number;
  start_frame: number; // For point-in-time annotations, same as frame
  end_frame?: number; // Optional for ranged annotations
  annotation_type: AnnotationType;
  drawing_data?: DrawingData;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DatabaseVideoSession {
  id: string;
  video_id: string;
  user_id: string;
  session_name?: string;
  is_active: boolean;
  last_accessed: string;
  created_at: string;
}

export interface DatabaseVideoShare {
  id: string;
  video_id: string;
  shared_by_user_id: string;
  shared_with_user_id: string;
  permission_level: PermissionLevel;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
}

export interface DatabaseAnnotationComment {
  id: string;
  annotation_id: string;
  user_id: string;
  content: string;
  parent_comment_id?: string;
  created_at: string;
  updated_at: string;
}

export interface DatabaseUserPreferences {
  id: string;
  user_id: string;
  preferences: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DatabaseAnnotationHistory {
  id: string;
  annotation_id: string;
  user_id: string;
  action_type: ActionType;
  old_data?: Record<string, any>;
  new_data?: Record<string, any>;
  created_at: string;
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

export interface VideoSession {
  id: string;
  video_id: string;
  user_id: string;
  session_name?: string;
  is_active: boolean;
  last_accessed: string;
}

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
      video_sessions: {
        Row: DatabaseVideoSession;
        Insert: Omit<DatabaseVideoSession, 'id' | 'created_at'>;
        Update: Partial<Omit<DatabaseVideoSession, 'id' | 'created_at'>>;
      };
      video_shares: {
        Row: DatabaseVideoShare;
        Insert: Omit<DatabaseVideoShare, 'id' | 'created_at'>;
        Update: Partial<Omit<DatabaseVideoShare, 'id' | 'created_at'>>;
      };
      annotation_comments: {
        Row: DatabaseAnnotationComment;
        Insert: Omit<
          DatabaseAnnotationComment,
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<
          Omit<DatabaseAnnotationComment, 'id' | 'created_at' | 'updated_at'>
        >;
      };
      user_preferences: {
        Row: DatabaseUserPreferences;
        Insert: Omit<
          DatabaseUserPreferences,
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<
          Omit<DatabaseUserPreferences, 'id' | 'created_at' | 'updated_at'>
        >;
      };
      annotation_history: {
        Row: DatabaseAnnotationHistory;
        Insert: Omit<DatabaseAnnotationHistory, 'id' | 'created_at'>;
        Update: never; // History records should not be updated
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
  user_id: string
): AnnotationInsert {
  const result = {
    video_id,
    user_id,
    content: appAnnotation.content,
    title: appAnnotation.title,
    severity: appAnnotation.severity,
    color: appAnnotation.color,
    timestamp: appAnnotation.timestamp,
    frame: appAnnotation.frame,
    start_frame: appAnnotation.frame, // For point-in-time annotations, start_frame equals frame
    end_frame: appAnnotation.frame, // For point-in-time annotations, end_frame equals frame
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
