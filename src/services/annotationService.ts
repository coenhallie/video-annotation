import { supabase } from '../composables/useSupabase';
import type { AnnotationInsert, AnnotationUpdate } from '../types/database';

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
}
