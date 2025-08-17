import { supabase } from '../composables/useSupabase';

export class AnnotationLabelService {
  /**
   * Associate labels with an annotation
   */
  static async addLabelsToAnnotation(annotationId: string, labelIds: string[]) {
    if (!labelIds || labelIds.length === 0) {
      return;
    }

    try {
      // Create annotation_labels entries
      const annotationLabels = labelIds.map((labelId) => ({
        annotationId,
        labelId,
      }));

      const { error } = await supabase
        .from('annotation_labels')
        .insert(annotationLabels);

      if (error) {
        console.error('Error adding labels to annotation:', error);
        throw error;
      }
    } catch (error) {
      console.error('Failed to associate labels with annotation:', error);
      throw error;
    }
  }

  /**
   * Remove all labels from an annotation
   */
  static async removeLabelsFromAnnotation(annotationId: string) {
    try {
      const { error } = await supabase
        .from('annotation_labels')
        .delete()
        .eq('annotationId', annotationId);

      if (error) {
        console.error('Error removing labels from annotation:', error);
        throw error;
      }
    } catch (error) {
      console.error('Failed to remove labels from annotation:', error);
      throw error;
    }
  }

  /**
   * Update labels for an annotation (replace existing)
   */
  static async updateAnnotationLabels(
    annotationId: string,
    labelIds: string[]
  ) {
    try {
      // First remove all existing labels
      await this.removeLabelsFromAnnotation(annotationId);

      // Then add new labels if any
      if (labelIds && labelIds.length > 0) {
        await this.addLabelsToAnnotation(annotationId, labelIds);
      }
    } catch (error) {
      console.error('Failed to update annotation labels:', error);
      throw error;
    }
  }

  /**
   * Get labels for an annotation
   */
  static async getAnnotationLabels(annotationId: string) {
    try {
      const { data, error } = await supabase
        .from('annotation_labels')
        .select('labelId, labels(*)')
        .eq('annotationId', annotationId);

      if (error) {
        console.error('Error fetching annotation labels:', error);
        throw error;
      }

      return data?.map((item) => item.labels) || [];
    } catch (error) {
      console.error('Failed to get annotation labels:', error);
      throw error;
    }
  }

  /**
   * Get labels for multiple annotations
   */
  static async getLabelsForAnnotations(annotationIds: string[]) {
    if (!annotationIds || annotationIds.length === 0) {
      return {};
    }

    try {
      const { data, error } = await supabase
        .from('annotation_labels')
        .select('annotationId, labelId, labels(*)')
        .in('annotationId', annotationIds);

      if (error) {
        console.error('Error fetching labels for annotations:', error);
        throw error;
      }

      // Group labels by annotation ID
      const labelsByAnnotation: Record<string, any[]> = {};

      data?.forEach((item) => {
        if (!labelsByAnnotation[item.annotationId]) {
          labelsByAnnotation[item.annotationId] = [];
        }
        if (item.labels) {
          labelsByAnnotation[item.annotationId].push(item.labels);
        }
      });

      return labelsByAnnotation;
    } catch (error) {
      console.error('Failed to get labels for annotations:', error);
      throw error;
    }
  }
}
