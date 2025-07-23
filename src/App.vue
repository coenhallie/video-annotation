<script setup>
import { ref, onMounted, watch } from 'vue';
import Timeline from './components/Timeline.vue';
import AnnotationPanel from './components/AnnotationPanel.vue';
import Login from './components/Login.vue';
import LoadVideoModal from './components/LoadVideoModal.vue';
import ShareModal from './components/ShareModal.vue';
import NotificationToast from './components/NotificationToast.vue';
import DrawingVideoPlayer from './components/DrawingVideoPlayer.vue';
import DualVideoPlayer from './components/DualVideoPlayer.vue';
import { useAuth } from './composables/useAuth.ts';
import { useVideoAnnotations } from './composables/useVideoAnnotations.ts';
import { useRealtimeAnnotations } from './composables/useRealtimeAnnotations.ts';
import { useVideoSession } from './composables/useVideoSession.ts';
import { useDrawingCanvas } from './composables/useDrawingCanvas.ts';
import { useDualVideoPlayer } from './composables/useDualVideoPlayer.js';
import { VideoService } from './services/videoService.ts';
import { ShareService } from './services/shareService.ts';

// Auth
const { user, initAuth, signOut, isLoading } = useAuth();

// Player mode management
const playerMode = ref('single'); // 'single' or 'dual'

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
} = useVideoAnnotations(videoUrl, videoId);

// Selected annotation
const selectedAnnotation = ref(null);

// Video player reference
const videoPlayerRef = ref(null);
const drawingVideoPlayerRef = ref(null);

// Annotation panel reference
const annotationPanelRef = ref(null);

// Track if annotation form is currently visible
const isAnnotationFormVisible = ref(false);

// Load video modal state
const isLoadModalVisible = ref(false);

// Share modal state
const isShareModalVisible = ref(false);
const currentVideoId = ref(null);

// Shared video state
const isSharedVideo = ref(false);
const sharedVideoData = ref(null);

// Real-time features
const { isConnected, activeUsers, setupPresenceTracking } =
  useRealtimeAnnotations(videoId, annotations);
const { startSession, endSession, isSessionActive } = useVideoSession(videoId);

// Drawing functionality
const drawingCanvas = useDrawingCanvas();

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
  if (drawingVideoPlayerRef.value?.videoPlayerRef?.value?.videoElement) {
    const videoElement =
      drawingVideoPlayerRef.value.videoPlayerRef.value.videoElement;
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
      'DEBUG - drawingVideoPlayerRef.value:',
      drawingVideoPlayerRef.value
    );
    console.log(
      'DEBUG - drawingVideoPlayerRef.value?.videoPlayerRef:',
      drawingVideoPlayerRef.value?.videoPlayerRef
    );
    console.log(
      'DEBUG - drawingVideoPlayerRef.value?.videoPlayerRef?.value:',
      drawingVideoPlayerRef.value?.videoPlayerRef?.value
    );

    if (drawingVideoPlayerRef.value?.videoPlayerRef) {
      console.log(
        'DEBUG - videoPlayerRef type:',
        typeof drawingVideoPlayerRef.value.videoPlayerRef
      );
      console.log(
        'DEBUG - videoPlayerRef.seekTo:',
        drawingVideoPlayerRef.value.videoPlayerRef.seekTo
      );

      if (drawingVideoPlayerRef.value.videoPlayerRef.seekTo) {
        console.log(
          'Calling drawingVideoPlayerRef.videoPlayerRef.seekTo with time:',
          time
        );
        drawingVideoPlayerRef.value.videoPlayerRef.seekTo(time);
      } else {
        console.warn('seekTo method not found on videoPlayerRef');
      }
    } else {
      console.warn(
        'drawingVideoPlayerRef.value.videoPlayerRef is null, cannot seek'
      );
    }
  }
};

const handleAnnotationClick = (annotation) => {
  console.log('🎨 [App] handleAnnotationClick called with:', annotation);

  selectedAnnotation.value = annotation;

  // Seek to annotation timestamp.
  // The drawing canvas will automatically update based on the new currentFrame.
  handleSeekToTime(annotation.timestamp);
};

// Timeline play/pause handlers
const handleTimelinePlay = () => {
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    console.log('Playing in dual mode');
    dualVideoPlayer.syncPlay();
  } else {
    if (
      drawingVideoPlayerRef.value?.videoPlayerRef?.value &&
      drawingVideoPlayerRef.value.videoPlayerRef.play
    ) {
      drawingVideoPlayerRef.value.videoPlayerRef.value.play();
    }
  }
};

const handleTimelinePause = () => {
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    console.log('Pausing in dual mode');
    dualVideoPlayer.syncPause();
  } else {
    if (
      drawingVideoPlayerRef.value?.videoPlayerRef?.value &&
      drawingVideoPlayerRef.value.videoPlayerRef.pause
    ) {
      drawingVideoPlayerRef.value.videoPlayerRef.value.pause();
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
        if (
          drawingVideoPlayerRef.value?.videoPlayerRef?.value &&
          duration.value > 0
        ) {
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

// Handle annotation form visibility events
const handleFormShow = () => {
  isAnnotationFormVisible.value = true;
};

const handleFormHide = () => {
  isAnnotationFormVisible.value = false;
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
  const { video, annotations: loadedAnnotations } = data;

  console.log('🔗 [App] Loading shared video:', video.title);
  console.log('🔗 [App] With annotations:', loadedAnnotations.length);

  try {
    // Set shared video state
    isSharedVideo.value = true;
    sharedVideoData.value = data;

    // Update video state
    videoUrl.value = video.url;
    videoId.value = video.video_id;

    // Update video metadata
    fps.value = video.fps;
    duration.value = video.duration;
    totalFrames.value = video.total_frames;

    // Load annotations directly without authentication
    loadExistingAnnotations(loadedAnnotations);

    console.log('✅ [App] Successfully loaded shared video');
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
      const video = await initializeVideo({
        fps: maxFps,
        duration: maxDuration,
        totalFrames: totalFrames.value,
      });

      // Track the current video ID for sharing
      if (video && video.id) {
        currentVideoId.value = video.id;
      }

      await startSession();
      setupPresenceTracking(user.value.id, user.value.email);
    }

    // Close the modal
    closeLoadModal();

    console.log('✅ [App] Successfully loaded dual videos');
  } catch (error) {
    console.error('❌ [App] Error loading dual videos:', error);
  }
};

// Share modal handlers
const openShareModal = () => {
  if (currentVideoId.value) {
    isShareModalVisible.value = true;
  } else {
    console.warn('⚠️ [App] No video loaded to share');
  }
};

const closeShareModal = () => {
  isShareModalVisible.value = false;
};

// Drawing event handlers
const handleDrawingCreated = async (drawing) => {
  console.log('🎨 [App] Drawing created:', drawing);

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

// Video swap handler for dual mode
const handleSwapVideos = () => {
  if (playerMode.value === 'dual' && dualVideoPlayer) {
    console.log('🔄 [App] Swapping videos in dual mode');
    dualVideoPlayer.swapVideos();
  }
};

// Handle dual video loaded events
const handleDualVideoLoaded = () => {
  console.log('✅ [App] Dual video loaded');
  // Additional logic if needed when dual videos are loaded
};

// Check for shared video on load
const checkForSharedVideo = async () => {
  const sharedVideoId = ShareService.parseShareUrl();
  if (sharedVideoId) {
    console.log('🔗 [App] Loading shared video:', sharedVideoId);
    try {
      const sharedData = await ShareService.getSharedVideo(sharedVideoId);
      await handleSharedVideoSelected(sharedData);

      // Clear the share parameter from URL without reloading
      const url = new URL(window.location);
      url.searchParams.delete('share');
      window.history.replaceState({}, document.title, url.toString());

      console.log('✅ [App] Successfully loaded shared video');
    } catch (error) {
      console.error('❌ [App] Error loading shared video:', error);
      // Could show a toast notification here
    }
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

  <!-- Main app when user is authenticated OR when viewing shared video -->
  <div
    v-else-if="user || isSharedVideo"
    class="min-h-screen bg-white flex flex-col"
  >
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-medium text-gray-900">
          Accio Video Annotation
        </h1>

        <!-- URL Input Section (only for authenticated users) -->
        <div
          v-if="user && !isSharedVideo"
          class="flex items-center space-x-3 max-w-2xl"
        >
          <div class="flex items-center space-x-4">
            <!-- Load Previous Videos Button -->
            <button
              @click="openLoadModal"
              class="p-2 text-gray-600 hover:text-green-600 hover:bg-gray-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              title="Load previous video"
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
              :disabled="!currentVideoId"
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

            <!-- Swap Videos Button (only visible in dual mode) -->
            <button
              v-if="playerMode === 'dual'"
              @click="handleSwapVideos"
              class="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              title="Swap videos"
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
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                ></path>
              </svg>
            </button>

            <div class="relative flex-1">
              <input
                v-model="urlInput"
                type="url"
                placeholder="Enter video URL..."
                class="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm min-w-96"
                @keypress="handleUrlKeyPress"
              />
              <button
                @click="loadVideoFromUrl"
                class="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-blue-600 transition-colors"
                title="Load video"
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
                    d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m6-10V4a2 2 0 00-2-2H5a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2V4z"
                  ></path>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Shared Video Info -->
        <div
          v-if="isSharedVideo"
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
          <span class="font-medium">Shared Video (View Only)</span>
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
            <!-- Single Video Player -->
            <DrawingVideoPlayer
              v-if="playerMode === 'single'"
              ref="drawingVideoPlayerRef"
              :video-url="videoUrl"
              :video-id="videoId"
              :show-debug-panel="false"
              :drawing-canvas="drawingCanvas"
              @time-update="handleTimeUpdate"
              @frame-update="handleFrameUpdate"
              @fps-detected="handleFPSDetected"
              @loaded="handleLoaded"
              @drawing-created="handleDrawingCreated"
              @drawing-updated="handleDrawingUpdated"
              @drawing-deleted="handleDrawingDeleted"
            />

            <!-- Dual Video Player -->
            <DualVideoPlayer
              v-else-if="playerMode === 'dual'"
              ref="dualVideoPlayerRef"
              :video-a-url="dualVideoPlayer?.videoAUrl.value"
              :video-a-id="dualVideoPlayer?.videoAUrl.value ? 'video-a' : ''"
              :video-b-url="dualVideoPlayer?.videoBUrl.value"
              :video-b-id="dualVideoPlayer?.videoBUrl.value ? 'video-b' : ''"
              :drawing-canvas-a="drawingCanvas"
              :drawing-canvas-b="drawingCanvas"
              :video-a-state="dualVideoPlayer?.videoAState"
              :video-b-state="dualVideoPlayer?.videoBState"
              :dual-video-player="dualVideoPlayer"
              @time-update="handleTimeUpdate"
              @frame-update="handleFrameUpdate"
              @fps-detected="handleFPSDetected"
              @video-a-loaded="handleDualVideoLoaded"
              @video-b-loaded="handleDualVideoLoaded"
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
          :read-only="isSharedVideo"
          @add-annotation="addAnnotation"
          @update-annotation="updateAnnotation"
          @delete-annotation="deleteAnnotation"
          @select-annotation="handleAnnotationClick"
          @form-show="handleFormShow"
          @form-hide="handleFormHide"
          @pause="handleTimelinePause"
          @drawing-created="handleDrawingCreated"
        />
      </aside>
    </main>

    <!-- Load Video Modal -->
    <LoadVideoModal
      :is-visible="isLoadModalVisible"
      @close="closeLoadModal"
      @video-selected="handleVideoSelected"
      @dual-videos-selected="handleDualVideosSelected"
    />

    <!-- Share Video Modal -->
    <ShareModal
      :is-visible="isShareModalVisible"
      :video-id="currentVideoId"
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
