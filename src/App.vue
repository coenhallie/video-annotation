<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import Timeline from './components/Timeline.vue';
import AnnotationPanel from './components/AnnotationPanel.vue';
import Login from './components/Login.vue';
import LoadVideoModal from './components/LoadVideoModal.vue';
import ShareModal from './components/ShareModal.vue';
import NotificationToast from './components/NotificationToast.vue';
import UnifiedVideoPlayer from './components/UnifiedVideoPlayer.vue';
import VideoContextSwitcher from './components/VideoContextSwitcher.vue';
import DrawingTools from './components/DrawingTools.vue';
import { useAuth } from './composables/useAuth.ts';
import { useVideoAnnotations } from './composables/useVideoAnnotations.ts';
import { useRealtimeAnnotations } from './composables/useRealtimeAnnotations.ts';
import { useVideoSession } from './composables/useVideoSession.ts';
import { useDrawingCanvas } from './composables/useDrawingCanvas.ts';
import { useDualVideoPlayer } from './composables/useDualVideoPlayer.js';
import { useComparisonVideoWorkflow } from './composables/useComparisonVideoWorkflow.ts';
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

  // If it's an uploaded video with a file_path, generate the public URL
  if (video.video_type === 'upload' && video.file_path) {
    const { data } = supabase.storage
      .from('videos')
      .getPublicUrl(video.file_path);
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
let dualVideoPlayer = null;
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
const fps = ref(30);

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
    console.error('❌ [App] Error creating annotation:', error);
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
    console.log(
      '🎯 [App] Annotations changed, total annotations:',
      newAnnotations?.length || 0
    );
    console.log('🎯 [App] Full newAnnotations array:', newAnnotations);

    if (newAnnotations) {
      // Log each annotation's type for debugging
      newAnnotations.forEach((ann, index) => {
        console.log(
          `🎯 [App] Annotation ${index}: type="${ann.annotationType}", id=${ann.id}`
        );
      });

      const drawingAnnotations = newAnnotations.filter(
        (ann) => ann.annotationType === 'drawing'
      );
      console.log(
        '🎯 [App] Drawing annotations found:',
        drawingAnnotations.length
      );
      console.log('🎯 [App] Drawing annotations details:', drawingAnnotations);

      drawingCanvas.loadDrawingsFromAnnotations(newAnnotations);
    }
  },
  { immediate: true, deep: true }
);

// Event handlers for video player events
const handleTimeUpdate = (data) => {
  console.log('🎯 [App] handleTimeUpdate received:', {
    currentTime: data.currentTime,
    duration: data.duration,
    previousCurrentTime: currentTime.value,
    previousDuration: duration.value,
  });
  currentTime.value = data.currentTime;
  // Also update duration if it's available and not set
  if (data.duration && data.duration > 0 && duration.value !== data.duration) {
    console.log('🎯 [App] Updating duration from timeUpdate:', data.duration);
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
  console.log(`FPS detected: ${data.fps}, Total frames: ${data.totalFrames}`);
};

const handlePlay = () => {
  isPlaying.value = true;
};

const handlePause = () => {
  isPlaying.value = false;
};

const handleDurationChange = (newDuration) => {
  console.log('handleDurationChange called with:', newDuration);
  duration.value = newDuration;
  console.log('Duration updated to:', duration.value);
};

const handleError = (error) => {
  console.error('🚨 [App] Video error received:', error);
  console.error('🚨 [App] Current video URL:', videoUrl.value);
  console.error('🚨 [App] Video ID:', videoId.value);
};

const handleLoaded = async () => {
  console.log('✅ [App] Video loaded successfully');
  console.log('✅ [App] Video URL:', videoUrl.value);
  console.log('✅ [App] FPS:', fps.value);
  console.log('✅ [App] Duration:', duration.value);
  console.log('✅ [App] Total frames:', totalFrames.value);
  console.log('✅ [App] User:', user.value?.email || 'No user');

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
    console.log('✅ [App] Video dimensions:', videoDimensions.value);

    // Update drawing canvas with video dimensions
    drawingCanvas.setVideoSize(
      videoDimensions.value.width,
      videoDimensions.value.height
    );
  }

  if (user.value) {
    console.log('✅ [App] Initializing video with metadata...');
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

    console.log('✅ [App] Starting session...');
    await startSession();
    console.log('✅ [App] Setting up presence tracking...');
    setupPresenceTracking(user.value.id, user.value.email);
    console.log('✅ [App] Video initialization complete');
  } else {
    console.warn('⚠️ [App] No user found, skipping video initialization');
  }
};

// Timeline event handlers
const handleSeekToTime = (time) => {
  console.log('handleSeekToTime called with time:', time);

  if (playerMode.value === 'dual' && dualVideoPlayer) {
    console.log('Seeking in dual mode');
    dualVideoPlayer.syncSeek(time);
  } else {
    console.log(
      'DEBUG - unifiedVideoPlayerRef.value:',
      unifiedVideoPlayerRef.value
    );

    if (unifiedVideoPlayerRef.value?.seekTo) {
      console.log('Calling unifiedVideoPlayerRef.seekTo with time:', time);
      unifiedVideoPlayerRef.value.seekTo(time);
    } else {
      console.warn('seekTo method not found on unifiedVideoPlayerRef');
    }
  }
};

// Timeline event handlers with fade transition for annotation clicks
const handleSeekToTimeWithFade = async (time) => {
  console.log('handleSeekToTimeWithFade called with time:', time);

  if (playerMode.value === 'dual' && dualVideoPlayer) {
    console.log('Seeking in dual mode with fade');
    // For dual mode, we could implement fade transition later if needed
    dualVideoPlayer.syncSeek(time);
  } else {
    console.log(
      'DEBUG - unifiedVideoPlayerRef.value:',
      unifiedVideoPlayerRef.value
    );

    if (
      unifiedVideoPlayerRef.value?.performVideoFadeTransition &&
      unifiedVideoPlayerRef.value?.seekTo
    ) {
      console.log(
        'Calling unifiedVideoPlayerRef.performVideoFadeTransition with time:',
        time
      );
      await unifiedVideoPlayerRef.value.performVideoFadeTransition(() => {
        unifiedVideoPlayerRef.value.seekTo(time);
      });
    } else if (unifiedVideoPlayerRef.value?.seekTo) {
      console.log(
        'Fade transition not available, falling back to regular seek'
      );
      unifiedVideoPlayerRef.value.seekTo(time);
    } else {
      console.warn('seekTo method not found on unifiedVideoPlayerRef');
    }
  }
};

const handleAnnotationClick = (annotation) => {
  console.log('🎨 [App] handleAnnotationClick called with:', annotation);

  selectedAnnotation.value = annotation;

  // Seek to annotation timestamp with fade transition.
  // The drawing canvas will automatically update based on the new currentFrame.
  handleSeekToTimeWithFade(annotation.timestamp);
};

// Timeline play/pause handlers
const handleTimelinePlay = () => {
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    console.log('Playing in dual mode');
    dualVideoPlayer.syncPlay();
  } else {
    if (unifiedVideoPlayerRef.value?.play) {
      unifiedVideoPlayerRef.value.play();
    }
  }
};

const handleTimelinePause = () => {
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    console.log('Pausing in dual mode');
    dualVideoPlayer.syncPause();
  } else {
    if (unifiedVideoPlayerRef.value?.pause) {
      unifiedVideoPlayerRef.value.pause();
    }
  }
};

onMounted(async () => {
  console.log('🚀 [App] Component mounted, initializing auth...');
  await initAuth();

  console.log(
    '🚀 [App] Auth initialized, user:',
    user.value?.email || 'No user'
  );

  // Check for shared video first (works without authentication)
  await checkForSharedVideo();

  // Don't automatically load the most recent video - always start with clean slate
  // The load modal will be shown automatically in the user watcher if they have previous videos

  // If there's already a video loaded and user is authenticated, initialize it
  if (user.value && videoUrl.value && duration.value > 0) {
    console.log(
      '✅ [App] User authenticated with existing video, initializing...'
    );
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
      console.log('✅ [App] Video initialization complete on mount');
    } catch (error) {
      console.error('🚨 [App] Error initializing video on mount:', error);
    }
  }
});

// Clear video state function
const clearVideoState = () => {
  console.log('🧹 [App] Clearing video state for clean user separation');

  // Reset player mode to single
  playerMode.value = 'single';
  dualVideoPlayer = null;

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
  fps.value = 30;
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
      console.log('🔄 [App] User changed, clearing video state...');
      clearVideoState();
    }

    if (newUser) {
      console.log(
        '🔄 [App] User authenticated, checking for previous videos...'
      );

      // Check if user has any previous videos
      try {
        const userVideos = await VideoService.getUserVideos(newUser.id);

        if (userVideos && userVideos.length > 0) {
          console.log(
            '🔄 [App] User has previous videos, showing load modal...'
          );
          // User has previous videos, show the load modal automatically
          isLoadModalVisible.value = true;
        } else {
          console.log(
            '🔄 [App] No previous videos found, showing default screen'
          );
          // No previous videos, user will see the default screen with URL input
        }
      } catch (error) {
        console.error('🚨 [App] Error checking user videos:', error);
        // On error, just show the default screen
      }

      // If we already have a video URL (e.g., from shared video), initialize it
      if (videoUrl.value) {
        console.log(
          '🔄 [App] Video URL available, checking if video needs initialization...'
        );

        // If we have a video URL but no video player yet, we need to wait for it to load
        // The video will be initialized in the handleLoaded event
        if (unifiedVideoPlayerRef.value && duration.value > 0) {
          console.log(
            '✅ [App] Video already loaded, initializing annotations...'
          );
          try {
            await initializeVideo({
              fps: fps.value,
              duration: duration.value,
              totalFrames: totalFrames.value,
            });
            await startSession();
            setupPresenceTracking(newUser.id, newUser.email);
            console.log('✅ [App] Video initialization complete after auth');
          } catch (error) {
            console.error(
              '🚨 [App] Error initializing video after auth:',
              error
            );
          }
        } else {
          console.log(
            '🔄 [App] Video not yet loaded, will initialize on load event'
          );
        }
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
      console.log('🔄 [App] Current comparison ID updated:', newComparison.id);
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
  console.log(
    '🎨 [App] Setting annotation context for editing:',
    annotation?.id || 'null'
  );
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
    console.log(
      '🎬 [App] Loading most recent video for user:',
      user.value.email
    );
    const recentVideo = await VideoService.getMostRecentUserVideo(
      user.value.id
    );

    if (recentVideo) {
      console.log(
        '🎬 [App] Found recent video:',
        recentVideo.title,
        recentVideo.url
      );
      videoUrl.value = recentVideo.url;
      urlInput.value = recentVideo.url;
      // Extract video ID from URL for better identification
      const urlParts = recentVideo.url.split('/');
      videoId.value =
        urlParts[urlParts.length - 1].split('.')[0] || 'sample-video-1';
      console.log('🎬 [App] Set video ID to:', videoId.value);
    } else {
      console.log('🎬 [App] No recent video found for user');
    }
  } catch (error) {
    console.error('🚨 [App] Error loading most recent video:', error);
  }
};

// URL loading functionality
const loadVideoFromUrl = () => {
  console.log('🎬 [App] loadVideoFromUrl called');
  console.log('🎬 [App] urlInput.value:', urlInput.value);

  if (urlInput.value.trim()) {
    const newUrl = urlInput.value.trim();
    console.log('🎬 [App] Setting new video URL:', newUrl);
    console.log('🎬 [App] Previous video URL:', videoUrl.value);

    // Ensure we're in single mode
    playerMode.value = 'single';
    dualVideoPlayer = null;

    videoUrl.value = newUrl;
    // Extract video ID from URL for better identification
    const urlParts = newUrl.split('/');
    videoId.value =
      urlParts[urlParts.length - 1].split('.')[0] || 'sample-video-1';
    console.log('🎬 [App] Video URL updated to:', videoUrl.value);
    console.log('🎬 [App] Video ID updated to:', videoId.value);
    // The new video will be initialized on the 'loaded' event
  } else {
    console.warn('🎬 [App] URL input is empty, not loading video');
  }
};

const handleUrlKeyPress = (event) => {
  console.log('🎬 [App] Key pressed in URL input:', event.key);
  if (event.key === 'Enter') {
    console.log('🎬 [App] Enter key detected, calling loadVideoFromUrl');
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
  console.log(
    '🎬 [App] Project selected:',
    project.title,
    'Type:',
    project.project_type
  );

  try {
    if (project.project_type === 'single') {
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
          videoType: video.video_type,
          title: video.title,
          fps: video.fps,
          duration: video.duration,
          totalFrames: video.total_frames,
        },
      };

      // Call the existing single video handler
      await handleVideoSelected(videoData);
    } else if (project.project_type === 'dual') {
      // Handle dual video project
      const videoA = project.video_a;
      const videoB = project.video_b;

      // DEBUG: Log the project structure and video objects
      console.log('🐛 [DEBUG] Dual project selected:', {
        id: project.id,
        title: project.title,
        project_type: project.project_type,
      });
      console.log('🐛 [DEBUG] project.video_a:', {
        id: videoA?.id,
        title: videoA?.title,
        url: videoA?.url,
        video_type: videoA?.video_type,
        file_path: videoA?.file_path,
      });
      console.log('🐛 [DEBUG] project.video_b:', {
        id: videoB?.id,
        title: videoB?.title,
        url: videoB?.url,
        video_type: videoB?.video_type,
        file_path: videoB?.file_path,
      });

      // Load annotations for both videos
      const [annotationsA, annotationsB] = await Promise.all([
        AnnotationService.getVideoAnnotations(videoA.id),
        AnnotationService.getVideoAnnotations(videoB.id),
      ]);

      // Create the data structure expected by handleComparisonVideoSelected
      const comparisonData = {
        comparisonVideo: project.comparison_video,
        videoA,
        videoB,
        annotationsA: annotationsA || [],
        annotationsB: annotationsB || [],
        comparisonAnnotations: [], // Will be loaded by the handler
      };

      // Call the existing comparison video handler
      await handleComparisonVideoSelected(comparisonData);
    }
  } catch (err) {
    console.error('❌ [App] Error handling project selection:', err);
  }
};

const handleVideoSelected = async (data) => {
  const { video, annotations: loadedAnnotations, videoMetadata } = data;

  console.log('🎬 [App] Loading selected video:', video.title);
  console.log('🎬 [App] With annotations:', loadedAnnotations.length);
  console.log('🐛 [DEBUG] Selected video object:', {
    id: video.id,
    title: video.title,
    url: video.url,
    video_id: video.video_id,
    video_type: video.video_type,
    file_path: video.file_path,
    original_filename: video.original_filename,
  });
  console.log('🐛 [DEBUG] Video metadata:', videoMetadata);

  try {
    // Ensure we're in single mode
    playerMode.value = 'single';
    dualVideoPlayer = null;

    // Update video state
    console.log(
      '🐛 [DEBUG] Setting videoUrl from:',
      videoUrl.value,
      'to:',
      video.url
    );
    console.log(
      '🐛 [DEBUG] Setting videoId from:',
      videoId.value,
      'to:',
      video.video_id
    );

    videoUrl.value = video.url;
    urlInput.value = video.url;
    videoId.value = video.video_id;

    // Update video metadata
    fps.value = video.fps;
    duration.value = video.duration;
    totalFrames.value = video.total_frames;

    // Store the video type for use in handleLoaded
    currentVideoType.value = videoMetadata?.videoType || video.video_type;

    console.log(
      '🐛 [DEBUG] About to call initializeVideo with videoUrl:',
      videoUrl.value,
      'videoId:',
      videoId.value,
      'videoMetadata:',
      videoMetadata,
      'currentVideoType:',
      currentVideoType.value
    );

    // Initialize video with loaded data and metadata
    if (user.value) {
      const videoRecord = await initializeVideo({
        fps: video.fps,
        duration: video.duration,
        totalFrames: video.total_frames,
        // Pass the video metadata to preserve type and existing record
        ...videoMetadata,
      });

      console.log('🐛 [DEBUG] initializeVideo returned:', {
        id: videoRecord?.id,
        url: videoRecord?.url,
        video_type: videoRecord?.video_type,
      });

      // Track the current video ID for sharing
      currentVideoId.value = video.id;

      // Load the annotations using the composable method
      loadExistingAnnotations(loadedAnnotations);

      await startSession();
      setupPresenceTracking(user.value.id, user.value.email);

      console.log('✅ [App] Successfully loaded video and annotations');
    }
  } catch (error) {
    console.error('❌ [App] Error loading selected video:', error);
  }
};

// Handle shared video selection (for unauthenticated users)
const handleSharedVideoSelected = async (data) => {
  // Handle both old and new data structures
  const video = data.video || data;
  const loadedAnnotations = data.annotations || [];
  const canCommentOnVideo = data.can_comment || false;

  console.log('🔗 [App] Loading shared video:', video.title || video.id);
  console.log('🔗 [App] With annotations:', loadedAnnotations.length);
  console.log('🔗 [App] Comment permissions:', canCommentOnVideo);

  try {
    // Set shared video state
    isSharedVideo.value = true;
    sharedVideoData.value = data;

    // Update video state - handle both old and new data structures
    videoUrl.value = video.url;
    videoId.value = video.id; // Use video.id for shared videos
    currentVideoId.value = video.id;

    // Update video metadata
    fps.value = video.fps;
    duration.value = video.duration;
    totalFrames.value = video.total_frames;

    // Load annotations directly without authentication
    loadExistingAnnotations(loadedAnnotations);

    // Start session for shared video (this will initialize comment permissions)
    await startSession();

    console.log(
      '✅ [App] Successfully loaded shared video with comment support'
    );
  } catch (error) {
    console.error('❌ [App] Error loading shared video:', error);
  }
};

// Handle dual video selection
const handleDualVideosSelected = async (data) => {
  const { videoA, videoB } = data;

  console.log(
    '🎬🎬 [App] Loading dual videos:',
    videoA.title,
    'and',
    videoB.title
  );

  // 🐛 DEBUG: Log video objects to trace URL assignment
  console.log('🐛 [DEBUG] VideoA object:', {
    id: videoA.id,
    title: videoA.title,
    url: videoA.url,
    video_type: videoA.video_type,
    file_path: videoA.file_path,
    original_filename: videoA.original_filename,
  });
  console.log('🐛 [DEBUG] VideoB object:', {
    id: videoB.id,
    title: videoB.title,
    url: videoB.url,
    video_type: videoB.video_type,
    file_path: videoB.file_path,
    original_filename: videoB.original_filename,
  });

  try {
    // Switch to dual mode
    playerMode.value = 'dual';

    // Initialize dual video player composable
    dualVideoPlayer = useDualVideoPlayer();

    // Set video URLs
    console.log('🐛 [DEBUG] Setting videoA URL:', videoA.url);
    console.log('🐛 [DEBUG] Setting videoB URL:', videoB.url);
    dualVideoPlayer.videoAUrl.value = videoA.url;
    dualVideoPlayer.videoBUrl.value = videoB.url;

    // Initialize annotation system for dual videos
    console.log('🎯 [App] Initializing annotation system for dual videos');
    const videoAData = {
      videoId: videoA.video_id,
      video_id: videoA.video_id,
      url: videoA.url,
      fps: videoA.fps,
      duration: videoA.duration,
      totalFrames: videoA.total_frames,
      videoType: videoA.video_type,
      title: videoA.title,
    };

    const videoBData = {
      videoId: videoB.video_id,
      video_id: videoB.video_id,
      url: videoB.url,
      fps: videoB.fps,
      duration: videoB.duration,
      totalFrames: videoB.total_frames,
      videoType: videoB.video_type,
      title: videoB.title,
    };

    // Initialize annotations for both videos with proper project context
    // For comparison mode, we need to create a project context or use existing one
    const projectIdForAnnotations = currentProject.value?.id || null;
    const comparisonVideoIdForAnnotations = `comparison-${videoA.id}-${videoB.id}`;

    console.log('🎯 [App] Initializing annotations with context:', {
      projectId: projectIdForAnnotations,
      comparisonVideoId: comparisonVideoIdForAnnotations,
      videoAId: videoA.video_id,
      videoBId: videoB.video_id,
    });

    dualVideoPlayer.initializeAnnotations(
      videoAData,
      videoBData,
      projectIdForAnnotations,
      comparisonVideoIdForAnnotations
    );

    // 🐛 DEBUG: Verify URLs were set correctly
    console.log(
      '🐛 [DEBUG] VideoA URL after assignment:',
      dualVideoPlayer.videoAUrl.value
    );
    console.log(
      '🐛 [DEBUG] VideoB URL after assignment:',
      dualVideoPlayer.videoBUrl.value
    );

    // Set current video in session to represent dual session
    videoId.value = `dual-${videoA.video_id}-${videoB.video_id}`;

    // Use the longer duration for the timeline
    const maxDuration = Math.max(videoA.duration, videoB.duration);
    duration.value = maxDuration;
    dualVideoPlayer.duration.value = maxDuration;

    // Use the higher FPS for synchronization
    const maxFps = Math.max(videoA.fps, videoB.fps);
    fps.value = maxFps;
    dualVideoPlayer.fps.value = maxFps;

    // Calculate total frames based on max duration and FPS
    totalFrames.value = Math.floor(maxDuration * maxFps);
    dualVideoPlayer.totalFrames.value = totalFrames.value;

    // Setup watchers to sync dual video player state with main App state
    watch(dualVideoPlayer.currentTime, (newTime) => {
      currentTime.value = newTime;
    });

    watch(dualVideoPlayer.currentFrame, (newFrame) => {
      currentFrame.value = newFrame;
    });

    watch(dualVideoPlayer.isPlaying, (newIsPlaying) => {
      isPlaying.value = newIsPlaying;
    });

    watch(dualVideoPlayer.duration, (newDuration) => {
      if (newDuration > duration.value) {
        duration.value = newDuration;
      }
    });

    watch(dualVideoPlayer.totalFrames, (newTotalFrames) => {
      totalFrames.value = newTotalFrames;
    });

    watch(dualVideoPlayer.fps, (newFps) => {
      fps.value = newFps;
    });

    // Initialize video session for dual mode
    if (user.value) {
      try {
        // For dual mode, we don't need to create a new video record
        // Instead, we'll use the comparison video ID for session tracking
        console.log('🎯 [App] Starting session for dual video mode');

        // Set up the video metadata for session
        videoUrl.value = `dual:${videoA.url}|${videoB.url}`;

        // Initialize video annotations for both videos in dual mode
        if (dualVideoPlayer && dualVideoPlayer.initializeVideoAnnotations) {
          console.log('🎯 [App] Initializing video annotations for dual mode');
          try {
            await dualVideoPlayer.initializeVideoAnnotations(
              videoAData,
              videoBData
            );
            console.log('✅ [App] Video annotations initialized for dual mode');
          } catch (error) {
            console.error(
              '❌ [App] Error initializing video annotations for dual mode:',
              error
            );
          }
        }

        // Start session with dual video context
        await startSession();

        // Set up presence tracking for dual mode
        setupPresenceTracking(user.value.id, user.value.email);

        console.log('✅ [App] Dual video session started successfully');
      } catch (error) {
        console.error('❌ [App] Error starting dual video session:', error);
        // Continue without session - annotation functionality should still work
      }
      setupPresenceTracking(user.value.id, user.value.email);
    }

    // Close the modal
    closeLoadModal();

    console.log('✅ [App] Successfully loaded dual videos');
  } catch (error) {
    console.error('❌ [App] Error loading dual videos:', error);
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

  console.log(
    '🔄 [App] Loading comparison video:',
    comparisonVideo.title,
    'with videos:',
    videoA.title,
    'and',
    videoB.title
  );

  try {
    // Load the comparison video using the workflow
    await comparisonWorkflow.loadComparisonVideo(comparisonVideo);

    // Switch to dual mode
    playerMode.value = 'dual';

    // Initialize dual video player composable
    dualVideoPlayer = useDualVideoPlayer();

    // Get the correct URLs using the helper function
    const videoAUrl = getVideoUrl(videoA);
    const videoBUrl = getVideoUrl(videoB);

    // Set video URLs
    dualVideoPlayer.videoAUrl.value = videoAUrl;
    dualVideoPlayer.videoBUrl.value = videoBUrl;

    // Initialize annotation system for comparison mode
    console.log('🎯 [App] Initializing annotation system for comparison mode');
    const videoAData = {
      videoId: videoA.video_id,
      video_id: videoA.video_id,
      url: videoAUrl,
      fps: videoA.fps,
      duration: videoA.duration,
      totalFrames: videoA.total_frames,
      videoType: videoA.video_type,
      title: videoA.title,
    };

    const videoBData = {
      videoId: videoB.video_id,
      video_id: videoB.video_id,
      url: videoBUrl,
      fps: videoB.fps,
      duration: videoB.duration,
      totalFrames: videoB.total_frames,
      videoType: videoB.video_type,
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

    // Use the longer duration for the timeline
    const maxDuration = Math.max(videoA.duration, videoB.duration);
    duration.value = maxDuration;
    dualVideoPlayer.duration.value = maxDuration;

    // Use the higher FPS for synchronization
    const maxFps = Math.max(videoA.fps, videoB.fps);
    fps.value = maxFps;
    dualVideoPlayer.fps.value = maxFps;

    // Calculate total frames based on max duration and FPS
    totalFrames.value = Math.floor(maxDuration * maxFps);
    dualVideoPlayer.totalFrames.value = totalFrames.value;

    // Setup watchers to sync dual video player state with main App state
    watch(dualVideoPlayer.currentTime, (newTime) => {
      currentTime.value = newTime;
    });

    watch(dualVideoPlayer.currentFrame, (newFrame) => {
      currentFrame.value = newFrame;
    });

    watch(dualVideoPlayer.isPlaying, (newIsPlaying) => {
      isPlaying.value = newIsPlaying;
    });

    watch(dualVideoPlayer.duration, (newDuration) => {
      if (newDuration > duration.value) {
        duration.value = newDuration;
      }
    });

    watch(dualVideoPlayer.totalFrames, (newTotalFrames) => {
      totalFrames.value = newTotalFrames;
    });

    watch(dualVideoPlayer.fps, (newFps) => {
      fps.value = newFps;
    });

    // Initialize video session for comparison mode
    if (user.value) {
      const video = await initializeVideo({
        fps: maxFps,
        duration: maxDuration,
        totalFrames: totalFrames.value,
      });

      // Track the current video ID for sharing
      if (video && video.id) {
        currentVideoId.value = video.id;
      }

      // Initialize video annotations for both videos in dual mode
      if (dualVideoPlayer && dualVideoPlayer.initializeVideoAnnotations) {
        console.log(
          '🎯 [App] Initializing video annotations for comparison mode'
        );
        try {
          await dualVideoPlayer.initializeVideoAnnotations(
            videoAData,
            videoBData
          );
          console.log(
            '✅ [App] Video annotations initialized for comparison mode'
          );
        } catch (error) {
          console.error(
            '❌ [App] Error initializing video annotations for comparison mode:',
            error
          );
        }
      }

      await startSession();
      setupPresenceTracking(user.value.id, user.value.email);
    }

    // In comparison mode, annotations are handled by the comparison workflow
    // The useVideoAnnotations composable will automatically load comparison-specific annotations
    // when isComparisonContext is true, so we don't need to manually load them here
    console.log(
      '🔍 [App] Comparison context detected, annotations will be loaded by useVideoAnnotations'
    );

    // Explicitly load annotations to ensure they appear in the UI
    try {
      await loadAnnotations();
      console.log('✅ [App] Comparison annotations loaded into UI');
    } catch (error) {
      console.error('❌ [App] Error loading comparison annotations:', error);
    }

    // Close the modal
    closeLoadModal();

    console.log('✅ [App] Successfully loaded comparison video');
  } catch (error) {
    console.error('❌ [App] Error loading comparison video:', error);
  }
};

// Share modal handlers
const openShareModal = () => {
  if (playerMode.value === 'dual' && currentComparisonId.value) {
    isShareModalVisible.value = true;
  } else if (playerMode.value === 'single' && currentVideoId.value) {
    isShareModalVisible.value = true;
  } else {
    console.warn('⚠️ [App] No video or comparison loaded to share');
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
  console.log(
    '🎨 [App] Drawing created:',
    drawing,
    'Video context:',
    videoContext
  );

  // Handle dual video mode - call the dual video player's drawing handler
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    console.log('🎨 [App] Handling drawing in dual video mode (unified)');

    // Also notify the AnnotationPanel if the form is open so it can capture drawing data
    if (isAnnotationFormVisible.value && annotationPanelRef.value) {
      console.log('🎨 [App] Notifying AnnotationPanel of drawing creation');
      annotationPanelRef.value.onDrawingCreated(drawing, videoContext);
    }

    // Call the dual video player's handleDrawingCreated method which will check annotation context
    try {
      await dualVideoPlayer.handleDrawingCreated(
        drawing,
        videoContext,
        user.value?.id
      );
      console.log('✅ [App] Drawing handled by dual video player');
    } catch (error) {
      console.error(
        '❌ [App] Error handling drawing in dual video mode:',
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
    console.log(
      '🎨 [App] Forwarding drawing to annotation panel - no auto-save'
    );
    // Forward the drawing to the annotation panel
    if (annotationPanelRef.value.onDrawingCreated) {
      annotationPanelRef.value.onDrawingCreated(drawing);
    }
    // Return early to prevent duplicate annotation creation
    return;
  } else {
    // Convert drawing to annotation and save it to Supabase (only when drawing outside annotation form)
    console.log('🎨 [App] Auto-creating annotation for drawing outside form');
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
      console.log('🎨 [App] Drawing annotation saved to Supabase successfully');

      // Reload annotations to ensure the UI shows the latest data from Supabase
      console.log('🎨 [App] Reloading annotations to refresh UI');
      await loadAnnotations();
      console.log('🎨 [App] Annotations reloaded successfully');
    } catch (error) {
      console.error(
        '🎨 [App] Error saving drawing annotation to Supabase:',
        error
      );
    }
  }
};

const handleDrawingUpdated = (drawing) => {
  console.log('Drawing updated:', drawing);
  // Handle drawing updates if needed
};

const handleDrawingDeleted = (drawingId) => {
  console.log('Drawing deleted:', drawingId);
  // Handle drawing deletion if needed
};

// Handle dual video loaded events
const handleDualVideoLoaded = () => {
  console.log('✅ [App] Dual video loaded');
  // Additional logic if needed when dual videos are loaded
};

// Handle video context changes
const handleVideoContextChanged = (context) => {
  console.log('🔄 [App] Video context changed to:', context);
  activeVideoContext.value = context;
};

// Handle creating anonymous session for shared video commenting
const handleCreateAnonymousSession = async (displayName) => {
  try {
    console.log(
      '🔗 [App] Creating anonymous session for shared video commenting:',
      displayName
    );

    const session = await createAnonymousSession(displayName);

    // Refresh comment permissions after creating session
    await refreshCommentPermissions();

    console.log('✅ [App] Anonymous session created successfully');
    return session;
  } catch (error) {
    console.error('❌ [App] Error creating anonymous session:', error);
    throw error;
  }
};

// Check for shared video or comparison on load
const checkForSharedVideo = async () => {
  const shareData = ShareService.parseShareUrl();

  if (!shareData.type || !shareData.id) {
    return;
  }

  try {
    if (shareData.type === 'video') {
      console.log('🔗 [App] Loading shared video:', shareData.id);
      // Use the enhanced method that includes comment permissions
      const sharedData =
        await ShareService.getSharedVideoWithCommentPermissions(shareData.id);
      await handleSharedVideoSelected(sharedData);

      // Clear the share parameter from URL without reloading
      const url = new URL(window.location);
      url.searchParams.delete('share');
      window.history.replaceState({}, document.title, url.toString());

      console.log(
        '✅ [App] Successfully loaded shared video with comment permissions'
      );
    } else if (shareData.type === 'comparison') {
      console.log('🔗 [App] Loading shared comparison:', shareData.id);
      await initializeSharedComparison(shareData.id);

      // Clear the shareComparison parameter from URL without reloading
      const url = new URL(window.location);
      url.searchParams.delete('shareComparison');
      window.history.replaceState({}, document.title, url.toString());

      console.log(
        '✅ [App] Successfully loaded shared comparison with comment permissions'
      );
    }
  } catch (error) {
    console.error('❌ [App] Error loading shared content:', error);
    // Could show a toast notification here
  }
};

// Initialize shared comparison video
const initializeSharedComparison = async (comparisonId) => {
  try {
    isSharedComparison.value = true;

    // Get shared comparison data
    const sharedComparison =
      await ShareService.getSharedComparisonVideoWithCommentPermissions(
        comparisonId
      );

    // Set up dual mode
    playerMode.value = 'dual';
    currentComparisonId.value = comparisonId;

    // Prepare video objects with URLs for the comparison workflow
    const videoAData = sharedComparison.video_a
      ? {
          ...sharedComparison.video_a,
          url: getVideoUrl(sharedComparison.video_a),
        }
      : null;

    const videoBData = sharedComparison.video_b
      ? {
          ...sharedComparison.video_b,
          url: getVideoUrl(sharedComparison.video_b),
        }
      : null;

    console.log('🔄 [App] Setting up shared comparison videos:', {
      videoA: videoAData?.title,
      videoB: videoBData?.title,
      videoAUrl: videoAData?.url,
      videoBUrl: videoBData?.url,
    });

    console.log('🔍 [App] Video A Data Details:', {
      exists: !!videoAData,
      id: videoAData?.id,
      title: videoAData?.title,
      url: videoAData?.url,
      fullData: videoAData,
    });

    console.log('🔍 [App] Video B Data Details:', {
      exists: !!videoBData,
      id: videoBData?.id,
      title: videoBData?.title,
      url: videoBData?.url,
      fullData: videoBData,
    });

    // Select videos in the comparison workflow (this sets selectedVideoA and selectedVideoB)
    if (videoAData && videoAData.id !== 'placeholder') {
      console.log('🔄 [App] Selecting Video A:', videoAData);
      comparisonWorkflow.selectVideoA(videoAData);
      console.log('✅ [App] Video A selected in workflow');
    } else {
      console.warn('⚠️ [App] Video A not selected - invalid data:', videoAData);
    }

    if (videoBData && videoBData.id !== 'placeholder') {
      console.log('🔄 [App] Selecting Video B:', videoBData);
      comparisonWorkflow.selectVideoB(videoBData);
      console.log('✅ [App] Video B selected in workflow');
    } else {
      console.warn('⚠️ [App] Video B not selected - invalid data:', videoBData);
    }

    // Ensure dual video player is initialized
    if (!dualVideoPlayer) {
      console.log(
        '🔄 [App] Initializing dual video player for shared comparison...'
      );
      dualVideoPlayer = useDualVideoPlayer();
    }

    // Set up dual video player URLs and IDs
    if (videoAData?.url) {
      dualVideoPlayer.videoAUrl.value = videoAData.url;
      dualVideoPlayer.videoAId.value = videoAData.id;
      console.log('✅ [App] Video A URL and ID set in dual player');
    }
    if (videoBData?.url) {
      dualVideoPlayer.videoBUrl.value = videoBData.url;
      dualVideoPlayer.videoBId.value = videoBData.id;
      console.log('✅ [App] Video B URL and ID set in dual player');
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

    console.log('✅ [App] Dual video player states initialized');

    // Create a proper comparison object for the workflow
    const comparisonObject = {
      id: comparisonId,
      title: sharedComparison.title,
      description: sharedComparison.description,
      video_a_id: sharedComparison.video_a?.id,
      video_b_id: sharedComparison.video_b?.id,
      video_a: videoAData,
      video_b: videoBData,
      is_public: sharedComparison.is_public,
    };

    // Use the proper workflow method to load the comparison
    console.log('🔄 [App] Loading comparison via workflow...');
    await comparisonWorkflow.loadComparisonVideo(comparisonObject);

    // Load annotations
    if (
      sharedComparison.annotations &&
      sharedComparison.annotations.length > 0
    ) {
      annotations.value = sharedComparison.annotations;
    }

    console.log('✅ [App] Shared comparison initialized successfully');
  } catch (error) {
    console.error('❌ [App] Error initializing shared comparison:', error);
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
        <h1 class="text-xl font-medium text-gray-900">
          Accio Video Annotation
        </h1>

        <!-- Action Buttons (only for authenticated users) -->
        <div
          v-if="user && !isSharedVideo && !isSharedComparison"
          class="flex items-center space-x-4"
        >
          <!-- Load Previous Videos Button -->
          <button
            @click="openLoadModal"
            class="p-2 text-gray-600 hover:text-green-600 hover:bg-gray-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            title="Load video"
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
          <Timeline
            :current-time="
              playerMode === 'dual' && dualVideoPlayer
                ? dualVideoPlayer.currentTime.value
                : currentTime
            "
            :duration="
              playerMode === 'dual' && dualVideoPlayer
                ? dualVideoPlayer.duration.value
                : duration
            "
            :current-frame="
              playerMode === 'dual' && dualVideoPlayer
                ? dualVideoPlayer.currentFrame.value
                : currentFrame
            "
            :total-frames="
              playerMode === 'dual' && dualVideoPlayer
                ? dualVideoPlayer.totalFrames.value
                : totalFrames
            "
            :fps="
              playerMode === 'dual' && dualVideoPlayer
                ? dualVideoPlayer.fps.value
                : fps
            "
            :annotations="annotations"
            :selected-annotation="selectedAnnotation"
            :is-playing="
              playerMode === 'dual' && dualVideoPlayer
                ? dualVideoPlayer.isPlaying.value
                : isPlaying
            "
            :player-mode="playerMode"
            @seek-to-time="handleSeekToTime"
            @annotation-click="handleAnnotationClick"
            @play="handleTimelinePlay"
            @pause="handleTimelinePause"
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
          :is-dual-mode="playerMode === 'dual'"
          :drawing-canvas-a="dualVideoPlayer?.drawingCanvasA"
          :drawing-canvas-b="dualVideoPlayer?.drawingCanvasB"
          :comment-permissions="commentPermissions"
          :anonymous-session="anonymousSession"
          :is-shared-video="isSharedVideo || isSharedComparison"
          :comment-context="getCommentContext()"
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
