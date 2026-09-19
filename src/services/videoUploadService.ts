import { supabase } from '../composables/useSupabase';
import type { Video, VideoInsert } from '../types/database';
import { VideoService } from './videoService';
import { ThumbnailGenerator } from '../utils/thumbnailGenerator';

/**
 * Manual upload of a video file into the public `videos` storage bucket, plus
 * the matching `videos` row. Reached only from the comparison wizard: the
 * pipeline is the normal way a video enters the system, and the storage
 * INSERT policy (20260911_restore_video_uploads.sql) scopes each user to their
 * own folder.
 */

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

export type Validation = { valid: true } | { valid: false; error: string };

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  /** Injectable so the flow can be tested without a media decoder. */
  readMetadata?: (file: File) => Promise<VideoMetadata>;
}

const ALLOWED_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
];
const MAX_SIZE_BYTES = 1000 * 1024 * 1024;
const HEADER_SCAN_BYTES = 64 * 1024;
/** Browsers report no frame rate. Annotations are frame-stamped, so pick one. */
const ASSUMED_FPS = 30;

const encode = (s: string) => [...s].map((c) => c.charCodeAt(0));
const HEVC_TAGS = [encode('hvc1'), encode('hev1')];

function containsBytes(haystack: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export class VideoUploadService {
  static validateVideoFile(file: File): Validation {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: 'Unsupported file type. Upload an MP4, WebM, OGG, MOV or AVI file.',
      };
    }
    if (file.size > MAX_SIZE_BYTES) {
      return {
        valid: false,
        error: 'File is too large. The maximum size is 1000MB.',
      };
    }
    return { valid: true };
  }

  /**
   * Rejects HEVC by looking for its codec tag in the file header. Safari
   * cannot play it, and a comparison that only plays in Chrome is broken.
   */
  static async validateVideoCompatibility(file: File): Promise<Validation> {
    const header = new Uint8Array(
      await file.slice(0, HEADER_SCAN_BYTES).arrayBuffer()
    );
    if (HEVC_TAGS.some((tag) => containsBytes(header, tag))) {
      return {
        valid: false,
        error:
          'HEVC (H.265) video does not play in Safari. Convert it to H.264 before uploading.',
      };
    }
    return { valid: true };
  }

  /** Reads duration and dimensions by loading the file into a video element. */
  static extractVideoMetadata(file: File): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      const cleanup = () => {
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
      };
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const { duration, videoWidth, videoHeight } = video;
        cleanup();
        resolve({
          duration,
          fps: ASSUMED_FPS,
          totalFrames: Math.floor(duration * ASSUMED_FPS),
          width: videoWidth,
          height: videoHeight,
        });
      };
      video.onerror = () => {
        cleanup();
        reject(new Error('Could not read the video. The file may be corrupt.'));
      };
      video.src = url;
    });
  }

  static storagePath(userId: string, fileName: string, now: number): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${userId}/${now}_${safeName}`;
  }

  /**
   * Validates, reads metadata, uploads the file and inserts its row. Removes
   * the stored object again if the row cannot be inserted, so a failure leaves
   * nothing behind.
   */
  static async uploadVideoComplete(
    file: File,
    userId: string,
    options: UploadOptions = {}
  ): Promise<Video> {
    const validation = this.validateVideoFile(file);
    if (!validation.valid) throw new Error(validation.error);

    const readMetadata = options.readMetadata ?? this.extractVideoMetadata;
    const metadata = await readMetadata(file);

    const now = Date.now();
    const filePath = this.storagePath(userId, file.name, now);
    const { data: signed, error: signError } = await supabase.storage
      .from('videos')
      .createSignedUploadUrl(filePath, { upsert: false });
    if (signError || !signed) {
      throw new Error(signError?.message ?? 'Could not start the upload.');
    }

    await putWithProgress(file, signed.signedUrl, options.onProgress);

    const { data: urlData } = supabase.storage
      .from('videos')
      .getPublicUrl(filePath);

    const thumbnailUrl = await ThumbnailGenerator.generateThumbnailFromFile(
      file,
      320
    );

    const row: VideoInsert = {
      ownerId: userId,
      title: file.name.replace(/\.[^/.]+$/, ''),
      url: urlData.publicUrl,
      videoId: `upload_${now}`,
      fps: metadata.fps,
      duration: metadata.duration,
      totalFrames: metadata.totalFrames,
      videoType: 'upload',
      filePath,
      fileSize: file.size,
      originalFilename: file.name,
      isPublic: false,
      allowAnnotations: true,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    };

    try {
      return await VideoService.createVideo(row);
    } catch (error) {
      await supabase.storage.from('videos').remove([filePath]);
      throw error;
    }
  }
}

/** PUT to a signed upload URL. XMLHttpRequest is the only way to get progress. */
function putWithProgress(
  file: File,
  signedUrl: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress?.({
          loaded: event.loaded,
          total: event.total,
          percentage: (event.loaded / event.total) * 100,
        });
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ loaded: file.size, total: file.size, percentage: 100 });
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () =>
      reject(new Error('Upload failed. Check your connection and try again.'))
    );
    xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled.')));
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
