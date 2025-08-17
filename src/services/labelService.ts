import { supabase } from '../composables/useSupabase';
import type {
  Label,
  LabelInsert,
  LabelUpdate,
  AnnotationLabelInsert,
  LabelStats,
  BulkLabelOperation,
} from '../types/labels';
import { DEFAULT_LABELS } from '../types/labels';

export class LabelService {
  /**
   * Initialize default system labels if they don't exist
   */
  static async initializeDefaultLabels(): Promise<void> {
    try {
      // Check if default labels already exist
      const { data: existingLabels, error: checkError } = await supabase
        .from('labels')
        .select('name')
        .eq('isDefault', true);

      if (checkError) {
        throw checkError;
      }

      // If no default labels exist, create them
      if (!existingLabels || existingLabels.length === 0) {
        const { error: insertError } = await supabase
          .from('labels')
          .insert(DEFAULT_LABELS);

        if (insertError) {
          throw insertError;
        }
      }
    } catch (error) {
      console.error('Failed to initialize default labels:', error);
      throw error;
    }
  }

  /**
   * Create a new custom label
   */
  static async createLabel(labelData: LabelInsert): Promise<Label> {
    const { data, error } = await supabase
      .from('labels')
      .insert({
        ...labelData,
        isDefault: false, // Custom labels are never default
        isActive: true, // New labels are active by default
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Get all labels for a user/project
   */
  static async getLabels(
    userId?: string,
    projectId?: string,
    includeDefault: boolean = true
  ): Promise<Label[]> {
    let query = supabase.from('labels').select('*').eq('isActive', true);

    if (includeDefault) {
      // Include default labels and user's custom labels
      if (userId) {
        query = query.or(`isDefault.eq.true,userId.eq.${userId}`);
      } else {
        query = query.eq('isDefault', true);
      }
    } else {
      // Only user's custom labels
      if (userId) {
        query = query.eq('userId', userId);
      }
    }

    // Filter by project if specified
    if (projectId) {
      query = query.or(`projectId.is.null,projectId.eq.${projectId}`);
    } else {
      query = query.is('projectId', null);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Update a label
   */
  static async updateLabel(
    labelId: string,
    updates: LabelUpdate
  ): Promise<Label> {
    const { data, error } = await supabase
      .from('labels')
      .update(updates)
      .eq('id', labelId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Delete a label (soft delete by setting isActive to false)
   */
  static async deleteLabel(labelId: string): Promise<void> {
    // First check if label is in use
    const { data: usageData, error: usageError } = await supabase
      .from('annotation_labels')
      .select('id')
      .eq('labelId', labelId)
      .limit(1);

    if (usageError) {
      throw usageError;
    }

    if (usageData && usageData.length > 0) {
      // Soft delete if in use
      const { error } = await supabase
        .from('labels')
        .update({ isActive: false })
        .eq('id', labelId);

      if (error) {
        throw error;
      }
    } else {
      // Hard delete if not in use
      const { error } = await supabase
        .from('labels')
        .delete()
        .eq('id', labelId);

      if (error) {
        throw error;
      }
    }
  }

  /**
   * Get labels for a specific annotation
   */
  static async getAnnotationLabels(annotationId: string): Promise<Label[]> {
    const { data, error } = await supabase
      .from('annotation_labels')
      .select(
        `
        labels (
          id,
          name,
          description,
          color,
          isDefault,
          isActive,
          userId,
          projectId,
          createdAt,
          updatedAt
        )
      `
      )
      .eq('annotationId', annotationId);

    if (error) {
      throw error;
    }

    return data?.map((item: any) => item.labels).filter(Boolean) || [];
  }

  /**
   * Assign labels to an annotation
   */
  static async assignLabelsToAnnotation(
    annotationId: string,
    labelIds: string[]
  ): Promise<void> {
    // First remove existing labels
    await this.removeLabelsFromAnnotation(annotationId);

    // Then add new labels
    if (labelIds.length > 0) {
      const insertData: AnnotationLabelInsert[] = labelIds.map((labelId) => ({
        annotationId,
        labelId,
      }));

      const { error } = await supabase
        .from('annotation_labels')
        .insert(insertData);

      if (error) {
        throw error;
      }
    }
  }

  /**
   * Add labels to an annotation (without removing existing ones)
   */
  static async addLabelsToAnnotation(
    annotationId: string,
    labelIds: string[]
  ): Promise<void> {
    if (labelIds.length === 0) return;

    // Get existing labels to avoid duplicates
    const { data: existing, error: existingError } = await supabase
      .from('annotation_labels')
      .select('labelId')
      .eq('annotationId', annotationId);

    if (existingError) {
      throw existingError;
    }

    const existingLabelIds = existing?.map((item) => item.labelId) || [];
    const newLabelIds = labelIds.filter((id) => !existingLabelIds.includes(id));

    if (newLabelIds.length > 0) {
      const insertData: AnnotationLabelInsert[] = newLabelIds.map(
        (labelId) => ({
          annotationId,
          labelId,
        })
      );

      const { error } = await supabase
        .from('annotation_labels')
        .insert(insertData);

      if (error) {
        throw error;
      }
    }
  }

  /**
   * Remove labels from an annotation
   */
  static async removeLabelsFromAnnotation(
    annotationId: string,
    labelIds?: string[]
  ): Promise<void> {
    let query = supabase
      .from('annotation_labels')
      .delete()
      .eq('annotationId', annotationId);

    if (labelIds && labelIds.length > 0) {
      query = query.in('labelId', labelIds);
    }

    const { error } = await query;

    if (error) {
      throw error;
    }
  }

  /**
   * Bulk label operations
   */
  static async bulkLabelOperation(
    operation: BulkLabelOperation
  ): Promise<void> {
    const { annotationIds, labelIds, operation: op } = operation;

    if (annotationIds.length === 0 || labelIds.length === 0) {
      return;
    }

    switch (op) {
      case 'add':
        // Add labels to all annotations
        for (const annotationId of annotationIds) {
          await this.addLabelsToAnnotation(annotationId, labelIds);
        }
        break;

      case 'remove':
        // Remove labels from all annotations
        for (const annotationId of annotationIds) {
          await this.removeLabelsFromAnnotation(annotationId, labelIds);
        }
        break;

      case 'replace':
        // Replace all labels on annotations
        for (const annotationId of annotationIds) {
          await this.assignLabelsToAnnotation(annotationId, labelIds);
        }
        break;
    }
  }

  /**
   * Get label usage statistics
   */
  static async getLabelStats(
    userId?: string,
    projectId?: string
  ): Promise<LabelStats[]> {
    // This would require a more complex query or database function
    // For now, we'll implement a basic version
    const labels = await this.getLabels(userId, projectId);
    const stats: LabelStats[] = [];

    for (const label of labels) {
      const { count, error } = await supabase
        .from('annotation_labels')
        .select('*', { count: 'exact', head: true })
        .eq('labelId', label.id);

      if (error) {
        console.error(`Error getting stats for label ${label.id}:`, error);
        continue;
      }

      // Get last used date
      const { data: lastUsedData, error: lastUsedError } = await supabase
        .from('annotation_labels')
        .select('createdAt')
        .eq('labelId', label.id)
        .order('createdAt', { ascending: false })
        .limit(1);

      stats.push({
        labelId: label.id,
        label,
        usageCount: count || 0,
        annotationCount: count || 0,
        lastUsed: lastUsedData?.[0]?.createdAt,
      });
    }

    return stats.sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Search labels by name
   */
  static async searchLabels(
    query: string,
    userId?: string,
    projectId?: string
  ): Promise<Label[]> {
    let dbQuery = supabase
      .from('labels')
      .select('*')
      .eq('isActive', true)
      .ilike('name', `%${query}%`);

    if (userId) {
      dbQuery = dbQuery.or(`isDefault.eq.true,userId.eq.${userId}`);
    } else {
      dbQuery = dbQuery.eq('isDefault', true);
    }

    if (projectId) {
      dbQuery = dbQuery.or(`projectId.is.null,projectId.eq.${projectId}`);
    } else {
      dbQuery = dbQuery.is('projectId', null);
    }

    const { data, error } = await dbQuery
      .order('name', { ascending: true })
      .limit(20);

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get annotations by label filter
   */
  static async getAnnotationsByLabels(
    labelIds: string[],
    logic: 'OR' | 'AND' = 'OR',
    videoId?: string,
    projectId?: string
  ): Promise<string[]> {
    if (labelIds.length === 0) {
      return [];
    }

    if (logic === 'OR') {
      // Get annotations that have ANY of the specified labels
      const { data, error } = await supabase
        .from('annotation_labels')
        .select('annotationId')
        .in('labelId', labelIds);

      if (error) {
        throw error;
      }

      return [...new Set(data?.map((item) => item.annotationId) || [])];
    } else {
      // Get annotations that have ALL of the specified labels
      const annotationCounts: Record<string, number> = {};

      const { data, error } = await supabase
        .from('annotation_labels')
        .select('annotationId')
        .in('labelId', labelIds);

      if (error) {
        throw error;
      }

      // Count how many of the required labels each annotation has
      data?.forEach((item) => {
        annotationCounts[item.annotationId] =
          (annotationCounts[item.annotationId] || 0) + 1;
      });

      // Return only annotations that have all required labels
      return Object.keys(annotationCounts).filter(
        (annotationId) => annotationCounts[annotationId] === labelIds.length
      );
    }
  }
}
