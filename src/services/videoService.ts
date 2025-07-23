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
    console.log(
      '🔍 [VideoService] Creating/updating video with data:',
      videoData
    );

    console.log('🐛 [DEBUG] VideoService.createVideo called with:', {
      url: videoData.url,
      video_id: videoData.video_id,
      video_type: videoData.video_type,
      owner_id: videoData.owner_id,
      title: videoData.title,
    });

    // For uploaded videos, always create new records (no deduplication)
    if (videoData.video_type === 'upload') {
      console.log('🔍 [VideoService] Creating new uploaded video record');
      const { data, error } = await supabase
        .from('videos')
        .insert(videoData)
        .select()
        .single();

      if (error) {
        console.error(
          '❌ [VideoService] Failed to create uploaded video:',
          error
        );
        throw error;
      }
      console.log(
        '✅ [VideoService] Successfully created uploaded video:',
        data
      );
      return data;
    }

    // For URL videos, check for existing videos by URL and owner
    console.log('🐛 [DEBUG] Checking for existing URL video with:', {
      url: videoData.url,
      owner_id: videoData.owner_id,
      video_type: 'url',
    });

    const { data: existingVideo } = await supabase
      .from('videos')
      .select('*')
      .eq('url', videoData.url)
      .eq('owner_id', videoData.owner_id)
      .eq('video_type', 'url')
      .single();

    console.log('🐛 [DEBUG] Existing video query result:', existingVideo);

    if (existingVideo) {
      console.log(
        '🔍 [VideoService] Found existing URL video, updating:',
        existingVideo.id
      );
      console.log('🐛 [DEBUG] Existing video details:', {
        id: existingVideo.id,
        url: existingVideo.url,
        video_id: existingVideo.video_id,
        video_type: existingVideo.video_type,
      });

      // Update existing video with new data
      const { data, error } = await supabase
        .from('videos')
        .update({
          title: videoData.title,
          fps: videoData.fps,
          duration: videoData.duration,
          total_frames: videoData.total_frames,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingVideo.id)
        .select()
        .single();

      if (error) {
        console.error('❌ [VideoService] Failed to update video:', error);
        throw error;
      }
      console.log('✅ [VideoService] Successfully updated video:', data);
      console.log('🐛 [DEBUG] Updated video details:', {
        id: data.id,
        url: data.url,
        video_id: data.video_id,
        video_type: data.video_type,
      });
      return data;
    }

    console.log(
      '🔍 [VideoService] No existing URL video found, creating new one'
    );
    // Create new video if none exists
    const { data, error } = await supabase
      .from('videos')
      .insert(videoData)
      .select()
      .single();

    if (error) {
      console.error('❌ [VideoService] Failed to create video:', error);
      console.error('❌ [VideoService] Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw error;
    }
    console.log('✅ [VideoService] Successfully created video:', data);
    console.log('🐛 [DEBUG] New video details:', {
      id: data.id,
      url: data.url,
      video_id: data.video_id,
      video_type: data.video_type,
    });
    return data;
  }

  static async getUserVideos(userId: string) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async getMostRecentUserVideo(userId: string) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
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
      .select('video_type, file_path')
      .eq('id', videoId)
      .single();

    if (fetchError) throw fetchError;

    // If it's an uploaded video, use the upload service to delete it
    if (video && video.video_type === 'upload' && video.file_path) {
      await VideoUploadService.deleteUploadedVideo(videoId, video.file_path);
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
      console.log('🎬 [VideoService] Loading video entities for user:', userId);

      // Load individual videos first
      const individualVideos = await this.getUserVideos(userId);
      console.log(
        '🎬 [VideoService] Loaded individual videos:',
        individualVideos?.length || 0
      );

      // Load comparison videos using direct Supabase query to avoid circular dependency
      const { data: comparisonData, error: comparisonError } = await supabase
        .from('comparison_videos')
        .select(
          `
          *,
          video_a:videos!comparison_videos_video_a_id_fkey(*),
          video_b:videos!comparison_videos_video_b_id_fkey(*)
        `
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (comparisonError) {
        console.error(
          '❌ [VideoService] Error loading comparison videos:',
          comparisonError
        );
        // Don't throw, just continue with individual videos only
      }

      console.log(
        '🎬 [VideoService] Loaded comparison videos:',
        comparisonData?.length || 0
      );

      // Transform comparison videos to app format
      const { transformDatabaseComparisonVideoToApp } = await import(
        '../types/database'
      );
      const comparisonVideos =
        comparisonData?.map((item) =>
          transformDatabaseComparisonVideoToApp(
            item,
            item.video_a,
            item.video_b
          )
        ) || [];

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
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      console.log(
        '🎬 [VideoService] Total entities loaded:',
        allEntities.length
      );
      return allEntities;
    } catch (error) {
      console.error('❌ [VideoService] Error loading video entities:', error);
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
          console.warn(
            `❌ [VideoService] Entity ${entityId} not found as individual or comparison video`
          );
          return null;
        }
      }
    } catch (error) {
      console.error('❌ [VideoService] Error loading video entity:', error);
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
      console.error('❌ [VideoService] Error deleting video entity:', error);
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
            AnnotationService.getVideoAnnotations(entity.video_a_id),
            AnnotationService.getVideoAnnotations(entity.video_b_id),
            AnnotationService.getComparisonVideoAnnotations(entity.id),
          ]);

        return {
          type: 'comparison' as const,
          comparisonVideo: entity,
          videoA: entity.video_a,
          videoB: entity.video_b,
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
            videoType: entity.video_type,
            title: entity.title,
            fps: entity.fps,
            duration: entity.duration,
            totalFrames: entity.total_frames,
          },
        };
      }
    } catch (error) {
      console.error(
        '❌ [VideoService] Error loading video entity with annotations:',
        error
      );
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
      console.error(
        '❌ [VideoService] Error getting most recent video entity:',
        error
      );
      throw error;
    }
  }

  /**
   * Type guard helper methods (re-exported for convenience)
   */
  static isComparisonVideo = isComparisonVideo;
  static isIndividualVideo = isIndividualVideo;
}
