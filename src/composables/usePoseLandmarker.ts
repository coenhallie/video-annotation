/**
 * usePoseLandmarker.ts
 * TypeScript conversion from JS with preserved API and typing.
 */
import { ref, reactive, onUnmounted, computed, type Ref } from 'vue';
import {
  FilesetResolver,
  PoseLandmarker,
  // RunningMode is not exported by the lib types; we will use string literal types instead
} from '@mediapipe/tasks-vision';
import { useSpeedCalculator } from './useSpeedCalculator';

type Landmark = { x: number; y: number; z?: number; visibility?: number };
type WorldLandmark = { x: number; y: number; z: number; visibility?: number };

export interface PoseFrameData {
  landmarks: Landmark[];
  worldLandmarks: WorldLandmark[] | [];
  timestamp: number; // ms
  confidence: number;
  detected: boolean;
  inROI: boolean;
  totalPosesDetected: number;
  roiFilterApplied: boolean;
  roiValidation: any;
  roiStability: {
    averageSize: { width: number; height: number };
    averagePosition: { x: number; y: number };
    velocityEstimate: { x: number; y: number };
    sizeVelocity: { width: number; height: number };
    stabilityScore: number;
  };
  enhancedROI: ROI | null;
  speedMetrics: any;
}

export interface ROI {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionSettings {
  // Use literal union instead of importing RunningMode from the lib (not exported)
  runningMode: 'VIDEO' | 'IMAGE' | 'LIVE_STREAM';
  numPoses: number;
  minPoseDetectionConfidence: number;
  minPosePresenceConfidence: number;
  minTrackingConfidence: number;
  outputSegmentationMasks: boolean;
  frameSkip: number;
  maxFPS: number;
  useRequestAnimationFrame: boolean;

  // ROI settings
  useROI: boolean;
  roiBox: ROI | null;

  // ROI Stability Settings
  roiSmoothingFactor: number;
  roiHistoryLength: number;
  roiExpansionFactor: number;
  roiMinSize: { width: number; height: number };
  roiMaxSize: { width: number; height: number };

  // Adaptive ROI Settings
  useAdaptiveROI: boolean;
  adaptiveROIConfidenceThreshold: number;
  adaptiveROIExpansionRate: number;
  adaptiveROIShrinkRate: number;

  // Motion Prediction Settings
  useMotionPrediction: boolean;
  motionPredictionWeight: number;
  maxMotionPredictionDistance: number;

  // ROI Validation Settings
  roiValidationEnabled: boolean;
  roiValidationMinLandmarks: number;
  roiValidationMinConfidence: number;

  // Fallback Settings
  roiFallbackToFullFrame: boolean;
  roiFallbackFrameCount: number;
  roiFallbackRecoveryFrames: number;
}

export interface UsePoseLandmarker {
  // State
  isInitialized: Ref<boolean>;
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
  isDetecting: Ref<boolean>;
  isEnabled: Ref<boolean>;

  // Pose detection state
  poseResults: Ref<any>;
  landmarks: Ref<Landmark[]>;
  worldLandmarks: Ref<WorldLandmark[]>;
  currentFrame: Ref<number>;
  selectedKeypoints: Ref<number[]>;

  // Performance
  detectionFPS: Ref<number>;

  // ROI state
  roiHistory: Ref<Array<{ roi: ROI; timestamp: number }>>;
  roiPrediction: Ref<ROI | null>;
  roiConfidence: Ref<number>;
  roiStabilityMetrics: {
    averageSize: { width: number; height: number };
    averagePosition: { x: number; y: number };
    velocityEstimate: { x: number; y: number };
    sizeVelocity: { width: number; height: number };
    stabilityScore: number;
  };
  detectionSettings: DetectionSettings;

  // Speed metrics passthrough
  speedMetrics: any;
  selectedKeypointsComputed: Ref<number[]>;

  // API
  initialize: () => Promise<void>;
  detectPose: (
    videoElement: HTMLVideoElement,
    timestamp: number,
    frameNumber: number,
    playbackRate?: number
  ) => Promise<PoseFrameData | null>;
  getPoseForFrame: (frameNumber: number) => PoseFrameData | null;
  setEnabled: (enabled: boolean) => void;
  reset: () => void;
  destroy: () => void;
  getCurrentPose: Ref<PoseFrameData | null>;
}

export function usePoseLandmarker(): UsePoseLandmarker {
  // State
  const isInitialized = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const isDetecting = ref(false);
  const isEnabled = ref(false);

  // Pose landmarker instance
  let poseLandmarker: any = null;

  // Pose detection state
  const poseResults = ref<any>(null);
  const landmarks = ref<Landmark[]>([]);
  const worldLandmarks = ref<WorldLandmark[]>([]);

  // Frame-based pose data storage
  const poseData = reactive(new Map<number, PoseFrameData>()); // frame -> pose results
  const currentFrame = ref(0);

  // Keypoint selection state
  const selectedKeypoints = ref<number[]>(
    Array.from({ length: 33 }, (_, i) => i)
  ); // All keypoints selected by default

  // Speed calculation integration
  const speedCalculator = useSpeedCalculator();
  const {
    speedMetrics,
    update: updateSpeedCalculator,
    reset: resetSpeedCalculator,
  } = speedCalculator as any;

  // Performance tracking
  const lastDetectionTime = ref(0);
  const detectionFPS = ref(0);
  const frameProcessingQueue = ref<number[]>([]);
  const isProcessingFrame = ref(false);
  let animationFrameId: number | null = null;

  // MediaPipe timestamp management
  const lastMediaPipeTimestamp = ref(0);

  // Enhanced ROI tracking state
  const roiHistory = ref<Array<{ roi: ROI; timestamp: number }>>([]); // Store ROI history for temporal smoothing
  const roiPrediction = ref<ROI | null>(null); // Predicted ROI for next frame
  const roiConfidence = ref(0); // Confidence in current ROI
  const roiStabilityMetrics = reactive({
    averageSize: { width: 0, height: 0 },
    averagePosition: { x: 0, y: 0 },
    velocityEstimate: { x: 0, y: 0 },
    sizeVelocity: { width: 0, height: 0 },
    stabilityScore: 0,
  });

  // Enhanced performance settings with ROI optimizations
  const detectionSettings = reactive<DetectionSettings>({
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

  // Pose landmark connections for skeleton visualization (kept for parity)
  const POSE_CONNECTIONS: number[][] = [
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
  const ROI_KEY_LANDMARKS: number[] = [
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
        // Cast runningMode to any to satisfy stricter library typings across versions
        runningMode: detectionSettings.runningMode as unknown as any,
        numPoses: detectionSettings.numPoses,
        minPoseDetectionConfidence:
          detectionSettings.minPoseDetectionConfidence,
        minPosePresenceConfidence: detectionSettings.minPosePresenceConfidence,
        minTrackingConfidence: detectionSettings.minTrackingConfidence,
        outputSegmentationMasks: detectionSettings.outputSegmentationMasks,
      });

      isInitialized.value = true;
    } catch (err: any) {
      error.value = `Failed to initialize pose landmarker: ${err.message}`;
    } finally {
      isLoading.value = false;
    }
  };

  // Enhanced ROI calculation with temporal smoothing
  const calculateEnhancedROI = (
    landmarksArr: Landmark[],
    previousROI: ROI | null = null
  ): ROI | null => {
    if (!landmarksArr || landmarksArr.length === 0) {
      return null;
    }

    // Get key landmarks for ROI calculation
    const keyLandmarks = ROI_KEY_LANDMARKS.map(
      (index) => landmarksArr[index]
    ).filter(
      (landmark) => landmark && (landmark.visibility ?? 0) > 0.3
    ) as Landmark[];

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
    let rawROI: ROI = {
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
  const updateROIHistory = (roi: ROI, videoTimestamp: number | null = null) => {
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
  const predictNextROI = (currentROI: ROI | null): ROI | null => {
    if (!currentROI || !detectionSettings.useMotionPrediction) {
      return currentROI;
    }

    if (roiHistory.value.length < 2) {
      return currentROI;
    }

    // Use velocity estimate to predict next position
    const velocity = roiStabilityMetrics.velocityEstimate;
    const frameTime = 1 / detectionSettings.maxFPS; // Assume consistent frame rate

    let predictedROI: ROI = {
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
  const validateROI = (landmarksArr: Landmark[], roi: ROI | null) => {
    if (!detectionSettings.roiValidationEnabled || !landmarksArr || !roi) {
      return { isValid: true, reason: 'validation_disabled' };
    }

    // Count landmarks within ROI
    let landmarksInROI = 0;
    let totalConfidence = 0;
    let validLandmarks = 0;

    ROI_KEY_LANDMARKS.forEach((index) => {
      const landmark = landmarksArr[index];
      if (landmark && (landmark.visibility ?? 0) > 0.3) {
        validLandmarks++;
        totalConfidence += landmark.visibility ?? 0;

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

  const calculateAverageConfidence = (lms: Landmark[]) => {
    if (!lms || lms.length === 0) return 0;
    const confidences = lms.map((l) => l.visibility ?? 0).filter((v) => v > 0);
    if (confidences.length === 0) return 0;
    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  };

  // Enhanced pose detection with improved ROI handling
  const detectPose = async (
    videoElement: HTMLVideoElement,
    timestamp: number,
    frameNumber: number,
    playbackRate = 1
  ): Promise<PoseFrameData | null> => {
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
        let selectedPose: Landmark[] | null = null;
        let selectedPoseIndex = -1;
        let bestROIMatch: any = null;

        // Enhanced pose selection with ROI consideration
        for (let i = 0; i < results.landmarks.length; i++) {
          const pose = results.landmarks[i] as Landmark[];

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
            ? (results.worldLandmarks[selectedPoseIndex] as WorldLandmark[])
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
            updateSpeedCalculator(
              landmarks.value,
              worldLandmarks.value,
              timestamp / 1000
            );
          }

          // Store pose data for this frame
          const poseFrameData: PoseFrameData = {
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
            speedMetrics: (speedMetrics as any).isValid
              ? { ...(speedMetrics as any) }
              : null,
          };

          (poseData as Map<number, PoseFrameData>).set(
            frameNumber,
            poseFrameData
          );

          // Update detection FPS
          const detectionTime = performance.now() - now;
          detectionFPS.value = Math.round(
            1000 / Math.max(detectionTime, minInterval)
          );

          return poseFrameData;
        }
      }

      // No pose found
      const emptyData: PoseFrameData = {
        landmarks: [],
        worldLandmarks: [],
        timestamp,
        confidence: 0,
        detected: false,
        inROI: !!detectionSettings.useROI,
        totalPosesDetected: 0,
        roiFilterApplied: !!detectionSettings.useROI,
        roiValidation: null,
        roiStability: { ...roiStabilityMetrics },
        enhancedROI: null,
        speedMetrics: null,
      };

      (poseData as Map<number, PoseFrameData>).set(frameNumber, emptyData);

      return emptyData;
    } catch (err: any) {
      error.value = `Failed to detect pose: ${err.message}`;
      return null;
    } finally {
      isDetecting.value = false;
      isProcessingFrame.value = false;
    }
  };

  const getPoseForFrame = (frameNumber: number): PoseFrameData | null => {
    return (poseData as Map<number, PoseFrameData>).get(frameNumber) ?? null;
  };

  const setEnabled = (enabled: boolean) => {
    isEnabled.value = enabled;
  };

  const reset = () => {
    (poseData as Map<number, PoseFrameData>).clear();
    roiHistory.value = [];
    roiPrediction.value = null;
    roiConfidence.value = 0;
    roiStabilityMetrics.averageSize = { width: 0, height: 0 };
    roiStabilityMetrics.averagePosition = { x: 0, y: 0 };
    roiStabilityMetrics.velocityEstimate = { x: 0, y: 0 };
    roiStabilityMetrics.sizeVelocity = { width: 0, height: 0 };
    roiStabilityMetrics.stabilityScore = 0;
    resetSpeedCalculator();
  };

  const destroy = () => {
    try {
      // if poseLandmarker has a close() method, call it to free resources
      if (poseLandmarker && typeof poseLandmarker.close === 'function') {
        poseLandmarker.close();
      }
    } catch {
      // ignore
    }
    isEnabled.value = false;
    isInitialized.value = false;
    isLoading.value = false;
    error.value = null;
    (poseData as Map<number, PoseFrameData>).clear();
  };

  // Current pose helper
  const getCurrentPose = computed<PoseFrameData | null>(() => {
    return (
      (poseData as Map<number, PoseFrameData>).get(currentFrame.value) ?? null
    );
  });

  // Expose selected keypoints as a computed ref (for API parity)
  const selectedKeypointsComputed = computed(() => selectedKeypoints.value);

  // Cleanup on unmount
  onUnmounted(() => {
    destroy();
  });

  return {
    // State
    isInitialized,
    isLoading,
    error,
    isDetecting,
    isEnabled,

    // Pose detection state
    poseResults,
    landmarks,
    worldLandmarks,
    currentFrame,
    selectedKeypoints,

    // Performance
    detectionFPS,

    // ROI state
    roiHistory,
    roiPrediction,
    roiConfidence,
    roiStabilityMetrics,
    detectionSettings,

    // Speed metrics
    speedMetrics,

    // API
    initialize,
    detectPose,
    getPoseForFrame,
    setEnabled,
    reset,
    destroy,
    getCurrentPose,
    selectedKeypointsComputed,
  };
}
