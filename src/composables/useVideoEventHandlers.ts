import { type Ref } from 'vue';
import { VideoService } from '@/services/videoService';
import type { Video, Annotation } from '@/types/database';
import type {
  VideoLoadedEvent,
  DrawingCreatedEvent,
} from '@/types/component-interfaces';
import type { UseDrawingCoordinator } from './useDrawingCoordinator';

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
  handleDrawingUpdated: (drawing: DrawingCreatedEvent, videoContext?: string) => void;
  handleDrawingDeleted: (drawingId: string, videoContext?: string) => void;
  handleDualVideoLoaded: () => Promise<void>;
  handleDualVideoAction: (action: string, context: string, ...args: any[]) => void;
  handleSeekVideoA: (time: number) => void;
  handleSeekVideoB: (time: number) => void;
  handlePlayVideoA: () => void;
  handlePauseVideoA: () => void;
  handlePlayVideoB: () => void;
  handlePauseVideoB: () => void;
  handleFrameStepVideoA: (direction: string) => void;
  handleFrameStepVideoB: (direction: string) => void;
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
    updateDrawing?: (drawing: DrawingCreatedEvent) => void;
    deleteDrawing?: (drawingId: string) => void;
  };
  drawingCanvasA: {
    currentFrame: Ref<number>;
  };
  drawingCanvasB: {
    currentFrame: Ref<number>;
  };

  /** Dual video player instance. */
  dualVideoPlayer: Record<string, any>;

  /** Ref to the dual video player component. */
  dualVideoPlayerRef: Ref<any>;

  /** Comparison workflow instance. */
  comparisonWorkflow: Record<string, any>;

  /** Ref to the UnifiedVideoPlayer component. */
  unifiedVideoPlayerRef: Ref<{
    seekTo?: (time: number) => void;
    play?: () => void;
    pause?: () => void;
    performVideoFadeTransition?: (fn: () => void) => Promise<void>;
  } | null>;

  /** Annotation composable methods. */
  initializeVideo: (data: any) => Promise<void>;
  loadAnnotations: () => Promise<void>;
}): VideoEventHandlers {
  const {
    videoStore,
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
    drawingCanvasA,
    drawingCanvasB,
    dualVideoPlayer,
    dualVideoPlayerRef,
    comparisonWorkflow,
    unifiedVideoPlayerRef,
    initializeVideo,
    loadAnnotations,
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
      }

      await loadAnnotations();
    } catch (error) {
      console.error('Error in handleLoaded:', error);
    }
  };

  const handleVideoError = async (_error: Error | Event) => {
    // If this is an AWS video, the presigned URL may have expired - try refreshing
    if (
      currentVideoObject.value &&
      VideoService.isAwsVideo(currentVideoObject.value as Record<string, unknown>)
    ) {
      console.log('🔄 [App] AWS video error, attempting URL refresh...');
      const freshUrl = await VideoService.refreshAwsVideoUrl(
        currentVideoObject.value as Video,
      );
      if (freshUrl) {
        currentVideoObject.value = { ...currentVideoObject.value, url: freshUrl };
        videoStore.setVideo(freshUrl, currentVideoObject.value.id || '');
      }
    }
  };

  const handleSeekToTime = (time: number) => {
    if ((unifiedVideoPlayerRef.value as any)?.seekTo) {
      (unifiedVideoPlayerRef.value as any).seekTo(time);
    }
  };

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
          },
        );
      } else if ((unifiedVideoPlayerRef.value as any)?.seekTo) {
        (unifiedVideoPlayerRef.value as any).seekTo(time);
      }
    }
  };

  // ── Timeline play/pause ────────────────────────────────────────────────────

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

  // ── Drawing event handlers ─────────────────────────────────────────────────

  const handleDrawingCreated = (
    drawing: DrawingCreatedEvent,
    videoContext?: string,
  ) => {
    drawingCoordinator.addDrawing(drawing, videoContext);

    // In dual mode the dualVideoPlayer may also need the event
    if (playerMode.value === 'dual') {
      (dualVideoPlayer as any).addDrawing?.(drawing, videoContext || 'A');
    }
  };

  const handleDrawingUpdated = (
    drawing: DrawingCreatedEvent,
    videoContext?: string,
  ) => {
    if (playerMode.value === 'dual') {
      const context = videoContext || 'A';
      (dualVideoPlayer as any).updateDrawing?.(drawing, context);
    } else {
      (drawingCanvas as any).updateDrawing?.(drawing);
    }
  };

  const handleDrawingDeleted = (drawingId: string, videoContext?: string) => {
    if (playerMode.value === 'dual') {
      const context = videoContext || 'A';
      (dualVideoPlayer as any).deleteDrawing?.(drawingId, context);
    } else {
      (drawingCanvas as any).deleteDrawing?.(drawingId);
    }
  };

  // ── Dual video action handlers ─────────────────────────────────────────────

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

  // ── Dual video loaded ──────────────────────────────────────────────────────

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

  // ── Annotation click / edit ────────────────────────────────────────────────

  const handleAnnotationClick = async (annotation: Annotation) => {
    selectedAnnotation.value = annotation;

    // Update the current frame for the drawing canvas via coordinator
    if (annotation.frame !== undefined) {
      drawingCoordinator.setCurrentFrame(
        annotation.frame,
        annotation.videoAFrame,
        annotation.videoBFrame,
      );
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
    handleDrawingUpdated,
    handleDrawingDeleted,
    handleDualVideoLoaded,
    handleDualVideoAction,
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
