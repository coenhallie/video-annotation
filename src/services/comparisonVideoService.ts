import { supabase } from '../composables/useSupabase';
import type {
  DatabaseComparisonVideo,
  ComparisonVideoInsert,
  ComparisonVideoUpdate,
  ComparisonVideo,
  Video,
} from '../types/database';
import {
  transformDatabaseComparisonVideoToApp,
  transformAppComparisonVideoToDatabase,
} from '../types/database';
import { VideoService } from './videoService';

export class ComparisonVideoService {
  /**
   * Create a new comparison video
   */
  static async createComparisonVideo(comparisonData: {
    title: string;
    description?: string;
    video_a_id: string;
    video_b_id: string;
    video_a?: Video;
    video_b?: Video;
    owner_id?: string;
  }): Promise<ComparisonVideo> {
    console.log(
      '🔍 [ComparisonVideoService] Creating comparison video:',
      comparisonData
    );

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Fetch video details if not provided
    const [videoA, videoB] = await Promise.all([
      comparisonData.video_a ||
        VideoService.getVideoById(comparisonData.video_a_id),
      comparisonData.video_b ||
        VideoService.getVideoById(comparisonData.video_b_id),
    ]);

    // Validate that both videos exist and have valid data
    if (!videoA) {
      throw new Error(`Video A with ID ${comparisonData.video_a_id} not found`);
    }
    if (!videoB) {
      throw new Error(`Video B with ID ${comparisonData.video_b_id} not found`);
    }

    // Validate video URLs/paths
    const isVideoAValid =
      (videoA.video_type === 'url' && videoA.url && videoA.url.trim() !== '') ||
      (videoA.video_type === 'upload' &&
        ((videoA.url && videoA.url.trim() !== '') ||
          (videoA.file_path && videoA.file_path.trim() !== '')));
    const isVideoBValid =
      (videoB.video_type === 'url' && videoB.url && videoB.url.trim() !== '') ||
      (videoB.video_type === 'upload' &&
        ((videoB.url && videoB.url.trim() !== '') ||
          (videoB.file_path && videoB.file_path.trim() !== '')));

    if (!isVideoAValid) {
      throw new Error(`Video A (${videoA.title}) has invalid URL or file path`);
    }
    if (!isVideoBValid) {
      throw new Error(`Video B (${videoB.title}) has invalid URL or file path`);
    }

    // Calculate comparison metadata
    const duration = Math.max(videoA.duration, videoB.duration);
    const fps = videoA.fps; // Use Video A's FPS as primary
    const totalFrames = Math.max(videoA.total_frames, videoB.total_frames);

    // Check for existing comparison (prevent duplicates)
    const existingComparison = await this.findExistingComparison(
      user.id,
      comparisonData.video_a_id,
      comparisonData.video_b_id
    );

    if (existingComparison) {
      console.log(
        '🔍 [ComparisonVideoService] Found existing comparison, updating:',
        existingComparison.id
      );
      return this.updateComparisonVideo(existingComparison.id, {
        title: comparisonData.title,
        description: comparisonData.description,
      });
    }

    // Create new comparison video
    const insertData: ComparisonVideoInsert = {
      user_id: user.id,
      title: comparisonData.title,
      description: comparisonData.description,
      video_a_id: comparisonData.video_a_id,
      video_b_id: comparisonData.video_b_id,
      thumbnail_layout: 'side-by-side',
    };

    const { data, error } = await supabase
      .from('comparison_videos')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(
        '❌ [ComparisonVideoService] Failed to create comparison video:',
        error
      );
      throw error;
    }

    console.log(
      '✅ [ComparisonVideoService] Successfully created comparison video:',
      data
    );

    // Generate composite thumbnail
    try {
      const thumbnailUrl = await this.generateCompositeThumbnail(
        data.id,
        videoA,
        videoB
      );
      if (thumbnailUrl) {
        await this.updateComparisonVideo(data.id, {
          thumbnail_url: thumbnailUrl,
        });
        data.thumbnail_url = thumbnailUrl;
      }
    } catch (thumbnailError) {
      console.warn(
        '⚠️ [ComparisonVideoService] Failed to generate thumbnail:',
        thumbnailError
      );
    }

    return transformDatabaseComparisonVideoToApp(data, videoA, videoB);
  }

  /**
   * Get all comparison videos for a user
   */
  static async getUserComparisonVideos(
    userId: string
  ): Promise<ComparisonVideo[]> {
    const { data, error } = await supabase
      .from('comparison_videos')
      .select(
        `
        *,
        video_a:videos!fk_comparison_videos_video_a(*),
        video_b:videos!fk_comparison_videos_video_b(*)
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (
      data?.map((item) =>
        transformDatabaseComparisonVideoToApp(item, item.video_a, item.video_b)
      ) || []
    );
  }

  /**
   * Get comparison video by ID with related videos
   */
  static async getComparisonVideoById(
    comparisonVideoId: string
  ): Promise<ComparisonVideo> {
    const { data, error } = await supabase
      .from('comparison_videos')
      .select(
        `
        *,
        video_a:videos!fk_comparison_videos_video_a(*),
        video_b:videos!fk_comparison_videos_video_b(*)
      `
      )
      .eq('id', comparisonVideoId)
      .single();

    if (error) throw error;

    return transformDatabaseComparisonVideoToApp(
      data,
      data.video_a,
      data.video_b
    );
  }

  /**
   * Update comparison video
   */
  static async updateComparisonVideo(
    comparisonVideoId: string,
    updates: ComparisonVideoUpdate
  ): Promise<ComparisonVideo> {
    const { data, error } = await supabase
      .from('comparison_videos')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', comparisonVideoId)
      .select(
        `
        *,
        video_a:videos!fk_comparison_videos_video_a(*),
        video_b:videos!fk_comparison_videos_video_b(*)
      `
      )
      .single();

    if (error) throw error;

    return transformDatabaseComparisonVideoToApp(
      data,
      data.video_a,
      data.video_b
    );
  }

  /**
   * Delete comparison video
   */
  static async deleteComparisonVideo(comparisonVideoId: string): Promise<void> {
    // First get the comparison video to check for thumbnails
    const { data: comparisonVideo } = await supabase
      .from('comparison_videos')
      .select('thumbnail_url')
      .eq('id', comparisonVideoId)
      .single();

    // Delete the comparison video (annotations will be cascade deleted)
    const { error } = await supabase
      .from('comparison_videos')
      .delete()
      .eq('id', comparisonVideoId);

    if (error) throw error;

    // Clean up thumbnail if it exists
    if (comparisonVideo?.thumbnail_url) {
      try {
        await this.deleteThumbnail(comparisonVideo.thumbnail_url);
      } catch (thumbnailError) {
        console.warn(
          '⚠️ [ComparisonVideoService] Failed to delete thumbnail:',
          thumbnailError
        );
      }
    }
  }

  /**
   * Find existing comparison between two videos
   */
  static async findExistingComparison(
    userId: string,
    videoAId: string,
    videoBId: string
  ): Promise<DatabaseComparisonVideo | null> {
    // Check both directions (A,B) and (B,A)
    const { data } = await supabase
      .from('comparison_videos')
      .select('*')
      .eq('user_id', userId)
      .or(
        `and(video_a_id.eq.${videoAId},video_b_id.eq.${videoBId}),and(video_a_id.eq.${videoBId},video_b_id.eq.${videoAId})`
      )
      .single();

    return data;
  }

  /**
   * Generate composite thumbnail for comparison video
   */
  static async generateCompositeThumbnail(
    comparisonVideoId: string,
    videoA: Video,
    videoB: Video
  ): Promise<string | null> {
    try {
      const { ThumbnailService } = await import('./thumbnailService');
      return await ThumbnailService.generateCompositeThumbnail(
        comparisonVideoId,
        videoA,
        videoB,
        {
          width: 320,
          height: 180,
          layout: 'side_by_side',
          quality: 0.8,
        }
      );
    } catch (error) {
      console.error(
        '❌ [ComparisonVideoService] Thumbnail generation failed:',
        error
      );
      return null;
    }
  }

  /**
   * Delete thumbnail from storage
   */
  static async deleteThumbnail(thumbnailUrl: string): Promise<void> {
    try {
      const { ThumbnailService } = await import('./thumbnailService');
      return await ThumbnailService.deleteThumbnail(thumbnailUrl);
    } catch (error) {
      console.warn('Failed to delete thumbnail:', error);
    }
  }

  /**
   * Get comparison videos that include a specific video
   */
  static async getComparisonsForVideo(
    videoId: string
  ): Promise<ComparisonVideo[]> {
    const { data, error } = await supabase
      .from('comparison_videos')
      .select(
        `
        *,
        video_a:videos!fk_comparison_videos_video_a(*),
        video_b:videos!fk_comparison_videos_video_b(*)
      `
      )
      .or(`video_a_id.eq.${videoId},video_b_id.eq.${videoId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (
      data?.map((item) =>
        transformDatabaseComparisonVideoToApp(item, item.video_a, item.video_b)
      ) || []
    );
  }

  /**
   * Get user's comparison videos with annotation counts
   */
  static async getUserComparisonVideosWithCounts(
    userId: string
  ): Promise<ComparisonVideo[]> {
    const comparisonVideos = await this.getUserComparisonVideos(userId);

    // Load annotation counts for each comparison video
    for (const comparison of comparisonVideos) {
      try {
        // Get comparison-specific annotation count
        const { count: comparisonCount } = await supabase
          .from('annotations')
          .select('*', { count: 'exact', head: true })
          .eq('video_id', comparison.id);

        // Get individual video annotation counts
        const [{ count: videoACount }, { count: videoBCount }] =
          await Promise.all([
            supabase
              .from('annotations')
              .select('*', { count: 'exact', head: true })
              .eq('video_id', comparison.video_a_id),
            supabase
              .from('annotations')
              .select('*', { count: 'exact', head: true })
              .eq('video_id', comparison.video_b_id),
          ]);

        comparison.comparison_annotation_count = comparisonCount || 0;
        comparison.annotation_count = (videoACount || 0) + (videoBCount || 0);
      } catch (error) {
        console.warn(
          `Failed to load annotation counts for comparison ${comparison.id}:`,
          error
        );
        comparison.comparison_annotation_count = 0;
        comparison.annotation_count = 0;
      }
    }

    return comparisonVideos;
  }
}
