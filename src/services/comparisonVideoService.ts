/**
 * comparisonVideoService.ts
 * Service to encapsulate access to comparisonVideos table.
 */
import { supabase } from '../composables/useSupabase';
import { ThumbnailGenerator } from '../utils/thumbnailGenerator';
import type { Video } from '../types/database';

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
  isPublic?: boolean;
  thumbnailUrl?: string;
  /** Optionally hydrated relations */
  videoA?: Video;
  videoB?: Video;
}

export const ComparisonVideoService = {
  async getById(id: string): Promise<ComparisonVideoRecord | null> {
    const { data, error } = await supabase
      .from('comparison_videos')
      .select(
        'id, title, description, createdAt, updatedAt, userId, videoAId, videoBId, isPublic, thumbnailUrl, videoA:videoAId(*), videoB:videoBId(*)'
      )
      .eq('id', id)
      .single();

    if (error) {
      return Promise.reject(error);
    }
    return data as unknown as ComparisonVideoRecord;
  },

  /**
   * Check if a comparison already exists between two videos
   */
  async findExistingComparison(
    videoAId: string,
    videoBId: string,
    userId?: string
  ): Promise<ComparisonVideoRecord | null> {
    // Check both combinations since A vs B is the same as B vs A
    let query = supabase
      .from('comparison_videos')
      .select(
        'id, title, description, createdAt, updatedAt, userId, videoAId, videoBId, isPublic, thumbnailUrl, videoA:videoAId(*), videoB:videoBId(*)'
      );

    // Add user filter if provided
    if (userId) {
      query = query.eq('userId', userId);
    }

    // Check for both video combinations
    const { data, error } = await query.or(
      `and(videoAId.eq.${videoAId},videoBId.eq.${videoBId}),and(videoAId.eq.${videoBId},videoBId.eq.${videoAId})`
    );

    if (error) {
      console.warn('Error checking for existing comparison:', error);
      return null;
    }

    // Return the first match if any
    return data && data.length > 0
      ? (data[0] as unknown as ComparisonVideoRecord)
      : null;
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
    videoA?: Video;
    videoB?: Video;
  }): Promise<ComparisonVideoRecord> {
    // Generate composite thumbnail if we have both videos
    let thumbnailUrl: string | undefined;
    if (params.videoA && params.videoB) {
      try {
        console.log(
          '🖼️ Generating composite thumbnail for comparison video:',
          params.title
        );
        const thumbnail = await ThumbnailGenerator.generateCompositeThumbnail(
          params.videoA.url,
          params.videoB.url,
          320,
          2
        );
        if (thumbnail) {
          thumbnailUrl = thumbnail;
          console.log('✅ Composite thumbnail generated successfully');
        }
      } catch (error) {
        console.warn('⚠️ Failed to generate composite thumbnail:', error);
      }
    }

    const payload: Record<string, any> = {
      title: params.title,
      description: params.description ?? null,
      videoAId: params.videoAId,
      videoBId: params.videoBId,
      ...(thumbnailUrl && { thumbnailUrl }),
    };
    if (params.userId) payload.userId = params.userId;

    const { data, error } = await supabase
      .from('comparison_videos')
      .insert(payload)
      .select(
        'id, title, description, createdAt, updatedAt, userId, videoAId, videoBId, isPublic, thumbnailUrl, videoA:videoAId(*), videoB:videoBId(*)'
      )
      .single();

    if (error) {
      // Check if it's a duplicate key error
      if (
        error.code === '23505' &&
        error.message?.includes('comparison_videos_unique_pair')
      ) {
        // Try to find the existing comparison
        const existing = await this.findExistingComparison(
          params.videoAId,
          params.videoBId,
          params.userId || undefined
        );

        // Create a custom error with the existing comparison info
        const customError: any = new Error(
          'A comparison between these videos already exists'
        );
        customError.code = 'DUPLICATE_COMPARISON';
        customError.existingComparison = existing;
        throw customError;
      }
      throw error;
    }
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
        'id, title, description, createdAt, updatedAt, userId, videoAId, videoBId, isPublic, thumbnailUrl, videoA:videoAId(*), videoB:videoBId(*)'
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
