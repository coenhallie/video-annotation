<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import Timeline from './components/Timeline.vue';
import DualTimeline from './components/DualTimeline.vue';
import AnnotationPanel from './components/AnnotationPanel.vue';
import Login from './components/Login.vue';
import LoadVideoModal from './components/LoadVideoModal.vue';
import ShareModal from './components/ShareModal.vue';
import NotificationToast from './components/NotificationToast.vue';
import UnifiedVideoPlayer from './components/UnifiedVideoPlayer.vue';
import { useAuth } from './composables/useAuth.ts';
import { useVideoAnnotations } from './composables/useVideoAnnotations.ts';
import { useRealtimeAnnotations } from './composables/useRealtimeAnnotations.ts';
import { useVideoSession } from './composables/useVideoSession.ts';
import { useDrawingCanvas } from './composables/useDrawingCanvas.ts';
import { useComparisonVideoWorkflow } from './composables/useComparisonVideoWorkflow.ts';
import { useDualVideoPlayer } from './composables/useDualVideoPlayer.js';
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

// Auth
const { user, initAuth, signOut, isLoading } = useAuth();

// Player mode management
const playerMode = ref('single'); // 'single' or 'dual'

// Active video context for dual mode
const activeVideoContext = ref('A'); // 'A' or 'B'

// Single video state (existing)
const videoUrl = ref('');
const videoId = ref('sample-video-1');
const urlInput = ref('');

// Dual video player state
const dualVideoPlayer = useDualVideoPlayer();
const dualVideoPlayerRef = ref(null);

// Video state
const currentTime = ref(0);
const duration = ref(0);
const isPlaying = ref(false);
const videoDimensions = ref({ width: 1920, height: 1080 });
const currentVideoType = ref(null); // Track the current video type for proper deduplication

// Frame-based state
const currentFrame = ref(0);
const totalFrames = ref(0);
const fps = ref(-1); // Will be detected from video

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

watch(
  annotations,
  (newAnnotations) => {
    console.log('👀 [App] Annotations watcher triggered with:', newAnnotations);
    console.log('👀 [App] Annotations count:', newAnnotations?.length || 0);

    if (newAnnotations) {
      // Log each annotation's type for debugging
      newAnnotations.forEach((ann, index) => {
        console.log(`👀 [App] Annotation ${index}:`, {
          id: ann.id,
          type: ann.annotationType,
          hasDrawingData: !!ann.drawingData,
          frame: ann.frame,
        });
      });

      const drawingAnnotations = newAnnotations.filter(
        (ann) => ann.annotationType === 'drawing'
      );

      console.log(
        '👀 [App] Drawing annotations found:',
        drawingAnnotations.length
      );
      console.log(
        '👀 [App] About to call drawingCanvas.loadDrawingsFromAnnotations'
      );

      drawingCanvas.loadDrawingsFromAnnotations(newAnnotations);
    } else {
      console.log('👀 [App] No annotations to process');
    }
  },
  { immediate: true, deep: true }
);

// Event handlers for video player events
const handleTimeUpdate = (data) => {
  currentTime.value = data.currentTime;
  // Also update duration if it's available and not set
  if (data.duration && data.duration > 0 && duration.value !== data.duration) {
    duration.value = data.duration;
  }
};

const handleFrameUpdate = (data) => {
  currentFrame.value = data.currentFrame;
  totalFrames.value = data.totalFrames;
  fps.value = data.fps;

  // Update drawing canvas current frame
  drawingCanvas.currentFrame.value = data.currentFrame;
};

const handleFPSDetected = (data) => {
  fps.value = data.fps;
  totalFrames.value = data.totalFrames;
};

const handlePlay = () => {
  isPlaying.value = true;
};

const handlePause = () => {
  isPlaying.value = false;
};

const handleError = (error) => {};

const handleLoaded = async () => {
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
};

// Timeline event handlers for single video
const handleSeekToTime = (time) => {
  if (unifiedVideoPlayerRef.value?.seekTo) {
    unifiedVideoPlayerRef.value.seekTo(time);
  }
};

// Dual timeline event handlers
const handleSeekVideoA = (time) => {
  if (dualVideoPlayer) {
    dualVideoPlayer.seekVideoA(time);
  }
};

const handleSeekVideoB = (time) => {
  if (dualVideoPlayer) {
    dualVideoPlayer.seekVideoB(time);
  }
};

const handlePlayVideoA = () => {
  if (dualVideoPlayer) {
    dualVideoPlayer.playVideoA();
  }
};

const handlePauseVideoA = () => {
  if (dualVideoPlayer) {
    dualVideoPlayer.pauseVideoA();
  }
};

const handlePlayVideoB = () => {
  if (dualVideoPlayer) {
    dualVideoPlayer.playVideoB();
  }
};

const handlePauseVideoB = () => {
  if (dualVideoPlayer) {
    dualVideoPlayer.pauseVideoB();
  }
};

const handleFrameStepVideoA = (direction) => {
  if (dualVideoPlayer) {
    dualVideoPlayer.stepFrameVideoA(direction);
  }
};

const handleFrameStepVideoB = (direction) => {
  if (dualVideoPlayer) {
    dualVideoPlayer.stepFrameVideoB(direction);
  }
};

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

  // Seek to annotation timestamp with fade transition.
  // The drawing canvas will automatically update based on the new currentFrame.
  await handleSeekToTimeWithFade(annotation.timestamp);

  // DRAWING LOADING FIX: Load drawings AFTER fade transition completes (350ms+)
  // Add extra buffer to ensure fade transition is fully complete
  setTimeout(() => {
    if (annotation && annotation.drawingData) {
      if (playerMode.value === 'dual' && dualVideoPlayer) {
        // In dual mode, load drawing data to both canvases if it exists
        if (
          dualVideoPlayer.drawingCanvasA &&
          annotation.drawingData?.drawingA
        ) {
          dualVideoPlayer.drawingCanvasA.addDrawing(
            annotation.drawingData.drawingA
          );
        }
        if (
          dualVideoPlayer.drawingCanvasB &&
          annotation.drawingData?.drawingB
        ) {
          dualVideoPlayer.drawingCanvasB.addDrawing(
            annotation.drawingData.drawingB
          );
        }
      } else if (playerMode.value === 'single') {
        // In single mode, load drawing data to the primary canvas
        drawingCanvas.addDrawing(annotation.drawingData);
      }
    }
  }, 400); // 400ms delay to ensure 350ms fade transition + buffer is complete
};

// Timeline play/pause handlers for single video
const handleTimelinePlay = () => {
  if (unifiedVideoPlayerRef.value?.play) {
    unifiedVideoPlayerRef.value.play();
  }
};

const handleTimelinePause = () => {
  if (unifiedVideoPlayerRef.value?.pause) {
    unifiedVideoPlayerRef.value.pause();
  }
};

onMounted(async () => {
  await initAuth();

  // Check for shared video first (works without authentication)
  await checkForSharedVideo();

  // Don't automatically load the most recent video - always start with clean slate
  // The load modal will be shown automatically in the user watcher if they have previous videos

  // If there's already a video loaded and user is authenticated, initialize it
  if (user.value && videoUrl.value && duration.value > 0) {
    try {
      const video = await initializeVideo({
        fps: fps.value,
        duration: duration.value,
        totalFrames: totalFrames.value,
      });

      // Track the current video ID for sharing
      if (video && video.id) {
        currentVideoId.value = video.id;
      }

      await startSession();
      setupPresenceTracking(user.value.id, user.value.email);
    } catch (error) {}
  }
});

// Clear video state function
const clearVideoState = () => {
  // Reset player mode to single
  playerMode.value = 'single';

  // Reset dual video player URLs
  if (dualVideoPlayer) {
    dualVideoPlayer.videoAUrl.value = '';
    dualVideoPlayer.videoBUrl.value = '';
    dualVideoPlayer.cleanup();
  }

  // Reset comparison workflow
  comparisonWorkflow.resetWorkflow();

  videoUrl.value = '';
  videoId.value = 'sample-video-1';
  urlInput.value = '';
  currentTime.value = 0;
  duration.value = 0;
  isPlaying.value = false;
  currentFrame.value = 0;
  totalFrames.value = 0;
  fps.value = -1;
  selectedAnnotation.value = null;
  isAnnotationFormVisible.value = false;
  isLoadModalVisible.value = false;
  isShareModalVisible.value = false;
  currentVideoId.value = null;
  currentComparisonId.value = null;
  isSharedComparison.value = false;
  isSharedVideo.value = false;
  sharedVideoData.value = null;

  // End any active session
  if (isSessionActive.value) {
    endSession();
  }
};

// Watch for user authentication changes and re-initialize video if needed
watch(
  user,
  async (newUser, oldUser) => {
    // If user changed (sign out or different user), clear video state
    if (oldUser && (!newUser || newUser.id !== oldUser.id)) {
      clearVideoState();
    }

    if (newUser) {
      // If we already have a video URL (e.g., from shared video), initialize it
      if (videoUrl.value) {
        // If we have a video URL but no video player yet, we need to wait for it to load
        // The video will be initialized in the handleLoaded event
        if (unifiedVideoPlayerRef.value && duration.value > 0) {
          try {
            await initializeVideo({
              fps: fps.value,
              duration: duration.value,
              totalFrames: totalFrames.value,
            });
            await startSession();
            setupPresenceTracking(newUser.id, newUser.email);
          } catch (error) {}
        } else {
        }
      } else if (!isSharedVideo.value && !isSharedComparison.value) {
        // Only show the projects modal for authenticated users who are not viewing shared content
        // No project is currently selected, show the projects modal
        isLoadModalVisible.value = true;
      }
    }
  },
  { immediate: true }
);

// Watch for comparison workflow changes to track current comparison ID
watch(
  () => comparisonWorkflow.currentComparison.value,
  (newComparison) => {
    if (newComparison && newComparison.id) {
      currentComparisonId.value = newComparison.id;
    } else {
      currentComparisonId.value = null;
    }
  },
  { immediate: true }
);

// Handle annotation form visibility events
const handleFormShow = () => {
  isAnnotationFormVisible.value = true;
};

const handleFormHide = () => {
  isAnnotationFormVisible.value = false;
  // Clear annotation context when form is hidden
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    dualVideoPlayer.clearCurrentAnnotationContext();
  }
};

// Handle annotation editing context
const handleAnnotationEdit = (annotation) => {
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    if (annotation) {
      dualVideoPlayer.setCurrentAnnotationContext(annotation);
    } else {
      dualVideoPlayer.clearCurrentAnnotationContext();
    }
  }
};

// Load user's most recent video
const loadMostRecentVideo = async () => {
  if (!user.value) return;

  try {
    const recentVideo = await VideoService.getMostRecentUserVideo(
      user.value.id
    );

    if (recentVideo) {
      videoUrl.value = recentVideo.url;
      urlInput.value = recentVideo.url;
      // Extract video ID from URL for better identification
      const urlParts = recentVideo.url.split('/');
      videoId.value =
        urlParts[urlParts.length - 1].split('.')[0] || 'sample-video-1';
    } else {
    }
  } catch (error) {}
};

// URL loading functionality
const loadVideoFromUrl = () => {
  if (urlInput.value.trim()) {
    const newUrl = urlInput.value.trim();

    // Ensure we're in single mode
    playerMode.value = 'single';
    dualVideoPlayer = null;

    videoUrl.value = newUrl;
    // Extract video ID from URL for better identification
    const urlParts = newUrl.split('/');
    videoId.value =
      urlParts[urlParts.length - 1].split('.')[0] || 'sample-video-1';

    // The new video will be initialized on the 'loaded' event
  } else {
  }
};

const handleUrlKeyPress = (event) => {
  if (event.key === 'Enter') {
    loadVideoFromUrl();
  }
};

// Load modal handlers
const openLoadModal = () => {
  isLoadModalVisible.value = true;
};

const closeLoadModal = () => {
  isLoadModalVisible.value = false;
};

// Handle project selection (unified handler for single and dual video projects)
const handleProjectSelected = async (project) => {
  try {
    if (project.projectType === 'single') {
      // Handle single video project
      const video = project.video;

      // Load annotations for the video
      const annotations = await AnnotationService.getVideoAnnotations(video.id);

      // Create the data structure expected by handleVideoSelected
      const videoData = {
        video,
        annotations: annotations || [],
        videoMetadata: {
          existingVideo: video,
          videoType: video.videoType,
          title: video.title,
          fps: video.fps,
          duration: video.duration,
          totalFrames: video.total_frames,
        },
      };

      // Call the existing single video handler
      await handleVideoSelected(videoData);
    } else if (project.projectType === 'dual') {
      // Handle dual video project
      const videoA = project.videoA;
      const videoB = project.videoB;

      // DEBUG: Log the project structure and video objects

      // Load annotations for both videos
      const [annotationsA, annotationsB] = await Promise.all([
        AnnotationService.getVideoAnnotations(videoA.id),
        AnnotationService.getVideoAnnotations(videoB.id),
      ]);

      // Create the data structure expected by handleComparisonVideoSelected
      const comparisonData = {
        comparisonVideo: project.comparisonVideo,
        videoA,
        videoB,
        annotationsA: annotationsA || [],
        annotationsB: annotationsB || [],
        comparisonAnnotations: [], // Will be loaded by the handler
      };

      // Call the existing comparison video handler
      await handleComparisonVideoSelected(comparisonData);
    }
  } catch (err) {}
};

const handleVideoSelected = async (data) => {
  const { video, annotations: loadedAnnotations, videoMetadata } = data;

  try {
    // Ensure we're in single mode
    playerMode.value = 'single';

    // Clear dual video player URLs
    if (dualVideoPlayer) {
      dualVideoPlayer.videoAUrl.value = '';
      dualVideoPlayer.videoBUrl.value = '';
    }

    // Update video state

    videoUrl.value = video.url;
    urlInput.value = video.url;
    videoId.value = video.videoId;

    // Update video metadata
    fps.value = video.fps;
    duration.value = video.duration;
    totalFrames.value = video.totalFrames;

    // Store the video type for use in handleLoaded
    currentVideoType.value = videoMetadata?.videoType || video.videoType;

    // Initialize video with loaded data and metadata
    if (user.value) {
      const videoRecord = await initializeVideo({
        fps: video.fps,
        duration: video.duration,
        totalFrames: video.totalFrames,
        // Pass the video metadata to preserve type and existing record
        ...videoMetadata,
      });

      // Track the current video ID for sharing
      currentVideoId.value = video.id;

      // Load the annotations using the composable method
      loadExistingAnnotations(loadedAnnotations);

      await startSession();
      setupPresenceTracking(user.value.id, user.value.email);
    }
  } catch (error) {}
};

// Handle shared video selection (for unauthenticated users)
const handleSharedVideoSelected = async (data) => {
  // Handle both old and new data structures
  const video = data.video || data;
  const loadedAnnotations = data.annotations || [];
  const canCommentOnVideo = data.canComment || false;

  console.log('🎬 [App] handleSharedVideoSelected called with data:', data);
  console.log('📹 [App] Video object:', video);
  console.log('📝 [App] Loaded annotations:', loadedAnnotations);
  console.log('📝 [App] Annotations count:', loadedAnnotations.length);

  try {
    // Set shared video state
    isSharedVideo.value = true;
    sharedVideoData.value = data;

    // Update video state - handle both old and new data structures
    const generatedVideoUrl = getVideoUrl(video);
    console.log('🔗 [App] Generated video URL:', generatedVideoUrl);
    console.log('🔗 [App] Video object details:', {
      url: video.url,
      filePath: video.filePath,
      videoType: video.videoType,
      fps: video.fps,
      duration: video.duration,
      totalFrames: video.totalFrames,
    });

    videoUrl.value = generatedVideoUrl; // Use helper function to handle URL/filePath
    videoId.value = video.id; // Use video.id for shared videos
    currentVideoId.value = video.id;

    // Update video metadata
    fps.value = video.fps || -1;
    duration.value = video.duration || 0;
    totalFrames.value = video.totalFrames || 0;

    console.log(
      '📝 [App] About to call loadExistingAnnotations with:',
      loadedAnnotations
    );

    // Load annotations directly without authentication
    loadExistingAnnotations(loadedAnnotations);

    console.log(
      '📝 [App] After loadExistingAnnotations, annotations.value:',
      annotations.value
    );

    // Start session for shared video (this will initialize comment permissions)
    await startSession();
  } catch (error) {
    console.error('❌ [App] Error in handleSharedVideoSelected:', error);
  }
};

// Handle comparison video selection
const handleComparisonVideoSelected = async (data) => {
  const {
    comparisonVideo,
    videoA,
    videoB,
    annotationsA,
    annotationsB,
    comparisonAnnotations,
  } = data;

  // Debug: Log the data structure

  // Check if comparisonVideo is defined before accessing its properties
  if (!comparisonVideo) {
    return;
  }

  try {
    // Load the comparison video using the workflow
    await comparisonWorkflow.loadComparisonVideo(comparisonVideo);

    // Switch to dual mode
    playerMode.value = 'dual';

    // Get the correct URLs using the helper function
    const videoAUrl = getVideoUrl(videoA);
    const videoBUrl = getVideoUrl(videoB);

    console.log('🔍 [App] Setting video URLs:', { videoAUrl, videoBUrl });
    console.log('🔍 [App] VideoA object:', videoA);
    console.log('🔍 [App] VideoB object:', videoB);

    // Set video URLs
    dualVideoPlayer.videoAUrl.value = videoAUrl;
    dualVideoPlayer.videoBUrl.value = videoBUrl;

    console.log('🔍 [App] After setting URLs:', {
      videoAUrlValue: dualVideoPlayer.videoAUrl.value,
      videoBUrlValue: dualVideoPlayer.videoBUrl.value,
    });

    // Initialize annotation system for comparison mode

    const videoAData = {
      videoId: videoA.videoId,
      videoId: videoA.videoId,
      url: videoAUrl,
      fps: videoA.fps,
      duration: videoA.duration,
      totalFrames: videoA.totalFrames,
      videoType: videoA.videoType,
      title: videoA.title,
    };

    const videoBData = {
      videoId: videoB.videoId,
      videoId: videoB.videoId,
      url: videoBUrl,
      fps: videoB.fps,
      duration: videoB.duration,
      totalFrames: videoB.totalFrames,
      videoType: videoB.videoType,
      title: videoB.title,
    };

    // Initialize annotations for comparison mode with comparison video ID
    dualVideoPlayer.initializeAnnotations(
      videoAData,
      videoBData,
      null, // projectId - will be set later if needed
      comparisonVideo.id // comparisonVideoId for comparison-specific annotations
    );

    // Set current video in session to represent comparison session
    videoId.value = `comparison-${comparisonVideo.id}`;

    // Set video metadata for individual videos (no more syncing needed)
    // Each video maintains its own state independently

    // For comparison mode, we don't need to initialize a video record
    // since the individual videos already exist and the comparison video
    // record is managed separately. Just track the comparison ID for sharing.
    if (user.value) {
      currentVideoId.value = comparisonVideo.id;

      // Initialize video annotations for both videos in dual mode
      if (dualVideoPlayer && dualVideoPlayer.initializeVideoAnnotations) {
        try {
          await dualVideoPlayer.initializeVideoAnnotations(
            videoAData,
            videoBData
          );
        } catch (error) {}
      }

      await startSession();
      setupPresenceTracking(user.value.id, user.value.email);
    }

    // In comparison mode, annotations are handled by the comparison workflow
    // The useVideoAnnotations composable will automatically load comparison-specific annotations
    // when isComparisonContext is true, so we don't need to manually load them here

    // Explicitly load annotations to ensure they appear in the UI
    try {
      await loadAnnotations();
    } catch (error) {}

    // Close the modal
    closeLoadModal();
  } catch (error) {}
};

// Share modal handlers
const openShareModal = () => {
  if (playerMode.value === 'dual' && currentComparisonId.value) {
    isShareModalVisible.value = true;
  } else if (playerMode.value === 'single' && currentVideoId.value) {
    isShareModalVisible.value = true;
  } else {
  }
};

// Computed property for share button availability
const canShare = computed(() => {
  return playerMode.value === 'single'
    ? !!currentVideoId.value
    : !!currentComparisonId.value;
});

// Computed properties for share modal props
const shareModalProps = computed(() => {
  if (playerMode.value === 'dual' && currentComparisonId.value) {
    return {
      shareType: 'comparison',
      comparisonId: currentComparisonId.value,
    };
  } else {
    return {
      shareType: 'video',
      videoId: currentVideoId.value,
    };
  }
});

const closeShareModal = () => {
  isShareModalVisible.value = false;
};

// Drawing event handlers
const handleDrawingCreated = async (drawing, videoContext = null) => {
  // Handle dual video mode - call the dual video player's drawing handler
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    // CRITICAL FIX: Use the detected video context from UnifiedVideoPlayer
    // Convert 'A'/'B' to the expected format for the dual video player
    const dualVideoContext = videoContext === 'B' ? 'B' : 'A';

    console.log(
      `🎨 [App.vue] Drawing created on video ${dualVideoContext}:`,
      drawing
    );

    // Also notify the AnnotationPanel if the form is open so it can capture drawing data
    if (isAnnotationFormVisible.value && annotationPanelRef.value) {
      annotationPanelRef.value.onDrawingCreated(drawing, dualVideoContext);
    }

    // Call the dual video player's handleDrawingCreated method which will check annotation context
    try {
      await dualVideoPlayer.handleDrawingCreated(
        drawing,
        dualVideoContext,
        user.value?.id
      );
    } catch (error) {
      console.error(
        'Failed to handle drawing creation in dual video mode:',
        error
      );
    }
    return;
  }

  // Handle single video mode (existing logic)
  // Always add to local drawing canvas first
  drawingCanvas.addDrawing(drawing);

  // If this drawing was created from the annotation panel, forward it to the annotation panel
  // and DO NOT create a separate annotation - let the annotation panel handle it
  if (isAnnotationFormVisible.value && annotationPanelRef.value) {
    // Forward the drawing to the annotation panel
    if (annotationPanelRef.value.onDrawingCreated) {
      annotationPanelRef.value.onDrawingCreated(drawing);
    }
    // Return early to prevent duplicate annotation creation
    return;
  } else {
    // Convert drawing to annotation and save it to Supabase (only when drawing outside annotation form)

    try {
      const annotation = drawingCanvas.convertDrawingToAnnotation(
        drawing,
        videoId.value,
        user.value?.id || 'anonymous',
        'Drawing Annotation',
        `Drawing on frame ${drawing.frame}`
      );

      // Save to Supabase via addAnnotation
      await addAnnotation(annotation);

      // Reload annotations to ensure the UI shows the latest data from Supabase

      await loadAnnotations();
    } catch (error) {}
  }
};

const handleDrawingUpdated = (drawing, videoContext = null) => {
  // Handle dual video mode
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    // CRITICAL FIX: Use the detected video context from UnifiedVideoPlayer
    const dualVideoContext = videoContext === 'B' ? 'B' : 'A';

    console.log(
      `🎨 [App.vue] Drawing updated on video ${dualVideoContext}:`,
      drawing
    );

    // For dual video mode, we don't automatically save updates
    // Updates are handled through the annotation panel when user clicks save
    return;
  }

  // Handle single video mode drawing updates if needed
};

const handleDrawingDeleted = (drawingId, videoContext = null) => {
  // Handle dual video mode
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    // CRITICAL FIX: Use the detected video context from UnifiedVideoPlayer
    const dualVideoContext = videoContext === 'B' ? 'B' : 'A';

    console.log(
      `🎨 [App.vue] Drawing deleted on video ${dualVideoContext}:`,
      drawingId
    );

    // For dual video mode, handle deletion if needed
    return;
  }

  // Handle single video mode drawing deletion if needed
};

// Handle dual video loaded events
const handleDualVideoLoaded = () => {
  // Additional logic if needed when dual videos are loaded
};

// Handle video context changes
const handleVideoContextChanged = (context) => {
  activeVideoContext.value = context;
};

// Handle creating anonymous session for shared video commenting
const handleCreateAnonymousSession = async (displayName) => {
  try {
    const session = await createAnonymousSession(displayName);

    // Refresh comment permissions after creating session
    await refreshCommentPermissions();

    return session;
  } catch (error) {
    throw error;
  }
};

// Check for shared video or comparison on load
const checkForSharedVideo = async () => {
  console.log('🔗 [App] checkForSharedVideo called');
  console.log('🔗 [App] Current URL:', window.location.href);

  const shareData = ShareService.parseShareUrl();
  console.log('🔗 [App] Parsed share data:', shareData);

  if (!shareData.type || !shareData.id) {
    console.log('🔗 [App] No share data found, returning');
    return;
  }

  try {
    if (shareData.type === 'video') {
      console.log('🔗 [App] Loading shared video:', shareData.id);

      // Use the enhanced method that includes comment permissions
      const sharedData =
        await ShareService.getSharedVideoWithCommentPermissions(shareData.id);

      console.log('🔗 [App] Got shared data from service:', sharedData);

      await handleSharedVideoSelected(sharedData);

      // Clear the share parameter from URL without reloading
      const url = new URL(window.location);
      url.searchParams.delete('share');
      window.history.replaceState({}, document.title, url.toString());
    } else if (shareData.type === 'comparison') {
      console.log('🔗 [App] Loading shared comparison:', shareData.id);
      await initializeSharedComparison(shareData.id);

      // Clear the shareComparison parameter from URL without reloading
      const url = new URL(window.location);
      url.searchParams.delete('shareComparison');
      window.history.replaceState({}, document.title, url.toString());
    }
  } catch (error) {
    console.error('❌ [App] Error in checkForSharedVideo:', error);
    // Could show a toast notification here
  }
};

// Initialize shared comparison video
const initializeSharedComparison = async (comparisonId) => {
  try {
    console.log(
      '🔄 [App] initializeSharedComparison called with:',
      comparisonId
    );

    isSharedComparison.value = true;

    // Set current video ID for session tracking (needed for comment permissions)
    currentVideoId.value = comparisonId;

    // Get shared comparison data
    console.log(
      '🔄 [App] Calling ShareService.getSharedComparisonVideoWithCommentPermissions'
    );
    const sharedComparison =
      await ShareService.getSharedComparisonVideoWithCommentPermissions(
        comparisonId
      );

    console.log('🔄 [App] Got shared comparison data:', sharedComparison);
    console.log(
      '🔄 [App] Shared comparison annotations:',
      sharedComparison.annotations
    );
    console.log(
      '🔄 [App] Shared comparison annotations count:',
      sharedComparison.annotations?.length || 0
    );

    // Set up dual mode
    playerMode.value = 'dual';
    currentComparisonId.value = comparisonId;

    // Prepare video objects with URLs for the comparison workflow
    const videoAData = sharedComparison.videoA
      ? {
          ...sharedComparison.videoA,
          url: getVideoUrl(sharedComparison.videoA),
        }
      : null;

    const videoBData = sharedComparison.videoB
      ? {
          ...sharedComparison.videoB,
          url: getVideoUrl(sharedComparison.videoB),
        }
      : null;

    console.log('🔄 [App] Video A data:', videoAData);
    console.log('🔄 [App] Video B data:', videoBData);

    // Select videos in the comparison workflow (this sets selectedVideoA and selectedVideoB)
    if (videoAData && videoAData.id !== 'placeholder') {
      comparisonWorkflow.selectVideoA(videoAData);
    } else {
      console.log('🔄 [App] Video A is placeholder or missing');
    }

    if (videoBData && videoBData.id !== 'placeholder') {
      comparisonWorkflow.selectVideoB(videoBData);
    } else {
      console.log('🔄 [App] Video B is placeholder or missing');
    }

    // Ensure dual video player is initialized
    if (!dualVideoPlayer) {
      dualVideoPlayer = useDualVideoPlayer();
    }

    // Set up dual video player URLs and IDs
    if (videoAData?.url) {
      dualVideoPlayer.videoAUrl.value = videoAData.url;
      dualVideoPlayer.videoAId.value = videoAData.id;
    }
    if (videoBData?.url) {
      dualVideoPlayer.videoBUrl.value = videoBData.url;
      dualVideoPlayer.videoBId.value = videoBData.id;
    }

    // Initialize video states to prevent undefined errors
    if (dualVideoPlayer.videoAState) {
      dualVideoPlayer.videoAState.isLoaded = false;
      dualVideoPlayer.videoAState.hasError = false;
    }
    if (dualVideoPlayer.videoBState) {
      dualVideoPlayer.videoBState.isLoaded = false;
      dualVideoPlayer.videoBState.hasError = false;
    }

    // Create a proper comparison object for the workflow
    const comparisonObject = {
      id: comparisonId,
      title: sharedComparison.title,
      description: sharedComparison.description,
      videoAId: sharedComparison.videoA?.id,
      videoBId: sharedComparison.videoB?.id,
      videoA: videoAData,
      videoB: videoBData,
      isPublic: sharedComparison.isPublic,
    };

    console.log('🔄 [App] Comparison object:', comparisonObject);

    // Use the proper workflow method to load the comparison
    // This will automatically load all annotations (comparison + individual video annotations)
    console.log('🔄 [App] Loading comparison video in workflow');
    await comparisonWorkflow.loadComparisonVideo(comparisonObject);

    console.log(
      '🔄 [App] Comparison workflow loaded, isReady:',
      comparisonWorkflow.isReady.value
    );

    // Load drawings for comparison mode
    if (dualVideoPlayer && comparisonWorkflow.isReady.value) {
      // Get all annotations from the comparison workflow
      const allAnnotations = [
        ...comparisonWorkflow.comparisonAnnotations.value,
        ...comparisonWorkflow.videoAAnnotations.value,
        ...comparisonWorkflow.videoBAnnotations.value,
      ];

      console.log('🔄 [App] All annotations from workflow:', allAnnotations);
      console.log('🔄 [App] All annotations count:', allAnnotations.length);

      // Load drawings into the appropriate canvases
      setTimeout(() => {
        console.log('🔄 [App] Processing annotations for drawings');
        allAnnotations.forEach((annotation, index) => {
          console.log(`🔄 [App] Processing annotation ${index}:`, annotation);
          if (
            annotation.annotationType === 'drawing' &&
            annotation.drawingData
          ) {
            console.log(
              `🔄 [App] Found drawing annotation ${index}:`,
              annotation.drawingData
            );

            // Handle comparison-specific drawings (drawingA and drawingB)
            if (
              annotation.drawingData.drawingA &&
              dualVideoPlayer.drawingCanvasA
            ) {
              console.log('🔄 [App] Adding drawing to canvas A');
              dualVideoPlayer.drawingCanvasA.addDrawing(
                annotation.drawingData.drawingA
              );
            }
            if (
              annotation.drawingData.drawingB &&
              dualVideoPlayer.drawingCanvasB
            ) {
              console.log('🔄 [App] Adding drawing to canvas B');
              dualVideoPlayer.drawingCanvasB.addDrawing(
                annotation.drawingData.drawingB
              );
            }

            // Handle individual video drawings
            if (
              !annotation.drawingData.drawingA &&
              !annotation.drawingData.drawingB
            ) {
              console.log('🔄 [App] Processing individual video drawing');
              // This is a regular drawing annotation, determine which canvas based on videoId
              if (
                annotation.videoId === comparisonObject.videoAId &&
                dualVideoPlayer.drawingCanvasA
              ) {
                console.log('🔄 [App] Adding individual drawing to canvas A');
                dualVideoPlayer.drawingCanvasA.addDrawing(
                  annotation.drawingData
                );
              } else if (
                annotation.videoId === comparisonObject.videoBId &&
                dualVideoPlayer.drawingCanvasB
              ) {
                console.log('🔄 [App] Adding individual drawing to canvas B');
                dualVideoPlayer.drawingCanvasB.addDrawing(
                  annotation.drawingData
                );
              }
            }
          }
        });
      }, 150); // Small delay to ensure canvases are ready
    } else {
      console.log('🔄 [App] Dual video player not ready or not initialized');
    }

    // Start session for shared comparison (this will initialize comment permissions)
    await startSession();
  } catch (error) {
    console.error('❌ [App] Error in initializeSharedComparison:', error);
    throw error;
  }
};
</script>

<template>
  <!-- Loading state while auth is initializing -->
  <div
    v-if="isLoading"
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

      <!-- Annotation Panel -->
      <aside
        class="w-96 min-w-96 max-w-96 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden"
      >
        <AnnotationPanel
          ref="annotationPanelRef"
          :annotations="annotations"
          :selected-annotation="selectedAnnotation"
          :current-time="currentTime"
          :current-frame="currentFrame"
          :fps="fps"
          :drawing-canvas="drawingCanvas"
          :read-only="(isSharedVideo || isSharedComparison) && !canComment()"
          :video-id="currentVideoId"
          :loading="annotationsLoading"
          :is-dual-mode="playerMode === 'dual'"
          :drawing-canvas-a="dualVideoPlayer?.drawingCanvasA"
          :drawing-canvas-b="dualVideoPlayer?.drawingCanvasB"
          :dual-video-player="dualVideoPlayer"
          :comment-permissions="commentPermissions"
          :anonymous-session="anonymousSession"
          :is-shared-video="isSharedVideo || isSharedComparison"
          :comment-context="getCommentContext()"
          :drawing-canvas-ref="unifiedVideoPlayerRef?.singleDrawingCanvasRef"
          :drawing-canvas-a-ref="unifiedVideoPlayerRef?.drawingCanvasARef"
          :drawing-canvas-b-ref="unifiedVideoPlayerRef?.drawingCanvasBRef"
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
