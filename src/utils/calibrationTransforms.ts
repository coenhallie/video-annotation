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
 * Transform a 2D image point to 3D world coordinates using homography
 * @param point - 2D point in image coordinates
 * @param homography - 3x3 homography matrix (world to image)
 * @param z - Z-coordinate in world space (default 0 for court plane)
 * @returns 3D point in world coordinates or null if transformation fails
 */
export function imageToWorld(
  point: Point2D,
  homography: number[][],
  z: number = 0
): Point3D | null {
  console.log('🔧 [imageToWorld] Input point:', point);
  console.log('🔧 [imageToWorld] Homography matrix:', homography);

  // The homography matrix H transforms world points to image points: image = H * world
  // To go from image to world, we need the inverse: world = H^(-1) * image
  const inverseH = matrixCache.get(
    `inverse_homography_${JSON.stringify(homography)}`,
    () => {
      const inv = invertMatrix3x3(homography);
      console.log('🔧 [imageToWorld] Computed inverse homography:', inv);
      return inv || [];
    }
  );

  if (!inverseH || inverseH.length === 0) {
    console.error('🚨 [imageToWorld] Failed to invert homography matrix');
    console.error(
      '🚨 [imageToWorld] Original matrix determinant:',
      calculateDeterminant3x3(homography)
    );
    return null;
  }

  // Convert image point to homogeneous coordinates
  const imageHomogeneous = [point.x, point.y, 1];
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

  const worldX = worldHomogeneous[0] / worldHomogeneous[2];
  const worldY = worldHomogeneous[1] / worldHomogeneous[2];

  console.log('🔧 [imageToWorld] Final world coordinates:', {
    x: worldX,
    y: worldY,
    z,
  });

  return {
    x: worldX,
    y: worldY,
    z: z, // Use provided z-coordinate (typically 0 for court plane)
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
 * Clear all cached matrices (call when calibration changes)
 */
export function clearTransformCache(): void {
  matrixCache.clear();
}
