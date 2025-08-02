<script setup>
import {
  ref,
  reactive,
  onMounted,
  watch,
  computed,
  onErrorCaptured,
} from 'vue';
import Timeline from './components/Timeline.vue';
import DualTimeline from './components/DualTimeline.vue';
import AnnotationPanel from './components/AnnotationPanel.vue';
import Login from './components/Login.vue';
import LoadVideoModal from './components/LoadVideoModal.vue';
import ShareModal from './components/ShareModal.vue';
import NotificationToast from './components/NotificationToast.vue';
import UnifiedVideoPlayer from './components/UnifiedVideoPlayer.vue';
import SpeedVisualization from './components/SpeedVisualization.vue';
import SpeedChart from './components/SpeedChart.vue';
import CalibrationControls from './components/CalibrationControls.vue';
import { useAuth } from './composables/useAuth.ts';
import { useVideoAnnotations } from './composables/useVideoAnnotations.ts';
import { useRealtimeAnnotations } from './composables/useRealtimeAnnotations.ts';
import { useVideoSession } from './composables/useVideoSession.ts';
import { useDrawingCanvas } from './composables/useDrawingCanvas.ts';
import { useComparisonVideoWorkflow } from './composables/useComparisonVideoWorkflow.ts';
import { useDualVideoPlayer } from './composables/useDualVideoPlayer.js';
import { usePoseLandmarker } from './composables/usePoseLandmarker.js';
import { useSessionCleanup } from './composables/useSessionCleanup.ts';
import { VideoService } from './services/videoService.ts';
import { AnnotationService } from './services/annotationService.ts';
import { ShareService } from './services/shareService.ts';
import { supabase } from './composables/useSupabase';

// Helper function to get the correct video URL
const getVideoUrl = (video) => {
  // If the video has a URL, use it
  if (video.url && video.url.trim() !== '') {
    return video.url;
  }

  // If it's an uploaded video with a filePath, generate the public URL
  if (video.videoType === 'upload' && video.filePath) {
    const { data } = supabase.storage
      .from('videos')
      .getPublicUrl(video.filePath);
    return data.publicUrl;
  }

  // Fallback to empty string
  return '';
};

// Error handling state
const hasError = ref(false);
const errorMessage = ref('');

// Error boundary
onErrorCaptured((error, instance, info) => {
  console.error('App Error Boundary caught error:', error);
  console.error('Component instance:', instance);
  console.error('Error info:', info);

  hasError.value = true;
  errorMessage.value = error.message || 'An unexpected error occurred';

  // Prevent the error from propagating further
  return false;
});

// Auth
const { user, initAuth, signOut, isLoading } = useAuth();

// Player mode management
const playerMode = ref('single'); // 'single' or 'dual'

// Active video context for dual mode
const activeVideoContext = ref('A'); // 'A' or 'B'

// Unified video state management
const videoState = reactive({
  // Single video properties
  url: '',
  id: 'sample-video-1',
  urlInput: '',

  // Playback state
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  dimensions: { width: 1920, height: 1080 },
  type: null, // Track the current video type for proper deduplication

  // Frame-based state
  currentFrame: 0,
  totalFrames: 0,
  fps: -1, // Will be detected from video
});

// Backward compatibility refs (to avoid breaking existing code)
const videoUrl = computed({
  get: () => videoState.url,
  set: (value) => (videoState.url = value),
});
const videoId = computed({
  get: () => videoState.id,
  set: (value) => (videoState.id = value),
});
const urlInput = computed({
  get: () => videoState.urlInput,
  set: (value) => (videoState.urlInput = value),
});
const currentTime = computed({
  get: () => videoState.currentTime,
  set: (value) => (videoState.currentTime = value),
});
const duration = computed({
  get: () => videoState.duration,
  set: (value) => (videoState.duration = value),
});
const isPlaying = computed({
  get: () => videoState.isPlaying,
  set: (value) => (videoState.isPlaying = value),
});
const videoDimensions = computed({
  get: () => videoState.dimensions,
  set: (value) => (videoState.dimensions = value),
});
const currentVideoType = computed({
  get: () => videoState.type,
  set: (value) => (videoState.type = value),
});
const currentFrame = computed({
  get: () => videoState.currentFrame,
  set: (value) => (videoState.currentFrame = value),
});
const totalFrames = computed({
  get: () => videoState.totalFrames,
  set: (value) => (videoState.totalFrames = value),
});
const fps = computed({
  get: () => videoState.fps,
  set: (value) => (videoState.fps = value),
});

// Dual video player state
const dualVideoPlayer = useDualVideoPlayer();
const dualVideoPlayerRef = ref(null);

// Annotations data
const {
  annotations,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  initializeVideo,
  loadAnnotations,
  loadExistingAnnotations,
  isComparisonContext,
  isLoading: annotationsLoading,
} = useVideoAnnotations(
  videoUrl,
  videoId,
  null,
  computed(() => {
    // Return the actual comparison ID when in dual mode, null otherwise
    if (
      playerMode.value === 'dual' &&
      comparisonWorkflow.currentComparison.value?.id
    ) {
      return comparisonWorkflow.currentComparison.value.id;
    }
    return null;
  })
);

// Annotation handler that routes to appropriate method based on mode
const handleAddAnnotation = async (annotationData) => {
  try {
    if (
      playerMode.value === 'dual' &&
      comparisonWorkflow.currentComparison.value?.id
    ) {
      // In comparison mode, use the useVideoAnnotations addAnnotation method
      // which will handle both the comparison workflow and updating the UI
      const newAnnotation = await addAnnotation(annotationData);
      return newAnnotation;
    } else {
      // In single video mode, use the regular annotation system
      const newAnnotation = await addAnnotation(annotationData);
      return newAnnotation;
    }
  } catch (error) {
    throw error;
  }
};

// Selected annotation
const selectedAnnotation = ref(null);

// Video player reference
const unifiedVideoPlayerRef = ref(null);

// Annotation panel reference
const annotationPanelRef = ref(null);

// Track if annotation form is currently visible
const isAnnotationFormVisible = ref(false);

// Load video modal state
const isLoadModalVisible = ref(false);

// Share modal state
const isShareModalVisible = ref(false);
const isChartVisible = ref(false);
const videoLoaded = ref(false);
const currentVideoId = ref(null);
const currentComparisonId = ref(null);
const isSharedComparison = ref(false);

// Shared video state
const isSharedVideo = ref(false);
const sharedVideoData = ref(null);

// Real-time features
const { isConnected, activeUsers, setupPresenceTracking } =
  useRealtimeAnnotations(videoId, annotations);
const {
  startSession,
  endSession,
  isSessionActive,
  commentPermissions,
  anonymousSession,
  isSharedVideo: isSharedVideoSession,
  createAnonymousSession,
  getCommentContext,
  canComment,
  refreshCommentPermissions,
} = useVideoSession(currentVideoId);

// Drawing functionality
const drawingCanvas = useDrawingCanvas();

// Comparison video workflow
const comparisonWorkflow = useComparisonVideoWorkflow();

// Enhanced Pose detection functionality with fast movements optimization
const poseLandmarker = usePoseLandmarker(); // For single video mode
const poseLandmarkerA = usePoseLandmarker(); // For dual video mode - Video A
const poseLandmarkerB = usePoseLandmarker(); // For dual video mode - Video B

// Session cleanup utility
const { cleanupAllSessionData } = useSessionCleanup();

// Access speed calculator for calibration
const currentSpeedCalculator = computed(() => {
  if (playerMode.value === 'single') {
    return poseLandmarker.speedCalculator;
  } else if (activeVideoContext.value === 'A') {
    return poseLandmarkerA.speedCalculator;
  } else {
    return poseLandmarkerB.speedCalculator;
  }
});

// Calibration state
const isCourtCalibrating = ref(false);
const courtCalibrationPoints = ref([]);
const showCalibrationControls = ref(false);

// Configure all pose landmarkers for fast movements
const configureFastMovements = () => {
  const landmarkers = [poseLandmarker, poseLandmarkerA, poseLandmarkerB];

  landmarkers.forEach((landmarker) => {
    landmarker.updateSettings({
      // High performance setup for fast movements
      roiSmoothingFactor: 0.5, // Less smoothing for responsiveness
      motionPredictionWeight: 0.4, // Higher prediction weight
      adaptiveROIExpansionRate: 0.08, // Faster expansion
      frameSkip: 1, // Process every frame
      maxFPS: 60, // Higher frame rate
      useAdaptiveROI: true,
      useMotionPrediction: true,
      roiValidationEnabled: true,
      roiValidationMinLandmarks: 5,
      roiValidationMinConfidence: 0.4,
    });
  });
};

// Initialize fast movements configuration
configureFastMovements();

watch(
  annotations,
  (newAnnotations) => {
    if (newAnnotations) {
      drawingCanvas.loadDrawingsFromAnnotations(newAnnotations);
    }
  },
  { immediate: true, deep: true }
);

const handleChartToggled = (value) => {
  isChartVisible.value = value;
};

// Event handlers for video player events
const handleTimeUpdate = (data) => {
  currentTime.value = data.currentTime;
  // Also update duration if it's available and not set
  if (data.duration && data.duration > 0 && duration.value !== data.duration) {
    duration.value = data.duration;
  }
};

const handleFrameUpdate = (data) => {
  try {
    if (data && typeof data === 'object') {
      if (typeof data.currentFrame === 'number') {
        currentFrame.value = data.currentFrame;
      }
      if (typeof data.totalFrames === 'number') {
        totalFrames.value = data.totalFrames;
      }
      if (typeof data.fps === 'number') {
        fps.value = data.fps;
      }

      // Update drawing canvas current frame with null check
      if (
        drawingCanvas &&
        drawingCanvas.currentFrame &&
        typeof data.currentFrame === 'number'
      ) {
        drawingCanvas.currentFrame.value = data.currentFrame;
      }
    }
  } catch (error) {
    console.error('Error in handleFrameUpdate:', error);
  }
};

const handleFPSDetected = (data) => {
  try {
    if (data && typeof data === 'object') {
      if (typeof data.fps === 'number') {
        fps.value = data.fps;
      }
      if (typeof data.totalFrames === 'number') {
        totalFrames.value = data.totalFrames;
      }
    }
  } catch (error) {
    console.error('Error in handleFPSDetected:', error);
  }
};

const handlePlay = () => {
  isPlaying.value = true;
};

const handlePause = () => {
  isPlaying.value = false;
};

const handleError = (error) => {};

const handleLoaded = async () => {
  videoLoaded.value = true;
  // Get video dimensions from the video element
  const videoElement =
    playerMode.value === 'single'
      ? unifiedVideoPlayerRef.value?.singleVideoElement
      : unifiedVideoPlayerRef.value?.videoAElement;

  if (videoElement) {
    videoDimensions.value = {
      width: videoElement.videoWidth || 1920,
      height: videoElement.videoHeight || 1080,
    };

    // Update drawing canvas with video dimensions
    drawingCanvas.setVideoSize(
      videoDimensions.value.width,
      videoDimensions.value.height
    );
  }

  if (user.value) {
    const video = await initializeVideo({
      fps: fps.value,
      duration: duration.value,
      totalFrames: totalFrames.value,
      videoType: currentVideoType.value, // Preserve video type for proper deduplication
    });

    // Track the current video ID for sharing
    if (video && video.id) {
      currentVideoId.value = video.id;
    }

    await startSession();

    setupPresenceTracking(user.value.id, user.value.email);
  } else {
  }

  // Initialize pose detection for the appropriate mode
  try {
    if (playerMode.value === 'single') {
      await poseLandmarker.enablePoseDetection();
    } else if (playerMode.value === 'dual') {
      await poseLandmarkerA.enablePoseDetection();
      await poseLandmarkerB.enablePoseDetection();
    }
  } catch (error) {
    console.error('Failed to initialize pose detection:', error);
  }
};

// Timeline event handlers for single video
const handleSeekToTime = (time) => {
  if (unifiedVideoPlayerRef.value?.seekTo) {
    unifiedVideoPlayerRef.value.seekTo(time);
  }
};

// Consolidated dual video event handler
const handleDualVideoAction = (action, context, ...args) => {
  if (!dualVideoPlayer) return;

  const methodName = `${action}Video${context}`;
  if (typeof dualVideoPlayer[methodName] === 'function') {
    dualVideoPlayer[methodName](...args);
  }
};

// Dual timeline event handlers (using consolidated approach)
const handleSeekVideoA = (time) => handleDualVideoAction('seek', 'A', time);
const handleSeekVideoB = (time) => handleDualVideoAction('seek', 'B', time);
const handlePlayVideoA = () => handleDualVideoAction('play', 'A');
const handlePauseVideoA = () => handleDualVideoAction('pause', 'A');
const handlePlayVideoB = () => handleDualVideoAction('play', 'B');
const handlePauseVideoB = () => handleDualVideoAction('pause', 'B');
const handleFrameStepVideoA = (direction) =>
  handleDualVideoAction('stepFrame', 'A', direction);
const handleFrameStepVideoB = (direction) =>
  handleDualVideoAction('stepFrame', 'B', direction);

// Timeline event handlers with fade transition for annotation clicks
const handleSeekToTimeWithFade = async (time) => {
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    // For dual mode, seek both videos to the annotation time
    dualVideoPlayer.seekVideoA(time);
    dualVideoPlayer.seekVideoB(time);
  } else {
    if (
      unifiedVideoPlayerRef.value?.performVideoFadeTransition &&
      unifiedVideoPlayerRef.value?.seekTo
    ) {
      await unifiedVideoPlayerRef.value.performVideoFadeTransition(() => {
        unifiedVideoPlayerRef.value.seekTo(time);
      });
    } else if (unifiedVideoPlayerRef.value?.seekTo) {
      unifiedVideoPlayerRef.value.seekTo(time);
    }
  }
};

const handleAnnotationClick = async (annotation) => {
  selectedAnnotation.value = annotation;

  if (playerMode.value === 'dual' && dualVideoPlayer) {
    // DUAL VIDEO MODE: Restore both videos to their individual frame positions
    if (
      annotation.videoAFrame !== undefined &&
      annotation.videoBFrame !== undefined
    ) {
      // Use the stored frame numbers for each video
      const videoATime =
        annotation.videoATimestamp ||
        annotation.videoAFrame / (dualVideoPlayer.videoAState?.fps || 30);
      const videoBTime =
        annotation.videoBTimestamp ||
        annotation.videoBFrame / (dualVideoPlayer.videoBState?.fps || 30);

      console.log(`🎯 [handleAnnotationClick] Restoring dual video frames:`, {
        videoAFrame: annotation.videoAFrame,
        videoBFrame: annotation.videoBFrame,
        videoATime,
        videoBTime,
      });

      // Seek both videos to their individual positions
      dualVideoPlayer.seekVideoA(videoATime);
      dualVideoPlayer.seekVideoB(videoBTime);
    } else {
      // Fallback: seek both videos to the same timestamp (legacy annotations)
      console.log(
        `🎯 [handleAnnotationClick] Using fallback timestamp for dual video:`,
        annotation.timestamp
      );
      await handleSeekToTimeWithFade(annotation.timestamp);
    }
  } else {
    // SINGLE VIDEO MODE: Use the regular timestamp
    await handleSeekToTimeWithFade(annotation.timestamp);
  }
};

const handleAnnotationEdit = () => {
  // If the annotation panel is not visible, do nothing
  if (!annotationPanelRef.value) return;

  // Set the isEditing state on the annotation panel
  annotationPanelRef.value.isEditing = true;
};

// Controls the drawing functionality
const handleDrawingCreated = (drawingData) => {
  // If the annotation panel is not visible, do nothing
  if (!annotationPanelRef.value) return;

  // Set the drawing data on the annotation panel
  annotationPanelRef.value.setDrawingData(drawingData);
};

const handleDrawingUpdated = (drawingData) => {
  // If the annotation panel is not visible, do nothing
  if (!annotationPanelRef.value) return;

  // Set the drawing data on the annotation panel
  annotationPanelRef.value.setDrawingData(drawingData);
};

const handleDrawingDeleted = () => {
  // If the annotation panel is not visible, do nothing
  if (!annotationPanelRef.value) return;

  // Clear the drawing data on the annotation panel
  annotationPanelRef.value.clearDrawingData();
};

const handleCreateAnonymousSession = async (displayName) => {
  try {
    const session = await createAnonymousSession(displayName);
    return session;
  } catch (error) {
    throw error;
  }
};

// Controls the annotation form visibility in the AnnotationPanel
const handleFormShow = () => {
  isAnnotationFormVisible.value = true;
};

const handleFormHide = () => {
  isAnnotationFormVisible.value = false;
};

// Control playback from the timeline
const handleTimelinePlay = () => {
  if (playerMode.value === 'single' && unifiedVideoPlayerRef.value) {
    unifiedVideoPlayerRef.value.play();
  } else if (playerMode.value === 'dual' && dualVideoPlayer) {
    // In dual mode, play both videos synchronously
    dualVideoPlayer.playVideoA();
    dualVideoPlayer.playVideoB();
  }
};

const handleTimelinePause = () => {
  if (playerMode.value === 'single' && unifiedVideoPlayerRef.value) {
    unifiedVideoPlayerRef.value.pause();
  } else if (playerMode.value === 'dual' && dualVideoPlayer) {
    // In dual mode, pause both videos synchronously
    dualVideoPlayer.pauseVideoA();
    dualVideoPlayer.pauseVideoB();
  }
};

const handleSpeedVisualizationToggled = (isEnabled) => {};

// Show/hide the load video modal
const openLoadModal = () => {
  isLoadModalVisible.value = true;
};

const closeLoadModal = () => {
  isLoadModalVisible.value = false;
};

// Load video from the modal
const loadVideo = (video, type = 'youtube') => {
  videoLoaded.value = false;
  try {
    // Determine the player mode based on whether we have a current comparison
    const isDualMode = comparisonWorkflow.currentComparison.value !== null;
    playerMode.value = isDualMode ? 'dual' : 'single';

    if (playerMode.value === 'dual') {
      // In dual mode, use the comparison workflow to load the video
      if (comparisonWorkflow) {
        comparisonWorkflow.loadVideo(video, type);
      }
    } else {
      // In single mode, load the video directly
      urlInput.value = video.url;
      videoUrl.value = getVideoUrl(video); // Use the helper function here
      videoId.value = video.id;
      currentVideoType.value = type; // Keep track of the video type
    }
  } catch (error) {
    console.error('Failed to load video:', error);
  }
};

// Handle project selection in load modal
const handleProjectSelected = async (project) => {
  if (project.projectType === 'single') {
    // This is a single video project, so we need to load it into the player
    // and also set the annotations

    // First, reset any existing comparison workflow to ensure clean state
    if (comparisonWorkflow) {
      comparisonWorkflow.resetWorkflow();
    }

    const video = {
      id: project.video.id,
      url: project.video.url, // Use the correct video URL from the project
    };

    // Load the video into the player
    loadVideo(video, 'upload'); // Assuming all projects are from uploads for now

    // Set the current video ID for annotations and sharing
    currentVideoId.value = project.video.id;

    // Load annotations for the video
    await loadAnnotations(project.video.id);
  } else if (project.projectType === 'dual') {
    // This is a comparison project, so we need to load it into the comparison workflow
    if (comparisonWorkflow) {
      await comparisonWorkflow.loadComparisonVideo(project.comparisonVideo);
      playerMode.value = 'dual'; // Switch to dual mode
    }
  }

  // Close the modal after selection
  closeLoadModal();
};

// Handle video loaded in dual mode
const handleDualVideoLoaded = () => {
  if (dualVideoPlayerRef.value) {
    const videoAState = dualVideoPlayerRef.value.videoAState;
    const videoBState = dualVideoPlayerRef.value.videoBState;

    if (
      videoAState.duration > 0 &&
      videoAState.fps > 0 &&
      videoBState.duration > 0 &&
      videoBState.fps > 0
    ) {
      if (comparisonWorkflow) {
        comparisonWorkflow.setDualVideoReady(true);
      }
    }
  }
};

// Show/hide the share modal
const shareModalProps = computed(() => {
  if (playerMode.value === 'dual') {
    return {
      videoId: null,
      comparisonId: comparisonWorkflow.currentComparison.value?.id || null,
      shareType: 'comparison',
    };
  }
  return {
    videoId: currentVideoId.value,
    comparisonId: null,
    shareType: 'video',
  };
});

const canShare = computed(() => {
  return (
    (playerMode.value === 'single' && currentVideoId.value) ||
    (playerMode.value === 'dual' &&
      comparisonWorkflow.currentComparison.value?.id)
  );
});

const openShareModal = () => {
  if (canShare.value) {
    isShareModalVisible.value = true;
  }
};

const closeShareModal = () => {
  isShareModalVisible.value = false;
};

// Handle shared video/comparison link
onMounted(async () => {
  await initAuth();

  const urlParams = new URLSearchParams(window.location.search);
  const shareId = urlParams.get('share');

  if (shareId) {
    try {
      const shareData = await ShareService.getSharedItem(shareId);

      if (shareData.video_id) {
        // This is a shared video
        isSharedVideo.value = true;
        const video = await VideoService.get(shareData.video_id);
        if (video) {
          sharedVideoData.value = video;
          loadVideo(
            {
              id: video.id,
              url: video.url,
            },
            'shared'
          );
        }
      } else if (shareData.comparison_id) {
        // This is a shared comparison
        isSharedComparison.value = true;
        if (comparisonWorkflow) {
          await comparisonWorkflow.loadComparisonVideo({
            id: shareData.comparison_id,
          });
          playerMode.value = 'dual'; // Set to dual mode for comparison
        }
      }
    } catch (error) {
      console.error('Failed to load shared content:', error);
    }
  } else if (!user.value) {
    // If no share link and not logged in, show the login page
  }
});

// Watch for changes in player mode to adjust UI if needed
watch(playerMode, (newMode) => {
  // Reset any relevant state when switching modes
  if (newMode === 'single') {
    // Clear comparison data if switching back to single mode
    if (comparisonWorkflow) {
      comparisonWorkflow.resetWorkflow();
    }
  }
});

// Enhanced ROI State Management for Fast Movements
const currentPoseLandmarker = computed(() => {
  if (playerMode.value === 'single') return poseLandmarker;
  if (activeVideoContext.value === 'A') return poseLandmarkerA;
  return poseLandmarkerB;
});

const isROICalibrating = computed(
  () => currentPoseLandmarker.value.isROICalibrating.value
);

const roiPoints = computed(() => currentPoseLandmarker.value.roiPoints.value);

const handleSetROI = (points) => {
  currentPoseLandmarker.value.setROI(points);
};

const handleResetROI = () => {
  currentPoseLandmarker.value.resetROI();
};

const handleToggleROICalibration = () => {
  currentPoseLandmarker.value.toggleROICalibration();
};

const handleKeypointSelection = (keypoint, isSelected) => {
  currentPoseLandmarker.value.updateSelectedKeypoints(keypoint, isSelected);
};

// Calibration Controls
const handleStartCourtCalibration = () => {
  if (currentSpeedCalculator.value) {
    currentSpeedCalculator.value.startCourtCalibration();
  }
};

const handleSetPlayerHeight = (height) => {
  if (currentSpeedCalculator.value) {
    currentSpeedCalculator.value.setPlayerHeight(height);
  }
};

const handleSetCourtDimensions = (dimensions) => {
  if (currentSpeedCalculator.value) {
    currentSpeedCalculator.value.setCourtDimensions(dimensions);
  }
};

const handleSetCourtReferencePoints = (points) => {
  if (currentSpeedCalculator.value) {
    currentSpeedCalculator.value.setCourtReferencePoints(points);
  }
};

const toggleCalibrationControls = () => {
  showCalibrationControls.value = !showCalibrationControls.value;
};

const handleResetCalibration = () => {
  if (currentSpeedCalculator.value) {
    currentSpeedCalculator.value.resetCalibration();
  }
};

const handleSpeedData = (data) => {
  if (currentSpeedCalculator.value) {
    currentSpeedCalculator.value.addSpeedData(
      data.speed,
      data.timestamp,
      data.frame
    );
  }
};

const currentSpeedMetrics = computed(() => {
  return currentSpeedCalculator.value?.speedMetrics;
});

// Logout and cleanup
const handleSignOut = async () => {
  try {
    await signOut();
    await cleanupAllSessionData();
  } catch (error) {
    console.error('Error during sign out and cleanup:', error);
  }
};

watch(
  () => user.value,
  (newUser) => {
    if (newUser && newUser.id) {
      if (currentVideoId.value) {
        startSession();
        setupPresenceTracking(newUser.id, newUser.email);
      }
    } else {
      endSession();
    }
  },
  { immediate: true }
);

// Graceful exit -- DC
// onBeforeUnmount(async () => {
//   if (isSessionActive.value) {
//     console.log('Session is active');
//     try {
//       // await endSession(); // MH: This is causing issues with sign out
//     } catch (error) {
//       console.error('Failed to end session on unmount:', error);
//     }
//   }
// });
</script>

<template>
  <!-- Error state -->
  <div
    v-if="hasError"
    class="min-h-screen bg-red-50 flex items-center justify-center p-4"
  >
    <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
      <div class="flex items-center mb-4">
        <svg
          class="w-8 h-8 text-red-500 mr-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z"
          ></path>
        </svg>
        <h2 class="text-lg font-semibold text-gray-900">
          Something went wrong
        </h2>
      </div>

      <p class="text-gray-600 mb-4">{{ errorMessage }}</p>

      <div class="flex space-x-3">
        <button
          @click="
            hasError = false;
            errorMessage = '';
          "
          class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
        <button
          @click="window.location.reload()"
          class="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
        >
          Reload Page
        </button>
      </div>
    </div>
  </div>

  <!-- Loading state while auth is initializing -->
  <div
    v-else-if="isLoading"
    class="min-h-screen bg-white flex items-center justify-center"
  >
    <div class="text-center">
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"
      ></div>
      <p class="text-gray-600">Loading...</p>
    </div>
  </div>

  <!-- Main app when user is authenticated OR when viewing shared video/comparison -->
  <div
    v-else-if="user || isSharedVideo || isSharedComparison"
    class="min-h-screen bg-white flex flex-col"
  >
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <h1 class="text-xl font-medium text-gray-900">
            ACCIO Video Annotation
          </h1>
          <span
            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200"
          >
            ALPHA
          </span>
        </div>

        <!-- Action Buttons (only for authenticated users) -->
        <div
          v-if="user && !isSharedVideo && !isSharedComparison"
          class="flex items-center space-x-4"
        >
          <!-- Load Previous Videos Button -->
          <button
            @click="openLoadModal"
            class="p-2 text-gray-600 hover:text-green-600 hover:bg-gray-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            title="Upload video"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              ></path>
            </svg>
          </button>

          <!-- Share Video Button -->
          <button
            @click="openShareModal"
            :disabled="!canShare"
            class="p-2 text-gray-600 hover:text-purple-600 hover:bg-gray-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:text-gray-300 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Share current video"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
              ></path>
            </svg>
          </button>
        </div>

        <!-- Shared Video/Comparison Info -->
        <div
          v-if="isSharedVideo || isSharedComparison"
          class="flex items-center space-x-2 text-sm text-gray-600"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
            ></path>
          </svg>
          <span class="font-medium">
            {{
              isSharedComparison
                ? 'Shared Comparison (View Only)'
                : 'Shared Video (View Only)'
            }}
          </span>
        </div>

        <!-- User Info and Sign Out (for authenticated users) -->
        <div v-else-if="user" class="flex items-center space-x-4">
          <div class="flex items-center space-x-2 text-sm text-gray-600">
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              ></path>
            </svg>
            <span class="font-medium">{{ user?.email || 'Loading...' }}</span>
          </div>
          <button
            @click="signOut"
            class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 flex overflow-hidden">
      <!-- Main App Content -->
      <!-- Video Section -->
      <section class="flex-1 flex flex-col bg-black min-w-0 overflow-hidden">
        <div class="flex-1 flex items-center justify-center p-6">
          <div class="flex flex-col items-center">
            <div class="relative">
              <!-- Unified Video Player -->
              <UnifiedVideoPlayer
                ref="unifiedVideoPlayerRef"
                :mode="playerMode"
                :video-url="videoUrl"
                :video-id="videoId"
                :drawing-canvas="drawingCanvas"
                :video-a-url="dualVideoPlayer?.videoAUrl.value"
                :video-a-id="dualVideoPlayer?.videoAId.value || 'video-a'"
                :video-b-url="dualVideoPlayer?.videoBUrl.value"
                :video-b-id="dualVideoPlayer?.videoBId.value || 'video-b'"
                :drawing-canvas-a="dualVideoPlayer?.drawingCanvasA"
                :drawing-canvas-b="dualVideoPlayer?.drawingCanvasB"
                :video-a-state="dualVideoPlayer?.videoAState"
                :video-b-state="dualVideoPlayer?.videoBState"
                :dual-video-player="dualVideoPlayer"
                :project-id="
                  comparisonWorkflow.currentComparison.value?.project_id
                "
                :comparison-video-id="
                  comparisonWorkflow.currentComparison.value?.id
                "
                :user="user"
                :pose-landmarker="poseLandmarker"
                :pose-landmarker-a="poseLandmarkerA"
                :pose-landmarker-b="poseLandmarkerB"
                :enable-pose-detection="true"
                @time-update="handleTimeUpdate"
                @frame-update="handleFrameUpdate"
                @fps-detected="handleFPSDetected"
                @loaded="handleLoaded"
                @video-a-loaded="handleDualVideoLoaded"
                @video-b-loaded="handleDualVideoLoaded"
                @drawing-created="handleDrawingCreated"
                @drawing-updated="handleDrawingUpdated"
                @drawing-deleted="handleDrawingDeleted"
              />

              <!-- Speed Visualization Overlay -->
              <SpeedVisualization
                :speed-metrics="currentSpeedMetrics"
                :canvas-width="videoDimensions.width"
                :canvas-height="videoDimensions.height"
                :current-timestamp="currentTime"
                :current-frame="currentFrame"
                :show-speed="true"
                :show-center-of-mass="true"
                :show-velocity-vector="true"
                :show-speed-panel="true"
                :show-labels="true"
                :show-velocity-components="false"
                :show-co-m-coordinates="false"
                :show-toggle-control="true"
                @speed-visualization-toggled="handleSpeedVisualizationToggled"
                :video-loaded="videoLoaded"
              />
            </div>
            <SpeedChart
              v-if="isChartVisible"
              :speed-metrics="currentSpeedMetrics"
              :timestamp="currentTime"
              :current-frame="currentFrame"
              @chart-toggled="handleChartToggled"
            />
          </div>
        </div>

        <!-- Timeline -->
        <div class="bg-gray-900 p-4 border-t border-gray-800">
          <!-- Single Video Timeline -->
          <Timeline
            v-if="playerMode === 'single'"
            :current-time="currentTime"
            :duration="duration"
            :current-frame="currentFrame"
            :total-frames="totalFrames"
            :fps="fps"
            :annotations="annotations"
            :selected-annotation="selectedAnnotation"
            :is-playing="isPlaying"
            :player-mode="playerMode"
            @seek-to-time="handleSeekToTime"
            @annotation-click="handleAnnotationClick"
            @play="handleTimelinePlay"
            @pause="handleTimelinePause"
          />

          <!-- Dual Video Timeline -->
          <DualTimeline
            v-else-if="playerMode === 'dual'"
            :video-a-current-time="
              dualVideoPlayer?.videoACurrentTime?.value || 0
            "
            :video-a-duration="dualVideoPlayer?.videoAState?.duration || 0"
            :video-a-current-frame="
              dualVideoPlayer?.videoACurrentFrame?.value || 0
            "
            :video-a-total-frames="
              dualVideoPlayer?.videoAState?.totalFrames || 0
            "
            :video-a-fps="dualVideoPlayer?.videoAState?.fps || 30"
            :video-a-state="
              dualVideoPlayer?.videoAState || { fps: 30, duration: 0 }
            "
            :video-b-current-time="
              dualVideoPlayer?.videoBCurrentTime?.value || 0
            "
            :video-b-duration="dualVideoPlayer?.videoBState?.duration || 0"
            :video-b-current-frame="
              dualVideoPlayer?.videoBCurrentFrame?.value || 0
            "
            :video-b-total-frames="
              dualVideoPlayer?.videoBState?.totalFrames || 0
            "
            :video-b-fps="dualVideoPlayer?.videoBState?.fps || 30"
            :video-b-state="
              dualVideoPlayer?.videoBState || { fps: 30, duration: 0 }
            "
            :annotations="annotations"
            :selected-annotation="selectedAnnotation"
            :video-a-playing="dualVideoPlayer?.videoAIsPlaying?.value || false"
            :video-b-playing="dualVideoPlayer?.videoBIsPlaying?.value || false"
            @seek-video-a="handleSeekVideoA"
            @seek-video-b="handleSeekVideoB"
            @annotation-click="handleAnnotationClick"
            @play-video-a="handlePlayVideoA"
            @pause-video-a="handlePauseVideoA"
            @play-video-b="handlePlayVideoB"
            @pause-video-b="handlePauseVideoB"
            @frame-step-video-a="handleFrameStepVideoA"
            @frame-step-video-b="handleFrameStepVideoB"
          />
        </div>
      </section>

      <!-- Sidebar with Calibration and Annotation Panel -->
      <aside
        class="w-96 min-w-96 max-w-96 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden"
      >
        <!-- Calibration Controls -->
        <div class="flex-shrink-0 border-b border-gray-200">
          <!-- Toggle Button -->
          <div class="p-3 bg-gray-50 border-b border-gray-200">
            <button
              @click="toggleCalibrationControls"
              class="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-md p-2 hover:bg-gray-100 transition-colors"
            >
              <span class="flex items-center">
                <svg
                  class="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
                  ></path>
                </svg>
                Speed Calibration
              </span>
              <svg
                :class="[
                  'w-4 h-4 transition-transform duration-200',
                  showCalibrationControls ? 'rotate-180' : 'rotate-0',
                ]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                ></path>
              </svg>
            </button>
          </div>

          <!-- Calibration Controls Panel -->
          <div v-if="showCalibrationControls" class="p-4">
            <CalibrationControls
              v-if="currentSpeedCalculator"
              :calibration-settings="currentSpeedCalculator.calibrationSettings"
              :speed-metrics="currentSpeedCalculator.speedMetrics"
              :video-dimensions="videoDimensions"
              :on-set-player-height="handleSetPlayerHeight"
              :on-set-court-dimensions="handleSetCourtDimensions"
              :on-set-court-reference-points="handleSetCourtReferencePoints"
              :on-reset-calibration="handleResetCalibration"
              @start-court-calibration="handleStartCourtCalibration"
            />
          </div>
        </div>

        <!-- Annotation Panel -->
        <div class="flex-1 overflow-hidden">
          <AnnotationPanel
            v-if="drawingCanvas"
            ref="annotationPanelRef"
            :annotations="annotations || []"
            :selected-annotation="selectedAnnotation"
            :current-time="currentTime || 0"
            :current-frame="currentFrame || 0"
            :fps="fps || 30"
            :drawing-canvas="drawingCanvas"
            :read-only="(isSharedVideo || isSharedComparison) && !canComment()"
            :video-id="currentVideoId"
            :loading="annotationsLoading"
            :is-dual-mode="playerMode === 'dual'"
            :drawing-canvas-a="dualVideoPlayer?.drawingCanvasA || null"
            :drawing-canvas-b="dualVideoPlayer?.drawingCanvasB || null"
            :dual-video-player="dualVideoPlayer || null"
            :comment-permissions="commentPermissions || {}"
            :anonymous-session="anonymousSession || null"
            :is-shared-video="isSharedVideo || isSharedComparison"
            :comment-context="getCommentContext()"
            :drawing-canvas-ref="
              unifiedVideoPlayerRef?.singleDrawingCanvasRef || null
            "
            :drawing-canvas-a-ref="
              unifiedVideoPlayerRef?.drawingCanvasARef || null
            "
            :drawing-canvas-b-ref="
              unifiedVideoPlayerRef?.drawingCanvasBRef || null
            "
            :video-a-current-frame="
              dualVideoPlayer?.videoACurrentFrame?.value || 0
            "
            :video-b-current-frame="
              dualVideoPlayer?.videoBCurrentFrame?.value || 0
            "
            :video-a-fps="dualVideoPlayer?.videoAState?.fps || 30"
            :video-b-fps="dualVideoPlayer?.videoBState?.fps || 30"
            @add-annotation="handleAddAnnotation"
            @update-annotation="updateAnnotation"
            @delete-annotation="deleteAnnotation"
            @select-annotation="handleAnnotationClick"
            @annotation-edit="handleAnnotationEdit"
            @form-show="handleFormShow"
            @form-hide="handleFormHide"
            @pause="handleTimelinePause"
            @drawing-created="handleDrawingCreated"
            @create-anonymous-session="handleCreateAnonymousSession"
          />
          <div
            v-else
            class="flex items-center justify-center h-full text-gray-500"
          >
            <div class="text-center">
              <svg
                class="w-8 h-8 mx-auto mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
                ></path>
              </svg>
              <p class="text-sm">Initializing annotation panel...</p>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- Load Video Modal -->
    <LoadVideoModal
      :is-visible="isLoadModalVisible"
      @close="closeLoadModal"
      @project-selected="handleProjectSelected"
    />

    <!-- Share Video Modal -->
    <ShareModal
      :is-visible="isShareModalVisible"
      :video-id="shareModalProps.videoId"
      :comparison-id="shareModalProps.comparisonId"
      :share-type="shareModalProps.shareType"
      @close="closeShareModal"
    />
  </div>
  <!-- Login component when user is not authenticated -->
  <div v-else>
    <Login />
  </div>

  <!-- Notification Toast - Always visible -->
  <NotificationToast />
</template>

<style scoped>
/* Custom styles if needed */
</style>
