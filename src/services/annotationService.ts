import { supabase } from '../composables/useSupabase';
import type {
  AnnotationInsert,
  AnnotationUpdate,
  VideoContext,
  Annotation,
} from '../types/database';
import {
  transformDatabaseAnnotationToApp,
  transformAppAnnotationToComparisonDatabase,
} from '../types/database';
import { CommentService, type CommentPermissions } from './commentService';

export class AnnotationService {
  static async createAnnotation(annotationData: AnnotationInsert) {
    console.log(
      '🔍 [AnnotationService] Creating annotation with data:',
      annotationData
    );

    const { data, error } = await supabase
      .from('annotations')
      .insert(annotationData)
      .select()
      .single();

    if (error) {
      console.error(
        '❌ [AnnotationService] Failed to create annotation:',
        error
      );
      console.error('❌ [AnnotationService] Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw error;
    }

    console.log(
      '✅ [AnnotationService] Successfully created annotation:',
      data
    );
    return data;
  }

  static async getVideoAnnotations(
    videoId: string,
    projectId?: string,
    includeCommentCounts?: boolean
  ) {
    console.log('🔍 [AnnotationService] Getting video annotations:', {
      videoId,
      projectId,
      includeCommentCounts,
    });

    let query = supabase
      .from('annotations')
      .select('*')
      .eq('video_id', videoId);

    // Filter by project_id if provided
    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.order('timestamp', { ascending: true });

    if (error) {
      console.error(
        '❌ [AnnotationService] Error getting video annotations:',
        error
      );
      throw error;
    }

    console.log(
      '✅ [AnnotationService] Retrieved annotations:',
      data?.length || 0
    );

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
          comment_count: commentCounts[index] || 0,
        }));
      } catch (commentError) {
        console.warn(
          '⚠️ [AnnotationService] Failed to fetch comment counts, returning annotations without counts:',
          commentError
        );
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
    const { data, error } = await supabase
      .from('annotations')
      .update(updates)
      .eq('id', annotationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteAnnotation(annotationId: string) {
    try {
      // First, delete all associated comments
      await CommentService.deleteAnnotationComments(annotationId);
    } catch (commentError) {
      console.warn(
        '⚠️ [AnnotationService] Failed to delete associated comments, proceeding with annotation deletion:',
        commentError
      );
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
          comment_count: (commentsMap[annotation.id] || []).length,
        }));
      } catch (commentError) {
        console.warn(
          '⚠️ [AnnotationService] Failed to fetch comments for frame annotations:',
          commentError
        );
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
    console.log(
      '🔍 [AnnotationService] Getting annotation with comments:',
      annotationId
    );

    try {
      // Get the annotation
      const { data: annotation, error } = await supabase
        .from('annotations')
        .select('*')
        .eq('id', annotationId)
        .single();

      if (error) {
        console.error(
          '❌ [AnnotationService] Error getting annotation:',
          error
        );
        throw error;
      }

      // Get comments for the annotation
      const comments = await CommentService.getAnnotationComments(annotationId);

      console.log(
        '✅ [AnnotationService] Retrieved annotation with comments:',
        {
          annotationId,
          commentCount: comments.length,
        }
      );

      return {
        ...annotation,
        comments,
        comment_count: comments.length,
      };
    } catch (error) {
      console.error(
        '❌ [AnnotationService] Error getting annotation with comments:',
        error
      );
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
    console.log(
      '🔍 [AnnotationService] Getting annotations with comment counts:',
      {
        videoId,
        projectId,
      }
    );

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

      console.log(
        '✅ [AnnotationService] Retrieved annotations with comment counts:',
        {
          annotationCount: annotationsWithCounts.length,
          totalComments: commentCounts.reduce((sum, count) => sum + count, 0),
        }
      );

      return annotationsWithCounts;
    } catch (error) {
      console.error(
        '❌ [AnnotationService] Error getting annotations with comment counts:',
        error
      );
      throw error;
    }
  }

  /**
   * Delete annotation and cascade to all associated comments
   */
  static async deleteAnnotationWithComments(annotationId: string) {
    console.log(
      '🔍 [AnnotationService] Deleting annotation with comments:',
      annotationId
    );

    try {
      // Delete all associated comments first
      await CommentService.deleteAnnotationComments(annotationId);

      // Then delete the annotation
      const { error } = await supabase
        .from('annotations')
        .delete()
        .eq('id', annotationId);

      if (error) {
        console.error(
          '❌ [AnnotationService] Error deleting annotation:',
          error
        );
        throw error;
      }

      console.log(
        '✅ [AnnotationService] Successfully deleted annotation with comments'
      );
    } catch (error) {
      console.error(
        '❌ [AnnotationService] Error deleting annotation with comments:',
        error
      );
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
    console.log('🔍 [AnnotationService] Checking comment permissions:', {
      annotationId,
      userId,
    });

    try {
      return await CommentService.canUserCommentOnAnnotation(
        annotationId,
        userId
      );
    } catch (error) {
      console.error(
        '❌ [AnnotationService] Error checking comment permissions:',
        error
      );
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
    console.log('🔍 [AnnotationService] Checking moderation permissions:', {
      annotationId,
      userId,
    });

    try {
      // Get annotation to check if user is the owner
      const { data: annotation, error } = await supabase
        .from('annotations')
        .select('user_id')
        .eq('id', annotationId)
        .single();

      if (error) {
        console.error(
          '❌ [AnnotationService] Error getting annotation for moderation check:',
          error
        );
        return false;
      }

      // User can moderate if they are the annotation owner
      const canModerate = userId && annotation.user_id === userId;

      console.log(
        '✅ [AnnotationService] Moderation check result:',
        canModerate
      );
      return canModerate;
    } catch (error) {
      console.error(
        '❌ [AnnotationService] Error checking moderation permissions:',
        error
      );
      return false;
    }
  }

  // Comparison video annotation methods

  /**
   * Get annotations for a comparison video (comparison-specific only)
   */
  static async getComparisonVideoAnnotations(comparisonVideoId: string) {
    console.log(
      '🔍 [AnnotationService] Getting comparison video annotations:',
      {
        comparisonVideoId,
      }
    );

    const { data, error } = await supabase
      .from('annotations')
      .select('*')
      .eq('comparison_video_id', comparisonVideoId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error(
        '❌ [AnnotationService] Error getting comparison annotations:',
        error
      );
      throw error;
    }

    console.log(
      '✅ [AnnotationService] Retrieved comparison annotations:',
      data?.length || 0
    );
    return data?.map(transformDatabaseAnnotationToApp) || [];
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
        this.getComparisonVideoAnnotations(comparisonVideoId),
        this.getVideoAnnotations(videoAId),
        this.getVideoAnnotations(videoBId),
      ]);

    return {
      comparison: comparisonAnnotations,
      videoA: videoAAnnotations.map((ann) => ({
        ...transformDatabaseAnnotationToApp(ann),
        video_context: 'video_a' as const,
      })),
      videoB: videoBAnnotations.map((ann) => ({
        ...transformDatabaseAnnotationToApp(ann),
        video_context: 'video_b' as const,
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
    console.log('🔍 [AnnotationService] Creating comparison annotation:', {
      comparisonVideoId,
      userId,
      videoContext,
      synchronizedFrame,
      projectId,
      annotationType: annotation.annotationType,
    });

    const annotationData = transformAppAnnotationToComparisonDatabase(
      annotation,
      comparisonVideoId, // Use comparison video ID as video_id for comparison annotations
      userId,
      comparisonVideoId,
      videoContext,
      synchronizedFrame,
      projectId
    );

    console.log(
      '🔍 [AnnotationService] Transformed annotation data for DB:',
      annotationData
    );

    const { data, error } = await supabase
      .from('annotations')
      .insert(annotationData)
      .select()
      .single();

    if (error) {
      console.error(
        '❌ [AnnotationService] Failed to create comparison annotation:',
        error
      );
      console.error('❌ [AnnotationService] Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      console.error(
        '❌ [AnnotationService] Failed annotation data:',
        annotationData
      );
      throw error;
    }

    console.log(
      '✅ [AnnotationService] Successfully created comparison annotation:',
      data
    );
    return transformDatabaseAnnotationToApp(data);
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
    // Note: video_context, comparison_video_id, and synchronized_frame are not supported in current database schema
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
    return transformDatabaseAnnotationToApp(data);
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
      console.warn(
        'Database function not available, falling back to individual queries'
      );

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
        .eq('video_id', comparisonVideoId);

      if (fetchError) {
        console.error(
          '❌ [AnnotationService] Error fetching comparison annotations:',
          fetchError
        );
        throw fetchError;
      }

      // Delete comments for all annotations
      if (annotations && annotations.length > 0) {
        await Promise.all(
          annotations.map((annotation) =>
            CommentService.deleteAnnotationComments(annotation.id).catch(
              (error) => {
                console.warn(
                  '⚠️ [AnnotationService] Failed to delete comments for annotation:',
                  annotation.id,
                  error
                );
              }
            )
          )
        );
      }

      // Then delete all annotations
      const { error } = await supabase
        .from('annotations')
        .delete()
        .eq('video_id', comparisonVideoId);

      if (error) throw error;
    } catch (error) {
      console.error(
        '❌ [AnnotationService] Error deleting comparison video annotations:',
        error
      );
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
      .eq('video_id', comparisonVideoId);

    if (error) throw error;
    return count || 0;
  }
}
