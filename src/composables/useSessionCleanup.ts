import { ref, readonly } from 'vue';

/**
 * Centralized session cleanup utility
 * Ensures all session data is properly cleaned up when switching projects
 */
export function useSessionCleanup() {
  const isCleaningUp = ref(false);

  /**
   * Comprehensive session cleanup that clears all session data
   * This should be called before switching to a new project
   */
  const cleanupAllSessionData = async (
    options: {
      // Pose detection instances
      poseLandmarker?: any;
      poseLandmarkerA?: any;
      poseLandmarkerB?: any;

      // Drawing canvas instances
      drawingCanvas?: any;
      drawingCanvasA?: any;
      drawingCanvasB?: any;

      // Dual video player instance
      dualVideoPlayer?: any;

      // Comparison workflow instance
      comparisonWorkflow?: any;

      // Video session instance
      videoSession?: any;

      // Annotation and video state
      annotations?: any;
      videoAnnotations?: any;
      selectedAnnotation?: any;

      // Video player state
      videoState?: any;
      currentVideoId?: any;
      currentComparisonId?: any;

      // Comment and realtime state
      realtimeAnnotations?: any;
      globalComments?: any;
      commentPermissions?: any;
      anonymousSession?: any;

      // Speed calculator instances (accessed through pose landmarkers)
      // These will be cleaned up via pose landmarker cleanup

      // Additional cleanup callbacks
      additionalCleanup?: (() => void | Promise<void>)[];
    } = {}
  ) => {
    if (isCleaningUp.value) {
      console.warn(
        '🧹 [SessionCleanup] Cleanup already in progress, skipping...'
      );
      return;
    }

    try {
      isCleaningUp.value = true;
      console.log(
        '🧹 [SessionCleanup] Starting comprehensive session cleanup...'
      );

      // 1. Clean up pose detection instances
      if (options.poseLandmarker) {
        console.log('🧹 [SessionCleanup] Cleaning up main pose landmarker...');
        try {
          // Disable pose detection first
          if (options.poseLandmarker.disablePoseDetection) {
            await options.poseLandmarker.disablePoseDetection();
          }
          // Reset pose data using the correct method
          if (options.poseLandmarker.reset) {
            options.poseLandmarker.reset();
          }
          // Reset speed calculator through pose landmarker
          if (options.poseLandmarker.speedCalculator?.reset) {
            options.poseLandmarker.speedCalculator.reset();
          }
          if (options.poseLandmarker.speedCalculator?.resetCalibration) {
            options.poseLandmarker.speedCalculator.resetCalibration();
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up main pose landmarker:',
            error
          );
        }
      }

      if (options.poseLandmarkerA) {
        console.log('🧹 [SessionCleanup] Cleaning up pose landmarker A...');
        try {
          // Disable pose detection first
          if (options.poseLandmarkerA.disablePoseDetection) {
            await options.poseLandmarkerA.disablePoseDetection();
          }
          // Reset pose data using the correct method
          if (options.poseLandmarkerA.reset) {
            options.poseLandmarkerA.reset();
          }
          // Reset speed calculator through pose landmarker A
          if (options.poseLandmarkerA.speedCalculator?.reset) {
            options.poseLandmarkerA.speedCalculator.reset();
          }
          if (options.poseLandmarkerA.speedCalculator?.resetCalibration) {
            options.poseLandmarkerA.speedCalculator.resetCalibration();
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up pose landmarker A:',
            error
          );
        }
      }

      if (options.poseLandmarkerB) {
        console.log('🧹 [SessionCleanup] Cleaning up pose landmarker B...');
        try {
          // Disable pose detection first
          if (options.poseLandmarkerB.disablePoseDetection) {
            await options.poseLandmarkerB.disablePoseDetection();
          }
          // Reset pose data using the correct method
          if (options.poseLandmarkerB.reset) {
            options.poseLandmarkerB.reset();
          }
          // Reset speed calculator through pose landmarker B
          if (options.poseLandmarkerB.speedCalculator?.reset) {
            options.poseLandmarkerB.speedCalculator.reset();
          }
          if (options.poseLandmarkerB.speedCalculator?.resetCalibration) {
            options.poseLandmarkerB.speedCalculator.resetCalibration();
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up pose landmarker B:',
            error
          );
        }
      }

      // 2. Clean up drawing canvas
      if (options.drawingCanvas) {
        console.log('🧹 [SessionCleanup] Cleaning up drawing canvas...');
        try {
          options.drawingCanvas.clearAllDrawings();
          options.drawingCanvas.disableDrawingMode();
          // Reset drawing state - add null checks
          if (
            options.drawingCanvas.state &&
            options.drawingCanvas.state.value
          ) {
            options.drawingCanvas.state.value.activeDrawing = null;
            options.drawingCanvas.state.value.isLoadingDrawings = false;
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up drawing canvas:',
            error
          );
        }
      }

      // 3. Clean up dual video player
      if (options.dualVideoPlayer) {
        console.log('🧹 [SessionCleanup] Cleaning up dual video player...');
        try {
          // Reset video URLs
          if (options.dualVideoPlayer.videoAUrl) {
            options.dualVideoPlayer.videoAUrl.value = '';
          }
          if (options.dualVideoPlayer.videoBUrl) {
            options.dualVideoPlayer.videoBUrl.value = '';
          }

          // Clean up dual video player
          if (options.dualVideoPlayer.cleanup) {
            options.dualVideoPlayer.cleanup();
          }

          // Clear annotation context
          if (options.dualVideoPlayer.clearCurrentAnnotationContext) {
            options.dualVideoPlayer.clearCurrentAnnotationContext();
          }

          // Clean up drawing canvases
          if (options.dualVideoPlayer.drawingCanvasA?.clearAllDrawings) {
            options.dualVideoPlayer.drawingCanvasA.clearAllDrawings();
          }
          if (options.dualVideoPlayer.drawingCanvasB?.clearAllDrawings) {
            options.dualVideoPlayer.drawingCanvasB.clearAllDrawings();
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up dual video player:',
            error
          );
        }
      }

      // 4. Clean up comparison workflow
      if (options.comparisonWorkflow) {
        console.log('🧹 [SessionCleanup] Cleaning up comparison workflow...');
        try {
          options.comparisonWorkflow.resetWorkflow();
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up comparison workflow:',
            error
          );
        }
      }

      // 5. Clean up video session
      if (options.videoSession) {
        console.log('🧹 [SessionCleanup] Cleaning up video session...');
        try {
          await options.videoSession.endSession();
          // Additional cleanup if available
          if (options.videoSession.cleanup) {
            options.videoSession.cleanup();
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up video session:',
            error
          );
        }
      }

      // 6. Clean up additional drawing canvases
      if (options.drawingCanvasA) {
        console.log('🧹 [SessionCleanup] Cleaning up drawing canvas A...');
        try {
          options.drawingCanvasA.clearAllDrawings();
          options.drawingCanvasA.disableDrawingMode();
          if (
            options.drawingCanvasA.state &&
            options.drawingCanvasA.state.value
          ) {
            options.drawingCanvasA.state.value.activeDrawing = null;
            options.drawingCanvasA.state.value.isLoadingDrawings = false;
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up drawing canvas A:',
            error
          );
        }
      }

      if (options.drawingCanvasB) {
        console.log('🧹 [SessionCleanup] Cleaning up drawing canvas B...');
        try {
          options.drawingCanvasB.clearAllDrawings();
          options.drawingCanvasB.disableDrawingMode();
          if (
            options.drawingCanvasB.state &&
            options.drawingCanvasB.state.value
          ) {
            options.drawingCanvasB.state.value.activeDrawing = null;
            options.drawingCanvasB.state.value.isLoadingDrawings = false;
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up drawing canvas B:',
            error
          );
        }
      }

      // 7. Clean up annotation state
      if (options.annotations) {
        console.log('🧹 [SessionCleanup] Cleaning up annotations...');
        try {
          if (Array.isArray(options.annotations.value)) {
            options.annotations.value = [];
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up annotations:',
            error
          );
        }
      }

      if (options.videoAnnotations) {
        console.log('🧹 [SessionCleanup] Cleaning up video annotations...');
        try {
          if (options.videoAnnotations.cleanup) {
            options.videoAnnotations.cleanup();
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up video annotations:',
            error
          );
        }
      }

      if (options.selectedAnnotation) {
        console.log('🧹 [SessionCleanup] Clearing selected annotation...');
        try {
          options.selectedAnnotation.value = null;
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error clearing selected annotation:',
            error
          );
        }
      }

      // 8. Clean up video state
      if (options.videoState) {
        console.log('🧹 [SessionCleanup] Resetting video state...');
        try {
          Object.assign(options.videoState, {
            url: '',
            id: 'sample-video-1',
            urlInput: '',
            currentTime: 0,
            duration: 0,
            isPlaying: false,
            dimensions: { width: 1920, height: 1080 },
            type: null,
            currentFrame: 0,
            totalFrames: 0,
            fps: -1,
          });
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error resetting video state:',
            error
          );
        }
      }

      if (options.currentVideoId) {
        console.log('🧹 [SessionCleanup] Clearing current video ID...');
        try {
          options.currentVideoId.value = null;
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error clearing current video ID:',
            error
          );
        }
      }

      if (options.currentComparisonId) {
        console.log('🧹 [SessionCleanup] Clearing current comparison ID...');
        try {
          options.currentComparisonId.value = null;
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error clearing current comparison ID:',
            error
          );
        }
      }

      // 9. Clean up realtime and comment state
      if (options.realtimeAnnotations) {
        console.log('🧹 [SessionCleanup] Cleaning up realtime annotations...');
        try {
          if (options.realtimeAnnotations.cleanup) {
            options.realtimeAnnotations.cleanup();
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up realtime annotations:',
            error
          );
        }
      }

      if (options.globalComments) {
        console.log('🧹 [SessionCleanup] Cleaning up global comments...');
        try {
          if (options.globalComments.cleanup) {
            options.globalComments.cleanup();
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up global comments:',
            error
          );
        }
      }

      if (options.commentPermissions) {
        console.log('🧹 [SessionCleanup] Resetting comment permissions...');
        try {
          options.commentPermissions.value = {
            canComment: false,
            isAnonymous: false,
          };
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error resetting comment permissions:',
            error
          );
        }
      }

      if (options.anonymousSession) {
        console.log('🧹 [SessionCleanup] Clearing anonymous session...');
        try {
          options.anonymousSession.value = null;
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error clearing anonymous session:',
            error
          );
        }
      }

      // 10. Run additional cleanup callbacks
      if (
        options.additionalCleanup &&
        Array.isArray(options.additionalCleanup)
      ) {
        console.log(
          '🧹 [SessionCleanup] Running additional cleanup callbacks...'
        );
        for (const cleanupFn of options.additionalCleanup) {
          try {
            await cleanupFn();
          } catch (error) {
            console.error(
              '❌ [SessionCleanup] Error in additional cleanup callback:',
              error
            );
          }
        }
      }

      console.log(
        '✅ [SessionCleanup] Comprehensive session cleanup completed successfully'
      );
    } catch (error) {
      console.error(
        '❌ [SessionCleanup] Error during comprehensive cleanup:',
        error
      );
      throw error;
    } finally {
      isCleaningUp.value = false;
    }
  };

  /**
   * Quick cleanup for basic session data
   * Used for lighter cleanup scenarios
   */
  const quickCleanup = async (
    options: {
      clearPoseData?: boolean;
      clearDrawings?: boolean;
      endSession?: boolean;
      resetWorkflow?: boolean;
    } = {}
  ) => {
    console.log('🧹 [SessionCleanup] Running quick cleanup...');

    // This is a lighter version that can be extended as needed
    // For now, it's a placeholder for future quick cleanup scenarios

    console.log('✅ [SessionCleanup] Quick cleanup completed');
  };

  /**
   * Cleanup specific to pose detection data
   */
  const cleanupPoseDetection = async (poseLandmarkers: any[]) => {
    console.log('🧹 [SessionCleanup] Cleaning up pose detection data...');

    for (const landmarker of poseLandmarkers) {
      if (landmarker) {
        try {
          // Disable pose detection first
          if (landmarker.disablePoseDetection) {
            await landmarker.disablePoseDetection();
          }
          // Reset pose data using the correct method
          if (landmarker.reset) {
            landmarker.reset();
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up pose landmarker:',
            error
          );
        }
      }
    }

    console.log('✅ [SessionCleanup] Pose detection cleanup completed');
  };

  /**
   * Cleanup specific to drawing data
   */
  const cleanupDrawingData = (drawingCanvas: any) => {
    console.log('🧹 [SessionCleanup] Cleaning up drawing data...');

    if (drawingCanvas) {
      try {
        drawingCanvas.clearAllDrawings();
        drawingCanvas.disableDrawingMode();
      } catch (error) {
        console.error(
          '❌ [SessionCleanup] Error cleaning up drawing data:',
          error
        );
      }
    }

    console.log('✅ [SessionCleanup] Drawing data cleanup completed');
  };

  /**
   * Project switching cleanup - optimized for switching between projects
   * This is called when switching from one project to another
   */
  const cleanupForProjectSwitch = async (
    currentProjectType: 'single' | 'dual',
    newProjectType: 'single' | 'dual',
    options: {
      poseLandmarker?: any;
      poseLandmarkerA?: any;
      poseLandmarkerB?: any;
      drawingCanvas?: any;
      drawingCanvasA?: any;
      drawingCanvasB?: any;
      dualVideoPlayer?: any;
      comparisonWorkflow?: any;
      videoSession?: any;
      annotations?: any;
      selectedAnnotation?: any;
      videoState?: any;
      currentVideoId?: any;
      currentComparisonId?: any;
      additionalCleanup?: (() => void | Promise<void>)[];
    } = {}
  ) => {
    if (isCleaningUp.value) {
      console.warn(
        '🧹 [SessionCleanup] Project switch cleanup already in progress, skipping...'
      );
      return;
    }

    try {
      isCleaningUp.value = true;
      console.log(
        `🧹 [SessionCleanup] Starting project switch cleanup: ${currentProjectType} → ${newProjectType}`
      );

      // Always clean up current video session
      if (options.videoSession) {
        try {
          await options.videoSession.endSession();
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error ending video session:',
            error
          );
        }
      }

      // Clean up pose detection based on current project type
      if (currentProjectType === 'single' && options.poseLandmarker) {
        try {
          if (options.poseLandmarker.disablePoseDetection) {
            await options.poseLandmarker.disablePoseDetection();
          }
          if (options.poseLandmarker.reset) {
            options.poseLandmarker.reset();
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up single pose landmarker:',
            error
          );
        }
      } else if (currentProjectType === 'dual') {
        const landmarkers = [
          options.poseLandmarkerA,
          options.poseLandmarkerB,
        ].filter(Boolean);
        for (const landmarker of landmarkers) {
          try {
            if (landmarker.disablePoseDetection) {
              await landmarker.disablePoseDetection();
            }
            if (landmarker.reset) {
              landmarker.reset();
            }
          } catch (error) {
            console.error(
              '❌ [SessionCleanup] Error cleaning up dual pose landmarker:',
              error
            );
          }
        }
      }

      // Clean up drawing canvases based on current project type
      if (currentProjectType === 'single' && options.drawingCanvas) {
        cleanupDrawingData(options.drawingCanvas);
      } else if (currentProjectType === 'dual') {
        if (options.drawingCanvasA) cleanupDrawingData(options.drawingCanvasA);
        if (options.drawingCanvasB) cleanupDrawingData(options.drawingCanvasB);
      }

      // Clean up dual video player if switching away from dual mode
      if (currentProjectType === 'dual' && options.dualVideoPlayer) {
        try {
          if (options.dualVideoPlayer.cleanup) {
            options.dualVideoPlayer.cleanup();
          }
          if (options.dualVideoPlayer.clearCurrentAnnotationContext) {
            options.dualVideoPlayer.clearCurrentAnnotationContext();
          }
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error cleaning up dual video player:',
            error
          );
        }
      }

      // Reset comparison workflow if switching away from dual mode
      if (currentProjectType === 'dual' && options.comparisonWorkflow) {
        try {
          options.comparisonWorkflow.resetWorkflow();
        } catch (error) {
          console.error(
            '❌ [SessionCleanup] Error resetting comparison workflow:',
            error
          );
        }
      }

      // Clear annotations and selected annotation
      if (options.annotations && Array.isArray(options.annotations.value)) {
        options.annotations.value = [];
      }
      if (options.selectedAnnotation) {
        options.selectedAnnotation.value = null;
      }

      // Reset video state
      if (options.videoState) {
        Object.assign(options.videoState, {
          url: '',
          id: 'sample-video-1',
          urlInput: '',
          currentTime: 0,
          duration: 0,
          isPlaying: false,
          dimensions: { width: 1920, height: 1080 },
          type: null,
          currentFrame: 0,
          totalFrames: 0,
          fps: -1,
        });
      }

      // Clear current IDs
      if (options.currentVideoId) {
        options.currentVideoId.value = null;
      }
      if (options.currentComparisonId) {
        options.currentComparisonId.value = null;
      }

      // Run additional cleanup callbacks
      if (
        options.additionalCleanup &&
        Array.isArray(options.additionalCleanup)
      ) {
        for (const cleanupFn of options.additionalCleanup) {
          try {
            await cleanupFn();
          } catch (error) {
            console.error(
              '❌ [SessionCleanup] Error in additional cleanup callback:',
              error
            );
          }
        }
      }

      console.log(
        `✅ [SessionCleanup] Project switch cleanup completed: ${currentProjectType} → ${newProjectType}`
      );
    } catch (error) {
      console.error(
        '❌ [SessionCleanup] Error during project switch cleanup:',
        error
      );
      throw error;
    } finally {
      isCleaningUp.value = false;
    }
  };

  return {
    isCleaningUp: readonly(isCleaningUp),
    cleanupAllSessionData,
    quickCleanup,
    cleanupPoseDetection,
    cleanupDrawingData,
    cleanupForProjectSwitch,
  };
}

// Export a singleton instance for global use
export const sessionCleanup = useSessionCleanup();
