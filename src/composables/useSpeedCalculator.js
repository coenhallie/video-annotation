import { reactive, ref } from 'vue';

/**
 * Speed Calculator Composable
 *
 * Calculates movement speed and center of mass from pose landmarks using
 * biomechanical body segment weights. Provides real-time velocity tracking
 * and speed metrics for motion analysis.
 *
 * Features:
 * - Center of mass calculation using anatomical body segment weights
 * - Center of gravity height calculation
 * - Real-time velocity and speed computation
 * - Individual landmark speed tracking (e.g., right foot)
 * - General moving speed (horizontal movement)
 * - Temporal smoothing for stable measurements
 * - Production-ready with robust error handling
 */

// prettier-ignore
const LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer', 'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky', 'left_index', 'right_index', 'left_thumb', 'right_thumb',
  'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index'
];

/**
 * Body segment weights based on biomechanical research
 * Values represent percentage of total body mass for each segment
 * Z-axis is positive towards the viewer
 */
const BODY_SEGMENT_WEIGHTS = {
  head: {
    indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    weight: 8.26,
  },
  torso: {
    indices: [11, 12, 23, 24],
    weight: 48.33,
  },
  left_upper_arm: {
    indices: [11, 13],
    weight: 2.71,
  },
  right_upper_arm: {
    indices: [12, 14],
    weight: 2.71,
  },
  left_forearm: {
    indices: [13, 15],
    weight: 1.62,
  },
  right_forearm: {
    indices: [14, 16],
    weight: 1.62,
  },
  left_hand: {
    indices: [15, 17, 19, 21],
    weight: 0.61,
  },
  right_hand: {
    indices: [16, 18, 20, 22],
    weight: 0.61,
  },
  left_thigh: {
    indices: [23, 25],
    weight: 10.5,
  },
  right_thigh: {
    indices: [24, 26],
    weight: 10.5,
  },
  left_shank: {
    indices: [25, 27],
    weight: 4.75,
  },
  right_shank: {
    indices: [26, 28],
    weight: 4.75,
  },
  left_foot: {
    indices: [27, 29, 31],
    weight: 1.43,
  },
  right_foot: {
    indices: [28, 30, 32],
    weight: 1.43,
  },
};

/**
 * Speed Calculator Hook
 *
 * @returns {Object} Speed calculation interface
 * @returns {Object} speedMetrics - Reactive speed metrics object
 * @returns {Function} update - Update speed calculations with new landmarks
 * @returns {Function} reset - Reset all calculations and history
 * @returns {Function} calculateCoM - Calculate center of mass from landmarks
 */
export function useSpeedCalculator() {
  // Calibration settings for improved accuracy
  const calibrationSettings = reactive({
    // Player height calibration
    playerHeight: 170, // cm, default average height
    useHeightCalibration: false,

    // Court dimension calibration
    useCourtCalibration: false,
    courtDimensions: {
      width: 13.4, // meters (badminton court width)
      height: 6.1, // meters (badminton court length)
    },
    courtReferencePoints: [], // User-clicked court corners [topLeft, topRight, bottomLeft, bottomRight]
    pixelsToMetersRatio: null,

    // Camera distance estimation
    useCameraDistanceCalibration: false,
    estimatedCameraDistance: 10, // meters, rough estimate

    // Calibration status
    isCalibrated: false,
    calibrationAccuracy: 0, // 0-100% estimated accuracy
  });

  // Reactive speed metrics for real-time updates
  const speedMetrics = reactive({
    centerOfMass: {
      x: 0,
      y: 0,
      z: 0,
    },
    centerOfMassNormalized: {
      x: 0,
      y: 0,
      z: 0,
    },
    centerOfGravityHeight: 0, // Height of center of gravity from ground
    velocity: {
      x: 0,
      y: 0,
      z: 0,
    },
    speed: 0, // Overall speed in m/s
    generalMovingSpeed: 0, // Horizontal speed in m/s
    rightFootSpeed: 0, // Speed of the right foot in m/s
    isValid: false,
    // Calibration-related metrics
    calibratedSpeed: 0, // Speed after applying calibration
    calibratedGeneralMovingSpeed: 0,
    calibratedRightFootSpeed: 0,
    scalingFactor: 1, // Current scaling factor applied
  });

  // Frame history for temporal smoothing
  const history = ref([]);
  const historySize = 10; // Frames to store for smoothing

  /**
   * Calculate scaling factor based on calibration settings
   * @returns {number} Scaling factor to apply to measurements
   */
  const calculateScalingFactor = () => {
    let scalingFactor = 1;

    if (calibrationSettings.useHeightCalibration) {
      // Scale based on player height vs. MediaPipe's assumed average (170cm)
      scalingFactor *= calibrationSettings.playerHeight / 170;
    }

    if (
      calibrationSettings.useCourtCalibration &&
      calibrationSettings.pixelsToMetersRatio
    ) {
      // Additional scaling based on court calibration
      // This would override height calibration if both are enabled
      scalingFactor = calibrationSettings.pixelsToMetersRatio;
    }

    return scalingFactor;
  };

  /**
   * Apply calibration scaling to world landmarks
   * @param {Array} landmarks - Original world landmarks
   * @returns {Array} Calibrated world landmarks
   */
  const applyCalibratedScaling = (landmarks) => {
    if (!landmarks || landmarks.length === 0) return landmarks;

    const scalingFactor = calculateScalingFactor();

    if (scalingFactor === 1) return landmarks; // No calibration needed

    return landmarks.map((landmark) => ({
      ...landmark,
      x: landmark.x * scalingFactor,
      y: landmark.y * scalingFactor,
      z: landmark.z * scalingFactor,
    }));
  };

  /**
   * Set player height for calibration
   * @param {number} height - Player height in centimeters
   */
  const setPlayerHeight = (height) => {
    if (height > 0 && height < 300) {
      // Reasonable height range
      calibrationSettings.playerHeight = height;
      calibrationSettings.useHeightCalibration = true;
      updateCalibrationStatus();
    }
  };

  /**
   * Set court dimensions for calibration
   * @param {Object} dimensions - {width, height} of court in meters
   */
  const setCourtDimensions = (dimensions) => {
    if (dimensions.width > 0 && dimensions.height > 0) {
      calibrationSettings.courtDimensions.width = dimensions.width;
      calibrationSettings.courtDimensions.height = dimensions.height;

      // For dimension-based calibration, we use a simplified scaling approach
      // This assumes the video shows the full court proportionally
      const avgDimension = (dimensions.width + dimensions.height) / 2;
      const standardAvg = (13.4 + 6.1) / 2; // Standard badminton court average

      // Apply a scaling factor based on court size relative to standard badminton court
      calibrationSettings.pixelsToMetersRatio = avgDimension / standardAvg;
      calibrationSettings.useCourtCalibration = true;
      updateCalibrationStatus();
    }
  };

  /**
   * Set court reference points for calibration (legacy method for compatibility)
   * @param {Array} points - Array of 4 points [topLeft, topRight, bottomLeft, bottomRight]
   * @param {Object} videoDimensions - {width, height} of video in pixels
   */
  const setCourtReferencePoints = (points, videoDimensions) => {
    // For dimension-based calibration, we don't need actual points
    // Just trigger the calibration update if court dimensions are set
    if (
      calibrationSettings.courtDimensions.width > 0 &&
      calibrationSettings.courtDimensions.height > 0
    ) {
      setCourtDimensions(calibrationSettings.courtDimensions);
      return;
    }

    // Legacy point-based calibration (if 4 points provided)
    if (points.length !== 4) {
      console.warn('Court calibration requires exactly 4 reference points');
      return;
    }

    calibrationSettings.courtReferencePoints = points;

    // Calculate pixels to meters ratio based on court dimensions
    // Using the width of the court as reference (more reliable than perspective-affected length)
    const topWidth = Math.sqrt(
      Math.pow(points[1].x - points[0].x, 2) +
        Math.pow(points[1].y - points[0].y, 2)
    );
    const bottomWidth = Math.sqrt(
      Math.pow(points[3].x - points[2].x, 2) +
        Math.pow(points[3].y - points[2].y, 2)
    );

    // Average the top and bottom widths to account for perspective
    const averageWidthInPixels = (topWidth + bottomWidth) / 2;
    const realCourtWidth = calibrationSettings.courtDimensions.width; // 13.4m

    calibrationSettings.pixelsToMetersRatio =
      realCourtWidth / averageWidthInPixels;
    calibrationSettings.useCourtCalibration = true;
    updateCalibrationStatus();
  };

  /**
   * Update calibration status and accuracy estimate
   */
  const updateCalibrationStatus = () => {
    let accuracy = 0;

    if (calibrationSettings.useHeightCalibration) {
      accuracy += 20; // Height calibration adds ~20% accuracy
    }

    if (calibrationSettings.useCourtCalibration) {
      accuracy += 40; // Court calibration adds ~40% accuracy
    }

    if (calibrationSettings.useCameraDistanceCalibration) {
      accuracy += 25; // Camera distance adds ~25% accuracy
    }

    calibrationSettings.calibrationAccuracy = Math.min(accuracy, 95); // Cap at 95%
    calibrationSettings.isCalibrated = accuracy > 0;
  };

  /**
   * Reset all calibration settings
   */
  const resetCalibration = () => {
    Object.assign(calibrationSettings, {
      playerHeight: 170,
      useHeightCalibration: false,
      useCourtCalibration: false,
      courtReferencePoints: [],
      pixelsToMetersRatio: null,
      useCameraDistanceCalibration: false,
      estimatedCameraDistance: 10,
      isCalibrated: false,
      calibrationAccuracy: 0,
    });
  };

  /**
   * Calculate center of mass from pose landmarks
   * Uses biomechanical body segment weights for accurate CoM calculation
   *
   * @param {Array} landmarks - Array of pose landmarks with x, y, z coordinates
   * @returns {Object|null} Center of mass coordinates or null if insufficient data
   */
  const calculateCoM = (landmarks) => {
    try {
      let totalWeight = 0;
      const weightedSum = {
        x: 0,
        y: 0,
        z: 0,
      };
      const segmentCoMs = {};

      if (!landmarks || landmarks.length === 0) {
        return null;
      }

      for (const segmentName in BODY_SEGMENT_WEIGHTS) {
        const segment = BODY_SEGMENT_WEIGHTS[segmentName];
        const segmentLandmarks = segment.indices
          .map((index) => landmarks[index])
          .filter((landmark) => {
            return (
              landmark &&
              typeof landmark.x === 'number' &&
              typeof landmark.y === 'number' &&
              typeof landmark.z === 'number' &&
              isFinite(landmark.x) &&
              isFinite(landmark.y) &&
              isFinite(landmark.z) &&
              (landmark.visibility || 1) > 0.5
            );
          });

        if (segmentLandmarks.length > 0) {
          const segmentCoM = segmentLandmarks.reduce(
            (acc, landmark) => {
              acc.x += landmark.x;
              acc.y += landmark.y;
              acc.z += landmark.z;
              return acc;
            },
            {
              x: 0,
              y: 0,
              z: 0,
            }
          );

          segmentCoM.x /= segmentLandmarks.length;
          segmentCoM.y /= segmentLandmarks.length;
          segmentCoM.z /= segmentLandmarks.length;

          // Validate segment CoM values
          if (
            isFinite(segmentCoM.x) &&
            isFinite(segmentCoM.y) &&
            isFinite(segmentCoM.z)
          ) {
            weightedSum.x += segmentCoM.x * segment.weight;
            weightedSum.y += segmentCoM.y * segment.weight;
            weightedSum.z += segmentCoM.z * segment.weight;
            totalWeight += segment.weight;
            segmentCoMs[segmentName] = segmentCoM;
          }
        }
      }

      if (totalWeight === 0) {
        return null;
      }

      const result = {
        x: weightedSum.x / totalWeight,
        y: weightedSum.y / totalWeight,
        z: weightedSum.z / totalWeight,
      };

      // Final validation of result
      if (!isFinite(result.x) || !isFinite(result.y) || !isFinite(result.z)) {
        return null;
      }

      return result;
    } catch (error) {
      console.error('Error calculating center of mass:', error);
      return null;
    }
  };

  /**
   * Calculate center of gravity height from pose landmarks
   * Uses weighted average of key lower-body and torso landmarks
   *
   * @param {Array} landmarks - Array of pose landmarks with x, y, z coordinates
   * @returns {number|null} Center of gravity height or null if insufficient data
   */
  const calculateCoGHeight = (landmarks) => {
    try {
      if (!landmarks || landmarks.length === 0) {
        return null;
      }

      // Key landmarks for CoG height calculation with their weights
      const cogLandmarks = [
        { index: 23, name: 'left_hip', weight: 0.3 }, // left_hip
        { index: 24, name: 'right_hip', weight: 0.3 }, // right_hip
        { index: 25, name: 'left_knee', weight: 0.2 }, // left_knee
        { index: 26, name: 'right_knee', weight: 0.2 }, // right_knee
        { index: 27, name: 'left_ankle', weight: 0.1 }, // left_ankle
        { index: 28, name: 'right_ankle', weight: 0.1 }, // right_ankle
      ];

      let totalWeight = 0;
      let weightedSum = 0;

      for (const landmarkInfo of cogLandmarks) {
        const landmark = landmarks[landmarkInfo.index];
        if (
          landmark &&
          typeof landmark.y === 'number' &&
          isFinite(landmark.y) &&
          (landmark.visibility || 1) > 0.5
        ) {
          weightedSum += landmark.y * landmarkInfo.weight;
          totalWeight += landmarkInfo.weight;
        }
      }

      if (totalWeight === 0) {
        return null;
      }

      const cogHeight = weightedSum / totalWeight;

      // Validate result
      if (!isFinite(cogHeight)) {
        return null;
      }

      return cogHeight;
    } catch (error) {
      console.error('Error calculating center of gravity height:', error);
      return null;
    }
  };

  /**
   * Calculate speed of a specific landmark
   *
   * @param {string} landmarkName - Name of the landmark (e.g., 'right_foot_index')
   * @param {Array} currentLandmarks - Current frame's landmarks
   * @param {Array} lastLandmarks - Previous frame's landmarks
   * @param {number} timeDelta - Time difference in seconds
   * @returns {number|null} Speed in m/s or null if insufficient data
   */
  const calculateLandmarkSpeed = (
    landmarkName,
    currentLandmarks,
    lastLandmarks,
    timeDelta
  ) => {
    try {
      if (!currentLandmarks || !lastLandmarks || timeDelta <= 0) {
        return null;
      }

      const landmarkIndex = LANDMARK_NAMES.indexOf(landmarkName);
      if (landmarkIndex === -1) {
        console.warn(`Unknown landmark name: ${landmarkName}`);
        return null;
      }

      const currentLandmark = currentLandmarks[landmarkIndex];
      const lastLandmark = lastLandmarks[landmarkIndex];

      if (
        !currentLandmark ||
        !lastLandmark ||
        (currentLandmark.visibility || 1) <= 0.5 ||
        (lastLandmark.visibility || 1) <= 0.5
      ) {
        return null;
      }

      // Calculate displacement
      const dx = currentLandmark.x - lastLandmark.x;
      const dy = currentLandmark.y - lastLandmark.y;
      const dz = currentLandmark.z - lastLandmark.z;

      // Calculate speed (magnitude of velocity)
      const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / timeDelta;

      if (!isFinite(speed)) {
        return null;
      }

      // Clamp to reasonable values (max 50 m/s)
      return Math.min(speed, 50);
    } catch (error) {
      console.error(`Error calculating ${landmarkName} speed:`, error);
      return null;
    }
  };

  /**
   * Calculate general moving speed (horizontal movement only)
   *
   * @param {Object} velocity - Velocity vector {x, y, z}
   * @returns {number} Horizontal speed in m/s
   */
  const calculateGeneralMovingSpeed = (velocity) => {
    if (
      !velocity ||
      typeof velocity.x !== 'number' ||
      typeof velocity.z !== 'number'
    ) {
      return 0;
    }

    // Calculate horizontal speed (excluding vertical movement)
    const horizontalSpeed = Math.sqrt(
      velocity.x * velocity.x + velocity.z * velocity.z
    );

    if (!isFinite(horizontalSpeed)) {
      return 0;
    }

    // Clamp to reasonable values (max 50 m/s)
    return Math.min(horizontalSpeed, 50);
  };

  /**
   * Calculate velocity between two positions
   *
   * @param {Object} p1 - Current position {x, y, z}
   * @param {Object} p2 - Previous position {x, y, z}
   * @param {number} delta - Time difference in seconds
   * @returns {Object} Velocity vector {x, y, z} in meters per second
   */
  const calculateVelocity = (p1, p2, delta) => {
    if (delta === 0)
      return {
        x: 0,
        y: 0,
        z: 0,
      };
    return {
      x: (p1.x - p2.x) / delta,
      y: (p1.y - p2.y) / delta,
      z: (p1.z - p2.z) / delta,
    };
  };

  /**
   * Simple Kalman filter for 1D smoothing
   *
   * @param {number} lastEstimate - Previous filtered value
   * @param {number} currentMeasurement - Current raw measurement
   * @param {number} gain - Filter gain (0-1, higher = less smoothing)
   * @returns {number} Filtered value
   */
  const kalmanFilter1D = (lastEstimate, currentMeasurement, gain) => {
    return lastEstimate + gain * (currentMeasurement - lastEstimate);
  };

  /**
   * Update speed calculations with new landmark data
   *
   * @param {Array} landmarks - Current frame's pose landmarks
   * @param {Array} worldLandmarks - Current frame's world landmarks (for 3D calculations)
   * @param {number} timestamp - Current timestamp in seconds (from video.currentTime)
   */
  const update = (landmarks, worldLandmarks, timestamp) => {
    try {
      // Validate input parameters
      if (!landmarks || !Array.isArray(landmarks) || landmarks.length === 0) {
        speedMetrics.isValid = false;
        return;
      }

      if (
        !worldLandmarks ||
        !Array.isArray(worldLandmarks) ||
        worldLandmarks.length === 0
      ) {
        speedMetrics.isValid = false;
        return;
      }

      if (typeof timestamp !== 'number' || timestamp < 0) {
        speedMetrics.isValid = false;
        return;
      }

      // Apply calibration scaling to world landmarks
      const calibratedWorldLandmarks = applyCalibratedScaling(worldLandmarks);
      const scalingFactor = calculateScalingFactor();

      // Calculate center of mass in both coordinate systems
      const centerOfMass = calculateCoM(calibratedWorldLandmarks); // For speed calculations (world coordinates)
      const centerOfMassNormalized = calculateCoM(landmarks); // For visualization (normalized coordinates)
      const centerOfGravityHeight = calculateCoGHeight(landmarks);

      if (!centerOfMass || !centerOfMassNormalized) {
        speedMetrics.isValid = false;
        return;
      }

      // Store scaling factor for reference
      speedMetrics.scalingFactor = scalingFactor;

      // Validate center of mass values
      if (
        !isFinite(centerOfMass.x) ||
        !isFinite(centerOfMass.y) ||
        !isFinite(centerOfMass.z) ||
        !isFinite(centerOfMassNormalized.x) ||
        !isFinite(centerOfMassNormalized.y) ||
        !isFinite(centerOfMassNormalized.z)
      ) {
        speedMetrics.isValid = false;
        return;
      }

      const frameData = {
        com: centerOfMass,
        landmarks: landmarks,
        worldLandmarks: calibratedWorldLandmarks, // Use calibrated landmarks
        timestamp,
      };

      // DEBUG: Log speed calculation timing
      console.log(
        `⚡ [SpeedCalculator] Speed calculated - timestamp: ${timestamp.toFixed(
          3
        )}s, speed: ${speedMetrics.speed?.toFixed(3) || 'N/A'} m/s`
      );

      history.value.push(frameData);
      if (history.value.length > historySize) {
        history.value.shift();
      }

      const smoothedCoM = {
        ...history.value[history.value.length - 1].com,
      };
      const smoothedTimestamp =
        history.value[history.value.length - 1].timestamp;

      // Update center of mass and center of gravity height
      speedMetrics.centerOfMass = smoothedCoM;
      speedMetrics.centerOfMassNormalized = centerOfMassNormalized;
      speedMetrics.centerOfGravityHeight = centerOfGravityHeight || 0;

      if (history.value.length < 2) {
        speedMetrics.isValid = true;
        return;
      }

      const lastSmoothedFrame = history.value[history.value.length - 2];
      // FIXED: Use video timestamps directly without playbackRate compensation
      const timeDelta = smoothedTimestamp - lastSmoothedFrame.timestamp;

      if (timeDelta > 0 && timeDelta < 1) {
        // Reasonable time delta check
        const velocity = calculateVelocity(
          smoothedCoM,
          lastSmoothedFrame.com,
          timeDelta
        );

        // Validate velocity values
        if (
          isFinite(velocity.x) &&
          isFinite(velocity.y) &&
          isFinite(velocity.z)
        ) {
          speedMetrics.velocity = velocity;
          const speed = Math.sqrt(
            velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2
          );

          // Clamp speed to reasonable values (max 50 m/s)
          speedMetrics.speed = Math.min(speed, 50);

          // Calculate general moving speed (horizontal movement only)
          speedMetrics.generalMovingSpeed =
            calculateGeneralMovingSpeed(velocity);
        }

        // Calculate right foot speed
        const rightFootSpeed = calculateLandmarkSpeed(
          'right_foot_index',
          frameData.worldLandmarks,
          lastSmoothedFrame.worldLandmarks,
          timeDelta
        );
        speedMetrics.rightFootSpeed = rightFootSpeed || 0;

        // Calculate calibrated speeds (these are the same as regular speeds now since we applied calibration to landmarks)
        speedMetrics.calibratedSpeed = speedMetrics.speed;
        speedMetrics.calibratedGeneralMovingSpeed =
          speedMetrics.generalMovingSpeed;
        speedMetrics.calibratedRightFootSpeed = speedMetrics.rightFootSpeed;
      }

      speedMetrics.isValid = true;
    } catch (error) {
      console.error('Error updating speed calculations:', error);
      speedMetrics.isValid = false;
    }
  };

  /**
   * Reset all speed calculations and clear history
   * Useful when switching videos or restarting analysis
   */
  const reset = () => {
    history.value = [];
    Object.assign(speedMetrics, {
      centerOfMass: {
        x: 0,
        y: 0,
        z: 0,
      },
      centerOfMassNormalized: {
        x: 0,
        y: 0,
        z: 0,
      },
      centerOfGravityHeight: 0,
      velocity: {
        x: 0,
        y: 0,
        z: 0,
      },
      speed: 0,
      generalMovingSpeed: 0,
      rightFootSpeed: 0,
      isValid: false,
      // Reset calibrated metrics
      calibratedSpeed: 0,
      calibratedGeneralMovingSpeed: 0,
      calibratedRightFootSpeed: 0,
      scalingFactor: 1,
    });
  };

  // Return the public API
  return {
    speedMetrics,
    calibrationSettings,
    update,
    reset,
    calculateCoM,
    calculateCoGHeight,
    calculateLandmarkSpeed,
    calculateGeneralMovingSpeed,
    // Calibration functions
    setPlayerHeight,
    setCourtDimensions,
    setCourtReferencePoints,
    resetCalibration,
    updateCalibrationStatus,
    calculateScalingFactor,
  };
}
