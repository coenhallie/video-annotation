/**
 * useDualVideoPlayer.ts
 * TypeScript version preserving the JS API shape.
 * Expanded to cover independent controls for A/B while keeping a minimal API.
 */
import { ref, reactive, onMounted, onUnmounted, watch, type Ref } from 'vue';

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

  // Drawing canvas references
  drawingCanvasA?: any;
  drawingCanvasB?: any;

  // Method to set video sources
  setVideoSources?: (
    videoA: { url: string; id: string } | null,
    videoB: { url: string; id: string } | null
  ) => void;
  setCanvasRefs?: (canvasA: any, canvasB: any) => void;

  // Drawing methods
  addDrawing?: (drawing: any, videoContext: 'A' | 'B') => void;
  updateDrawing?: (drawing: any, videoContext: 'A' | 'B') => void;
  deleteDrawing?: (drawingId: string, videoContext: 'A' | 'B') => void;

  // Sync control
  isSyncEnabled?: Ref<boolean>;
  isIndependentMode?: Ref<boolean>;
  toggleTimelineMode?: () => void;
  setTimelineMode?: (independent: boolean) => void;
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

  // Add sync control flags
  const isSyncEnabled = ref(true);
  const isManualSeekingA = ref(false);
  const isManualSeekingB = ref(false);
  const isIndependentMode = ref(true); // New flag for independent timeline control

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

  function syncTime(
    target: HTMLVideoElement,
    other: HTMLVideoElement,
    sourceVideo: 'A' | 'B'
  ) {
    try {
      // Only sync if:
      // 1. Sync is enabled globally
      // 2. Independent mode is disabled (for synchronized playback)
      // 3. Neither video is being manually controlled
      // 4. This is not during an individual timeline seek
      if (
        isSyncEnabled.value &&
        !isIndependentMode.value &&
        !isManualSeekingA.value &&
        !isManualSeekingB.value
      ) {
        // keep within ~1 frame at 30fps
        if (Math.abs(target.currentTime - other.currentTime) > 0.033) {
          other.currentTime = target.currentTime;
        }
      }
    } catch {
      // ignore sync failures due to readiness
    }
  }

  function attachSync() {
    const a = videoARef.value;
    const b = videoBRef.value;
    if (!a || !b) return;

    const onTimeA = () => {
      // Only attempt sync if not in independent mode and not manually seeking
      if (!isIndependentMode.value) {
        syncTime(a, b, 'A');
      }
      // Always update reactive state for Video A
      videoACurrentTime.value = a.currentTime;
      videoACurrentFrame.value = timeToFrame(a.currentTime, 'A');
    };

    const onTimeB = () => {
      // Only attempt sync if not in independent mode and not manually seeking
      if (!isIndependentMode.value) {
        syncTime(b, a, 'B');
      }
      // Always update reactive state for Video B
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

    const onLoadedMetadataA = () => {
      videoAState.duration = a.duration;
      videoAState.isLoaded = true;
      // Set a reasonable default FPS for video playback
      videoAState.fps = 30; // Default to 30fps
      if (a.duration > 0) {
        videoAState.totalFrames = Math.round(a.duration * videoAState.fps);
      }
    };

    const onLoadedMetadataB = () => {
      videoBState.duration = b.duration;
      videoBState.isLoaded = true;
      // Set a reasonable default FPS for video playback
      videoBState.fps = 30; // Default to 30fps
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

  function seek(time: number) {
    // This is for simultaneous seeking of both videos (synchronized operation)
    isManualSeekingA.value = true;
    isManualSeekingB.value = true;

    if (videoARef.value) videoARef.value.currentTime = time;
    if (videoBRef.value) videoBRef.value.currentTime = time;

    // Reset flags after simultaneous seek
    setTimeout(() => {
      isManualSeekingA.value = false;
      isManualSeekingB.value = false;
    }, 300);
  }

  // Explicit per-video controls used by callers like App.vue
  function seekVideoA(time: number) {
    if (videoARef.value) {
      isManualSeekingA.value = true;
      videoARef.value.currentTime = time;
      // Use a longer timeout and clear any existing timeout to be more reliable
      setTimeout(() => {
        isManualSeekingA.value = false;
      }, 300);
    }
  }

  function seekVideoB(time: number) {
    if (videoBRef.value) {
      isManualSeekingB.value = true;
      videoBRef.value.currentTime = time;
      // Use a longer timeout and clear any existing timeout to be more reliable
      setTimeout(() => {
        isManualSeekingB.value = false;
      }, 300);
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
    const currentFrame = timeToFrame(videoACurrentTime.value, 'A');
    const newFrame = Math.max(0, currentFrame + direction);
    const newTime = frameToTime(newFrame, 'A');

    if (videoARef.value) {
      isManualSeekingA.value = true;
      videoARef.value.currentTime = newTime;
      videoACurrentFrame.value = newFrame;
      // Use a longer timeout for frame stepping
      setTimeout(() => {
        isManualSeekingA.value = false;
      }, 300);
    }
  }

  function stepFrameVideoB(direction: number) {
    const currentFrame = timeToFrame(videoBCurrentTime.value, 'B');
    const newFrame = Math.max(0, currentFrame + direction);
    const newTime = frameToTime(newFrame, 'B');

    if (videoBRef.value) {
      isManualSeekingB.value = true;
      videoBRef.value.currentTime = newTime;
      videoBCurrentFrame.value = newFrame;
      // Use a longer timeout for frame stepping
      setTimeout(() => {
        isManualSeekingB.value = false;
      }, 300);
    }
  }

  // Drawing canvas references - these will be set by the parent component
  const drawingCanvasA = ref<any>(null);
  const drawingCanvasB = ref<any>(null);

  // Method to set video sources
  function setVideoSources(
    videoA: { url: string; id: string } | null,
    videoB: { url: string; id: string } | null
  ) {
    if (videoA) {
      videoAUrl.value = videoA.url;
      videoAId.value = videoA.id;
    } else {
      videoAUrl.value = '';
      videoAId.value = 'video-a';
    }

    if (videoB) {
      videoBUrl.value = videoB.url;
      videoBId.value = videoB.id;
    } else {
      videoBUrl.value = '';
      videoBId.value = 'video-b';
    }
  }

  // Method to set canvas references
  function setCanvasRefs(canvasA: any, canvasB: any) {
    drawingCanvasA.value = canvasA;
    drawingCanvasB.value = canvasB;
    console.log('🎨 [useDualVideoPlayer] Canvas refs set:', {
      canvasA,
      canvasB,
    });
  }

  // Drawing methods for dual video mode
  function addDrawing(drawing: any, videoContext: 'A' | 'B') {
    const canvas =
      videoContext === 'A' ? drawingCanvasA.value : drawingCanvasB.value;
    if (canvas && canvas.addDrawing) {
      console.log(
        `🎨 [useDualVideoPlayer] Adding drawing to video ${videoContext}:`,
        drawing
      );
      canvas.addDrawing(drawing);
    } else {
      console.warn(
        `🎨 [useDualVideoPlayer] No drawing canvas available for video ${videoContext}`
      );
    }
  }

  function updateDrawing(drawing: any, videoContext: 'A' | 'B') {
    const canvas =
      videoContext === 'A' ? drawingCanvasA.value : drawingCanvasB.value;
    if (canvas && canvas.updateDrawing) {
      console.log(
        `🎨 [useDualVideoPlayer] Updating drawing on video ${videoContext}:`,
        drawing
      );
      canvas.updateDrawing(drawing);
    } else {
      console.warn(
        `🎨 [useDualVideoPlayer] No drawing canvas available for video ${videoContext}`
      );
    }
  }

  function deleteDrawing(drawingId: string, videoContext: 'A' | 'B') {
    const canvas =
      videoContext === 'A' ? drawingCanvasA.value : drawingCanvasB.value;
    if (canvas && canvas.deleteDrawing) {
      console.log(
        `🎨 [useDualVideoPlayer] Deleting drawing from video ${videoContext}:`,
        drawingId
      );
      canvas.deleteDrawing(drawingId);
    } else {
      console.warn(
        `🎨 [useDualVideoPlayer] No drawing canvas available for video ${videoContext}`
      );
    }
  }

  // Method to toggle between independent and synchronized timeline modes
  function toggleTimelineMode() {
    isIndependentMode.value = !isIndependentMode.value;
    console.log(
      '🎥 [useDualVideoPlayer] Timeline mode changed to:',
      isIndependentMode.value ? 'Independent' : 'Synchronized'
    );
  }

  // Method to set timeline mode explicitly
  function setTimelineMode(independent: boolean) {
    isIndependentMode.value = independent;
    console.log(
      '🎥 [useDualVideoPlayer] Timeline mode set to:',
      independent ? 'Independent' : 'Synchronized'
    );
  }

  function destroy() {
    pause();
    cleanupSync?.();
    videoARef.value = null;
    videoBRef.value = null;
    isReady.value = false;
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
    // expose video URLs and IDs
    videoAUrl,
    videoBUrl,
    videoAId,
    videoBId,
    // expose drawing canvas refs
    drawingCanvasA,
    drawingCanvasB,
    // expose utility methods
    setVideoSources,
    setCanvasRefs,
    // expose drawing methods
    addDrawing,
    updateDrawing,
    deleteDrawing,
    // expose sync control
    isSyncEnabled,
    isIndependentMode,
    toggleTimelineMode,
    setTimelineMode,
  };
}
