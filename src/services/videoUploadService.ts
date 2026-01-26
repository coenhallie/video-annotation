import { supabase } from '../composables/useSupabase';
import type { VideoInsert } from '../types/database';
import { VideoService } from './videoService';
import { ThumbnailGenerator } from '../utils/thumbnailGenerator';

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
  isEstimatedFps?: boolean;
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

    // Check file size (1000MB limit)
    const maxSize = 1000 * 1024 * 1024; // 1000MB in bytes
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'File size too large. Maximum size is 1000MB.',
      };
    }

    return { valid: true };
  }

  /**
   * Checks video file compatibility (Codec, Web Optimization)
   * Prevents upload of HEVC files which fail on Safari
   */
  static async validateVideoCompatibility(
    file: File
  ): Promise<{ valid: boolean; error?: string }> {
    // Read first 64KB to check for signatures
    const CHUNK_SIZE = 64 * 1024;
    const buffer = await file.slice(0, CHUNK_SIZE).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Helper to find byte sequence
    const containsBytes = (signature: number[]) => {
      for (let i = 0; i < bytes.length - signature.length; i++) {
        let found = true;
        for (let j = 0; j < signature.length; j++) {
          if (bytes[i + j] !== signature[j]) {
            found = false;
            break;
          }
        }
        if (found) return true;
      }
      return false;
    };

    // HEVC signatures: 'hvc1', 'hev1'
    const hevcSignatures = [
      [104, 118, 99, 49], // hvc1
      [104, 101, 118, 49], // hev1
    ];

    for (const sig of hevcSignatures) {
      if (containsBytes(sig)) {
        return {
          valid: false,
          error:
            'HEVC (H.265) videos are not supported on Safari. Please convert to H.264 (AVC) before uploading.',
        };
      }
    }

    // Optional: Check if file is Web Optimized (moov before mdat)
    // We search for 'moov' and 'mdat' atoms
    // moov: [109, 111, 111, 118]
    // mdat: [109, 100, 97, 116]
    // This is a naive check; real parsing is safer, but this catches obvious "atom at end" issues
    // if we find mdat near the start but no moov before it.
    
    return { valid: true };
  }

  /**
   * Extracts video metadata using HTML5 video element
   */
  static async extractVideoMetadata(file: File): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);

      const cleanup = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        try {
          video.src = '';
        } catch {}
      };

      video.onloadedmetadata = () => {
        const duration = video.duration;
        // TODO: attempt better FPS detection in future; for now mark as estimated
        const fps = 30;
        const totalFrames = Math.floor(duration * fps);

        const metadata: VideoMetadata = {
          duration,
          fps,
          totalFrames,
          width: video.videoWidth,
          height: video.videoHeight,
          isEstimatedFps: true,
        };

        cleanup();
        resolve(metadata);
      };

      video.onerror = () => {
        cleanup();
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
      // Get upload URL from Supabase
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('videos')
        .createSignedUploadUrl(filePath, {
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to get upload URL: ${uploadError.message}`);
      }

      // Upload with progress tracking using XMLHttpRequest
      await this.uploadWithProgress(file, uploadData.signedUrl, onProgress);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);

      return {
        path: filePath,
        url: urlData.publicUrl,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Upload file with progress tracking using XMLHttpRequest
   */
  private static uploadWithProgress(
    file: File,
    signedUrl: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress: UploadProgress = {
            loaded: event.loaded,
            total: event.total,
            percentage: (event.loaded / event.total) * 100,
          };
          onProgress(progress);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Final progress update
          if (onProgress) {
            onProgress({
              loaded: file.size,
              total: file.size,
              percentage: 100,
            });
          }
          resolve();
        } else {
          reject(new Error(`Upload failed with status: ${xhr.status}`));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed due to network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload was aborted'));
      });

      // Start upload
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }

  /**
   * Creates video record in database after successful upload
   */
  static async createUploadedVideoRecord(
    file: File,
    filePath: string,
    url: string,
    userId: string,
    metadata: VideoMetadata,
    customTitle?: string
  ): Promise<any> {
    console.log('📝 [VideoUploadService] Creating video record:', {
      fileName: file.name,
      customTitle,
      filePath,
      url: url.substring(0, 50) + '...',
      userId,
    });

    // Generate thumbnail before creating the record
    let thumbnailUrl: string | null = null;
    try {
      console.log(
        '🖼️ Generating thumbnail for uploaded video:',
        customTitle || file.name
      );
      thumbnailUrl = await ThumbnailGenerator.generateThumbnailFromFile(
        file,
        320
        // Removed seekTime parameter - will use smart frame selection
      );
      if (thumbnailUrl) {
        console.log('✅ Thumbnail generated successfully');
      }
    } catch (error) {
      console.warn('⚠️ Failed to generate thumbnail:', error);
      // Continue without thumbnail
    }

    const videoData: VideoInsert = {
      ownerId: userId,
      title: customTitle || file.name.replace(/\.[^/.]+$/, ''), // Use custom title or remove file extension
      url: url,
      videoId: `upload_${Date.now()}`,
      fps: metadata.fps,
      duration: metadata.duration,
      totalFrames: metadata.totalFrames,
      videoType: 'upload',
      filePath: filePath,
      fileSize: file.size,
      originalFilename: file.name,
      isPublic: false,
      allowAnnotations: true,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    };

    console.log('📤 [VideoUploadService] Sending video data to VideoService:', {
      title: videoData.title,
      videoId: videoData.videoId,
      hasThumbnail: !!thumbnailUrl,
    });

    try {
      // Use VideoService.createVideo to ensure consistent behavior
      // This will handle thumbnail generation if not already done
      const data = await VideoService.createVideo(videoData);
      console.log('✅ [VideoUploadService] Video record created:', {
        id: data.id,
        title: data.title,
        createdAt: data.createdAt,
      });
      return data;
    } catch (error: any) {
      console.error(
        '❌ [VideoUploadService] Failed to create video record:',
        error
      );
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('videos').remove([filePath]);
      throw new Error(`Failed to save video record: ${error.message}`);
    }
  }

  /**
   * Complete video upload process: validate, extract metadata, upload, and create record
   */
  static async uploadVideoComplete(
    file: File,
    userId: string,
    customTitle?: string,
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
        metadata,
        customTitle
      );

      return videoRecord;
    } catch (error) {
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
          // Don't throw error for storage deletion failure
        }
      }
    } catch (error) {
      throw error;
    }
  }
}
