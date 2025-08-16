/**
 * useCameraCalibration.ts
 * Enhanced camera calibration with service court support and RANSAC robustness
 * Achieves sub-meter accuracy through multi-point calibration
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { Matrix, SVD, inverse } from 'ml-matrix';

// Types
export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface CalibrationPoint {
  id: string;
  type: 'corner' | 'service' | 'net' | 'baseline' | 'sideline' | 'center';
  image: Point2D;
  world: Point3D;
  confidence: number;
  isOptional?: boolean;
}

export interface CalibrationMode {
  id: string;
  name: string;
  requiredPoints: string[];
  optionalPoints: string[];
  minPoints: number;
  description: string;
}

export interface CalibrationResult {
  homographyMatrix: number[][];
  inverseHomographyMatrix: number[][];
  error: number;
  confidence: number;
  inliers: CalibrationPoint[];
  outliers: CalibrationPoint[];
}

export interface CourtDimensions {
  length: number;
  width: number;
  serviceLineDistance: number;
  centerLineLength: number;
  netHeight: number;
}

export interface CameraSettings {
  position: { x: number; y: number }; // Normalized 0-1 position on court
  height: number; // Camera height in meters
  viewAngle: number; // View direction in radians
}

// Calibration modes optimized for partial visibility
export const CALIBRATION_MODES: CalibrationMode[] = [
  {
    id: 'service-courts',
    name: 'Service Courts Focus',
    requiredPoints: [
      'net-left',
      'net-right',
      'net-center',
      'service-left',
      'service-right',
      'service-center-left',
      'service-center-right',
    ],
    optionalPoints: ['baseline-left', 'baseline-right'],
    minPoints: 7,
    description: 'Optimized for when service courts are clearly visible',
  },
  {
    id: 'full-court',
    name: 'Full Court',
    requiredPoints: [
      'corner-tl',
      'corner-tr',
      'corner-bl',
      'corner-br',
      'net-left',
      'net-right',
      'net-center',
      'service-left',
      'service-right',
    ],
    optionalPoints: [
      'service-center-left',
      'service-center-right',
      'baseline-center',
    ],
    minPoints: 9,
    description:
      'Full court with additional reference points for maximum accuracy',
  },
  {
    id: 'half-court',
    name: 'Half Court Enhanced',
    requiredPoints: [
      'net-left',
      'net-right',
      'net-center',
      'service-left',
      'service-right',
      'sideline-mid-left',
      'sideline-mid-right',
    ],
    optionalPoints: ['service-center-left', 'service-center-right'],
    minPoints: 7,
    description: 'When only half court is visible',
  },
  {
    id: 'minimal',
    name: 'Minimal Service Court',
    requiredPoints: [
      'net-center',
      'service-left',
      'service-right',
      'service-center-left',
      'service-center-right',
    ],
    optionalPoints: ['net-left', 'net-right'],
    minPoints: 5,
    description: 'Minimum viable calibration',
  },
];

export interface UseCameraCalibration {
  // State
  isCalibrated: Ref<boolean>;
  calibrationPoints: Ref<CalibrationPoint[]>;
  calibrationResult: Ref<CalibrationResult | null>;
  courtDimensions: Ref<CourtDimensions>;
  calibrationError: Ref<number>;
  currentMode: Ref<CalibrationMode>;
  validationErrors: Ref<string[]>;
  calibrationQuality: ComputedRef<{
    level: string;
    color: string;
    message: string;
  }>;

  // Backward compatibility
  homographyMatrix: Ref<number[][] | null>;
  setCalibrationPoints: (points: CalibrationPoint[]) => void;

  // Methods
  addCalibrationPoint: (
    pointId: string,
    imageCoord: Point2D,
    confidence?: number
  ) => boolean;
  calibrate: (cameraSettings?: CameraSettings) => boolean;
  calibrateWithRANSAC: () => CalibrationResult | null;
  transformToWorld: (imagePoint: Point2D, z?: number) => Point3D;
  transformToImage: (worldPoint: Point3D) => Point2D;
  transformLandmarksToWorld: (
    landmarks: any[],
    worldLandmarks?: any[]
  ) => Point3D[];
  resetCalibration: () => void;
  saveCalibration: () => string;
  loadCalibration: (data: string) => boolean;
  validateCalibration: () => number;
  setCourtDimensions: (dimensions: Partial<CourtDimensions>) => void;
  setCalibrationMode: (modeId: string) => void;
  suggestNextPoint: () => string | null;
  getWorldCoordinates: (pointId: string) => Point3D;
  getPointDescription: (pointId: string) => string;
  getPointHint: (pointId: string) => string;
}

// State interface for serialization
interface CameraCalibrationState {
  isCalibrated: boolean;
  calibrationPoints: CalibrationPoint[];
  calibrationResult: CalibrationResult | null;
  homographyMatrix: number[][] | null; // For backward compatibility
  inverseHomographyMatrix: number[][] | null; // For backward compatibility
  courtDimensions: CourtDimensions;
  calibrationError: number;
  lastCalibrationTime: number | null;
  currentModeId: string;
}

// Standard badminton court dimensions (singles)
const BADMINTON_COURT: CourtDimensions = {
  length: 13.4,
  width: 5.18, // Singles width
  serviceLineDistance: 1.98,
  centerLineLength: 4.72,
  netHeight: 1.55,
};

// Tennis court dimensions (singles)
const TENNIS_COURT: CourtDimensions = {
  length: 23.77,
  width: 8.23, // Singles width
  serviceLineDistance: 6.4,
  centerLineLength: 11.89,
  netHeight: 0.914,
};

export function useCameraCalibration(): UseCameraCalibration {
  // State
  const isCalibrated = ref(false);
  const calibrationPoints = ref<CalibrationPoint[]>([]);
  const homographyMatrix = ref<number[][] | null>(null);
  const inverseHomographyMatrix = ref<number[][] | null>(null);
  const courtDimensions = ref<CourtDimensions>(BADMINTON_COURT);
  const calibrationError = ref(0);
  const lastCalibrationTime = ref<number | null>(null);
  const calibrationResult = ref<CalibrationResult | null>(null);
  const currentMode = ref<CalibrationMode>(CALIBRATION_MODES[0]!);
  const validationErrors = ref<string[]>([]);

  /**
   * Calculate homography matrix using Direct Linear Transformation (DLT)
   * Maps points from image plane to world plane (court surface)
   */
  function calculateHomography(points: CalibrationPoint[]): number[][] | null {
    if (points.length < 4) {
      console.error(
        'At least 4 calibration points are required, got:',
        points.length
      );
      return null;
    }

    console.log('🔧 [CALIBRATION] Calculating homography with points:', {
      count: points.length,
      points: points.map((p) => ({
        id: p.id,
        image: p.image,
        world: p.world,
        confidence: p.confidence,
      })),
    });

    // Build the matrix A for DLT algorithm
    const rows: number[][] = [];

    for (const point of points) {
      const { x: xi, y: yi } = point.image;
      const { x: xw, y: yw } = point.world;

      // Validate coordinates
      if (!isFinite(xi) || !isFinite(yi) || !isFinite(xw) || !isFinite(yw)) {
        console.error('Invalid coordinates in point:', point);
        return null;
      }

      // Each point contributes 2 rows to matrix A
      rows.push([xw, yw, 1, 0, 0, 0, -xi * xw, -xi * yw, -xi]);
      rows.push([0, 0, 0, xw, yw, 1, -yi * xw, -yi * yw, -yi]);
    }

    console.log(
      '🔧 [CALIBRATION] Matrix A dimensions:',
      rows.length,
      'x',
      rows[0]?.length
    );

    let H: number[][];
    let scale: number | undefined;

    try {
      const A = new Matrix(rows);

      // Solve using SVD (Singular Value Decomposition)
      // Enable autoTranspose for better numerical stability when cols > rows
      const svd = new SVD(A, { autoTranspose: true });
      const V = svd.rightSingularVectors;
      const singularValues = svd.diagonalMatrix.to1DArray();

      console.log('🔧 [CALIBRATION] SVD results:', {
        V_dimensions: [V.rows, V.columns],
        singular_values: singularValues,
        smallest_singular_value: singularValues[singularValues.length - 1],
      });

      // The solution is the last column of V (corresponding to smallest singular value)
      const lastColumnIndex = V.columns - 1;
      const h: number[] = [];
      for (let i = 0; i < V.rows; i++) {
        h.push(V.get(i, lastColumnIndex));
      }

      console.log('🔧 [CALIBRATION] Homography vector h:', h);

      // Reshape into 3x3 homography matrix
      // Ensure all values are defined (h should have exactly 9 elements from SVD)
      if (h.length !== 9) {
        console.error('Invalid homography vector length:', h.length);
        return null;
      }

      H = [
        [h[0]!, h[1]!, h[2]!],
        [h[3]!, h[4]!, h[5]!],
        [h[6]!, h[7]!, h[8]!],
      ];

      // Normalize so that H[2][2] = 1
      scale = H[2]?.[2];
      console.log('🔧 [CALIBRATION] H[2][2] scale value:', scale);

      if (!scale || Math.abs(scale) < 1e-10) {
        console.error(
          'Invalid homography matrix - scale value too small:',
          scale
        );
        console.error('Full H matrix before normalization:', H);
        return null;
      }
    } catch (error) {
      console.error('Error during SVD computation:', error);
      return null;
    }

    // Create properly typed result matrix
    const result: number[][] = [];
    for (let i = 0; i < 3; i++) {
      result[i] = [];
      for (let j = 0; j < 3; j++) {
        const row = H[i];
        const value = row ? row[j] : undefined;
        if (typeof value === 'number' && scale) {
          result[i]![j] = value / scale;
        } else {
          result[i]![j] = 0;
        }
      }
    }

    console.log('🔧 [CALIBRATION] Final normalized homography matrix:', result);
    return result;
  }

  /**
   * Calculate inverse of a 3x3 matrix
   */
  function invertMatrix3x3(matrix: number[][]): number[][] | null {
    try {
      // Use the inverse function from ml-matrix
      const m = new Matrix(matrix);
      const inv = inverse(m);
      return inv.to2DArray();
    } catch (error) {
      console.error('Failed to invert matrix:', error);
      return null;
    }
  }

  /**
   * Apply homography transformation to a point
   */
  function applyHomography(point: Point2D, H: number[][]): Point2D {
    const x = point.x;
    const y = point.y;

    // Apply homography: [x', y', w'] = H * [x, y, 1]
    // We've already validated H structure above, so we can safely access elements
    const xp = H[0]![0]! * x + H[0]![1]! * y + H[0]![2]!;
    const yp = H[1]![0]! * x + H[1]![1]! * y + H[1]![2]!;
    const wp = H[2]![0]! * x + H[2]![1]! * y + H[2]![2]!;

    // Convert from homogeneous to Cartesian coordinates
    if (Math.abs(wp) < 1e-10) {
      console.warn('Division by near-zero in homography transformation');
      return { x: 0, y: 0 };
    }

    return {
      x: xp / wp,
      y: yp / wp,
    };
  }

  /**
   * Get world coordinates for a calibration point
   */
  function getWorldCoordinates(pointId: string): Point3D {
    const { length, width, serviceLineDistance } = courtDimensions.value;
    const halfLength = length / 2;
    const halfWidth = width / 2;

    const worldPoints: Record<string, Point3D> = {
      // Singles court corners
      'corner-tl': { x: -halfWidth, y: halfLength, z: 0 },
      'corner-tr': { x: halfWidth, y: halfLength, z: 0 },
      'corner-bl': { x: -halfWidth, y: -halfLength, z: 0 },
      'corner-br': { x: halfWidth, y: -halfLength, z: 0 },

      // Net points
      'net-left': { x: -halfWidth, y: 0, z: 0 },
      'net-right': { x: halfWidth, y: 0, z: 0 },
      'net-center': { x: 0, y: 0, z: 0 },

      // Service lines
      'service-left': { x: -halfWidth, y: serviceLineDistance, z: 0 },
      'service-right': { x: halfWidth, y: serviceLineDistance, z: 0 },
      'service-center-left': { x: 0, y: serviceLineDistance, z: 0 },
      'service-center-right': { x: 0, y: -serviceLineDistance, z: 0 },

      // Baseline points
      'baseline-left': { x: -halfWidth, y: -halfLength, z: 0 },
      'baseline-right': { x: halfWidth, y: -halfLength, z: 0 },
      'baseline-center': { x: 0, y: -halfLength, z: 0 },

      // Mid-court points
      'sideline-mid-left': { x: -halfWidth, y: halfLength / 2, z: 0 },
      'sideline-mid-right': { x: halfWidth, y: halfLength / 2, z: 0 },
    };

    return worldPoints[pointId] || { x: 0, y: 0, z: 0 };
  }

  /**
   * Add a calibration point with validation
   */
  function addCalibrationPoint(
    pointId: string,
    imageCoord: Point2D,
    confidence: number = 1.0
  ): boolean {
    const worldCoord = getWorldCoordinates(pointId);

    // Check for duplicates
    const existingIndex = calibrationPoints.value.findIndex(
      (p) => p.id === pointId
    );
    if (existingIndex >= 0) {
      calibrationPoints.value[existingIndex] = {
        id: pointId,
        type: getPointType(pointId),
        image: imageCoord,
        world: worldCoord,
        confidence,
      };
    } else {
      calibrationPoints.value.push({
        id: pointId,
        type: getPointType(pointId),
        image: imageCoord,
        world: worldCoord,
        confidence,
      });
    }

    return true;
  }

  /**
   * Get point type from ID
   */
  function getPointType(pointId: string): CalibrationPoint['type'] {
    if (pointId.includes('corner')) return 'corner';
    if (pointId.includes('service')) return 'service';
    if (pointId.includes('net')) return 'net';
    if (pointId.includes('baseline')) return 'baseline';
    if (pointId.includes('sideline')) return 'sideline';
    if (pointId.includes('center')) return 'center';
    return 'corner';
  }

  /**
   * Get human-readable description for a calibration point
   */
  function getPointDescription(pointId: string): string {
    const descriptions: Record<string, string> = {
      // Corner points
      'corner-tl': 'Top Left Corner',
      'corner-tr': 'Top Right Corner',
      'corner-bl': 'Bottom Left Corner',
      'corner-br': 'Bottom Right Corner',

      // Net points
      'net-left': 'Net Left Edge',
      'net-right': 'Net Right Edge',
      'net-center': 'Net Center',

      // Service line points
      'service-left': 'Service Line Left',
      'service-right': 'Service Line Right',
      'service-center-left': 'Service Center Line (Near)',
      'service-center-right': 'Service Center Line (Far)',

      // Baseline points
      'baseline-left': 'Baseline Left',
      'baseline-right': 'Baseline Right',
      'baseline-center': 'Baseline Center',

      // Sideline points
      'sideline-mid-left': 'Left Sideline Midpoint',
      'sideline-mid-right': 'Right Sideline Midpoint',
    };

    return descriptions[pointId] || pointId;
  }

  /**
   * Get helpful hint for selecting a calibration point
   */
  function getPointHint(pointId: string): string {
    const hints: Record<string, string> = {
      // Corner points
      'corner-tl':
        'Click on the top-left corner where the baseline meets the sideline',
      'corner-tr':
        'Click on the top-right corner where the baseline meets the sideline',
      'corner-bl':
        'Click on the bottom-left corner where the baseline meets the sideline',
      'corner-br':
        'Click on the bottom-right corner where the baseline meets the sideline',

      // Net points
      'net-left': 'Click where the net meets the left sideline',
      'net-right': 'Click where the net meets the right sideline',
      'net-center':
        'Click on the center of the net (where center line meets net)',

      // Service line points
      'service-left': 'Click where the service line meets the left sideline',
      'service-right': 'Click where the service line meets the right sideline',
      'service-center-left':
        'Click where the center line meets the near service line',
      'service-center-right':
        'Click where the center line meets the far service line',

      // Baseline points
      'baseline-left': 'Click where the baseline meets the left sideline',
      'baseline-right': 'Click where the baseline meets the right sideline',
      'baseline-center': 'Click on the center of the baseline',

      // Sideline points
      'sideline-mid-left': 'Click on the midpoint of the left sideline',
      'sideline-mid-right': 'Click on the midpoint of the right sideline',
    };

    return hints[pointId] || 'Click on the specified court marking';
  }

  /**
   * Suggest next calibration point
   */
  function suggestNextPoint(): string | null {
    const collectedIds = new Set(calibrationPoints.value.map((p) => p.id));

    // Check required points first
    for (const pointId of currentMode.value.requiredPoints) {
      if (!collectedIds.has(pointId)) {
        return pointId;
      }
    }

    // Then optional points
    for (const pointId of currentMode.value.optionalPoints) {
      if (!collectedIds.has(pointId)) {
        return pointId;
      }
    }

    return null;
  }

  /**
   * Set calibration mode
   */
  function setCalibrationMode(modeId: string) {
    const mode = CALIBRATION_MODES.find((m) => m.id === modeId);
    if (mode) {
      currentMode.value = mode;
      resetCalibration();
    }
  }

  /**
   * RANSAC-based calibration for robustness
   */
  function calibrateWithRANSAC(): CalibrationResult | null {
    const iterations = 1000;
    const threshold = 50; // Reasonable pixel threshold for accurate calibration

    console.log('🔧 [CALIBRATION] Starting RANSAC with points:', {
      totalPoints: calibrationPoints.value.length,
      points: calibrationPoints.value.map((p) => ({
        id: p.id,
        image: p.image,
        world: p.world,
      })),
      threshold: `${threshold}px`,
      iterations,
    });

    if (calibrationPoints.value.length < currentMode.value.minPoints) {
      validationErrors.value.push(
        `Need at least ${currentMode.value.minPoints} points for ${currentMode.value.name}`
      );
      return null;
    }

    let bestResult: CalibrationResult | null = null;
    let bestInlierCount = 0;

    for (let iter = 0; iter < iterations; iter++) {
      // Randomly select 4 points
      const sample = getRandomSample(calibrationPoints.value, 4);

      // Calculate homography from sample
      const H = calculateHomography(sample);
      if (!H) continue;

      // Calculate inverse
      const Hinv = invertMatrix3x3(H);
      if (!Hinv) continue;

      // Count inliers
      const { inliers, outliers, totalError } = evaluateHomography(
        H,
        calibrationPoints.value,
        threshold
      );

      if (inliers.length > bestInlierCount) {
        bestInlierCount = inliers.length;
        bestResult = {
          homographyMatrix: H,
          inverseHomographyMatrix: Hinv,
          error: inliers.length > 0 ? totalError / inliers.length : Infinity,
          confidence: inliers.length / calibrationPoints.value.length,
          inliers,
          outliers,
        };
      }
    }

    console.log('🔧 [CALIBRATION] RANSAC initial result:', {
      bestInlierCount,
      totalPoints: calibrationPoints.value.length,
      inliers: bestResult?.inliers.length,
      outliers: bestResult?.outliers.length,
    });

    // Refine using all inliers OR all points if we have good coverage
    if (bestResult) {
      // If we have at least 60% inliers, use them for refinement
      // Otherwise, use all points (might have clicking inaccuracy but better than failing)
      const pointsForRefinement =
        bestResult.inliers.length >= calibrationPoints.value.length * 0.6
          ? bestResult.inliers
          : calibrationPoints.value;

      console.log('🔧 [CALIBRATION] Refining with points:', {
        refinementPoints: pointsForRefinement.length,
        usingAllPoints: pointsForRefinement === calibrationPoints.value,
      });

      const refinedH = calculateHomography(pointsForRefinement);
      if (refinedH) {
        const refinedHinv = invertMatrix3x3(refinedH);
        if (refinedHinv) {
          const { inliers, outliers, totalError } = evaluateHomography(
            refinedH,
            calibrationPoints.value,
            threshold
          );

          bestResult = {
            ...bestResult,
            homographyMatrix: refinedH,
            inverseHomographyMatrix: refinedHinv,
            error: inliers.length > 0 ? totalError / inliers.length : Infinity,
            confidence: inliers.length / calibrationPoints.value.length,
            inliers,
            outliers,
          };

          console.log('🔧 [CALIBRATION] Final refined result:', {
            error: bestResult.error,
            confidence: bestResult.confidence,
            inliers: bestResult.inliers.length,
            outliers: bestResult.outliers.length,
          });
        }
      }
    }

    return bestResult;
  }

  /**
   * Evaluate homography quality
   */
  function evaluateHomography(
    H: number[][],
    points: CalibrationPoint[],
    threshold: number
  ): {
    inliers: CalibrationPoint[];
    outliers: CalibrationPoint[];
    totalError: number;
  } {
    const inliers: CalibrationPoint[] = [];
    const outliers: CalibrationPoint[] = [];
    let totalError = 0;

    // We need the inverse homography to project world points to image space
    const Hinv = invertMatrix3x3(H);
    if (!Hinv) {
      console.error(
        '🔧 [CALIBRATION] Failed to invert homography for evaluation'
      );
      return { inliers: [], outliers: points, totalError: Infinity };
    }

    for (const point of points) {
      // Project world point to image space using inverse homography
      // Use only x,y from world coordinates (ignore z)
      const worldPoint2D = { x: point.world.x, y: point.world.y };
      const projectedImage = applyHomography(worldPoint2D, Hinv);

      // Calculate error in pixel space
      const error = Math.sqrt(
        Math.pow(projectedImage.x - point.image.x, 2) +
          Math.pow(projectedImage.y - point.image.y, 2)
      );

      if (error < threshold) {
        inliers.push(point);
        totalError += error;
      } else {
        outliers.push(point);
      }

      // Enhanced debug logging
      if (points.indexOf(point) < 5) {
        console.log(`🔧 [CALIBRATION] Point ${point.id}:`, {
          world: worldPoint2D,
          actualImage: point.image,
          projectedImage: projectedImage,
          error: error.toFixed(2),
          threshold: threshold,
          isInlier: error < threshold,
        });
      }
    }

    return { inliers, outliers, totalError };
  }

  /**
   * Get random sample of points
   */
  function getRandomSample<T>(array: T[], size: number): T[] {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, size);
  }

  /**
   * Perform calibration with RANSAC
   */
  function calibrate(cameraSettings?: CameraSettings): boolean {
    validationErrors.value = [];

    // Use RANSAC for robust calibration
    const result = calibrateWithRANSAC();

    if (!result) {
      validationErrors.value.push(
        'Calibration failed - unable to compute homography'
      );
      return false;
    }

    // Check calibration quality
    if (result.confidence < 0.5) {
      validationErrors.value.push(
        `Low calibration confidence: ${(result.confidence * 100).toFixed(1)}%`
      );
    }

    if (result.error > 0.1) {
      validationErrors.value.push(
        `High calibration error: ${(result.error * 100).toFixed(1)}cm`
      );
    }

    calibrationResult.value = result;
    homographyMatrix.value = result.homographyMatrix;
    inverseHomographyMatrix.value = result.inverseHomographyMatrix;
    isCalibrated.value = true;
    lastCalibrationTime.value = Date.now();
    calibrationError.value = result.error;

    console.log('Enhanced calibration complete:', {
      mode: currentMode.value.name,
      points: calibrationPoints.value.length,
      inliers: result.inliers.length,
      outliers: result.outliers.length,
      error: `${(result.error * 100).toFixed(1)}cm`,
      confidence: `${(result.confidence * 100).toFixed(1)}%`,
    });

    return true;
  }

  /**
   * Transform a 2D image point to 3D world coordinates
   * Enhanced with camera settings for better height estimation
   */
  function transformToWorld(
    imagePoint: Point2D,
    z: number = 0,
    cameraSettings?: CameraSettings
  ): Point3D {
    if (!isCalibrated.value || !calibrationResult.value) {
      console.warn('Camera not calibrated');
      return { x: 0, y: 0, z: 0 };
    }

    const worldPoint2D = applyHomography(
      imagePoint,
      calibrationResult.value.homographyMatrix
    );

    // If camera settings available, refine z-coordinate estimation
    let refinedZ = z;
    if (cameraSettings && z > 0) {
      // Use camera height to better estimate object heights
      // This is a simplified model - in production, use full 3D projection
      const heightRatio = z / cameraSettings.height;
      refinedZ = z * (1 + heightRatio * 0.1); // Adjust based on perspective
    }

    return {
      x: worldPoint2D.x,
      y: worldPoint2D.y,
      z: refinedZ,
    };
  }

  /**
   * Transform a 3D world point to 2D image coordinates
   */
  function transformToImage(worldPoint: Point3D): Point2D {
    if (!isCalibrated.value || !calibrationResult.value) {
      console.warn('Camera not calibrated');
      return { x: 0, y: 0 };
    }

    const point2D = { x: worldPoint.x, y: worldPoint.y };
    return applyHomography(
      point2D,
      calibrationResult.value.inverseHomographyMatrix
    );
  }

  /**
   * Transform MediaPipe landmarks to world coordinates
   */
  function transformLandmarksToWorld(
    landmarks: any[],
    worldLandmarks?: any[]
  ): Point3D[] {
    if (!isCalibrated.value || !calibrationResult.value) {
      console.warn('Camera not calibrated');
      return [];
    }

    const transformedLandmarks: Point3D[] = [];

    // Key landmark indices for badminton
    const FOOT_INDICES = [27, 28, 31, 32]; // Ankles and feet
    const HIP_INDICES = [23, 24];

    for (let i = 0; i < landmarks.length; i++) {
      const landmark = landmarks[i];

      // Check if this is a foot landmark (should be on court surface)
      const isFoot = FOOT_INDICES.includes(i);

      if (isFoot) {
        // For feet, use homography directly (they're on the court)
        const worldPoint = transformToWorld(
          { x: landmark.x, y: landmark.y },
          0 // Feet are on the ground
        );
        transformedLandmarks.push(worldPoint);
      } else {
        // For other body parts, estimate height based on MediaPipe's world landmarks
        let estimatedZ = 0;

        if (worldLandmarks && worldLandmarks[i]) {
          // Use MediaPipe's depth estimation, scaled appropriately
          // This is a simplified approach - in production, we'd use more sophisticated methods
          estimatedZ = Math.abs(worldLandmarks[i].z) * 2; // Scale factor to be tuned
        } else {
          // Fallback: estimate based on typical body proportions
          if (i < 11) {
            // Head and upper body landmarks
            estimatedZ = 1.5; // Approximate height in meters
          } else if (HIP_INDICES.includes(i)) {
            // Hip landmarks
            estimatedZ = 0.9;
          } else {
            // Other landmarks
            estimatedZ = 0.7;
          }
        }

        const worldPoint = transformToWorld(
          { x: landmark.x, y: landmark.y },
          estimatedZ
        );
        transformedLandmarks.push(worldPoint);
      }
    }

    return transformedLandmarks;
  }

  /**
   * Reset calibration
   */
  function resetCalibration() {
    isCalibrated.value = false;
    calibrationPoints.value = [];
    homographyMatrix.value = null;
    inverseHomographyMatrix.value = null;
    calibrationError.value = 0;
    lastCalibrationTime.value = null;
  }

  /**
   * Save calibration data to JSON string
   */
  function saveCalibration(): string {
    const data: CameraCalibrationState = {
      isCalibrated: isCalibrated.value,
      calibrationPoints: calibrationPoints.value,
      calibrationResult: calibrationResult.value,
      homographyMatrix: calibrationResult.value?.homographyMatrix || null,
      inverseHomographyMatrix:
        calibrationResult.value?.inverseHomographyMatrix || null,
      courtDimensions: courtDimensions.value,
      calibrationError: calibrationError.value,
      lastCalibrationTime: lastCalibrationTime.value,
      currentModeId: currentMode.value.id,
    };

    return JSON.stringify(data);
  }

  /**
   * Load calibration data from JSON string
   */
  function loadCalibration(dataString: string): boolean {
    try {
      const data: CameraCalibrationState = JSON.parse(dataString);

      isCalibrated.value = data.isCalibrated;
      calibrationPoints.value = data.calibrationPoints;
      calibrationResult.value = data.calibrationResult || {
        homographyMatrix: data.homographyMatrix!,
        inverseHomographyMatrix: data.inverseHomographyMatrix!,
        error: data.calibrationError,
        confidence: 1,
        inliers: data.calibrationPoints,
        outliers: [],
      };
      homographyMatrix.value = data.homographyMatrix;
      inverseHomographyMatrix.value = data.inverseHomographyMatrix;
      courtDimensions.value = data.courtDimensions;
      calibrationError.value = data.calibrationError;
      lastCalibrationTime.value = data.lastCalibrationTime;

      if (data.currentModeId) {
        const mode = CALIBRATION_MODES.find((m) => m.id === data.currentModeId);
        if (mode) currentMode.value = mode;
      }

      return true;
    } catch (error) {
      console.error('Failed to load calibration data:', error);
      return false;
    }
  }

  /**
   * Validate calibration by checking reprojection error
   */
  function validateCalibration(): number {
    if (!isCalibrated.value || !calibrationResult.value) {
      return Infinity;
    }

    return calibrationResult.value.error;
  }

  /**
   * Set court dimensions
   */
  function setCourtDimensions(dimensions: Partial<CourtDimensions>) {
    // Merge with existing dimensions to maintain backward compatibility
    courtDimensions.value = {
      ...courtDimensions.value,
      ...dimensions,
      // Ensure all required fields have defaults
      serviceLineDistance:
        dimensions.serviceLineDistance ??
        courtDimensions.value.serviceLineDistance,
      centerLineLength:
        dimensions.centerLineLength ?? courtDimensions.value.centerLineLength,
      netHeight: dimensions.netHeight ?? courtDimensions.value.netHeight,
    };
  }

  /**
   * Calibration quality computed property
   */
  const calibrationQuality = computed(() => {
    if (!calibrationResult.value) {
      return { level: 'none', color: 'gray', message: 'Not calibrated' };
    }

    const error = calibrationResult.value.error;
    const confidence = calibrationResult.value.confidence;

    if (error < 0.01 && confidence > 0.9) {
      return {
        level: 'excellent',
        color: 'green',
        message: 'Sub-centimeter accuracy',
      };
    } else if (error < 0.05 && confidence > 0.7) {
      return { level: 'good', color: 'blue', message: 'Good accuracy (< 5cm)' };
    } else if (error < 0.1 && confidence > 0.5) {
      return {
        level: 'moderate',
        color: 'yellow',
        message: 'Moderate accuracy (< 10cm)',
      };
    } else {
      return {
        level: 'poor',
        color: 'red',
        message: 'Poor accuracy - recalibrate',
      };
    }
  });

  return {
    // State
    isCalibrated,
    calibrationPoints,
    calibrationResult,
    courtDimensions,
    calibrationError,
    currentMode,
    validationErrors,
    calibrationQuality,

    // Methods
    addCalibrationPoint,
    calibrate,
    calibrateWithRANSAC,
    transformToWorld,
    transformToImage,
    transformLandmarksToWorld,
    resetCalibration,
    saveCalibration,
    loadCalibration,
    validateCalibration,
    setCourtDimensions,
    setCalibrationMode,
    suggestNextPoint,
    getWorldCoordinates,
    getPointDescription,
    getPointHint,

    // Backward compatibility (will be removed in future)
    homographyMatrix,
    setCalibrationPoints: (points: CalibrationPoint[]) => {
      // Convert old format to new format
      calibrationPoints.value = points;
    },
  };
}
