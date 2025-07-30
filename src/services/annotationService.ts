import { supabase } from '../composables/useSupabase';
import type {
  AnnotationInsert,
  AnnotationUpdate,
  VideoContext,
  Annotation,
} from '../types/database';
import { CommentService, type CommentPermissions } from './commentService';

export class AnnotationService {
  static async createAnnotation(annotationData: AnnotationInsert) {
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
    includeCommentCounts?: boolean
  ) {
    // Validate videoId to prevent undefined queries
    if (!videoId || videoId === 'undefined') {
      return [];
    }

    let query = supabase.from('annotations').select('*').eq('videoId', videoId);

    // Filter by projectId if provided
    if (projectId) {
      query = query.eq('projectId', projectId);
    }

    const { data, error } = await query.order('timestamp', { ascending: true });

    if (error) {
      throw error;
    }

    // If comment counts are requested, fetch them for all annotations
    if (includeCommentCounts && data && data.length > 0) {
      try {
        const annotationIds = data.map((annotation) => annotation.id);
        const commentCounts = await Promise.all(
          annotationIds.map((id) => CommentService.getCommentCount(id))
        );

        // Add comment counts to annotations
        return data.map((annotation, index) => ({
          ...annotation,
          commentCount: commentCounts[index] || 0,
        }));
      } catch (commentError) {
        // Return annotations without comment counts if comment service fails
        return data;
      }
    }

    return data;
  }

  static async updateAnnotation(
    annotationId: string,
    updates: AnnotationUpdate
  ) {
    // Remove annotationType from updates object as it should not be included in update requests
    const updatesAny = updates as any;
    const { annotationType, ...cleanUpdates } = updatesAny;

    const { data, error } = await supabase
      .from('annotations')
      .update(cleanUpdates)
      .eq('id', annotationId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async deleteAnnotation(annotationId: string) {
    try {
      // First, delete all associated comments
      await CommentService.deleteAnnotationComments(annotationId);
    } catch (commentError) {
      // Continue with annotation deletion even if comment cleanup fails
    }

    const { error } = await supabase
      .from('annotations')
      .delete()
      .eq('id', annotationId);

    if (error) throw error;
  }

  static async getAnnotationsAtFrame(
    videoId: string,
    frame: number,
    projectId?: string,
    includeComments?: boolean
  ) {
    // Note: The database function get_annotations_at_frame may need to be updated
    // to support project filtering. For now, we'll use the existing function
    // and filter results if projectId is provided
    const { data, error } = await supabase.rpc('get_annotations_at_frame', {
      p_video_id: videoId,
      p_frame: frame,
    });

    if (error) throw error;

    // If projectId is provided and we have data, we would need to filter here
    // However, this requires the database function to be updated to support project filtering

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
   * Get annotations with comment count metadata
   */
  static async getAnnotationsWithCommentCounts(
    videoId: string,
    projectId?: string
  ) {
    try {
      // Get annotations first
      const annotations = await this.getVideoAnnotations(videoId, projectId);

      if (!annotations || annotations.length === 0) {
        return [];
      }

      // Get comment counts for all annotations
      const annotationIds = annotations.map((annotation) => annotation.id);
      const commentCounts = await Promise.all(
        annotationIds.map((id) => CommentService.getCommentCount(id))
      );

      // Combine annotations with comment counts
      const annotationsWithCounts = annotations.map((annotation, index) => ({
        ...annotation,
        comment_count: commentCounts[index] || 0,
      }));

      return annotationsWithCounts;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete annotation and cascade to all associated comments
   */
  static async deleteAnnotationWithComments(annotationId: string) {
    try {
      // Delete all associated comments first
      await CommentService.deleteAnnotationComments(annotationId);

      // Then delete the annotation
      const { error } = await supabase
        .from('annotations')
        .delete()
        .eq('id', annotationId);

      if (error) {
        throw error;
      }
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

      // User can moderate if they are the annotation owner
      const canModerate = userId && annotation.userId === userId;

      return canModerate;
    } catch (error) {
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
    const { data, error } = await supabase
      .from('annotations')
      .select('*')
      .eq('comparisonVideoId', comparisonVideoId)
      .order('timestamp', { ascending: true });

    if (error) {
      throw error;
    }

    // If comment counts are requested, fetch them for all annotations
    if (includeCommentCounts && data && data.length > 0) {
      try {
        const annotationIds = data.map((annotation) => annotation.id);
        const commentCounts = await Promise.all(
          annotationIds.map((id) => CommentService.getCommentCount(id))
        );

        // Add comment counts to annotations
        return data.map((annotation, index) => ({
          ...annotation,
          commentCount: commentCounts[index] || 0,
        }));
      } catch (commentError) {
        // Return annotations without comment counts if comment service fails
        return data || [];
      }
    }

    return data || [];
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
    annotation: Annotation,
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
      timestamp: annotation.timestamp || 0,
      frame: annotation.frame || null,
      startFrame: annotation.frame || 0,
      endFrame: annotation.frame || null,
      duration: annotation.duration || 1 / 30, // Default to 1 frame at 30fps
      durationFrames: annotation.durationFrames || 1,
      annotationType:
        annotation.annotationType ||
        (annotation.drawingData ? 'drawing' : 'text'),
      drawingData: annotation.drawingData || null,
      comparisonVideoId,
      videoContext,
      synchronizedFrame: synchronizedFrame || null,
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

  /**
   * Update annotation with comparison context
   */
  static async updateAnnotationContext(
    annotationId: string,
    videoContext: VideoContext,
    comparisonVideoId?: string,
    synchronizedFrame?: number
  ) {
    // Note: videoContext, comparisonVideoId, and synchronizedFrame are not supported in current database schema
    // This method is kept for API compatibility but only updates basic annotation fields
    const updates: any = {};

    // Only update fields that exist in the database schema
    // Since video_context doesn't exist in the database, we'll just return the annotation as-is
    const { data, error } = await supabase
      .from('annotations')
      .select('*')
      .eq('id', annotationId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get annotations at frame for comparison video
   */
  static async getComparisonAnnotationsAtFrame(
    comparisonVideoId: string,
    frame: number,
    videoAId: string,
    videoBId: string
  ) {
    // Use the database function if available, otherwise fall back to individual queries
    try {
      const { data, error } = await supabase.rpc(
        'get_comparison_annotations_at_frame',
        {
          p_comparison_video_id: comparisonVideoId,
          p_frame: frame,
          p_video_a_id: videoAId,
          p_video_b_id: videoBId,
        }
      );

      if (error) throw error;
      return data;
    } catch (error) {
      // Fallback: Get annotations individually
      const [comparisonAnnotations, videoAAnnotations, videoBAnnotations] =
        await Promise.all([
          this.getAnnotationsAtFrame(comparisonVideoId, frame),
          this.getAnnotationsAtFrame(videoAId, frame),
          this.getAnnotationsAtFrame(videoBId, frame),
        ]);

      return {
        comparison: comparisonAnnotations,
        videoA: videoAAnnotations,
        videoB: videoBAnnotations,
      };
    }
  }

  /**
   * Delete all annotations for a comparison video
   */
  static async deleteComparisonVideoAnnotations(comparisonVideoId: string) {
    try {
      // First get all annotations for this comparison video
      const { data: annotations, error: fetchError } = await supabase
        .from('annotations')
        .select('id')
        .eq('videoId', comparisonVideoId);

      if (fetchError) {
        throw fetchError;
      }

      // Delete comments for all annotations
      if (annotations && annotations.length > 0) {
        await Promise.all(
          annotations.map((annotation) =>
            CommentService.deleteAnnotationComments(annotation.id).catch(
              (error) => {}
            )
          )
        );
      }

      // Then delete all annotations
      const { error } = await supabase
        .from('annotations')
        .delete()
        .eq('videoId', comparisonVideoId);

      if (error) throw error;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get annotation count for comparison video
   */
  static async getComparisonVideoAnnotationCount(comparisonVideoId: string) {
    const { count, error } = await supabase
      .from('annotations')
      .select('*', { count: 'exact', head: true })
      .eq('videoId', comparisonVideoId);

    if (error) throw error;
    return count || 0;
  }
}
