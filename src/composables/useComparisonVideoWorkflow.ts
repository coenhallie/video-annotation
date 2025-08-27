import { ref, computed, readonly } from 'vue';
import { ComparisonVideoService } from '../services/comparisonVideoService';
import { AnnotationService } from '../services/annotationService';
import { useAuth } from './useAuth';
import { useNotifications } from './useNotifications';
import type {
  Video,
  ComparisonVideo,
  Annotation,
  VideoContext,
} from '../types/database';

export function useComparisonVideoWorkflow() {
  const { user } = useAuth();
  const { success, error: notifyError, warning } = useNotifications();

  // Workflow state
  const workflowStep = ref<
    'select' | 'configure' | 'create' | 'load' | 'ready'
  >('select');
  const isProcessing = ref(false);
  const error = ref<string | null>(null);

  // Selection state
  const selectedVideoA = ref<Video | null>(null);
  const selectedVideoB = ref<Video | null>(null);

  // Configuration state
  const comparisonTitle = ref('');
  const comparisonDescription = ref('');
  const shouldSave = ref(true);

  // Comparison video state
  const currentComparison = ref<ComparisonVideo | null>(null);
  const comparisonAnnotations = ref<Annotation[]>([]);
  const videoAAnnotations = ref<Annotation[]>([]);
  const videoBAnnotations = ref<Annotation[]>([]);

  // Computed properties
  const canProceed = computed(() => {
    return (
      selectedVideoA.value &&
      selectedVideoB.value &&
      selectedVideoA.value.id !== selectedVideoB.value.id
    );
  });

  const defaultTitle = computed(() => {
    if (!selectedVideoA.value || !selectedVideoB.value) return '';
    return `${selectedVideoA.value.title} vs ${selectedVideoB.value.title}`;
  });

  const isReady = computed(() => {
    return workflowStep.value === 'ready' && currentComparison.value;
  });

  const hasAnnotations = computed(() => {
    return (
      comparisonAnnotations.value.length > 0 ||
      videoAAnnotations.value.length > 0 ||
      videoBAnnotations.value.length > 0
    );
  });

  /**
   * Step 1: Select videos for comparison
   */
  const selectVideoA = (video: Video) => {
    if (selectedVideoB.value?.id === video.id) {
      warning('Cannot select the same video for both sides');
      return;
    }
    selectedVideoA.value = video;
    updateWorkflowStep();
  };

  const selectVideoB = (video: Video) => {
    if (selectedVideoA.value?.id === video.id) {
      warning('Cannot select the same video for both sides');
      return;
    }
    selectedVideoB.value = video;
    updateWorkflowStep();
  };

  /**
   * Step 2: Configure comparison (if saving)
   */
  const configureComparison = (save: boolean = true) => {
    shouldSave.value = save;
    if (save) {
      workflowStep.value = 'configure';
      comparisonTitle.value = comparisonTitle.value || defaultTitle.value;
    } else {
      // Skip configuration and go directly to comparison
      startDirectComparison();
    }
  };

  /**
   * Step 3: Create and save comparison video
   */
  const createComparisonVideo = async () => {
    if (!canProceed.value || !user.value) {
      error.value = 'Invalid selection or user not authenticated';
      return false;
    }

    isProcessing.value = true;
    error.value = null;
    workflowStep.value = 'create';

    try {
      // Validate input
      if (!comparisonTitle.value.trim()) {
        throw new Error('Comparison title is required');
      }

      // Create comparison video
      const comparisonVideo =
        await ComparisonVideoService.createComparisonVideo({
          title: comparisonTitle.value.trim(),
          description: comparisonDescription.value.trim() || null,
          videoAId: selectedVideoA.value!.id,
          videoBId: selectedVideoB.value!.id,
          userId: user.value?.id || null,
          videoA: selectedVideoA.value!,
          videoB: selectedVideoB.value!,
        });

      // Convert ComparisonVideoRecord to ComparisonVideo type
      const typedComparison: ComparisonVideo = {
        id: comparisonVideo.id,
        userId: comparisonVideo.userId || '',
        title: comparisonVideo.title || '',
        ...(comparisonVideo.description && {
          description: comparisonVideo.description,
        }),
        videoAId: comparisonVideo.videoAId,
        videoBId: comparisonVideo.videoBId,
        isPublic: comparisonVideo.isPublic || false,
        createdAt: comparisonVideo.createdAt || new Date().toISOString(),
        updatedAt: comparisonVideo.updatedAt || new Date().toISOString(),
        ...(comparisonVideo.thumbnailUrl && {
          thumbnailUrl: comparisonVideo.thumbnailUrl,
        }),
        ...(comparisonVideo.videoA && { videoA: comparisonVideo.videoA }),
        ...(comparisonVideo.videoB && { videoB: comparisonVideo.videoB }),
      };

      currentComparison.value = typedComparison;

      success('Comparison video created successfully');

      // Load comparison mode
      await loadComparisonMode(typedComparison);

      return true;
    } catch (err: any) {
      console.error(
        '❌ [ComparisonWorkflow] Failed to create comparison:',
        err
      );
      error.value = err.message || 'Failed to create comparison video';
      notifyError(error.value);
      return false;
    } finally {
      isProcessing.value = false;
    }
  };

  /**
   * Start direct comparison without saving
   */
  const startDirectComparison = async () => {
    if (!canProceed.value) {
      error.value = 'Invalid video selection';
      return false;
    }

    isProcessing.value = true;
    error.value = null;
    workflowStep.value = 'load';

    try {
      // Load annotations for both videos
      const [annotationsA, annotationsB] = await Promise.all([
        AnnotationService.getVideoAnnotations(
          selectedVideoA.value!.id,
          selectedVideoA.value!.id
        ),
        AnnotationService.getVideoAnnotations(
          selectedVideoB.value!.id,
          selectedVideoB.value!.id
        ),
      ]);

      videoAAnnotations.value = annotationsA || [];
      videoBAnnotations.value = annotationsB || [];
      comparisonAnnotations.value = []; // No comparison-specific annotations

      workflowStep.value = 'ready';

      success('Comparison mode ready');
      return true;
    } catch (err: any) {
      console.error('❌ [ComparisonWorkflow] Failed to start comparison:', err);
      error.value = err.message || 'Failed to start comparison';
      notifyError(error.value);
      return false;
    } finally {
      isProcessing.value = false;
    }
  };

  /**
   * Load existing comparison video
   */
  const loadComparisonVideo = async (comparisonVideo: ComparisonVideo) => {
    isProcessing.value = true;
    error.value = null;
    workflowStep.value = 'load';

    try {
      // Set current comparison
      currentComparison.value = comparisonVideo;
      selectedVideoA.value = comparisonVideo.videoA!;
      selectedVideoB.value = comparisonVideo.videoB!;

      // Load all annotations
      const [annotationsA, annotationsB, compAnnotations] = await Promise.all([
        AnnotationService.getVideoAnnotations(
          comparisonVideo.videoAId,
          comparisonVideo.videoAId
        ),
        AnnotationService.getVideoAnnotations(
          comparisonVideo.videoBId,
          comparisonVideo.videoBId
        ),
        AnnotationService.getComparisonVideoAnnotations(comparisonVideo.id),
      ]);

      videoAAnnotations.value = annotationsA || [];
      videoBAnnotations.value = annotationsB || [];
      comparisonAnnotations.value = compAnnotations || [];

      workflowStep.value = 'ready';

      success('Comparison video loaded successfully');
      return true;
    } catch (err: any) {
      console.error('❌ [ComparisonWorkflow] Failed to load comparison:', err);
      error.value = err.message || 'Failed to load comparison video';
      notifyError(error.value || 'An error occurred');
      return false;
    } finally {
      isProcessing.value = false;
    }
  };

  /**
   * Load comparison mode (common logic)
   */
  const loadComparisonMode = async (comparisonVideo: ComparisonVideo) => {
    workflowStep.value = 'load';

    // Load all annotations
    const [annotationsA, annotationsB, compAnnotations] = await Promise.all([
      AnnotationService.getVideoAnnotations(
        comparisonVideo.videoAId,
        comparisonVideo.videoAId
      ),
      AnnotationService.getVideoAnnotations(
        comparisonVideo.videoBId,
        comparisonVideo.videoBId
      ),
      AnnotationService.getComparisonVideoAnnotations(comparisonVideo.id),
    ]);

    videoAAnnotations.value = annotationsA || [];
    videoBAnnotations.value = annotationsB || [];
    comparisonAnnotations.value = compAnnotations || [];

    workflowStep.value = 'ready';
  };

  /**
   * Create annotation in comparison context
   */
  const createAnnotation = async (
    annotation: Annotation,
    context: VideoContext
  ) => {
    if (!user.value) {
      throw new Error('User not authenticated');
    }

    try {
      let newAnnotation: Annotation;

      if (context === 'comparison' && currentComparison.value) {
        // Create comparison-specific annotation
        newAnnotation = await AnnotationService.createComparisonAnnotation(
          currentComparison.value.id,
          annotation,
          user.value.id,
          'comparison'
        );
        comparisonAnnotations.value.push(newAnnotation);
        comparisonAnnotations.value.sort((a, b) => a.frame - b.frame);
      } else if (context === 'video_a' && selectedVideoA.value) {
        // Create annotation for Video A
        newAnnotation = await AnnotationService.createAnnotation({
          videoId: selectedVideoA.value.id,
          userId: user.value.id,
          projectId: selectedVideoA.value.id, // Use videoId as projectId for single video annotations
          content: annotation.content,
          title: annotation.title,
          severity: annotation.severity,
          color: annotation.color,
          timestamp: annotation.timestamp,
          frame: annotation.frame,
          startFrame: annotation.frame,
          endFrame: annotation.frame,
          duration: annotation.duration || 0,
          durationFrames: annotation.durationFrames || 0,
          annotationType: annotation.annotationType,
          drawingData: annotation.drawingData,
        });
        videoAAnnotations.value.push(newAnnotation);
        videoAAnnotations.value.sort((a, b) => a.frame - b.frame);
      } else if (context === 'video_b' && selectedVideoB.value) {
        // Create annotation for Video B
        newAnnotation = await AnnotationService.createAnnotation({
          videoId: selectedVideoB.value.id,
          userId: user.value.id,
          projectId: selectedVideoB.value.id, // Use videoId as projectId for single video annotations
          content: annotation.content,
          title: annotation.title,
          severity: annotation.severity,
          color: annotation.color,
          timestamp: annotation.timestamp,
          frame: annotation.frame,
          startFrame: annotation.frame,
          endFrame: annotation.frame,
          duration: annotation.duration || 0,
          durationFrames: annotation.durationFrames || 0,
          annotationType: annotation.annotationType,
          drawingData: annotation.drawingData,
        });
        videoBAnnotations.value.push(newAnnotation);
        videoBAnnotations.value.sort((a, b) => a.frame - b.frame);
      } else {
        throw new Error('Invalid annotation context');
      }

      success('Annotation created successfully');
      return newAnnotation;
    } catch (err: any) {
      console.error(
        '❌ [ComparisonWorkflow] Failed to create annotation:',
        err
      );
      notifyError(err.message || 'Failed to create annotation');
      throw err;
    }
  };

  /**
   * Delete annotation
   */
  const deleteAnnotation = async (
    annotationId: string,
    context: VideoContext
  ) => {
    try {
      await AnnotationService.deleteAnnotation(annotationId);

      // Remove from appropriate array
      if (context === 'comparison') {
        comparisonAnnotations.value = comparisonAnnotations.value.filter(
          (a) => a.id !== annotationId
        );
      } else if (context === 'video_a') {
        videoAAnnotations.value = videoAAnnotations.value.filter(
          (a) => a.id !== annotationId
        );
      } else if (context === 'video_b') {
        videoBAnnotations.value = videoBAnnotations.value.filter(
          (a) => a.id !== annotationId
        );
      }

      success('Annotation deleted successfully');
    } catch (err: any) {
      console.error(
        '❌ [ComparisonWorkflow] Failed to delete annotation:',
        err
      );
      notifyError(err.message || 'Failed to delete annotation');
      throw err;
    }
  };

  /**
   * Get annotations at specific frame
   */
  const getAnnotationsAtFrame = (frame: number) => {
    return {
      comparison: comparisonAnnotations.value.filter((a) => a.frame === frame),
      videoA: videoAAnnotations.value.filter((a) => a.frame === frame),
      videoB: videoBAnnotations.value.filter((a) => a.frame === frame),
    };
  };

  /**
   * Reset workflow state
   */
  const resetWorkflow = () => {
    workflowStep.value = 'select';
    isProcessing.value = false;
    error.value = null;
    selectedVideoA.value = null;
    selectedVideoB.value = null;
    comparisonTitle.value = '';
    comparisonDescription.value = '';
    shouldSave.value = true;
    currentComparison.value = null;
    comparisonAnnotations.value = [];
    videoAAnnotations.value = [];
    videoBAnnotations.value = [];
  };

  /**
   * Update workflow step based on current state
   */
  const updateWorkflowStep = () => {
    if (selectedVideoA.value && selectedVideoB.value) {
      if (workflowStep.value === 'select') {
        // Ready to configure or start comparison
        return;
      }
    } else {
      workflowStep.value = 'select';
    }
  };

  return {
    // State
    workflowStep: readonly(workflowStep),
    isProcessing: readonly(isProcessing),
    error: readonly(error),
    selectedVideoA: readonly(selectedVideoA),
    selectedVideoB: readonly(selectedVideoB),
    comparisonTitle,
    comparisonDescription,
    shouldSave: readonly(shouldSave),
    currentComparison: readonly(currentComparison),
    comparisonAnnotations: readonly(comparisonAnnotations),
    videoAAnnotations: readonly(videoAAnnotations),
    videoBAnnotations: readonly(videoBAnnotations),

    // Computed
    canProceed: readonly(canProceed),
    defaultTitle: readonly(defaultTitle),
    isReady: readonly(isReady),
    hasAnnotations: readonly(hasAnnotations),

    // Methods
    selectVideoA,
    selectVideoB,
    configureComparison,
    createComparisonVideo,
    startDirectComparison,
    loadComparisonVideo,
    createAnnotation,
    deleteAnnotation,
    getAnnotationsAtFrame,
    resetWorkflow,
  };
}
