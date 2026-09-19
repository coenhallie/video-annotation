import { assertRowsAffected } from '@/utils/assertRowsAffected';
import { supabase } from '../composables/useSupabase';
import type {
  AnnotationInsert,
  AnnotationUpdate,
  VideoContext,
  Annotation,
  AnnotationSurface,
} from '../types/database';
import { CommentService, type CommentPermissions } from './commentService';
import { handleServiceError } from '../utils/errorHandler';

/**
 * The annotations select, with each row's comment count riding along as an
 * embedded aggregate when asked for. Counting used to be one HEAD request per
 * annotation after the list had loaded.
 */
const annotationSelect = (withCommentCounts: boolean | undefined) =>
  withCommentCounts
    ? '*, annotation_labels ( labelId ), annotation_comments ( count )'
    : '*, annotation_labels ( labelId )';

/** Flattens the two embeds into the `labels` and `commentCount` the app uses. */
function hydrateAnnotationRows(
  data: unknown[] | null,
  withCommentCounts: boolean | undefined
): Array<Annotation & { labels: string[]; commentCount?: number }> {
  return (data ?? []).map((raw) => {
    const annotation = raw as Record<string, unknown>;
    const hydrated: Record<string, unknown> = {
      ...annotation,
      labels:
        (annotation.annotation_labels as Array<{ labelId: string }> | undefined)?.map(
          (al) => al.labelId
        ) || [],
    };
    if (withCommentCounts) {
      const embedded = annotation.annotation_comments as
        | Array<{ count: number }>
        | undefined;
      hydrated.commentCount = embedded?.[0]?.count ?? 0;
    }
    return hydrated as unknown as Annotation & {
      labels: string[];
      commentCount?: number;
    };
  });
}

export class AnnotationService {
  static async createAnnotation(annotationData: AnnotationInsert) {
    // Add validation warning
    if (!annotationData.projectId) {
      console.warn(
        '[AnnotationService] Creating annotation without projectId - this may cause isolation issues'
      );
    }

    const { data, error } = await supabase
      .from('annotations')
      .insert(annotationData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async getVideoAnnotations(
    videoId: string,
    projectId?: string,
    includeCommentCounts?: boolean,
    surface?: AnnotationSurface
  ) {
    // Validate videoId to prevent undefined queries
    if (!videoId || videoId === 'undefined') {
      return [];
    }

    let query = supabase
      .from('annotations')
      .select(annotationSelect(includeCommentCounts))
      .eq('videoId', videoId);

    // CRITICAL CHANGE: Filter by projectId
    if (projectId) {
      // When projectId is provided, only get annotations for this project
      query = query.eq('projectId', projectId);
    } else {
      // For backward compatibility: get annotations without projectId
      // This handles legacy annotations
      query = query.is('projectId', null);
    }

    // Omitted means "no surface filter", never "surface = video". Most callers
    // here are comparison, share and project-summary paths that predate
    // surfaces and must keep seeing every row.
    if (surface) {
      query = query.eq('surface', surface);
    }

    const { data, error } = await query.order('timestamp', { ascending: true });

    if (error) {
      throw error;
    }

    return hydrateAnnotationRows(data, includeCommentCounts);
  }

  static async updateAnnotation(
    annotationId: string,
    updates: AnnotationUpdate
  ) {
    const { data, error } = await supabase
      .from('annotations')
      .update(updates)
      .eq('id', annotationId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async deleteAnnotation(annotationId: string) {
    // Note: We don't need to manually delete comments anymore
    // The database has ON DELETE CASCADE which will automatically
    // delete all associated comments when the annotation is deleted

    const { data: deleted, error } = await supabase
      .from('annotations')
      .delete()
      .eq('id', annotationId)
      .select('id');

    if (error) throw error;
    assertRowsAffected(deleted, 'This annotation', 'delete it');
  }

  static async getAnnotationsAtFrame(
    videoId: string,
    frame: number,
    projectId?: string,
    includeComments?: boolean
  ) {
    // Direct query instead of using the database function
    // since the function doesn't support projectId filtering
    let query = supabase
      .from('annotations')
      .select('*')
      .eq('videoId', videoId)
      .lte('startFrame', frame)
      .gte('endFrame', frame);

    // Add projectId filter
    if (projectId) {
      query = query.eq('projectId', projectId);
    } else {
      query = query.is('projectId', null);
    }

    const { data, error } = await query;

    if (error) throw error;

    // If comments are requested, fetch them for all annotations at this frame
    if (includeComments && data && data.length > 0) {
      try {
        const annotationIds = data.map((annotation) => annotation.id);
        const commentsMap = await CommentService.getCommentsForAnnotations(
          annotationIds
        );

        // Add comments to annotations
        return data.map((annotation) => ({
          ...annotation,
          comments: commentsMap[annotation.id] || [],
          commentCount: (commentsMap[annotation.id] || []).length,
        }));
      } catch (commentError) {
        // Return annotations without comments if comment service fails
        handleServiceError('AnnotationService.getAnnotationsAtFrame', commentError);
        return data;
      }
    }

    return data;
  }

  // ===== COMMENT INTEGRATION METHODS =====

  /**
   * Get a single annotation with all its comments
   */
  static async getAnnotationWithComments(annotationId: string) {
    try {
      // Get the annotation
      const { data: annotation, error } = await supabase
        .from('annotations')
        .select('*')
        .eq('id', annotationId)
        .single();

      if (error) {
        throw error;
      }

      // Get comments for the annotation
      const comments = await CommentService.getAnnotationComments(annotationId);

      return {
        ...annotation,
        comments,
        comment_count: comments.length,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check if user can comment on a specific annotation
   */
  static async canUserCommentOnAnnotation(
    annotationId: string,
    userId?: string
  ): Promise<CommentPermissions> {
    try {
      return await CommentService.canUserCommentOnAnnotation(
        annotationId,
        userId
      );
    } catch (error) {
      handleServiceError('AnnotationService.canUserCommentOnAnnotation', error);
      return {
        canComment: false,
        canModerate: false,
        reason: 'Permission check failed',
      };
    }
  }

  /**
   * Check if user can moderate comments on a specific annotation
   */
  static async canUserModerateAnnotationComments(
    annotationId: string,
    userId?: string
  ): Promise<boolean> {
    try {
      // Get annotation to check if user is the owner
      const { data: annotation, error } = await supabase
        .from('annotations')
        .select('userId')
        .eq('id', annotationId)
        .single();

      if (error) {
        return false;
      }

      // User can moderate if they are the annotation owner. Boolean() rather
      // than a bare `userId &&`: with no userId that expression evaluates to the
      // falsy userId itself ('' or undefined), not to false, and this returns
      // Promise<boolean>.
      const canModerate = Boolean(userId) && annotation.userId === userId;

      return canModerate;
    } catch (error) {
      handleServiceError('AnnotationService.canUserModerateAnnotationComments', error);
      return false;
    }
  }

  // Comparison video annotation methods

  /**
   * Get annotations for a comparison video (comparison-specific only)
   */
  static async getComparisonVideoAnnotations(
    comparisonVideoId: string,
    includeCommentCounts?: boolean
  ) {
    // Validate comparisonVideoId to prevent undefined queries
    if (!comparisonVideoId || comparisonVideoId === 'undefined') {
      return [];
    }

    const { data, error } = await supabase
      .from('annotations')
      .select(annotationSelect(includeCommentCounts))
      .eq('comparisonVideoId', comparisonVideoId)
      .order('timestamp', { ascending: true });

    if (error) {
      throw error;
    }

    return hydrateAnnotationRows(data, includeCommentCounts);
  }

  /**
   * Get all annotations for a comparison video (individual + comparison)
   */
  static async getAllComparisonVideoAnnotations(
    comparisonVideoId: string,
    videoAId: string,
    videoBId: string
  ) {
    const [comparisonAnnotations, videoAAnnotations, videoBAnnotations] =
      await Promise.all([
        this.getComparisonVideoAnnotations(comparisonVideoId, true), // includeCommentCounts
        this.getVideoAnnotations(videoAId, undefined, true), // includeCommentCounts
        this.getVideoAnnotations(videoBId, undefined, true), // includeCommentCounts
      ]);

    return {
      comparison: comparisonAnnotations,
      videoA: videoAAnnotations.map((ann) => ({
        ...ann,
        videoContext: 'video_a' as const,
      })),
      videoB: videoBAnnotations.map((ann) => ({
        ...ann,
        videoContext: 'video_b' as const,
      })),
    };
  }

  /**
   * Create comparison-specific annotation
   */
  static async createComparisonAnnotation(
    comparisonVideoId: string,
    // Partial, not Annotation: every field below is read through a `||` or a
    // null check, so this has always accepted an incomplete draft. Declaring
    // Annotation just moved the mismatch to the callers.
    annotation: Partial<Annotation>,
    userId: string,
    videoContext: VideoContext = 'comparison',
    synchronizedFrame?: number,
    projectId?: string
  ) {
    // Create annotation data directly without transformation
    const annotationData: AnnotationInsert = {
      videoId: null, // videoId should be null for comparison annotations
      userId,
      projectId: projectId || null,
      content: annotation.content || '',
      title: annotation.title || 'Untitled Annotation',
      severity: annotation.severity || 'medium',
      color: annotation.color || '#6b7280',
      timestamp: Math.max(annotation.timestamp || 0, 0), // Ensure non-negative timestamp
      // Never null: the column is NOT NULL, and startFrame below already
      // defaults a missing frame to 0 the same way.
      frame: Math.max(annotation.frame ?? 0, 0),
      startFrame: Math.max(annotation.frame || 0, 0), // Ensure non-negative startFrame
      endFrame: annotation.frame != null ? Math.max(annotation.frame, 0) : null, // Ensure non-negative endFrame
      duration: Math.max(annotation.duration || 1 / 30, 1 / 30), // Ensure positive duration
      durationFrames: Math.max(annotation.durationFrames || 1, 1), // Ensure at least 1 frame
      annotationType:
        annotation.annotationType ||
        (annotation.drawingData ? 'drawing' : 'text'),
      drawingData: annotation.drawingData || null,
      comparisonVideoId,
      videoContext,
      synchronizedFrame:
        synchronizedFrame != null ? Math.max(synchronizedFrame, 0) : null,
      // Include dual video frame data if available - ensure non-negative values
      videoAFrame:
        annotation.videoAFrame != null
          ? Math.max(annotation.videoAFrame, 0)
          : null,
      videoBFrame:
        annotation.videoBFrame != null
          ? Math.max(annotation.videoBFrame, 0)
          : null,
      videoATimestamp:
        annotation.videoATimestamp != null
          ? Math.max(annotation.videoATimestamp, 0)
          : null,
      videoBTimestamp:
        annotation.videoBTimestamp != null
          ? Math.max(annotation.videoBTimestamp, 0)
          : null,
    };

    const { data, error } = await supabase
      .from('annotations')
      .insert(annotationData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

}
