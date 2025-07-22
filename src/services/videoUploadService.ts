import { supabase } from '../composables/useSupabase';
import type { VideoInsert } from '../types/database';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface VideoMetadata {
  duration: number;
  fps: number;
  totalFrames: number;
  width: number;
  height: number;
}

export class VideoUploadService {
  /**
   * Validates video file before upload
   */
  static validateVideoFile(file: File): { valid: boolean; error?: string } {
    // Check file type
    const allowedTypes = [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime',
      'video/x-msvideo', // .avi
    ];

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error:
          'Invalid file type. Please upload MP4, WebM, OGG, MOV, or AVI files.',
      };
    }

    // Check file size (200MB limit)
    const maxSize = 200 * 1024 * 1024; // 200MB in bytes
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'File size too large. Maximum size is 200MB.',
      };
    }

    return { valid: true };
  }

  /**
   * Extracts video metadata using HTML5 video element
   */
  static async extractVideoMetadata(file: File): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        const duration = video.duration;
        const fps = 30; // Default FPS, could be enhanced to detect actual FPS
        const totalFrames = Math.floor(duration * fps);

        const metadata: VideoMetadata = {
          duration,
          fps,
          totalFrames,
          width: video.videoWidth,
          height: video.videoHeight,
        };

        URL.revokeObjectURL(url);
        resolve(metadata);
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video metadata'));
      };

      video.src = url;
    });
  }

  /**
   * Uploads video file to Supabase storage with progress tracking
   */
  static async uploadVideo(
    file: File,
    userId: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ path: string; url: string }> {
    // Validate file
    const validation = this.validateVideoFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Generate unique file path
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${userId}/${timestamp}_${sanitizedFileName}`;

    try {
      // Upload file to Supabase storage
      const { data, error } = await supabase.storage
        .from('videos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);

      return {
        path: filePath,
        url: urlData.publicUrl,
      };
    } catch (error) {
      console.error('Video upload failed:', error);
      throw error;
    }
  }

  /**
   * Creates video record in database after successful upload
   */
  static async createUploadedVideoRecord(
    file: File,
    filePath: string,
    url: string,
    userId: string,
    metadata: VideoMetadata
  ): Promise<any> {
    const videoData: VideoInsert = {
      owner_id: userId,
      title: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
      url: url,
      video_id: `upload_${Date.now()}`,
      fps: metadata.fps,
      duration: metadata.duration,
      total_frames: metadata.totalFrames,
      video_type: 'upload',
      file_path: filePath,
      file_size: file.size,
      original_filename: file.name,
      is_public: false,
    };

    const { data, error } = await supabase
      .from('videos')
      .insert(videoData)
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('videos').remove([filePath]);
      throw new Error(`Failed to save video record: ${error.message}`);
    }

    return data;
  }

  /**
   * Complete video upload process: validate, extract metadata, upload, and create record
   */
  static async uploadVideoComplete(
    file: File,
    userId: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<any> {
    try {
      // Step 1: Extract metadata
      const metadata = await this.extractVideoMetadata(file);

      // Step 2: Upload file
      const { path, url } = await this.uploadVideo(file, userId, onProgress);

      // Step 3: Create database record
      const videoRecord = await this.createUploadedVideoRecord(
        file,
        path,
        url,
        userId,
        metadata
      );

      return videoRecord;
    } catch (error) {
      console.error('Video upload failed:', error);
      throw error;
    }
  }

  /**
   * Delete uploaded video file and record
   */
  static async deleteUploadedVideo(
    videoId: string,
    filePath?: string
  ): Promise<void> {
    try {
      // Delete from database first
      const { error: dbError } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);

      if (dbError) {
        throw new Error(`Failed to delete video record: ${dbError.message}`);
      }

      // Delete file from storage if it's an uploaded video
      if (filePath) {
        const { error: storageError } = await supabase.storage
          .from('videos')
          .remove([filePath]);

        if (storageError) {
          console.warn(
            'Failed to delete video file from storage:',
            storageError
          );
          // Don't throw error for storage deletion failure
        }
      }
    } catch (error) {
      console.error('Failed to delete uploaded video:', error);
      throw error;
    }
  }
}
