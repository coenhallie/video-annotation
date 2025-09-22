/**
 * useSpeedCalculator.ts
 * Enhanced speed calculator with comprehensive metrics including center of mass calculation
 * and all properties required by visualization components.
 * Now integrated with camera calibration for accurate world coordinate transformations.
 */
import { ref, computed, type Ref } from 'vue';
import { useCameraCalibration, type Point3D } from './useCameraCalibration';

const DEFAULT_COURT_WIDTH = 6.1;
const DEFAULT_COURT_LENGTH = 13.4;
const MIN_MOVEMENT_THRESHOLD = 1e-3;

export interface SpeedSample {
  frame: number;
  time: number; // seconds
  value: number; // speed in chosen units (e.g., px/s)
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface CalibrationSettings {
  isCalibrated: boolean;
  useHeightCalibration: boolean;
  useCourtCalibration: boolean;
  playerHeight: number; // cm
  courtLength: number; // meters
  pixelsPerMeter: number;
  calibrationAccuracy: number; // percentage
  referencePoints: Array<{ x: number; y: number; realWorldDistance: number }>;
}

export interface ComprehensiveSpeedMetrics {
  isValid: boolean;
  speed: number; // overall speed
  generalMovingSpeed: number; // horizontal speed
  rightFootSpeed: number;
  centerOfGravityHeight: number;
  velocity: Vector3D;
  centerOfMass: Vector3D;
  centerOfMassNormalized: Vector2D;
  centerOfGravity: Vector3D; // Add full center of gravity coordinates
  centerOfGravityNormalized: Vector2D; // Add normalized center of gravity coordinates
  currentSpeed: number;
  averageSpeed: number;
  samples: number;
  scalingFactor: number; // Add scaling factor for UI display
}

export interface UseSpeedCalculatorOptions {
  smoothingWindow?: number; // number of samples for moving average
  canvasWidth?: number; // actual video width in pixels
  canvasHeight?: number; // actual video height in pixels
  videoWidth?: number; // actual video width in pixels (alias for canvasWidth)
  videoHeight?: number; // actual video height in pixels (alias for canvasHeight)
}

export interface UseSpeedCalculator {
  currentSpeed: Ref<number>;
  averageSpeed: Ref<number>;
  samples: Ref<SpeedSample[]>;
  comprehensiveMetrics: Ref<ComprehensiveSpeedMetrics>;
  calibrationSettings: Ref<CalibrationSettings>;
  speedMetrics: Ref<ComprehensiveSpeedMetrics>;
  cameraCalibration: ReturnType<typeof useCameraCalibration>;
  reset: () => void;
  pushSample: (frame: number, timeSec: number, speedValue: number) => void;
  updateWithLandmarks: (
    frame: number,
    timeSec: number,
    landmarks: Landmark[],
    worldLandmarks?: Landmark[]
  ) => void;
  startCourtCalibration: () => void;
  resetCalibration: () => void;
  setPlayerHeight: (height: number) => void;
  setCourtLength: (length: number) => void;
  updateVideoDimensions: (width: number, height: number) => void;
  autoCalibrateBadminton: () => void;
  setCameraCalibrated: (calibrated: boolean) => void;
}

// MediaPipe pose landmark indices
const POSE_LANDMARKS = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

export function useSpeedCalculator(
  options: UseSpeedCalculatorOptions = {}
): UseSpeedCalculator {
  const smoothingWindow = Math.max(1, options.smoothingWindow ?? 5);
  // Use actual video dimensions, with fallback to common HD resolution
  const canvasWidth = options.videoWidth ?? options.canvasWidth ?? 1920;
  const canvasHeight = options.videoHeight ?? options.canvasHeight ?? 1080;

  // Initialize camera calibration
  const cameraCalibration = useCameraCalibration();

  const samples = ref<SpeedSample[]>([]);
  const currentSpeed = ref(0);
  const previousLandmarks = ref<Landmark[]>([]);
  const previousWorldLandmarks = ref<Landmark[]>([]);
  const previousTime = ref(0);

  const averageSpeed = computed(() => {
    if (samples.value.length === 0) return 0;
    const sum = samples.value.reduce((acc, s) => acc + s.value, 0);
    return sum / samples.value.length;
  });

  const comprehensiveMetrics = ref<ComprehensiveSpeedMetrics>({
    isValid: false,
    speed: 0,
    generalMovingSpeed: 0,
    rightFootSpeed: 0,
    centerOfGravityHeight: 0,
    velocity: { x: 0, y: 0, z: 0 },
    centerOfMass: { x: 0, y: 0, z: 0 },
    centerOfMassNormalized: { x: 0, y: 0 },
    centerOfGravity: { x: 0, y: 0, z: 0 },
    centerOfGravityNormalized: { x: 0, y: 0 },
    currentSpeed: 0,
    averageSpeed: 0,
    samples: 0,
    scalingFactor: 1.0,
  });

  const calibrationSettings = ref<CalibrationSettings>({
    isCalibrated: false,
    useHeightCalibration: true,
    useCourtCalibration: false,
    playerHeight: 165, // cm (appropriate for 15-year-old)
    courtLength: 13.4, // meters (badminton court)
    pixelsPerMeter: 100, // default, will be calculated based on video dimensions
    calibrationAccuracy: 0,
    referencePoints: [],
  });

  function calculateCenterOfMass(landmarks: Landmark[]): Vector3D {
    if (landmarks.length === 0) {
      return { x: 0, y: 0, z: 0 };
    }

    // Use biomechanical weights for center of gravity calculation
    // Based on body segment mass distribution
    const bodySegments = [
      {
        indices: [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER],
        weight: 0.15,
      }, // Upper torso
      {
        indices: [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP],
        weight: 0.35,
      }, // Lower torso/pelvis
      {
        indices: [POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.RIGHT_KNEE],
        weight: 0.25,
      }, // Thighs
      {
        indices: [POSE_LANDMARKS.LEFT_ANKLE, POSE_LANDMARKS.RIGHT_ANKLE],
        weight: 0.25,
      }, // Lower legs
    ];

    let totalX = 0;
    let totalY = 0;
    let totalZ = 0;
    let totalWeight = 0;

    for (const segment of bodySegments) {
      let segmentX = 0;
      let segmentY = 0;
      let segmentZ = 0;
      let validLandmarks = 0;

      for (const index of segment.indices) {
        if (index < landmarks.length && landmarks[index]) {
          const landmark = landmarks[index];
          if (landmark.visibility === undefined || landmark.visibility > 0.5) {
            segmentX += landmark.x;
            segmentY += landmark.y;
            segmentZ += landmark.z || 0;
            validLandmarks++;
          }
        }
      }

      if (validLandmarks > 0) {
        // Average the landmarks in this segment
        segmentX /= validLandmarks;
        segmentY /= validLandmarks;
        segmentZ /= validLandmarks;

        // Apply biomechanical weight
        totalX += segmentX * segment.weight;
        totalY += segmentY * segment.weight;
        totalZ += segmentZ * segment.weight;
        totalWeight += segment.weight;
      }
    }

    if (totalWeight === 0) {
      // Fallback: use all available landmarks
      let totalX = 0;
      let totalY = 0;
      let totalZ = 0;
      let validCount = 0;

      for (const landmark of landmarks) {
        if (landmark.visibility === undefined || landmark.visibility > 0.5) {
          totalX += landmark.x;
          totalY += landmark.y;
          totalZ += landmark.z || 0;
          validCount++;
        }
      }

      if (validCount === 0) {
        return { x: 0, y: 0, z: 0 };
      }

      return {
        x: totalX / validCount,
        y: totalY / validCount,
        z: totalZ / validCount,
      };
    }

    return {
      x: totalX / totalWeight,
      y: totalY / totalWeight,
      z: totalZ / totalWeight,
    };
  }

  function calculateDistance3D(p1: Vector3D, p2: Vector3D): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    if (
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      !Number.isFinite(dz)
    ) {
      console.warn('⚠️ [SpeedCalculator] Invalid distance calculation', {
        p1,
        p2,
      });
      return 0;
    }
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return Number.isFinite(distance) ? distance : 0;
  }

  function calculateDistance2D(p1: Landmark, p2: Landmark): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return Number.isFinite(distance) ? distance : 0;
  }

  const getCourtDimensions = () => {
    const court = cameraCalibration.courtDimensions?.value as
      | { width?: number; length?: number }
      | undefined;
    return {
      width:
        court?.width && Number.isFinite(court.width)
          ? court.width
          : DEFAULT_COURT_WIDTH,
      length:
        court?.length && Number.isFinite(court.length)
          ? court.length
          : DEFAULT_COURT_LENGTH,
    };
  };

  const normalizedToCourtMeters = (vector: {
    x: number;
    y: number;
    z?: number;
  }): Vector3D => {
    const { width, length } = getCourtDimensions();
    return {
      x: vector.x * width - width / 2,
      y: vector.y * length - length / 2,
      z: vector.z ?? 0,
    };
  };

  // Convert normalized MediaPipe coordinates to pixel coordinates
  function normalizedToPixel(landmark: Landmark): { x: number; y: number } {
    return {
      x: landmark.x * canvasWidth,
      y: landmark.y * canvasHeight,
    };
  }

  // Convert pixel coordinates to real-world coordinates using calibration
  function pixelToRealWorld(pixelCoord: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    // If camera is calibrated, use homography transformation
    if (cameraCalibration.isCalibrated.value) {
      const normalizedPoint = {
        x: pixelCoord.x / canvasWidth,
        y: pixelCoord.y / canvasHeight,
      };
      const worldPoint = cameraCalibration.transformToWorld(normalizedPoint, 0);
      return {
        x: worldPoint.x,
        y: worldPoint.y,
      };
    }

    // Fallback to old scaling method if not calibrated
    const scalingFactor = getCalibrationScalingFactor();
    const basePixelsPerMeter = calibrationSettings.value.pixelsPerMeter;
    const effectivePixelsPerMeter = basePixelsPerMeter / scalingFactor;

    return {
      x: pixelCoord.x / effectivePixelsPerMeter,
      y: pixelCoord.y / effectivePixelsPerMeter,
    };
  }

  // Convert normalized coordinates directly to real-world coordinates
  function normalizedToRealWorld(landmark: Landmark): {
    x: number;
    y: number;
    z: number;
  } {
    // If camera is calibrated, use the calibration transformation
    if (cameraCalibration.isCalibrated.value) {
      const worldPoint = cameraCalibration.transformToWorld(
        { x: landmark.x, y: landmark.y },
        landmark.z || 0
      );

      if (
        worldPoint &&
        Number.isFinite(worldPoint.x) &&
        Number.isFinite(worldPoint.y) &&
        Number.isFinite(worldPoint.z ?? 0)
      ) {
        return {
          x: worldPoint.x,
          y: worldPoint.y,
          z: worldPoint.z ?? 0,
        };
      }

      console.warn(
        '⚠️ [SpeedCalculator] transformToWorld returned invalid value, using fallback conversion',
        { landmark, worldPoint }
      );
    }

    // Fallback to old method if not calibrated
    const pixelCoord = normalizedToPixel(landmark);
    const realWorldCoord = pixelToRealWorld(pixelCoord);

    return {
      x: realWorldCoord.x,
      y: realWorldCoord.y,
      z: (landmark.z || 0) * getCalibrationScalingFactor(),
    };
  }

  function calculateRightFootSpeed(
    currentLandmarks: Landmark[],
    prevLandmarks: Landmark[],
    deltaTime: number
  ): number {
    if (
      currentLandmarks.length <= POSE_LANDMARKS.RIGHT_FOOT_INDEX ||
      prevLandmarks.length <= POSE_LANDMARKS.RIGHT_FOOT_INDEX ||
      deltaTime <= 0
    ) {
      return 0;
    }

    const currentFoot = currentLandmarks[POSE_LANDMARKS.RIGHT_FOOT_INDEX];
    const prevFoot = prevLandmarks[POSE_LANDMARKS.RIGHT_FOOT_INDEX];

    if (
      !currentFoot ||
      !prevFoot ||
      (currentFoot.visibility !== undefined && currentFoot.visibility < 0.5) ||
      (prevFoot.visibility !== undefined && prevFoot.visibility < 0.5)
    ) {
      return 0;
    }

    // Convert normalized coordinates to real-world coordinates
    const currentFootReal = normalizedToRealWorld(currentFoot);
    const prevFootReal = normalizedToRealWorld(prevFoot);

    // Calculate distance in real-world units (meters)
    const dx = currentFootReal.x - prevFootReal.x;
    const dy = currentFootReal.y - prevFootReal.y;
    const dz = currentFootReal.z - prevFootReal.z;
    if (
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      !Number.isFinite(dz)
    ) {
      console.warn('⚠️ [SpeedCalculator] Right foot distance invalid', {
        currentFootReal,
        prevFootReal,
      });
      return 0;
    }
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!Number.isFinite(distance) || deltaTime <= 0) {
      return 0;
    }

    return distance / deltaTime;
  }

  function calculateGeneralMovingSpeed(
    currentCenterOfMass: Vector3D,
    prevCenterOfMass: Vector3D,
    deltaTime: number
  ): number {
    if (deltaTime <= 0) return 0;

    // Calculate horizontal movement in real-world coordinates
    // Note: currentCenterOfMass and prevCenterOfMass should already be in real-world units
    const dx = currentCenterOfMass.x - prevCenterOfMass.x;
    const dz = currentCenterOfMass.z - prevCenterOfMass.z;

    if (!Number.isFinite(dx) || !Number.isFinite(dz)) {
      console.warn('⚠️ [SpeedCalculator] Horizontal movement invalid', {
        currentCenterOfMass,
        prevCenterOfMass,
        dx,
        dz,
      });
      return 0;
    }

    // Calculate horizontal speed (excluding vertical movement)
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
    if (!Number.isFinite(horizontalDistance)) {
      return 0;
    }
    return horizontalDistance / deltaTime;
  }

  function reset() {
    samples.value = [];
    currentSpeed.value = 0;
    previousLandmarks.value = [];
    previousWorldLandmarks.value = [];
    previousTime.value = 0;
    comprehensiveMetrics.value = {
      isValid: false,
      speed: 0,
      generalMovingSpeed: 0,
      rightFootSpeed: 0,
      centerOfGravityHeight: 0,
      velocity: { x: 0, y: 0, z: 0 },
      centerOfMass: { x: 0, y: 0, z: 0 },
      centerOfMassNormalized: { x: 0, y: 0 },
      centerOfGravity: { x: 0, y: 0, z: 0 },
      centerOfGravityNormalized: { x: 0, y: 0 },
      currentSpeed: 0,
      averageSpeed: 0,
      samples: 0,
      scalingFactor: 1.0,
    };
  }

  function pushSample(frame: number, timeSec: number, speedValue: number) {
    const sanitizedSpeed = Number.isFinite(speedValue) ? speedValue : 0;

    currentSpeed.value = sanitizedSpeed;
    samples.value.push({ frame, time: timeSec, value: sanitizedSpeed });

    // apply moving window smoothing by trimming the array
    if (samples.value.length > smoothingWindow) {
      samples.value.splice(0, samples.value.length - smoothingWindow);
    }

    // Update basic metrics in comprehensive metrics
    comprehensiveMetrics.value.currentSpeed = sanitizedSpeed;
    comprehensiveMetrics.value.averageSpeed = averageSpeed.value;
    comprehensiveMetrics.value.samples = samples.value.length;
  }

  function updateWithLandmarks(
    frame: number,
    timeSec: number,
    landmarks: Landmark[],
    worldLandmarks?: Landmark[]
  ) {
    const sanitizeVector = (vector: Vector3D, label: string): Vector3D => {
      const sanitized = {
        x: Number.isFinite(vector.x) ? vector.x : 0,
        y: Number.isFinite(vector.y) ? vector.y : 0,
        z: Number.isFinite(vector.z) ? vector.z : 0,
      } as Vector3D;

      if (
        sanitized.x !== vector.x ||
        sanitized.y !== vector.y ||
        sanitized.z !== vector.z
      ) {
        console.warn('⚠️ [SpeedCalculator] Sanitized vector', {
          label,
          original: vector,
          sanitized,
        });
      }

      return sanitized;
    };

    // If camera is calibrated, use the calibration to transform landmarks
    let transformedWorldLandmarks: Point3D[] | undefined;
    if (cameraCalibration.isCalibrated.value && landmarks.length > 0) {
      transformedWorldLandmarks = cameraCalibration.transformLandmarksToWorld(
        landmarks,
        worldLandmarks
      );
    }

    // Calculate center of mass in normalized coordinates
    const currentCenterOfMass = calculateCenterOfMass(landmarks);
    const currentWorldCenterOfMass = worldLandmarks
      ? calculateCenterOfMass(worldLandmarks)
      : currentCenterOfMass;

    // Calculate center of gravity in normalized coordinates
    const currentCenterOfGravity = calculateCenterOfMass(landmarks);
    const currentWorldCenterOfGravity = worldLandmarks
      ? calculateCenterOfMass(worldLandmarks)
      : currentCenterOfGravity;

    // Convert normalized center of mass to real-world coordinates
    const currentCenterOfMassReal = sanitizeVector(
      normalizedToRealWorld(currentCenterOfMass),
      'currentCoMReal-normalized'
    );

    // Convert normalized center of gravity to real-world coordinates
    const currentCenterOfGravityReal = sanitizeVector(
      normalizedToRealWorld(currentCenterOfGravity),
      'currentCoGReal-normalized'
    );

    // Calculate normalized coordinates for visualization (keep original for UI)
    const centerOfMassNormalized: Vector2D = {
      x: Math.max(0, Math.min(1, currentCenterOfMass.x)),
      y: Math.max(0, Math.min(1, currentCenterOfMass.y)),
    };

    const centerOfGravityNormalized: Vector2D = {
      x: Math.max(0, Math.min(1, currentCenterOfGravity.x)),
      y: Math.max(0, Math.min(1, currentCenterOfGravity.y)),
    };

    let velocity: Vector3D = { x: 0, y: 0, z: 0 };
    let generalMovingSpeed = 0;
    let rightFootSpeed = 0;
    let overallSpeed = 0;

    // Calculate velocities and speeds if we have previous data
    if (previousLandmarks.value.length > 0 && previousTime.value > 0) {
      const deltaTime = Math.max(1e-6, timeSec - previousTime.value);
      const prevCenterOfMass = calculateCenterOfMass(previousLandmarks.value);
      const prevCenterOfMassReal = sanitizeVector(
        normalizedToRealWorld(prevCenterOfMass),
        'prevCoMReal-normalized'
      );

      // Use world landmarks if available, otherwise use converted normalized coordinates
      let currentCoMReal: Vector3D;
      let prevCoMReal: Vector3D;

      if (transformedWorldLandmarks && transformedWorldLandmarks.length > 0) {
        // Use calibrated world coordinates
        currentCoMReal = sanitizeVector(
          calculateCenterOfMass(transformedWorldLandmarks as any),
          'currentCoMReal-transformed'
        );

        // For previous frame, we need to transform those too
        const prevTransformed = cameraCalibration.isCalibrated.value
          ? cameraCalibration.transformLandmarksToWorld(
              previousLandmarks.value,
              previousWorldLandmarks.value
            )
          : null;

        if (prevTransformed && prevTransformed.length > 0) {
          prevCoMReal = sanitizeVector(
            calculateCenterOfMass(prevTransformed as any),
            'prevCoMReal-transformed'
          );
        } else {
          prevCoMReal = prevCenterOfMassReal;
        }

        console.log('🔧 [SPEED DEBUG] Using calibrated world coordinates:', {
          currentCoMReal,
          prevCoMReal,
          deltaTime,
          calibrated: true,
        });
      } else if (
        worldLandmarks &&
        worldLandmarks.length > 0 &&
        previousWorldLandmarks.value.length > 0
      ) {
        // Use MediaPipe world coordinates directly (already in meters)
        currentCoMReal = sanitizeVector(
          currentWorldCenterOfMass,
          'currentCoMReal-mediapipe'
        );
        prevCoMReal = sanitizeVector(
          calculateCenterOfMass(previousWorldLandmarks.value),
          'prevCoMReal-mediapipe'
        );

        console.log('🔧 [SPEED DEBUG] Using MediaPipe world coordinates:', {
          currentCoMReal,
          prevCoMReal,
          deltaTime,
        });
      } else {
        // Use converted normalized coordinates
        currentCoMReal = currentCenterOfMassReal;
        prevCoMReal = prevCenterOfMassReal;

        console.log(
          '🔧 [SPEED DEBUG] Using converted normalized coordinates:',
          {
            currentCoMReal,
            prevCoMReal,
            deltaTime,
            scalingFactor: getCalibrationScalingFactor(),
          }
        );
      }

      const fallbackCurrentCoM = sanitizeVector(
        normalizedToCourtMeters(currentCenterOfMass),
        'currentCoMReal-fallback'
      );
      const fallbackPrevCoM = sanitizeVector(
        normalizedToCourtMeters(prevCenterOfMass),
        'prevCoMReal-fallback'
      );

      let movementMagnitude = calculateDistance3D(currentCoMReal, prevCoMReal);
      const fallbackMagnitude = calculateDistance3D(
        fallbackCurrentCoM,
        fallbackPrevCoM
      );

    if (
      movementMagnitude <= MIN_MOVEMENT_THRESHOLD &&
      fallbackMagnitude > MIN_MOVEMENT_THRESHOLD &&
      fallbackMagnitude > movementMagnitude * 5
    ) {
        console.info(
          'ℹ️ [SpeedCalculator] Falling back to court-based coordinates for CoM movement'
        );
        currentCoMReal = fallbackCurrentCoM;
        prevCoMReal = fallbackPrevCoM;
        movementMagnitude = fallbackMagnitude;
      }

      // Calculate velocity in real-world units (m/s)
      velocity = sanitizeVector(
        {
          x: (currentCoMReal.x - prevCoMReal.x) / deltaTime,
          y: (currentCoMReal.y - prevCoMReal.y) / deltaTime,
          z: (currentCoMReal.z - prevCoMReal.z) / deltaTime,
        },
        'velocity'
      );

      // Calculate various speed metrics using real-world coordinates
      generalMovingSpeed = calculateGeneralMovingSpeed(
        currentCoMReal,
        prevCoMReal,
        deltaTime
      );

      // Calculate right foot speed (already converts to real-world internally)
      rightFootSpeed = calculateRightFootSpeed(
        landmarks,
        previousLandmarks.value,
        deltaTime
      );

      // Overall speed based on center of mass movement in 3D
      overallSpeed = movementMagnitude / deltaTime;

      if (!Number.isFinite(overallSpeed)) {
        console.warn('⚠️ [SpeedCalculator] Overall speed invalid', {
          currentCoMReal,
          prevCoMReal,
          deltaTime,
        });
        overallSpeed = 0;
      }

      if (!Number.isFinite(generalMovingSpeed)) {
        generalMovingSpeed = 0;
      }

      if (!Number.isFinite(rightFootSpeed)) {
        rightFootSpeed = 0;
      }

      console.log('🔧 [SPEED DEBUG] Final speed calculations:', {
        velocity,
        generalMovingSpeed,
        rightFootSpeed,
        overallSpeed,
        deltaTime,
        coordinateSystem:
          worldLandmarks && worldLandmarks.length > 0
            ? 'world'
            : 'normalized-converted',
      });

      // Update speed samples
      pushSample(frame, timeSec, overallSpeed);
    } else {
      // First frame
      pushSample(frame, timeSec, 0);
    }

    // Calculate center of gravity height using proper biomechanical principles
    let centerOfGravityHeight = 0;

    // Get estimated person height from calibration or default
    const estimatedPersonHeight = calibrationSettings.value.useHeightCalibration
      ? calibrationSettings.value.playerHeight / 100
      : 1.7; // 1.7m default

    // Calculate ground plane reference using ankle positions
    const leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
    const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

    let groundPlaneY = 1.0; // Default to bottom of frame

    // Use ankle positions to establish ground plane if available
    if (
      leftAnkle &&
      rightAnkle &&
      (leftAnkle.visibility ?? 0) > 0.5 &&
      (rightAnkle.visibility ?? 0) > 0.5
    ) {
      groundPlaneY = Math.max(leftAnkle.y, rightAnkle.y);
    } else if (leftAnkle && (leftAnkle.visibility ?? 0) > 0.5) {
      groundPlaneY = leftAnkle.y;
    } else if (rightAnkle && (rightAnkle.visibility ?? 0) > 0.5) {
      groundPlaneY = rightAnkle.y;
    }

    // Calculate CoM height relative to ground plane
    // Center of mass is typically 55-57% of height from ground for standing position
    const biomechanicalComRatio = 0.56; // 56% is average for adults

    // Convert center of mass position to real-world coordinates
    const comRealWorld = sanitizeVector(
      normalizedToRealWorld({
        x: currentCenterOfMass.x,
        y: currentCenterOfMass.y,
        z: currentCenterOfMass.z,
        visibility: 1.0,
      }),
      'comRealWorld'
    );

    // Convert ground plane to real-world coordinates
    const groundRealWorld = sanitizeVector(
      normalizedToRealWorld({
        x: 0.5, // Center of frame horizontally
        y: groundPlaneY,
        z: 0,
        visibility: 1.0,
      }),
      'groundRealWorld'
    );

    // Calculate height above ground plane
    const heightAboveGround = Math.abs(groundRealWorld.y - comRealWorld.y);

    // Validate against biomechanical expectations
    const expectedComHeight = estimatedPersonHeight * biomechanicalComRatio;
    const minComHeight = estimatedPersonHeight * 0.3; // Very low crouch
    const maxComHeight = estimatedPersonHeight * 0.65; // Standing with arms raised

    // Use calculated height if reasonable, otherwise fall back to biomechanical estimate
    if (
      heightAboveGround >= minComHeight &&
      heightAboveGround <= maxComHeight
    ) {
      centerOfGravityHeight = heightAboveGround;
    } else {
      // Fall back to biomechanical estimate based on normalized position
      const normalizedHeightFromGround = Math.max(
        0,
        Math.min(1, groundPlaneY - currentCenterOfMass.y)
      );
      centerOfGravityHeight = Math.max(
        minComHeight,
        Math.min(
          maxComHeight,
          normalizedHeightFromGround * estimatedPersonHeight
        )
      );
    }

    console.log(
      '🔧 [SPEED DEBUG] CoG Height calculated with ground plane calibration:',
      {
        centerOfGravityHeight,
        groundPlaneY,
        comRealWorld,
        groundRealWorld,
        heightAboveGround,
        expectedComHeight,
        estimatedPersonHeight,
        biomechanicalComRatio,
      }
    );

    // Get current scaling factor for UI display
    const currentScalingFactor = getCalibrationScalingFactor();

    // Update comprehensive metrics
    comprehensiveMetrics.value = {
      isValid: landmarks.length > 0,
      speed: overallSpeed,
      generalMovingSpeed,
      rightFootSpeed,
      centerOfGravityHeight,
      velocity,
      centerOfMass: currentCenterOfMass,
      centerOfMassNormalized,
      centerOfGravity: currentCenterOfGravity,
      centerOfGravityNormalized,
      currentSpeed: currentSpeed.value,
      averageSpeed: averageSpeed.value,
      samples: samples.value.length,
      scalingFactor: currentScalingFactor,
    };

    // Store current data for next frame
    previousLandmarks.value = [...landmarks];
    if (worldLandmarks) {
      previousWorldLandmarks.value = [...worldLandmarks];
    }
    previousTime.value = timeSec;
  }

  function startCourtCalibration() {
    console.log('Starting court calibration...');
    calibrationSettings.value.useCourtCalibration = true;
    // In a real implementation, this would start the calibration process
    // For now, we'll just enable court calibration mode
  }

  function resetCalibration() {
    console.log('Resetting calibration...');
    calibrationSettings.value = {
      isCalibrated: false,
      useHeightCalibration: true,
      useCourtCalibration: false,
      playerHeight: 170,
      courtLength: 13.4,
      pixelsPerMeter: 100,
      calibrationAccuracy: 0,
      referencePoints: [],
    };
  }

  /**
   * Complete cleanup for project switching
   * This clears all data and resets to initial state
   */
  function cleanup() {
    console.log('🧹 [SpeedCalculator] Starting complete cleanup...');

    // Reset all speed data using existing reset function
    reset();

    // Reset calibration
    resetCalibration();

    console.log('✅ [SpeedCalculator] Complete cleanup finished');
  }

  function setPlayerHeight(height: number) {
    // Input validation to prevent division by zero errors
    if (height <= 0 || !isFinite(height)) {
      console.warn('🔧 [CALIBRATION WARNING] Invalid player height:', height);
      return;
    }

    console.log('🔧 [CALIBRATION DEBUG] setPlayerHeight called:', {
      oldHeight: calibrationSettings.value.playerHeight,
      newHeight: height,
      oldUseHeightCalibration: calibrationSettings.value.useHeightCalibration,
    });
    calibrationSettings.value.playerHeight = height;
    calibrationSettings.value.useHeightCalibration = true;
    // Update calibration status
    updateCalibrationStatus();
    console.log('🔧 [CALIBRATION DEBUG] setPlayerHeight completed:', {
      currentSettings: calibrationSettings.value,
    });
  }

  function setCourtLength(length: number) {
    // Input validation to prevent division by zero errors
    if (length <= 0 || !isFinite(length)) {
      console.warn('🔧 [CALIBRATION WARNING] Invalid court length:', length);
      return;
    }

    console.log('🔧 [CALIBRATION DEBUG] setCourtLength called:', {
      oldLength: calibrationSettings.value.courtLength,
      newLength: length,
      oldUseCourtCalibration: calibrationSettings.value.useCourtCalibration,
    });
    calibrationSettings.value.courtLength = length;
    calibrationSettings.value.useCourtCalibration = true;
    // Update calibration status
    updateCalibrationStatus();
    console.log('🔧 [CALIBRATION DEBUG] setCourtLength completed:', {
      currentSettings: calibrationSettings.value,
    });
  }

  function getCalibrationScalingFactor(): number {
    // Calculate pixels per meter based on video dimensions and calibration
    let pixelsPerMeter = calibrationSettings.value.pixelsPerMeter;

    if (calibrationSettings.value.useHeightCalibration) {
      // Estimate pixels per meter based on player height
      const playerHeightMeters = calibrationSettings.value.playerHeight / 100; // Convert cm to meters

      // Assume player takes up roughly 70% of video height when standing
      const estimatedPlayerPixelHeight = canvasHeight * 0.7;
      const estimatedPixelsPerMeter =
        estimatedPlayerPixelHeight / playerHeightMeters;

      pixelsPerMeter = estimatedPixelsPerMeter;

      console.log('🔧 [CALIBRATION DEBUG] Height-based calibration:', {
        playerHeightCm: calibrationSettings.value.playerHeight,
        playerHeightMeters,
        canvasHeight,
        estimatedPlayerPixelHeight,
        estimatedPixelsPerMeter,
      });
    }

    if (calibrationSettings.value.useCourtCalibration) {
      // Estimate pixels per meter based on court dimensions
      const courtLengthMeters = calibrationSettings.value.courtLength;

      // Assume court takes up roughly 80% of video width
      const estimatedCourtPixelLength = canvasWidth * 0.8;
      const estimatedPixelsPerMeter =
        estimatedCourtPixelLength / courtLengthMeters;

      // If both height and court calibration are enabled, average them
      if (calibrationSettings.value.useHeightCalibration) {
        pixelsPerMeter = (pixelsPerMeter + estimatedPixelsPerMeter) / 2;
      } else {
        pixelsPerMeter = estimatedPixelsPerMeter;
      }

      console.log('🔧 [CALIBRATION DEBUG] Court-based calibration:', {
        courtLengthMeters,
        canvasWidth,
        estimatedCourtPixelLength,
        estimatedPixelsPerMeter,
        finalPixelsPerMeter: pixelsPerMeter,
      });
    }

    // Update the calibration settings with calculated value
    calibrationSettings.value.pixelsPerMeter = pixelsPerMeter;

    // Return scaling factor (for normalized coordinates, this is the conversion factor)
    const scalingFactor = pixelsPerMeter / 100; // Normalize against default 100 pixels/meter

    console.log('🔧 [CALIBRATION DEBUG] Final calibration values:', {
      useHeightCalibration: calibrationSettings.value.useHeightCalibration,
      useCourtCalibration: calibrationSettings.value.useCourtCalibration,
      pixelsPerMeter,
      scalingFactor,
      canvasWidth,
      canvasHeight,
    });

    return Math.max(0.1, scalingFactor); // Ensure minimum reasonable scaling
  }

  function updateCalibrationStatus() {
    // Simple calibration accuracy calculation
    let accuracy = 0;
    if (calibrationSettings.value.useHeightCalibration) accuracy += 50;
    if (calibrationSettings.value.useCourtCalibration) accuracy += 50;

    calibrationSettings.value.calibrationAccuracy = accuracy;
    calibrationSettings.value.isCalibrated = accuracy > 0;
  }

  // Function to update video dimensions for calibration
  function updateVideoDimensions(width: number, height: number) {
    if (width > 0 && height > 0) {
      // Update internal canvas dimensions
      Object.assign(options, { canvasWidth: width, canvasHeight: height });

      console.log('🔧 [CALIBRATION DEBUG] Updated video dimensions:', {
        width,
        height,
        previousCanvasWidth: canvasWidth,
        previousCanvasHeight: canvasHeight,
      });

      // Recalculate calibration with new dimensions
      updateCalibrationStatus();
    }
  }

  // Auto-calibration for badminton analysis
  function autoCalibrateBadminton() {
    console.log(
      '🔧 [AUTO-CALIBRATION] Setting up badminton-specific calibration'
    );

    // Set appropriate values for 15-year-old badminton player
    setPlayerHeight(165); // cm - typical for 15-year-old
    setCourtLength(13.4); // meters - standard badminton court

    // Set court dimensions in camera calibration
    cameraCalibration.setCourtDimensions({
      length: 13.4,
      width: 6.1,
    });

    console.log('🔧 [AUTO-CALIBRATION] Badminton calibration complete:', {
      playerHeight: calibrationSettings.value.playerHeight,
      courtLength: calibrationSettings.value.courtLength,
      useHeightCalibration: calibrationSettings.value.useHeightCalibration,
      useCourtCalibration: calibrationSettings.value.useCourtCalibration,
      cameraCalibrated: cameraCalibration.isCalibrated.value,
    });
  }

  // Set camera calibration status
  function setCameraCalibrated(calibrated: boolean) {
    if (!calibrated) {
      cameraCalibration.resetCalibration();
    }
    calibrationSettings.value.isCalibrated =
      calibrated && cameraCalibration.isCalibrated.value;
  }

  return {
    currentSpeed,
    averageSpeed: averageSpeed as Ref<number>,
    samples,
    comprehensiveMetrics,
    calibrationSettings,
    speedMetrics: comprehensiveMetrics, // Alias for compatibility
    cameraCalibration, // Expose camera calibration for UI integration
    reset,
    pushSample,
    updateWithLandmarks,
    startCourtCalibration,
    resetCalibration,
    setPlayerHeight,
    setCourtLength,
    updateVideoDimensions,
    autoCalibrateBadminton,
    setCameraCalibrated,
  };
}
