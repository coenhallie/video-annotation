/**
 * Optimized matrix operations and transformation utilities for camera calibration
 * Provides efficient methods for coordinate transformations between image and world space
 */

import type { Point2D, Point3D } from '../composables/useCameraCalibration';

/**
 * Cache for frequently used matrix operations to improve performance
 */
class MatrixCache {
  private cache: Map<string, number[][]> = new Map();

  /**
   * Get cached matrix or compute and cache it
   */
  get(key: string, compute: () => number[][]): number[][] {
    if (!this.cache.has(key)) {
      this.cache.set(key, compute());
    }
    return this.cache.get(key)!;
  }

  /**
   * Clear the cache when calibration changes
   */
  clear(): void {
    this.cache.clear();
  }
}

export const matrixCache = new MatrixCache();

/**
 * Multiply a 3x3 matrix with a 3x1 vector
 * @param matrix - 3x3 transformation matrix
 * @param vector - 3x1 vector [x, y, w]
 * @returns Resulting 3x1 vector
 */
export function multiplyMatrixVector(
  matrix: number[][],
  vector: number[]
): number[] {
  const result: number[] = [];

  for (let i = 0; i < 3; i++) {
    let sum = 0;
    for (let j = 0; j < 3; j++) {
      sum += (matrix[i]?.[j] ?? 0) * (vector[j] ?? 0);
    }
    result.push(sum);
  }

  return result;
}

/**
 * Multiply two 3x3 matrices
 * @param a - First 3x3 matrix
 * @param b - Second 3x3 matrix
 * @returns Resulting 3x3 matrix
 */
export function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  const result: number[][] = [];

  for (let i = 0; i < 3; i++) {
    result[i] = [];
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += (a[i]?.[k] ?? 0) * (b[k]?.[j] ?? 0);
      }
      result[i]![j] = sum;
    }
  }

  return result;
}

/**
 * Compute the inverse of a 3x3 matrix using adjugate method
 * @param matrix - 3x3 matrix to invert
 * @returns Inverted 3x3 matrix or null if not invertible
 */
export function invertMatrix3x3(matrix: number[][]): number[][] | null {
  // Calculate determinant
  const det = calculateDeterminant3x3(matrix);

  if (Math.abs(det) < 1e-10) {
    // Matrix is singular (not invertible)
    return null;
  }

  // Calculate adjugate matrix
  const adjugate = calculateAdjugate3x3(matrix);

  // Divide adjugate by determinant to get inverse
  const inverse: number[][] = [];
  for (let i = 0; i < 3; i++) {
    inverse[i] = [];
    for (let j = 0; j < 3; j++) {
      inverse[i]![j] = (adjugate[i]?.[j] ?? 0) / det;
    }
  }

  return inverse;
}

/**
 * Calculate the determinant of a 3x3 matrix
 */
export function calculateDeterminant3x3(m: number[][]): number {
  if (
    !m ||
    m.length !== 3 ||
    !m[0] ||
    !m[1] ||
    !m[2] ||
    m[0].length !== 3 ||
    m[1].length !== 3 ||
    m[2].length !== 3
  ) {
    return 0;
  }

  return (
    (m[0]?.[0] ?? 0) *
      ((m[1]?.[1] ?? 0) * (m[2]?.[2] ?? 0) -
        (m[1]?.[2] ?? 0) * (m[2]?.[1] ?? 0)) -
    (m[0]?.[1] ?? 0) *
      ((m[1]?.[0] ?? 0) * (m[2]?.[2] ?? 0) -
        (m[1]?.[2] ?? 0) * (m[2]?.[0] ?? 0)) +
    (m[0]?.[2] ?? 0) *
      ((m[1]?.[0] ?? 0) * (m[2]?.[1] ?? 0) -
        (m[1]?.[1] ?? 0) * (m[2]?.[0] ?? 0))
  );
}

/**
 * Calculate the adjugate (adjoint) of a 3x3 matrix
 */
function calculateAdjugate3x3(m: number[][]): number[][] {
  const cofactors: number[][] = [
    [
      m[1][1] * m[2][2] - m[1][2] * m[2][1],
      -(m[1][0] * m[2][2] - m[1][2] * m[2][0]),
      m[1][0] * m[2][1] - m[1][1] * m[2][0],
    ],
    [
      -(m[0][1] * m[2][2] - m[0][2] * m[2][1]),
      m[0][0] * m[2][2] - m[0][2] * m[2][0],
      -(m[0][0] * m[2][1] - m[0][1] * m[2][0]),
    ],
    [
      m[0][1] * m[1][2] - m[0][2] * m[1][1],
      -(m[0][0] * m[1][2] - m[0][2] * m[1][0]),
      m[0][0] * m[1][1] - m[0][1] * m[1][0],
    ],
  ];

  // Transpose to get adjugate
  const adjugate: number[][] = [];
  for (let i = 0; i < 3; i++) {
    adjugate[i] = [];
    for (let j = 0; j < 3; j++) {
      adjugate[i][j] = cofactors[j][i];
    }
  }

  return adjugate;
}

/**
 * Camera position configuration for position-aware transformations
 */
export interface CameraPositionConfig {
  edge: 'top' | 'bottom' | 'left' | 'right' | null;
  distance: number;
  height: number;
  position3D: Point3D;
}

// Import SportConfig from the main calibration composable to avoid duplication
import type { SportConfig } from '../composables/useCameraCalibration';

/**
 * Transform a 2D image point to 3D world coordinates using homography with position awareness
 * @param point - 2D point in image coordinates
 * @param homography - 3x3 homography matrix (world to image)
 * @param z - Z-coordinate in world space (default 0 for court plane)
 * @param cameraConfig - Optional camera position configuration for enhanced accuracy
 * @returns 3D point in world coordinates or null if transformation fails
 */
export function imageToWorld(
  point: Point2D,
  homography: number[][],
  z: number = 0,
  cameraConfig?: CameraPositionConfig,
  sportConfig?: SportConfig
): Point3D | null {
  console.log('🔧 [imageToWorld] Input point:', point);
  console.log('🔧 [imageToWorld] Homography matrix:', homography);
  if (cameraConfig) {
    console.log('🔧 [imageToWorld] Camera config:', cameraConfig);
  }

  // Apply position-specific corrections if camera configuration is provided
  let correctedPoint = { ...point };
  if (cameraConfig && cameraConfig.edge) {
    correctedPoint = applyCameraPositionCorrection(
      point,
      cameraConfig,
      sportConfig
    );
    console.log('🔧 [imageToWorld] Position-corrected point:', correctedPoint);
  }

  // The homography matrix H transforms world points to image points: image = H * world
  // To go from image to world, we need the inverse: world = H^(-1) * image
  const cacheKey = cameraConfig
    ? `inverse_homography_${JSON.stringify(homography)}_${cameraConfig.edge}_${
        cameraConfig.distance
      }`
    : `inverse_homography_${JSON.stringify(homography)}`;

  const inverseH = matrixCache.get(cacheKey, () => {
    const inv = invertMatrix3x3(homography);
    console.log('🔧 [imageToWorld] Computed inverse homography:', inv);
    return inv || [];
  });

  if (!inverseH || inverseH.length === 0) {
    console.error('🚨 [imageToWorld] Failed to invert homography matrix');
    console.error(
      '🚨 [imageToWorld] Original matrix determinant:',
      calculateDeterminant3x3(homography)
    );
    return null;
  }

  // Convert corrected image point to homogeneous coordinates
  const imageHomogeneous = [correctedPoint.x, correctedPoint.y, 1];
  console.log('🔧 [imageToWorld] Image homogeneous:', imageHomogeneous);

  // Apply inverse homography transformation
  const worldHomogeneous = multiplyMatrixVector(inverseH, imageHomogeneous);
  console.log('🔧 [imageToWorld] World homogeneous:', worldHomogeneous);

  // Convert from homogeneous to Cartesian coordinates
  if (Math.abs(worldHomogeneous[2]) < 1e-10) {
    console.error(
      '🚨 [imageToWorld] Invalid homogeneous coordinate (w ≈ 0):',
      worldHomogeneous[2]
    );
    return null;
  }

  let worldX = worldHomogeneous[0] / worldHomogeneous[2];
  let worldY = worldHomogeneous[1] / worldHomogeneous[2];

  // Apply position-specific height estimation if camera configuration is provided
  let finalZ = z;
  if (cameraConfig && cameraConfig.edge && z === 0) {
    finalZ = estimateHeightFromCameraPosition(
      point,
      cameraConfig,
      worldX,
      worldY
    );
  }

  console.log('🔧 [imageToWorld] Final world coordinates:', {
    x: worldX,
    y: worldY,
    z: finalZ,
  });

  return {
    x: worldX,
    y: worldY,
    z: finalZ,
  };
}

/**
 * Transform a 3D world point to 2D image coordinates using homography
 * @param point - 3D point in world coordinates
 * @param homography - 3x3 homography matrix (world to image)
 * @returns 2D point in image coordinates or null if transformation fails
 */
export function worldToImage(
  point: Point3D,
  homography: number[][]
): Point2D | null {
  // For points on the court plane (z = 0), we can use the homography directly
  // Convert world point to homogeneous coordinates (ignoring z for planar homography)
  const worldHomogeneous = [point.x, point.y, 1];

  // Apply homography transformation
  const imageHomogeneous = multiplyMatrixVector(homography, worldHomogeneous);

  // Convert from homogeneous to Cartesian coordinates
  if (Math.abs(imageHomogeneous[2]) < 1e-10) {
    console.error('Invalid homogeneous coordinate (w ≈ 0)');
    return null;
  }

  const imageX = imageHomogeneous[0] / imageHomogeneous[2];
  const imageY = imageHomogeneous[1] / imageHomogeneous[2];

  return {
    x: imageX,
    y: imageY,
  };
}

/**
 * Batch transform multiple 2D image points to 3D world coordinates
 * @param points - Array of 2D points in image coordinates
 * @param homography - 3x3 homography matrix
 * @param z - Z-coordinate in world space for all points
 * @returns Array of 3D points in world coordinates
 */
export function batchImageToWorld(
  points: Point2D[],
  homography: number[][],
  z: number = 0
): (Point3D | null)[] {
  // Pre-compute inverse homography once for all points
  const inverseH = invertMatrix3x3(homography);

  if (!inverseH) {
    console.error(
      'Failed to invert homography matrix for batch transformation'
    );
    return points.map(() => null);
  }

  return points.map((point) => {
    const imageHomogeneous = [point.x, point.y, 1];
    const worldHomogeneous = multiplyMatrixVector(inverseH, imageHomogeneous);

    if (Math.abs(worldHomogeneous[2]) < 1e-10) {
      return null;
    }

    return {
      x: worldHomogeneous[0] / worldHomogeneous[2],
      y: worldHomogeneous[1] / worldHomogeneous[2],
      z: z,
    };
  });
}

/**
 * Transform pose landmarks from image to world coordinates
 * @param landmarks - Array of pose landmarks with x, y, z, visibility
 * @param homography - 3x3 homography matrix
 * @param worldZ - Base Z-coordinate in world space
 * @returns Array of transformed landmarks in world coordinates
 */
export interface PoseLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface WorldLandmark extends Point3D {
  visibility?: number;
  originalZ?: number; // Preserve original z from pose detection
}

export function transformPoseLandmarks(
  landmarks: PoseLandmark[],
  homography: number[][],
  worldZ: number = 0
): WorldLandmark[] {
  // Pre-compute inverse homography once
  const inverseH = invertMatrix3x3(homography);

  if (!inverseH) {
    console.error(
      'Failed to invert homography matrix for landmarks transformation'
    );
    return [];
  }

  return landmarks.map((landmark) => {
    // Convert image coordinates (normalized or pixel) to homogeneous
    const imageHomogeneous = [landmark.x, landmark.y, 1];
    const worldHomogeneous = multiplyMatrixVector(inverseH, imageHomogeneous);

    if (Math.abs(worldHomogeneous[2]) < 1e-10) {
      // Return a default position if transformation fails
      return {
        x: 0,
        y: 0,
        z: worldZ,
        visibility: landmark.visibility || 0,
        originalZ: landmark.z,
      };
    }

    // Calculate world coordinates
    const worldX = worldHomogeneous[0] / worldHomogeneous[2];
    const worldY = worldHomogeneous[1] / worldHomogeneous[2];

    // Use the landmark's z-value if available, scaled appropriately
    // Otherwise use the provided worldZ (typically 0 for court plane)
    const worldZCoord =
      landmark.z !== undefined
        ? worldZ + landmark.z * 2 // Scale z based on typical pose depth range
        : worldZ;

    return {
      x: worldX,
      y: worldY,
      z: worldZCoord,
      visibility: landmark.visibility,
      originalZ: landmark.z,
    };
  });
}

/**
 * Validate if a homography matrix is valid and well-conditioned
 * @param homography - 3x3 homography matrix to validate
 * @returns true if valid, false otherwise
 */
export function isValidHomography(homography: number[][] | null): boolean {
  if (!homography || homography.length !== 3) {
    return false;
  }

  // Check dimensions
  for (const row of homography) {
    if (!row || row.length !== 3) {
      return false;
    }
  }

  // Check for NaN or Infinity values
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (!isFinite(homography[i][j])) {
        return false;
      }
    }
  }

  // Check determinant (should not be zero or too small)
  const det = calculateDeterminant3x3(homography);
  if (Math.abs(det) < 1e-10) {
    return false;
  }

  // Check condition number (ratio of largest to smallest singular value)
  // A high condition number indicates numerical instability
  // This is a simplified check - for production, use proper SVD
  const normalization = homography[2][2];
  if (Math.abs(normalization) < 1e-10) {
    return false;
  }

  return true;
}

/**
 * Apply camera position-specific corrections to image coordinates
 * @param point - Original image point
 * @param cameraConfig - Camera position configuration
 * @returns Corrected image point
 */
function applyCameraPositionCorrection(
  point: Point2D,
  cameraConfig: CameraPositionConfig
): Point2D {
  if (!cameraConfig.edge) return point;

  const { edge, distance } = cameraConfig;

  // Calculate correction factors based on camera position and distance
  const distanceFactor = Math.max(
    0.8,
    Math.min(1.2, 1.0 + (distance - 3.0) * 0.05)
  );

  let correctedX = point.x;
  let correctedY = point.y;

  switch (edge) {
    case 'top':
    case 'bottom':
      // For baseline cameras, apply horizontal perspective correction
      const centerX = 960; // Assume 1920px width / 2
      correctedX = centerX + (point.x - centerX) * distanceFactor;
      break;

    case 'left':
    case 'right':
      // For sideline cameras, apply vertical perspective correction
      const centerY = 540; // Assume 1080px height / 2
      correctedY = centerY + (point.y - centerY) * distanceFactor;
      break;
  }

  return { x: correctedX, y: correctedY };
}

/**
 * Estimate height based on camera position and world coordinates with sport awareness
 * @param imagePoint - Original image point
 * @param cameraConfig - Camera position configuration
 * @param worldX - World X coordinate
 * @param worldY - World Y coordinate
 * @param sportConfig - Sport-specific configuration
 * @returns Estimated Z coordinate (height)
 */
function estimateHeightFromCameraPosition(
  imagePoint: Point2D,
  cameraConfig: CameraPositionConfig,
  worldX: number,
  worldY: number,
  sportConfig?: SportConfig
): number {
  if (!cameraConfig.edge) return 0;

  const { edge, height: cameraHeight, distance } = cameraConfig;

  // Use sport-specific typical player height for better estimation
  const typicalPlayerHeight = sportConfig?.typicalPlayerHeight || 1.7;
  const heightSensitivity =
    sportConfig?.perspectiveFactors?.heightSensitivity || 1.0;

  let estimatedHeight = 0;

  switch (edge) {
    case 'left':
    case 'right':
      // Sideline cameras have better height estimation
      // Use camera height, distance, and sport-specific player height
      const heightFactor = (cameraHeight / distance) * heightSensitivity;
      estimatedHeight = Math.max(0, heightFactor * typicalPlayerHeight * 0.3);
      break;

    case 'top':
    case 'bottom':
      // Baseline cameras have limited height estimation
      // Use sport-specific height with conservative factor
      estimatedHeight = Math.max(
        0,
        typicalPlayerHeight * 0.1 * heightSensitivity
      );
      break;
  }

  return estimatedHeight;
}

/**
 * Clear all cached matrices (call when calibration changes)
 */
export function clearTransformCache(): void {
  matrixCache.clear();
}
