/**
 * Utility for generating video thumbnails
 */

export class ThumbnailGenerator {
  /**
   * Check if an image is mostly black
   * @param ctx - Canvas 2D context
   * @param width - Canvas width
   * @param height - Canvas height
   * @param threshold - Brightness threshold (0-255, default: 30)
   * @returns true if the image is mostly black
   */
  private static isBlackFrame(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    threshold: number = 30
  ): boolean {
    try {
      // Sample a grid of pixels instead of checking every pixel for performance
      const sampleSize = 10; // Check every 10th pixel
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      let totalBrightness = 0;
      let pixelCount = 0;

      for (let y = 0; y < height; y += sampleSize) {
        for (let x = 0; x < width; x += sampleSize) {
          const idx = (y * width + x) * 4;
          const r = data[idx] || 0;
          const g = data[idx + 1] || 0;
          const b = data[idx + 2] || 0;

          // Calculate brightness using perceived luminance formula
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          totalBrightness += brightness;
          pixelCount++;
        }
      }

      const averageBrightness = totalBrightness / pixelCount;
      return averageBrightness < threshold;
    } catch (error) {
      console.warn('Error checking for black frame:', error);
      return false;
    }
  }

  /**
   * Generate a thumbnail from a video URL at a specific time
   * @param videoUrl - The URL of the video
   * @param seekTime - Time in seconds to capture the thumbnail (default: auto-calculated)
   * @param useSmartFrameSelection - Whether to use smart frame selection to avoid black frames (default: true)
   * @returns Base64 encoded thumbnail image or null if generation fails
   */
  static async generateThumbnail(
    videoUrl: string,
    seekTime?: number,
    useSmartFrameSelection: boolean = true
  ): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        // Create a video element
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous'; // Enable CORS if needed
        video.muted = true;
        video.playsInline = true;

        // Create a canvas for capturing the frame
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          console.error('Failed to get canvas context');
          resolve(null);
          return;
        }

        let attemptCount = 0;
        const maxAttempts = useSmartFrameSelection ? 5 : 1;

        // Define positions to try (as percentages of video duration)
        const positions = [0.3, 0.5, 0.7, 0.1, 0.9];

        // Handle video load error
        video.onerror = () => {
          console.error('Failed to load video for thumbnail generation');
          resolve(null);
        };

        // Function to try capturing a frame
        const tryCapture = () => {
          try {
            // Draw the current frame to canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Check if frame is black and we should try another position
            if (useSmartFrameSelection && attemptCount < maxAttempts - 1) {
              if (this.isBlackFrame(ctx, canvas.width, canvas.height)) {
                console.log(
                  `Frame at ${video.currentTime}s appears to be black, trying another position...`
                );
                attemptCount++;
                // Try next position
                const nextPosition = positions[attemptCount] || 0.5;
                video.currentTime = video.duration * nextPosition;
                return; // Will trigger onseeked again
              }
            }

            // Convert to base64 with reduced quality for smaller size
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);

            // Clean up
            video.remove();
            canvas.remove();

            console.log(
              `Thumbnail generated successfully at ${video.currentTime}s`
            );
            resolve(thumbnailUrl);
          } catch (error) {
            console.error('Error generating thumbnail:', error);
            resolve(null);
          }
        };

        // When video metadata is loaded
        video.onloadedmetadata = () => {
          // Set canvas dimensions to match video
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          // Calculate seek time
          let targetTime: number;

          if (seekTime !== undefined) {
            // Use provided seek time
            targetTime = Math.min(seekTime, video.duration);
          } else if (useSmartFrameSelection) {
            // Use smart selection: start at 30% of video duration
            targetTime = video.duration * (positions[0] || 0.3);
          } else {
            // Fallback to 2 seconds or 10% of duration
            targetTime = Math.min(2, video.duration * 0.1);
          }

          video.currentTime = targetTime;
        };

        // When the seek operation is complete
        video.onseeked = tryCapture;

        // Set the video source
        video.src = videoUrl;
        video.load();
      } catch (error) {
        console.error('Error in thumbnail generation:', error);
        resolve(null);
      }
    });
  }

  /**
   * Generate a smaller thumbnail suitable for storage
   * @param videoUrl - The URL of the video
   * @param maxWidth - Maximum width of the thumbnail (default: 320px)
   * @param seekTime - Time in seconds to capture the thumbnail (default: auto-calculated)
   * @param useSmartFrameSelection - Whether to use smart frame selection to avoid black frames (default: true)
   * @returns Base64 encoded thumbnail image or null if generation fails
   */
  static async generateSmallThumbnail(
    videoUrl: string,
    maxWidth: number = 320,
    seekTime?: number,
    useSmartFrameSelection: boolean = true
  ): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          console.error('Failed to get canvas context');
          resolve(null);
          return;
        }

        let attemptCount = 0;
        const maxAttempts = useSmartFrameSelection ? 5 : 1;

        // Define positions to try (as percentages of video duration)
        const positions = [0.3, 0.5, 0.7, 0.1, 0.9];

        // Function to try capturing a frame
        const tryCapture = () => {
          try {
            // Draw scaled image to canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Check if frame is black and we should try another position
            if (useSmartFrameSelection && attemptCount < maxAttempts - 1) {
              if (this.isBlackFrame(ctx, canvas.width, canvas.height)) {
                console.log(
                  `Frame at ${video.currentTime}s appears to be black, trying another position...`
                );
                attemptCount++;
                // Try next position
                const nextPosition = positions[attemptCount] || 0.5;
                video.currentTime = video.duration * nextPosition;
                return; // Will trigger onseeked again
              }
            }

            // Convert to base64 with compression
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.6);

            // Clean up
            video.remove();
            canvas.remove();

            console.log(
              `Small thumbnail generated successfully at ${video.currentTime}s`
            );
            resolve(thumbnailUrl);
          } catch (error) {
            console.error('Error generating thumbnail:', error);
            resolve(null);
          }
        };

        video.onerror = () => {
          console.error('Failed to load video for thumbnail generation');
          resolve(null);
        };

        video.onloadedmetadata = () => {
          // Calculate scaled dimensions
          const aspectRatio = video.videoHeight / video.videoWidth;
          const width = Math.min(maxWidth, video.videoWidth);
          const height = width * aspectRatio;

          canvas.width = width;
          canvas.height = height;

          // Calculate seek time
          let targetTime: number;

          if (seekTime !== undefined) {
            // Use provided seek time
            targetTime = Math.min(seekTime, video.duration);
          } else if (useSmartFrameSelection) {
            // Use smart selection: start at 30% of video duration
            targetTime = video.duration * (positions[0] || 0.3);
          } else {
            // Fallback to 2 seconds or 10% of duration
            targetTime = Math.min(2, video.duration * 0.1);
          }

          video.currentTime = targetTime;
        };

        video.onseeked = tryCapture;

        video.src = videoUrl;
        video.load();
      } catch (error) {
        console.error('Error in thumbnail generation:', error);
        resolve(null);
      }
    });
  }

  /**
   * Extract a thumbnail from an uploaded file
   * @param file - The video file
   * @param maxWidth - Maximum width of the thumbnail (default: 320px)
   * @param seekTime - Time in seconds to capture the thumbnail (default: auto-calculated)
   * @param useSmartFrameSelection - Whether to use smart frame selection to avoid black frames (default: true)
   * @returns Base64 encoded thumbnail image or null if generation fails
   */
  static async generateThumbnailFromFile(
    file: File,
    maxWidth: number = 320,
    seekTime?: number,
    useSmartFrameSelection: boolean = true
  ): Promise<string | null> {
    try {
      // Create a temporary URL for the file
      const videoUrl = URL.createObjectURL(file);

      // Generate thumbnail with smart frame selection
      const thumbnail = await this.generateSmallThumbnail(
        videoUrl,
        maxWidth,
        seekTime,
        useSmartFrameSelection
      );

      // Clean up the temporary URL
      URL.revokeObjectURL(videoUrl);

      return thumbnail;
    } catch (error) {
      console.error('Error generating thumbnail from file:', error);
      return null;
    }
  }

  /**
   * Generate a composite thumbnail for dual video projects
   * @param videoAUrl - URL of the first video
   * @param videoBUrl - URL of the second video
   * @param maxWidth - Maximum width of the composite thumbnail (default: 320px)
   * @param seekTime - Time in seconds to capture the thumbnails (default: auto-calculated)
   * @param useSmartFrameSelection - Whether to use smart frame selection to avoid black frames (default: true)
   * @returns Base64 encoded composite thumbnail or null if generation fails
   */
  static async generateCompositeThumbnail(
    videoAUrl: string,
    videoBUrl: string,
    maxWidth: number = 320,
    seekTime?: number,
    useSmartFrameSelection: boolean = true
  ): Promise<string | null> {
    try {
      // Generate thumbnails for both videos with smart frame selection
      const [thumbnailA, thumbnailB] = await Promise.all([
        this.generateSmallThumbnail(
          videoAUrl,
          maxWidth / 2,
          seekTime,
          useSmartFrameSelection
        ),
        this.generateSmallThumbnail(
          videoBUrl,
          maxWidth / 2,
          seekTime,
          useSmartFrameSelection
        ),
      ]);

      if (!thumbnailA || !thumbnailB) {
        // If one fails, try to return at least one thumbnail
        return thumbnailA || thumbnailB;
      }

      // Create a composite image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return thumbnailA; // Fallback to first thumbnail
      }

      // Load both thumbnail images
      const imgA = new Image();
      const imgB = new Image();

      return new Promise((resolve) => {
        let loadedCount = 0;

        const checkBothLoaded = () => {
          loadedCount++;
          if (loadedCount === 2) {
            // Set canvas size to accommodate both images side by side
            canvas.width = imgA.width + imgB.width;
            canvas.height = Math.max(imgA.height, imgB.height);

            // Draw both images side by side
            ctx.drawImage(imgA, 0, 0);
            ctx.drawImage(imgB, imgA.width, 0);

            // Add a subtle divider line
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(imgA.width, 0);
            ctx.lineTo(imgA.width, canvas.height);
            ctx.stroke();

            // Convert to base64
            const compositeThumbnail = canvas.toDataURL('image/jpeg', 0.7);

            // Clean up
            canvas.remove();

            resolve(compositeThumbnail);
          }
        };

        imgA.onload = checkBothLoaded;
        imgB.onload = checkBothLoaded;

        imgA.onerror = () => resolve(thumbnailA);
        imgB.onerror = () => resolve(thumbnailA);

        imgA.src = thumbnailA;
        imgB.src = thumbnailB;
      });
    } catch (error) {
      console.error('Error generating composite thumbnail:', error);
      return null;
    }
  }
}
