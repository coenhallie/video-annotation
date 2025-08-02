import { ref, reactive, onUnmounted, computed } from 'vue';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { useSpeedCalculator } from './useSpeedCalculator.js';

export function usePoseLandmarker() {
  // State
  const isInitialized = ref(false);
  const isLoading = ref(false);
  const error = ref(null);
  const isDetecting = ref(false);
  const isEnabled = ref(false);

  // Pose landmarker instance
  let poseLandmarker = null;

  // Pose detection state
  const poseResults = ref(null);
  const landmarks = ref([]);
  const worldLandmarks = ref([]);

  // Frame-based pose data storage
  const poseData = reactive(new Map()); // frame -> pose results
  const currentFrame = ref(0);

  // Keypoint selection state
  const selectedKeypoints = ref(Array.from({ length: 33 }, (_, i) => i)); // All keypoints selected by default

  // Speed calculation integration
  const speedCalculator = useSpeedCalculator();
  const {
    speedMetrics,
    update: updateSpeedCalculator,
    reset: resetSpeedCalculator,
  } = speedCalculator;

  // Performance tracking
  const lastDetectionTime = ref(0);
  const detectionFPS = ref(0);
  const frameProcessingQueue = ref([]);
  const isProcessingFrame = ref(false);
  let animationFrameId = null;

  // MediaPipe timestamp management
  const lastMediaPipeTimestamp = ref(0);

  // Enhanced ROI tracking state
  const roiHistory = ref([]); // Store ROI history for temporal smoothing
  const roiPrediction = ref(null); // Predicted ROI for next frame
  const roiConfidence = ref(0); // Confidence in current ROI
  const roiStabilityMetrics = reactive({
    averageSize: { width: 0, height: 0 },
    averagePosition: { x: 0, y: 0 },
    velocityEstimate: { x: 0, y: 0 },
    sizeVelocity: { width: 0, height: 0 },
    stabilityScore: 0,
  });

  // Enhanced performance settings with ROI optimizations
  const detectionSettings = reactive({
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.3,
    minPosePresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
    outputSegmentationMasks: false,
    frameSkip: 1, // Process every frame for better temporal accuracy
    maxFPS: 60, // Higher FPS for fast-moving sports
    useRequestAnimationFrame: false,

    // Enhanced ROI settings
    useROI: false,
    roiBox: null,

    // ROI Stability Settings
    roiSmoothingFactor: 0.7, // Higher = more smoothing (0-1)
    roiHistoryLength: 10, // Number of frames to keep for smoothing
    roiExpansionFactor: 1.2, // How much to expand ROI for safety margin
    roiMinSize: { width: 0.1, height: 0.1 }, // Minimum ROI size
    roiMaxSize: { width: 0.8, height: 0.8 }, // Maximum ROI size

    // Adaptive ROI Settings
    useAdaptiveROI: true,
    adaptiveROIConfidenceThreshold: 0.7,
    adaptiveROIExpansionRate: 0.05, // How much to expand when confidence is low
    adaptiveROIShrinkRate: 0.02, // How much to shrink when confidence is high

    // Motion Prediction Settings
    useMotionPrediction: true,
    motionPredictionWeight: 0.3, // How much to weight predicted position
    maxMotionPredictionDistance: 0.1, // Maximum distance to predict

    // ROI Validation Settings
    roiValidationEnabled: true,
    roiValidationMinLandmarks: 5, // Minimum landmarks required in ROI
    roiValidationMinConfidence: 0.4, // Minimum average confidence in ROI

    // Fallback Settings
    roiFallbackToFullFrame: true,
    roiFallbackFrameCount: 5, // Frames to wait before fallback
    roiFallbackRecoveryFrames: 10, // Frames to wait before re-enabling ROI
  });

  // Pose landmark connections for skeleton visualization
  const POSE_CONNECTIONS = [
    // Face
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 7],
    [0, 4],
    [4, 5],
    [5, 6],
    [6, 8],
    [9, 10],
    // Torso
    [11, 12],
    [11, 13],
    [12, 14],
    [13, 15],
    [14, 16],
    [11, 23],
    [12, 24],
    [23, 24],
    // Left arm
    [11, 13],
    [13, 15],
    [15, 17],
    [15, 19],
    [15, 21],
    [17, 19],
    // Right arm
    [12, 14],
    [14, 16],
    [16, 18],
    [16, 20],
    [16, 22],
    [18, 20],
    // Left leg
    [23, 25],
    [25, 27],
    [27, 29],
    [27, 31],
    [29, 31],
    // Right leg
    [24, 26],
    [26, 28],
    [28, 30],
    [28, 32],
    [30, 32],
  ];

  // Key landmarks for ROI calculation (more comprehensive)
  const ROI_KEY_LANDMARKS = [
    0, // nose
    11, // left_shoulder
    12, // right_shoulder
    13, // left_elbow
    14, // right_elbow
    15, // left_wrist
    16, // right_wrist
    23, // left_hip
    24, // right_hip
    25, // left_knee
    26, // right_knee
  ];

  // Initialize MediaPipe pose landmarker
  const initialize = async () => {
    if (isInitialized.value) {
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm'
      );

      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: detectionSettings.runningMode,
        numPoses: detectionSettings.numPoses,
        minPoseDetectionConfidence:
          detectionSettings.minPoseDetectionConfidence,
        minPosePresenceConfidence: detectionSettings.minPosePresenceConfidence,
        minTrackingConfidence: detectionSettings.minTrackingConfidence,
        outputSegmentationMasks: detectionSettings.outputSegmentationMasks,
      });

      isInitialized.value = true;
    } catch (err) {
      console.error('Failed to initialize pose landmarker:', err);
      error.value = `Failed to initialize pose landmarker: ${err.message}`;
    } finally {
      isLoading.value = false;
    }
  };

  // Enhanced ROI calculation with temporal smoothing
  const calculateEnhancedROI = (landmarks, previousROI = null) => {
    if (!landmarks || landmarks.length === 0) {
      return null;
    }

    // Get key landmarks for ROI calculation
    const keyLandmarks = ROI_KEY_LANDMARKS.map(
      (index) => landmarks[index]
    ).filter((landmark) => landmark && landmark.visibility > 0.3);

    if (keyLandmarks.length < 3) {
      return null;
    }

    // Calculate bounding box from key landmarks
    const xs = keyLandmarks.map((l) => l.x);
    const ys = keyLandmarks.map((l) => l.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Calculate raw ROI
    let rawROI = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };

    // Apply expansion factor for safety margin
    const expansion = detectionSettings.roiExpansionFactor;
    const centerX = rawROI.x + rawROI.width / 2;
    const centerY = rawROI.y + rawROI.height / 2;

    rawROI.width *= expansion;
    rawROI.height *= expansion;
    rawROI.x = centerX - rawROI.width / 2;
    rawROI.y = centerY - rawROI.height / 2;

    // Ensure ROI stays within bounds and respects min/max sizes
    rawROI.x = Math.max(0, rawROI.x);
    rawROI.y = Math.max(0, rawROI.y);
    rawROI.width = Math.min(rawROI.width, 1 - rawROI.x);
    rawROI.height = Math.min(rawROI.height, 1 - rawROI.y);

    // Apply size constraints
    rawROI.width = Math.max(
      detectionSettings.roiMinSize.width,
      Math.min(detectionSettings.roiMaxSize.width, rawROI.width)
    );
    rawROI.height = Math.max(
      detectionSettings.roiMinSize.height,
      Math.min(detectionSettings.roiMaxSize.height, rawROI.height)
    );

    // Apply temporal smoothing if we have previous ROI
    if (previousROI && detectionSettings.roiSmoothingFactor > 0) {
      const smoothing = detectionSettings.roiSmoothingFactor;
      rawROI = {
        x: previousROI.x * smoothing + rawROI.x * (1 - smoothing),
        y: previousROI.y * smoothing + rawROI.y * (1 - smoothing),
        width: previousROI.width * smoothing + rawROI.width * (1 - smoothing),
        height:
          previousROI.height * smoothing + rawROI.height * (1 - smoothing),
      };
    }

    return rawROI;
  };

  // Update ROI history and calculate stability metrics
  const updateROIHistory = (roi, videoTimestamp = null) => {
    if (!roi) return;

    // Use video timestamp if provided, otherwise fall back to performance.now()
    const timestamp =
      videoTimestamp !== null ? videoTimestamp : performance.now();

    // Add to history
    roiHistory.value.push({
      roi: { ...roi },
      timestamp: timestamp,
    });

    // Limit history length
    if (roiHistory.value.length > detectionSettings.roiHistoryLength) {
      roiHistory.value.shift();
    }

    // Calculate stability metrics
    if (roiHistory.value.length >= 2) {
      const recent = roiHistory.value.slice(-5); // Last 5 frames

      // Calculate average size and position
      roiStabilityMetrics.averageSize.width =
        recent.reduce((sum, h) => sum + h.roi.width, 0) / recent.length;
      roiStabilityMetrics.averageSize.height =
        recent.reduce((sum, h) => sum + h.roi.height, 0) / recent.length;
      roiStabilityMetrics.averagePosition.x =
        recent.reduce((sum, h) => sum + h.roi.x, 0) / recent.length;
      roiStabilityMetrics.averagePosition.y =
        recent.reduce((sum, h) => sum + h.roi.y, 0) / recent.length;

      // Calculate velocity estimates using video timestamps directly
      if (recent.length >= 2) {
        const current = recent[recent.length - 1];
        const previous = recent[recent.length - 2];
        // FIXED: Use video timestamps directly without playbackRate compensation
        const timeDelta = (current.timestamp - previous.timestamp) / 1000; // Convert to seconds

        if (timeDelta > 0) {
          roiStabilityMetrics.velocityEstimate.x =
            (current.roi.x - previous.roi.x) / timeDelta;
          roiStabilityMetrics.velocityEstimate.y =
            (current.roi.y - previous.roi.y) / timeDelta;
          roiStabilityMetrics.sizeVelocity.width =
            (current.roi.width - previous.roi.width) / timeDelta;
          roiStabilityMetrics.sizeVelocity.height =
            (current.roi.height - previous.roi.height) / timeDelta;
        }
      }

      // Calculate stability score (lower variance = higher stability)
      const positionVariance =
        recent.reduce((sum, h) => {
          const dx = h.roi.x - roiStabilityMetrics.averagePosition.x;
          const dy = h.roi.y - roiStabilityMetrics.averagePosition.y;
          return sum + (dx * dx + dy * dy);
        }, 0) / recent.length;

      roiStabilityMetrics.stabilityScore = Math.max(
        0,
        1 - positionVariance * 10
      );
    }
  };

  // Predict ROI for next frame using motion estimation
  const predictNextROI = (currentROI) => {
    if (!currentROI || !detectionSettings.useMotionPrediction) {
      return currentROI;
    }

    if (roiHistory.value.length < 2) {
      return currentROI;
    }

    // Use velocity estimate to predict next position
    const velocity = roiStabilityMetrics.velocityEstimate;
    const frameTime = 1 / detectionSettings.maxFPS; // Assume consistent frame rate

    let predictedROI = {
      x:
        currentROI.x +
        velocity.x * frameTime * detectionSettings.motionPredictionWeight,
      y:
        currentROI.y +
        velocity.y * frameTime * detectionSettings.motionPredictionWeight,
      width:
        currentROI.width +
        roiStabilityMetrics.sizeVelocity.width *
          frameTime *
          detectionSettings.motionPredictionWeight,
      height:
        currentROI.height +
        roiStabilityMetrics.sizeVelocity.height *
          frameTime *
          detectionSettings.motionPredictionWeight,
    };

    // Limit prediction distance
    const maxDistance = detectionSettings.maxMotionPredictionDistance;
    const distance = Math.sqrt(
      Math.pow(predictedROI.x - currentROI.x, 2) +
        Math.pow(predictedROI.y - currentROI.y, 2)
    );

    if (distance > maxDistance) {
      const scale = maxDistance / distance;
      predictedROI.x = currentROI.x + (predictedROI.x - currentROI.x) * scale;
      predictedROI.y = currentROI.y + (predictedROI.y - currentROI.y) * scale;
    }

    // Ensure bounds
    predictedROI.x = Math.max(
      0,
      Math.min(1 - predictedROI.width, predictedROI.x)
    );
    predictedROI.y = Math.max(
      0,
      Math.min(1 - predictedROI.height, predictedROI.y)
    );

    return predictedROI;
  };

  // Validate ROI based on pose landmarks
  const validateROI = (landmarks, roi) => {
    if (!detectionSettings.roiValidationEnabled || !landmarks || !roi) {
      return { isValid: true, reason: 'validation_disabled' };
    }

    // Count landmarks within ROI
    let landmarksInROI = 0;
    let totalConfidence = 0;
    let validLandmarks = 0;

    ROI_KEY_LANDMARKS.forEach((index) => {
      const landmark = landmarks[index];
      if (landmark && landmark.visibility > 0.3) {
        validLandmarks++;
        totalConfidence += landmark.visibility;

        if (
          landmark.x >= roi.x &&
          landmark.x <= roi.x + roi.width &&
          landmark.y >= roi.y &&
          landmark.y <= roi.y + roi.height
        ) {
          landmarksInROI++;
        }
      }
    });

    const averageConfidence =
      validLandmarks > 0 ? totalConfidence / validLandmarks : 0;
    const landmarkRatio =
      validLandmarks > 0 ? landmarksInROI / validLandmarks : 0;

    const isValid =
      landmarksInROI >= detectionSettings.roiValidationMinLandmarks &&
      averageConfidence >= detectionSettings.roiValidationMinConfidence &&
      landmarkRatio >= 0.6; // At least 60% of key landmarks should be in ROI

    return {
      isValid,
      landmarksInROI,
      totalLandmarks: validLandmarks,
      averageConfidence,
      landmarkRatio,
      reason: isValid ? 'valid' : 'insufficient_landmarks_or_confidence',
    };
  };

  // Enhanced pose detection with improved ROI handling
  const detectPose = async (
    videoElement,
    timestamp,
    frameNumber,
    playbackRate = 1
  ) => {
    if (!poseLandmarker || !isInitialized.value || !isEnabled.value) {
      return null;
    }

    // FPS limiting with playback rate compensation
    const now = performance.now();
    const timeSinceLastDetection = now - lastDetectionTime.value;
    const minInterval = 1000 / detectionSettings.maxFPS / playbackRate;

    if (timeSinceLastDetection < minInterval) {
      return getPoseForFrame(frameNumber);
    }

    // Frame skipping
    if (frameNumber % detectionSettings.frameSkip !== 0) {
      return getPoseForFrame(frameNumber);
    }

    // Prevent concurrent processing
    if (isProcessingFrame.value) {
      return getPoseForFrame(frameNumber);
    }

    try {
      isDetecting.value = true;
      isProcessingFrame.value = true;
      lastDetectionTime.value = now;

      // Ensure monotonic timestamps for MediaPipe
      const mediaPipeTimestamp = Math.max(
        timestamp,
        lastMediaPipeTimestamp.value + 1
      );
      lastMediaPipeTimestamp.value = mediaPipeTimestamp;

      // Detect poses in the video frame
      const results = poseLandmarker.detectForVideo(
        videoElement,
        mediaPipeTimestamp
      );
      poseResults.value = results;

      if (results.landmarks && results.landmarks.length > 0) {
        let selectedPose = null;
        let selectedPoseIndex = -1;
        let bestROIMatch = null;

        // Enhanced pose selection with ROI consideration
        for (let i = 0; i < results.landmarks.length; i++) {
          const pose = results.landmarks[i];

          if (detectionSettings.useROI && detectionSettings.roiBox) {
            // Calculate how well this pose fits the current ROI
            const roiValidation = validateROI(pose, detectionSettings.roiBox);

            if (roiValidation.isValid) {
              selectedPose = pose;
              selectedPoseIndex = i;
              bestROIMatch = roiValidation;
              break;
            }
          } else {
            // No ROI constraint, use first valid pose
            selectedPose = pose;
            selectedPoseIndex = i;
            break;
          }
        }

        if (selectedPose) {
          landmarks.value = selectedPose;
          worldLandmarks.value = results.worldLandmarks
            ? results.worldLandmarks[selectedPoseIndex]
            : [];

          // Calculate enhanced ROI for this pose
          const currentROI = detectionSettings.roiBox;
          const newROI = calculateEnhancedROI(selectedPose, currentROI);

          if (newROI) {
            // Update ROI history and metrics
            updateROIHistory(newROI, timestamp);

            // Update current ROI if auto-update is enabled
            if (detectionSettings.useAdaptiveROI) {
              detectionSettings.roiBox = newROI;

              // Predict next frame's ROI
              roiPrediction.value = predictNextROI(newROI);
            }
          }

          // Calculate pose confidence
          const confidence = calculateAverageConfidence(landmarks.value);
          roiConfidence.value = confidence;

          // Update speed calculations with corrected timestamp (in seconds)
          if (
            landmarks.value &&
            landmarks.value.length > 0 &&
            worldLandmarks.value &&
            worldLandmarks.value.length > 0
          ) {
            // DEBUG: Log pose detection timing
            console.log(
              `🤖 [PoseLandmarker] Pose detected - timestamp: ${(
                timestamp / 1000
              ).toFixed(3)}s, frame: ${frameNumber}`
            );

            updateSpeedCalculator(
              landmarks.value,
              worldLandmarks.value,
              timestamp / 1000
            );
          }

          // Store pose data for this frame
          const poseFrameData = {
            landmarks: landmarks.value,
            worldLandmarks: worldLandmarks.value,
            timestamp,
            confidence,
            detected: true,
            inROI: detectionSettings.useROI,
            totalPosesDetected: results.landmarks.length,
            roiFilterApplied: detectionSettings.useROI,
            roiValidation: bestROIMatch,
            roiStability: { ...roiStabilityMetrics },
            enhancedROI: newROI,
            speedMetrics: speedMetrics.isValid ? { ...speedMetrics } : null,
          };

          poseData.set(frameNumber, poseFrameData);

          // Update detection FPS
          const detectionTime = performance.now() - now;
          detectionFPS.value = Math.round(
            1000 / Math.max(detectionTime, minInterval)
          );

          return poseFrameData;
        } else {
          // No valid pose found
          const noPoseData = {
            landmarks: [],
            worldLandmarks: [],
            timestamp,
            confidence: 0,
            detected: false,
            inROI: false,
            reason: detectionSettings.useROI
              ? 'pose_outside_roi'
              : 'no_pose_detected',
            totalPosesDetected: results.landmarks.length,
            roiFilterApplied: detectionSettings.useROI,
            roiStability: { ...roiStabilityMetrics },
          };

          poseData.set(frameNumber, noPoseData);
          return noPoseData;
        }
      } else {
        // No pose detected at all
        const noPoseData = {
          landmarks: [],
          worldLandmarks: [],
          timestamp,
          confidence: 0,
          detected: false,
          totalPosesDetected: 0,
          roiFilterApplied: detectionSettings.useROI,
          roiStability: { ...roiStabilityMetrics },
        };

        poseData.set(frameNumber, noPoseData);
        return noPoseData;
      }
    } catch (err) {
      console.error('Pose detection error:', err);
      error.value = `Pose detection error: ${err.message}`;
      return null;
    } finally {
      isDetecting.value = false;
      isProcessingFrame.value = false;
    }
  };

  // Calculate average confidence from landmarks
  const calculateAverageConfidence = (landmarks) => {
    if (!landmarks || landmarks.length === 0) return 0;

    const totalConfidence = landmarks.reduce((sum, landmark) => {
      return sum + (landmark.visibility || 0);
    }, 0);

    return totalConfidence / landmarks.length;
  };

  // Enhanced ROI setting with validation
  const setROI = (x, y, width, height) => {
    const newROI = {
      x: Math.max(0, Math.min(x, 1)),
      y: Math.max(0, Math.min(y, 1)),
      width: Math.max(
        detectionSettings.roiMinSize.width,
        Math.min(width, 1 - x)
      ),
      height: Math.max(
        detectionSettings.roiMinSize.height,
        Math.min(height, 1 - y)
      ),
    };

    detectionSettings.roiBox = newROI;
    detectionSettings.useROI = true;

    // Reset ROI history when manually setting ROI
    roiHistory.value = [];
    roiPrediction.value = null;
  };

  // Clear ROI and reset tracking
  const clearROI = () => {
    detectionSettings.useROI = false;
    detectionSettings.roiBox = null;
    roiHistory.value = [];
    roiPrediction.value = null;
    roiConfidence.value = 0;

    // Reset stability metrics
    Object.assign(roiStabilityMetrics, {
      averageSize: { width: 0, height: 0 },
      averagePosition: { x: 0, y: 0 },
      velocityEstimate: { x: 0, y: 0 },
      sizeVelocity: { width: 0, height: 0 },
      stabilityScore: 0,
    });
  };

  // Toggle ROI usage
  const toggleROI = () => {
    detectionSettings.useROI = !detectionSettings.useROI;
  };

  // Get pose data for frame with interpolation
  const getPoseForFrame = (frameNumber) => {
    const exactPose = poseData.get(frameNumber);
    if (exactPose) {
      return exactPose;
    }

    // Try to find nearby frames for interpolation
    const nearbyFrames = [];
    const searchRange = detectionSettings.frameSkip * 2;

    for (
      let i = frameNumber - searchRange;
      i <= frameNumber + searchRange;
      i++
    ) {
      const pose = poseData.get(i);
      if (pose && pose.detected) {
        nearbyFrames.push({ frame: i, pose });
      }
    }

    if (nearbyFrames.length > 0) {
      // Return closest frame's data
      nearbyFrames.sort(
        (a, b) =>
          Math.abs(a.frame - frameNumber) - Math.abs(b.frame - frameNumber)
      );
      return nearbyFrames[0].pose;
    }

    return null;
  };

  // Clear all pose data
  const clearAllPoses = () => {
    poseData.clear();
    landmarks.value = [];
    worldLandmarks.value = [];
    poseResults.value = null;
    roiHistory.value = [];
    roiPrediction.value = null;
  };

  // Enable pose detection
  const enablePoseDetection = async () => {
    if (!isInitialized.value) {
      await initialize();
    }
    isEnabled.value = true;
  };

  // Disable pose detection
  const disablePoseDetection = () => {
    isEnabled.value = false;
    // Reset MediaPipe timestamp to prevent timestamp mismatch errors
    lastMediaPipeTimestamp.value = 0;
  };

  // Toggle pose detection
  const togglePoseDetection = async () => {
    if (isEnabled.value) {
      disablePoseDetection();
    } else {
      await enablePoseDetection();
    }
  };

  // Update settings
  const updateSettings = (newSettings) => {
    Object.assign(detectionSettings, newSettings);
  };

  // Convert normalized coordinates to canvas coordinates
  const normalizedToCanvas = (normalizedCoord, canvasWidth, canvasHeight) => {
    return {
      x: normalizedCoord.x * canvasWidth,
      y: normalizedCoord.y * canvasHeight,
    };
  };

  // Get landmark by name
  const getLandmarkByName = (landmarkName, frameNumber = null) => {
    const LANDMARK_NAMES = [
      'nose',
      'left_eye_inner',
      'left_eye',
      'left_eye_outer',
      'right_eye_inner',
      'right_eye',
      'right_eye_outer',
      'left_ear',
      'right_ear',
      'mouth_left',
      'mouth_right',
      'left_shoulder',
      'right_shoulder',
      'left_elbow',
      'right_elbow',
      'left_wrist',
      'right_wrist',
      'left_pinky',
      'right_pinky',
      'left_index',
      'right_index',
      'left_thumb',
      'right_thumb',
      'left_hip',
      'right_hip',
      'left_knee',
      'right_knee',
      'left_ankle',
      'right_ankle',
      'left_heel',
      'right_heel',
      'left_foot_index',
      'right_foot_index',
    ];

    const index = LANDMARK_NAMES.indexOf(landmarkName);
    if (index === -1) return null;

    const currentLandmarks =
      frameNumber !== null
        ? getPoseForFrame(frameNumber)?.landmarks
        : landmarks.value;

    return currentLandmarks?.[index] || null;
  };

  // Get pose confidence
  const getPoseConfidence = (frameNumber = null) => {
    if (frameNumber !== null) {
      const poseFrame = getPoseForFrame(frameNumber);
      return poseFrame?.confidence || 0;
    }
    return roiConfidence.value;
  };

  // Export pose data
  const exportPoseData = (frameNumber = null) => {
    if (frameNumber !== null) {
      return getPoseForFrame(frameNumber);
    }

    return {
      currentFrame: currentFrame.value,
      landmarks: landmarks.value,
      worldLandmarks: worldLandmarks.value,
      confidence: roiConfidence.value,
      roiBox: detectionSettings.roiBox,
      roiStability: { ...roiStabilityMetrics },
      roiHistory: roiHistory.value.slice(-5), // Last 5 frames
      settings: { ...detectionSettings },
    };
  };

  // Keypoint selection methods
  const setSelectedKeypoints = (keypoints) => {
    selectedKeypoints.value = [...keypoints].sort((a, b) => a - b);
  };

  const getSelectedKeypoints = () => {
    return selectedKeypoints.value;
  };

  const isKeypointSelected = (index) => {
    return selectedKeypoints.value.includes(index);
  };

  const getFilteredConnections = () => {
    return POSE_CONNECTIONS.filter(
      (connection) =>
        selectedKeypoints.value.includes(connection[0]) &&
        selectedKeypoints.value.includes(connection[1])
    );
  };

  const getFilteredLandmarks = (landmarks) => {
    return landmarks.filter((_, index) =>
      selectedKeypoints.value.includes(index)
    );
  };

  // RAF-based pose detection for smooth performance
  const detectPoseRAF = (videoElement, onPoseDetected, playbackRate = 1) => {
    if (!poseLandmarker || !isInitialized.value || !isEnabled.value) {
      return;
    }

    const processFrame = async () => {
      if (!isEnabled.value) return;

      try {
        const videoTimestamp = videoElement.currentTime * 1000;
        const frameNumber = Math.floor((videoTimestamp * 30) / 1000);

        const poseData = await detectPose(
          videoElement,
          videoTimestamp,
          frameNumber,
          playbackRate
        );

        if (poseData && onPoseDetected) {
          onPoseDetected(poseData);
        }
      } catch (error) {
        console.error('RAF pose detection error:', error);
      }

      if (isEnabled.value) {
        animationFrameId = requestAnimationFrame(processFrame);
      }
    };

    // Start the RAF loop
    animationFrameId = requestAnimationFrame(processFrame);
  };

  // Stop RAF-based pose detection
  const stopPoseDetectionRAF = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  // Cleanup function
  const cleanup = () => {
    stopPoseDetectionRAF();

    isEnabled.value = false;
    clearAllPoses();
    resetSpeedCalculator();
    // Reset MediaPipe timestamp to prevent timestamp mismatch errors
    lastMediaPipeTimestamp.value = 0;

    if (poseLandmarker) {
      poseLandmarker.close();
      poseLandmarker = null;
    }
  };

  // Get performance statistics
  const getPerformanceStats = () => {
    return {
      detectionFPS: detectionFPS.value,
      isProcessing: isProcessingFrame.value,
      poseDataSize: poseData.size,
      roiStability: roiStabilityMetrics.stabilityScore,
      roiConfidence: roiConfidence.value,
      roiHistoryLength: roiHistory.value.length,
    };
  };

  // Get ROI insights
  const getROIInsights = () => {
    return {
      currentROI: detectionSettings.roiBox,
      predictedROI: roiPrediction.value,
      stability: { ...roiStabilityMetrics },
      history: roiHistory.value.slice(-10),
      confidence: roiConfidence.value,
      settings: {
        smoothingFactor: detectionSettings.roiSmoothingFactor,
        useAdaptiveROI: detectionSettings.useAdaptiveROI,
        useMotionPrediction: detectionSettings.useMotionPrediction,
        roiValidationEnabled: detectionSettings.roiValidationEnabled,
      },
    };
  };

  // Backward compatibility method for getCurrentPose
  const getCurrentPose = computed(() => {
    if (landmarks.value && landmarks.value.length > 0) {
      return {
        landmarks: landmarks.value,
        worldLandmarks: worldLandmarks.value,
        confidence: roiConfidence.value,
        detected: true,
      };
    }
    return {
      landmarks: [],
      worldLandmarks: [],
      confidence: 0,
      detected: false,
    };
  });

  // Backward compatibility method for setCurrentFrame
  const setCurrentFrame = (frameNumber) => {
    currentFrame.value = frameNumber;
  };

  // Cleanup on unmount
  onUnmounted(() => {
    cleanup();
  });

  // Return the enhanced API
  return {
    // State
    isInitialized,
    isLoading,
    error,
    isDetecting,
    isEnabled,
    landmarks,
    worldLandmarks,
    poseResults,
    currentFrame,
    detectionFPS,

    // Enhanced ROI state
    roiHistory,
    roiPrediction,
    roiConfidence,
    roiStabilityMetrics,

    // Speed calculation state
    speedMetrics,
    speedCalculator,

    // Core methods
    initialize,
    detectPose,
    detectPoseRAF,
    stopPoseDetectionRAF,
    enablePoseDetection,
    disablePoseDetection,
    togglePoseDetection,

    // Enhanced ROI methods
    setROI,
    clearROI,
    toggleROI,
    calculateEnhancedROI,
    validateROI,
    predictNextROI,

    // Data methods
    getPoseForFrame,
    clearAllPoses,
    exportPoseData,

    // Utility methods
    normalizedToCanvas,
    getLandmarkByName,
    getPoseConfidence,
    updateSettings,

    // Performance and insights
    getPerformanceStats,
    getROIInsights,

    // Backward compatibility
    getCurrentPose,
    setCurrentFrame,

    // Keypoint selection
    selectedKeypoints,
    setSelectedKeypoints,
    getSelectedKeypoints,
    isKeypointSelected,
    getFilteredConnections,
    getFilteredLandmarks,

    // Configuration
    detectionSettings,
    POSE_CONNECTIONS,
    ROI_KEY_LANDMARKS,
  };
}
