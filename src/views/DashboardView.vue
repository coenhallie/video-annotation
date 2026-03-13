<script setup lang="ts">
import {
  ref,
  onMounted,
  watch,
  computed,
  onErrorCaptured,
  onBeforeUnmount,
  defineAsyncComponent,
  type ComponentPublicInstance,
  type Ref,
} from 'vue';
import DualTimeline from '@/components/DualTimeline.vue';
import VideoTimeline from '@/components/VideoTimeline.vue';
import AnnotationPanel from '@/components/AnnotationPanel.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';

import SharedVideoAuthPrompt from '@/components/SharedVideoAuthPrompt.vue';
import VideoUpload from '@/components/VideoUpload.vue';
import UnifiedVideoPlayer from '@/components/UnifiedVideoPlayer.vue';
import { ShareService } from '@/services/shareService';
import { VideoService } from '@/services/videoService';

// Lazy loaded components
const ProjectManagementModal = defineAsyncComponent(() => import('@/components/ProjectManagementModal.vue'));
const CreateComparisonModal = defineAsyncComponent(() => import('@/components/CreateComparisonModal.vue'));
const ShareModal = defineAsyncComponent(() => import('@/components/ShareModal.vue'));
const SharedLinksManagement = defineAsyncComponent(() => import('@/components/SharedLinksManagement.vue'));
const ChangelogModal = defineAsyncComponent(() => import('@/components/ChangelogModal.vue'));
import { useAuth } from '@/composables/useAuth';
import { useVideoAnnotations } from '@/composables/useVideoAnnotations';
import { useRealtimeAnnotations } from '@/composables/useRealtimeAnnotations';
import { useVideoSession } from '@/composables/useVideoSession';
import { useDrawingCanvas } from '@/composables/useDrawingCanvas';
import { useComparisonVideoWorkflow } from '@/composables/useComparisonVideoWorkflow';
import { useDualVideoPlayer } from '@/composables/useDualVideoPlayer';
import { useSessionCleanup } from '@/composables/useSessionCleanup';
import { useNotifications } from '@/composables/useNotifications';
import { supabase } from '@/composables/useSupabase';
import type { Video, Annotation } from '@/types/database';
import { useVideoStore } from '@/stores/video';
import { useLayoutStore } from '@/stores/layout';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';

const route = useRoute();

const videoStore = useVideoStore();
const layoutStore = useLayoutStore();
const {
  isProjectModalOpen,
  isComparisonModalOpen,
  isShareModalOpen,
  isSharedLinksModalOpen,
  isVideoUploadModalOpen,
  isAnnotationFormVisible,

} = storeToRefs(layoutStore);



// Use videoStore for video state
const {
  url: videoUrl,
  id: videoId,
  duration,
  isPlaying,
  currentTime,
  currentFrame,
  totalFrames,
  fps
} = storeToRefs(videoStore);


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

const isAppLoading = ref(true); // Separate loading state for the app

// Computed property to determine overall loading state
const isLoading = computed(() => {
  return isAppLoading.value || authLoading.value;
});

// Check for password reset token in URL


// Player mode management
const playerMode = ref<'single' | 'dual'>('single');

// Active video context for dual mode
 // 'A' or 'B'

// Unified video state management
// Video state managed by Pinia
// Video state managed by Pinia
// Removed local videoState reactive object

const currentVideoType = ref<'url' | 'upload'>('url');
const currentVideoObject = ref<any>(null);


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
const annotationPanelRef = ref<InstanceType<typeof AnnotationPanel> | null>(null);



const videoLoaded = ref(false);
const currentVideoId = ref<string | null>(null);

const currentComparisonId = ref<string | null>(null);
const isSharedComparison = ref(false);
const isSharedVideo = ref(false);
const isAwsVideo = ref(false);

const sharedVideoData = ref<any>(null);

// Shared video authentication state
const showAuthPrompt = ref(false);
const userDeclinedAuth = ref(false);
const pendingSharedContent = ref<{type: 'video' | 'comparison', id: string, data: any} | null>(null);

const isChangelogModalOpen = ref(false);

// Real-time features
const { setupPresenceTracking } =
  useRealtimeAnnotations(videoId, annotations);
// Use either currentVideoId or currentComparisonId depending on mode
const activeContentId = computed(() => {
  return currentComparisonId.value || currentVideoId.value;
});

const {
  startSession,
  endSession,
  commentPermissions,
  anonymousSession,
  createAnonymousSession,
  getCommentContext,
  canComment,
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

    // Refresh presigned URLs for AWS videos (they expire after ~15 min)
    if (VideoService.isAwsVideo(videoA as any)) {
      const freshUrl = await VideoService.refreshAwsVideoUrl(videoA as Video);
      if (freshUrl) videoA = { ...videoA, url: freshUrl };
    }
    if (VideoService.isAwsVideo(videoB as any)) {
      const freshUrl = await VideoService.refreshAwsVideoUrl(videoB as Video);
      if (freshUrl) videoB = { ...videoB, url: freshUrl };
    }

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

const { cleanupAllSessionData, cleanupForProjectSwitch } = useSessionCleanup();

// Initialize notifications
const { error: notifyError } = useNotifications();





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



// Event handlers for video player events
const handleTimeUpdate = (data: { currentTime: number; duration: number }) => {
  // Use store action to update time - this ensures frame is calculated based on FPS
  videoStore.updateTime(data.currentTime);
  
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
      videoStore.updateDuration(data.duration);
    }

    if (data.dimensions) {
      videoStore.setDimensions(data.dimensions.width, data.dimensions.height);
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

const handleVideoError = async (_error: any) => {
  // If this is an AWS video, the presigned URL may have expired - try refreshing
  if (currentVideoObject.value && VideoService.isAwsVideo(currentVideoObject.value)) {
    console.log('🔄 [App] AWS video error, attempting URL refresh...');
    const freshUrl = await VideoService.refreshAwsVideoUrl(currentVideoObject.value);
    if (freshUrl) {
      currentVideoObject.value = { ...currentVideoObject.value, url: freshUrl };
      videoStore.setVideo(freshUrl, currentVideoObject.value.id);
    }
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



const openLoadModal = () => {
  layoutStore.openProjectModal();
};

const closeLoadModal = () => {
  layoutStore.closeProjectModal();
};

const openLoadModalWithTab = (tab: string) => {
  // Close the project management modal first
  layoutStore.closeProjectModal();
  // If the tab is 'create', open the comparison modal
  if (tab === 'create') {
    layoutStore.openComparisonModal();
  }
};

const closeComparisonModal = () => {
  layoutStore.closeComparisonModal();
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
  layoutStore.openVideoUploadModal();
};

const closeVideoUpload = () => {
  layoutStore.closeVideoUploadModal();
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
  isProjectModalOpen.value = true;
};

const handleVideoUploadError = (error: any) => {
  console.error('❌ Video upload failed:', error);
  // Error is already handled by the VideoUpload component
};



const loadVideo = (video: any, type = 'upload') => {
  videoLoaded.value = false;
  try {
    playerMode.value = 'single';
    // videoState.url = video.url || ''; // Managed by store setter in loadVideo logic if needed
    videoStore.setVideo(getVideoUrl(video), video.id || '');
    
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
        drawingCanvas,
        drawingCanvasA,
        drawingCanvasB,
        dualVideoPlayer,
        comparisonWorkflow,
        videoSession: { endSession },
        annotations,
        selectedAnnotation,
        // videoState can be cleanup using store reset if needed
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
      let video = project.video;

      // For AWS videos, refresh the presigned URL before loading
      if (VideoService.isAwsVideo(video)) {
        const freshUrl = await VideoService.refreshAwsVideoUrl(video);
        if (freshUrl) {
          video = { ...video, url: freshUrl };
        }
        isAwsVideo.value = true;
      }

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





const openSharedLinksManagement = () => {
  isSharedLinksModalOpen.value = true;
};

const closeSharedLinksManagement = () => {
  isSharedLinksModalOpen.value = false;
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

const handleKeydown = (e: KeyboardEvent) => {
  // Ignore if user is typing in an input or textarea
  const target = e.target as HTMLElement;
  if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) {
    return;
  }

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    unifiedVideoPlayerRef.value?.stepFrame(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    unifiedVideoPlayerRef.value?.stepFrame(-1);
  } else if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();

    let isCurrentlyPlaying = false;
    if (playerMode.value === 'single') {
      isCurrentlyPlaying = isPlaying.value;
    } else if (playerMode.value === 'dual' && dualVideoPlayer) {
      isCurrentlyPlaying = dualVideoPlayer.videoAIsPlaying?.value || dualVideoPlayer.videoBIsPlaying?.value || false;
    }

    if (isCurrentlyPlaying) {
      unifiedVideoPlayerRef.value?.pause();
    } else {
      unifiedVideoPlayerRef.value?.play();
    }
  }
};

const loadOutputVideo = async (outputVideoId: string) => {
  if (!user.value) {
    notifyError('Authentication required', 'Please log in to view this video.');
    return;
  }

  try {
    const video = await VideoService.findOrCreateOutputVideo(outputVideoId, user.value.id);

    isAwsVideo.value = true;
    currentVideoId.value = video.id;

    loadVideo(video, 'url');

    // Start session for annotations
    await startSession();
  } catch (err: any) {
    notifyError(
      'Failed to load video',
      err?.message || 'Could not fetch the video from AWS. Check the project ID.',
      10000
    );
  }
};

let authSubscription: { unsubscribe: () => void } | null = null;

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  try {
    isAppLoading.value = true;

    // Initialize auth
    await initAuth();



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
    } else {
      // Check for AWS project link (from query param or sessionStorage after auth redirect)
      const params = new URLSearchParams(window.location.search);
      const outputVideoId = params.get('outputVideo') || sessionStorage.getItem('pendingOutputVideo');

      if (outputVideoId && user.value) {
        sessionStorage.removeItem('pendingOutputVideo');
        await loadOutputVideo(outputVideoId);
      } else if (!user.value) {
        // If no share link and not logged in, show the login page
      } else if (!videoLoaded.value) {
        layoutStore.openProjectModal();
      }
    }
  } finally {
    // Always set app loading to false at the end
    isAppLoading.value = false;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
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
      // Check for pending AWS project after login
      else if (!oldUser && sessionStorage.getItem('pendingOutputVideo')) {
        const outputVideoId = sessionStorage.getItem('pendingOutputVideo');
        sessionStorage.removeItem('pendingOutputVideo');
        if (outputVideoId) {
          loadOutputVideo(outputVideoId);
        }
      }
      // Auto-open ProjectManagementModal after successful login
      // Only open if this is a new login (oldUser was null/undefined) and no shared content
      // Check for share URL parameters to avoid opening modal when accessing shared links
      else if (!oldUser && !isSharedVideo.value && !isSharedComparison.value && !isAwsVideo.value && !ShareService.parseShareUrl().id) {
        // Small delay to ensure the UI is fully rendered
        setTimeout(() => {
          isProjectModalOpen.value = true;
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
    class="min-h-screen bg-red-50 dark:bg-red-900 flex items-center justify-center p-4"
  >
    <div class="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
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
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Something went wrong
        </h2>
      </div>

      <p class="text-gray-600 dark:text-gray-300 mb-4">
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
    class="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center"
  >
    <div class="text-center">
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"
      />
      <p class="text-gray-600 dark:text-gray-400">Loading...</p>
    </div>
  </div>



  <!-- Main app when user is authenticated OR when viewing shared video/comparison OR showing auth prompt -->
  <div
    v-else
    class="min-h-screen bg-white dark:bg-gray-900 flex flex-col"
  >
    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <h1 class="text-xl font-medium text-gray-900 dark:text-white">Perspecto</h1>
          <span
            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border border-orange-200 dark:border-orange-800 cursor-pointer hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors"
            @click="isChangelogModalOpen = true"
          >
            BETA v3.8
          </span>
        </div>

        <!-- Action Buttons (only for authenticated users) -->
        <div
          v-if="user && !isSharedVideo && !isSharedComparison"
          class="flex items-center space-x-4"
        >
          <!-- Load Previous Videos Button -->
          <button
            class="p-2 text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            title="Upload video"
            @click="layoutStore.openProjectModal()"
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
            class="p-2 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            title="Manage shared links"
            @click="isSharedLinksModalOpen = true"
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
            class="p-2 text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Share current video"
            @click="layoutStore.openShareModal()"
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
          class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300"
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
          <div class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
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
          <ThemeToggle />
          <button
            class="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
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
                  comparisonWorkflow.currentComparison.value?.id || undefined
                "
                :comparison-video-id="
                  comparisonWorkflow.currentComparison.value?.id || undefined
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
                @error="handleVideoError"
              />
            </div>
          </div>
        </div>

        <!-- Timeline -->
        <div class="bg-gray-900 dark:bg-black p-4 border-t border-gray-800 dark:border-gray-800">
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
        class="w-96 min-w-96 max-w-96 flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
      >


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
            class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
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
      :is-visible="isProjectModalOpen"
      @close="layoutStore.closeProjectModal()"
      @project-selected="handleProjectSelected"
      @upload-video="layoutStore.openVideoUploadModal()"
      @open-load-modal="openLoadModalWithTab('create')"
    />

    <!-- Create Comparison Modal -->
    <CreateComparisonModal
      :is-visible="isComparisonModalOpen"
      @close="layoutStore.closeComparisonModal()"
      @comparison-created="handleComparisonCreated"
      @upload-video="layoutStore.openVideoUploadModal()"
    />

    <!-- Video Upload Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isVideoUploadModalOpen"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <!-- Backdrop -->
          <div
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            @click="layoutStore.closeVideoUploadModal()"
          />

          <!-- Modal Content -->
          <div
            class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto p-6"
            @click.stop
          >
            <!-- Header -->
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Upload Video</h2>
              <button
                class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                @click="layoutStore.closeVideoUploadModal()"
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
      :is-visible="isShareModalOpen"
      :video-id="shareModalProps.videoId || ''"
      :comparison-id="shareModalProps.comparisonId"
      :share-type="shareModalProps.shareType"
      @close="layoutStore.closeShareModal()"
    />

    <!-- Shared Links Management Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isSharedLinksModalOpen"
          class="fixed inset-0 z-50 flex items-center justify-center"
        >
          <!-- Backdrop -->
          <div
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            @click="closeSharedLinksManagement"
          />

          <!-- Modal Content -->
          <div
            class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-7xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
            @click.stop
          >
            <!-- Header -->
            <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 class="text-2xl font-semibold text-gray-900 dark:text-white">Manage Shared Links</h2>
              <button
                class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                @click="isSharedLinksModalOpen = false"
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


    <!-- Shared Video Authentication Prompt -->
    <SharedVideoAuthPrompt
      :is-visible="showAuthPrompt"
      :content-type="pendingSharedContent?.type === 'comparison' ? 'comparison video' : 'video'"
      @sign-in="handleAuthSignIn"
      @continue-read-only="handleAuthContinueReadOnly"
    />

    <!-- Changelog Modal -->
    <ChangelogModal
      :is-visible="isChangelogModalOpen"
      @close="isChangelogModalOpen = false"
    />
  </div>


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
