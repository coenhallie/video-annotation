import { supabase } from '../composables/useSupabase';
import type {
  VideoInsert,
  VideoUpdate,
  Video,
  ComparisonVideo,
  VideoEntity,
} from '../types/database';
import { isComparisonVideo, isIndividualVideo } from '../types/database';
import { VideoUploadService } from './videoUploadService';

export class VideoService {
  static async createVideo(videoData: VideoInsert) {
    // Validate video data before proceeding
    if (
      videoData.videoType === 'url' &&
      (!videoData.url || videoData.url.trim() === '')
    ) {
      const error = new Error('URL is required for URL-type videos');

      throw error;
    }

    if (
      videoData.videoType === 'upload' &&
      (!videoData.url || videoData.url.trim() === '') &&
      (!videoData.filePath || videoData.filePath.trim() === '')
    ) {
      const error = new Error(
        'Either URL or filePath is required for upload-type videos'
      );

      throw error;
    }

    // For uploaded videos without URL, generate URL from filePath
    if (
      videoData.videoType === 'upload' &&
      (!videoData.url || videoData.url.trim() === '') &&
      videoData.filePath &&
      videoData.filePath.trim() !== ''
    ) {
      try {
        const { data: urlData } = supabase.storage
          .from('videos')
          .getPublicUrl(videoData.filePath);

        if (urlData?.publicUrl) {
          videoData.url = urlData.publicUrl;
        }
      } catch (urlError) {
        // Continue without URL - the video player will handle filePath directly
      }
    }

    // For uploaded videos, always create new records (no deduplication)
    if (videoData.videoType === 'upload') {
      const { data, error } = await supabase
        .from('videos')
        .insert(videoData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    }

    // For URL videos, check for existing videos by URL and owner

    const { data: existingVideo, error: queryError } = await supabase
      .from('videos')
      .select('*')
      .eq('url', videoData.url)
      .eq('ownerId', videoData.ownerId)
      .eq('videoType', 'url')
      .maybeSingle();

    if (queryError) {
    }

    if (existingVideo) {
      // Update existing video with new data
      const { data, error } = await supabase
        .from('videos')
        .update({
          title: videoData.title,
          fps: videoData.fps,
          duration: videoData.duration,
          totalFrames: videoData.totalFrames,
        })
        .eq('id', existingVideo.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    }

    // Create new video if none exists
    const { data, error } = await supabase
      .from('videos')
      .insert(videoData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async getUserVideos(userId: string) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('ownerId', userId)
      .order('createdAt', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async getMostRecentUserVideo(userId: string) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('ownerId', userId)
      .order('createdAt', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
    return data;
  }

  static async getVideoById(videoId: string) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (error) throw error;
    return data;
  }

  static async updateVideo(videoId: string, updates: VideoUpdate) {
    const { data, error } = await supabase
      .from('videos')
      .update(updates)
      .eq('id', videoId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteVideo(videoId: string) {
    // First get the video to check if it's an uploaded video
    const { data: video, error: fetchError } = await supabase
      .from('videos')
      .select('videoType, filePath')
      .eq('id', videoId)
      .single();

    if (fetchError) throw fetchError;

    // If it's an uploaded video, use the upload service to delete it
    if (video && video.videoType === 'upload' && video.filePath) {
      await VideoUploadService.deleteUploadedVideo(videoId, video.filePath);
    } else {
      // For URL videos, just delete the database record
      const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);
      if (error) throw error;
    }
  }

  // Enhanced methods for unified video entity management

  /**
   * Get all video entities (individual videos + comparison videos) for a user
   * Returns a unified list sorted by creation date
   */
  static async getUserVideoEntities(userId: string): Promise<VideoEntity[]> {
    try {
      // Load individual videos first
      const individualVideos = await this.getUserVideos(userId);

      // Load comparison videos using direct Supabase query to avoid circular dependency
      const { data: comparisonData, error: comparisonError } = await supabase
        .from('comparison_videos')
        .select(
          `
          *,
          videoA:videos!comparison_videos_videoAId_fkey(*),
          videoB:videos!comparison_videos_videoBId_fkey(*)
        `
        )
        .eq('userId', userId)
        .order('createdAt', { ascending: false });

      if (comparisonError) {
        // Don't throw, just continue with individual videos only
      }

      // Transform comparison videos to app format
      const comparisonVideos =
        comparisonData?.map((item) => ({
          ...item,
          videoA: item.videoA,
          videoB: item.videoB,
        })) || [];

      // Deduplicate individual videos (in case of duplicates)
      const uniqueIndividualVideos =
        individualVideos?.filter(
          (video, index, arr) =>
            arr.findIndex((v) => v.id === video.id) === index
        ) || [];

      // Merge and sort by creation date (newest first)
      const allEntities: VideoEntity[] = [
        ...uniqueIndividualVideos,
        ...comparisonVideos,
      ].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return allEntities;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get video entity by ID (works for both individual videos and comparison videos)
   */
  static async getVideoEntityById(
    entityId: string
  ): Promise<VideoEntity | null> {
    try {
      // First try to get as individual video
      try {
        const video = await this.getVideoById(entityId);
        return video;
      } catch (individualError) {
        // If not found as individual video, try as comparison video
        const { ComparisonVideoService } = await import(
          './comparisonVideoService'
        );
        try {
          const comparisonVideo =
            await ComparisonVideoService.getComparisonVideoById(entityId);
          return comparisonVideo;
        } catch (comparisonError) {
          return null;
        }
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete video entity (works for both individual videos and comparison videos)
   */
  static async deleteVideoEntity(entity: VideoEntity): Promise<void> {
    try {
      if (isComparisonVideo(entity)) {
        const { ComparisonVideoService } = await import(
          './comparisonVideoService'
        );
        await ComparisonVideoService.deleteComparisonVideo(entity.id);
      } else {
        await this.deleteVideo(entity.id);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Load video entity with annotations (handles both individual and comparison videos)
   */
  static async loadVideoEntityWithAnnotations(entity: VideoEntity) {
    try {
      const { AnnotationService } = await import('./annotationService');

      if (isComparisonVideo(entity)) {
        // Load comparison video with all related annotations
        const [annotationsA, annotationsB, comparisonAnnotations] =
          await Promise.all([
            AnnotationService.getVideoAnnotations(entity.videoAId),
            AnnotationService.getVideoAnnotations(entity.videoBId),
            AnnotationService.getComparisonVideoAnnotations(entity.id),
          ]);

        return {
          type: 'comparison' as const,
          comparisonVideo: entity,
          videoA: entity.videoA,
          videoB: entity.videoB,
          annotationsA: annotationsA || [],
          annotationsB: annotationsB || [],
          comparisonAnnotations: comparisonAnnotations || [],
        };
      } else {
        // Load individual video with annotations
        const annotations = await AnnotationService.getVideoAnnotations(
          entity.id
        );

        return {
          type: 'individual' as const,
          video: entity,
          annotations: annotations || [],
          videoMetadata: {
            existingVideo: entity,
            videoType: entity.videoType,
            title: entity.title,
            fps: entity.fps,
            duration: entity.duration,
            totalFrames: entity.totalFrames,
          },
        };
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the most recent video entity (individual or comparison) for a user
   */
  static async getMostRecentVideoEntity(
    userId: string
  ): Promise<VideoEntity | null> {
    try {
      const entities = await this.getUserVideoEntities(userId);
      return entities.length > 0 ? entities[0] : null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Type guard helper methods (re-exported for convenience)
   */
  static isComparisonVideo = isComparisonVideo;
  static isIndividualVideo = isIndividualVideo;
}
