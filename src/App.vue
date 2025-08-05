<script setup lang="ts">
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
import { useAuth } from './composables/useAuth';
import { useVideoAnnotations } from './composables/useVideoAnnotations';
import { useRealtimeAnnotations } from './composables/useRealtimeAnnotations';
import { useVideoSession } from './composables/useVideoSession';
import { useDrawingCanvas } from './composables/useDrawingCanvas';
import { useComparisonVideoWorkflow } from './composables/useComparisonVideoWorkflow';
import { useDualVideoPlayer } from './composables/useDualVideoPlayer';
import { usePoseLandmarker } from './composables/usePoseLandmarker';
import { useSessionCleanup } from './composables/useSessionCleanup';
import { VideoService } from './services/videoService';
import { AnnotationService } from './services/annotationService';
import { ShareService } from './services/shareService';
import { supabase } from './composables/useSupabase';

import type { Annotation, Video } from './types/database';

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
const { user, initAuth, signOut, isLoading } = useAuth();

// Player mode management
const playerMode = ref('single'); // 'single' or 'dual'

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

dualVideoPlayer.drawingCanvasA.value = drawingCanvasA;
dualVideoPlayer.drawingCanvasB.value = drawingCanvasB;

// Comparison video workflow
const comparisonWorkflow = useComparisonVideoWorkflow();

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
  ref(null),
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

const selectedAnnotation = ref(null);

// Component Refs
const unifiedVideoPlayerRef = ref(null);
const annotationPanelRef = ref(null);

const isAnnotationFormVisible = ref(false);
const isLoadModalVisible = ref(false);
const isShareModalVisible = ref(false);
const isChartVisible = ref(false);
const videoLoaded = ref(false);
const currentVideoId = ref<string | null>(null);
const currentComparisonId = ref(null);
const isSharedComparison = ref(false);
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

    let videoA = comp.videoA || { id: comp.videoAId };
    let videoB = comp.videoB || { id: comp.videoBId };

    const ensureVideoHydrated = async (vid: any) => {
      if (vid && (vid.url || vid.filePath)) return vid;
      try {
        const { data, error } = await supabase
          .from('videos')
          .select('*')
          .eq('id', vid?.id)
          .single();
        if (error) {
          console.warn('⚠️ [App] Hydrate watcher: failed for', vid?.id, error);
          return vid || { id: null };
        }
        return data || vid;
      } catch (e) {
        console.warn('⚠️ [App] Hydrate watcher: exception for', vid?.id, e);
        return vid || { id: null };
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
      useAdaptiveROI: true,
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
      drawingCanvas.loadDrawingsFromAnnotations(newAnnotations as any);
    }
  },
  { immediate: true, deep: true }
);

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

const handlePlay = () => {
  isPlaying.value = true;
};

const handlePause = () => {
  isPlaying.value = false;
};

const handleError = (error: Error) => {
  console.error('Video error:', error);
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
    }

    if (data.id) {
      currentVideoId.value = data.id as string;
    }

    // Initialize video with complete data object, not just ID
    if (data) {
      await initializeVideo(data);
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
    } else {
      await handleSeekToTimeWithFade(annotation.timestamp);
    }
  } else {
    await handleSeekToTimeWithFade(annotation.timestamp);
  }
};

const handleAnnotationEdit = () => {
  if (!annotationPanelRef.value) return;
  (annotationPanelRef.value as any).isEditing = true;
};

const handleDrawingCreated = (drawing: any, event: Event) => {
  if (playerMode.value === 'dual') {
    const videoContext = (event.target as HTMLElement).dataset.videoContext as
      | 'A'
      | 'B';
    (dualVideoPlayer as any).addDrawing?.(drawing, videoContext);
    // Forward drawing data to annotation panel for dual mode
    if (annotationPanelRef.value?.onDrawingCreated) {
      annotationPanelRef.value.onDrawingCreated(drawing, videoContext);
    }
  } else {
    drawingCanvas.addDrawing(drawing);
    // Forward drawing data to annotation panel for single mode
    if (annotationPanelRef.value?.onDrawingCreated) {
      annotationPanelRef.value.onDrawingCreated(drawing);
    }
  }
};

const handleDrawingUpdated = (drawing: any, event: Event) => {
  if (playerMode.value === 'dual') {
    const videoContext = (event.target as HTMLElement).dataset.videoContext as
      | 'A'
      | 'B';
    (dualVideoPlayer as any).updateDrawing?.(drawing, videoContext);
  } else {
    (drawingCanvas as any).updateDrawing?.(drawing);
  }
};

const handleDrawingDeleted = (drawingId: string, event: Event) => {
  if (playerMode.value === 'dual') {
    const videoContext = (event.target as HTMLElement).dataset.videoContext as
      | 'A'
      | 'B';
    (dualVideoPlayer as any).deleteDrawing?.(drawingId, videoContext);
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

const loadVideo = (video: any, type = 'upload') => {
  videoLoaded.value = false;
  try {
    playerMode.value = 'single';
    urlInput.value = video.url || '';
    videoUrl.value = getVideoUrl(video);
    videoId.value = video.id || '';
    currentVideoType.value = type;
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

      const video = {
        id: project.video.id,
        url: project.video.url,
      };

      loadVideo(video, 'upload');
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

onMounted(async () => {
  await initAuth();

  const shareInfo = ShareService.parseShareUrl();

  if (shareInfo.type && shareInfo.id) {
    try {
      if (shareInfo.type === 'video') {
        isSharedVideo.value = true;
        const shareData =
          await ShareService.getSharedVideoWithCommentPermissions(shareInfo.id);

        sharedVideoData.value = shareData as any;
        currentVideoId.value = shareData.id as string;

        loadVideo(
          {
            id: shareData.id,
            url: shareData.url,
          },
          'shared'
        );
      } else if (shareInfo.type === 'comparison') {
        isSharedComparison.value = true;

        try {
          // Load shared comparison video with proper permissions
          const sharedComparisonData =
            await ShareService.getSharedComparisonVideoWithCommentPermissions(
              shareInfo.id
            );

          // Set the current comparison data
          currentComparisonId.value = sharedComparisonData.id;

          // Create a comparison video object for the workflow
          const comparisonVideo = {
            id: sharedComparisonData.id,
            title: sharedComparisonData.title,
            description: sharedComparisonData.description,
            videoAId: sharedComparisonData.videoA?.id || 'placeholder',
            videoBId: sharedComparisonData.videoB?.id || 'placeholder',
            videoA: sharedComparisonData.videoA,
            videoB: sharedComparisonData.videoB,
            isPublic: sharedComparisonData.isPublic,
            userId: '', // Not needed for shared videos
            createdAt: '',
            updatedAt: '',
          };

          if (comparisonWorkflow) {
            await comparisonWorkflow.loadComparisonVideo(
              comparisonVideo as any
            );
            playerMode.value = 'dual';
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
  } else if (!user.value) {
    // If no share link and not logged in, show the login page
  } else if (!videoLoaded.value) {
    isLoadModalVisible.value = true;
  }
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

const handleToggleROICalibration = () => {
  (currentPoseLandmarker?.value as any)?.toggleROICalibration?.();
};

const handleKeypointSelection = (keypoint: any, isSelected: boolean) => {
  (currentPoseLandmarker?.value as any)?.updateSelectedKeypoints?.(
    keypoint,
    isSelected
  );
};

// Calibration Controls
const handleStartCourtCalibration = () => {
  if (currentSpeedCalculator.value) {
    (currentSpeedCalculator.value as any).startCourtCalibration();
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
    if (newUser && (newUser as any).id) {
      if (currentVideoId.value) {
        startSession();
        setupPresenceTracking((newUser as any).id, (newUser as any).email);
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
            ALPHA v1.1
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
          <div class="flex flex-col items-center">
            <div class="relative">
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
                @set-roi="handleSetROI"
                @reset-roi="handleResetROI"
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
              ></SpeedVisualization>
            </div>
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
            :drawing-canvas-a="dualVideoPlayer?.drawingCanvasA?.value || null"
            :drawing-canvas-b="dualVideoPlayer?.drawingCanvasB?.value || null"
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

    <!-- Load Video Modal -->
    <LoadVideoModal
      :is-visible="isLoadModalVisible"
      @close="closeLoadModal"
      @project-selected="handleProjectSelected"
    />

    <!-- Share Video Modal -->
    <ShareModal
      :is-visible="isShareModalVisible"
      :video-id="shareModalProps.videoId || ''"
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
stroke-width="
