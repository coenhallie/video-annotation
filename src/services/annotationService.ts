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

  static async getVideoAnnotations(videoId: string) {
    const { data, error } = await supabase
      .from('annotations')
      .select('*')
      .eq('video_id', videoId)
      .order('timestamp', { ascending: true });

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

  static async getAnnotationsAtFrame(videoId: string, frame: number) {
    const { data, error } = await supabase.rpc('get_annotations_at_frame', {
      p_video_id: videoId,
      p_frame: frame,
    });

    if (error) throw error;
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
      .eq('comparison_video_id', comparisonVideoId)
      .eq('video_context', 'comparison')
      .order('frame', { ascending: true });

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
    synchronizedFrame?: number
  ) {
    const annotationData = transformAppAnnotationToComparisonDatabase(
      annotation,
      comparisonVideoId, // Use comparison video ID as video_id for comparison annotations
      userId,
      comparisonVideoId,
      videoContext,
      synchronizedFrame
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
    const updates: any = { video_context: videoContext };
    if (comparisonVideoId) updates.comparison_video_id = comparisonVideoId;
    if (synchronizedFrame !== undefined)
      updates.synchronized_frame = synchronizedFrame;

    const { data, error } = await supabase
      .from('annotations')
      .update(updates)
      .eq('id', annotationId)
      .select()
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
      .eq('comparison_video_id', comparisonVideoId);

    if (error) throw error;
  }

  /**
   * Get annotation count for comparison video
   */
  static async getComparisonVideoAnnotationCount(comparisonVideoId: string) {
    const { count, error } = await supabase
      .from('annotations')
      .select('*', { count: 'exact', head: true })
      .eq('comparison_video_id', comparisonVideoId)
      .eq('video_context', 'comparison');

    if (error) throw error;
    return count || 0;
  }
}
