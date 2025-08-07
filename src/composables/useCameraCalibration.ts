/**
 * useCameraCalibration.ts
 * Camera calibration composable for perspective correction and coordinate transformation
 * Uses homography-based calibration to map 2D image points to 3D world coordinates
 */

import { ref, type Ref } from 'vue';
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
  image: Point2D; // Point in image coordinates (pixels or normalized)
  world: Point3D; // Point in world coordinates (meters)
}

export interface CourtDimensions {
  length: number; // meters (13.4m for badminton)
  width: number; // meters (6.1m for badminton)
}

export interface CameraCalibrationState {
  isCalibrated: boolean;
  calibrationPoints: CalibrationPoint[];
  homographyMatrix: number[][] | null;
  inverseHomographyMatrix: number[][] | null;
  courtDimensions: CourtDimensions;
  calibrationError: number;
  lastCalibrationTime: number | null;
}

export interface UseCameraCalibration {
  // State
  isCalibrated: Ref<boolean>;
  calibrationPoints: Ref<CalibrationPoint[]>;
  homographyMatrix: Ref<number[][] | null>;
  courtDimensions: Ref<CourtDimensions>;
  calibrationError: Ref<number>;

  // Methods
  setCalibrationPoints: (points: CalibrationPoint[]) => void;
  calibrate: () => boolean;
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
  setCourtDimensions: (dimensions: CourtDimensions) => void;
}

// Standard badminton court dimensions
const BADMINTON_COURT = {
  length: 13.4, // meters
  width: 6.1, // meters
  singles_width: 5.18, // meters
};

// Tennis court dimensions for reference
const TENNIS_COURT = {
  length: 23.77, // meters
  width: 8.23, // meters (singles)
};

export function useCameraCalibration(): UseCameraCalibration {
  // State
  const isCalibrated = ref(false);
  const calibrationPoints = ref<CalibrationPoint[]>([]);
  const homographyMatrix = ref<number[][] | null>(null);
  const inverseHomographyMatrix = ref<number[][] | null>(null);
  const courtDimensions = ref<CourtDimensions>({
    length: BADMINTON_COURT.length,
    width: BADMINTON_COURT.width,
  });
  const calibrationError = ref(0);
  const lastCalibrationTime = ref<number | null>(null);

  /**
   * Calculate homography matrix using Direct Linear Transformation (DLT)
   * Maps points from image plane to world plane (court surface)
   */
  function calculateHomography(points: CalibrationPoint[]): number[][] | null {
    if (points.length < 4) {
      console.error('At least 4 calibration points are required');
      return null;
    }

    // Build the matrix A for DLT algorithm
    const rows: number[][] = [];

    for (const point of points) {
      const { x: xi, y: yi } = point.image;
      const { x: xw, y: yw } = point.world;

      // Each point contributes 2 rows to matrix A
      rows.push([xw, yw, 1, 0, 0, 0, -xi * xw, -xi * yw, -xi]);
      rows.push([0, 0, 0, xw, yw, 1, -yi * xw, -yi * yw, -yi]);
    }

    const A = new Matrix(rows);

    // Solve using SVD (Singular Value Decomposition)
    const svd = new SVD(A);
    const V = svd.rightSingularVectors;

    // The solution is the last column of V (corresponding to smallest singular value)
    const lastColumnIndex = V.columns - 1;
    const h: number[] = [];
    for (let i = 0; i < V.rows; i++) {
      h.push(V.get(i, lastColumnIndex));
    }

    // Reshape into 3x3 homography matrix
    const H = [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], h[8]],
    ];

    // Normalize so that H[2][2] = 1
    const scale = H[2]?.[2];
    if (!scale || Math.abs(scale) < 1e-10) {
      console.error('Invalid homography matrix');
      return null;
    }

    // Create properly typed result matrix
    const result: number[][] = [];
    for (let i = 0; i < 3; i++) {
      result[i] = [];
      for (let j = 0; j < 3; j++) {
        const row = H[i];
        const value = row ? row[j] : undefined;
        if (typeof value === 'number') {
          result[i]![j] = value / scale;
        } else {
          result[i]![j] = 0;
        }
      }
    }

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
   * Set calibration points (4 corners of the court)
   */
  function setCalibrationPoints(points: CalibrationPoint[]) {
    if (points.length !== 4) {
      console.error('Exactly 4 calibration points are required');
      return;
    }
    calibrationPoints.value = points;
  }

  /**
   * Perform calibration using the set calibration points
   */
  function calibrate(): boolean {
    if (calibrationPoints.value.length !== 4) {
      console.error('Calibration requires exactly 4 points');
      return false;
    }

    // Calculate homography matrix
    const H = calculateHomography(calibrationPoints.value);
    if (!H) {
      console.error('Failed to calculate homography matrix');
      return false;
    }

    // Calculate inverse homography for world-to-image transformation
    const Hinv = invertMatrix3x3(H);
    if (!Hinv) {
      console.error('Failed to calculate inverse homography matrix');
      return false;
    }

    homographyMatrix.value = H;
    inverseHomographyMatrix.value = Hinv;
    isCalibrated.value = true;
    lastCalibrationTime.value = Date.now();

    // Validate calibration and calculate error
    const error = validateCalibration();
    calibrationError.value = error;

    console.log(
      'Calibration successful. Reprojection error:',
      error.toFixed(3),
      'meters'
    );

    return true;
  }

  /**
   * Transform a 2D image point to 3D world coordinates
   * For points on the court surface (z=0), use homography
   * For points above the court, estimate z based on player height
   */
  function transformToWorld(imagePoint: Point2D, z: number = 0): Point3D {
    if (!isCalibrated.value || !homographyMatrix.value) {
      console.warn('Camera not calibrated');
      return { x: 0, y: 0, z: 0 };
    }

    // Apply homography to get world coordinates on court plane
    const worldPoint2D = applyHomography(imagePoint, homographyMatrix.value);

    return {
      x: worldPoint2D.x,
      y: worldPoint2D.y,
      z: z, // Height above court
    };
  }

  /**
   * Transform a 3D world point to 2D image coordinates
   */
  function transformToImage(worldPoint: Point3D): Point2D {
    if (!isCalibrated.value || !inverseHomographyMatrix.value) {
      console.warn('Camera not calibrated');
      return { x: 0, y: 0 };
    }

    // For now, ignore z-coordinate and project onto court plane
    // In a full implementation, we would use the camera matrix
    const point2D = { x: worldPoint.x, y: worldPoint.y };

    return applyHomography(point2D, inverseHomographyMatrix.value);
  }

  /**
   * Transform MediaPipe landmarks to world coordinates
   * This is the main integration point with the pose detection system
   */
  function transformLandmarksToWorld(
    landmarks: any[],
    worldLandmarks?: any[]
  ): Point3D[] {
    if (!isCalibrated.value || !homographyMatrix.value) {
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
      homographyMatrix: homographyMatrix.value,
      inverseHomographyMatrix: inverseHomographyMatrix.value,
      courtDimensions: courtDimensions.value,
      calibrationError: calibrationError.value,
      lastCalibrationTime: lastCalibrationTime.value,
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
      homographyMatrix.value = data.homographyMatrix;
      inverseHomographyMatrix.value = data.inverseHomographyMatrix;
      courtDimensions.value = data.courtDimensions;
      calibrationError.value = data.calibrationError;
      lastCalibrationTime.value = data.lastCalibrationTime;

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
    if (
      !isCalibrated.value ||
      !homographyMatrix.value ||
      !inverseHomographyMatrix.value
    ) {
      return Infinity;
    }

    let totalError = 0;
    let count = 0;

    for (const point of calibrationPoints.value) {
      // Transform image point to world
      const worldPoint = transformToWorld(point.image);

      // Calculate error in world coordinates (meters)
      const dx = worldPoint.x - point.world.x;
      const dy = worldPoint.y - point.world.y;
      const error = Math.sqrt(dx * dx + dy * dy);

      totalError += error;
      count++;
    }

    return count > 0 ? totalError / count : Infinity;
  }

  /**
   * Set court dimensions
   */
  function setCourtDimensions(dimensions: CourtDimensions) {
    courtDimensions.value = dimensions;
  }

  return {
    // State
    isCalibrated,
    calibrationPoints,
    homographyMatrix,
    courtDimensions,
    calibrationError,

    // Methods
    setCalibrationPoints,
    calibrate,
    transformToWorld,
    transformToImage,
    transformLandmarksToWorld,
    resetCalibration,
    saveCalibration,
    loadCalibration,
    validateCalibration,
    setCourtDimensions,
  };
}
