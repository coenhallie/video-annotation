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
  thumbnailUrl?: string | null;
  metadata?: Record<string, unknown>;
  isPublic: boolean;
  allowAnnotations: boolean; // When true, requires authentication and allows annotations
  videoType: 'url' | 'upload';
  filePath?: string | null;
  fileSize?: number | null;
  originalFilename?: string | null;
  createdAt: string;
  updatedAt: string;
  qaStatus: QaStatus;
  qaStatusUpdatedAt?: string | null;
  qaStatusUpdatedBy?: string | null;
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

// Nullable columns are written `?: T | null`, not `?: T`. Both halves are load
// bearing under exactOptionalPropertyTypes: the `?` is what lets an insert omit
// the key, and the `| null` is what the column actually holds - PostgREST
// returns an explicit null for an empty nullable column, never an absent key.
// Modelling them as `?: T` alone claimed these columns were NOT NULL, which the
// database contradicts (verified against information_schema on 2026-09-02) and
// which made every legitimate `null` a type error at the call sites that write
// one. DatabaseComment below already models its nullable columns this way.
export interface DatabaseAnnotation {
  id: string;
  videoId?: string | null; // Null for comparison annotations
  comparisonVideoId?: string | null; // For comparison video annotations
  surface: AnnotationSurface; // Which editor tab this annotation belongs to
  userId: string;
  projectId?: string | null;
  content: string;
  title: string;
  severity: SeverityLevel;
  color: string;
  timestamp: number;
  frame: number; // NOT NULL, no default: every insert supplies it
  startFrame: number;
  endFrame?: number | null;
  duration: number;
  durationFrames: number;
  annotationType: AnnotationType;
  drawingData?: DrawingData | null;
  videoContext?: VideoContext | null; // Context for comparison annotations
  synchronizedFrame?: number | null; // For synchronized comparison annotations
  // Dual video frame tracking fields
  videoAFrame?: number | null; // Frame number for video A in dual mode
  videoBFrame?: number | null; // Frame number for video B in dual mode
  videoATimestamp?: number | null; // Timestamp for video A in dual mode
  videoBTimestamp?: number | null; // Timestamp for video B in dual mode
  metadata?: Record<string, unknown> | null;
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
export type ActivityEntityType = 'annotation' | 'comment' | 'video';
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
  /**
   * A rename, from the video event written by log_video_rename_activity.
   * `from` is null when the row being renamed had no title at all.
   */
  from?: string | null;
  to?: string | null;
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
  // `annotations.id` is `uuid NOT NULL`, and nothing in the codebase mints a
  // numeric id - the old `string | number` was a legacy allowance no code
  // exercised, which forced String() coercions at every consumer that needed a
  // real string.
  id: string;
  content: string;
  title: string;
  severity: SeverityLevel;
  color: string;
  timestamp: number;
  frame: number;
  annotationType: AnnotationType;
  // Nullable in the database, and PostgREST hands the null straight through.
  // The other nullable columns are left as-is deliberately: widening them all
  // raised the error count, because a lot of consuming code treats an absent
  // frame or timestamp as a number. Those are worth a separate pass.
  drawingData?: DrawingData | null;
  projectId?: string | null;
  comparisonVideoId?: string | null;
  synchronizedFrame?: number | null;
  startFrame?: number;
  endFrame?: number | null;
  videoAFrame?: number | null;
  videoBFrame?: number | null;
  videoATimestamp?: number | null;
  videoBTimestamp?: number | null;
  videoContext?: VideoContext | null;
  metadata?: Record<string, unknown> | null;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  duration: number;
  durationFrames: number;
  /**
   * Label ids, hydrated from the annotation_labels join - not a column on
   * annotations, which is why DatabaseAnnotation above does not carry it.
   *
   * Optional because absent and empty mean different things here: an absent
   * `labels` is a row whose join was never resolved (what the realtime
   * subscription pushes), while `[]` is a row that genuinely has no labels. The
   * timeline distinguishes the two.
   */
  labels?: string[];
}

export interface Video {
  id: string;
  title: string;
  url: string;
  videoId: string;
  fps: number;
  duration: number;
  totalFrames: number;
  thumbnailUrl?: string | null;
  isPublic: boolean;
  allowAnnotations: boolean; // When true, requires authentication and allows annotations
  ownerId: string;
  videoType: 'url' | 'upload';
  filePath?: string | null;
  fileSize?: number | null;
  originalFilename?: string | null;
  createdAt: string;
  updatedAt: string;
  qaStatus: QaStatus;
  qaStatusUpdatedAt?: string | null;
  qaStatusUpdatedBy?: string | null;
}

// Application interface for comparison videos
export interface ComparisonVideo {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  videoAId: string;
  videoBId: string;
  duration?: number;
  fps?: number;
  totalFrames?: number;
  thumbnailUrl?: string | null;
  thumbnailLayout?: string | null;
  isPublic: boolean;
  allowAnnotations: boolean; // When true, requires authentication and allows annotations
  createdAt: string;
  updatedAt: string;

  // Populated video references. Null when the referenced row is not visible
  // to the caller: an embed the policy filters out comes back as null.
  videoA?: Video | null;
  videoB?: Video | null;

  // Computed properties
  annotationCount?: number;
  comparisonAnnotationCount?: number;
}

// Application-level comment interfaces
export interface CommentUser {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
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
  // Null for an anonymous comment, and for one whose author row is not visible.
  user?: CommentUser | null;
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
export interface SharedVideoWithCommentPermissions {
  id: string;
  title: string;
  description?: string;
  url?: string;
  filePath?: string;
  videoType: string;
  /**
   * `videos.videoId`. Carried so a share view can tell an AWS pipeline video
   * (`aws:<outputVideoId>`) from a plain upload: the pipeline output tab and
   * the presigned-URL refresh both key off that prefix.
   */
  videoId?: string;
  /** `videos.ownerId` - needed to tell an owner from a share visitor. */
  ownerId?: string;
  isPublic: boolean;
  canComment: boolean;
  allowAnnotations: boolean;
  // Annotation rows as the services hydrate them. `Record<string, unknown>`
  // demanded an index signature no real annotation type has.
  annotations: Array<Annotation | Record<string, unknown>>;
}

export interface SharedComparisonVideoWithCommentPermissions {
  id: string;
  title: string;
  description?: string | null;
  /** `comparison_videos.userId` - needed to tell an owner from a share visitor. */
  ownerId?: string;
  videoA: SharedVideoWithCommentPermissions | null;
  videoB: SharedVideoWithCommentPermissions | null;
  isPublic: boolean;
  canComment: boolean;
  allowAnnotations: boolean;
  // Annotation rows as the services hydrate them. `Record<string, unknown>`
  // demanded an index signature no real annotation type has.
  annotations: Array<Annotation | Record<string, unknown>>;
  thumbnailUrl?: string | null;
}

// Union type for mixed video lists (individual + comparison)
export type VideoEntity = Video | ComparisonVideo;

// Insert/Update shapes come from the generated schema types (narrowed in
// ./supabase), so they follow the database after `npm run gen:types` instead of
// a hand-kept copy of it.
type Tables = import('./supabase').Database['public']['Tables'];

// Utility types for data transformation
export type AnnotationInsert =
  Tables['annotations']['Insert'];
export type AnnotationUpdate =
  Tables['annotations']['Update'];
export type VideoInsert = Tables['videos']['Insert'];
export type VideoUpdate = Tables['videos']['Update'];
export type ComparisonVideoInsert =
  Tables['comparison_videos']['Insert'];
export type ComparisonVideoUpdate =
  Tables['comparison_videos']['Update'];
export type CommentInsert =
  Tables['annotation_comments']['Insert'];
export type CommentUpdate =
  Tables['annotation_comments']['Update'];
export type AnonymousSessionInsert =
  Tables['anonymous_sessions']['Insert'];
export type AnonymousSessionUpdate =
  Tables['anonymous_sessions']['Update'];
export type LabelInsertDB = Tables['labels']['Insert'];
export type LabelUpdateDB = Tables['labels']['Update'];
export type AnnotationLabelInsertDB =
  Tables['annotation_labels']['Insert'];
export type AnnotationLabelUpdateDB =
  Tables['annotation_labels']['Update'];

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
