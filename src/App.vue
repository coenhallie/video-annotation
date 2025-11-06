<script setup lang="ts">
import {
  ref,
  reactive,
  onMounted,
  watch,
  computed,
  onErrorCaptured,
  onBeforeUnmount,
  type ComponentPublicInstance,
  type Ref,
} from 'vue';
import DualTimeline from './components/DualTimeline.vue';
import VideoTimeline from './components/VideoTimeline.vue';
import AnnotationPanel from './components/AnnotationPanel.vue';
import Login from './components/Login.vue';
import ResetPassword from './components/ResetPassword.vue';
import SharedVideoAuthPrompt from './components/SharedVideoAuthPrompt.vue';
import ProjectManagementModal from './components/ProjectManagementModal.vue';
import CreateComparisonModal from './components/CreateComparisonModal.vue';
import ShareModal from './components/ShareModal.vue';
import SharedLinksManagement from './components/SharedLinksManagement.vue';
import NotificationToast from './components/NotificationToast.vue';
import VideoUpload from './components/VideoUpload.vue';
import UnifiedVideoPlayer from './components/UnifiedVideoPlayer.vue';
import SpeedVisualization from './components/SpeedVisualization.vue';
import CalibrationControls from './components/CalibrationControls.vue';
import CalibrationOverlay from './components/CalibrationOverlay.vue';
import CalibrationModal from './components/CalibrationModal.vue';
import CalibrationLinesOverlay from './components/CalibrationLinesOverlay.vue';
import { useAuth } from './composables/useAuth';
import { useVideoAnnotations } from './composables/useVideoAnnotations';
import { useRealtimeAnnotations } from './composables/useRealtimeAnnotations';
import { useVideoSession } from './composables/useVideoSession';
import { useDrawingCanvas } from './composables/useDrawingCanvas';
import { useComparisonVideoWorkflow } from './composables/useComparisonVideoWorkflow';
import { useDualVideoPlayer } from './composables/useDualVideoPlayer';
import { usePoseLandmarker } from './composables/usePoseLandmarker';
import { useSessionCleanup } from './composables/useSessionCleanup';
import { useNotifications } from './composables/useNotifications';
import { ShareService } from './services/shareService';
import { supabase } from './composables/useSupabase';
import type { Video, ComparisonVideo, Annotation } from './types/database';

// Helper function to get the correct video URL
const getVideoUrl = (video: any) => {
  if (video.url && video.url.trim() !== '') {
    return video.url;
  }
  if (video.videoType === 'upload' && video.filePath) {
    const { data } = supabase.storage
      .from('videos')
      .getPublicUrl(video.filePath);
    return data.publicUrl;
  }
  return '';
};

type VideoSourceLike = Partial<Video> & { id: string };

type UnifiedVideoPlayerExpose = {
  seekTo: (time: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  performVideoFadeTransition: (fn: () => void) => Promise<void>;
  singleVideoElement: Ref<HTMLVideoElement | null>;
  videoAElement: Ref<HTMLVideoElement | null>;
  videoBElement: Ref<HTMLVideoElement | null>;
  singleDrawingCanvasRef: Ref<unknown>;
  drawingCanvasARef: Ref<unknown>;
  drawingCanvasBRef: Ref<unknown>;
  getCalibrationState: () => unknown;
  getCurrentVideoElement: () => HTMLVideoElement | null;
  getCurrentVideoContainer: () => HTMLElement | null;
};

type UnifiedVideoPlayerInstance = ComponentPublicInstance<
  Record<string, never>,
  UnifiedVideoPlayerExpose
>;

// Error handling state
const hasError = ref(false);
const errorMessage = ref('');

onErrorCaptured((error: any, instance: any, info: string) => {
  console.error('App Error Boundary caught error:', error);
  console.error('Component instance:', instance);
  console.error('Error info:', info);
  hasError.value = true;
  errorMessage.value = error.message || 'An unexpected error occurred';
  return false;
});

// Auth
const { user, initAuth, signOut, isLoading: authLoading } = useAuth();

// Password reset flow
const isPasswordReset = ref(false);
const isAppLoading = ref(true); // Separate loading state for the app

// Computed property to determine overall loading state
const isLoading = computed(() => {
  // If we're in password reset mode, don't show loading
  if (isPasswordReset.value) {
    return false;
  }
  // Otherwise, use the combined loading state
  return isAppLoading.value || authLoading.value;
});

// Check for password reset token in URL
const checkPasswordResetToken = () => {
  // Supabase appends the recovery token to the hash like:
  // #access_token=xxx&refresh_token=xxx&expires_in=3600&token_type=bearer&type=recovery
  const fullHash = window.location.hash;
  console.log('Checking for password reset token, full hash:', fullHash);

  // Handle both single and double hash scenarios
  let hash = fullHash.substring(1);

  // If we have double hash like #recovery#access_token=..., extract the second part
  if (hash.includes('#')) {
    const parts = hash.split('#');
    hash = parts[parts.length - 1] || ''; // Get the last part which should have the token
  }

  const hashParams = new URLSearchParams(hash);
  const type = hashParams.get('type');
  const accessToken = hashParams.get('access_token');
  const error = hashParams.get('error');
  const errorCode = hashParams.get('error_code');

  console.log('Parsed hash params:', {
    type,
    hasAccessToken: !!accessToken,
    error,
    errorCode,
  });

  // Check if this is a password recovery flow
  if (type === 'recovery' && accessToken) {
    console.log('Password recovery token detected!');
    isPasswordReset.value = true;
    // Store the recovery token for later use
    sessionStorage.setItem('recovery_token', accessToken);
    return true;
  }

  // Also check if the hash contains 'type=recovery'
  if (fullHash.includes('type=recovery')) {
    console.log('Recovery type found in hash');
    isPasswordReset.value = true;
    return true;
  }

  // Check if we have a stored recovery session
  const storedRecoveryToken = sessionStorage.getItem('recovery_token');
  if (storedRecoveryToken) {
    console.log('Found stored recovery token');
    isPasswordReset.value = true;
    return true;
  }

  return false;
};

const handlePasswordResetComplete = () => {
  isPasswordReset.value = false;
  // Clear the URL hash and stored recovery token
  window.location.hash = '';
  sessionStorage.removeItem('recovery_token');
  // Reload to properly initialize the app with the new session
  window.location.reload();
};

// Player mode management
const playerMode = ref<'single' | 'dual'>('single');

// Active video context for dual mode
const activeVideoContext = ref('A'); // 'A' or 'B'

// Unified video state management
const videoState = reactive({
  url: '',
  id: 'sample-video-1',
  urlInput: '',
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  dimensions: { width: 1920, height: 1080 },
  type: null as any,
  currentFrame: 0,
  totalFrames: 0,
  fps: -1,
});

// Backward compatibility refs
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

// Drawing functionality
const drawingCanvas = useDrawingCanvas();
const drawingCanvasA = useDrawingCanvas();
const drawingCanvasB = useDrawingCanvas();

// Dual video player state
const dualVideoPlayer = useDualVideoPlayer();
const dualVideoPlayerRef = ref(null);

dualVideoPlayer.drawingCanvasA = drawingCanvasA;
dualVideoPlayer.drawingCanvasB = drawingCanvasB;

// Comparison video workflow
const comparisonWorkflow = useComparisonVideoWorkflow();

// Project ID for annotation isolation
const currentProjectId = computed(() => {
  if (
    playerMode.value === 'dual' &&
    comparisonWorkflow.currentComparison.value?.id
  ) {
    // In dual mode, use comparison ID as project ID
    return comparisonWorkflow.currentComparison.value.id;
  } else if (currentVideoId.value) {
    // In single mode, use video ID as project ID
    return currentVideoId.value;
  }
  return null;
});

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
  currentProjectId,
  computed(() => {
    if (
      playerMode.value === 'dual' &&
      comparisonWorkflow.currentComparison.value?.id
    ) {
      return comparisonWorkflow.currentComparison.value.id;
    }
    return null;
  })
);

const handleAddAnnotation = async (annotationData: any) => {
  return await addAnnotation(annotationData);
};

const selectedAnnotation = ref<Annotation | null>(null);

// Component Refs
const unifiedVideoPlayerRef = ref<UnifiedVideoPlayerInstance | null>(null);
const annotationPanelRef = ref(null);

const isAnnotationFormVisible = ref(false);
const isLoadModalVisible = ref(false);
const isComparisonModalVisible = ref(false);
const isShareModalVisible = ref(false);
const isSharedLinksManagementVisible = ref(false);
const isVideoUploadVisible = ref(false);
const isChartVisible = ref(false);
const videoLoaded = ref(false);
const currentVideoId = ref<string | null>(null);

const currentComparisonId = ref<string | null>(null);
const isSharedComparison = ref(false);
const isSharedVideo = ref(false);
const sharedVideoData = ref<any>(null);

// Shared video authentication state
const showAuthPrompt = ref(false);
const userDeclinedAuth = ref(false);
const pendingSharedContent = ref<{type: 'video' | 'comparison', id: string, data: any} | null>(null);

// Real-time features
const { isConnected, activeUsers, setupPresenceTracking } =
  useRealtimeAnnotations(videoId, annotations);
// Use either currentVideoId or currentComparisonId depending on mode
const activeContentId = computed(() => {
  return currentComparisonId.value || currentVideoId.value;
});

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
} = useVideoSession(activeContentId);

watch(
  () => comparisonWorkflow.currentComparison.value,
  async (comp) => {
    console.log('🧭 [App] comparison.currentComparison changed:', {
      hasComp: !!comp,
      videoAId: comp?.videoAId,
      videoBId: comp?.videoBId,
      hasVideoA: !!comp?.videoA,
      hasVideoB: !!comp?.videoB,
    });

    if (!dualVideoPlayer) return;

    if (!comp) {
      if (dualVideoPlayer.setVideoSources) {
        dualVideoPlayer.setVideoSources(null, null);
      } else {
        if (dualVideoPlayer.videoAUrl) dualVideoPlayer.videoAUrl.value = '';
        if (dualVideoPlayer.videoBUrl) dualVideoPlayer.videoBUrl.value = '';
      }
      return;
    }

    let videoA: VideoSourceLike = comp.videoA
      ? { ...comp.videoA }
      : ({ id: comp.videoAId } as VideoSourceLike);
    let videoB: VideoSourceLike = comp.videoB
      ? { ...comp.videoB }
      : ({ id: comp.videoBId } as VideoSourceLike);

    const ensureVideoHydrated = async (
      vid: VideoSourceLike
    ): Promise<VideoSourceLike> => {
      if (vid && (vid.url || vid.filePath)) return vid;
      try {
        const { data, error } = await supabase
          .from('videos')
          .select('*')
          .eq('id', vid?.id)
          .single();
        if (error) {
          console.warn('⚠️ [App] Hydrate watcher: failed for', vid?.id, error);
          return vid;
        }
        return (data as VideoSourceLike) || vid;
      } catch (e) {
        console.warn('⚠️ [App] Hydrate watcher: exception for', vid?.id, e);
        return vid;
      }
    };

    if (!videoA?.url && !videoA?.filePath)
      videoA = await ensureVideoHydrated(videoA);
    if (!videoB?.url && !videoB?.filePath)
      videoB = await ensureVideoHydrated(videoB);

    const aUrl = getVideoUrl(videoA) || '';
    const bUrl = getVideoUrl(videoB) || '';
    console.log('🧭 [App] Watcher computed URLs:', { aUrl, bUrl });

    if (dualVideoPlayer.setVideoSources) {
      dualVideoPlayer.setVideoSources(
        { url: aUrl, id: videoA.id || comp.videoAId || 'video-a' },
        { url: bUrl, id: videoB.id || comp.videoBId || 'video-b' }
      );
    } else {
      if (dualVideoPlayer.videoAUrl) dualVideoPlayer.videoAUrl.value = aUrl;
      if (dualVideoPlayer.videoBUrl) dualVideoPlayer.videoBUrl.value = bUrl;
      if (dualVideoPlayer.videoAId)
        dualVideoPlayer.videoAId.value =
          videoA.id || comp.videoAId || 'video-a';
      if (dualVideoPlayer.videoBId)
        dualVideoPlayer.videoBId.value =
          videoB.id || comp.videoBId || 'video-b';
    }
  },
  { immediate: true, deep: true }
);

// Enhanced Pose detection functionality with fast movements optimization
const poseLandmarker = usePoseLandmarker();
const poseLandmarkerA = usePoseLandmarker();
const poseLandmarkerB = usePoseLandmarker();

const { cleanupAllSessionData, cleanupForProjectSwitch } = useSessionCleanup();

const currentSpeedCalculator = computed(() => {
  if (playerMode.value === 'single') {
    return poseLandmarker.speedCalculator;
  } else if (activeVideoContext.value === 'A') {
    return poseLandmarkerA.speedCalculator;
  } else {
    return poseLandmarkerB.speedCalculator;
  }
});

const isCourtCalibrating = ref(false);
const courtCalibrationPoints = ref([]);
const showCalibrationControls = ref(false);

// Camera calibration state
const showCalibrationOverlay = ref(false);
const showCalibrationModal = ref(false);

// Import calibration utilities
import { useCameraCalibration } from './composables/useCameraCalibration';
import { imageToWorld } from './utils/calibrationTransforms';

// Initialize camera calibration composable
const cameraCalibration = useCameraCalibration();

// Initialize notifications
const { success: showSuccess, error: showError, info: showInfo } =
  useNotifications();

// Calibration lines overlay state
const showCalibrationLines = ref(false);
const calibrationLines = ref<any[]>([]);

// Calibration data refs
const calibrationTransformData = ref<any>(null);
const calibrationSuccessData = ref<{
  accuracy: number;
  error: string;
} | null>(null);

// Handle calibration modal completion
const handleCalibrationModalComplete = async (data: any) => {
  console.log('CalibrationModal completed - processing data:', data);
  showCalibrationModal.value = false;

  // Process the calibration data to generate homography
  if (data && data.drawnLines && data.drawnLines.length >= 3) {
    // Map drawn lines to court coordinates based on their order
    // Badminton court dimensions (in meters):
    // - Total length: 13.4m (6.7m on each side of net)
    // - Total width (doubles): 6.1m (3.05m on each side of center)
    // - Short service line: 1.98m from net
    // - Long service line (doubles): 0.76m from back boundary
    //
    // COORDINATE SYSTEM: Origin (0,0) at center of court (net center)
    // X-axis: left (-) to right (+)
    // Y-axis: far court (-) to near court (+)

    // Use the same coordinate system as useCameraCalibration.ts
    const width = 6.1; // Court width (doubles)
    const length = 13.4; // Court length
    const doubleServiceDistance = 0.76; // from baseline
    const shortServiceDistance = 1.98; // from net

    const courtLines = [
      // Line 1: Back boundary (doubles long service line) - horizontal line
      // For near court side (camera side)
      [
        { x: -width / 2, y: length / 2 - doubleServiceDistance }, // Left edge: (-3.05, 5.94)
        { x: width / 2, y: length / 2 - doubleServiceDistance }, // Right edge: (3.05, 5.94)
      ],
      // Line 2: Center line - vertical line dividing left/right courts
      // From short service line to back boundary
      [
        { x: 0, y: -shortServiceDistance }, // Net end: (0, -1.98)
        { x: 0, y: length / 2 - doubleServiceDistance }, // Back end: (0, 5.94)
      ],
      // Line 3: Short service line - horizontal line
      // On the far court side (opposite from camera)
      [
        { x: -width / 2, y: shortServiceDistance }, // Left edge: (-3.05, 1.98)
        { x: width / 2, y: shortServiceDistance }, // Right edge: (3.05, 1.98)
      ],
    ];

    // Calculate homography if we have enough lines
    try {
      // Clear previous calibration
      cameraCalibration.resetCalibration();

      // Set up court lines
      cameraCalibration.selectedCourtLines.value = [
        {
          id: 'court-line-0',
          type: 'service-long-doubles' as const,
          courtPoints: courtLines[0]!,
          isParallel: true,
          color: '#3b82f6',
        },
        {
          id: 'court-line-1',
          type: 'center-line' as const,
          courtPoints: courtLines[1]!,
          isParallel: false,
          color: '#22c55e',
        },
        {
          id: 'court-line-2',
          type: 'service-short' as const,
          courtPoints: courtLines[2]!,
          isParallel: true,
          color: '#ef4444',
        },
      ];

      // Set up drawn video lines
      console.log('Drawn lines from modal (normalized):', data.drawnLines);
      cameraCalibration.drawnVideoLines.value = data.drawnLines
        .filter((line: any) => line && line.start && line.end)
        .map((line: any, index: number) => {
          const videoWidth = line.videoDimensions?.width;
          const videoHeight = line.videoDimensions?.height;

          const fallbackDims = cameraCalibration.getCurrentVideoDimensions();
          const width = videoWidth && videoWidth > 0 ? videoWidth : fallbackDims.width;
          const height = videoHeight && videoHeight > 0 ? videoHeight : fallbackDims.height;

          const startPixel = {
            x: line.start.x * width,
            y: line.start.y * height,
          };
          const endPixel = {
            x: line.end.x * width,
            y: line.end.y * height,
          };

          console.log(
            `Line ${index}: start(${startPixel.x.toFixed(2)}, ${startPixel.y.toFixed(2)}) -> end(${endPixel.x.toFixed(2)}, ${endPixel.y.toFixed(2)}) (width=${width}, height=${height})`
          );

          return {
            id: `video-line-${index}`,
            points: [startPixel, endPixel],
            timestamp: Date.now(),
            confidence: 0.9,
          };
        });

      // Create line correspondences
      console.log('Creating line correspondences:');
      data.drawnLines.forEach((line: any, index: number) => {
        if (line && line.start && line.end && index < 3) {
          console.log(
            `Correspondence ${index}: court-line-${index} <-> video-line-${index}`
          );
          console.log(`  Court line ${index}:`, courtLines[index]);
          console.log(
            `  Video line ${index}: (${line.start.x}, ${line.start.y}) -> (${line.end.x}, ${line.end.y})`
          );
          cameraCalibration.createLineCorrespondence(
            `court-line-${index}`,
            `video-line-${index}`
          );
        }
      });

      // Set camera position from the modal data before calculating
      if (data.cameraPosition) {
        console.log('Setting camera position:', data.cameraPosition);
        cameraCalibration.cameraParameters.position = {
          x: data.cameraPosition.x,
          y: data.cameraPosition.y,
          z: data.cameraPosition.z,
        };
      }

      // Calculate camera parameters (this will compute the homography)
      const calibrationResult =
        await cameraCalibration.calculateCameraParameters();

      console.log('Calibration result:', calibrationResult);
      console.log(
        'Homography matrix:',
        cameraCalibration.homographyMatrix.value
      );
      console.log(
        'Calibration confidence:',
        cameraCalibration.calibrationConfidence.value
      );
      console.log(
        'Calibration error:',
        cameraCalibration.calibrationError.value
      );

      if (calibrationResult) {
        // Get the transformation data from the composable
        const transformData = cameraCalibration.getTransformationData.value;
        console.log('Transform data from composable:', transformData);

        if (transformData) {
          calibrationTransformData.value = transformData;

          // Update calibration success data
          calibrationSuccessData.value = {
            accuracy: Math.round(
              cameraCalibration.calibrationConfidence.value * 100
            ),
            error: cameraCalibration.calibrationError.value.toFixed(1),
          };

          // Calibration successful - data is displayed in the modal
          console.log(
            'Calibration successful with accuracy:',
            calibrationSuccessData.value.accuracy + '%'
          );
        } else {
          // Fallback: manually calculate transformation data
          const homography = cameraCalibration.homographyMatrix.value;
          console.log('Using fallback with homography:', homography);

          if (homography) {
            // Use actual video dimensions instead of hardcoded values
            const videoDims = videoState.dimensions;
            const centerImagePoint = {
              x: videoDims.width / 2,
              y: videoDims.height / 2,
            };
            console.log('Transforming point with actual dimensions:', {
              dimensions: videoDims,
              center: centerImagePoint,
            });

            const worldPoint = imageToWorld(centerImagePoint, homography);
            console.log('World point result:', worldPoint);

            if (worldPoint) {
              calibrationTransformData.value = {
                imagePoint: centerImagePoint,
                worldPoint: {
                  x: worldPoint.x.toFixed(2),
                  y: worldPoint.y.toFixed(2),
                  z: worldPoint.z.toFixed(2),
                },
                pixelsPerMeter: Math.abs(
                  videoDims.width /
                    (cameraCalibration.courtDimensions.value.width * 2)
                ),
              };

              // Update calibration success data
              calibrationSuccessData.value = {
                accuracy: Math.round(
                  cameraCalibration.calibrationConfidence.value * 100
                ),
                error: cameraCalibration.calibrationError.value.toFixed(1),
              };

              // Show success notification with calibration data
              showSuccess(
                'Calibration Successful',
                `Accuracy: ${calibrationSuccessData.value.accuracy}% | Error: ${calibrationSuccessData.value.error}px | World Point: (${calibrationTransformData.value.worldPoint.x}, ${calibrationTransformData.value.worldPoint.y})`,
                5000
              );
              showInfo(
                'Next Step',
                'Calibration is done. Click the speed calculation toggle in the video controls to start speed tracking.',
                6000
              );
            } else {
              console.error('Failed to transform point to world coordinates');
              showError(
                'Calibration Failed',
                'Failed to transform point to world coordinates'
              );
            }
          } else {
            console.error('No homography matrix available');
            showError('Calibration Failed', 'No homography matrix available');
          }
        }
      } else {
        console.error('Calibration failed - no result returned');
        showError('Calibration Failed', 'No calibration result returned');
      }
    } catch (error) {
      console.error('Error calculating homography:', error);
      showError(
        'Calibration Error',
        `Failed to complete calibration: ${error}`
      );
    }
  }

  // Store the calibration lines for display
  if (data.drawnLines && data.drawnLines.length > 0) {
    console.log(
      '🎯 [App.handleCalibrationModalComplete] Calibration lines received (normalized):',
      data.drawnLines
    );
    calibrationLines.value = data.drawnLines.map((line: any, index: number) => {
      console.log(`🎯 [App] Line ${index} (normalized):`, line);
      console.log(`  Start: (${line.start.x}, ${line.start.y})`);
      console.log(`  End: (${line.end.x}, ${line.end.y})`);
      console.log(`  Video dimensions:`, line.videoDimensions);

      // Lines are already normalized from CalibrationModal
      // Just add color and name metadata
      return {
        ...line, // Keep all properties including normalized coordinates and videoDimensions
        color: ['#3b82f6', '#22c55e', '#ef4444'][index] || '#ffffff',
        name:
          ['Back Boundary', 'Center Line', 'Service Line'][index] ||
          `Line ${index + 1}`,
      };
    });

    // Check video player ref and its methods
    console.log('🎯 [App] Checking video player ref:', {
      hasRef: !!unifiedVideoPlayerRef.value,
      refType: typeof unifiedVideoPlayerRef.value,
      hasGetCurrentVideoElement: !!(unifiedVideoPlayerRef.value as any)
        ?.getCurrentVideoElement,
      hasGetCurrentVideoContainer: !!(unifiedVideoPlayerRef.value as any)
        ?.getCurrentVideoContainer,
    });

    // Try to get video element and container
    let videoEl = null;
    let videoContainer = null;

    if (unifiedVideoPlayerRef.value) {
      try {
        videoEl = (
          unifiedVideoPlayerRef.value as any
        )?.getCurrentVideoElement?.();
        videoContainer = (
          unifiedVideoPlayerRef.value as any
        )?.getCurrentVideoContainer?.();
      } catch (e) {
        console.error('🔴 [App] Error getting video references:', e);
      }
    }

    console.log('🎯 [App] Video references obtained:', {
      hasVideoElement: !!videoEl,
      hasVideoContainer: !!videoContainer,
      videoElementDetails: videoEl
        ? {
            tagName: videoEl.tagName,
            videoWidth: videoEl.videoWidth,
            videoHeight: videoEl.videoHeight,
            clientWidth: videoEl.clientWidth,
            clientHeight: videoEl.clientHeight,
          }
        : null,
      videoContainerDetails: videoContainer
        ? {
            tagName: videoContainer.tagName,
            className: videoContainer.className,
            clientWidth: videoContainer.clientWidth,
            clientHeight: videoContainer.clientHeight,
          }
        : null,
    });

    // Show calibration lines on the video for 1 minute
    console.log('✅ [App] Setting showCalibrationLines to true');
    showCalibrationLines.value = true;
    console.log(
      '✅ [App] Calibration lines to display (normalized):',
      calibrationLines.value
    );
    console.log('🎯 [App] Current video dimensions:', {
      width: videoDimensions.value.width || 1920,
      height: videoDimensions.value.height || 1080,
    });

    console.log('🎯 [App] Final state before rendering overlay:', {
      showCalibrationLines: showCalibrationLines.value,
      calibrationLinesCount: calibrationLines.value.length,
      hasVideoPlayerRef: !!unifiedVideoPlayerRef.value,
      videoElementAvailable: !!videoEl,
      videoContainerAvailable: !!videoContainer,
    });

    // Hide calibration lines after 60 seconds (1 minute)
    setTimeout(() => {
      showCalibrationLines.value = false;
      console.log('🎯 [App] Hiding calibration lines after 60 seconds');
    }, 60000);
  } else {
    console.log('❌ [App] No calibration lines received or empty array');
  }
};

// Configure all pose landmarkers for fast movements
const configureFastMovements = () => {
  const landmarkers = [poseLandmarker, poseLandmarkerA, poseLandmarkerB];

  landmarkers.forEach((landmarker) => {
    Object.assign(landmarker.detectionSettings, {
      roiSmoothingFactor: 0.5,
      motionPredictionWeight: 0.4,
      adaptiveROIExpansionRate: 0.08,
      frameSkip: 1,
      maxFPS: 60,
      useMotionPrediction: true,
      roiValidationEnabled: true,
      roiValidationMinLandmarks: 5,
      roiValidationMinConfidence: 0.4,
    });
  });
};

configureFastMovements();

watch(
  annotations,
  (newAnnotations) => {
    if (newAnnotations) {
      if (playerMode.value === 'dual') {
        // In dual mode, load drawings into both canvas composables with video context
        drawingCanvasA.loadDrawingsFromAnnotations(newAnnotations as any, 'A');
        drawingCanvasB.loadDrawingsFromAnnotations(newAnnotations as any, 'B');
      } else {
        // In single mode, load into the main drawing canvas
        drawingCanvas.loadDrawingsFromAnnotations(newAnnotations as any);
      }
    }
  },
  { immediate: true, deep: true }
);

// Watch for selected annotation changes to update the drawing canvas frame
// Only update the frame, don't reload drawings (they're already loaded via annotations watch)
watch(selectedAnnotation, (newAnnotation, oldAnnotation) => {
  // Skip if it's the same annotation
  if (newAnnotation?.id === oldAnnotation?.id) {
    return;
  }

  if (newAnnotation && newAnnotation.frame !== undefined) {
    // Update the current frame for the drawing canvas
    // The DrawingCanvas component will automatically show the drawings for this frame
    drawingCanvas.currentFrame.value = newAnnotation.frame;

    if (playerMode.value === 'dual') {
      // In dual mode, update both canvas frames
      if (drawingCanvasA.currentFrame) {
        drawingCanvasA.currentFrame.value =
          newAnnotation.videoAFrame || newAnnotation.frame;
      }
      if (drawingCanvasB.currentFrame) {
        drawingCanvasB.currentFrame.value =
          newAnnotation.videoBFrame || newAnnotation.frame;
      }
    }

    // No need to reload drawings here - they're already loaded
    // The DrawingCanvas component watches currentFrame and will display the correct drawings
  }
});

const handleChartToggled = (value: boolean) => {
  isChartVisible.value = value;
};

// Event handlers for video player events
const handleTimeUpdate = (data: { currentTime: number; duration: number }) => {
  currentTime.value = data.currentTime;
  if (data.duration && data.duration > 0 && duration.value !== data.duration) {
    duration.value = data.duration;
  }
};

const handleFrameUpdate = (data: {
  currentFrame: number;
  totalFrames: number;
  fps: number;
}) => {
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

const handleFPSDetected = (data: { fps: number; totalFrames: number }) => {
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

const handleLoaded = async (data: any) => {
  try {
    if (!data) {
      console.error('handleLoaded called with no data');
      return;
    }

    videoLoaded.value = true;

    if (data.duration !== undefined) {
      videoState.duration = data.duration;
    }

    if (data.dimensions) {
      videoState.dimensions = data.dimensions;

      // Update camera calibration with actual video dimensions
      if (cameraCalibration.setVideoDimensions) {
        cameraCalibration.setVideoDimensions(
          data.dimensions.width,
          data.dimensions.height
        );
        console.log(
          '📐 Updated camera calibration with video dimensions:',
          data.dimensions
        );
      }
    }

    if (data.id) {
      currentVideoId.value = data.id as string;
    }

    // Initialize video with complete data object, not just ID
    if (data) {
      // For uploaded videos, we need to pass the existing video record
      // to prevent creating duplicates
      const initData = {
        ...data,
        videoType: currentVideoType.value || 'url',
        // If we have a stored video object (from loadVideo), use it as existingVideo
        existingVideo:
          currentVideoObject.value ||
          (currentVideoId.value
            ? {
                id: currentVideoId.value,
                url: videoUrl.value,
                title: data.title || currentVideoObject.value?.title,
                videoType: currentVideoType.value || 'url',
                ...currentVideoObject.value,
              }
            : null),
      };
      await initializeVideo(initData);
    }

    await loadAnnotations();
  } catch (error) {
    console.error('Error in handleLoaded:', error);
  }
};

const handleSeekToTime = (time: number) => {
  if ((unifiedVideoPlayerRef.value as any)?.seekTo) {
    (unifiedVideoPlayerRef.value as any).seekTo(time);
  }
};

const handleDualVideoAction = (
  action: string,
  context: string,
  ...args: any[]
) => {
  if (!dualVideoPlayer) return;

  const methodName = `${action}Video${context}`;
  if (typeof (dualVideoPlayer as any)[methodName] === 'function') {
    (dualVideoPlayer as any)[methodName](...args);
  }
};

const handleSeekVideoA = (time: number) =>
  handleDualVideoAction('seek', 'A', time);
const handleSeekVideoB = (time: number) =>
  handleDualVideoAction('seek', 'B', time);
const handlePlayVideoA = () => handleDualVideoAction('play', 'A');
const handlePauseVideoA = () => handleDualVideoAction('pause', 'A');
const handlePlayVideoB = () => handleDualVideoAction('play', 'B');
const handlePauseVideoB = () => handleDualVideoAction('pause', 'B');
const handleFrameStepVideoA = (direction: string) =>
  handleDualVideoAction('stepFrame', 'A', direction);
const handleFrameStepVideoB = (direction: string) =>
  handleDualVideoAction('stepFrame', 'B', direction);

const handleSeekToTimeWithFade = async (time: number) => {
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    (dualVideoPlayer as any).seekVideoA?.(time);
    (dualVideoPlayer as any).seekVideoB?.(time);
  } else {
    if (
      (unifiedVideoPlayerRef.value as any)?.performVideoFadeTransition &&
      (unifiedVideoPlayerRef.value as any)?.seekTo
    ) {
      await (unifiedVideoPlayerRef.value as any).performVideoFadeTransition(
        () => {
          (unifiedVideoPlayerRef.value as any).seekTo(time);
        }
      );
    } else if ((unifiedVideoPlayerRef.value as any)?.seekTo) {
      (unifiedVideoPlayerRef.value as any).seekTo(time);
    }
  }
};

const handleAnnotationClick = async (annotation: any) => {
  selectedAnnotation.value = annotation;

  // Update the current frame for the drawing canvas based on mode
  if (playerMode.value === 'dual') {
    // In dual mode, only update canvas frames if specific video frames are defined
    // This prevents frame misalignment by not falling back to generic frame property
    if (drawingCanvasA.currentFrame && annotation.videoAFrame !== undefined) {
      drawingCanvasA.currentFrame.value = annotation.videoAFrame;
    }
    if (drawingCanvasB.currentFrame && annotation.videoBFrame !== undefined) {
      drawingCanvasB.currentFrame.value = annotation.videoBFrame;
    }
    // Note: Drawings will be automatically updated via the watch on selectedAnnotation
  } else {
    // In single mode, use the generic frame property
    if (annotation.frame !== undefined) {
      drawingCanvas.currentFrame.value = annotation.frame;
    }
    // Note: Drawings will be automatically updated via the watch on selectedAnnotation
  }

  // Seek to the annotation's timestamp
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    if (
      annotation.videoAFrame !== undefined &&
      annotation.videoBFrame !== undefined
    ) {
      const videoATime =
        annotation.videoATimestamp ||
        annotation.videoAFrame / (dualVideoPlayer.videoAState?.fps || 30);
      const videoBTime =
        annotation.videoBTimestamp ||
        annotation.videoBFrame / (dualVideoPlayer.videoBState?.fps || 30);

      (dualVideoPlayer as any).seekVideoA?.(videoATime);
      (dualVideoPlayer as any).seekVideoB?.(videoBTime);
    } else if (annotation.timestamp !== undefined) {
      // Fallback to timestamp if dual mode frames are not properly set
      await handleSeekToTimeWithFade(annotation.timestamp);
    }
  } else if (annotation.timestamp !== undefined) {
    // Single mode: use timestamp
    await handleSeekToTimeWithFade(annotation.timestamp);
  }
};

const handleAnnotationEdit = () => {
  if (!annotationPanelRef.value) return;
  (annotationPanelRef.value as any).isEditing = true;
};

const handleDrawingCreated = (drawing: any, videoContext?: string) => {
  if (playerMode.value === 'dual') {
    // videoContext is now passed directly as a parameter from UnifiedVideoPlayer
    const context = videoContext || 'A'; // default to 'A' if not provided
    (dualVideoPlayer as any).addDrawing?.(drawing, context);
    // Forward drawing data to annotation panel for dual mode
    if (annotationPanelRef.value?.onDrawingCreated) {
      annotationPanelRef.value.onDrawingCreated(drawing, context);
    }
  } else {
    drawingCanvas.addDrawing(drawing);
    // Forward drawing data to annotation panel for single mode
    if (annotationPanelRef.value?.onDrawingCreated) {
      annotationPanelRef.value.onDrawingCreated(drawing);
    }
  }
};

const handleDrawingUpdated = (drawing: any, videoContext?: string) => {
  if (playerMode.value === 'dual') {
    // videoContext is now passed directly as a parameter from UnifiedVideoPlayer
    const context = videoContext || 'A'; // default to 'A' if not provided
    (dualVideoPlayer as any).updateDrawing?.(drawing, context);
  } else {
    (drawingCanvas as any).updateDrawing?.(drawing);
  }
};

const handleDrawingDeleted = (drawingId: string, videoContext?: string) => {
  if (playerMode.value === 'dual') {
    // videoContext is now passed directly as a parameter from UnifiedVideoPlayer
    const context = videoContext || 'A'; // default to 'A' if not provided
    (dualVideoPlayer as any).deleteDrawing?.(drawingId, context);
  } else {
    (drawingCanvas as any).deleteDrawing?.(drawingId);
  }
};

const handleCreateAnonymousSession = async (displayName: string) => {
  try {
    const session = await createAnonymousSession(displayName);
    return session;
  } catch (error) {
    throw error;
  }
};

const handleFormShow = () => {
  isAnnotationFormVisible.value = true;
};

const handleFormHide = () => {
  isAnnotationFormVisible.value = false;
};

const handleTimelinePlay = () => {
  if (playerMode.value === 'single' && unifiedVideoPlayerRef.value) {
    (unifiedVideoPlayerRef.value as any).play();
  } else if (playerMode.value === 'dual' && dualVideoPlayer) {
    (dualVideoPlayer as any).playVideoA?.();
    (dualVideoPlayer as any).playVideoB?.();
  }
};

const handleTimelinePause = () => {
  if (playerMode.value === 'single' && unifiedVideoPlayerRef.value) {
    (unifiedVideoPlayerRef.value as any).pause();
  } else if (playerMode.value === 'dual' && dualVideoPlayer) {
    (dualVideoPlayer as any).pauseVideoA?.();
    (dualVideoPlayer as any).pauseVideoB?.();
  }
};

const handleSpeedVisualizationToggled = (isEnabled: boolean) => {
  console.log('🔄 [App] Speed visualization toggled:', isEnabled);
};

const openLoadModal = () => {
  isLoadModalVisible.value = true;
};

const closeLoadModal = () => {
  isLoadModalVisible.value = false;
};

const openLoadModalWithTab = (tab: string) => {
  // Close the project management modal first
  isLoadModalVisible.value = false;
  // If the tab is 'create', open the comparison modal
  if (tab === 'create') {
    isComparisonModalVisible.value = true;
  }
  // For other tabs, you could handle them differently or show a notification
};

const closeComparisonModal = () => {
  isComparisonModalVisible.value = false;
};

const handleComparisonCreated = (comparison: any) => {
  // Handle comparison created from ProjectManagementModal
  handleProjectSelected({
    projectType: 'dual',
    id: comparison.id,
    videoA: comparison.videoA,
    videoB: comparison.videoB,
    comparisonVideo: comparison,
  });
  closeComparisonModal();
};

const openVideoUpload = () => {
  isVideoUploadVisible.value = true;
};

const closeVideoUpload = () => {
  isVideoUploadVisible.value = false;
};

const handleVideoUploadSuccess = async (videoRecord: any) => {
  console.log('✅ Video upload successful:', videoRecord);

  // Close the upload modal
  closeVideoUpload();

  // Create a project-like object for the uploaded video
  const uploadProject = {
    id: videoRecord.projectId,
    title:
      videoRecord.title || videoRecord.originalFilename || 'Uploaded Video',
    video: videoRecord,
    videoId: videoRecord.id,
    createdAt: videoRecord.createdAt,
    updatedAt: videoRecord.updatedAt,
  };

  // Handle the project selection
  await handleProjectSelected(uploadProject);

  // Reopen the project management modal to show the new video
  // This ensures the user sees their newly uploaded video in the list
  isLoadModalVisible.value = true;
};

const handleVideoUploadError = (error: any) => {
  console.error('❌ Video upload failed:', error);
  // Error is already handled by the VideoUpload component
};

// Store the current video object for use in initializeVideo
const currentVideoObject = ref<any>(null);

const loadVideo = (video: any, type = 'upload') => {
  videoLoaded.value = false;
  try {
    playerMode.value = 'single';
    urlInput.value = video.url || '';
    videoUrl.value = getVideoUrl(video);
    videoId.value = video.id || '';
    currentVideoType.value = type;
    // Store the complete video object
    currentVideoObject.value = video;
    videoLoaded.value = false;
  } catch (error) {
    console.error('Failed to load video:', error);
  }
};

const handleProjectSelected = async (project: any) => {
  try {
    console.log(
      '🔄 [App] Project selected:',
      project.title,
      'Type:',
      project.projectType
    );

    // Determine current and new project types
    const currentProjectType = playerMode.value as 'single' | 'dual';
    const newProjectType = project.projectType as 'single' | 'dual';

    // Perform cleanup if switching between different project types or different projects
    if (
      currentProjectType !== newProjectType ||
      (currentProjectType === 'single' &&
        currentVideoId.value !== project.video?.id) ||
      (currentProjectType === 'dual' &&
        currentComparisonId.value !== project.comparisonVideo?.id)
    ) {
      console.log(
        `🧹 [App] Cleaning up before project switch: ${currentProjectType} → ${newProjectType}`
      );

      await cleanupForProjectSwitch(currentProjectType, newProjectType, {
        poseLandmarker,
        poseLandmarkerA,
        poseLandmarkerB,
        drawingCanvas,
        drawingCanvasA,
        drawingCanvasB,
        dualVideoPlayer,
        comparisonWorkflow,
        videoSession: { endSession },
        annotations,
        selectedAnnotation,
        videoState,
        currentVideoId,
        currentComparisonId,
        additionalCleanup: [
          // End current video session
          async () => {
            try {
              await endSession();
            } catch (error) {
              console.warn('Error ending session during cleanup:', error);
            }
          },
        ],
      });
    }

    if (project.projectType === 'single') {
      console.log('🎬 [App] Loading single video project');

      // Set player mode first
      playerMode.value = 'single';

      // Pass the complete video object to preserve all properties
      const video = project.video;

      // Set the video type based on the video's actual type
      const videoType = project.video.videoType || 'upload';
      loadVideo(video, videoType);
      currentVideoId.value = project.video.id;
      currentComparisonId.value = null;

      // Load annotations for the new video
      await loadAnnotations();
    } else if (project.projectType === 'dual') {
      console.log('🎬 [App] Loading dual video project');

      // Set player mode first
      playerMode.value = 'dual';
      currentComparisonId.value = project.comparisonVideo?.id || null;
      currentVideoId.value = null;

      if (comparisonWorkflow) {
        try {
          // Initialize pose landmarkers for dual mode if not already initialized
          if (!poseLandmarkerA.isInitialized.value) {
            await poseLandmarkerA.initialize();
            console.log('🎯 [App] Initialized poseLandmarkerA for dual mode');
          }
          if (!poseLandmarkerB.isInitialized.value) {
            await poseLandmarkerB.initialize();
            console.log('🎯 [App] Initialized poseLandmarkerB for dual mode');
          }
        } catch (error) {
          console.error(
            'Failed to initialize dual mode pose landmarkers:',
            error
          );
        }

        await comparisonWorkflow.loadComparisonVideo(project.comparisonVideo);
      }
    }

    console.log('✅ [App] Project switch completed successfully');
  } catch (error) {
    console.error('❌ [App] Error during project selection:', error);
    // You might want to show a user-friendly error message here
  }

  closeLoadModal();
};

const handleDualVideoLoaded = async () => {
  if (dualVideoPlayerRef.value) {
    const videoAState = (dualVideoPlayerRef.value as any).videoAState;
    const videoBState = (dualVideoPlayerRef.value as any).videoBState;

    if (
      videoAState.duration > 0 &&
      videoAState.fps > 0 &&
      videoBState.duration > 0 &&
      videoBState.fps > 0
    ) {
      if (comparisonWorkflow) {
        (comparisonWorkflow as any).setDualVideoReady?.(true);
      }

      try {
        if (!poseLandmarkerA.isInitialized.value) {
          await poseLandmarkerA.initialize();
        }
        if (!poseLandmarkerB.isInitialized.value) {
          await poseLandmarkerB.initialize();
        }
      } catch (error) {
        console.error('Failed to initialize dual mode pose detection:', error);
      }
    }
  }
};

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

const openSharedLinksManagement = () => {
  isSharedLinksManagementVisible.value = true;
};

const closeSharedLinksManagement = () => {
  isSharedLinksManagementVisible.value = false;
};

// Shared video authentication handlers
const handleAuthSignIn = () => {
  showAuthPrompt.value = false;
  userDeclinedAuth.value = false;
  // The Login component will be shown since user is not authenticated
  // After successful login, the pending shared content will be loaded
};

const handleAuthContinueReadOnly = () => {
  userDeclinedAuth.value = true;
  
  // Load the shared content in read-only mode BEFORE closing the prompt
  // This ensures the isSharedVideo/isSharedComparison flags are set first
  if (pendingSharedContent.value) {
    if (pendingSharedContent.value.type === 'video') {
      loadSharedVideoReadOnly(pendingSharedContent.value.data);
    } else if (pendingSharedContent.value.type === 'comparison') {
      loadSharedComparisonReadOnly(pendingSharedContent.value.data);
    }
    pendingSharedContent.value = null;
  }
  
  // Close the prompt AFTER loading content to avoid unmounting the main div
  showAuthPrompt.value = false;
};

const loadSharedVideoReadOnly = (shareData: any) => {
  isSharedVideo.value = true;
  sharedVideoData.value = shareData;
  currentVideoId.value = shareData.id;
  
  loadVideo(
    {
      id: shareData.id,
      url: shareData.url,
    },
    'shared'
  );
};

const loadSharedComparisonReadOnly = async (sharedComparisonData: any) => {
  isSharedComparison.value = true;
  currentComparisonId.value = sharedComparisonData.id;

  const comparisonVideo = {
    id: sharedComparisonData.id,
    title: sharedComparisonData.title,
    description: sharedComparisonData.description,
    videoAId: sharedComparisonData.videoA?.id || 'placeholder',
    videoBId: sharedComparisonData.videoB?.id || 'placeholder',
    videoA: sharedComparisonData.videoA,
    videoB: sharedComparisonData.videoB,
    isPublic: sharedComparisonData.isPublic,
    userId: '',
    createdAt: '',
    updatedAt: '',
  };

  if (comparisonWorkflow) {
    await comparisonWorkflow.loadComparisonVideo(comparisonVideo as any);
    playerMode.value = 'dual';
    
    // Start the session to initialize permissions even in read-only mode
    if (currentComparisonId.value) {
      await startSession();
    }
  }
};

const loadSharedVideoAuthenticated = async (shareData: any) => {
  try {
    // Re-fetch the shared video data now that user is authenticated
    // This ensures canComment is correctly set based on current auth state
    const freshShareData = await ShareService.getSharedVideoWithCommentPermissions(shareData.id);
    
    isSharedVideo.value = true;
    sharedVideoData.value = freshShareData;
    currentVideoId.value = freshShareData.id;
    
    loadVideo(
      {
        id: freshShareData.id,
        url: freshShareData.url,
      },
      'shared'
    );
    
    // Start the video session with proper permissions
    if (currentVideoId.value) {
      await startSession();
    }
  } catch (error) {
    console.error('Error loading authenticated shared video:', error);
    // Fallback to original data if re-fetch fails
    loadSharedVideoReadOnly(shareData);
  }
};

const loadSharedComparisonAuthenticated = async (sharedComparisonData: any) => {
  try {
    // Re-fetch the shared comparison data now that user is authenticated
    // This ensures canComment is correctly set based on current auth state
    const freshComparisonData = await ShareService.getSharedComparisonVideoWithCommentPermissions(sharedComparisonData.id);
    
    isSharedComparison.value = true;
    currentComparisonId.value = freshComparisonData.id;

    const comparisonVideo = {
      id: freshComparisonData.id,
      title: freshComparisonData.title,
      description: freshComparisonData.description,
      videoAId: freshComparisonData.videoA?.id || 'placeholder',
      videoBId: freshComparisonData.videoB?.id || 'placeholder',
      videoA: freshComparisonData.videoA,
      videoB: freshComparisonData.videoB,
      isPublic: freshComparisonData.isPublic,
      userId: '',
      createdAt: '',
      updatedAt: '',
    };

    if (comparisonWorkflow) {
      await comparisonWorkflow.loadComparisonVideo(comparisonVideo as any);
      playerMode.value = 'dual';
      
      // Start the video session with proper permissions after loading
      // This ensures the activeContentId computed property has the currentComparisonId
      if (currentComparisonId.value) {
        await startSession();
      }
    }
  } catch (error) {
    console.error('Error loading authenticated shared comparison:', error);
    // Fallback to original data if re-fetch fails
    loadSharedComparisonReadOnly(sharedComparisonData);
  }
};

let authSubscription: { unsubscribe: () => void } | null = null;

onMounted(async () => {
  try {
    isAppLoading.value = true;

    // First check for password reset token BEFORE initializing auth
    const hasResetToken = checkPasswordResetToken();

    // If we have a reset token, don't initialize normal auth flow
    if (!hasResetToken) {
      // Initialize auth only if not in password reset flow
      await initAuth();
    } else {
      // For password reset, we need to exchange the recovery token
      // but prevent automatic login
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        // Set the session to enable password update, but stay on reset page
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error('Error setting recovery session:', error);
          isPasswordReset.value = false;
        }
      }
    }

    // Also listen for auth state changes that might indicate password recovery
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state change in App:', {
          event,
          hasSession: !!session,
        });
        if (event === 'PASSWORD_RECOVERY') {
          console.log('PASSWORD_RECOVERY event detected!');
          isPasswordReset.value = true;
          sessionStorage.setItem('recovery_token', session?.access_token || '');
        }
      }
    );
    authSubscription = authListener?.subscription ?? null;

    const shareInfo = ShareService.parseShareUrl();

    if (shareInfo.type && shareInfo.id) {
      try {
        if (shareInfo.type === 'video') {
          const shareData =
            await ShareService.getSharedVideoWithCommentPermissions(
              shareInfo.id
            );

          // Check if this shared video requires authentication for annotations
          const requiresAuth = shareData.canComment && !user.value;
          
          if (requiresAuth) {
            // Store the pending content and show auth prompt
            pendingSharedContent.value = {
              type: 'video',
              id: shareInfo.id,
              data: shareData
            };
            showAuthPrompt.value = true;
          } else if (user.value && shareData.canComment) {
            // User is authenticated and video allows annotations - load with full permissions
            await loadSharedVideoAuthenticated(shareData);
          } else {
            // Annotations not allowed or user not authenticated, load in read-only mode
            loadSharedVideoReadOnly(shareData);
          }
        } else if (shareInfo.type === 'comparison') {
          try {
            // Load shared comparison video with proper permissions
            const sharedComparisonData =
              await ShareService.getSharedComparisonVideoWithCommentPermissions(
                shareInfo.id
              );

            // Check if this shared comparison requires authentication for annotations
            const requiresAuth = sharedComparisonData.canComment && !user.value;

            if (requiresAuth) {
              // Store the pending content and show auth prompt
              pendingSharedContent.value = {
                type: 'comparison',
                id: shareInfo.id,
                data: sharedComparisonData
              };
              showAuthPrompt.value = true;
            } else if (user.value && sharedComparisonData.canComment) {
              // User is authenticated and comparison allows annotations - load with full permissions
              await loadSharedComparisonAuthenticated(sharedComparisonData);
            } else {
              // Annotations not allowed or user not authenticated, load in read-only mode
              loadSharedComparisonReadOnly(sharedComparisonData);
            }
          } catch (error) {
            console.error(
              '❌ [App] Failed to load shared comparison video:',
              error
            );
            throw error;
          }
        }
      } catch (error) {
        console.error('Failed to load shared content:', error);
      }
    } else if (!user.value && !isPasswordReset.value) {
      // If no share link and not logged in (and not in password reset), show the login page
    } else if (!videoLoaded.value && !isPasswordReset.value) {
      isLoadModalVisible.value = true;
    }
  } finally {
    // Always set app loading to false at the end
    isAppLoading.value = false;
  }
});

onBeforeUnmount(() => {
  authSubscription?.unsubscribe();
  authSubscription = null;
});

watch(playerMode, (newMode) => {
  if (newMode === 'single') {
    if (comparisonWorkflow) {
      comparisonWorkflow.resetWorkflow();
    }
  }
});

const getActivePoseLandmarker = () => {
  if (playerMode.value === 'single') return poseLandmarker;
  if (activeVideoContext.value === 'A') return poseLandmarkerA;
  return poseLandmarkerB;
};

const currentPoseLandmarker = computed(getActivePoseLandmarker);

const handleSetROI = (roi: any) => {
  const activeLandmarker = getActivePoseLandmarker();
  if (activeLandmarker?.setROI) {
    activeLandmarker.setROI(roi);
  }
};

const handleResetROI = () => {
  const activeLandmarker = getActivePoseLandmarker();
  if (activeLandmarker?.resetROI) {
    activeLandmarker.resetROI();
  }
};

// Calibration Controls
const handleStartCourtCalibration = () => {
  console.log('handleStartCourtCalibration called from App.vue');
  // Show the calibration modal instead of the overlay
  if (videoUrl.value) {
    // Pause the video during calibration if it's playing
    if (unifiedVideoPlayerRef.value) {
      unifiedVideoPlayerRef.value.pause();
    }
    showCalibrationModal.value = true;
    console.log('showCalibrationModal set to:', showCalibrationModal.value);
  } else {
    console.warn('No video URL available for calibration');
  }
};

const handleSetPlayerHeight = (height: number) => {
  if (currentSpeedCalculator.value) {
    (currentSpeedCalculator.value as any).setPlayerHeight(height);
  }
};

const handleSetCourtDimensions = (dimensions: any) => {
  if (currentSpeedCalculator.value) {
    (currentSpeedCalculator.value as any).setCourtLength(dimensions.height);
  }
};

const handleSetCourtReferencePoints = (points: any) => {
  if (currentSpeedCalculator.value) {
    (currentSpeedCalculator.value as any).setCourtReferencePoints(points);
  }
};

const toggleCalibrationControls = () => {
  showCalibrationControls.value = !showCalibrationControls.value;
};

const handleResetCalibration = () => {
  if (currentSpeedCalculator.value) {
    (currentSpeedCalculator.value as any).resetCalibration();
  }
};

const handleSpeedData = (data: any) => {
  if (currentSpeedCalculator.value) {
    (currentSpeedCalculator.value as any).addSpeedData(
      data.speed,
      data.timestamp,
      data.frame
    );
  }
};

const currentSpeedMetrics = computed(() => {
  let result;
  if (playerMode.value === 'single') {
    result = poseLandmarker.speedMetrics;
  } else if (activeVideoContext.value === 'A') {
    result = poseLandmarkerA.speedMetrics;
  } else {
    result = poseLandmarkerB.speedMetrics;
  }

  console.log('🔍 [App.vue] currentSpeedMetrics computed:', {
    playerMode: playerMode.value,
    activeVideoContext: activeVideoContext.value,
    result: result?.value,
    isValid: result?.value?.isValid,
    hasSpeedProperty: !!(result?.value?.speed !== undefined),
    speedValue: result?.value?.speed,
  });

  return result;
});

// Computed property for shared content permission text
const sharedContentPermissionText = computed(() => {
  if (isSharedComparison.value) {
    const comparison = comparisonWorkflow.currentComparison.value;
    const hasAnnotationPermission = comparison && (comparison as any).allowAnnotations;
    return hasAnnotationPermission
      ? 'Shared Comparison (Annotations Enabled)'
      : 'Shared Comparison (View Only)';
  } else if (isSharedVideo.value) {
    const hasAnnotationPermission = sharedVideoData.value?.allowAnnotations;
    return hasAnnotationPermission
      ? 'Shared Video (Annotations Enabled)'
      : 'Shared Video (View Only)';
  }
  return 'Shared Content';
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
  (newUser, oldUser) => {
    if (newUser && (newUser as any).id) {
      if (currentVideoId.value) {
        startSession();
        setupPresenceTracking((newUser as any).id, (newUser as any).email);
      }

      // Check if user just logged in and we have pending shared content
      if (!oldUser && pendingSharedContent.value) {
        // User logged in after seeing auth prompt, load the shared content WITH full permissions
        if (pendingSharedContent.value.type === 'video') {
          loadSharedVideoAuthenticated(pendingSharedContent.value.data);
        } else if (pendingSharedContent.value.type === 'comparison') {
          loadSharedComparisonAuthenticated(pendingSharedContent.value.data);
        }
        pendingSharedContent.value = null;
      }
      // Auto-open ProjectManagementModal after successful login
      // Only open if this is a new login (oldUser was null/undefined) and no shared content
      // Check for share URL parameters to avoid opening modal when accessing shared links
      else if (!oldUser && !isSharedVideo.value && !isSharedComparison.value && !ShareService.parseShareUrl().id) {
        // Small delay to ensure the UI is fully rendered
        setTimeout(() => {
          isLoadModalVisible.value = true;
        }, 100);
      }
    } else {
      endSession();
    }
  },
  { immediate: true }
);
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
          />
        </svg>
        <h2 class="text-lg font-semibold text-gray-900">
          Something went wrong
        </h2>
      </div>

      <p class="text-gray-600 mb-4">
        {{ errorMessage }}
      </p>

      <div class="flex space-x-3">
        <button
          class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          @click="
            hasError = false;
            errorMessage = '';
          "
        >
          Try Again
        </button>
        <button
          class="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
          @click="window.location.reload()"
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
      />
      <p class="text-gray-600">Loading...</p>
    </div>
  </div>

  <!-- Password Reset screen when recovery token is present -->
  <div v-else-if="isPasswordReset">
    <ResetPassword @complete="handlePasswordResetComplete" />
  </div>

  <!-- Main app when user is authenticated OR when viewing shared video/comparison OR showing auth prompt -->
  <div
    v-else-if="user || isSharedVideo || isSharedComparison || showAuthPrompt"
    class="min-h-screen bg-white flex flex-col"
  >
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <h1 class="text-xl font-medium text-gray-900">Perspecto AI</h1>
          <span
            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200"
          >
            BETA v2.1
          </span>
        </div>

        <!-- Action Buttons (only for authenticated users) -->
        <div
          v-if="user && !isSharedVideo && !isSharedComparison"
          class="flex items-center space-x-4"
        >
          <!-- Load Previous Videos Button -->
          <button
            class="p-2 text-gray-600 hover:text-green-600 hover:bg-gray-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            title="Upload video"
            @click="openLoadModal"
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
              />
            </svg>
          </button>

          <!-- Manage Shared Links Button -->
          <button
            class="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            title="Manage shared links"
            @click="openSharedLinksManagement"
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
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </button>

          <!-- Share Video Button -->
          <button
            :disabled="!canShare"
            class="p-2 text-gray-600 hover:text-purple-600 hover:bg-gray-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:text-gray-300 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Share current video"
            @click="openShareModal"
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
              />
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
            />
          </svg>
          <span class="font-medium">
            {{ sharedContentPermissionText }}
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
              />
            </svg>
            <span class="font-medium">{{
              (user as any)?.email || 'Loading...'
            }}</span>
          </div>
          <button
            class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            @click="handleSignOut"
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
          <div class="w-full h-full flex flex-col items-center justify-center">
            <div class="relative w-full h-full max-h-full">
              <!-- Unified Video Player -->
              <UnifiedVideoPlayer
                ref="unifiedVideoPlayerRef"
                :mode="playerMode"
                :video-url="videoUrl"
                :video-id="videoId"
                :drawing-canvas="drawingCanvas"
                :video-a-url="dualVideoPlayer?.videoAUrl?.value || ''"
                :video-a-id="dualVideoPlayer?.videoAId?.value || 'video-a'"
                :video-b-url="dualVideoPlayer?.videoBUrl?.value || ''"
                :video-b-id="dualVideoPlayer?.videoBId?.value || 'video-b'"
                :drawing-canvas-a="dualVideoPlayer?.drawingCanvasA"
                :drawing-canvas-b="dualVideoPlayer?.drawingCanvasB"
                :video-a-state="
                  dualVideoPlayer?.videoAState || {
                    fps: 30,
                    duration: 0,
                    totalFrames: 0,
                  }
                "
                :video-b-state="
                  dualVideoPlayer?.videoBState || {
                    fps: 30,
                    duration: 0,
                    totalFrames: 0,
                  }
                "
                :dual-video-player="dualVideoPlayer"
                :project-id="
                  comparisonWorkflow.currentComparison.value?.projectId ??
                  (comparisonWorkflow.currentComparison.value as any)?.project_id ??
                  undefined
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
                @set-roi="handleSetROI"
                @reset-roi="handleResetROI"
                @toggle-calibration="handleStartCourtCalibration"
              />

              <!-- Speed Visualization (only render in single mode) -->
              <SpeedVisualization
                v-if="playerMode === 'single'"
                :speed-metrics="currentSpeedMetrics"
                :canvas-width="videoDimensions.width"
                :canvas-height="videoDimensions.height"
                :current-timestamp="currentTime"
                :current-frame="currentFrame"
                :show-speed="true"
                :show-center-of-mass="true"
                :show-velocity-vector="true"
                :show-speed-panel="true"
                :show-main-speed-panel="true"
                :show-labels="true"
                :show-velocity-components="false"
                :show-co-m-coordinates="false"
                :show-toggle-control="true"
                :video-loaded="videoLoaded"
                @speed-visualization-toggled="handleSpeedVisualizationToggled"
                @chart-toggled="handleChartToggled"
              />
            </div>
          </div>
        </div>

        <!-- Timeline -->
        <div class="bg-gray-900 p-4 border-t border-gray-800">
          <!-- Single Video Timeline -->
          <VideoTimeline
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
              dualVideoPlayer?.videoACurrentTime?.value ?? 0
            "
            :video-a-duration="dualVideoPlayer?.videoAState?.duration ?? 0"
            :video-a-current-frame="
              dualVideoPlayer?.videoACurrentFrame?.value ?? 0
            "
            :video-a-total-frames="
              dualVideoPlayer?.videoAState?.totalFrames ?? 0
            "
            :video-a-fps="dualVideoPlayer?.videoAState?.fps ?? 30"
            :video-a-state="
              dualVideoPlayer?.videoAState || { fps: 30, duration: 0 }
            "
            :video-b-current-time="
              dualVideoPlayer?.videoBCurrentTime?.value ?? 0
            "
            :video-b-duration="dualVideoPlayer?.videoBState?.duration ?? 0"
            :video-b-current-frame="
              dualVideoPlayer?.videoBCurrentFrame?.value ?? 0
            "
            :video-b-total-frames="
              dualVideoPlayer?.videoBState?.totalFrames ?? 0
            "
            :video-b-fps="dualVideoPlayer?.videoBState?.fps ?? 30"
            :video-b-state="
              dualVideoPlayer?.videoBState || { fps: 30, duration: 0 }
            "
            :annotations="annotations"
            :selected-annotation="selectedAnnotation"
            :video-a-playing="dualVideoPlayer?.videoAIsPlaying?.value ?? false"
            :video-b-playing="dualVideoPlayer?.videoBIsPlaying?.value ?? false"
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
              class="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-md p-2 hover:bg-gray-100 transition-colors"
              @click="toggleCalibrationControls"
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
                  />
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
                />
              </svg>
            </button>
          </div>

          <!-- Calibration Controls Panel -->
          <div v-if="showCalibrationControls" class="p-4">
            <CalibrationControls
              v-if="currentSpeedCalculator"
              :calibration-settings="(currentSpeedCalculator as any).calibrationSettings"
              :speed-metrics="(currentSpeedCalculator as any).speedMetrics"
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
            :video-id="currentVideoId || ''"
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
              (unifiedVideoPlayerRef as any)?.singleDrawingCanvasRef || null
            "
            :drawing-canvas-a-ref="
              (unifiedVideoPlayerRef as any)?.drawingCanvasARef || null
            "
            :drawing-canvas-b-ref="
              (unifiedVideoPlayerRef as any)?.drawingCanvasBRef || null
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
                />
              </svg>
              <p class="text-sm">Initializing annotation panel...</p>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- Project Management Modal -->
    <ProjectManagementModal
      :is-visible="isLoadModalVisible"
      @close="closeLoadModal"
      @project-selected="handleProjectSelected"
      @upload-video="openVideoUpload"
      @open-load-modal="openLoadModalWithTab"
    />

    <!-- Create Comparison Modal -->
    <CreateComparisonModal
      :is-visible="isComparisonModalVisible"
      @close="closeComparisonModal"
      @comparison-created="handleComparisonCreated"
      @upload-video="openVideoUpload"
    />

    <!-- Video Upload Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isVideoUploadVisible"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <!-- Backdrop -->
          <div
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            @click="closeVideoUpload"
          />

          <!-- Modal Content -->
          <div
            class="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto p-6"
            @click.stop
          >
            <!-- Header -->
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-xl font-semibold text-gray-900">Upload Video</h2>
              <button
                class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                @click="closeVideoUpload"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <!-- Video Upload Component -->
            <VideoUpload
              @upload-success="handleVideoUploadSuccess"
              @upload-error="handleVideoUploadError"
            />
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Share Video Modal -->
    <ShareModal
      :is-visible="isShareModalVisible"
      :video-id="shareModalProps.videoId || ''"
      :comparison-id="shareModalProps.comparisonId"
      :share-type="shareModalProps.shareType"
      @close="closeShareModal"
    />

    <!-- Shared Links Management Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isSharedLinksManagementVisible"
          class="fixed inset-0 z-50 flex items-center justify-center"
        >
          <!-- Backdrop -->
          <div
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            @click="closeSharedLinksManagement"
          />

          <!-- Modal Content -->
          <div
            class="relative bg-white rounded-xl shadow-2xl w-full max-w-7xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
            @click.stop
          >
            <!-- Header -->
            <div class="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
              <h2 class="text-2xl font-semibold text-gray-900">Manage Shared Links</h2>
              <button
                class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                @click="closeSharedLinksManagement"
              >
                <svg
                  class="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <!-- Component Container -->
            <div class="flex-1 overflow-auto">
              <SharedLinksManagement />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Calibration Overlay - Now positioned outside video container for better positioning -->
    <CalibrationOverlay
      v-if="videoUrl && (user || isSharedVideo || isSharedComparison)"
      :video-element="unifiedVideoPlayerRef?.getCurrentVideoElement?.()"
      :is-active="showCalibrationOverlay"
      @calibration-complete="handleCalibrationModalComplete"
      @calibration-cancelled="showCalibrationOverlay = false"
    />

    <!-- Calibration Modal -->
    <CalibrationModal
      :show="showCalibrationModal"
      :video-url="videoUrl || ''"
      :court-type="'badminton'"
      @close="showCalibrationModal = false"
      @calibration-complete="handleCalibrationModalComplete"
    />

    <!-- Calibration Lines Overlay - Shows on the video after calibration -->
    <div
      v-if="showCalibrationLines && videoUrl"
      class="calibration-lines-wrapper"
    >
      <CalibrationLinesOverlay
        :show="showCalibrationLines"
        :lines="calibrationLines"
        :video-element="unifiedVideoPlayerRef?.getCurrentVideoElement?.()"
        :video-container="unifiedVideoPlayerRef?.getCurrentVideoContainer?.()"
        :video-width="videoDimensions.width || 1920"
        :video-height="videoDimensions.height || 1080"
        :duration="5000"
        :show-labels="true"
        :show-end-points="true"
        :show-success-message="true"
        :fade-out="false"
        @overlay-hidden="showCalibrationLines = false"
      />
    </div>
    <!-- Shared Video Authentication Prompt -->
    <SharedVideoAuthPrompt
      :is-visible="showAuthPrompt"
      :content-type="pendingSharedContent?.type === 'comparison' ? 'comparison video' : 'video'"
      @sign-in="handleAuthSignIn"
      @continue-read-only="handleAuthContinueReadOnly"
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
/* Modal transition styles */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.3s ease;
}

.modal-enter-from .relative {
  transform: scale(0.95);
}

.modal-leave-to .relative {
  transform: scale(0.95);
}

/* Calibration lines wrapper - fixed positioning to overlay on video */
.calibration-lines-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
}
</style>
