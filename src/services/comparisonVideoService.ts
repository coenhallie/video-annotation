/**
 * comparisonVideoService.ts
 * Service to encapsulate access to comparisonVideos table.
 */
import { supabase } from '../composables/useSupabase';

/** Shape persisted in DB */
export interface ComparisonVideoRecord {
  id: string;
  title?: string;
  description?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  userId?: string | null;
  videoAId: string;
  videoBId: string;
  /** Optionally hydrated relations */
  videoA?: any;
  videoB?: any;
}

export const ComparisonVideoService = {
  async getById(id: string): Promise<ComparisonVideoRecord | null> {
    const { data, error } = await supabase
      .from('comparison_videos')
      .select(
        'id, title, description, createdAt, updatedAt, userId, videoAId, videoBId, videoA:videoAId(*), videoB:videoBId(*)'
      )
      .eq('id', id)
      .single();

    if (error) {
      return Promise.reject(error);
    }
    return data as unknown as ComparisonVideoRecord;
  },

  /**
   * Create a comparison video with camelCase columns.
   */
  async createComparisonVideo(params: {
    title: string;
    description?: string | null;
    videoAId: string;
    videoBId: string;
    userId?: string | null;
  }): Promise<ComparisonVideoRecord> {
    const payload: Record<string, any> = {
      title: params.title,
      description: params.description ?? null,
      videoAId: params.videoAId,
      videoBId: params.videoBId,
    };
    if (params.userId) payload.userId = params.userId;

    const { data, error } = await supabase
      .from('comparison_videos')
      .insert(payload)
      .select(
        'id, title, description, createdAt, updatedAt, userId, videoAId, videoBId'
      )
      .single();

    if (error) throw error;
    return data as unknown as ComparisonVideoRecord;
  },

  /**
   * Return all comparison videos for a given user.
   */
  async getUserComparisonVideos(
    userId: string
  ): Promise<ComparisonVideoRecord[]> {
    const { data, error } = await supabase
      .from('comparison_videos')
      .select(
        'id, title, description, createdAt, updatedAt, userId, videoAId, videoBId, videoA:videoAId(*), videoB:videoBId(*)'
      )
      .eq('userId', userId)
      .order('createdAt', { ascending: false });

    if (error) {
      console.warn(
        '⚠️ [ComparisonVideoService] getUserComparisonVideos error:',
        error
      );
      return [];
    }
    return (data || []) as unknown as ComparisonVideoRecord[];
  },

  /**
   * Delete a comparison video record by id.
   */
  async deleteComparisonVideo(id: string): Promise<void> {
    const { error } = await supabase
      .from('comparison_videos')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
