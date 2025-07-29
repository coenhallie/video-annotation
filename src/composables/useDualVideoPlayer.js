import { ref, reactive, watch } from 'vue';
import { useNotifications } from './useNotifications.ts';
import { useVideoAnnotations } from './useVideoAnnotations.ts';
import { useDrawingCanvas } from './useDrawingCanvas.ts';
import { AnnotationService } from '../services/annotationService.ts';

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
  const fps = ref(30); // Primary FPS (from Video A by default)

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

  // FPS compatibility tracking
  const fpsCompatible = ref(true);
  const primaryVideo = ref('A'); // Which video drives the timeline

  // Annotation system integration
  const videoAId = ref('');
  const videoBId = ref('');
  const projectId = ref(null);
  const comparisonVideoId = ref(null);

  // Drawing canvas instances for both videos
  const drawingCanvasA = useDrawingCanvas();
  const drawingCanvasB = useDrawingCanvas();

  // Drawing canvas component references (will be set by UnifiedVideoPlayer)
  const drawingCanvasARef = ref(null);
  const drawingCanvasBRef = ref(null);

  // Annotation composables for both videos
  let videoAAnnotations = null;
  let videoBAnnotations = null;
  let comparisonAnnotations = null;

  // Event listeners for automatic synchronization
  const eventListeners = new Map();

  // Frame calculation utilities
  const timeToFrame = (timeInSeconds, videoContext = null) => {
    const targetFps =
      videoContext === 'A'
        ? videoAState.fps
        : videoContext === 'B'
        ? videoBState.fps
        : fps.value;
    return Math.round(timeInSeconds * targetFps);
  };

  const frameToTime = (frameNumber, videoContext = null) => {
    const targetFps =
      videoContext === 'A'
        ? videoAState.fps
        : videoContext === 'B'
        ? videoBState.fps
        : fps.value;
    return frameNumber / targetFps;
  };

  // FPS compatibility check
  const checkFpsCompatibility = () => {
    if (videoAState.isLoaded && videoBState.isLoaded) {
      const fpsDifference = Math.abs(videoAState.fps - videoBState.fps);
      fpsCompatible.value = fpsDifference < 0.1; // Allow small differences

      // Set primary video to the one with higher FPS for better precision
      primaryVideo.value = videoAState.fps >= videoBState.fps ? 'A' : 'B';
      fps.value =
        primaryVideo.value === 'A' ? videoAState.fps : videoBState.fps;
    }
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
        }
      },

      loadedmetadata: () => {
        videoState.duration = videoElement.duration;
        videoState.isLoaded = true;

        // Detect FPS for this specific video
        // Default to 30 FPS but try to detect actual FPS
        videoState.fps = 30; // Will be enhanced with actual detection
        videoState.totalFrames = Math.round(
          videoState.duration * videoState.fps
        );

        // Update shared duration to the shorter of the two videos to keep them in sync
        // Only update if both videos have loaded their metadata
        if (videoAState.duration > 0 && videoBState.duration > 0) {
          const minDuration = Math.min(
            videoAState.duration,
            videoBState.duration
          );
          duration.value = minDuration;

          // Check FPS compatibility and set primary video
          checkFpsCompatibility();

          // Calculate total frames using primary video's FPS
          totalFrames.value = Math.round(minDuration * fps.value);
        } else if (videoAState.duration > 0 && videoBState.duration === 0) {
          // Only video A has loaded, use its duration temporarily
          duration.value = videoAState.duration;
          fps.value = videoAState.fps;
          totalFrames.value = Math.round(
            videoAState.duration * videoAState.fps
          );
        } else if (videoBState.duration > 0 && videoAState.duration === 0) {
          // Only video B has loaded, use its duration temporarily
          duration.value = videoBState.duration;
          fps.value = videoBState.fps;
          totalFrames.value = Math.round(
            videoBState.duration * videoBState.fps
          );
        }
      },

      play: () => {
        isPlaying.value = true;
      },

      pause: () => {
        isPlaying.value = false;
      },

      seeking: () => {
        // Prevent infinite loop - don't sync if we're already in a sync operation
        if (isSyncing) {
          return;
        }

        // Sync the other video when one is seeking
        if (videoElement === videoARef.value && videoBRef.value) {
          isSyncing = true;
          videoBRef.value.currentTime = videoElement.currentTime;
          // Reset flag after a short delay to allow the seek to complete
          setTimeout(() => {
            isSyncing = false;
          }, 50);
        } else if (videoElement === videoBRef.value && videoARef.value) {
          isSyncing = true;
          videoARef.value.currentTime = videoElement.currentTime;
          // Reset flag after a short delay to allow the seek to complete
          setTimeout(() => {
            isSyncing = false;
          }, 50);
        }
      },

      error: (event) => {
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

  // Debouncing for smooth scrubbing
  let seekTimeout = null;
  const SEEK_DEBOUNCE_MS = 16; // ~60fps for smooth scrubbing

  // Prevent infinite loop in seeking synchronization
  let isSyncing = false;

  // Synchronization methods
  const syncSeek = (time, immediate = false) => {
    try {
      if (!videoARef.value && !videoBRef.value) {
        return;
      }

      // Clamp time to valid range - use the shorter duration to keep videos in sync
      const minDuration = Math.min(videoAState.duration, videoBState.duration);
      const clampedTime = Math.max(0, Math.min(time, minDuration));

      // Update shared state immediately for responsive UI
      currentTime.value = clampedTime;

      // Debounce actual video seeking for smooth scrubbing
      if (seekTimeout) {
        clearTimeout(seekTimeout);
      }

      const performSeek = () => {
        // Set sync flag to prevent circular synchronization
        isSyncing = true;

        // Seek both videos with frame-accurate positioning
        if (videoARef.value && videoAState.isLoaded) {
          // For Video A, use its specific FPS for frame accuracy
          const frameA = timeToFrame(clampedTime, 'A');
          const accurateTimeA = frameToTime(frameA, 'A');
          videoARef.value.currentTime = accurateTimeA;
        }

        if (videoBRef.value && videoBState.isLoaded) {
          // For Video B, use its specific FPS for frame accuracy
          const frameB = timeToFrame(clampedTime, 'B');
          const accurateTimeB = frameToTime(frameB, 'B');
          videoBRef.value.currentTime = accurateTimeB;
        }

        // Reset sync flag after seeks complete
        setTimeout(() => {
          isSyncing = false;
        }, 100);
      };

      if (immediate) {
        performSeek();
      } else {
        seekTimeout = setTimeout(performSeek, SEEK_DEBOUNCE_MS);
      }
    } catch (error) {
      showError(
        'Failed to synchronize video seeking',
        'Please try again or check your video files.'
      );
    }
  };

  const syncPlay = async () => {
    try {
      if (!videoARef.value && !videoBRef.value) {
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
      }
    } catch (error) {
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
        return;
      }

      if (videoARef.value && videoAState.isLoaded) {
        videoARef.value.pause();
      }
      if (videoBRef.value && videoBState.isLoaded) {
        videoBRef.value.pause();
      }

      isPlaying.value = false;
    } catch (error) {
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
    // Set video IDs and project context
    videoAId.value = videoAData.videoId || videoAData.videoId || 'video-a';
    videoBId.value = videoBData.videoId || videoBData.videoId || 'video-b';
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
  };

  const initializeVideoAnnotations = async (videoAData, videoBData) => {
    if (!videoAAnnotations || !videoBAnnotations) {
      return;
    }

    try {
      // Initialize both video annotation systems
      await Promise.all([
        videoAAnnotations.initializeVideo(videoAData),
        videoBAnnotations.initializeVideo(videoBData),
      ]);
    } catch (error) {
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
      return newAnnotation;
    } catch (error) {
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
      return updatedAnnotation;
    } catch (error) {
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
    } catch (error) {
      showError('Failed to delete annotation', error.message);
      throw error;
    }
  };

  // Track current annotation context for drawing mode
  const currentAnnotationContext = ref(null);

  const setCurrentAnnotationContext = (annotation) => {
    currentAnnotationContext.value = annotation;
  };

  const clearCurrentAnnotationContext = () => {
    const previousId = currentAnnotationContext.value?.id;
    const previousContext = currentAnnotationContext.value;

    // CANVAS PERSISTENCE FIX: Store current canvas state before clearing context
    const canvasStateBeforeClear = {
      canvasAHasDrawings: drawingCanvasARef.value
        ? drawingCanvasARef.value.hasDrawingsOnCurrentFrame()
        : false,
      canvasBHasDrawings: drawingCanvasBRef.value
        ? drawingCanvasBRef.value.hasDrawingsOnCurrentFrame()
        : false,
      currentFrame: currentFrame.value,
    };

    currentAnnotationContext.value = null;

    // CANVAS PERSISTENCE FIX: Verify canvas state is preserved after context clearing
    setTimeout(() => {
      const canvasStateAfterClear = {
        canvasAHasDrawings: drawingCanvasARef.value
          ? drawingCanvasARef.value.hasDrawingsOnCurrentFrame()
          : false,
        canvasBHasDrawings: drawingCanvasBRef.value
          ? drawingCanvasBRef.value.hasDrawingsOnCurrentFrame()
          : false,
        currentFrame: currentFrame.value,
      };
    }, 50);
  };

  // Set canvas component references
  const setCanvasRefs = (canvasARef, canvasBRef) => {
    drawingCanvasARef.value = canvasARef;
    drawingCanvasBRef.value = canvasBRef;
  };

  // Drawing session management for grouping strokes
  const currentDrawingSession = ref(null);
  const drawingSessionTimeout = ref(null);

  // Session persistence key
  const SESSION_STORAGE_KEY = 'dual-video-drawing-session';

  // Load drawing session from localStorage on initialization
  const loadDrawingSessionFromStorage = () => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const sessionData = JSON.parse(stored);
        // Only restore if the session is recent (within 5 minutes)
        const now = Date.now();
        if (now - sessionData.timestamp < 5 * 60 * 1000) {
          currentDrawingSession.value = sessionData.session;
          return true;
        } else {
          // Clear expired session
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    } catch (error) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    return false;
  };

  // Save drawing session to localStorage
  const saveDrawingSessionToStorage = () => {
    try {
      if (currentDrawingSession.value) {
        const sessionData = {
          session: currentDrawingSession.value,
          timestamp: Date.now(),
        };
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (error) {}
  };

  // Clear drawing session from storage
  const clearDrawingSessionFromStorage = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  // Sync comparison annotations to drawing canvases
  const syncAnnotationsToCanvases = () => {
    if (!comparisonAnnotations?.annotations?.value) return;

    const annotations = comparisonAnnotations.annotations.value;

    // Filter drawing annotations - check both 'type' and 'annotationType' fields
    const drawingAnnotations = annotations.filter(
      (annotation) =>
        (annotation.type === 'drawing' ||
          annotation.annotationType === 'drawing') &&
        annotation.drawingData
    );

    // Create separate annotation arrays for Video A and Video B
    const annotationsA = [];
    const annotationsB = [];

    drawingAnnotations.forEach((annotation) => {
      // FIX: Handle both nested structure (legacy) and flat structure with videoContext
      if (annotation.drawingData?.drawingA) {
        // Legacy nested structure
        annotationsA.push({
          ...annotation,
          drawingData: annotation.drawingData.drawingA,
          annotationType: 'drawing',
        });
      } else if (annotation.drawingData?.drawingB) {
        // Legacy nested structure
        annotationsB.push({
          ...annotation,
          drawingData: annotation.drawingData.drawingB,
          annotationType: 'drawing',
        });
      } else if (annotation.drawingData && annotation.videoContext) {
        // Current flat structure with videoContext
        if (annotation.videoContext === 'video_a') {
          annotationsA.push({
            ...annotation,
            annotationType: 'drawing',
          });
        } else if (annotation.videoContext === 'video_b') {
          annotationsB.push({
            ...annotation,
            annotationType: 'drawing',
          });
        }
      }
    });

    console.log('🎨 [syncAnnotationsToCanvases] Syncing drawings:', {
      totalDrawingAnnotations: drawingAnnotations.length,
      videoADrawings: annotationsA.length,
      videoBDrawings: annotationsB.length,
    });

    // Load drawings into canvas instances
    drawingCanvasA.loadDrawingsFromAnnotations(annotationsA);
    drawingCanvasB.loadDrawingsFromAnnotations(annotationsB);
  };

  // New function to handle annotation updates with drawing data
  const updateAnnotationWithDrawing = async (drawingDataA, drawingDataB) => {
    if (!currentAnnotationContext.value) {
      return null;
    }

    try {
      // Prepare the updated annotation data
      const updatedAnnotation = { ...currentAnnotationContext.value };

      // Initialize drawingData if it doesn't exist
      if (!updatedAnnotation.drawingData) {
        updatedAnnotation.drawingData = {};
      }

      // Update drawing data for each video context if there's drawing data
      if (drawingDataA && drawingDataA.paths && drawingDataA.paths.length > 0) {
        updatedAnnotation.drawingData.drawingA = drawingDataA;
      }

      if (drawingDataB && drawingDataB.paths && drawingDataB.paths.length > 0) {
        updatedAnnotation.drawingData.drawingB = drawingDataB;
      }

      // Update the annotation in the database
      const result = await AnnotationService.updateAnnotation(
        currentAnnotationContext.value.id,
        updatedAnnotation
      );

      // Clear the annotation context after successful update
      clearCurrentAnnotationContext();

      return result;
    } catch (error) {
      throw error;
    }
  };

  const handleDrawingCreated = async (
    drawing,
    videoContext = 'A',
    userId = null
  ) => {
    try {
      // Clear any existing timeout
      if (drawingSessionTimeout.value) {
        clearTimeout(drawingSessionTimeout.value);
      }

      // Note: Removed premature update logic for existing annotation context
      // Updates should only happen when the user clicks 'Save'

      // Store the drawing data in memory without saving to database yet
      // This implements the deferred save pattern like text annotations
      if (
        currentDrawingSession.value &&
        currentDrawingSession.value.frame === drawing.frame &&
        currentDrawingSession.value.videoContext === videoContext
      ) {
        // Add to existing drawing session (accumulate strokes)
        // Merge paths into the session drawing
        currentDrawingSession.value.drawing.paths.push(...drawing.paths);

        // Save updated session to storage
        saveDrawingSessionToStorage();
      } else {
        // Start new drawing session (in memory only)
        // Start new session with the drawing data
        currentDrawingSession.value = {
          id: Date.now(),
          drawing: { ...drawing }, // Copy the drawing
          frame: drawing.frame,
          videoContext: videoContext,
        };

        // Save new session to storage
        saveDrawingSessionToStorage();
      }

      // Clear any existing timeout
      if (drawingSessionTimeout.value) {
        clearTimeout(drawingSessionTimeout.value);
      }

      // Set timeout to end session after 3 seconds of inactivity
      // This gives users time to continue drawing without losing their session
      drawingSessionTimeout.value = setTimeout(() => {
        currentDrawingSession.value = null;
        drawingSessionTimeout.value = null;
        // Clear from storage when session ends
        clearDrawingSessionFromStorage();
      }, 3000);

      // The drawing is already visible on the canvas since it was created there
    } catch (error) {
      showError('Failed to save drawing', error.message);
    }
  };

  // Get current drawing session for annotation capture
  const getCurrentDrawingSession = () => {
    return currentDrawingSession.value;
  };

  // Function to save the current drawing session to the database
  const saveCurrentDrawingSession = async () => {
    if (!currentDrawingSession.value) {
      return null;
    }

    try {
      const { drawing, videoContext, frame } = currentDrawingSession.value;

      // Create annotation data with drawing for the specific video
      const drawingCanvas =
        videoContext === 'A' ? drawingCanvasA : drawingCanvasB;
      const drawingKey = videoContext === 'A' ? 'drawingA' : 'drawingB';

      // Use the drawing canvas to convert drawing to annotation format
      const baseAnnotation = drawingCanvas.convertDrawingToAnnotation(
        drawing,
        null, // No individual video_id for comparison annotations
        userId || 'user', // Use provided userId or fallback
        'Drawing Annotation',
        `Drawing on frame ${frame} - Video ${videoContext}`
      );

      // FIX: Use the correct flat drawingData structure from baseAnnotation
      // The baseAnnotation already has the correct structure with drawingData and annotationType
      const annotation = {
        ...baseAnnotation,
        // Keep the original flat drawingData structure from convertDrawingToAnnotation
        // Don't override with nested structure
      };

      // Create comparison annotation
      const dbVideoContext =
        videoContext === 'A'
          ? 'video_a'
          : videoContext === 'B'
          ? 'video_b'
          : 'comparison';

      const createdAnnotation =
        await AnnotationService.createComparisonAnnotation(
          comparisonVideoId.value,
          annotation,
          userId || 'user',
          dbVideoContext,
          frame,
          projectId.value
        );

      // Clear the session after successful save
      currentDrawingSession.value = null;
      if (drawingSessionTimeout.value) {
        clearTimeout(drawingSessionTimeout.value);
        drawingSessionTimeout.value = null;
      }
      // Clear from storage after successful save
      clearDrawingSessionFromStorage();

      return createdAnnotation;
    } catch (error) {
      showError('Failed to save drawing', error.message);
      return null;
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

  // Watch for annotation changes and sync to canvases
  watch(
    () => comparisonAnnotations?.annotations?.value,
    () => {
      if (comparisonAnnotations?.annotations?.value) {
        syncAnnotationsToCanvases();
      }
    },
    { deep: true }
  );

  // Watch for frame changes and sync to canvases
  watch(currentFrame, () => {
    if (comparisonAnnotations?.annotations?.value) {
      syncAnnotationsToCanvases();
    }
  });

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

    // FPS compatibility
    fpsCompatible,
    primaryVideo,

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
    getCurrentDrawingSession,
    saveCurrentDrawingSession,
    updateAnnotationWithDrawing,
    setCurrentAnnotationContext,
    clearCurrentAnnotationContext,
    setCanvasRefs,
    syncAnnotationsToCanvases,
    setVideoSize,
    getAnnotations,
    getDrawingCanvas,

    // Session management
    loadDrawingSessionFromStorage,
    saveDrawingSessionToStorage,
    clearDrawingSessionFromStorage,

    // Utility functions
    setupVideoEventListeners,
    removeVideoEventListeners,
    timeToFrame,
    frameToTime,
    checkFpsCompatibility,
    cleanup,
  };
}
