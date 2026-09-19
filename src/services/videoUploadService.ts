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
  /**
   * Cancels the upload. The transfer stops, nothing is inserted, and an object
   * that had already landed in storage is removed again.
   */
  signal?: AbortSignal;
}

// No AVI: no browser decodes it, so an accepted AVI only ever failed later, in
// metadata extraction, with a misleading "the file may be corrupt".
export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
];
const ALLOWED_TYPES = ALLOWED_VIDEO_TYPES;
const MAX_SIZE_BYTES = 1000 * 1024 * 1024;
const HEADER_SCAN_BYTES = 64 * 1024;
/** A moov box is metadata only; tens of MB would be a many-hour recording. */
const MAX_MOOV_SCAN_BYTES = 32 * 1024 * 1024;
const METADATA_TIMEOUT_MS = 15_000;
const CANCELLED = 'Upload was cancelled.';
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
        error: 'Unsupported file type. Upload an MP4, WebM, OGG or MOV file.',
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
   * Rejects HEVC by looking for its codec tag. HEVC decoding depends on the
   * browser and the machine (Firefox and Chrome without hardware support
   * cannot play it), and a comparison that plays for one viewer only is broken.
   *
   * The tag lives in the `moov` box. Phone recordings write `moov` at the END
   * of the file, so the box is located by walking the top-level boxes - eight
   * bytes each, no matter how large the file - and only it is scanned. Scanning
   * media data instead would both miss those files and risk a false positive
   * on bytes that happen to spell a tag. A file that does not parse as boxes
   * falls back to scanning its first bytes.
   */
  static async validateVideoCompatibility(file: File): Promise<Validation> {
    const moov = await findTopLevelBox(file, 'moov');
    const region = moov
      ? file.slice(moov.start, Math.min(moov.end, moov.start + MAX_MOOV_SCAN_BYTES))
      : file.slice(0, HEADER_SCAN_BYTES);
    const bytes = new Uint8Array(await region.arrayBuffer());
    if (HEVC_TAGS.some((tag) => containsBytes(bytes, tag))) {
      return {
        valid: false,
        error:
          'HEVC (H.265) video does not play in every browser. Convert it to H.264 before uploading.',
      };
    }
    return { valid: true };
  }

  /** Reads duration and dimensions by loading the file into a video element. */
  static extractVideoMetadata(file: File): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      // A file the browser neither loads nor rejects would leave the upload
      // sitting on "Checking file..." for good.
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Could not read the video in time. Try another file.'));
      }, METADATA_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
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
    // A MediaRecorder WebM reports Infinity. That serialises to null and the
    // row insert fails - so say it now, not after the whole file has uploaded.
    if (!Number.isFinite(metadata.duration) || metadata.duration <= 0) {
      throw new Error(
        'This video has no readable duration. Re-export it and try again.'
      );
    }
    if (options.signal?.aborted) throw new Error(CANCELLED);

    const now = Date.now();
    const filePath = this.storagePath(userId, file.name, now);
    const { data: signed, error: signError } = await supabase.storage
      .from('videos')
      .createSignedUploadUrl(filePath, { upsert: false });
    if (signError || !signed) {
      throw new Error(signError?.message ?? 'Could not start the upload.');
    }

    await putWithProgress(file, signed.signedUrl, options.onProgress, options.signal);

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
      // Cancelled after the bytes landed (during the thumbnail): the object is
      // already stored, so it goes through the same cleanup as a failed insert.
      if (options.signal?.aborted) throw new Error(CANCELLED);
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
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
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
    xhr.addEventListener('abort', () => reject(new Error(CANCELLED)));
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Byte range of the first top-level MP4 box of `type`, or null when the file
 * does not parse as a sequence of boxes. Reads box headers only.
 */
async function findTopLevelBox(
  file: File,
  type: string
): Promise<{ start: number; end: number } | null> {
  let offset = 0;
  // Far more boxes than any real file has at the top level; bounds a malformed one.
  for (let i = 0; i < 1024 && offset + 8 <= file.size; i++) {
    const header = new DataView(
      await file.slice(offset, offset + 16).arrayBuffer()
    );
    let size = header.getUint32(0);
    const boxType = String.fromCharCode(
      header.getUint8(4),
      header.getUint8(5),
      header.getUint8(6),
      header.getUint8(7)
    );
    if (size === 1) {
      // 64-bit size follows the type.
      if (header.byteLength < 16) return null;
      size = Number(header.getBigUint64(8));
    } else if (size === 0) {
      size = file.size - offset; // "to the end of the file"
    }
    if (!/^[\x20-\x7e]{4}$/.test(boxType) || size < 8) return null;
    if (boxType === type) {
      return { start: offset, end: Math.min(offset + size, file.size) };
    }
    offset += size;
  }
  return null;
}
