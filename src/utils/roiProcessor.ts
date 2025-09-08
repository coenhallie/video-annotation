/**
 * ROI Processor Utility
 * Handles video frame cropping and coordinate transformation for ROI-based pose detection
 */

export interface ROI {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CroppedFrameData {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  croppedWidth: number;
  croppedHeight: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

export interface TransformedLandmarks {
  landmarks: Array<{ x: number; y: number; z?: number; visibility?: number }>;
  worldLandmarks: Array<{
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }>;
}

export class ROIProcessor {
  private croppedCanvas: HTMLCanvasElement | null = null;
  private croppedContext: CanvasRenderingContext2D | null = null;
  private lastROI: ROI | null = null;
  private videoWidth = 0;
  private videoHeight = 0;

  constructor() {
    this.initializeCanvas();
  }

  private initializeCanvas(): void {
    this.croppedCanvas = document.createElement('canvas');
    this.croppedContext = this.croppedCanvas.getContext('2d');

    if (!this.croppedContext) {
      throw new Error('Failed to get 2D context for ROI cropping canvas');
    }

    // Set canvas properties for better quality
    this.croppedContext.imageSmoothingEnabled = true;
    this.croppedContext.imageSmoothingQuality = 'high';
  }

  /**
   * Update video dimensions for coordinate calculations
   */
  updateVideoDimensions(width: number, height: number): void {
    this.videoWidth = width;
    this.videoHeight = height;
  }

  /**
   * Validate ROI coordinates and ensure they're within bounds
   */
  validateROI(roi: ROI): ROI {
    if (!roi || this.videoWidth === 0 || this.videoHeight === 0) {
      throw new Error('Invalid ROI or video dimensions not set');
    }

    // Ensure ROI is within bounds (0-1 normalized coordinates)
    const validatedROI: ROI = {
      x: Math.max(0, Math.min(1, roi.x)),
      y: Math.max(0, Math.min(1, roi.y)),
      width: Math.max(0.05, Math.min(1 - roi.x, roi.width)), // Minimum 5% width
      height: Math.max(0.05, Math.min(1 - roi.y, roi.height)), // Minimum 5% height
    };

    // Ensure ROI doesn't exceed bounds
    if (validatedROI.x + validatedROI.width > 1) {
      validatedROI.width = 1 - validatedROI.x;
    }
    if (validatedROI.y + validatedROI.height > 1) {
      validatedROI.height = 1 - validatedROI.y;
    }

    return validatedROI;
  }

  /**
   * Convert normalized ROI coordinates to pixel coordinates
   */
  roiToPixelCoordinates(roi: ROI): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const validatedROI = this.validateROI(roi);

    return {
      x: Math.round(validatedROI.x * this.videoWidth),
      y: Math.round(validatedROI.y * this.videoHeight),
      width: Math.round(validatedROI.width * this.videoWidth),
      height: Math.round(validatedROI.height * this.videoHeight),
    };
  }

  /**
   * Crop video frame to ROI region and return canvas for MediaPipe processing
   */
  cropVideoFrame(
    videoElement: HTMLVideoElement,
    roi: ROI
  ): CroppedFrameData | null {
    if (!this.croppedCanvas || !this.croppedContext) {
      console.error('ROI cropping canvas not initialized');
      return null;
    }

    if (
      !videoElement ||
      videoElement.videoWidth === 0 ||
      videoElement.videoHeight === 0
    ) {
      console.error('Invalid video element for ROI cropping');
      return null;
    }

    // Update video dimensions
    this.updateVideoDimensions(
      videoElement.videoWidth,
      videoElement.videoHeight
    );

    // Validate and convert ROI to pixel coordinates
    const pixelROI = this.roiToPixelCoordinates(roi);

    // Ensure minimum size for MediaPipe processing
    const minSize = 64; // Minimum 64x64 pixels
    if (pixelROI.width < minSize || pixelROI.height < minSize) {
      console.warn(
        'ROI too small for reliable pose detection, expanding to minimum size'
      );
      const centerX = pixelROI.x + pixelROI.width / 2;
      const centerY = pixelROI.y + pixelROI.height / 2;

      pixelROI.width = Math.max(pixelROI.width, minSize);
      pixelROI.height = Math.max(pixelROI.height, minSize);
      pixelROI.x = Math.max(0, centerX - pixelROI.width / 2);
      pixelROI.y = Math.max(0, centerY - pixelROI.height / 2);

      // Ensure we don't exceed video bounds
      if (pixelROI.x + pixelROI.width > this.videoWidth) {
        pixelROI.x = this.videoWidth - pixelROI.width;
      }
      if (pixelROI.y + pixelROI.height > this.videoHeight) {
        pixelROI.y = this.videoHeight - pixelROI.height;
      }
    }

    // Set canvas size to cropped region size
    this.croppedCanvas.width = pixelROI.width;
    this.croppedCanvas.height = pixelROI.height;

    try {
      // Draw the cropped region from video to canvas
      this.croppedContext.drawImage(
        videoElement,
        pixelROI.x, // Source X
        pixelROI.y, // Source Y
        pixelROI.width, // Source width
        pixelROI.height, // Source height
        0, // Destination X
        0, // Destination Y
        pixelROI.width, // Destination width
        pixelROI.height // Destination height
      );

      // Store current ROI for coordinate transformation
      this.lastROI = roi;

      return {
        canvas: this.croppedCanvas,
        context: this.croppedContext,
        croppedWidth: pixelROI.width,
        croppedHeight: pixelROI.height,
        offsetX: pixelROI.x,
        offsetY: pixelROI.y,
        scaleX: this.videoWidth / pixelROI.width,
        scaleY: this.videoHeight / pixelROI.height,
      };
    } catch (error) {
      console.error('Error cropping video frame for ROI:', error);
      return null;
    }
  }

  /**
   * Transform landmarks from cropped coordinate space back to full video coordinate space
   */
  transformLandmarksToFullFrame(
    landmarks: Array<{ x: number; y: number; z?: number; visibility?: number }>,
    worldLandmarks: Array<{
      x: number;
      y: number;
      z: number;
      visibility?: number;
    }>,
    croppedFrameData: CroppedFrameData
  ): TransformedLandmarks {
    if (!landmarks || landmarks.length === 0) {
      return { landmarks: [], worldLandmarks: [] };
    }

    const { offsetX, offsetY, croppedWidth, croppedHeight } = croppedFrameData;

    // Transform 2D landmarks from cropped space to full video space
    const transformedLandmarks = landmarks.map((landmark) => ({
      x: (landmark.x * croppedWidth + offsetX) / this.videoWidth,
      y: (landmark.y * croppedHeight + offsetY) / this.videoHeight,
      ...(landmark.z !== undefined && { z: landmark.z }),
      ...(landmark.visibility !== undefined && {
        visibility: landmark.visibility,
      }),
    }));

    // World landmarks don't need coordinate transformation as they're in 3D world space
    const transformedWorldLandmarks = worldLandmarks.map((landmark) => ({
      x: landmark.x,
      y: landmark.y,
      z: landmark.z,
      ...(landmark.visibility !== undefined && {
        visibility: landmark.visibility,
      }),
    }));

    return {
      landmarks: transformedLandmarks,
      worldLandmarks: transformedWorldLandmarks,
    };
  }

  /**
   * Check if a point is within the ROI bounds
   */
  isPointInROI(x: number, y: number, roi: ROI): boolean {
    return (
      x >= roi.x &&
      x <= roi.x + roi.width &&
      y >= roi.y &&
      y <= roi.y + roi.height
    );
  }

  /**
   * Calculate what percentage of landmarks are within the ROI
   */
  calculateROICoverage(
    landmarks: Array<{ x: number; y: number; visibility?: number }>,
    roi: ROI
  ): {
    coverage: number;
    landmarksInROI: number;
    totalValidLandmarks: number;
  } {
    if (!landmarks || landmarks.length === 0) {
      return { coverage: 0, landmarksInROI: 0, totalValidLandmarks: 0 };
    }

    const validLandmarks = landmarks.filter(
      (landmark) => landmark && (landmark.visibility ?? 0) > 0.3
    );

    if (validLandmarks.length === 0) {
      return { coverage: 0, landmarksInROI: 0, totalValidLandmarks: 0 };
    }

    const landmarksInROI = validLandmarks.filter((landmark) =>
      this.isPointInROI(landmark.x, landmark.y, roi)
    ).length;

    return {
      coverage: landmarksInROI / validLandmarks.length,
      landmarksInROI,
      totalValidLandmarks: validLandmarks.length,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.croppedCanvas = null;
    this.croppedContext = null;
    this.lastROI = null;
  }
}

// Singleton instance for global use
export const roiProcessor = new ROIProcessor();
