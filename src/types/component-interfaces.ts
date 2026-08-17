/**
 * Typed interfaces replacing `any` types used throughout the app.
 * These cover the data shapes flowing between DashboardView, AnnotationPanel,
 * and related composables/services.
 */

import type {
  Video,
  ComparisonVideo,
  DrawingData,
  Comment,
  SharedComparisonVideoWithCommentPermissions,
} from './database';
import type { SharedVideoWithCommentPermissions } from '../services/shareService';
import type { Label } from './labels';

// ---------------------------------------------------------------------------
// Drawing canvas component ref (exposed by DrawingCanvas.vue)
// ---------------------------------------------------------------------------

/** Methods and state exposed by a DrawingCanvas component instance. */
export interface DrawingCanvasExpose {
  hasDrawingsOnCurrentFrame?: () => boolean;
  clearDrawings?: () => void;
  getCurrentDrawingSession?: () => DrawingData | null;
  completeDrawingSession?: (videoContext?: 'A' | 'B') => void;
  clearCurrentFrameDrawings?: () => void;
}

// ---------------------------------------------------------------------------
// Video events
// ---------------------------------------------------------------------------

/** Data emitted by UnifiedVideoPlayer when a video finishes loading. */
export interface VideoLoadedEvent {
  /** Video database ID (when available). */
  id?: string;
  /** Detected/reported duration in seconds. */
  duration?: number;
  /** Detected native dimensions. */
  dimensions?: { width: number; height: number };
  /** Video title (from metadata or filename). */
  title?: string;
  /** Detected or configured FPS. */
  fps?: number;
  /** Computed total frame count. */
  totalFrames?: number;
  /** Type of the video source. */
  videoType?: 'url' | 'upload';
  /** Pre-existing video record passed through to prevent re-creation. */
  existingVideo?: Partial<Video> | null;
  /** Allow arbitrary extra fields that composables may attach. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Project / video selection
// ---------------------------------------------------------------------------

/** Shape emitted by ProjectManagementModal when a project is selected. */
export interface ProjectSelection {
  /** Project/video ID (also used as projectId for annotations). */
  id?: string;
  /** Display title. */
  title?: string;
  /** Discriminator for player mode. */
  projectType?: 'single' | 'dual';
  /** Individual video record (present when projectType === 'single'). */
  video?: Video;
  /** Video ID shortcut. */
  videoId?: string;
  /** Comparison video record (present when projectType === 'dual'). */
  comparisonVideo?: ComparisonVideo | ComparisonCreatedEvent;
  /** Video A record for dual mode. */
  videoA?: Video;
  /** Video B record for dual mode. */
  videoB?: Video;
  /** Timestamps from the record. */
  createdAt?: string;
  updatedAt?: string;
}

/** Shape emitted by CreateComparisonModal when a comparison is created. */
export interface ComparisonCreatedEvent extends Partial<ComparisonVideo> {
  id: string;
  videoA: Video;
  videoB: Video;
}

// ---------------------------------------------------------------------------
// Annotation panel types
// ---------------------------------------------------------------------------

/** Annotation as consumed by AnnotationPanel (superset of Annotation with panel-specific fields). */
export interface PanelAnnotation {
  id: string;
  title?: string;
  content?: string;
  color?: string;
  timestamp: number;
  frame?: number;
  startFrame?: number;
  endFrame?: number;
  duration?: number;
  durationFrames?: number;
  annotationType?: string;
  drawingData?: DrawingData | null;
  videoAFrame?: number;
  videoBFrame?: number;
  videoATimestamp?: number;
  videoBTimestamp?: number;
  commentCount?: number;
  labels?: string[];
}

/** Draft data for a new annotation being created in the form. */
export interface NewAnnotationDraft {
  content: string;
  color: string;
  frame: number;
  annotationType: string;
  drawingData: DrawingData | null;
  startFrame?: number;
  endFrame?: number;
  duration?: number;
  durationFrames?: number;
  labels?: string[];
}

/** Data shape emitted by the annotation panel when adding/updating an annotation. */
export interface AnnotationFormData {
  content?: string;
  title?: string;
  color?: string;
  frame?: number;
  timestamp?: number;
  startFrame?: number;
  endFrame?: number;
  duration?: number;
  durationFrames?: number;
  annotationType?: string;
  drawingData?: DrawingData | null;
  videoContext?: string;
  videoAFrame?: number;
  videoBFrame?: number;
  videoATimestamp?: number;
  videoBTimestamp?: number;
  labels?: string[];
  /** Allow extra fields that pass through to the annotation service. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Drawing events
// ---------------------------------------------------------------------------

/** Drawing data emitted from the canvas when a drawing is completed. */
export interface DrawingCreatedEvent {
  paths: Array<{
    points: Array<{ x: number; y: number }>;
    strokeWidth: number;
    color: string;
    timestamp: number;
  }>;
  canvasWidth: number;
  canvasHeight: number;
  frame: number;
  /** Dual-mode sub-drawings (populated by useDrawingCanvas). */
  drawingA?: {
    paths: Array<{ points: Array<{ x: number; y: number }>; strokeWidth: number; color: string; timestamp: number }>;
    canvasWidth: number;
    canvasHeight: number;
    frame: number;
  };
  drawingB?: {
    paths: Array<{ points: Array<{ x: number; y: number }>; strokeWidth: number; color: string; timestamp: number }>;
    canvasWidth: number;
    canvasHeight: number;
    frame: number;
  };
}

// ---------------------------------------------------------------------------
// Shared video types
// ---------------------------------------------------------------------------

/** Shared video data stored in sharedVideoData ref. */
export type SharedVideoData = SharedVideoWithCommentPermissions;

/** Shared comparison video data. */
export type SharedComparisonData = SharedComparisonVideoWithCommentPermissions;

/** Pending shared content waiting for authentication. */
export type PendingSharedContent =
  | { type: 'video'; id: string; data: SharedVideoData }
  | { type: 'comparison'; id: string; data: SharedComparisonData };

// ---------------------------------------------------------------------------
// Comment events (re-exported for convenience)
// ---------------------------------------------------------------------------

/** Comment event data passed through AnnotationPanel emit handlers. */
export type CommentEvent = Comment;

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

/** Label color lookup map: label ID -> Label object. */
export type LabelColorMap = Record<string, Label>;
