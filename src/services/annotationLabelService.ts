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
   * Make an annotation's labels exactly `labelIds`.
   *
   * Two requests cannot be one transaction, so the order is chosen for what a
   * failure in between leaves behind: missing labels are ADDED first, and only
   * then are unwanted ones removed. A failed add changes nothing; a failed
   * remove leaves an extra label, which the next save corrects. The old order
   * (delete everything, then insert) left the annotation with no labels at all
   * whenever the insert failed.
   *
   * Only the difference is written, so saving an unchanged set writes nothing.
   */
  static async updateAnnotationLabels(
    annotationId: string,
    labelIds: string[]
  ) {
    try {
      const { data: current, error: readError } = await supabase
        .from('annotation_labels')
        .select('labelId')
        .eq('annotationId', annotationId);
      if (readError) throw readError;

      const wanted = new Set(labelIds ?? []);
      const existing = new Set((current ?? []).map((row) => row.labelId as string));
      const toAdd = [...wanted].filter((id) => !existing.has(id));
      const toRemove = [...existing].filter((id) => !wanted.has(id));

      if (toAdd.length > 0) {
        await this.addLabelsToAnnotation(annotationId, toAdd);
      }

      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('annotation_labels')
          .delete()
          .eq('annotationId', annotationId)
          .in('labelId', toRemove);
        if (removeError) throw removeError;
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
        const group = (labelsByAnnotation[item.annotationId] ??= []);
        if (item.labels) {
          group.push(item.labels);
        }
      });

      return labelsByAnnotation;
    } catch (error) {
      console.error('Failed to get labels for annotations:', error);
      throw error;
    }
  }
}
