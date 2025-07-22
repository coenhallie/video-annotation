import { ref, reactive, onUnmounted } from 'vue';

export function useVideoPlayer() {
  // Player state
  const playerRef = ref(null);
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const isLoading = ref(false);
  const error = ref(null);
  const volume = ref(1);
  const isMuted = ref(false);
  const playbackSpeed = ref(1); // Default playback speed (1x)

  // Frame-based state
  const fps = ref(30); // Default FPS, will be detected
  const currentFrame = ref(0);
  const totalFrames = ref(0);

  // Player state object for easier access
  const playerState = reactive({
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
  });

  // Frame calculation utilities
  const timeToFrame = (timeInSeconds) => {
    return Math.round(timeInSeconds * fps.value);
  };

  const frameToTime = (frameNumber) => {
    return frameNumber / fps.value;
  };

  const detectFPS = async () => {
    if (!playerRef.value) {
      return;
    }

    try {
      // Try to get FPS from video metadata if available
      const video = playerRef.value;

      // For most web videos, we'll use a common detection method
      // This is a simplified approach - in production you might want more sophisticated detection
      if (video.videoWidth && video.videoHeight) {
        // Common frame rates for web videos
        const commonFPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

        // Default to 30 FPS for web videos, but this could be enhanced
        // to actually detect the real FPS using frame sampling
        fps.value = 30;

        // Calculate total frames based on duration and FPS
        if (duration.value > 0) {
          totalFrames.value = Math.round(duration.value * fps.value);
        }
      }
    } catch (err) {
      fps.value = 30;
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
    } catch (err) {
      const errorMsg = `Failed to play video: ${err.message}`;
      error.value = errorMsg;
      console.error('Play error:', err);
    }
  };

  const pause = () => {
    if (!playerRef.value) {
      return;
    }

    try {
      playerRef.value.pause();
      isPlaying.value = false;
    } catch (err) {
      const errorMsg = `Failed to pause video: ${err.message}`;
      error.value = errorMsg;
      console.error('Pause error:', err);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying.value) {
      pause();
    } else {
      play();
    }
  };

  const seekTo = (time) => {
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
    } catch (err) {
      error.value = `Failed to seek: ${err.message}`;
      console.error('Seek error:', err);
    }
  };

  const setVolume = (newVolume) => {
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
    } catch (err) {
      error.value = `Failed to set volume: ${err.message}`;
      console.error('Volume error:', err);
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
    } catch (err) {
      error.value = `Failed to toggle mute: ${err.message}`;
      console.error('Mute error:', err);
    }
  };

  // Playback speed controls
  const setPlaybackSpeed = (speed) => {
    if (!playerRef.value) return;

    try {
      // Common playback speeds: 0.25x, 0.5x, 1x, 1.25x, 1.5x, 2x
      const clampedSpeed = Math.max(0.25, Math.min(speed, 2));
      playerRef.value.playbackRate = clampedSpeed;
      playbackSpeed.value = clampedSpeed;
    } catch (err) {
      error.value = `Failed to set playback speed: ${err.message}`;
      console.error('Playback speed error:', err);
    }
  };

  const increaseSpeed = () => {
    const speeds = [0.25, 0.5, 1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackSpeed.value);
    if (currentIndex < speeds.length - 1) {
      setPlaybackSpeed(speeds[currentIndex + 1]);
    }
  };

  const decreaseSpeed = () => {
    const speeds = [0.25, 0.5, 1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackSpeed.value);
    if (currentIndex > 0) {
      setPlaybackSpeed(speeds[currentIndex - 1]);
    }
  };

  const resetSpeed = () => {
    setPlaybackSpeed(1);
  };

  // Simplified event handlers - removed unused custom event handlers
  // VideoPlayer component handles native events directly

  // Keyboard shortcuts
  const handleKeydown = (event) => {
    if (!playerRef.value) return;

    switch (event.code) {
      case 'Space':
        event.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        seekTo(currentTime.value - 10);
        break;
      case 'ArrowRight':
        event.preventDefault();
        seekTo(currentTime.value + 10);
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

  // Cleanup on unmount - simplified
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
  });

  // Format time helper
  const formatTime = (seconds) => {
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
  const formatFrame = (frameNumber) => {
    if (!frameNumber || isNaN(frameNumber)) return 'Frame 0';
    return `Frame ${frameNumber.toLocaleString()}`;
  };

  // Format frame with FPS info
  const formatFrameWithFPS = (frameNumber) => {
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
    setVolume,
    toggleMute,
    setPlaybackSpeed,
    increaseSpeed,
    decreaseSpeed,
    resetSpeed,

    // Setup and cleanup removed - handled directly in VideoPlayer component

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
