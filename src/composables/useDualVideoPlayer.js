import { ref, reactive, watch } from 'vue';
import { useNotifications } from './useNotifications.ts';
import { useVideoAnnotations } from './useVideoAnnotations.ts';
import { useDrawingCanvas } from './useDrawingCanvas.ts';

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

  // Annotation system integration
  const videoAId = ref('');
  const videoBId = ref('');
  const projectId = ref(null);
  const comparisonVideoId = ref(null);

  // Drawing canvas instances for both videos
  const drawingCanvasA = useDrawingCanvas();
  const drawingCanvasB = useDrawingCanvas();

  // Annotation composables for both videos
  let videoAAnnotations = null;
  let videoBAnnotations = null;
  let comparisonAnnotations = null;

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

  // Annotation system methods
  const initializeAnnotations = (
    videoAData,
    videoBData,
    projectIdValue,
    comparisonVideoIdValue
  ) => {
    console.log(
      '🎯 [DualVideoPlayer] Initializing annotations for dual videos'
    );

    // Set video IDs and project context
    videoAId.value = videoAData.videoId || videoAData.video_id || 'video-a';
    videoBId.value = videoBData.videoId || videoBData.video_id || 'video-b';
    projectId.value = projectIdValue;
    comparisonVideoId.value = comparisonVideoIdValue;

    // Initialize annotation composables for both videos
    videoAAnnotations = useVideoAnnotations(
      videoAUrl,
      videoAId,
      projectId,
      comparisonVideoId
    );

    videoBAnnotations = useVideoAnnotations(
      videoBUrl,
      videoBId,
      projectId,
      comparisonVideoId
    );

    // Initialize comparison annotations if in comparison mode
    if (comparisonVideoIdValue) {
      comparisonAnnotations = useVideoAnnotations(
        ref(''), // No specific URL for comparison annotations
        comparisonVideoId,
        projectId,
        comparisonVideoId
      );
    }

    // Setup drawing canvas frame synchronization
    watch(currentFrame, (newFrame) => {
      drawingCanvasA.currentFrame.value = newFrame;
      drawingCanvasB.currentFrame.value = newFrame;
    });

    console.log('✅ [DualVideoPlayer] Annotations initialized successfully');
  };

  const initializeVideoAnnotations = async (videoAData, videoBData) => {
    if (!videoAAnnotations || !videoBAnnotations) {
      console.warn('⚠️ [DualVideoPlayer] Annotations not initialized');
      return;
    }

    try {
      // Initialize both video annotation systems
      await Promise.all([
        videoAAnnotations.initializeVideo(videoAData),
        videoBAnnotations.initializeVideo(videoBData),
      ]);

      console.log('✅ [DualVideoPlayer] Video annotations initialized');
    } catch (error) {
      console.error(
        '❌ [DualVideoPlayer] Error initializing video annotations:',
        error
      );
      showError('Failed to initialize annotations', 'Please try again.');
    }
  };

  const addAnnotation = async (annotationData, videoContext = 'A') => {
    try {
      const annotationSystem =
        videoContext === 'A' ? videoAAnnotations : videoBAnnotations;

      if (!annotationSystem) {
        throw new Error(
          `Annotation system not initialized for video ${videoContext}`
        );
      }

      // Add video context to annotation data
      const contextualAnnotationData = {
        ...annotationData,
        videoContext,
        videoId: videoContext === 'A' ? videoAId.value : videoBId.value,
        project_id: projectId.value,
        comparison_video_id: comparisonVideoId.value,
      };

      const newAnnotation = await annotationSystem.addAnnotation(
        contextualAnnotationData
      );
      console.log(
        `✅ [DualVideoPlayer] Annotation added to video ${videoContext}:`,
        newAnnotation
      );
      return newAnnotation;
    } catch (error) {
      console.error(
        `❌ [DualVideoPlayer] Error adding annotation to video ${videoContext}:`,
        error
      );
      showError('Failed to add annotation', error.message);
      throw error;
    }
  };

  const updateAnnotation = async (
    annotationId,
    updates,
    videoContext = 'A'
  ) => {
    try {
      const annotationSystem =
        videoContext === 'A' ? videoAAnnotations : videoBAnnotations;

      if (!annotationSystem) {
        throw new Error(
          `Annotation system not initialized for video ${videoContext}`
        );
      }

      const updatedAnnotation = await annotationSystem.updateAnnotation(
        annotationId,
        updates
      );
      console.log(
        `✅ [DualVideoPlayer] Annotation updated in video ${videoContext}:`,
        updatedAnnotation
      );
      return updatedAnnotation;
    } catch (error) {
      console.error(
        `❌ [DualVideoPlayer] Error updating annotation in video ${videoContext}:`,
        error
      );
      showError('Failed to update annotation', error.message);
      throw error;
    }
  };

  const deleteAnnotation = async (annotationId, videoContext = 'A') => {
    try {
      const annotationSystem =
        videoContext === 'A' ? videoAAnnotations : videoBAnnotations;

      if (!annotationSystem) {
        throw new Error(
          `Annotation system not initialized for video ${videoContext}`
        );
      }

      await annotationSystem.deleteAnnotation(annotationId);
      console.log(
        `✅ [DualVideoPlayer] Annotation deleted from video ${videoContext}`
      );
    } catch (error) {
      console.error(
        `❌ [DualVideoPlayer] Error deleting annotation from video ${videoContext}:`,
        error
      );
      showError('Failed to delete annotation', error.message);
      throw error;
    }
  };

  // Track current annotation context for drawing mode
  const currentAnnotationContext = ref(null);

  const setCurrentAnnotationContext = (annotation) => {
    currentAnnotationContext.value = annotation;
    console.log(
      '🎨 [DualVideoPlayer] Set current annotation context:',
      annotation?.id,
      annotation
    );
  };

  const clearCurrentAnnotationContext = () => {
    const previousId = currentAnnotationContext.value?.id;
    currentAnnotationContext.value = null;
    console.log(
      '🎨 [DualVideoPlayer] Cleared current annotation context (was:',
      previousId + ')'
    );
  };

  const handleDrawingCreated = async (
    drawing,
    videoContext = 'A',
    userId = null
  ) => {
    try {
      const drawingCanvas =
        videoContext === 'A' ? drawingCanvasA : drawingCanvasB;

      // Add drawing to the appropriate canvas
      drawingCanvas.addDrawing(drawing);

      console.log(
        `🎨 [DualVideoPlayer] Processing drawing for video ${videoContext}, annotation context:`,
        currentAnnotationContext.value?.id || 'null'
      );

      // Check if we're adding to an existing annotation or creating a new one
      if (currentAnnotationContext.value) {
        // Adding drawing to existing annotation
        console.log(
          `🎨 [DualVideoPlayer] Adding drawing to existing annotation ${currentAnnotationContext.value.id} for video ${videoContext}`
        );

        // Get current drawing data from the annotation
        const existingDrawingData = currentAnnotationContext.value.drawingData;

        // For dual video mode, we need to handle drawing data differently
        let updatedDrawingData;
        if (videoContext === 'A' || videoContext === 'B') {
          // Dual video mode - store drawings per video context
          updatedDrawingData = existingDrawingData || {};
          const contextKey = `drawing${videoContext}`;

          // If there's existing drawing data for this context, merge the paths
          if (updatedDrawingData[contextKey]) {
            updatedDrawingData[contextKey] = {
              ...updatedDrawingData[contextKey],
              paths: [
                ...updatedDrawingData[contextKey].paths,
                ...drawing.paths,
              ],
              canvasWidth: drawing.canvasWidth,
              canvasHeight: drawing.canvasHeight,
            };
          } else {
            updatedDrawingData[contextKey] = drawing;
          }
        } else {
          // Single video mode - merge paths directly
          if (existingDrawingData && existingDrawingData.paths) {
            updatedDrawingData = {
              ...existingDrawingData,
              paths: [...existingDrawingData.paths, ...drawing.paths],
              canvasWidth: drawing.canvasWidth,
              canvasHeight: drawing.canvasHeight,
            };
          } else {
            updatedDrawingData = drawing;
          }
        }

        // Update the existing annotation with the new drawing data
        await updateAnnotation(
          currentAnnotationContext.value.id,
          {
            drawingData: updatedDrawingData,
            annotationType: 'drawing', // Ensure it's marked as a drawing annotation
          },
          videoContext
        );

        console.log(
          `✅ [DualVideoPlayer] Drawing added to existing annotation for video ${videoContext}`
        );
      } else {
        // Creating new standalone drawing annotation
        console.log(
          `🎨 [DualVideoPlayer] Creating new drawing annotation for video ${videoContext}`
        );

        // Convert drawing to annotation and save it
        const annotation = drawingCanvas.convertDrawingToAnnotation(
          drawing,
          videoContext === 'A' ? videoAId.value : videoBId.value,
          userId || 'user', // Use provided userId or fallback
          'Drawing Annotation',
          `Drawing on frame ${drawing.frame} - Video ${videoContext}`
        );

        // Add annotation with video context
        await addAnnotation(annotation, videoContext);

        console.log(
          `✅ [DualVideoPlayer] New drawing annotation created for video ${videoContext}`
        );
      }
    } catch (error) {
      console.error(
        `❌ [DualVideoPlayer] Error handling drawing creation for video ${videoContext}:`,
        error
      );
      showError('Failed to save drawing', error.message);
    }
  };

  const setVideoSize = (width, height, videoContext = 'both') => {
    if (videoContext === 'A' || videoContext === 'both') {
      drawingCanvasA.setVideoSize(width, height);
    }
    if (videoContext === 'B' || videoContext === 'both') {
      drawingCanvasB.setVideoSize(width, height);
    }
  };

  const getAnnotations = (videoContext = 'A') => {
    const annotationSystem =
      videoContext === 'A' ? videoAAnnotations : videoBAnnotations;
    return annotationSystem?.annotations || ref([]);
  };

  const getDrawingCanvas = (videoContext = 'A') => {
    return videoContext === 'A' ? drawingCanvasA : drawingCanvasB;
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

    // Cleanup annotation systems
    videoAAnnotations = null;
    videoBAnnotations = null;
    comparisonAnnotations = null;
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

    // Annotation state
    videoAId,
    videoBId,
    projectId,
    comparisonVideoId,
    currentAnnotationContext,

    // Drawing canvases
    drawingCanvasA,
    drawingCanvasB,

    // Sync methods
    syncSeek,
    syncPlay,
    syncPause,

    // Annotation methods
    initializeAnnotations,
    initializeVideoAnnotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    handleDrawingCreated,
    setCurrentAnnotationContext,
    clearCurrentAnnotationContext,
    setVideoSize,
    getAnnotations,
    getDrawingCanvas,

    // Utility functions
    setupVideoEventListeners,
    removeVideoEventListeners,
    timeToFrame,
    frameToTime,
    updateFrameFromTime,
    cleanup,
  };
}
