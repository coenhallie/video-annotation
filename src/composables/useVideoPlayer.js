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
    console.log('🎬 [useVideoPlayer] detectFPS() called');
    if (!playerRef.value) {
      console.warn(
        '🎬 [useVideoPlayer] No playerRef available for FPS detection'
      );
      return;
    }

    try {
      // Try to get FPS from video metadata if available
      const video = playerRef.value;
      console.log(
        '🎬 [useVideoPlayer] Video dimensions:',
        video.videoWidth,
        'x',
        video.videoHeight
      );
      console.log(
        '🎬 [useVideoPlayer] Video duration for FPS calc:',
        duration.value
      );

      // For most web videos, we'll use a common detection method
      // This is a simplified approach - in production you might want more sophisticated detection
      if (video.videoWidth && video.videoHeight) {
        // Common frame rates for web videos
        const commonFPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

        // Default to 30 FPS for web videos, but this could be enhanced
        // to actually detect the real FPS using frame sampling
        fps.value = 30;
        console.log('🎬 [useVideoPlayer] FPS set to:', fps.value);

        // Calculate total frames based on duration and FPS
        if (duration.value > 0) {
          totalFrames.value = Math.round(duration.value * fps.value);
          console.log(
            '🎬 [useVideoPlayer] Total frames calculated:',
            totalFrames.value
          );
        } else {
          console.warn(
            '🎬 [useVideoPlayer] Duration is 0, cannot calculate total frames'
          );
        }
      } else {
        console.warn(
          '🎬 [useVideoPlayer] Video dimensions not available, cannot detect FPS'
        );
      }
    } catch (err) {
      console.warn(
        '🚨 [useVideoPlayer] Could not detect FPS, using default 30 FPS:',
        err
      );
      fps.value = 30;
    }
  };

  const updateFrameFromTime = () => {
    currentFrame.value = timeToFrame(currentTime.value);
  };

  // Player controls
  const play = async () => {
    console.log('🎬 [useVideoPlayer] play() called');
    if (!playerRef.value) {
      console.error('🚨 [useVideoPlayer] No playerRef available for play()');
      return;
    }

    try {
      console.log('🎬 [useVideoPlayer] Calling playerRef.play()');
      await playerRef.value.play();
      isPlaying.value = true;
      error.value = null;
      console.log('✅ [useVideoPlayer] Video play successful');
    } catch (err) {
      const errorMsg = `Failed to play video: ${err.message}`;
      error.value = errorMsg;
      console.error('🚨 [useVideoPlayer] Play error:', err);
      console.error('🚨 [useVideoPlayer] Error message:', errorMsg);
    }
  };

  const pause = () => {
    console.log('🎬 [useVideoPlayer] pause() called');
    if (!playerRef.value) {
      console.error('🚨 [useVideoPlayer] No playerRef available for pause()');
      return;
    }

    try {
      console.log('🎬 [useVideoPlayer] Calling playerRef.pause()');
      playerRef.value.pause();
      isPlaying.value = false;
      console.log('✅ [useVideoPlayer] Video pause successful');
    } catch (err) {
      const errorMsg = `Failed to pause video: ${err.message}`;
      error.value = errorMsg;
      console.error('🚨 [useVideoPlayer] Pause error:', err);
      console.error('🚨 [useVideoPlayer] Error message:', errorMsg);
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
    console.log('seekTo called with time:', time);
    console.log('playerRef.value:', !!playerRef.value);
    console.log('duration.value:', duration.value);

    if (!playerRef.value) {
      console.warn('seekTo aborted: missing playerRef');
      return;
    }

    // Always use the video element's duration as the source of truth
    const videoDuration = playerRef.value.duration;
    console.log('videoDuration from element:', videoDuration);

    // Update our composable duration if it's not set but video element has duration
    if (
      videoDuration &&
      videoDuration > 0 &&
      duration.value !== videoDuration
    ) {
      console.log(
        'Updating composable duration from video element:',
        videoDuration
      );
      duration.value = videoDuration;
    }

    if (!videoDuration || videoDuration === 0) {
      console.warn('seekTo aborted: video duration is 0 or undefined');
      return;
    }

    try {
      // Ensure time is within valid range
      const clampedTime = Math.max(0, Math.min(time, videoDuration));
      console.log('Setting currentTime to:', clampedTime);
      playerRef.value.currentTime = clampedTime;
      console.log('currentTime set successfully');

      // Immediately update our reactive values to ensure Timeline updates
      currentTime.value = clampedTime;
      updateFrameFromTime();
      console.log('Reactive currentTime updated to:', currentTime.value);

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
