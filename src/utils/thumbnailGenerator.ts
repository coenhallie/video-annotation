/**
 * Utility for generating video thumbnails
 */

export class ThumbnailGenerator {
  /**
   * Generate a thumbnail from a video URL at a specific time
   * @param videoUrl - The URL of the video
   * @param seekTime - Time in seconds to capture the thumbnail (default: 2 seconds)
   * @returns Base64 encoded thumbnail image or null if generation fails
   */
  static async generateThumbnail(
    videoUrl: string,
    seekTime: number = 2
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

        // Handle video load error
        video.onerror = () => {
          console.error('Failed to load video for thumbnail generation');
          resolve(null);
        };

        // When video metadata is loaded
        video.onloadedmetadata = () => {
          // Set canvas dimensions to match video
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          // Seek to the specified time
          video.currentTime = Math.min(seekTime, video.duration * 0.1); // Use 10% of duration if seekTime is too large
        };

        // When the seek operation is complete
        video.onseeked = () => {
          try {
            // Draw the current frame to canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convert to base64 with reduced quality for smaller size
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);

            // Clean up
            video.remove();
            canvas.remove();

            resolve(thumbnailUrl);
          } catch (error) {
            console.error('Error generating thumbnail:', error);
            resolve(null);
          }
        };

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
   * @param seekTime - Time in seconds to capture the thumbnail (default: 2 seconds)
   * @returns Base64 encoded thumbnail image or null if generation fails
   */
  static async generateSmallThumbnail(
    videoUrl: string,
    maxWidth: number = 320,
    seekTime: number = 2
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

          // Seek to the specified time or 10% of duration
          video.currentTime = Math.min(seekTime, video.duration * 0.1);
        };

        video.onseeked = () => {
          try {
            // Draw scaled image to canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convert to base64 with compression
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.6);

            // Clean up
            video.remove();
            canvas.remove();

            resolve(thumbnailUrl);
          } catch (error) {
            console.error('Error generating thumbnail:', error);
            resolve(null);
          }
        };

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
   * @param seekTime - Time in seconds to capture the thumbnail (default: 2 seconds)
   * @returns Base64 encoded thumbnail image or null if generation fails
   */
  static async generateThumbnailFromFile(
    file: File,
    maxWidth: number = 320,
    seekTime: number = 2
  ): Promise<string | null> {
    try {
      // Create a temporary URL for the file
      const videoUrl = URL.createObjectURL(file);

      // Generate thumbnail
      const thumbnail = await this.generateSmallThumbnail(
        videoUrl,
        maxWidth,
        seekTime
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
   * @param seekTime - Time in seconds to capture the thumbnails (default: 2 seconds)
   * @returns Base64 encoded composite thumbnail or null if generation fails
   */
  static async generateCompositeThumbnail(
    videoAUrl: string,
    videoBUrl: string,
    maxWidth: number = 320,
    seekTime: number = 2
  ): Promise<string | null> {
    try {
      // Generate thumbnails for both videos
      const [thumbnailA, thumbnailB] = await Promise.all([
        this.generateSmallThumbnail(videoAUrl, maxWidth / 2, seekTime),
        this.generateSmallThumbnail(videoBUrl, maxWidth / 2, seekTime),
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
