<script setup>
import { ref, onMounted, watch } from 'vue';
import VideoPlayer from './components/VideoPlayer.vue';
import Timeline from './components/Timeline.vue';
import AnnotationPanel from './components/AnnotationPanel.vue';
import Login from './components/Login.vue';
import LoadVideoModal from './components/LoadVideoModal.vue';
import ShareModal from './components/ShareModal.vue';
import NotificationToast from './components/NotificationToast.vue';
import DrawingVideoPlayer from './components/DrawingVideoPlayer.vue';
import DrawingDemo from './components/DrawingDemo.vue';
import DrawingCanvas from './components/DrawingCanvas.vue';
import { useAuth } from './composables/useAuth.ts';
import { useVideoAnnotations } from './composables/useVideoAnnotations.ts';
import { useRealtimeAnnotations } from './composables/useRealtimeAnnotations.ts';
import { useVideoSession } from './composables/useVideoSession.ts';
import { useDrawingCanvas } from './composables/useDrawingCanvas.ts';
import { VideoService } from './services/videoService.ts';
import { ShareService } from './services/shareService.ts';

// Auth
const { user, initAuth, signOut, isLoading } = useAuth();

// Video URL management
const videoUrl = ref('');
const videoId = ref('sample-video-1');
const urlInput = ref('');

// Video state
const currentTime = ref(0);
const duration = ref(0);
const isPlaying = ref(false);
const videoDimensions = ref({ width: 1920, height: 1080 });

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
  loadExistingAnnotations,
} = useVideoAnnotations(videoUrl, videoId);

// Selected annotation
const selectedAnnotation = ref(null);

// Video player reference
const videoPlayerRef = ref(null);

// Annotation panel reference
const annotationPanelRef = ref(null);

// Track if annotation form is currently visible
const isAnnotationFormVisible = ref(false);

// Load video modal state
const isLoadModalVisible = ref(false);

// Share modal state
const isShareModalVisible = ref(false);
const currentVideoId = ref(null);

// Demo mode state
const isDemoMode = ref(false);

// Real-time features
const { isConnected, activeUsers, setupPresenceTracking } =
  useRealtimeAnnotations(videoId, annotations);
const { startSession, endSession, isSessionActive } = useVideoSession(videoId);

// Drawing functionality
const drawingCanvas = useDrawingCanvas();

// Event handlers for video player events
const handleTimeUpdate = (data) => {
  currentTime.value = data.currentTime;
  // Also update duration if it's available and not set
  if (data.duration && data.duration > 0 && duration.value !== data.duration) {
    console.log('Updating duration from timeUpdate:', data.duration);
    duration.value = data.duration;
  }

  // Debug: Log values being passed to Timeline
  console.log('App.vue Timeline props:', {
    currentTime: currentTime.value,
    duration: duration.value,
    isPlaying: isPlaying.value,
  });
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
  if (videoPlayerRef.value?.videoElement) {
    const videoElement = videoPlayerRef.value.videoElement;
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

const handleVideoClick = () => {
  // Don't handle video clicks when drawing mode is active
  if (drawingCanvas.isDrawingMode.value) {
    return;
  }

  // Toggle behavior: if annotation form is visible, hide it and play video
  // If form is not visible, pause video and show form
  if (isAnnotationFormVisible.value) {
    // Hide annotation form and resume playing
    if (annotationPanelRef.value && annotationPanelRef.value.cancelForm) {
      annotationPanelRef.value.cancelForm();
    }
    isAnnotationFormVisible.value = false;
    // Resume playing the video
    if (videoPlayerRef.value && videoPlayerRef.value.play) {
      videoPlayerRef.value.play();
    }
  } else {
    // The video is already paused by the VideoPlayer component
    // Now we need to show the annotation form
    if (
      annotationPanelRef.value &&
      annotationPanelRef.value.startAddAnnotation
    ) {
      annotationPanelRef.value.startAddAnnotation();
      isAnnotationFormVisible.value = true;
    }
  }
};

// Timeline event handlers
const handleSeekToTime = (time) => {
  console.log('handleSeekToTime called with time:', time);
  if (videoPlayerRef.value) {
    console.log('Calling videoPlayerRef.seekTo with time:', time);
    videoPlayerRef.value.seekTo(time);
  } else {
    console.warn('videoPlayerRef.value is null, cannot seek');
  }
};

const handleAnnotationClick = (annotation) => {
  selectedAnnotation.value = annotation;
  // Seek to annotation timestamp
  handleSeekToTime(annotation.timestamp);
};

// Timeline play/pause handlers
const handleTimelinePlay = () => {
  if (videoPlayerRef.value && videoPlayerRef.value.play) {
    videoPlayerRef.value.play();
  }
};

const handleTimelinePause = () => {
  if (videoPlayerRef.value && videoPlayerRef.value.pause) {
    videoPlayerRef.value.pause();
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
        if (videoPlayerRef.value && duration.value > 0) {
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
  const { video, annotations: loadedAnnotations } = data;

  console.log('🎬 [App] Loading selected video:', video.title);
  console.log('🎬 [App] With annotations:', loadedAnnotations.length);

  try {
    // Update video state
    videoUrl.value = video.url;
    urlInput.value = video.url;
    videoId.value = video.video_id;

    // Update video metadata
    fps.value = video.fps;
    duration.value = video.duration;
    totalFrames.value = video.total_frames;

    // Initialize video with loaded data
    if (user.value) {
      const videoRecord = await initializeVideo({
        fps: video.fps,
        duration: video.duration,
        totalFrames: video.total_frames,
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

// Demo mode handlers
const toggleDemoMode = () => {
  isDemoMode.value = !isDemoMode.value;
};

// Drawing event handlers
const handleDrawingCreated = (drawing) => {
  console.log('Drawing created:', drawing);
  drawingCanvas.addDrawing(drawing);

  // If this drawing was created from the annotation panel, don't auto-create an annotation
  // The annotation panel will handle creating the annotation with both text and drawing data
  if (!isAnnotationFormVisible.value) {
    // Convert drawing to annotation and save it (only when drawing outside annotation form)
    const annotation = drawingCanvas.convertDrawingToAnnotation(
      drawing,
      videoId.value,
      user.value?.id || 'anonymous',
      'Drawing Annotation',
      `Drawing on frame ${drawing.frame}`
    );

    // Add to annotations
    addAnnotation(annotation);
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

// Check for shared video on load
const checkForSharedVideo = async () => {
  const sharedVideoId = ShareService.parseShareUrl();
  if (sharedVideoId) {
    console.log('🔗 [App] Loading shared video:', sharedVideoId);
    try {
      const sharedData = await ShareService.getSharedVideo(sharedVideoId);
      await handleVideoSelected(sharedData);

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

  <!-- Main app when user is authenticated -->
  <div v-else-if="user" class="min-h-screen bg-white flex flex-col">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-medium text-gray-900">
          Accio Video Annotation
        </h1>

        <!-- URL Input Section -->
        <div class="flex items-center space-x-3 max-w-2xl">
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

            <!-- Drawing Demo Toggle Button -->
            <button
              @click="toggleDemoMode"
              class="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              :title="isDemoMode ? 'Exit Drawing Demo' : 'Try Drawing Demo'"
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
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
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

        <!-- User Info and Sign Out -->
        <div class="flex items-center space-x-4">
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
      <!-- Drawing Demo Mode -->
      <div v-if="isDemoMode" class="flex-1">
        <DrawingDemo />
      </div>

      <!-- Normal App Mode -->
      <template v-else>
        <!-- Video Section -->
        <section class="flex-1 flex flex-col bg-black min-w-0 overflow-hidden">
          <div class="flex-1 flex items-center justify-center p-6">
            <div class="relative">
              <VideoPlayer
                ref="videoPlayerRef"
                :video-url="videoUrl"
                :video-id="videoId"
                :controls="true"
                :autoplay="false"
                poster=""
                @time-update="handleTimeUpdate"
                @frame-update="handleFrameUpdate"
                @fps-detected="handleFPSDetected"
                @play="handlePlay"
                @pause="handlePause"
                @duration-change="handleDurationChange"
                @error="handleError"
                @loaded="handleLoaded"
                @video-click="handleVideoClick"
              />

              <!-- Drawing Canvas Overlay -->
              <DrawingCanvas
                v-if="videoUrl && duration > 0"
                ref="drawingCanvasRef"
                :video-width="videoDimensions.width"
                :video-height="videoDimensions.height"
                :current-frame="currentFrame"
                :is-drawing-mode="drawingCanvas.isDrawingMode.value"
                :selected-tool="drawingCanvas.currentTool.value.type"
                :stroke-width="drawingCanvas.currentTool.value.strokeWidth"
                :severity="drawingCanvas.currentTool.value.severity"
                :existing-drawings="drawingCanvas.currentFrameDrawings.value"
                @drawing-created="handleDrawingCreated"
                @drawing-updated="handleDrawingUpdated"
                @drawing-deleted="handleDrawingDeleted"
              />
            </div>
          </div>

          <!-- Timeline -->
          <div class="bg-gray-900 p-4 border-t border-gray-800">
            <Timeline
              :current-time="currentTime"
              :duration="duration"
              :current-frame="currentFrame"
              :total-frames="totalFrames"
              :fps="fps"
              :annotations="annotations"
              :selected-annotation="selectedAnnotation"
              :is-playing="isPlaying"
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
      </template>
    </main>

    <!-- Load Video Modal -->
    <LoadVideoModal
      :is-visible="isLoadModalVisible"
      @close="closeLoadModal"
      @video-selected="handleVideoSelected"
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
