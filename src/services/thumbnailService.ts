import { supabase } from '../composables/useSupabase';
import type { Video } from '../types/database';

export class ThumbnailService {
  /**
   * Generate composite thumbnail for comparison video
   */
  static async generateCompositeThumbnail(
    comparisonVideoId: string,
    videoA: Video,
    videoB: Video,
    options: {
      width?: number;
      height?: number;
      layout?: 'side_by_side' | 'stacked' | 'overlay';
      quality?: number;
    } = {}
  ): Promise<string | null> {
    const {
      width = 320,
      height = 180,
      layout = 'side_by_side',
      quality = 0.8,
    } = options;

    try {
      console.log(
        '🖼️ [ThumbnailService] Generating composite thumbnail for comparison:',
        comparisonVideoId
      );

      // Create canvas for composite thumbnail
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Set canvas dimensions based on layout
      if (layout === 'side_by_side') {
        canvas.width = width;
        canvas.height = height;
      } else if (layout === 'stacked') {
        canvas.width = width;
        canvas.height = height;
      } else if (layout === 'overlay') {
        canvas.width = width;
        canvas.height = height;
      }

      // Load thumbnail images
      const [imageA, imageB] = await Promise.all([
        this.loadImage(videoA.thumbnail_url),
        this.loadImage(videoB.thumbnail_url),
      ]);

      // Draw composite based on layout
      switch (layout) {
        case 'side_by_side':
          await this.drawSideBySide(ctx, imageA, imageB, width, height);
          break;
        case 'stacked':
          await this.drawStacked(ctx, imageA, imageB, width, height);
          break;
        case 'overlay':
          await this.drawOverlay(ctx, imageA, imageB, width, height);
          break;
      }

      // Add comparison indicator
      this.addComparisonIndicator(ctx, width, height);

      // Convert to blob and upload
      const blob = await this.canvasToBlob(canvas, quality);
      const thumbnailUrl = await this.uploadThumbnail(comparisonVideoId, blob);

      console.log(
        '✅ [ThumbnailService] Successfully generated composite thumbnail:',
        thumbnailUrl
      );
      return thumbnailUrl;
    } catch (error) {
      console.error(
        '❌ [ThumbnailService] Failed to generate composite thumbnail:',
        error
      );
      return null;
    }
  }

  /**
   * Draw side-by-side layout
   */
  private static async drawSideBySide(
    ctx: CanvasRenderingContext2D,
    imageA: HTMLImageElement,
    imageB: HTMLImageElement,
    width: number,
    height: number
  ): Promise<void> {
    const halfWidth = width / 2;

    // Draw Video A on left half
    ctx.drawImage(imageA, 0, 0, halfWidth, height);

    // Draw Video B on right half
    ctx.drawImage(imageB, halfWidth, 0, halfWidth, height);

    // Add divider line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(halfWidth, 0);
    ctx.lineTo(halfWidth, height);
    ctx.stroke();

    // Add labels
    this.addVideoLabel(ctx, 'A', 8, 20, '#ffffff');
    this.addVideoLabel(ctx, 'B', halfWidth + 8, 20, '#ffffff');
  }

  /**
   * Draw stacked layout
   */
  private static async drawStacked(
    ctx: CanvasRenderingContext2D,
    imageA: HTMLImageElement,
    imageB: HTMLImageElement,
    width: number,
    height: number
  ): Promise<void> {
    const halfHeight = height / 2;

    // Draw Video A on top half
    ctx.drawImage(imageA, 0, 0, width, halfHeight);

    // Draw Video B on bottom half
    ctx.drawImage(imageB, 0, halfHeight, width, halfHeight);

    // Add divider line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, halfHeight);
    ctx.lineTo(width, halfHeight);
    ctx.stroke();

    // Add labels
    this.addVideoLabel(ctx, 'A', 8, 20, '#ffffff');
    this.addVideoLabel(ctx, 'B', 8, halfHeight + 20, '#ffffff');
  }

  /**
   * Draw overlay layout
   */
  private static async drawOverlay(
    ctx: CanvasRenderingContext2D,
    imageA: HTMLImageElement,
    imageB: HTMLImageElement,
    width: number,
    height: number
  ): Promise<void> {
    // Draw Video A as background
    ctx.drawImage(imageA, 0, 0, width, height);

    // Draw Video B with transparency in corner
    const overlaySize = Math.min(width, height) * 0.3;
    const overlayX = width - overlaySize - 10;
    const overlayY = 10;

    ctx.globalAlpha = 0.9;
    ctx.drawImage(
      imageB,
      overlayX,
      overlayY,
      overlaySize,
      overlaySize * (height / width)
    );
    ctx.globalAlpha = 1.0;

    // Add border to overlay
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      overlayX,
      overlayY,
      overlaySize,
      overlaySize * (height / width)
    );

    // Add labels
    this.addVideoLabel(ctx, 'A', 8, 20, '#ffffff');
    this.addVideoLabel(ctx, 'B', overlayX + 4, overlayY + 16, '#ffffff');
  }

  /**
   * Add comparison indicator icon
   */
  private static addComparisonIndicator(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    const iconSize = 24;
    const x = width - iconSize - 8;
    const y = height - iconSize - 8;

    // Draw background circle
    ctx.fillStyle = 'rgba(147, 51, 234, 0.9)'; // Purple background
    ctx.beginPath();
    ctx.arc(x + iconSize / 2, y + iconSize / 2, iconSize / 2, 0, 2 * Math.PI);
    ctx.fill();

    // Draw comparison icon (simplified)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Draw two rectangles representing videos
    ctx.rect(x + 4, y + 6, 6, 4);
    ctx.rect(x + 14, y + 6, 6, 4);
    // Draw connection line
    ctx.moveTo(x + 10, y + 8);
    ctx.lineTo(x + 14, y + 8);
    ctx.stroke();
  }

  /**
   * Add video label
   */
  private static addVideoLabel(
    ctx: CanvasRenderingContext2D,
    label: string,
    x: number,
    y: number,
    color: string
  ): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x - 2, y - 14, 16, 18);

    ctx.fillStyle = color;
    ctx.font = 'bold 12px Arial';
    ctx.fillText(label, x, y);
  }

  /**
   * Load image from URL
   */
  private static loadImage(url?: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      if (!url) {
        // Create placeholder image
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#f3f4f6';
          ctx.fillRect(0, 0, 160, 90);
          ctx.fillStyle = '#9ca3af';
          ctx.font = '14px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('No Thumbnail', 80, 50);
        }

        const img = new Image();
        img.onload = () => resolve(img);
        img.src = canvas.toDataURL();
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        console.warn('Failed to load thumbnail:', url);
        // Create placeholder and resolve
        this.loadImage(undefined).then(resolve);
      };
      img.src = url;
    });
  }

  /**
   * Convert canvas to blob
   */
  private static canvasToBlob(
    canvas: HTMLCanvasElement,
    quality: number
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert canvas to blob'));
          }
        },
        'image/jpeg',
        quality
      );
    });
  }

  /**
   * Upload thumbnail to storage
   */
  private static async uploadThumbnail(
    comparisonVideoId: string,
    blob: Blob
  ): Promise<string> {
    const fileName = `comparison-thumbnails/${comparisonVideoId}.jpg`;

    const { data, error } = await supabase.storage
      .from('thumbnails')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      throw error;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('thumbnails').getPublicUrl(fileName);

    return publicUrl;
  }

  /**
   * Delete thumbnail from storage
   */
  static async deleteThumbnail(thumbnailUrl: string): Promise<void> {
    try {
      // Extract file path from URL
      const url = new URL(thumbnailUrl);
      const pathParts = url.pathname.split('/');
      const fileName = pathParts[pathParts.length - 1];
      const filePath = `comparison-thumbnails/${fileName}`;

      const { error } = await supabase.storage
        .from('thumbnails')
        .remove([filePath]);

      if (error) {
        console.warn('Failed to delete thumbnail:', error);
      }
    } catch (error) {
      console.warn('Failed to parse thumbnail URL for deletion:', error);
    }
  }

  /**
   * Generate thumbnail at specific timestamp
   */
  static async generateTimestampThumbnail(
    videoUrl: string,
    timestamp: number,
    options: {
      width?: number;
      height?: number;
      quality?: number;
    } = {}
  ): Promise<string | null> {
    const { width = 160, height = 90, quality = 0.8 } = options;

    try {
      // Create video element
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;

      return new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.currentTime = timestamp;
        };

        video.onseeked = () => {
          try {
            // Create canvas and draw video frame
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              reject(new Error('Could not get canvas context'));
              return;
            }

            ctx.drawImage(video, 0, 0, width, height);

            // Convert to blob and resolve
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  // In a real implementation, you'd upload this blob
                  // For now, return a data URL
                  resolve(canvas.toDataURL('image/jpeg', quality));
                } else {
                  reject(new Error('Failed to generate thumbnail'));
                }
              },
              'image/jpeg',
              quality
            );
          } catch (error) {
            reject(error);
          }
        };

        video.onerror = () => {
          reject(new Error('Failed to load video for thumbnail generation'));
        };

        video.src = videoUrl;
      });
    } catch (error) {
      console.error('Failed to generate timestamp thumbnail:', error);
      return null;
    }
  }

  /**
   * Create thumbnail grid for multiple videos
   */
  static async generateThumbnailGrid(
    videos: Video[],
    options: {
      gridWidth?: number;
      gridHeight?: number;
      thumbnailWidth?: number;
      thumbnailHeight?: number;
      spacing?: number;
    } = {}
  ): Promise<string | null> {
    const {
      gridWidth = 2,
      gridHeight = 2,
      thumbnailWidth = 160,
      thumbnailHeight = 90,
      spacing = 4,
    } = options;

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Calculate canvas dimensions
      canvas.width = thumbnailWidth * gridWidth + spacing * (gridWidth - 1);
      canvas.height = thumbnailHeight * gridHeight + spacing * (gridHeight - 1);

      // Fill background
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Load and draw thumbnails
      const maxVideos = Math.min(videos.length, gridWidth * gridHeight);
      const images = await Promise.all(
        videos
          .slice(0, maxVideos)
          .map((video) => this.loadImage(video.thumbnail_url))
      );

      for (let i = 0; i < images.length; i++) {
        const row = Math.floor(i / gridWidth);
        const col = i % gridWidth;
        const x = col * (thumbnailWidth + spacing);
        const y = row * (thumbnailHeight + spacing);

        ctx.drawImage(images[i], x, y, thumbnailWidth, thumbnailHeight);
      }

      // Convert to data URL
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (error) {
      console.error('Failed to generate thumbnail grid:', error);
      return null;
    }
  }
}
