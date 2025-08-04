/**
 * useSpeedCalculator.ts
 * Enhanced speed calculator with comprehensive metrics including center of mass calculation
 * and all properties required by visualization components.
 */
import { ref, computed, type Ref } from 'vue';

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
  reset: () => void;
  pushSample: (frame: number, timeSec: number, distanceDelta: number) => void;
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

    // Use torso landmarks for center of mass calculation
    const torsoIndices = [
      POSE_LANDMARKS.LEFT_SHOULDER,
      POSE_LANDMARKS.RIGHT_SHOULDER,
      POSE_LANDMARKS.LEFT_HIP,
      POSE_LANDMARKS.RIGHT_HIP,
    ];

    let totalX = 0;
    let totalY = 0;
    let totalZ = 0;
    let validCount = 0;

    for (const index of torsoIndices) {
      if (index < landmarks.length && landmarks[index]) {
        const landmark = landmarks[index];
        if (landmark.visibility === undefined || landmark.visibility > 0.5) {
          totalX += landmark.x;
          totalY += landmark.y;
          totalZ += landmark.z || 0;
          validCount++;
        }
      }
    }

    if (validCount === 0) {
      // Fallback: use all available landmarks
      for (const landmark of landmarks) {
        if (landmark.visibility === undefined || landmark.visibility > 0.5) {
          totalX += landmark.x;
          totalY += landmark.y;
          totalZ += landmark.z || 0;
          validCount++;
        }
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

  function calculateDistance3D(p1: Vector3D, p2: Vector3D): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function calculateCoGHeight(worldLandmarks: Landmark[]): number {
    const leftHip = worldLandmarks?.[POSE_LANDMARKS.LEFT_HIP];
    const rightHip = worldLandmarks?.[POSE_LANDMARKS.RIGHT_HIP];
    const leftKnee = worldLandmarks?.[POSE_LANDMARKS.LEFT_KNEE];
    const rightKnee = worldLandmarks?.[POSE_LANDMARKS.RIGHT_KNEE];
    const leftAnkle = worldLandmarks?.[POSE_LANDMARKS.LEFT_ANKLE];
    const rightAnkle = worldLandmarks?.[POSE_LANDMARKS.RIGHT_ANKLE];

    if (
      !leftHip ||
      !rightHip ||
      !leftKnee ||
      !rightKnee ||
      !leftAnkle ||
      !rightAnkle
    ) {
      return 0;
    }

    const hip_y = (leftHip.y + rightHip.y) / 2;
    const knee_y = (leftKnee.y + rightKnee.y) / 2;
    const ankle_y = (leftAnkle.y + rightAnkle.y) / 2;

    if (!isFinite(hip_y) || !isFinite(knee_y) || !isFinite(ankle_y)) {
      return 0;
    }

    // Weights based on biomechanical data (approximated for a stable CoG)
    const w_hip = 0.5;
    const w_knee = 0.3;
    const w_ankle = 0.2;

    const cog_y = w_hip * hip_y + w_knee * knee_y + w_ankle * ankle_y;

    // CoG height is the distance from the ground plane (y=0 in world coordinates)
    return Math.abs(cog_y);
  }

  function calculateDistance2D(p1: Landmark, p2: Landmark): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

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
    const scalingFactor = getCalibrationScalingFactor();
    const basePixelsPerMeter = calibrationSettings.value.pixelsPerMeter;

    // Calculate effective pixels per meter based on calibration
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
    const pixelCoord = normalizedToPixel(landmark);
    const realWorldCoord = pixelToRealWorld(pixelCoord);

    return {
      x: realWorldCoord.x,
      y: realWorldCoord.y,
      z: (landmark.z || 0) * getCalibrationScalingFactor(), // Scale Z coordinate as well
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
    const distance = Math.sqrt(dx * dx + dy * dy);

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

    // Calculate horizontal speed (excluding vertical movement)
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
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
      currentSpeed: 0,
      averageSpeed: 0,
      samples: 0,
      scalingFactor: 1.0,
    };
  }

  function pushSample(frame: number, timeSec: number, distanceDelta: number) {
    // distanceDelta over time between samples gives speed; guard divide-by-zero
    if (samples.value.length > 0) {
      const last = samples.value[samples.value.length - 1];
      if (last) {
        const dt = Math.max(1e-6, timeSec - last.time);
        const speed = distanceDelta / dt;
        currentSpeed.value = speed;
        samples.value.push({ frame, time: timeSec, value: speed });
      }
    } else {
      // first sample, set speed to 0
      samples.value.push({ frame, time: timeSec, value: 0 });
      currentSpeed.value = 0;
    }

    // apply moving window smoothing by trimming the array
    if (samples.value.length > smoothingWindow) {
      samples.value.splice(0, samples.value.length - smoothingWindow);
    }

    // Update basic metrics in comprehensive metrics
    comprehensiveMetrics.value.currentSpeed = currentSpeed.value;
    comprehensiveMetrics.value.averageSpeed = averageSpeed.value;
    comprehensiveMetrics.value.samples = samples.value.length;
  }

  function updateWithLandmarks(
    frame: number,
    timeSec: number,
    landmarks: Landmark[],
    worldLandmarks?: Landmark[]
  ) {
    // Calculate center of mass in normalized coordinates
    const currentCenterOfMass = calculateCenterOfMass(landmarks);
    const currentWorldCenterOfMass = worldLandmarks
      ? calculateCenterOfMass(worldLandmarks)
      : currentCenterOfMass;

    // Convert normalized center of mass to real-world coordinates
    const currentCenterOfMassReal = normalizedToRealWorld(currentCenterOfMass);

    // Calculate normalized coordinates for visualization (keep original for UI)
    const centerOfMassNormalized: Vector2D = {
      x: Math.max(0, Math.min(1, currentCenterOfMass.x)),
      y: Math.max(0, Math.min(1, currentCenterOfMass.y)),
    };

    let velocity: Vector3D = { x: 0, y: 0, z: 0 };
    let generalMovingSpeed = 0;
    let rightFootSpeed = 0;
    let overallSpeed = 0;

    // Calculate velocities and speeds if we have previous data
    if (previousLandmarks.value.length > 0 && previousTime.value > 0) {
      const deltaTime = Math.max(1e-6, timeSec - previousTime.value);
      const prevCenterOfMass = calculateCenterOfMass(previousLandmarks.value);
      const prevCenterOfMassReal = normalizedToRealWorld(prevCenterOfMass);

      // Use world landmarks if available, otherwise use converted normalized coordinates
      let currentCoMReal: Vector3D;
      let prevCoMReal: Vector3D;

      if (
        worldLandmarks &&
        worldLandmarks.length > 0 &&
        previousWorldLandmarks.value.length > 0
      ) {
        // Use world coordinates directly (already in meters)
        currentCoMReal = currentWorldCenterOfMass;
        prevCoMReal = calculateCenterOfMass(previousWorldLandmarks.value);

        console.log('🔧 [SPEED DEBUG] Using world coordinates:', {
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

      // Calculate velocity in real-world units (m/s)
      velocity = {
        x: (currentCoMReal.x - prevCoMReal.x) / deltaTime,
        y: (currentCoMReal.y - prevCoMReal.y) / deltaTime,
        z: (currentCoMReal.z - prevCoMReal.z) / deltaTime,
      };

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
      overallSpeed =
        calculateDistance3D(currentCoMReal, prevCoMReal) / deltaTime;

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

    // Calculate center of gravity height using the specified biomechanical model
    let centerOfGravityHeight = 0;
    if (worldLandmarks && worldLandmarks.length > 0) {
      const heightFromWorld = calculateCoGHeight(worldLandmarks);

      // If the calculated height is unrealistic, fall back to normalized calculation
      if (heightFromWorld < 0.5) {
        console.warn(
          '🔧 [CALIBRATION WARNING] World landmark height is unrealistic, falling back to normalized calculation.',
          { heightFromWorld }
        );
        const normalizedHeightFromBottom = Math.max(
          0,
          Math.min(1, 1.0 - currentCenterOfMass.y)
        );
        const estimatedPersonHeight = calibrationSettings.value
          .useHeightCalibration
          ? calibrationSettings.value.playerHeight / 100
          : 1.7;
        centerOfGravityHeight =
          normalizedHeightFromBottom * estimatedPersonHeight;
      } else {
        centerOfGravityHeight = heightFromWorld;
      }
    } else {
      // Fallback for when no world landmarks are available
      const normalizedHeightFromBottom = Math.max(
        0,
        Math.min(1, 1.0 - currentCenterOfMass.y)
      );

      // Estimate height based on calibration or a default value
      const estimatedPersonHeight = calibrationSettings.value
        .useHeightCalibration
        ? calibrationSettings.value.playerHeight / 100
        : 1.7; // 1.7m default

      centerOfGravityHeight =
        normalizedHeightFromBottom * estimatedPersonHeight;
      console.log(
        '🔧 [SPEED DEBUG] CoG Height estimated from normalized landmarks:',
        {
          centerOfGravityHeight,
        }
      );
    }

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

    console.log('🔧 [AUTO-CALIBRATION] Badminton calibration complete:', {
      playerHeight: calibrationSettings.value.playerHeight,
      courtLength: calibrationSettings.value.courtLength,
      useHeightCalibration: calibrationSettings.value.useHeightCalibration,
      useCourtCalibration: calibrationSettings.value.useCourtCalibration,
    });
  }

  return {
    currentSpeed,
    averageSpeed: averageSpeed as Ref<number>,
    samples,
    comprehensiveMetrics,
    calibrationSettings,
    speedMetrics: comprehensiveMetrics, // Alias for compatibility
    reset,
    cleanup,
    pushSample,
    updateWithLandmarks,
    startCourtCalibration,
    resetCalibration,
    setPlayerHeight,
    setCourtLength,
    updateVideoDimensions,
    autoCalibrateBadminton,
  };
}
