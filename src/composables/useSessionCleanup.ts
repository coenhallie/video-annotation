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

      // Drawing canvas instance
      drawingCanvas?: any;

      // Dual video player instance
      dualVideoPlayer?: any;

      // Comparison workflow instance
      comparisonWorkflow?: any;

      // Video session instance
      videoSession?: any;

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
          await options.poseLandmarker.disablePoseDetection();
          options.poseLandmarker.clearAllPoses();
          if (options.poseLandmarker.cleanup) {
            options.poseLandmarker.cleanup();
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
          await options.poseLandmarkerA.disablePoseDetection();
          options.poseLandmarkerA.clearAllPoses();
          if (options.poseLandmarkerA.cleanup) {
            options.poseLandmarkerA.cleanup();
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
          await options.poseLandmarkerB.disablePoseDetection();
          options.poseLandmarkerB.clearAllPoses();
          if (options.poseLandmarkerB.cleanup) {
            options.poseLandmarkerB.cleanup();
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

      // 6. Run additional cleanup callbacks
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
          await landmarker.disablePoseDetection();
          landmarker.clearAllPoses();
          if (landmarker.cleanup) {
            landmarker.cleanup();
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

  return {
    isCleaningUp: readonly(isCleaningUp),
    cleanupAllSessionData,
    quickCleanup,
    cleanupPoseDetection,
    cleanupDrawingData,
  };
}

// Export a singleton instance for global use
export const sessionCleanup = useSessionCleanup();
