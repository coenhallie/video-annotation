import { supabase } from '../composables/useSupabase';
import type {
  VideoInsert,
  VideoUpdate,
  Video,
  VideoEntity,
  ComparisonVideo,
} from '../types/database';
import { isComparisonVideo, isIndividualVideo } from '../types/database';
import { ThumbnailGenerator } from '../utils/thumbnailGenerator';
import { AwsStorageService } from './awsStorageService';
import { handleServiceError } from '../utils/errorHandler';

export class VideoService {
  static async findExistingUploadedVideo(url: string, ownerId: string) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('url', url)
      .eq('ownerId', ownerId)
      .eq('videoType', 'upload');

    if (error) {
      return null;
    }
    return data && data.length > 0 ? data[0] : null;
  }
  static async createVideo(videoData: VideoInsert) {
    console.log('🔨 [VideoService] Creating video:', {
      title: videoData.title,
      videoType: videoData.videoType,
      videoId: videoData.videoId,
      ownerId: videoData.ownerId,
      hasThumbnail: !!videoData.thumbnailUrl,
    });

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

    // Generate thumbnail if not provided
    if (!videoData.thumbnailUrl && videoData.url) {
      try {
        console.log('🖼️ Generating thumbnail for video:', videoData.title);
        const thumbnail = await ThumbnailGenerator.generateSmallThumbnail(
          videoData.url,
          320
          // Removed seekTime parameter - will use smart frame selection
        );
        if (thumbnail) {
          videoData.thumbnailUrl = thumbnail;
          console.log('✅ Thumbnail generated successfully');
        }
      } catch (error) {
        console.warn('⚠️ Failed to generate thumbnail:', error);
        // Continue without thumbnail
      }
    }

    // For uploaded videos, always create new records (no deduplication)
    if (videoData.videoType === 'upload') {
      console.log('📤 [VideoService] Inserting upload video to database');
      const { data, error } = await supabase
        .from('videos')
        .insert(videoData)
        .select()
        .single();

      if (error) {
        handleServiceError('VideoService.createVideo', error);
        throw error;
      }

      console.log('✅ [VideoService] Video created successfully:', {
        id: data.id,
        title: data.title,
        createdAt: data.createdAt,
      });

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
    console.log('🔍 [VideoService] Fetching videos for user:', userId);

    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('ownerId', userId)
      .order('createdAt', { ascending: false });

    if (error) {
      handleServiceError('VideoService.getUserVideos', error);
      throw error;
    }

    console.log(
      '📊 [VideoService] Fetched videos:',
      data?.map((v) => ({
        id: v.id,
        title: v.title,
        originalFilename: v.originalFilename,
        videoType: v.videoType,
        createdAt: v.createdAt,
        url: v.url?.substring(0, 50) + '...',
        hasThumbnail: !!v.thumbnailUrl,
      }))
    );

    // Check for potential duplicates
    if (data) {
      const urlCounts = new Map<string, number>();
      const titleCounts = new Map<string, number>();

      data.forEach((video) => {
        if (video.url) {
          urlCounts.set(video.url, (urlCounts.get(video.url) || 0) + 1);
        }
        if (video.title) {
          titleCounts.set(video.title, (titleCounts.get(video.title) || 0) + 1);
        }
      });

      // Log any duplicates found
      urlCounts.forEach((count, url) => {
        if (count > 1) {
          console.warn(
            `⚠️ [VideoService] Found ${count} videos with same URL:`,
            url.substring(0, 50) + '...'
          );
          const duplicates = data.filter((v) => v.url === url);
          console.warn(
            'Duplicate videos:',
            duplicates.map((v) => ({
              id: v.id,
              title: v.title,
              createdAt: v.createdAt,
            }))
          );
        }
      });
    }

    return data;
  }

  static async getAllVideos() {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .order('createdAt', { ascending: false });
    if (error) {
      handleServiceError('VideoService.getAllVideos', error);
      throw error;
    }
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

  static async findVideoByUrl(url: string): Promise<Video | null> {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('url', url)
      .eq('videoType', 'url')
      .maybeSingle();

    if (error) {
      handleServiceError('VideoService.findVideoByUrl', error);
      return null;
    }
    return data;
  }

  static async createUrlVideo(
    ownerId: string,
    url: string,
    title: string,
    duration: number,
    fps: number,
    totalFrames: number,
    originalFilename: string
  ): Promise<Video> {
    // Generate thumbnail for the video
    let thumbnailUrl: string | undefined;
    try {
      console.log('🖼️ Generating thumbnail for URL video:', title);
      const thumbnail = await ThumbnailGenerator.generateSmallThumbnail(
        url,
        320
        // Removed seekTime parameter - will use smart frame selection
      );
      if (thumbnail) {
        thumbnailUrl = thumbnail;
        console.log('✅ Thumbnail generated successfully');
      }
    } catch (error) {
      console.warn('⚠️ Failed to generate thumbnail:', error);
    }

    const videoData: VideoInsert = {
      ownerId,
      url,
      title,
      duration,
      fps,
      totalFrames,
      originalFilename,
      videoType: 'url',
      videoId: '', //This will be handled by the database
      isPublic: false,
      ...(thumbnailUrl && { thumbnailUrl }),
    };

    const { data, error } = await supabase
      .from('videos')
      .insert(videoData)
      .select()
      .single();

    if (error) {
      handleServiceError('VideoService.createUrlVideo', error);
      throw error;
    }
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
    // First get the video to check if it has a stored file to clean up
    const { data: video, error: fetchError } = await supabase
      .from('videos')
      .select('videoType, filePath')
      .eq('id', videoId)
      .single();

    if (fetchError) throw fetchError;

    const { error } = await supabase.from('videos').delete().eq('id', videoId);
    if (error) throw error;

    // Legacy uploaded videos also own a storage object. Manual upload is gone, but
    // existing objects still need removing when their row is deleted. Best effort:
    // the row is already gone, so a storage failure must not fail the delete.
    if (video && video.videoType === 'upload' && video.filePath) {
      await supabase.storage.from('videos').remove([video.filePath]);
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
          const comparisonVideoRecord = await ComparisonVideoService.getById(
            entityId
          );

          // Convert ComparisonVideoRecord to ComparisonVideo type
          if (comparisonVideoRecord) {
            const comparisonVideo: ComparisonVideo = {
              id: comparisonVideoRecord.id,
              userId: comparisonVideoRecord.userId || '',
              title: comparisonVideoRecord.title || '',
              ...(comparisonVideoRecord.description != null && { description: comparisonVideoRecord.description }),
              videoAId: comparisonVideoRecord.videoAId,
              videoBId: comparisonVideoRecord.videoBId,
              isPublic: comparisonVideoRecord.isPublic || false,
              allowAnnotations: false,
              createdAt:
                comparisonVideoRecord.createdAt || new Date().toISOString(),
              updatedAt:
                comparisonVideoRecord.updatedAt || new Date().toISOString(),
              ...(comparisonVideoRecord.thumbnailUrl != null && { thumbnailUrl: comparisonVideoRecord.thumbnailUrl }),
              ...(comparisonVideoRecord.videoA != null && { videoA: comparisonVideoRecord.videoA }),
              ...(comparisonVideoRecord.videoB != null && { videoB: comparisonVideoRecord.videoB }),
            };
            return comparisonVideo;
          }
          return null;
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
      return entities && entities.length > 0 ? entities[0]! : null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Find an existing video record by its AWS filepath (stored in filePath).
   */
  static async findVideoByOutputVideoId(outputVideoId: string): Promise<Video | null> {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('videoId', `aws:${outputVideoId}`)
      .maybeSingle();

    if (error) {
      handleServiceError('VideoService.findVideoByOutputVideoId', error);
      return null;
    }
    return data;
  }

  /**
   * Find or create a video record for an AWS pipeline project.
   * - If a record already exists (by filePath), refresh its presigned URL.
   * - If not, create a new record.
   * Returns the video record with a fresh presigned URL.
   */
  static async findOrCreateOutputVideo(outputVideoId: string, ownerId: string): Promise<Video> {
    // The row must exist before the presigned URL is requested. The storage proxy
    // authorizes by asking whether the caller can see this video, and a row that
    // does not exist yet is visible to nobody, so fetching first would 403 the
    // first ingest of every project. Created with an empty url, filled in below.
    const existing = await this.findVideoByOutputVideoId(outputVideoId);
    const createdHere = !existing;

    let record: Video;
    if (existing) {
      record = existing;
    } else {
      const { data, error } = await supabase
        .from('videos')
        .insert({
          ownerId,
          url: '',
          title: `Pipeline Output - ${outputVideoId.substring(0, 8)}`,
          videoType: 'url',
          videoId: `aws:${outputVideoId}`,
          isPublic: false,
          fps: 30,
          duration: 1,
          totalFrames: 30,
        })
        .select()
        .single();

      if (error || !data) {
        handleServiceError('VideoService.findOrCreateOutputVideo', error);
        throw error ?? new Error('Insert returned no row');
      }
      record = data;
    }

    let presignedUrl: string;
    try {
      presignedUrl = await AwsStorageService.getVideoUrlForProject(outputVideoId);
    } catch (error) {
      // A row we just created and cannot fill in is a permanently blank video in
      // the library. A pre-existing row keeps whatever url it already had.
      if (createdHere) {
        await supabase.from('videos').delete().eq('id', record.id);
      }
      throw error;
    }

    // Generate a thumbnail whenever the record has none yet: new records, plus
    // backfill for AWS videos created before thumbnails existed. Requires CORS
    // on the S3 bucket; failure is non-fatal and leaves the video without one.
    let thumbnailUrl: string | null = null;
    if (!record.thumbnailUrl) {
      try {
        // Race against a timeout: generateSmallThumbnail can stall forever on a
        // hung media load (no error event fires), and this await sits on the
        // deep-link open path behind the app loading screen.
        const THUMBNAIL_TIMEOUT_MS = 15_000;
        thumbnailUrl = await Promise.race([
          ThumbnailGenerator.generateSmallThumbnail(presignedUrl),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), THUMBNAIL_TIMEOUT_MS)
          ),
        ]);
      } catch (error) {
        console.warn('⚠️ Failed to generate thumbnail for AWS video:', error);
      }
    }

    const { data, error } = await supabase
      .from('videos')
      .update({
        url: presignedUrl,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      })
      .eq('id', record.id)
      .select()
      .single();

    if (error) {
      handleServiceError('VideoService.findOrCreateOutputVideo', error);
      // A row we just created that never got its url filled in is the same
      // orphan the fetch-failure cleanup above exists to prevent. A
      // pre-existing row keeps whatever url it already had, so it is safe
      // to return as-is.
      if (createdHere) {
        await supabase.from('videos').delete().eq('id', record.id);
        throw error;
      }
      return record;
    }
    return data;
  }

  /**
   * Refresh the presigned URL for an AWS video.
   * Extracts the project ID from videoId (format: "aws:{projectId}").
   */
  static async refreshAwsVideoUrl(video: Video): Promise<string | null> {
    if (!this.isAwsVideo(video)) return null;

    const outputVideoId = video.videoId.replace(/^aws:/, '');
    try {
      const presignedUrl = await AwsStorageService.getVideoUrlForProject(outputVideoId);

      await supabase
        .from('videos')
        .update({ url: presignedUrl })
        .eq('id', video.id);

      return presignedUrl;
    } catch (error) {
      handleServiceError('VideoService.refreshAwsVideoUrl', error);
      return null;
    }
  }

  /**
   * Check if a video is an AWS pipeline video (identified by filePath pattern).
   */
  static isAwsVideo(video: Video | Record<string, unknown>): boolean {
    const videoId = (video as any)?.videoId;
    return typeof videoId === 'string' && videoId.startsWith('aws:');
  }

  /**
   * Type guard helper methods (re-exported for convenience)
   */
  static isComparisonVideo = isComparisonVideo;
  static isIndividualVideo = isIndividualVideo;
}
