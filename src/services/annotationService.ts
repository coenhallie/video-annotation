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

  static async getVideoAnnotations(videoId: string, projectId?: string) {
    let query = supabase
      .from('annotations')
      .select('*')
      .eq('video_id', videoId);

    // Filter by project_id if provided
    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.order('timestamp', { ascending: true });

    if (error) throw error;
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
    const { error } = await supabase
      .from('annotations')
      .delete()
      .eq('id', annotationId);

    if (error) throw error;
  }

  static async getAnnotationsAtFrame(
    videoId: string,
    frame: number,
    projectId?: string
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
    return data;
  }

  // Comparison video annotation methods

  /**
   * Get annotations for a comparison video (comparison-specific only)
   */
  static async getComparisonVideoAnnotations(comparisonVideoId: string) {
    const { data, error } = await supabase
      .from('annotations')
      .select('*')
      .eq('video_id', comparisonVideoId)
      .order('timestamp', { ascending: true });

    if (error) throw error;
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
    const annotationData = transformAppAnnotationToComparisonDatabase(
      annotation,
      comparisonVideoId, // Use comparison video ID as video_id for comparison annotations
      userId,
      comparisonVideoId,
      videoContext,
      synchronizedFrame,
      projectId
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
    const { error } = await supabase
      .from('annotations')
      .delete()
      .eq('video_id', comparisonVideoId);

    if (error) throw error;
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
