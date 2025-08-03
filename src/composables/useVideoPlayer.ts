/**
 * useVideoPlayer.ts
 * TypeScript conversion from JS preserving the public API.
 */
import { ref, reactive, onUnmounted, type Ref } from 'vue';

export interface PlayerState {
  isPlaying: Ref<boolean>;
  currentTime: Ref<number>;
  duration: Ref<number>;
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
  volume: Ref<number>;
  isMuted: Ref<boolean>;
  playbackSpeed: Ref<number>;
  fps: Ref<number>;
  currentFrame: Ref<number>;
  totalFrames: Ref<number>;
}

export interface UseVideoPlayer {
  // State
  playerRef: Ref<HTMLVideoElement | null>;
  playerState: PlayerState;
  isPlaying: Ref<boolean>;
  currentTime: Ref<number>;
  duration: Ref<number>;
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
  volume: Ref<number>;
  isMuted: Ref<boolean>;
  playbackSpeed: Ref<number>;

  // Frame-based state
  fps: Ref<number>;
  currentFrame: Ref<number>;
  totalFrames: Ref<number>;

  // Controls
  play: () => Promise<void>;
  pause: () => void;
  togglePlayPause: () => void;
  seekTo: (time: number) => void;
  seekToNextFrame: () => void;
  seekToPreviousFrame: () => void;
  setVolume: (newVolume: number) => void;
  toggleMute: () => void;
  setPlaybackSpeed: (speed: number) => void;
  increaseSpeed: () => void;
  decreaseSpeed: () => void;
  resetSpeed: () => void;

  // Event listener management
  startListening: () => void;
  stopListening: () => void;

  // Utilities
  formatTime: (seconds: number) => string;
  formatFrame: (frameNumber: number) => string;
  formatFrameWithFPS: (frameNumber: number) => string;
  timeToFrame: (timeInSeconds: number) => number;
  frameToTime: (frameNumber: number) => number;
  detectFPS: () => Promise<void>;
  updateFrameFromTime: () => void;
}

export function useVideoPlayer(): UseVideoPlayer {
  // Player state
  const playerRef = ref<HTMLVideoElement | null>(null);
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const volume = ref(1);
  const isMuted = ref(false);
  const playbackSpeed = ref(1); // Default playback speed (1x)

  // Frame-based state
  const fps = ref(-1); // Will be detected from video, -1 means unknown
  const currentFrame = ref(0);
  const totalFrames = ref(0);

  // Player state object for easier access
  const playerState: PlayerState = reactive({
    isPlaying,
    currentTime,
    duration,
    isLoading,
    error,
    volume,
    isMuted,
    playbackSpeed,
    fps,
    currentFrame,
    totalFrames,
  }) as unknown as PlayerState;

  // Frame calculation utilities
  const timeToFrame = (timeInSeconds: number) => {
    // Ensure fps is positive to avoid negative frame calculations
    const validFps = fps.value > 0 ? fps.value : 30; // Default to 30 fps if not detected
    const calculatedFrame = Math.round(timeInSeconds * validFps);
    // Ensure frame is never negative
    return Math.max(0, calculatedFrame);
  };

  const frameToTime = (frameNumber: number) => {
    const validFps = fps.value > 0 ? fps.value : 30;
    return frameNumber / validFps;
  };

  const detectFPS = async () => {
    if (!playerRef.value) {
      return;
    }

    try {
      const video = playerRef.value;

      // Try to get FPS from video metadata if available
      if (video.videoWidth && video.videoHeight && duration.value > 0) {
        // Common frame rates for web videos
        const commonFPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

        // Try to detect actual FPS using frame sampling method
        let detectedFPS = 30; // fallback

        // Method 1: Try to use getVideoPlaybackQuality if available (Chrome/Edge)
        // @ts-ignore - getVideoPlaybackQuality is not in the standard TS lib for HTMLVideoElement
        if (typeof video.getVideoPlaybackQuality === 'function') {
          // @ts-ignore
          const quality = video.getVideoPlaybackQuality();
          // @ts-ignore
          if (quality.totalVideoFrames && video.currentTime > 0) {
            // @ts-ignore
            const calculatedFPS = quality.totalVideoFrames / video.currentTime;
            // Find the closest common FPS
            detectedFPS = commonFPS.reduce((prev, curr) =>
              Math.abs(curr - calculatedFPS) < Math.abs(prev - calculatedFPS)
                ? curr
                : prev
            );
          }
        }

        // Method 2: Try to estimate from duration and common frame rates
        if (detectedFPS === 30 && duration.value > 0) {
          // Test common frame rates to see which gives the most reasonable total frame count
          const testResults = commonFPS.map((testFPS) => {
            const frames = Math.round(duration.value * testFPS);
            // Prefer frame rates that result in round numbers or common video lengths
            const score = frames % 1000 === 0 ? 10 : frames % 100 === 0 ? 5 : 1;
            return { fps: testFPS, totalFrames: frames, score };
          });

          // Sort by score and pick the best match
          testResults.sort((a, b) => b.score - a.score);
          detectedFPS = testResults[0].fps;
        }

        fps.value = detectedFPS;

        // Calculate total frames based on duration and detected FPS
        if (duration.value > 0) {
          totalFrames.value = Math.round(duration.value * fps.value);
        }
      }
    } catch {
      fps.value = 30;
      if (duration.value > 0) {
        totalFrames.value = Math.round(duration.value * fps.value);
      }
    }
  };

  const updateFrameFromTime = () => {
    currentFrame.value = timeToFrame(currentTime.value);
  };

  // Player controls
  const play = async () => {
    if (!playerRef.value) {
      return;
    }

    try {
      await playerRef.value.play();
      isPlaying.value = true;
      error.value = null;
    } catch (err: any) {
      const errorMsg = `Failed to play video: ${err.message}`;
      error.value = errorMsg;
    }
  };

  const pause = () => {
    if (!playerRef.value) {
      return;
    }

    try {
      playerRef.value.pause();
      isPlaying.value = false;
    } catch (err: any) {
      const errorMsg = `Failed to pause video: ${err.message}`;
      error.value = errorMsg;
    }
  };

  const togglePlayPause = () => {
    if (isPlaying.value) {
      pause();
    } else {
      void play();
    }
  };

  const seekTo = (time: number) => {
    if (!playerRef.value) {
      return;
    }

    // Always use the video element's duration as the source of truth
    const videoDuration = playerRef.value.duration;

    // Update our composable duration if it's not set but video element has duration
    if (
      videoDuration &&
      videoDuration > 0 &&
      duration.value !== videoDuration
    ) {
      duration.value = videoDuration;
    }

    if (!videoDuration || videoDuration === 0) {
      return;
    }

    try {
      // Ensure time is within valid range
      const clampedTime = Math.max(0, Math.min(time, videoDuration));

      playerRef.value.currentTime = clampedTime;

      // Immediately update our reactive values to ensure Timeline updates
      currentTime.value = clampedTime;
      updateFrameFromTime();

      // currentTime and frame will also be updated by timeupdate event
    } catch (err: any) {
      error.value = `Failed to seek: ${err.message}`;
    }
  };

  const setVolume = (newVolume: number) => {
    if (!playerRef.value) return;

    try {
      const clampedVolume = Math.max(0, Math.min(newVolume, 1));
      playerRef.value.volume = clampedVolume;
      volume.value = clampedVolume;

      if (clampedVolume === 0) {
        isMuted.value = true;
      } else if (isMuted.value) {
        isMuted.value = false;
      }
    } catch (err: any) {
      error.value = `Failed to set volume: ${err.message}`;
    }
  };

  const toggleMute = () => {
    if (!playerRef.value) return;

    try {
      if (isMuted.value) {
        playerRef.value.muted = false;
        isMuted.value = false;
      } else {
        playerRef.value.muted = true;
        isMuted.value = true;
      }
    } catch (err: any) {
      error.value = `Failed to toggle mute: ${err.message}`;
    }
  };

  // Playback speed controls
  const setPlaybackSpeed = (speed: number) => {
    if (!playerRef.value) return;

    try {
      // Common playback speeds: 0.25x, 0.5x, 1x, 1.25x, 1.5x, 2x
      const clampedSpeed = Math.max(0.25, Math.min(speed, 2));
      playerRef.value.playbackRate = clampedSpeed;
      playbackSpeed.value = clampedSpeed;
    } catch (err: any) {
      error.value = `Failed to set playback speed: ${err.message}`;
    }
  };

  const increaseSpeed = () => {
    const speeds = [0.25, 0.5, 1, 1.25, 1.5, 2] as const;
    const currentIndex = speeds.indexOf(
      playbackSpeed.value as (typeof speeds)[number]
    );
    if (currentIndex < speeds.length - 1) {
      setPlaybackSpeed(speeds[currentIndex + 1]);
    }
  };

  const decreaseSpeed = () => {
    const speeds = [0.25, 0.5, 1, 1.25, 1.5, 2] as const;
    const currentIndex = speeds.indexOf(
      playbackSpeed.value as (typeof speeds)[number]
    );
    if (currentIndex > 0) {
      setPlaybackSpeed(speeds[currentIndex - 1]);
    }
  };

  const resetSpeed = () => {
    setPlaybackSpeed(1);
  };

  // Frame-by-frame seeking functions
  const seekToNextFrame = () => {
    if (!playerRef.value || totalFrames.value === 0) {
      return;
    }

    // Pause the video before seeking to prevent auto-play after seek
    const wasPlaying = isPlaying.value;
    if (wasPlaying) {
      pause();
    }

    const nextFrame = Math.min(currentFrame.value + 1, totalFrames.value - 1);
    const nextTime = frameToTime(nextFrame);

    // Add small offset to prevent floating-point precision issues
    const offsetTime = nextTime + 0.00001;
    seekTo(offsetTime);
  };

  const seekToPreviousFrame = () => {
    if (!playerRef.value) {
      return;
    }

    // Pause the video before seeking to prevent auto-play after seek
    const wasPlaying = isPlaying.value;
    if (wasPlaying) {
      pause();
    }

    const previousFrame = Math.max(currentFrame.value - 1, 0);
    const previousTime = frameToTime(previousFrame);

    // Add small offset to prevent floating-point precision issues
    const offsetTime = previousTime + 0.00001;
    seekTo(offsetTime);
  };

  // Keyboard shortcuts
  const handleKeydown = (event: KeyboardEvent) => {
    if (!playerRef.value) return;

    // Only handle keyboard shortcuts if no input/textarea is focused
    const activeElement = document.activeElement as HTMLElement | null;
    if (
      activeElement?.tagName === 'INPUT' ||
      activeElement?.tagName === 'TEXTAREA' ||
      activeElement?.contentEditable === 'true'
    ) {
      return;
    }

    switch (event.code) {
      case 'Space':
        event.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        seekToPreviousFrame();
        break;
      case 'ArrowRight':
        event.preventDefault();
        seekToNextFrame();
        break;
      case 'ArrowUp':
        event.preventDefault();
        setVolume(Math.min(volume.value + 0.1, 1));
        break;
      case 'ArrowDown':
        event.preventDefault();
        setVolume(Math.max(volume.value - 0.1, 0));
        break;
      case 'KeyM':
        event.preventDefault();
        toggleMute();
        break;
      case 'Period': // > key for increase speed
        event.preventDefault();
        increaseSpeed();
        break;
      case 'Comma': // < key for decrease speed
        event.preventDefault();
        decreaseSpeed();
        break;
      case 'Digit1': // 1 key to reset to normal speed
        event.preventDefault();
        resetSpeed();
        break;
    }
  };

  // Event listener management functions
  const startListening = () => {
    document.addEventListener('keydown', handleKeydown);
  };

  const stopListening = () => {
    document.removeEventListener('keydown', handleKeydown);
  };

  // Cleanup on unmount - simplified
  onUnmounted(() => {
    stopListening();
  });

  // Format time helper
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
        .toString()
        .padStart(2, '0')}`;
    }

    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Format frame helper
  const formatFrame = (frameNumber: number) => {
    if (!frameNumber || isNaN(frameNumber)) return 'Frame 0';
    return `Frame ${frameNumber.toLocaleString()}`;
  };

  // Format frame with FPS info
  const formatFrameWithFPS = (frameNumber: number) => {
    if (!frameNumber || isNaN(frameNumber)) return 'Frame 0 @ 30fps';
    return `Frame ${frameNumber.toLocaleString()} @ ${fps.value}fps`;
  };

  return {
    // State
    playerRef,
    playerState,
    isPlaying,
    currentTime,
    duration,
    isLoading,
    error,
    volume,
    isMuted,
    playbackSpeed,

    // Frame-based state
    fps,
    currentFrame,
    totalFrames,

    // Controls
    play,
    pause,
    togglePlayPause,
    seekTo,
    seekToNextFrame,
    seekToPreviousFrame,
    setVolume,
    toggleMute,
    setPlaybackSpeed,
    increaseSpeed,
    decreaseSpeed,
    resetSpeed,

    // Event listener management
    startListening,
    stopListening,

    // Utilities
    formatTime,
    formatFrame,
    formatFrameWithFPS,
    timeToFrame,
    frameToTime,
    detectFPS,
    updateFrameFromTime,
  };
}
