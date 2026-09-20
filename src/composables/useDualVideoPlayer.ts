/**
 * useDualVideoPlayer.ts
 * TypeScript version preserving the JS API shape.
 * Expanded to cover independent controls for A/B while keeping a minimal API.
 */
import { ref, reactive, onMounted, onUnmounted, watch, type Ref } from 'vue';
import type { useDrawingCanvas } from './useDrawingCanvas';
import type { RefreshVideoUrl } from '@/services/fragmentedMp4Source';

/** One side of a comparison as handed to setVideoSources. */
export interface DualVideoSource {
  url: string;
  id: string;
  /** See SingleVideoPlayer's refreshUrl prop. Absent for sources that never expire. */
  refreshUrl?: RefreshVideoUrl | undefined;
}

/**
 * What EditorView stashes in the drawingCanvasA / drawingCanvasB slots below:
 * the object useDrawingCanvas() returns.
 */
type DrawingCanvasApi = ReturnType<typeof useDrawingCanvas>;

export interface DualVideoPlayerState {
  duration: number;
  fps: number;
  totalFrames: number;
  isLoaded: boolean;
}

export interface DualVideoPlayer {
  videoARef: Ref<HTMLVideoElement | null>;
  videoBRef: Ref<HTMLVideoElement | null>;
  isReady: Ref<boolean>;
  // basic unified controls (legacy API)
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;

  // additional explicit controls (used by UnifiedVideoPlayer/App)
  videoACurrentTime?: Ref<number>;
  videoBCurrentTime?: Ref<number>;
  videoAIsPlaying?: Ref<boolean>;
  videoBIsPlaying?: Ref<boolean>;
  videoACurrentFrame?: Ref<number>;
  videoBCurrentFrame?: Ref<number>;
  videoAState?: DualVideoPlayerState;
  videoBState?: DualVideoPlayerState;
  seekVideoA?: (time: number) => void;
  seekVideoB?: (time: number) => void;
  playVideoA?: () => Promise<void>;
  pauseVideoA?: () => void;
  playVideoB?: () => Promise<void>;
  pauseVideoB?: () => void;
  stepFrameVideoA?: (direction: number) => void;
  stepFrameVideoB?: (direction: number) => void;

  // Video URLs and IDs (required by UnifiedVideoPlayer)
  videoAUrl?: Ref<string>;
  videoBUrl?: Ref<string>;
  videoAId?: Ref<string>;
  videoBId?: Ref<string>;

  // Drawing canvas references.
  //
  // Pure passthrough slots: EditorView assigns the useDrawingCanvas()
  // composables into them and the template reads them back out to hand to
  // UnifiedVideoPlayer. Nothing in this composable touches them.
  //
  // They were declared as `Ref<{ addDrawing?, ... }>`, which described neither
  // what is stored (a composable object, not a ref) nor what is read.
  drawingCanvasA?: DrawingCanvasApi | null;
  drawingCanvasB?: DrawingCanvasApi | null;

  // Per-video URL refresh, handed to each SingleVideoPlayer so an expired
  // presigned URL is replaced mid-stream. Null when the source has none.
  videoARefreshUrl?: Ref<RefreshVideoUrl | null>;
  videoBRefreshUrl?: Ref<RefreshVideoUrl | null>;

  // Method to set video sources
  setVideoSources?: (
    videoA: DualVideoSource | null,
    videoB: DualVideoSource | null
  ) => void;

  /**
   * Record the frame rate one side's player found (see SingleVideoPlayer's
   * fps-detected). Until this is called a side counts frames at 30.
   */
  setFps?: (side: 'A' | 'B', fps: number) => void;

  // Sync control
}

export function useDualVideoPlayer(): DualVideoPlayer {
  const videoARef = ref<HTMLVideoElement | null>(null);
  const videoBRef = ref<HTMLVideoElement | null>(null);
  const isReady = ref(false);

  // Extended state
  const videoACurrentTime = ref(0);
  const videoBCurrentTime = ref(0);
  const videoAIsPlaying = ref(false);
  const videoBIsPlaying = ref(false);
  const videoACurrentFrame = ref(0);
  const videoBCurrentFrame = ref(0);

  // Sources and identifiers for UnifiedVideoPlayer props
  const videoAUrl = ref<string>('');
  const videoBUrl = ref<string>('');
  const videoAId = ref<string>('video-a');
  const videoBId = ref<string>('video-b');
  const videoARefreshUrl = ref<RefreshVideoUrl | null>(null);
  const videoBRefreshUrl = ref<RefreshVideoUrl | null>(null);

  // Whether each side's player has reported a real frame rate yet; before it
  // does, loadedmetadata seeds 30 so frame numbers exist during scrubbing.
  let fpsKnownA = false;
  let fpsKnownB = false;

  function setFps(side: 'A' | 'B', fps: number) {
    if (!(fps > 0)) return;
    const state = side === 'A' ? videoAState : videoBState;
    if (side === 'A') fpsKnownA = true;
    else fpsKnownB = true;
    state.fps = fps;
    if (state.duration > 0) state.totalFrames = Math.round(state.duration * fps);
  }

  const videoAState = reactive<DualVideoPlayerState>({
    duration: 0,
    fps: 30, // Initialize with default FPS
    totalFrames: 0,
    isLoaded: false,
  });
  const videoBState = reactive<DualVideoPlayerState>({
    duration: 0,
    fps: 30, // Initialize with default FPS
    totalFrames: 0,
    isLoaded: false,
  });

  const fallbackFps = 30;


  const timeToFrame = (timeInSeconds: number, which: 'A' | 'B') =>
    Math.round(
      timeInSeconds *
        Math.max(
          1,
          which === 'A'
            ? videoAState.fps > 0
              ? videoAState.fps
              : fallbackFps
            : videoBState.fps > 0
            ? videoBState.fps
            : fallbackFps
        )
    );
  const frameToTime = (frame: number, which: 'A' | 'B') =>
    frame /
    Math.max(
      1,
      which === 'A'
        ? videoAState.fps > 0
          ? videoAState.fps
          : fallbackFps
        : videoBState.fps > 0
        ? videoBState.fps
        : fallbackFps
    );

  function attachSync() {
    const a = videoARef.value;
    const b = videoBRef.value;
    if (!a || !b) return;

    const onTimeA = () => {
      videoACurrentTime.value = a.currentTime;
      videoACurrentFrame.value = timeToFrame(a.currentTime, 'A');
    };

    const onTimeB = () => {
      videoBCurrentTime.value = b.currentTime;
      videoBCurrentFrame.value = timeToFrame(b.currentTime, 'B');
    };

    const onPlayA = () => {
      videoAIsPlaying.value = true;
    };

    const onPauseA = () => {
      videoAIsPlaying.value = false;
    };

    const onPlayB = () => {
      videoBIsPlaying.value = true;
    };

    const onPauseB = () => {
      videoBIsPlaying.value = false;
    };

    // The player may report the real rate (setFps) during the same
    // loadedmetadata turn, before or after this listener runs, so the default
    // must not overwrite a rate that has already been found.
    const onLoadedMetadataA = () => {
      videoAState.duration = a.duration;
      videoAState.isLoaded = true;
      if (!fpsKnownA) videoAState.fps = 30;
      if (a.duration > 0) {
        videoAState.totalFrames = Math.round(a.duration * videoAState.fps);
      }
    };

    const onLoadedMetadataB = () => {
      videoBState.duration = b.duration;
      videoBState.isLoaded = true;
      if (!fpsKnownB) videoBState.fps = 30;
      if (b.duration > 0) {
        videoBState.totalFrames = Math.round(b.duration * videoBState.fps);
      }
    };

    // Add all event listeners
    a.addEventListener('timeupdate', onTimeA);
    b.addEventListener('timeupdate', onTimeB);
    a.addEventListener('play', onPlayA);
    a.addEventListener('pause', onPauseA);
    b.addEventListener('play', onPlayB);
    b.addEventListener('pause', onPauseB);
    a.addEventListener('loadedmetadata', onLoadedMetadataA);
    b.addEventListener('loadedmetadata', onLoadedMetadataB);

    const cleanup = () => {
      a.removeEventListener('timeupdate', onTimeA);
      b.removeEventListener('timeupdate', onTimeB);
      a.removeEventListener('play', onPlayA);
      a.removeEventListener('pause', onPauseA);
      b.removeEventListener('play', onPlayB);
      b.removeEventListener('pause', onPauseB);
      a.removeEventListener('loadedmetadata', onLoadedMetadataA);
      b.removeEventListener('loadedmetadata', onLoadedMetadataB);
    };

    return cleanup;
  }

  let cleanupSync: (() => void) | undefined;

  // Watch for when both video refs become available and attach sync
  const setupSync = () => {
    if (cleanupSync) {
      cleanupSync();
      cleanupSync = undefined;
    }

    if (videoARef.value && videoBRef.value) {
      console.log(
        '🎥 [useDualVideoPlayer] Both video refs available, attaching sync'
      );
      cleanupSync = attachSync();
    }
  };

  // Watch for changes to video refs
  watch([videoARef, videoBRef], setupSync, { immediate: true });

  onMounted(() => {
    isReady.value = true;
    // Try to setup sync immediately in case refs are already available
    setupSync();
  });

  onUnmounted(() => {
    if (cleanupSync) cleanupSync();
  });

  function play() {
    void videoARef.value?.play();
    void videoBRef.value?.play();
  }

  function pause() {
    videoARef.value?.pause();
    videoBRef.value?.pause();
  }

  // Moves both videos to the same time.
  function seek(time: number) {
    if (videoARef.value) videoARef.value.currentTime = time;
    if (videoBRef.value) videoBRef.value.currentTime = time;
  }

  // Explicit per-video controls used by callers like App.vue
  function seekVideoA(time: number) {
    if (videoARef.value) {
      videoARef.value.currentTime = time;
    }
  }

  function seekVideoB(time: number) {
    if (videoBRef.value) {
      videoBRef.value.currentTime = time;
    }
  }

  async function playVideoA() {
    if (videoARef.value) {
      await videoARef.value.play();
    }
  }

  function pauseVideoA() {
    if (videoARef.value) {
      videoARef.value.pause();
    }
  }

  async function playVideoB() {
    if (videoBRef.value) {
      await videoBRef.value.play();
    }
  }

  function pauseVideoB() {
    if (videoBRef.value) {
      videoBRef.value.pause();
    }
  }

  function setPlaybackRate(rate: number) {
    if (videoARef.value) videoARef.value.playbackRate = rate;
    if (videoBRef.value) videoBRef.value.playbackRate = rate;

    // Update frame calculations when speed changes
    if (videoARef.value) {
      videoACurrentFrame.value = timeToFrame(videoARef.value.currentTime, 'A');
    }
    if (videoBRef.value) {
      videoBCurrentFrame.value = timeToFrame(videoBRef.value.currentTime, 'B');
    }
  }

  function stepFrameVideoA(direction: number) {
    if (videoARef.value) {
      // Step from the element, not from the reactive time: that one only moves
      // on `timeupdate`, so a held arrow key would step from the same stale
      // position each repeat and lose frames.
      const currentFrame = timeToFrame(videoARef.value.currentTime, 'A');
      const newFrame = Math.max(0, currentFrame + direction);
      const newTime = frameToTime(newFrame, 'A');

      videoARef.value.currentTime = newTime;
      videoACurrentTime.value = newTime;
      videoACurrentFrame.value = newFrame;
    }
  }

  function stepFrameVideoB(direction: number) {
    if (videoBRef.value) {
      // Step from the element, not from the reactive time: that one only moves
      // on `timeupdate`, so a held arrow key would step from the same stale
      // position each repeat and lose frames.
      const currentFrame = timeToFrame(videoBRef.value.currentTime, 'B');
      const newFrame = Math.max(0, currentFrame + direction);
      const newTime = frameToTime(newFrame, 'B');

      videoBRef.value.currentTime = newTime;
      videoBCurrentTime.value = newTime;
      videoBCurrentFrame.value = newFrame;
    }
  }

  // Drawing canvas references - these will be set by the parent component
  // Method to set video sources
  function setVideoSources(
    videoA: DualVideoSource | null,
    videoB: DualVideoSource | null
  ) {
    // New sources, new rates: the seeded 30 applies again until each player
    // reports.
    fpsKnownA = false;
    fpsKnownB = false;
    if (videoA) {
      videoAUrl.value = videoA.url;
      videoAId.value = videoA.id;
      videoARefreshUrl.value = videoA.refreshUrl ?? null;
    } else {
      videoAUrl.value = '';
      videoAId.value = 'video-a';
      videoARefreshUrl.value = null;
    }

    if (videoB) {
      videoBUrl.value = videoB.url;
      videoBId.value = videoB.id;
      videoBRefreshUrl.value = videoB.refreshUrl ?? null;
    } else {
      videoBUrl.value = '';
      videoBId.value = 'video-b';
      videoBRefreshUrl.value = null;
    }
  }

  // Ends the current project's session. The element refs and their listeners
  // stay: DualVideoPlayer owns that binding, and the same two elements carry on
  // into the next comparison with new sources.
  function destroy() {
    pause();
    videoACurrentTime.value = 0;
    videoBCurrentTime.value = 0;
    videoACurrentFrame.value = 0;
    videoBCurrentFrame.value = 0;
    // Both elements get new sources after a project switch, so their metadata
    // is stale until `loadedmetadata` fires again.
    videoAState.isLoaded = false;
    videoBState.isLoaded = false;
  }

  return {
    videoARef,
    videoBRef,
    isReady,
    play,
    pause,
    seek,
    setPlaybackRate,
    destroy,
    // expose explicit methods for compatibility with existing callers
    seekVideoA,
    seekVideoB,
    playVideoA,
    pauseVideoA,
    playVideoB,
    pauseVideoB,
    stepFrameVideoA,
    stepFrameVideoB,
    // expose state refs
    videoACurrentTime,
    videoBCurrentTime,
    videoAIsPlaying,
    videoBIsPlaying,
    videoACurrentFrame,
    videoBCurrentFrame,
    videoAState,
    videoBState,
    videoARefreshUrl,
    videoBRefreshUrl,
    // expose video URLs and IDs
    videoAUrl,
    videoBUrl,
    videoAId,
    videoBId,
    // expose utility methods
    setVideoSources,
    setFps,
    // expose drawing methods
  };
}
