<script setup lang="ts">
import {
  ref,
  onMounted,
  watch,
  computed,
  onErrorCaptured,
  onBeforeUnmount,
  nextTick,
  type ComponentPublicInstance,
  type Ref,
} from 'vue';
import DualTimeline from '@/components/DualTimeline.vue';
import VideoTimeline from '@/components/VideoTimeline.vue';
import AnnotationPanel from '@/components/AnnotationPanel.vue';
import EditorHeader from '@/components/EditorHeader.vue';

import UnifiedVideoPlayer from '@/components/UnifiedVideoPlayer.vue';
import DashboardModals from '@/components/DashboardModals.vue';
import AnnotationBloom from '@/components/AnnotationBloom.vue';
import { useLabelCatalog } from '@/composables/useLabelCatalog';
import { buildAnnotationPayload } from '@/utils/annotationPayload';
import { ShareService } from '@/services/shareService';
import { VideoService } from '@/services/videoService';
import { ComparisonVideoService } from '@/services/comparisonVideoService';
import { useAuth } from '@/composables/useAuth';
import { useVideoAnnotations } from '@/composables/useVideoAnnotations';
import { useRealtimeAnnotations } from '@/composables/useRealtimeAnnotations';
import { useVideoSession } from '@/composables/useVideoSession';
import { useDrawingCanvas } from '@/composables/useDrawingCanvas';
import { useDrawingCoordinator } from '@/composables/useDrawingCoordinator';
import { useComparisonVideoWorkflow } from '@/composables/useComparisonVideoWorkflow';
import { useDualVideoPlayer } from '@/composables/useDualVideoPlayer';
import { useSessionCleanup } from '@/composables/useSessionCleanup';
import { useNotifications } from '@/composables/useNotifications';
import { useDashboardKeyboard } from '@/composables/useDashboardKeyboard';
import { useSharedContent } from '@/composables/useSharedContent';
import { useVideoEventHandlers } from '@/composables/useVideoEventHandlers';
import { useWatchProgress } from '@/composables/useWatchProgress';
import { supabase } from '@/composables/useSupabase';
import type { Video, Annotation, ComparisonVideo } from '@/types/database';
import type {
  ProjectSelection,
  ComparisonCreatedEvent,
  AnnotationFormData,
} from '@/types/component-interfaces';
import type { Label } from '@/types/labels';
import { useVideoStore } from '@/stores/video';
import { useLayoutStore } from '@/stores/layout';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const videoStore = useVideoStore();
const layoutStore = useLayoutStore();
const {
  isComparisonModalOpen,
  isShareModalOpen,
  isSharedLinksModalOpen,
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
  fps,
  playerMode,
  currentVideoId,
  currentComparisonId,
  currentVideoType,
  currentVideoObject,
  videoLoaded,
  isAwsVideo,
} = storeToRefs(videoStore);


// Helper function to get the correct video URL
const getVideoUrl = (video: Partial<Video> & { url?: string; videoType?: string; filePath?: string }) => {
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

onErrorCaptured((error: Error, instance: ComponentPublicInstance | null, info: string) => {
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


// Active video context for dual mode
 // 'A' or 'B'

// Unified video state management
// Video state managed by Pinia
// Removed local videoState reactive object


// Drawing functionality
const drawingCanvas = useDrawingCanvas();
const drawingCanvasA = useDrawingCanvas();
const drawingCanvasB = useDrawingCanvas();

// Unified drawing coordinator (eliminates single/dual branching in consumers)
const drawingCoordinator = useDrawingCoordinator({
  playerMode,
  singleCanvas: drawingCanvas,
  canvasA: drawingCanvasA,
  canvasB: drawingCanvasB,
});

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

const handleAddAnnotation = async (annotationData: AnnotationFormData) => {
  return await addAnnotation(annotationData);
};

const selectedAnnotation = ref<Annotation | null>(null);

// ── Annotation cursor bloom ──────────────────────────────────────────────────
// AnnotationPanel is mounted without a project id, so the bloom must use the
// same catalog key to see the same labels.
const { labels: bloomLabels } = useLabelCatalog(() => user.value?.id);

const bloomOpen = ref(false);
const bloomX = ref(0);
const bloomY = ref(0);

/**
 * Frame captured when the bloom opens. The video keeps playing while the menu is
 * up, so reading the frame at click time would place every annotation late.
 */
const bloomSnapshot = ref<{
  frame: number;
  fps: number;
  dual: { videoAFrame: number; videoBFrame: number } | null;
} | null>(null);

// A plain function, not a computed: canComment() is not reactive, so a computed
// would cache a stale answer.
const bloomReadOnly = () =>
  (isSharedVideo.value || isSharedComparison.value) && !canComment();

const openBloom = (event: MouseEvent) => {
  if (bloomReadOnly()) return;
  if (!user.value) return;
  if (drawingCoordinator?.isDrawingMode?.value) return;
  if (bloomLabels.value.length === 0) return;

  event.preventDefault();

  bloomSnapshot.value = {
    frame: currentFrame.value ?? 0,
    fps: fps.value || 30,
    dual:
      playerMode.value === 'dual'
        ? {
            videoAFrame: dualVideoPlayer?.videoACurrentFrame?.value ?? 0,
            videoBFrame: dualVideoPlayer?.videoBCurrentFrame?.value ?? 0,
          }
        : null,
  };
  bloomX.value = event.clientX;
  bloomY.value = event.clientY;
  bloomOpen.value = true;
};

const closeBloom = () => {
  bloomOpen.value = false;
  bloomSnapshot.value = null;
};

const handleBloomSelect = async (label: Label) => {
  const snapshot = bloomSnapshot.value;
  closeBloom();
  if (!snapshot) return;

  await handleAddAnnotation(
    buildAnnotationPayload({
      labels: bloomLabels.value,
      labelIds: [label.id],
      content: '',
      frame: snapshot.frame,
      fps: snapshot.fps,
      dual: snapshot.dual,
    })
  );
};

// Component Refs
const unifiedVideoPlayerRef = ref<UnifiedVideoPlayerInstance | null>(null);
const annotationPanelRef = ref<InstanceType<typeof AnnotationPanel> | null>(null);
// Deep-link seek target from `?t=` (set by annotation-panel navigation); consumed
// once the video finishes loading (see watch(videoLoaded, ...) below).
const pendingSeekTime = ref<number | null>(null);



// videoLoaded, currentVideoId, currentComparisonId, isAwsVideo are now from videoStore via storeToRefs

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

const { registerCleanup, runAllCleanups, runProjectSwitchCleanups } = useSessionCleanup();

// ── Register cleanup functions ────────────────────────────────────────────────
// Each registration captures a reactive reference; the cleanup fn reads the
// current value at the time it runs, so late-bound state is handled correctly.

// Drawing canvases (project-switch) — delegated to the coordinator
registerCleanup('drawingCanvas', () => {
  drawingCoordinator.cleanup();
});

// Dual video player (project-switch)
registerCleanup('dualVideoPlayer', () => {
  if (!dualVideoPlayer) return;
  if (dualVideoPlayer.videoAUrl) dualVideoPlayer.videoAUrl.value = '';
  if (dualVideoPlayer.videoBUrl) dualVideoPlayer.videoBUrl.value = '';
  dualVideoPlayer.destroy();
});

// Comparison workflow (project-switch)
registerCleanup('comparisonWorkflow', () => {
  if (comparisonWorkflow) comparisonWorkflow.resetWorkflow();
});

// Video session (project-switch)
registerCleanup('videoSession', async () => {
  await endSession();
});

// Annotations (project-switch)
registerCleanup('annotations', () => {
  if (annotations.value && Array.isArray(annotations.value)) {
    try {
      annotations.value.splice(0, annotations.value.length);
    } catch {
      // Array may be readonly
    }
  }
  if (selectedAnnotation.value) selectedAnnotation.value = null;
});

// Video state reset (project-switch) — resets all video state including IDs
registerCleanup('videoState', () => {
  videoStore.resetForProjectSwitch();
});

// Note: realtime annotations cleanup is handled by Vue's onBeforeUnmount.
// Comment permissions and anonymous session are reset internally by
// useVideoSession when endSession() runs (already registered above).

// Initialize notifications
const { error: notifyError } = useNotifications();





watch(
  annotations,
  (newAnnotations) => {
    if (newAnnotations) {
      drawingCoordinator.loadDrawingsFromAnnotations(newAnnotations as any);
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
    // Update the current frame for all relevant drawing canvases via coordinator
    drawingCoordinator.setCurrentFrame(
      newAnnotation.frame,
      newAnnotation.videoAFrame,
      newAnnotation.videoBFrame,
    );

    // Also keep the single canvas frame in sync (used by handleFrameUpdate)
    drawingCanvas.currentFrame.value = newAnnotation.frame;
  }
});



// ── Video event handlers (extracted composable) ──────────────────────────────
const {
  handleTimeUpdate,
  handleFrameUpdate,
  handleFPSDetected,
  handleLoaded,
  handleVideoError,
  handleSeekToTime,
  handleSeekToTimeWithFade,
  handleTimelinePlay,
  handleTimelinePause,
  handleDrawingCreated,
  handleDrawingUpdated,
  handleDrawingDeleted,
  handleDualVideoLoaded,
  handleSeekVideoA,
  handleSeekVideoB,
  handlePlayVideoA,
  handlePauseVideoA,
  handlePlayVideoB,
  handlePauseVideoB,
  handleFrameStepVideoA,
  handleFrameStepVideoB,
  handleAnnotationClick,
  handleAnnotationEdit,
} = useVideoEventHandlers({
  videoStore,
  duration,
  currentFrame,
  totalFrames,
  fps,
  isPlaying,
  playerMode,
  videoLoaded,
  videoUrl,
  currentVideoId,
  currentVideoType,
  currentVideoObject,
  selectedAnnotation,
  drawingCoordinator,
  drawingCanvas,
  drawingCanvasA,
  drawingCanvasB,
  dualVideoPlayer,
  dualVideoPlayerRef,
  comparisonWorkflow,
  unifiedVideoPlayerRef,
  annotationPanelRef,
  initializeVideo,
  loadAnnotations,
});

// ── Watch-progress tracking (informational; spec 2026-07-04) ────────────────
const watchUserId = computed(() => user.value?.id ?? null);

// Wrap store refs in computed: ComputedRef is covariant (readonly value), so
// it always satisfies ReadableRef<string | null | undefined> regardless of the
// store ref's exact nullability.
const singleWatchProgress = useWatchProgress({
  videoId: computed(() => currentVideoId.value ?? null),
  duration,
  userId: watchUserId,
});
// Dual tracking should only ever see a real video id: useDualVideoPlayer
// initializes videoAId/videoBId to placeholder strings ('video-a'/'video-b')
// before a real source is loaded, and useWatchProgress fires immediately
// once videoId+userId are truthy, so we gate on dual mode and filter out
// the placeholders to avoid pointless Supabase calls with non-UUID ids.
const watchVideoAId = computed(() => {
  const id = dualVideoPlayer?.videoAId?.value;
  return playerMode.value === 'dual' && id && id !== 'video-a' ? id : null;
});
const watchVideoBId = computed(() => {
  const id = dualVideoPlayer?.videoBId?.value;
  return playerMode.value === 'dual' && id && id !== 'video-b' ? id : null;
});
const watchProgressA = useWatchProgress({
  videoId: watchVideoAId,
  duration: computed(() => dualVideoPlayer?.videoAState?.duration || 0),
  userId: watchUserId,
});
const watchProgressB = useWatchProgress({
  videoId: watchVideoBId,
  duration: computed(() => dualVideoPlayer?.videoBState?.duration || 0),
  userId: watchUserId,
});

watch(currentTime, (t) => {
  if (playerMode.value === 'single' && typeof t === 'number') {
    singleWatchProgress.onTimeUpdate(t, isPlaying.value);
  }
});
watch(
  () => dualVideoPlayer?.videoACurrentTime?.value,
  (t) => {
    if (playerMode.value === 'dual' && typeof t === 'number') {
      watchProgressA.onTimeUpdate(t, !!dualVideoPlayer?.videoAIsPlaying?.value);
    }
  }
);
watch(
  () => dualVideoPlayer?.videoBCurrentTime?.value,
  (t) => {
    if (playerMode.value === 'dual' && typeof t === 'number') {
      watchProgressB.onTimeUpdate(t, !!dualVideoPlayer?.videoBIsPlaying?.value);
    }
  }
);
// Flush promptly when playback pauses (composable also flushes on unmount/unload)
watch(isPlaying, (playing) => {
  if (!playing) void singleWatchProgress.flush();
});
watch(
  () => dualVideoPlayer?.videoAIsPlaying?.value,
  (playing) => {
    if (!playing) void watchProgressA.flush();
  }
);
watch(
  () => dualVideoPlayer?.videoBIsPlaying?.value,
  (playing) => {
    if (!playing) void watchProgressB.flush();
  }
);

const ownWatchPercent = computed(() =>
  playerMode.value === 'dual'
    ? Math.min(
        watchProgressA.percentWatched.value,
        watchProgressB.percentWatched.value
      )
    : singleWatchProgress.percentWatched.value
);
const watchBreakdownTitle = computed(() =>
  playerMode.value === 'dual'
    ? `Video A: ${watchProgressA.percentWatched.value}% · Video B: ${watchProgressB.percentWatched.value}%`
    : ''
);
const watchHintVisible = computed(() =>
  playerMode.value === 'dual'
    ? !!(
        dualVideoPlayer?.videoAState?.isLoaded ||
        dualVideoPlayer?.videoBState?.isLoaded
      )
    : videoLoaded.value
);

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



const closeComparisonModal = () => {
  layoutStore.closeComparisonModal();
};

const handleComparisonCreated = (comparison: ComparisonCreatedEvent) => {
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

const loadVideo =(video: Partial<Video> & { id?: string; url?: string }, type: 'url' | 'upload' | 'shared' = 'upload') => {
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

const handleProjectSelected = async (project: ProjectSelection) => {
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

      await runProjectSwitchCleanups();
    }

    if (project.projectType === 'single' && project.video) {
      console.log('🎬 [App] Loading single video project');

      // Set player mode first
      playerMode.value = 'single';

      // Pass the complete video object to preserve all properties
      let video: Partial<Video> & { id?: string; url?: string } = project.video;

      // For AWS videos, refresh the presigned URL before loading
      if (VideoService.isAwsVideo(video as Record<string, unknown>)) {
        const freshUrl = await VideoService.refreshAwsVideoUrl(video as Video);
        if (freshUrl) {
          video = { ...video, url: freshUrl };
        }
        isAwsVideo.value = true;
      }

      // Set the video type based on the video's actual type
      const videoType = (project.video.videoType || 'upload') as 'url' | 'upload' | 'shared';
      loadVideo(video, videoType);
      currentVideoId.value = project.video.id || null;
      currentComparisonId.value = null;

      // Load annotations for the new video
      await loadAnnotations();
    } else if (project.projectType === 'dual') {
      console.log('🎬 [App] Loading dual video project');

      // Set player mode first
      playerMode.value = 'dual';
      currentComparisonId.value = project.comparisonVideo?.id || null;
      currentVideoId.value = null;

      if (comparisonWorkflow && project.comparisonVideo) {
        await comparisonWorkflow.loadComparisonVideo(project.comparisonVideo as ComparisonVideo);
      }
    }

    console.log('✅ [App] Project switch completed successfully');
  } catch (error) {
    console.error('❌ [App] Error during project selection:', error);
    // You might want to show a user-friendly error message here
  }
};

// Route-driven loader: resolves the :id param to a project and loads it via
// the existing handleProjectSelected entry point. The route-name check also
// acts as the guard for landing on '/' (name 'dashboard') → no-op, so it never
// collides with the AWS/share branches handled in onMounted.
async function loadFromRoute() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('outputVideo') || ShareService.parseShareUrl().id) return; // handled by AWS/share branch
  try {
    const tParam = route.query.t;
    const parsedT =
      tParam != null && tParam !== '' ? parseFloat(String(tParam)) : NaN;
    pendingSeekTime.value = Number.isFinite(parsedT) ? parsedT : null;

    if (route.name === 'editor-single' && route.params.id) {
      const video = await VideoService.getVideoById(route.params.id as string);
      if (video) {
        await handleProjectSelected({ projectType: 'single', video } as any);
      }
    } else if (route.name === 'editor-dual' && route.params.id) {
      const comparisonVideo = await ComparisonVideoService.getComparisonVideoById(
        route.params.id as string
      );
      if (comparisonVideo) {
        await handleProjectSelected({
          projectType: 'dual',
          comparisonVideo,
          videoA: (comparisonVideo as any).videoA,
          videoB: (comparisonVideo as any).videoB,
        } as any);
      }
    }
  } catch (err) {
    console.warn('[EditorView] loadFromRoute failed to load', route.params.id, err);
    notifyError(
      'Video not found',
      'This video could not be loaded. It may have been deleted or the link is invalid.'
    );
  }
}

// Reload when navigating editor → editor (param changes), not just on mount.
// Non-immediate: the initial load is driven by onMounted.
watch(
  () => [route.name, route.params.id],
  () => {
    loadFromRoute();
  }
);

// When arriving via an annotation deep-link (?t=), seek once the player is ready.
watch(videoLoaded, async (loaded) => {
  if (!loaded || pendingSeekTime.value == null) return;
  const time = pendingSeekTime.value;
  pendingSeekTime.value = null;
  await nextTick();
  await handleSeekToTimeWithFade(time);
});

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

// ── Shared content (extracted composable) ────────────────────────────────────
const {
  isSharedVideo,
  isSharedComparison,
  sharedVideoData,
  showAuthPrompt,
  pendingSharedContent,
  sharedContentPermissionText,
  handleAuthSignIn,
  handleAuthContinueReadOnly,
  initSharedContent,
  handleUserLogin: handleSharedContentUserLogin,
} = useSharedContent({
  user,
  currentVideoId,
  currentComparisonId,
  playerMode,
  loadVideo,
  startSession,
  comparisonWorkflow,
});

// ── Keyboard shortcuts (extracted composable) ────────────────────────────────
useDashboardKeyboard({
  playerMode,
  isPlaying,
  dualVideoPlayer,
  unifiedVideoPlayerRef,
});

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
  try {
    isAppLoading.value = true;

    // Initialize auth
    await initAuth();

    // Check for shared content in the URL (delegated to composable)
    const shareInfo = ShareService.parseShareUrl();

    if (shareInfo.type && shareInfo.id) {
      await initSharedContent();
    } else {
      // Check for AWS project link (from query param or sessionStorage after auth redirect)
      const params = new URLSearchParams(window.location.search);
      const outputVideoId = params.get('outputVideo') || sessionStorage.getItem('pendingOutputVideo');

      if (outputVideoId && user.value) {
        sessionStorage.removeItem('pendingOutputVideo');
        await loadOutputVideo(outputVideoId);
      } else if (!user.value) {
        // If no share link and not logged in, show the login page
      } else {
        // Always load the workspace from the current route param on mount.
        // Do NOT gate on `videoLoaded`: the video store is a singleton that
        // persists a previously-opened video across editor unmount/remount, so
        // gating here would keep showing the stale video after returning via the
        // dashboard and opening a different one. loadFromRoute self-guards — it
        // no-ops on '/' (name 'dashboard') and early-returns on share/AWS params.
        await loadFromRoute();
      }
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



// Logout and cleanup
const handleSignOut = async () => {
  try {
    await signOut();
    await runAllCleanups();
  } catch (error) {
    console.error('Error during sign out and cleanup:', error);
  }
};

const reloadPage = () => window.location.reload();

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
        handleSharedContentUserLogin();
      }
      // Check for pending AWS project after login
      else if (!oldUser && sessionStorage.getItem('pendingOutputVideo')) {
        const outputVideoId = sessionStorage.getItem('pendingOutputVideo');
        sessionStorage.removeItem('pendingOutputVideo');
        if (outputVideoId) {
          loadOutputVideo(outputVideoId);
        }
      }
      // (Removed: auto-open ProjectManagementModal after login. Logged-in users
      // now land on the dashboard/editor route instead of a modal. Task 5.x
      // removes the remaining modal wiring.)
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
          @click="reloadPage"
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
      <p class="text-gray-600 dark:text-gray-400">
        Loading...
      </p>
    </div>
  </div>



  <!-- Main app when user is authenticated OR when viewing shared video/comparison OR showing auth prompt -->
  <div
    v-else
    class="min-h-screen bg-white dark:bg-gray-900 flex flex-col"
  >
    <!-- Header -->
    <EditorHeader
      :user="user"
      :is-shared-video="isSharedVideo"
      :is-shared-comparison="isSharedComparison"
      :can-share="canShare"
      :shared-content-permission-text="sharedContentPermissionText"
      @open-project-modal="router.push({ name: 'dashboard' })"
      @open-shared-links="isSharedLinksModalOpen = true"
      @open-share-modal="layoutStore.openShareModal()"
      @sign-out="handleSignOut"
      @open-changelog="isChangelogModalOpen = true"
    />

    <!-- Main Content -->
    <main class="flex-1 flex overflow-hidden">
      <!-- Main App Content -->
      <!-- Video Section -->
      <section class="flex-1 flex flex-col bg-black min-w-0 overflow-hidden">
        <div class="flex-1 flex items-center justify-center p-6">
          <div class="w-full h-full flex flex-col items-center justify-center">
            <div
              class="relative w-full h-full max-h-full"
              @contextmenu="openBloom"
            >
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

      <AnnotationBloom
        :open="bloomOpen"
        :x="bloomX"
        :y="bloomY"
        :labels="bloomLabels"
        @select="handleBloomSelect"
        @close="closeBloom"
      />

      <!-- Sidebar with Calibration and Annotation Panel -->
      <aside
        class="w-96 min-w-96 max-w-96 flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
      >
        <!-- Own watch-coverage hint (informational, never blocks annotating) -->
        <div
          v-if="user && watchHintVisible"
          class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
          :title="watchBreakdownTitle"
        >
          You've watched {{ Math.round(ownWatchPercent) }}% of this video
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
            :drawing-coordinator="drawingCoordinator"
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
              <p class="text-sm">
                Initializing annotation panel...
              </p>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- All Modals -->
    <DashboardModals
      :is-comparison-modal-open="isComparisonModalOpen"
      :is-share-modal-open="isShareModalOpen"
      :is-shared-links-modal-open="isSharedLinksModalOpen"
      :show-auth-prompt="showAuthPrompt"
      :is-changelog-modal-open="isChangelogModalOpen"
      :share-video-id="shareModalProps.videoId || ''"
      :share-comparison-id="shareModalProps.comparisonId"
      :share-type="shareModalProps.shareType"
      :pending-shared-content="pendingSharedContent"
      @close-comparison-modal="layoutStore.closeComparisonModal()"
      @comparison-created="handleComparisonCreated"
      @close-share-modal="layoutStore.closeShareModal()"
      @close-shared-links="closeSharedLinksManagement"
      @auth-sign-in="handleAuthSignIn"
      @auth-continue-read-only="handleAuthContinueReadOnly"
      @close-changelog="isChangelogModalOpen = false"
    />
  </div>
</template>

<style scoped>
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
