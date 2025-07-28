import { supabase } from '../composables/useSupabase';
import type {
  DatabaseComparisonVideo,
  ComparisonVideoInsert,
  ComparisonVideoUpdate,
  ComparisonVideo,
  Video,
} from '../types/database';
import { VideoService } from './videoService';

export class ComparisonVideoService {
  /**
   * Create a new comparison video
   */
  static async createComparisonVideo(comparisonData: {
    title: string;
    description?: string;
    videoAId: string;
    videoBId: string;
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
        VideoService.getVideoById(comparisonData.videoAId),
      comparisonData.video_b ||
        VideoService.getVideoById(comparisonData.videoBId),
    ]);

    // Validate that both videos exist and have valid data
    if (!videoA) {
      throw new Error(`Video A with ID ${comparisonData.videoAId} not found`);
    }
    if (!videoB) {
      throw new Error(`Video B with ID ${comparisonData.videoBId} not found`);
    }

    // Validate video URLs/paths
    const isVideoAValid =
      (videoA.videoType === 'url' && videoA.url && videoA.url.trim() !== '') ||
      (videoA.videoType === 'upload' &&
        ((videoA.url && videoA.url.trim() !== '') ||
          (videoA.filePath && videoA.filePath.trim() !== '')));
    const isVideoBValid =
      (videoB.videoType === 'url' && videoB.url && videoB.url.trim() !== '') ||
      (videoB.videoType === 'upload' &&
        ((videoB.url && videoB.url.trim() !== '') ||
          (videoB.filePath && videoB.filePath.trim() !== '')));

    if (!isVideoAValid) {
      throw new Error(`Video A (${videoA.title}) has invalid URL or file path`);
    }
    if (!isVideoBValid) {
      throw new Error(`Video B (${videoB.title}) has invalid URL or file path`);
    }

    // Calculate comparison metadata
    const duration = Math.max(videoA.duration, videoB.duration);
    const fps = videoA.fps; // Use Video A's FPS as primary
    const totalFrames = Math.max(videoA.totalFrames, videoB.totalFrames);

    // Check for existing comparison (prevent duplicates)
    const existingComparison = await this.findExistingComparison(
      user.id,
      comparisonData.videoAId,
      comparisonData.videoBId
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
      userId: user.id,
      title: comparisonData.title,
      description: comparisonData.description,
      videoAId: comparisonData.videoAId,
      videoBId: comparisonData.videoBId,
      thumbnailLayout: 'side-by-side',
      isPublic: false,
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
          thumbnailUrl: thumbnailUrl,
        });
        data.thumbnailUrl = thumbnailUrl;
      }
    } catch (thumbnailError) {
      console.warn(
        '⚠️ [ComparisonVideoService] Failed to generate thumbnail:',
        thumbnailError
      );
    }

    return {
      ...data,
      videoA,
      videoB,
    } as ComparisonVideo;
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
      .eq('userId', userId)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    return (
      data?.map(
        (item) =>
          ({
            ...item,
            videoA: item.video_a,
            videoB: item.video_b,
          } as ComparisonVideo)
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

    return {
      ...data,
      videoA: data.video_a,
      videoB: data.video_b,
    } as ComparisonVideo;
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
        updatedAt: new Date().toISOString(),
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

    return {
      ...data,
      videoA: data.video_a,
      videoB: data.video_b,
    } as ComparisonVideo;
  }

  /**
   * Delete comparison video
   */
  static async deleteComparisonVideo(comparisonVideoId: string): Promise<void> {
    // First get the comparison video to check for thumbnails
    const { data: comparisonVideo } = await supabase
      .from('comparison_videos')
      .select('thumbnailUrl')
      .eq('id', comparisonVideoId)
      .single();

    // Delete the comparison video (annotations will be cascade deleted)
    const { error } = await supabase
      .from('comparison_videos')
      .delete()
      .eq('id', comparisonVideoId);

    if (error) throw error;

    // Clean up thumbnail if it exists
    if (comparisonVideo?.thumbnailUrl) {
      try {
        await this.deleteThumbnail(comparisonVideo.thumbnailUrl);
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
      .eq('userId', userId)
      .or(
        `and(videoAId.eq.${videoAId},videoBId.eq.${videoBId}),and(videoAId.eq.${videoBId},videoBId.eq.${videoAId})`
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
      .or(`videoAId.eq.${videoId},videoBId.eq.${videoId}`)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    return (
      data?.map(
        (item) =>
          ({
            ...item,
            videoA: item.video_a,
            videoB: item.video_b,
          } as ComparisonVideo)
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
          .eq('videoId', comparison.id);

        // Get individual video annotation counts
        const [{ count: videoACount }, { count: videoBCount }] =
          await Promise.all([
            supabase
              .from('annotations')
              .select('*', { count: 'exact', head: true })
              .eq('videoId', comparison.videoAId),
            supabase
              .from('annotations')
              .select('*', { count: 'exact', head: true })
              .eq('videoId', comparison.videoBId),
          ]);

        comparison.comparisonAnnotationCount = comparisonCount || 0;
        comparison.annotationCount = (videoACount || 0) + (videoBCount || 0);
      } catch (error) {
        console.warn(
          `Failed to load annotation counts for comparison ${comparison.id}:`,
          error
        );
        comparison.comparisonAnnotationCount = 0;
        comparison.annotationCount = 0;
      }
    }

    return comparisonVideos;
  }
}
