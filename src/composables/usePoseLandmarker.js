import { ref, reactive, onUnmounted, computed } from 'vue';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

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
  const segmentationMasks = ref([]);

  // Frame-based pose data storage
  const poseData = reactive(new Map()); // frame -> pose results
  const currentFrame = ref(0);

  // Performance tracking
  const lastDetectionTime = ref(0);
  const detectionFPS = ref(0);
  const frameProcessingQueue = ref([]);
  const isProcessingFrame = ref(false);
  let animationFrameId = null;

  // Keypoint selection state
  const selectedKeypoints = ref(Array.from({ length: 33 }, (_, i) => i)); // All keypoints selected by default

  // Performance settings optimized for real-time
  const detectionSettings = reactive({
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.3, // Lower for better performance
    minPosePresenceConfidence: 0.3, // Lower for better performance
    minTrackingConfidence: 0.3, // Lower for better performance
    outputSegmentationMasks: false,
    frameSkip: 2, // Process every 2nd frame for better performance
    maxFPS: 30, // Limit detection FPS
    useRequestAnimationFrame: false, // Disable RAF for now, use timeupdate events
    useROI: false, // Enable region of interest filtering
    roiBox: null, // ROI bounding box { x, y, width, height } in normalized coordinates
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

  // Landmark names for reference
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

  // Initialize MediaPipe pose landmarker
  const initialize = async () => {
    if (isInitialized.value) {
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      console.log(
        '🤖 [usePoseLandmarker] Initializing MediaPipe pose landmarker...'
      );

      // Initialize the MediaPipe FilesetResolver
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm'
      );

      // Create pose landmarker with configuration
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
      console.log(
        '✅ [usePoseLandmarker] MediaPipe pose landmarker initialized successfully'
      );
    } catch (err) {
      console.error(
        '❌ [usePoseLandmarker] Failed to initialize pose landmarker:',
        err
      );
      error.value = `Failed to initialize pose landmarker: ${err.message}`;
    } finally {
      isLoading.value = false;
    }
  };

  // Optimized pose detection with frame rate limiting
  const detectPose = async (videoElement, timestamp, frameNumber) => {
    if (!poseLandmarker || !isInitialized.value || !isEnabled.value) {
      return null;
    }

    // FPS limiting - don't process if we're exceeding maxFPS
    const now = performance.now();
    const timeSinceLastDetection = now - lastDetectionTime.value;
    const minInterval = 1000 / detectionSettings.maxFPS;

    if (timeSinceLastDetection < minInterval) {
      return getPoseForFrame(frameNumber);
    }

    // Skip frames based on performance settings
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

      // Detect poses in the video frame
      const results = poseLandmarker.detectForVideo(videoElement, timestamp);

      // Store results
      poseResults.value = results;

      if (results.landmarks && results.landmarks.length > 0) {
        // Filter poses based on ROI if enabled
        let selectedPose = null;
        let selectedPoseIndex = -1;

        for (let i = 0; i < results.landmarks.length; i++) {
          const pose = results.landmarks[i];
          if (isPoseInROI(pose)) {
            selectedPose = pose;
            selectedPoseIndex = i;
            break; // Use first pose that matches ROI
          }
        }

        if (selectedPose) {
          landmarks.value = selectedPose;
          worldLandmarks.value = results.worldLandmarks
            ? results.worldLandmarks[selectedPoseIndex]
            : [];

          // Store pose data for this frame
          const poseFrameData = {
            landmarks: landmarks.value,
            worldLandmarks: worldLandmarks.value,
            timestamp,
            confidence: calculateAverageConfidence(landmarks.value),
            detected: true,
            inROI: detectionSettings.useROI,
            totalPosesDetected: results.landmarks.length,
            roiFilterApplied: detectionSettings.useROI,
          };

          poseData.set(frameNumber, poseFrameData);

          // Update detection FPS
          const detectionTime = performance.now() - now;
          detectionFPS.value = Math.round(
            1000 / Math.max(detectionTime, minInterval)
          );

          console.log('✅ [usePoseLandmarker] Pose accepted:', {
            frame: frameNumber,
            totalDetected: results.landmarks.length,
            roiEnabled: detectionSettings.useROI,
            confidence: poseFrameData.confidence,
          });

          return poseFrameData;
        } else {
          // Poses detected but none in ROI
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
          };

          poseData.set(frameNumber, noPoseData);

          console.log('❌ [usePoseLandmarker] Pose rejected:', {
            frame: frameNumber,
            totalDetected: results.landmarks.length,
            roiEnabled: detectionSettings.useROI,
            reason: noPoseData.reason,
          });

          return noPoseData;
        }
      } else {
        // No pose detected
        const noPoseData = {
          landmarks: [],
          worldLandmarks: [],
          timestamp,
          confidence: 0,
          detected: false,
          totalPosesDetected: 0,
          roiFilterApplied: detectionSettings.useROI,
        };

        poseData.set(frameNumber, noPoseData);
        return noPoseData;
      }
    } catch (err) {
      console.error('❌ [usePoseLandmarker] Error detecting pose:', err);
      error.value = `Pose detection error: ${err.message}`;
      return null;
    } finally {
      isDetecting.value = false;
      isProcessingFrame.value = false;
    }
  };

  // Optimized pose detection with requestAnimationFrame
  const detectPoseRAF = (videoElement, onPoseDetected) => {
    if (!poseLandmarker || !isInitialized.value || !isEnabled.value) {
      return;
    }

    const processFrame = async () => {
      if (!videoElement || videoElement.paused || videoElement.ended) {
        return;
      }

      const timestamp = videoElement.currentTime * 1000; // Convert to milliseconds for MediaPipe
      const frameNumber = currentFrame.value; // Use the current frame from video player

      try {
        const poseData = await detectPose(videoElement, timestamp, frameNumber);
        if (poseData && onPoseDetected) {
          onPoseDetected(poseData);
        }
      } catch (error) {
        console.error(
          '❌ [usePoseLandmarker] RAF pose detection error:',
          error
        );
      }

      // Continue processing if enabled
      if (isEnabled.value && detectionSettings.useRequestAnimationFrame) {
        animationFrameId = requestAnimationFrame(processFrame);
      }
    };

    // Start the animation frame loop
    if (detectionSettings.useRequestAnimationFrame) {
      animationFrameId = requestAnimationFrame(processFrame);
    }
  };

  // Stop requestAnimationFrame loop
  const stopPoseDetectionRAF = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
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

  // Check if pose is within ROI bounds
  const isPoseInROI = (landmarks) => {
    // If ROI is not enabled, accept all poses
    if (!detectionSettings.useROI || !detectionSettings.roiBox) {
      return true;
    }

    // If no landmarks provided, reject
    if (!landmarks || landmarks.length === 0) {
      return false;
    }

    const roi = detectionSettings.roiBox;

    // Get key landmarks for torso and upper body (more comprehensive check)
    const keyLandmarks = [
      landmarks[11], // left_shoulder
      landmarks[12], // right_shoulder
      landmarks[13], // left_elbow
      landmarks[14], // right_elbow
      landmarks[23], // left_hip
      landmarks[24], // right_hip
      landmarks[0], // nose (head position)
    ].filter((landmark) => landmark && landmark.visibility > 0.3);

    // If no key landmarks are visible enough, reject the pose
    if (keyLandmarks.length === 0) {
      console.log(
        '🎯 [usePoseLandmarker] No visible key landmarks for ROI check'
      );
      return false;
    }

    // Count how many key landmarks are within ROI
    let landmarksInROI = 0;
    const landmarkPositions = [];

    keyLandmarks.forEach((landmark) => {
      const isLandmarkInROI =
        landmark.x >= roi.x &&
        landmark.x <= roi.x + roi.width &&
        landmark.y >= roi.y &&
        landmark.y <= roi.y + roi.height;

      landmarkPositions.push({
        x: landmark.x,
        y: landmark.y,
        inROI: isLandmarkInROI,
      });

      if (isLandmarkInROI) {
        landmarksInROI++;
      }
    });

    // Require at least 60% of key landmarks to be within ROI
    const requiredPercentage = 0.6;
    const isInROI = landmarksInROI / keyLandmarks.length >= requiredPercentage;

    // Calculate pose center for logging
    const avgX =
      keyLandmarks.reduce((sum, landmark) => sum + landmark.x, 0) /
      keyLandmarks.length;
    const avgY =
      keyLandmarks.reduce((sum, landmark) => sum + landmark.y, 0) /
      keyLandmarks.length;

    console.log('🎯 [usePoseLandmarker] ROI check:', {
      poseCenter: { x: avgX, y: avgY },
      roi: roi,
      landmarksInROI: landmarksInROI,
      totalKeyLandmarks: keyLandmarks.length,
      percentage: Math.round((landmarksInROI / keyLandmarks.length) * 100),
      requiredPercentage: Math.round(requiredPercentage * 100),
      isInROI: isInROI,
      landmarkPositions: landmarkPositions,
    });

    return isInROI;
  };

  // Set ROI bounding box
  const setROI = (x, y, width, height) => {
    detectionSettings.roiBox = {
      x: Math.max(0, Math.min(x, 1)),
      y: Math.max(0, Math.min(y, 1)),
      width: Math.max(0, Math.min(width, 1 - x)),
      height: Math.max(0, Math.min(height, 1 - y)),
    };
    detectionSettings.useROI = true;
    console.log('🎯 [usePoseLandmarker] ROI set:', detectionSettings.roiBox);
  };

  // Clear ROI
  const clearROI = () => {
    detectionSettings.useROI = false;
    detectionSettings.roiBox = null;
    console.log('🎯 [usePoseLandmarker] ROI cleared');
  };

  // Toggle ROI usage
  const toggleROI = () => {
    detectionSettings.useROI = !detectionSettings.useROI;
    console.log(
      '🎯 [usePoseLandmarker] ROI toggled:',
      detectionSettings.useROI
    );
  };

  // Keypoint selection methods
  const setSelectedKeypoints = (keypoints) => {
    selectedKeypoints.value = [...keypoints].sort((a, b) => a - b);
    console.log(
      '🎯 [usePoseLandmarker] Selected keypoints updated:',
      selectedKeypoints.value
    );
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
    if (!landmarks || landmarks.length === 0) return [];
    return landmarks.filter((_, index) =>
      selectedKeypoints.value.includes(index)
    );
  };

  // Optimized pose data retrieval with interpolation
  const getPoseForFrame = (frameNumber) => {
    // Try exact frame first
    const exactPose = poseData.get(frameNumber);
    if (exactPose) {
      return exactPose;
    }

    // If no exact match, try to find nearby frames for interpolation
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

    // Return the closest frame's pose if available
    if (nearbyFrames.length > 0) {
      const closest = nearbyFrames.reduce((prev, curr) =>
        Math.abs(curr.frame - frameNumber) < Math.abs(prev.frame - frameNumber)
          ? curr
          : prev
      );
      return closest.pose;
    }

    return null;
  };

  // Get current frame pose data
  const getCurrentPose = computed(() => {
    return getPoseForFrame(currentFrame.value);
  });

  // Check if pose is detected for current frame
  const hasPoseOnCurrentFrame = computed(() => {
    const pose = getCurrentPose.value;
    return pose && pose.detected && pose.landmarks.length > 0;
  });

  // Get all frames with pose data
  const getFramesWithPoses = computed(() => {
    return Array.from(poseData.keys()).sort((a, b) => a - b);
  });

  // Clear pose data for specific frame
  const clearPoseForFrame = (frameNumber) => {
    poseData.delete(frameNumber);
  };

  // Clear all pose data
  const clearAllPoses = () => {
    poseData.clear();
    poseResults.value = null;
    landmarks.value = [];
    worldLandmarks.value = [];
  };

  // Enable pose detection
  const enablePoseDetection = async () => {
    if (!isInitialized.value) {
      await initialize();
    }
    isEnabled.value = true;
    console.log('✅ [usePoseLandmarker] Pose detection enabled');
  };

  // Disable pose detection
  const disablePoseDetection = () => {
    isEnabled.value = false;
    console.log('⏹️ [usePoseLandmarker] Pose detection disabled');
  };

  // Toggle pose detection
  const togglePoseDetection = async () => {
    if (isEnabled.value) {
      disablePoseDetection();
    } else {
      await enablePoseDetection();
    }
  };

  // Update detection settings
  const updateSettings = (newSettings) => {
    Object.assign(detectionSettings, newSettings);
    console.log('⚙️ [usePoseLandmarker] Settings updated:', detectionSettings);
  };

  // Set current frame (for syncing with video player)
  const setCurrentFrame = (frameNumber) => {
    currentFrame.value = frameNumber;
  };

  // Convert normalized coordinates to canvas coordinates
  const normalizedToCanvas = (normalizedCoord, canvasWidth, canvasHeight) => {
    return {
      x: normalizedCoord.x * canvasWidth,
      y: normalizedCoord.y * canvasHeight,
      z: normalizedCoord.z || 0,
    };
  };

  // Get landmark by name
  const getLandmarkByName = (landmarkName, frameNumber = null) => {
    const frame = frameNumber !== null ? frameNumber : currentFrame.value;
    const pose = getPoseForFrame(frame);

    if (!pose || !pose.landmarks) return null;

    const index = LANDMARK_NAMES.indexOf(landmarkName);
    if (index === -1) return null;

    return pose.landmarks[index] || null;
  };

  // Get pose confidence for frame
  const getPoseConfidence = (frameNumber = null) => {
    const frame = frameNumber !== null ? frameNumber : currentFrame.value;
    const pose = getPoseForFrame(frame);
    return pose ? pose.confidence : 0;
  };

  // Export pose data for annotation system
  const exportPoseData = (frameNumber = null) => {
    const frame = frameNumber !== null ? frameNumber : currentFrame.value;
    const pose = getPoseForFrame(frame);

    if (!pose || !pose.detected) return null;

    return {
      type: 'pose',
      frame,
      timestamp: pose.timestamp,
      landmarks: pose.landmarks,
      worldLandmarks: pose.worldLandmarks,
      confidence: pose.confidence,
      connections: POSE_CONNECTIONS,
      landmarkNames: LANDMARK_NAMES,
    };
  };

  // Optimized cleanup with RAF cleanup
  const cleanup = () => {
    // Stop any running animation frames
    stopPoseDetectionRAF();

    if (poseLandmarker) {
      poseLandmarker.close();
      poseLandmarker = null;
    }
    clearAllPoses();
    isInitialized.value = false;
    isEnabled.value = false;
    isProcessingFrame.value = false;
    frameProcessingQueue.value = [];
    console.log('🧹 [usePoseLandmarker] Cleanup completed');
  };

  // Performance monitoring
  const getPerformanceStats = () => {
    return {
      detectionFPS: detectionFPS.value,
      isProcessing: isProcessingFrame.value,
      cacheSize: poseData.size,
      frameSkip: detectionSettings.frameSkip,
      maxFPS: detectionSettings.maxFPS,
    };
  };

  // Dynamic performance adjustment
  const adjustPerformanceSettings = (targetFPS = 30) => {
    const currentFPS = detectionFPS.value;

    if (currentFPS < targetFPS * 0.8) {
      // Performance is too low, reduce quality
      detectionSettings.frameSkip = Math.min(
        detectionSettings.frameSkip + 1,
        4
      );
      detectionSettings.minPoseDetectionConfidence = Math.max(
        detectionSettings.minPoseDetectionConfidence - 0.1,
        0.1
      );
    } else if (currentFPS > targetFPS * 1.2) {
      // Performance is good, can increase quality
      detectionSettings.frameSkip = Math.max(
        detectionSettings.frameSkip - 1,
        1
      );
      detectionSettings.minPoseDetectionConfidence = Math.min(
        detectionSettings.minPoseDetectionConfidence + 0.05,
        0.7
      );
    }

    console.log('⚙️ [usePoseLandmarker] Performance adjusted:', {
      targetFPS,
      currentFPS,
      frameSkip: detectionSettings.frameSkip,
      confidence: detectionSettings.minPoseDetectionConfidence,
    });
  };

  // Cleanup on unmount
  onUnmounted(() => {
    cleanup();
  });

  return {
    // State
    isInitialized,
    isLoading,
    error,
    isDetecting,
    isEnabled,
    poseResults,
    landmarks,
    worldLandmarks,
    currentFrame,
    detectionSettings,
    selectedKeypoints,

    // Performance state
    detectionFPS,
    isProcessingFrame,

    // Computed
    getCurrentPose,
    hasPoseOnCurrentFrame,
    getFramesWithPoses,

    // Constants
    POSE_CONNECTIONS,
    LANDMARK_NAMES,

    // Methods
    initialize,
    detectPose,
    detectPoseRAF,
    stopPoseDetectionRAF,
    getPoseForFrame,
    clearPoseForFrame,
    clearAllPoses,
    enablePoseDetection,
    disablePoseDetection,
    togglePoseDetection,
    updateSettings,
    setCurrentFrame,
    normalizedToCanvas,
    getLandmarkByName,
    getPoseConfidence,
    exportPoseData,
    cleanup,

    // Performance methods
    getPerformanceStats,
    adjustPerformanceSettings,

    // ROI methods
    setROI,
    clearROI,
    toggleROI,
    isPoseInROI,

    // Keypoint selection methods
    setSelectedKeypoints,
    getSelectedKeypoints,
    isKeypointSelected,
    getFilteredConnections,
    getFilteredLandmarks,
  };
}
