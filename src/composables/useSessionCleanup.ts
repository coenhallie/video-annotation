import { ref, readonly } from 'vue';

/** Structural type for drawing canvas instances used during cleanup */
interface DrawingCanvasInstance {
  clearAllDrawings: () => void;
  disableDrawingMode: () => void;
  state?: { value: { activeDrawing: unknown; isLoadingDrawings: boolean } };
}

/** Structural type for dual video player instances used during cleanup */
interface DualVideoPlayerInstance {
  videoAUrl?: { value: string };
  videoBUrl?: { value: string };
  cleanup?: () => void;
  clearCurrentAnnotationContext?: () => void;
  drawingCanvasA?: { clearAllDrawings: () => void };
  drawingCanvasB?: { clearAllDrawings: () => void };
}

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


      // Drawing canvas instances
      drawingCanvas?: DrawingCanvasInstance;
      drawingCanvasA?: DrawingCanvasInstance;
      drawingCanvasB?: DrawingCanvasInstance;

      // Dual video player instance
      dualVideoPlayer?: DualVideoPlayerInstance;

      // Comparison workflow instance
      comparisonWorkflow?: { resetWorkflow: () => void };

      // Video session instance
      videoSession?: { endSession: () => Promise<void>; cleanup?: () => void };

      // Annotation and video state
      annotations?: { value: unknown[] };
      videoAnnotations?: { cleanup?: () => void };
      selectedAnnotation?: { value: unknown };

      // Video player state
      videoState?: Record<string, unknown>;
      currentVideoId?: { value: unknown };
      currentComparisonId?: { value: unknown };

      // Comment and realtime state
      realtimeAnnotations?: { cleanup?: () => void };
      globalComments?: { cleanup?: () => void };
      commentPermissions?: { value: unknown };
      anonymousSession?: { value: unknown };



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
            options.annotations.value.splice(
              0,
              options.annotations.value.length
            );
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
   * Cleanup specific to drawing data
   */
  const cleanupDrawingData = (drawingCanvas: DrawingCanvasInstance | undefined) => {
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

      drawingCanvas?: DrawingCanvasInstance;
      drawingCanvasA?: DrawingCanvasInstance;
      drawingCanvasB?: DrawingCanvasInstance;
      dualVideoPlayer?: DualVideoPlayerInstance;
      comparisonWorkflow?: { resetWorkflow: () => void };
      videoSession?: { endSession: () => Promise<void>; cleanup?: () => void };
      annotations?: { value: unknown[] };
      selectedAnnotation?: { value: unknown };
      videoState?: Record<string, unknown>;
      currentVideoId?: { value: unknown };
      currentComparisonId?: { value: unknown };
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
        // Check if the array is readonly and handle accordingly
        try {
          options.annotations.value.splice(0, options.annotations.value.length);
        } catch (error) {
          // If it's readonly, we can't modify it directly
          console.warn('Cannot clear readonly annotations array:', error);
        }
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
    cleanupDrawingData,
    cleanupForProjectSwitch,
  };
}

// Export a singleton instance for global use
export const sessionCleanup = useSessionCleanup();
