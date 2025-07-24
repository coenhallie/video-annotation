import { ref, reactive, watch, onUnmounted } from 'vue';
import { useNotifications } from './useNotifications.ts';

export function useDualVideoPlayer() {
  const { error: showError } = useNotifications();
  // Dual video state
  const videoARef = ref(null);
  const videoBRef = ref(null);
  const videoAUrl = ref('');
  const videoBUrl = ref('');

  // Shared synchronized state
  const currentTime = ref(0);
  const duration = ref(0); // Use longer duration of the two videos
  const isPlaying = ref(false);
  const currentFrame = ref(0);
  const totalFrames = ref(0);
  const fps = ref(30);

  // Individual video states (for metadata)
  const videoAState = reactive({
    duration: 0,
    fps: 30,
    totalFrames: 0,
    isLoaded: false,
  });

  const videoBState = reactive({
    duration: 0,
    fps: 30,
    totalFrames: 0,
    isLoaded: false,
  });

  // Event listeners for automatic synchronization
  const eventListeners = new Map();

  // Frame calculation utilities
  const timeToFrame = (timeInSeconds) => {
    return Math.round(timeInSeconds * fps.value);
  };

  const frameToTime = (frameNumber) => {
    return frameNumber / fps.value;
  };

  const updateFrameFromTime = () => {
    currentFrame.value = timeToFrame(currentTime.value);
  };

  // Automatic state synchronization functions
  const setupVideoEventListeners = (videoElement, videoState, videoId) => {
    if (!videoElement || eventListeners.has(videoElement)) {
      return;
    }

    const listeners = {
      timeupdate: () => {
        // Update shared state from the primary video (videoA takes precedence)
        if (videoElement === videoARef.value) {
          currentTime.value = videoElement.currentTime;
          updateFrameFromTime();
        }
      },

      loadedmetadata: () => {
        videoState.duration = videoElement.duration;
        videoState.isLoaded = true;

        // Update shared duration to the shorter of the two videos to keep them in sync
        // Only update if both videos have loaded their metadata
        if (videoAState.duration > 0 && videoBState.duration > 0) {
          const minDuration = Math.min(
            videoAState.duration,
            videoBState.duration
          );
          duration.value = minDuration;
          totalFrames.value = Math.round(minDuration * fps.value);
        } else if (videoAState.duration > 0 && videoBState.duration === 0) {
          // Only video A has loaded, use its duration temporarily
          duration.value = videoAState.duration;
          totalFrames.value = Math.round(videoAState.duration * fps.value);
        } else if (videoBState.duration > 0 && videoAState.duration === 0) {
          // Only video B has loaded, use its duration temporarily
          duration.value = videoBState.duration;
          totalFrames.value = Math.round(videoBState.duration * fps.value);
        }

        console.log(`Video ${videoId} loaded:`, {
          duration: videoState.duration,
          sharedDuration: duration.value,
          totalFrames: totalFrames.value,
        });
      },

      play: () => {
        isPlaying.value = true;
      },

      pause: () => {
        isPlaying.value = false;
      },

      seeking: () => {
        // Sync the other video when one is seeking
        if (videoElement === videoARef.value && videoBRef.value) {
          videoBRef.value.currentTime = videoElement.currentTime;
        } else if (videoElement === videoBRef.value && videoARef.value) {
          videoARef.value.currentTime = videoElement.currentTime;
        }
      },

      error: (event) => {
        console.error(`Video ${videoId} error:`, event);
        showError(
          `Video ${videoId} playback error`,
          'Please check your video file and try again.'
        );
      },
    };

    // Add all event listeners
    Object.entries(listeners).forEach(([event, handler]) => {
      videoElement.addEventListener(event, handler);
    });

    // Store listeners for cleanup
    eventListeners.set(videoElement, listeners);
  };

  const removeVideoEventListeners = (videoElement) => {
    const listeners = eventListeners.get(videoElement);
    if (listeners && videoElement) {
      Object.entries(listeners).forEach(([event, handler]) => {
        videoElement.removeEventListener(event, handler);
      });
      eventListeners.delete(videoElement);
    }
  };

  // Watch for video ref changes and setup/cleanup listeners
  watch(videoARef, (newVideo, oldVideo) => {
    if (oldVideo) {
      removeVideoEventListeners(oldVideo);
    }
    if (newVideo) {
      setupVideoEventListeners(newVideo, videoAState, 'A');
    }
  });

  watch(videoBRef, (newVideo, oldVideo) => {
    if (oldVideo) {
      removeVideoEventListeners(oldVideo);
    }
    if (newVideo) {
      setupVideoEventListeners(newVideo, videoBState, 'B');
    }
  });

  // Synchronization methods
  const syncSeek = (time) => {
    try {
      if (!videoARef.value && !videoBRef.value) {
        console.warn('No video elements available for seeking');
        return;
      }

      // Clamp time to valid range - use the shorter duration to keep videos in sync
      const minDuration = Math.min(videoAState.duration, videoBState.duration);
      const clampedTime = Math.max(0, Math.min(time, minDuration));

      // Seek both videos
      if (videoARef.value && videoAState.isLoaded) {
        videoARef.value.currentTime = clampedTime;
      }
      if (videoBRef.value && videoBState.isLoaded) {
        videoBRef.value.currentTime = clampedTime;
      }

      // Update shared state immediately for responsive UI
      currentTime.value = clampedTime;
      updateFrameFromTime();

      console.log('Sync seek:', {
        requestedTime: time,
        clampedTime,
        currentFrame: currentFrame.value,
      });
    } catch (error) {
      console.error('Sync seek failed:', error);
      showError(
        'Failed to synchronize video seeking',
        'Please try again or check your video files.'
      );
    }
  };

  const syncPlay = async () => {
    try {
      if (!videoARef.value && !videoBRef.value) {
        console.warn('No video elements available for playback');
        return;
      }

      const promises = [];
      if (videoARef.value && videoAState.isLoaded) {
        promises.push(videoARef.value.play());
      }
      if (videoBRef.value && videoBState.isLoaded) {
        promises.push(videoBRef.value.play());
      }

      if (promises.length > 0) {
        await Promise.all(promises);
        isPlaying.value = true;
        console.log('Sync play successful');
      }
    } catch (error) {
      console.error('Sync play failed:', error);
      isPlaying.value = false;
      showError(
        'Failed to synchronize video playback',
        'Please try again or check your video files.'
      );
    }
  };

  const syncPause = () => {
    try {
      if (!videoARef.value && !videoBRef.value) {
        console.warn('No video elements available for pause');
        return;
      }

      if (videoARef.value && videoAState.isLoaded) {
        videoARef.value.pause();
      }
      if (videoBRef.value && videoBState.isLoaded) {
        videoBRef.value.pause();
      }

      isPlaying.value = false;
      console.log('Sync pause successful');
    } catch (error) {
      console.error('Sync pause failed:', error);
      showError(
        'Failed to synchronize video pause',
        'Please try again or check your video files.'
      );
    }
  };

  // Video swap functionality
  const swapVideos = () => {
    try {
      // Swap URLs
      const tempUrl = videoAUrl.value;
      videoAUrl.value = videoBUrl.value;
      videoBUrl.value = tempUrl;

      // Swap states
      const tempState = { ...videoAState };
      Object.assign(videoAState, videoBState);
      Object.assign(videoBState, tempState);
    } catch (error) {
      console.error('Video swap failed:', error);
      showError('Failed to swap videos', 'Please try again.');
    }
  };

  // Cleanup function
  const cleanup = () => {
    if (videoARef.value) {
      removeVideoEventListeners(videoARef.value);
    }
    if (videoBRef.value) {
      removeVideoEventListeners(videoBRef.value);
    }
    eventListeners.clear();
  };

  // Note: onUnmounted removed since this composable can be called outside component context
  // Cleanup will be handled manually when needed

  return {
    // Refs
    videoARef,
    videoBRef,
    videoAUrl,
    videoBUrl,

    // Shared state
    currentTime,
    duration,
    isPlaying,
    currentFrame,
    totalFrames,
    fps,

    // Individual states
    videoAState,
    videoBState,

    // Sync methods
    syncSeek,
    syncPlay,
    syncPause,
    swapVideos,

    // Utility functions
    setupVideoEventListeners,
    removeVideoEventListeners,
    timeToFrame,
    frameToTime,
    updateFrameFromTime,
    cleanup,
  };
}
