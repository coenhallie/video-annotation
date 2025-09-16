/**
 * Unified video dimension management system
 * Provides consistent video dimension handling across calibration and runtime contexts
 */

export interface VideoDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface VideoContext {
  element: HTMLVideoElement;
  dimensions: VideoDimensions;
  isLoaded: boolean;
}

/**
 * Extract video dimensions from a video element
 */
export function getVideoDimensions(
  videoElement: HTMLVideoElement
): VideoDimensions {
  // Get actual video dimensions, throw error if video not loaded
  if (!videoElement.videoWidth || !videoElement.videoHeight) {
    console.warn(
      '⚠️ Video dimensions not available. Video may not be loaded yet.'
    );
    // Return a reasonable default but log warning
    return {
      width: 1280, // More common default than 1920
      height: 720, // 720p as fallback
      aspectRatio: 16 / 9,
    };
  }

  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  return {
    width,
    height,
    aspectRatio: width / height,
  };
}

/**
 * Create scaling matrix between two video dimensions
 */
export function createDimensionScalingMatrix(
  from: VideoDimensions,
  to: VideoDimensions
): number[][] {
  const scaleX = to.width / from.width;
  const scaleY = to.height / from.height;

  return [
    [scaleX, 0, 0],
    [0, scaleY, 0],
    [0, 0, 1],
  ];
}

/**
 * Scale homography matrix for different video dimensions
 */
export function scaleHomographyForDimensions(
  homography: number[][],
  originalDimensions: VideoDimensions,
  targetDimensions: VideoDimensions
): number[][] {
  // Validate homography matrix structure
  if (
    !homography ||
    homography.length !== 3 ||
    !homography[0] ||
    !homography[1] ||
    !homography[2] ||
    homography[0].length !== 3 ||
    homography[1].length !== 3 ||
    homography[2].length !== 3
  ) {
    throw new Error('Invalid homography matrix structure');
  }

  // Apply scaling: H_scaled = S * H * S^-1
  // For homography, we need to scale the input coordinates
  const scaleX = targetDimensions.width / originalDimensions.width;
  const scaleY = targetDimensions.height / originalDimensions.height;

  return [
    [
      (homography[0][0] ?? 0) / scaleX,
      (homography[0][1] ?? 0) / scaleY,
      homography[0][2] ?? 0,
    ],
    [
      (homography[1][0] ?? 0) / scaleX,
      (homography[1][1] ?? 0) / scaleY,
      homography[1][2] ?? 0,
    ],
    [
      (homography[2][0] ?? 0) / scaleX,
      (homography[2][1] ?? 0) / scaleY,
      homography[2][2] ?? 0,
    ],
  ];
}

/**
 * Transform point coordinates between different video dimensions
 */
export function transformPointBetweenDimensions(
  point: { x: number; y: number },
  fromDimensions: VideoDimensions,
  toDimensions: VideoDimensions
): { x: number; y: number } {
  return {
    x: (point.x / fromDimensions.width) * toDimensions.width,
    y: (point.y / fromDimensions.height) * toDimensions.height,
  };
}

/**
 * Validate video dimensions for calibration compatibility
 */
export function validateDimensionsForCalibration(dimensions: VideoDimensions): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check minimum dimensions
  if (dimensions.width < 320 || dimensions.height < 240) {
    errors.push(
      `Video dimensions too small: ${dimensions.width}x${dimensions.height}. Minimum 320x240 required.`
    );
  }

  // Check aspect ratio extremes
  if (dimensions.aspectRatio < 0.5 || dimensions.aspectRatio > 4.0) {
    warnings.push(
      `Extreme aspect ratio: ${dimensions.aspectRatio.toFixed(
        2
      )}. May affect calibration accuracy.`
    );
  }

  // Check for common problematic resolutions
  if (dimensions.width % 2 !== 0 || dimensions.height % 2 !== 0) {
    warnings.push('Odd video dimensions may cause alignment issues.');
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Get center point for given video dimensions
 */
export function getVideoCenterPoint(dimensions: VideoDimensions): {
  x: number;
  y: number;
} {
  return {
    x: dimensions.width / 2,
    y: dimensions.height / 2,
  };
}

/**
 * Calculate pixels per meter based on court dimensions and video dimensions
 */
export function calculatePixelsPerMeter(
  videoDimensions: VideoDimensions,
  courtWidthMeters: number,
  homography: number[][]
): number {
  // Use homography to get more accurate scaling
  // Transform court corner points and measure pixel distance
  const leftCorner = { x: -courtWidthMeters / 2, y: 0, z: 0 };
  const rightCorner = { x: courtWidthMeters / 2, y: 0, z: 0 };

  // Project to image coordinates
  const leftImage = projectWorldToImage(leftCorner, homography);
  const rightImage = projectWorldToImage(rightCorner, homography);

  if (leftImage && rightImage) {
    const pixelDistance = Math.abs(rightImage.x - leftImage.x);
    return pixelDistance / courtWidthMeters;
  }

  // Fallback to simple calculation
  return videoDimensions.width / (courtWidthMeters * 2);
}

/**
 * Helper function to project world point to image coordinates
 */
function projectWorldToImage(
  worldPoint: { x: number; y: number; z: number },
  homography: number[][]
): { x: number; y: number } | null {
  try {
    // Validate homography matrix structure
    if (
      !homography ||
      homography.length !== 3 ||
      !homography[0] ||
      !homography[1] ||
      !homography[2] ||
      homography[0].length !== 3 ||
      homography[1].length !== 3 ||
      homography[2].length !== 3
    ) {
      return null;
    }

    // Convert to homogeneous coordinates
    const wx = worldPoint.x;
    const wy = worldPoint.y;
    const wz = 1;

    // Apply homography with safe array access
    const h00 = homography[0]?.[0] ?? 0;
    const h01 = homography[0]?.[1] ?? 0;
    const h02 = homography[0]?.[2] ?? 0;
    const h10 = homography[1]?.[0] ?? 0;
    const h11 = homography[1]?.[1] ?? 0;
    const h12 = homography[1]?.[2] ?? 0;
    const h20 = homography[2]?.[0] ?? 0;
    const h21 = homography[2]?.[1] ?? 0;
    const h22 = homography[2]?.[2] ?? 0;

    const ix = h00 * wx + h01 * wy + h02 * wz;
    const iy = h10 * wx + h11 * wy + h12 * wz;
    const iw = h20 * wx + h21 * wy + h22 * wz;

    // Convert from homogeneous
    if (Math.abs(iw) < 1e-10) {
      return null;
    }

    return {
      x: ix / iw,
      y: iy / iw,
    };
  } catch (error) {
    return null;
  }
}
