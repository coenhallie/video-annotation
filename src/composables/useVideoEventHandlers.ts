import { createRetryBudget } from '@/utils/retryBudget';
import { type Ref } from 'vue';
import { VideoService } from '@/services/videoService';
import type { Video, Annotation } from '@/types/database';
import type {
  VideoLoadedEvent,
  DrawingCreatedEvent,
} from '@/types/component-interfaces';
import type { UseDrawingCoordinator } from './useDrawingCoordinator';
import type { DualVideoPlayer } from './useDualVideoPlayer';

export interface VideoEventHandlers {
  handleTimeUpdate: (data: { currentTime: number; duration: number }) => void;
  handleFrameUpdate: (data: { currentFrame: number; totalFrames: number; fps: number }) => void;
  handleFPSDetected: (data: { fps: number; totalFrames: number }) => void;
  handleLoaded: (data: VideoLoadedEvent) => Promise<void>;
  handleVideoError: (error: Error | Event) => Promise<void>;
  handleSeekToTime: (time: number) => void;
  handleSeekToTimeWithFade: (time: number) => Promise<void>;
  handleTimelinePlay: () => void;
  handleTimelinePause: () => void;
  handleDrawingCreated: (drawing: DrawingCreatedEvent, videoContext?: string) => void;
  handleSeekVideoA: (time: number) => void;
  handleSeekVideoB: (time: number) => void;
  handlePlayVideoA: () => void;
  handlePauseVideoA: () => void;
  handlePlayVideoB: () => void;
  handlePauseVideoB: () => void;
  handleFrameStepVideoA: (direction: number) => void;
  handleFrameStepVideoB: (direction: number) => void;
  handleAnnotationClick: (annotation: Annotation) => Promise<void>;
}

export function useVideoEventHandlers(deps: {
  /** Pinia video store (or equivalent). */
  videoStore: {
    updateTime: (time: number) => void;
    updateDuration: (duration: number) => void;
    setDimensions: (width: number, height: number) => void;
    setVideo: (url: string, id: string) => void;
  };
  /** Store refs for video state. */
  /** The single player's position, in seconds. */
  currentTime: Ref<number>;
  duration: Ref<number>;
  currentFrame: Ref<number>;
  totalFrames: Ref<number>;
  fps: Ref<number>;
  isPlaying: Ref<boolean>;

  /** Player mode ('single' | 'dual'). */
  playerMode: Ref<'single' | 'dual'>;

  /** Refs for video metadata. */
  videoLoaded: Ref<boolean>;
  videoUrl: Ref<string>;
  currentVideoId: Ref<string | null>;
  currentVideoType: Ref<'url' | 'upload' | 'shared'>;
  currentVideoObject: Ref<Partial<Video> | null>;
  selectedAnnotation: Ref<Annotation | null>;

  /** Drawing coordinator (unified single/dual API). */
  drawingCoordinator: UseDrawingCoordinator;

  /** Drawing canvases (still needed for currentFrame sync in handleFrameUpdate). */
  drawingCanvas: {
    currentFrame: Ref<number>;
    addDrawing: (drawing: DrawingCreatedEvent) => void;
  };
  drawingCanvasA: {
    currentFrame: Ref<number>;
  };
  drawingCanvasB: {
    currentFrame: Ref<number>;
  };

  /** Dual video player instance. */
  dualVideoPlayer: DualVideoPlayer;

  /** Ref to the UnifiedVideoPlayer component. */
  unifiedVideoPlayerRef: Ref<{
    seekTo?: (time: number) => void;
    play?: () => void;
    pause?: () => void;
    performVideoFadeTransition?: (fn: () => void) => Promise<void>;
  } | null>;

  /** The video the annotation list currently belongs to, or null. */
  annotationVideoId: () => string | null;

  /** Annotation composable methods. */
  initializeVideo: (data: any) => Promise<unknown>;
  loadAnnotations: () => Promise<void>;
}): VideoEventHandlers {
  const {
    videoStore,
    currentTime,
    duration,
    currentFrame,
    totalFrames,
    fps,
    playerMode,
    videoLoaded,
    videoUrl,
    currentVideoId,
    currentVideoType,
    currentVideoObject,
    selectedAnnotation,
    drawingCoordinator,
    drawingCanvas,
    dualVideoPlayer,
    unifiedVideoPlayerRef,
    annotationVideoId,
    initializeVideo,
  } = deps;

  // ── Single video event handlers ────────────────────────────────────────────

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
        // The player is the first thing that knows a pipeline video's real
        // length and frame rate; its row was created with placeholders. A
        // no-op for any other video, and for one already measured.
        if (typeof data.fps === 'number') {
          void VideoService.storeMediaInfo(currentVideoObject.value, {
            duration: duration.value,
            fps: data.fps,
          });
        }
      }
    } catch (error) {
      console.error('Error in handleFPSDetected:', error);
    }
  };

  const handleLoaded = async (data: VideoLoadedEvent) => {
    try {
      if (!data) {
        console.error('handleLoaded called with no data');
        return;
      }

      videoLoaded.value = true;
      if (resumeAt !== null) {
        const time = resumeAt;
        resumeAt = null;
        unifiedVideoPlayerRef.value?.seekTo?.(time);
      }
      if (currentVideoObject.value?.id) {
        awsRefreshBudget.reset(String(currentVideoObject.value.id));
      }

      if (data.duration !== undefined) {
        videoStore.updateDuration(data.duration);
      }

      if (data.dimensions) {
        videoStore.setDimensions(data.dimensions.width, data.dimensions.height);
      }

      if (data.id) {
        currentVideoId.value = data.id as string;
      }

      // The project loader gives the annotation list its video from the video
      // record, so that annotations load even when the media never does. This
      // stays as the fallback for entry points that do not (and initializeVideo
      // loads the list itself - a second load here was pure duplication).
      const loadedId = currentVideoObject.value?.id ?? currentVideoId.value;
      if (loadedId && annotationVideoId() === loadedId) return;

      const existingVideoObj = currentVideoObject.value
        ? currentVideoObject.value
        : currentVideoId.value
          ? {
              id: currentVideoId.value,
              url: videoUrl.value,
              title: data.title || '',
              videoType: currentVideoType.value || 'url',
            }
          : null;
      const initData: Record<string, unknown> = {
        ...data,
        videoType: currentVideoType.value || 'url',
        existingVideo: existingVideoObj,
      };
      await initializeVideo(initData as Parameters<typeof initializeVideo>[0]);
    } catch (error) {
      console.error('Error in handleLoaded:', error);
    }
  };

  // A refresh reloads the player, and a reload of an object that is really gone
  // errors again, so without a cap this ran presign, attach, error forever.
  // Three covers an expired URL plus a transient blip; a successful load hands
  // the budget back.
  const awsRefreshBudget = createRetryBudget(3);

  // Where playback was when a refresh reloaded the player. setVideo starts the
  // new source at 0:00, so without this one network hiccup two hours into a
  // pipeline video sent the viewer back to the start.
  let resumeAt: number | null = null;

  const handleVideoError = async (_error: Error | Event) => {
    // If this is an AWS video, the presigned URL may have expired - try refreshing
    if (
      currentVideoObject.value &&
      VideoService.isAwsVideo(currentVideoObject.value as Record<string, unknown>)
    ) {
      const budgetKey = String(currentVideoObject.value.id ?? '');
      if (!awsRefreshBudget.take(budgetKey)) {
        console.error(
          '[useVideoEventHandlers] AWS video still failing after repeated URL refreshes; giving up.'
        );
        return;
      }
      console.log('🔄 [App] AWS video error, attempting URL refresh...');
      const freshUrl = await VideoService.refreshAwsVideoUrl(
        currentVideoObject.value as Video,
      );
      if (freshUrl) {
        if (currentTime.value > 0) resumeAt = currentTime.value;
        currentVideoObject.value = { ...currentVideoObject.value, url: freshUrl };
        videoStore.setVideo(freshUrl, currentVideoObject.value.id || '');
      }
    }
  };

  const handleSeekToTime = (time: number) => {
    if (unifiedVideoPlayerRef.value?.seekTo) {
      unifiedVideoPlayerRef.value?.seekTo?.(time);
    }
  };

  const handleSeekToTimeWithFade = async (time: number) => {
    if (playerMode.value === 'dual' && dualVideoPlayer) {
      dualVideoPlayer.seekVideoA?.(time);
      dualVideoPlayer.seekVideoB?.(time);
    } else {
      if (
        unifiedVideoPlayerRef.value?.performVideoFadeTransition &&
        unifiedVideoPlayerRef.value?.seekTo
      ) {
        await unifiedVideoPlayerRef.value.performVideoFadeTransition(
          () => {
            unifiedVideoPlayerRef.value?.seekTo?.(time);
          },
        );
      } else if (unifiedVideoPlayerRef.value?.seekTo) {
        unifiedVideoPlayerRef.value?.seekTo?.(time);
      }
    }
  };

  // ── Timeline play/pause ────────────────────────────────────────────────────

  const handleTimelinePlay = () => {
    if (playerMode.value === 'single' && unifiedVideoPlayerRef.value) {
      unifiedVideoPlayerRef.value.play?.();
    } else if (playerMode.value === 'dual' && dualVideoPlayer) {
      dualVideoPlayer.playVideoA?.();
      dualVideoPlayer.playVideoB?.();
    }
  };

  const handleTimelinePause = () => {
    if (playerMode.value === 'single' && unifiedVideoPlayerRef.value) {
      unifiedVideoPlayerRef.value.pause?.();
    } else if (playerMode.value === 'dual' && dualVideoPlayer) {
      dualVideoPlayer.pauseVideoA?.();
      dualVideoPlayer.pauseVideoB?.();
    }
  };

  // ── Drawing event handlers ─────────────────────────────────────────────────

  const handleDrawingCreated = (
    drawing: DrawingCreatedEvent,
    videoContext?: string,
  ) => {
    drawingCoordinator.addDrawing(drawing, videoContext);
  };

  // ── Dual video action handlers ─────────────────────────────────────────────

  const handleSeekVideoA = (time: number) => dualVideoPlayer.seekVideoA?.(time);
  const handleSeekVideoB = (time: number) => dualVideoPlayer.seekVideoB?.(time);
  const handlePlayVideoA = () => void dualVideoPlayer.playVideoA?.();
  const handlePauseVideoA = () => dualVideoPlayer.pauseVideoA?.();
  const handlePlayVideoB = () => void dualVideoPlayer.playVideoB?.();
  const handlePauseVideoB = () => dualVideoPlayer.pauseVideoB?.();
  const handleFrameStepVideoA = (direction: number) =>
    dualVideoPlayer.stepFrameVideoA?.(direction);
  const handleFrameStepVideoB = (direction: number) =>
    dualVideoPlayer.stepFrameVideoB?.(direction);

  // ── Annotation click / edit ────────────────────────────────────────────────

  const handleAnnotationClick = async (annotation: Annotation) => {
    selectedAnnotation.value = annotation;

    // Update the current frame for the drawing canvas via coordinator
    if (annotation.frame !== undefined) {
      drawingCoordinator.setCurrentFrame(
        annotation.frame,
        annotation.videoAFrame ?? undefined,
        annotation.videoBFrame ?? undefined,
      );
    }

    // Seek to the annotation's timestamp
    if (playerMode.value === 'dual' && dualVideoPlayer) {
      if (
        // `!= null`, not `!== undefined`: these columns are nullable, and the
        // database hands back an explicit null. null / fps is 0, so an
        // annotation without per-video frames seeked both videos to 0:00.
        annotation.videoAFrame != null &&
        annotation.videoBFrame != null
      ) {
        const videoATime =
          annotation.videoATimestamp ||
          annotation.videoAFrame / (dualVideoPlayer.videoAState?.fps || 30);
        const videoBTime =
          annotation.videoBTimestamp ||
          annotation.videoBFrame / (dualVideoPlayer.videoBState?.fps || 30);

        dualVideoPlayer.seekVideoA?.(videoATime);
        dualVideoPlayer.seekVideoB?.(videoBTime);
      } else if (annotation.timestamp !== undefined) {
        // Fallback to timestamp if dual mode frames are not properly set
        await handleSeekToTimeWithFade(annotation.timestamp);
      }
    } else if (annotation.timestamp !== undefined) {
      // Single mode: use timestamp
      await handleSeekToTimeWithFade(annotation.timestamp);
    }
  };

  return {
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
    handleSeekVideoA,
    handleSeekVideoB,
    handlePlayVideoA,
    handlePauseVideoA,
    handlePlayVideoB,
    handlePauseVideoB,
    handleFrameStepVideoA,
    handleFrameStepVideoB,
    handleAnnotationClick,
  };
}
