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

  // Individual video states for independent control
  const videoACurrentTime = ref(0);
  const videoBCurrentTime = ref(0);
  const videoAIsPlaying = ref(false);
  const videoBIsPlaying = ref(false);
  const videoACurrentFrame = ref(0);
  const videoBCurrentFrame = ref(0);

  // Individual video states (for metadata)
  const videoAState = reactive({
    duration: 0,
    fps: -1, // Will be detected from video, -1 means unknown
    totalFrames: 0,
    isLoaded: false,
  });

  const videoBState = reactive({
    duration: 0,
    fps: -1, // Will be detected from video, -1 means unknown
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

  // Individual video control methods
  const seekVideoA = (time) => {
    if (videoARef.value && videoAState.isLoaded) {
      const clampedTime = Math.max(0, Math.min(time, videoAState.duration));
      videoARef.value.currentTime = clampedTime;
      videoACurrentTime.value = clampedTime;
      videoACurrentFrame.value = timeToFrame(clampedTime, 'A');
    }
  };

  const seekVideoB = (time) => {
    if (videoBRef.value && videoBState.isLoaded) {
      const clampedTime = Math.max(0, Math.min(time, videoBState.duration));
      videoBRef.value.currentTime = clampedTime;
      videoBCurrentTime.value = clampedTime;
      videoBCurrentFrame.value = timeToFrame(clampedTime, 'B');
    }
  };

  const playVideoA = async () => {
    if (videoARef.value && videoAState.isLoaded) {
      try {
        await videoARef.value.play();
        videoAIsPlaying.value = true;
      } catch (error) {
        console.error('Failed to play video A:', error);
      }
    }
  };

  const pauseVideoA = () => {
    if (videoARef.value) {
      videoARef.value.pause();
      videoAIsPlaying.value = false;
    }
  };

  const playVideoB = async () => {
    if (videoBRef.value && videoBState.isLoaded) {
      try {
        await videoBRef.value.play();
        videoBIsPlaying.value = true;
      } catch (error) {
        console.error('Failed to play video B:', error);
      }
    }
  };

  const pauseVideoB = () => {
    if (videoBRef.value) {
      videoBRef.value.pause();
      videoBIsPlaying.value = false;
    }
  };

  const stepFrameVideoA = (direction) => {
    if (videoARef.value && videoAState.isLoaded) {
      const currentFrame = videoACurrentFrame.value;
      const newFrame = Math.max(
        0,
        Math.min(currentFrame + direction, videoAState.totalFrames - 1)
      );
      const newTime = frameToTime(newFrame, 'A');
      seekVideoA(newTime);
    }
  };

  const stepFrameVideoB = (direction) => {
    if (videoBRef.value && videoBState.isLoaded) {
      const currentFrame = videoBCurrentFrame.value;
      const newFrame = Math.max(
        0,
        Math.min(currentFrame + direction, videoBState.totalFrames - 1)
      );
      const newTime = frameToTime(newFrame, 'B');
      seekVideoB(newTime);
    }
  };

  // Automatic state synchronization functions
  const setupVideoEventListeners = (videoElement, videoState, videoId) => {
    if (!videoElement || eventListeners.has(videoElement)) {
      return;
    }

    const listeners = {
      timeupdate: () => {
        // Update individual video states
        if (videoElement === videoARef.value) {
          videoACurrentTime.value = videoElement.currentTime;
          videoACurrentFrame.value = timeToFrame(videoElement.currentTime, 'A');
        } else if (videoElement === videoBRef.value) {
          videoBCurrentTime.value = videoElement.currentTime;
          videoBCurrentFrame.value = timeToFrame(videoElement.currentTime, 'B');
        }
      },

      loadedmetadata: () => {
        console.log(`🎬 [${videoId}] loadedmetadata event fired`);
        console.log(
          `🎬 [${videoId}] readyState: ${videoElement.readyState}, duration: ${videoElement.duration}`
        );

        // Safari fix: Check if duration is valid (not NaN or Infinity)
        const isValidDuration =
          videoElement.duration &&
          isFinite(videoElement.duration) &&
          videoElement.duration > 0;

        if (isValidDuration) {
          videoState.duration = videoElement.duration;
          videoState.isLoaded = true;
          console.log(
            `🎬 [${videoId}] Video loaded - duration: ${videoElement.duration}, isLoaded: ${videoState.isLoaded}`
          );
        } else {
          console.log(
            `🎬 [${videoId}] Invalid duration detected, waiting for loadeddata event`
          );
          videoState.isLoaded = false;
          return; // Don't proceed with duration calculations yet
        }

        // Detect FPS for this specific video
        let detectedFPS = 30; // fallback

        // Try to detect actual FPS using frame sampling method
        const commonFPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

        // Method 1: Try to use getVideoPlaybackQuality if available (Chrome/Edge)
        if (videoElement.getVideoPlaybackQuality) {
          const quality = videoElement.getVideoPlaybackQuality();
          if (quality.totalVideoFrames && videoElement.currentTime > 0) {
            const calculatedFPS =
              quality.totalVideoFrames / videoElement.currentTime;
            // Find the closest common FPS
            detectedFPS = commonFPS.reduce((prev, curr) =>
              Math.abs(curr - calculatedFPS) < Math.abs(prev - calculatedFPS)
                ? curr
                : prev
            );
            console.log(
              `🎬 [${videoId}] Detected FPS using getVideoPlaybackQuality: ${detectedFPS}`
            );
          }
        }

        // Method 2: Try to estimate from duration and common frame rates
        if (detectedFPS === 30 && videoState.duration > 0) {
          // Test common frame rates to see which gives the most reasonable total frame count
          const testResults = commonFPS.map((testFPS) => {
            const totalFrames = Math.round(videoState.duration * testFPS);
            // Prefer frame rates that result in round numbers or common video lengths
            const score =
              totalFrames % 1000 === 0 ? 10 : totalFrames % 100 === 0 ? 5 : 1;
            return { fps: testFPS, totalFrames, score };
          });

          // Sort by score and pick the best match
          testResults.sort((a, b) => b.score - a.score);
          detectedFPS = testResults[0].fps;
          console.log(
            `🎬 [${videoId}] Estimated FPS from duration: ${detectedFPS} (${testResults[0].totalFrames} total frames)`
          );
        }

        videoState.fps = detectedFPS;
        videoState.totalFrames = Math.round(
          videoState.duration * videoState.fps
        );

        console.log(
          `🎬 [${videoId}] Final FPS: ${videoState.fps}, Total frames: ${videoState.totalFrames}, Duration: ${videoState.duration}s`
        );

        // No need for shared duration calculations - each video is independent
        console.log(`🎬 [${videoId}] Video loaded independently`);
      },

      loadeddata: () => {
        console.log(`🎬 [${videoId}] loadeddata event fired`);
        console.log(
          `🎬 [${videoId}] readyState: ${videoElement.readyState}, duration: ${videoElement.duration}`
        );

        // Safari fallback: If metadata didn't load properly, try again here
        if (!videoState.isLoaded) {
          const isValidDuration =
            videoElement.duration &&
            isFinite(videoElement.duration) &&
            videoElement.duration > 0;

          if (isValidDuration) {
            console.log(
              `🎬 [${videoId}] Duration now available in loadeddata: ${videoElement.duration}`
            );
            videoState.duration = videoElement.duration;
            videoState.isLoaded = true;

            // Detect FPS for this specific video
            let detectedFPS = 30; // fallback

            // Try to detect actual FPS using frame sampling method
            const commonFPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

            // Method 1: Try to use getVideoPlaybackQuality if available (Chrome/Edge)
            if (videoElement.getVideoPlaybackQuality) {
              const quality = videoElement.getVideoPlaybackQuality();
              if (quality.totalVideoFrames && videoElement.currentTime > 0) {
                const calculatedFPS =
                  quality.totalVideoFrames / videoElement.currentTime;
                // Find the closest common FPS
                detectedFPS = commonFPS.reduce((prev, curr) =>
                  Math.abs(curr - calculatedFPS) <
                  Math.abs(prev - calculatedFPS)
                    ? curr
                    : prev
                );
                console.log(
                  `🎬 [${videoId}] Detected FPS using getVideoPlaybackQuality: ${detectedFPS}`
                );
              }
            }

            // Method 2: Try to estimate from duration and common frame rates
            if (detectedFPS === 30 && videoState.duration > 0) {
              // Test common frame rates to see which gives the most reasonable total frame count
              const testResults = commonFPS.map((testFPS) => {
                const totalFrames = Math.round(videoState.duration * testFPS);
                // Prefer frame rates that result in round numbers or common video lengths
                const score =
                  totalFrames % 1000 === 0
                    ? 10
                    : totalFrames % 100 === 0
                    ? 5
                    : 1;
                return { fps: testFPS, totalFrames, score };
              });

              // Sort by score and pick the best match
              testResults.sort((a, b) => b.score - a.score);
              detectedFPS = testResults[0].fps;
              console.log(
                `🎬 [${videoId}] Estimated FPS from duration: ${detectedFPS} (${testResults[0].totalFrames} total frames)`
              );
            }

            videoState.fps = detectedFPS;
            videoState.totalFrames = Math.round(
              videoState.duration * videoState.fps
            );

            console.log(
              `🎬 [${videoId}] Final FPS: ${videoState.fps}, Total frames: ${videoState.totalFrames}, Duration: ${videoState.duration}s`
            );

            // No shared duration calculations needed
            console.log(`🎬 [${videoId}] Video data loaded independently`);
          }
        }
      },

      play: () => {
        console.log(`🎬 [${videoId}] play event fired`);
        if (videoElement === videoARef.value) {
          videoAIsPlaying.value = true;
        } else if (videoElement === videoBRef.value) {
          videoBIsPlaying.value = true;
        }
      },

      pause: () => {
        console.log(`🎬 [${videoId}] pause event fired`);
        if (videoElement === videoARef.value) {
          videoAIsPlaying.value = false;
        } else if (videoElement === videoBRef.value) {
          videoBIsPlaying.value = false;
        }
      },

      seeking: () => {
        // No syncing needed - videos are independent
        console.log(`🎬 [${videoId}] seeking independently`);
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
    console.log(
      '🎬 [videoARef] Watch triggered - old:',
      !!oldVideo,
      'new:',
      !!newVideo
    );
    if (oldVideo) {
      removeVideoEventListeners(oldVideo);
    }
    if (newVideo) {
      console.log('🎬 [videoARef] Setting up event listeners for Video A');
      setupVideoEventListeners(newVideo, videoAState, 'A');
    }
  });

  watch(videoBRef, (newVideo, oldVideo) => {
    console.log(
      '🎬 [videoBRef] Watch triggered - old:',
      !!oldVideo,
      'new:',
      !!newVideo
    );
    if (oldVideo) {
      removeVideoEventListeners(oldVideo);
    }
    if (newVideo) {
      console.log('🎬 [videoBRef] Setting up event listeners for Video B');
      setupVideoEventListeners(newVideo, videoBState, 'B');
    }
  });

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

    // Setup drawing canvas frame synchronization for individual videos
    watch(videoACurrentFrame, (newFrame) => {
      drawingCanvasA.currentFrame.value = newFrame;
    });

    watch(videoBCurrentFrame, (newFrame) => {
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

  // Watch for frame changes and sync to canvases for both videos
  watch(videoACurrentFrame, () => {
    if (comparisonAnnotations?.annotations?.value) {
      syncAnnotationsToCanvases();
    }
  });

  watch(videoBCurrentFrame, () => {
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

    // Individual video states
    videoACurrentTime,
    videoBCurrentTime,
    videoAIsPlaying,
    videoBIsPlaying,
    videoACurrentFrame,
    videoBCurrentFrame,

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

    // Independent video control methods
    seekVideoA,
    seekVideoB,
    playVideoA,
    pauseVideoA,
    playVideoB,
    pauseVideoB,
    stepFrameVideoA,
    stepFrameVideoB,

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
    cleanup,
  };
}
