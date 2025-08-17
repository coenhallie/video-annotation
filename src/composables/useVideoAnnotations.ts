import {
  ref,
  readonly,
  toValue,
  watch,
  onMounted,
  computed,
  type Ref,
} from 'vue';
import { VideoService } from '../services/videoService';
import { logger } from '../utils/logger';
import { AnnotationService } from '../services/annotationService';
import { AnnotationLabelService } from '../services/annotationLabelService';
import { useAuth } from './useAuth';
import { ComparisonVideoService } from '../services/comparisonVideoService';
import type { Annotation } from '../types/database';

export function useVideoAnnotations(
  videoUrl: Ref<string | null> | string,
  videoId: Ref<string | null> | string,
  projectId: Ref<string | null> | string,
  comparisonVideoId: Ref<string | null> | string
) {
  const { user } = useAuth();

  // State
  const currentVideo = ref<any | null>(null);
  const annotations = ref<Annotation[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  // Derive comparison context from comparisonVideoId to avoid drift
  const isComparisonContext = computed(() => !!toValue(comparisonVideoId));

  // Watch for user changes and reload annotations if we have a current video
  watch(user, async (newUser, oldUser) => {
    if (newUser && currentVideo.value && newUser.id !== oldUser?.id) {
      await loadAnnotations();
    } else if (!newUser) {
      // Clear annotations when user logs out
      annotations.value = [];
      currentVideo.value = null;
    }
  });

  // Watch for comparisonVideoId changes and reload annotations
  watch(
    () => toValue(comparisonVideoId),
    async (newId, oldId) => {
      if (newId !== oldId && (toValue(user) || newId)) {
        logger.debug('[useVideoAnnotations] comparisonVideoId changed', {
          old: oldId,
          new: newId,
        });
        await loadAnnotations();
      }
    }
  );

  // Check for shared videos on mount
  onMounted(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    if (shareId) {
      logger.debug('[useVideoAnnotations] shared video detected on mount');
      await loadAnnotations();
    }
  });

  // Create or get video record
  const initializeVideo = async (videoData: any) => {
    if (!toValue(user)) return;

    try {
      isLoading.value = true;

      // If we have an existing video record (for uploaded videos), use it directly
      if (videoData.existingVideo) {
        currentVideo.value = videoData.existingVideo;
        await loadAnnotations();
        return videoData.existingVideo;
      }

      // For uploaded videos, check if a video with this URL already exists as an upload via service
      if (videoData.videoType === 'upload') {
        const existingUploadedVideo =
          await VideoService.findExistingUploadedVideo(
            toValue(videoUrl),
            toValue(user).id
          );
        if (existingUploadedVideo) {
          currentVideo.value = existingUploadedVideo;
          await loadAnnotations();
          return existingUploadedVideo;
        }
      }

      // Create or update video record (handles duplicates automatically)
      const video = await VideoService.createVideo({
        ownerId: toValue(user).id,
        title: videoData.title || `Video ${new Date().toLocaleDateString()}`,
        url: toValue(videoUrl),
        videoId: toValue(videoId),
        videoType: videoData.videoType || 'url',
        fps: videoData.fps || 30,
        duration: videoData.duration || 0,
        totalFrames: videoData.totalFrames || 0,
        isPublic: false,
      });

      currentVideo.value = video;

      // Load annotations for this video
      await loadAnnotations();
    } catch (err: any) {
      error.value = err.message;
    } finally {
      isLoading.value = false;
    }
  };

  const loadAnnotations = async () => {
    // DEV log (kept minimal)
    logger.debug('[useVideoAnnotations] loadAnnotations', {
      isComparisonContext: isComparisonContext.value,
      comparisonVideoId: toValue(comparisonVideoId),
      currentVideo: currentVideo.value?.id,
      user: toValue(user)?.email,
    });

    // Check if this is a shared video by looking at URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    const isSharedVideo = !!shareId;

    logger.debug('[useVideoAnnotations] share detection', {
      shareId,
      isSharedVideo,
      currentURL: window.location.href,
    });

    // For comparison context, we don't need currentVideo
    // For shared videos, we also don't need currentVideo to be set yet
    if (!isComparisonContext.value && !currentVideo.value && !isSharedVideo) {
      logger.debug('[useVideoAnnotations] skip load - no ctx/current/shared');
      return;
    }

    // If this is a shared video, load it using ShareService
    if (isSharedVideo && shareId) {
      logger.debug(
        '[useVideoAnnotations] load shared video annotations',
        shareId
      );
      try {
        const { ShareService } = await import('../services/shareService');
        const shareData =
          await ShareService.getSharedVideoWithCommentPermissions(shareId);

        logger.debug('[useVideoAnnotations] shared video data loaded', {
          count: shareData.annotations?.length ?? 0,
        });

        annotations.value = (shareData.annotations || []) as Annotation[];
        return;
      } catch (error) {
        logger.error('[useVideoAnnotations] error loading shared video', error);
        return;
      }
    }

    // Allow loading annotations if user is authenticated OR if video is public OR if in comparison context (for shared comparisons)
    if (
      !toValue(user) &&
      !isComparisonContext.value &&
      currentVideo.value &&
      !currentVideo.value.isPublic
    ) {
      logger.debug(
        '[useVideoAnnotations] skip load - no user and video not public'
      );
      return;
    }

    try {
      isLoading.value = true;
      let dbAnnotations;

      if (isComparisonContext.value && toValue(comparisonVideoId)) {
        // In comparison context, load ALL annotations (individual + comparison-specific)
        logger.debug(
          '[useVideoAnnotations] loading all annotations for comparison',
          toValue(comparisonVideoId)
        );

        try {
          // First get the comparison video details to get videoA and videoB IDs
          const comparisonVideo = await ComparisonVideoService.getById(
            toValue(comparisonVideoId) as string
          );
          // comparisonError path removed; service throws on failure
          logger.debug(
            '[useVideoAnnotations] comparison details',
            comparisonVideo
          );

          if (comparisonVideo) {
            // Load all annotations for the comparison (individual + comparison-specific)
            logger.debug('[useVideoAnnotations] loading annotations for', {
              comparisonVideoId: toValue(comparisonVideoId),
              videoAId: comparisonVideo.videoAId,
              videoBId: comparisonVideo.videoBId,
            });

            const allAnnotations =
              await AnnotationService.getAllComparisonVideoAnnotations(
                toValue(comparisonVideoId),
                comparisonVideo.videoAId,
                comparisonVideo.videoBId
              );

            // Flatten all annotations into a single array
            annotations.value = [
              ...(allAnnotations.comparison || []),
              ...(allAnnotations.videoA || []),
              ...(allAnnotations.videoB || []),
            ];
          } else {
            logger.warn('[useVideoAnnotations] no comparison video found');
            annotations.value = [];
          }
        } catch (err) {
          logger.error(
            '[useVideoAnnotations] error in comparison loading',
            err
          );
          throw err;
        }
      } else {
        // In individual video context, load individual video annotations
        logger.debug(
          '[useVideoAnnotations] loading individual annotations for',
          currentVideo.value.id
        );
        dbAnnotations = await AnnotationService.getVideoAnnotations(
          currentVideo.value.id,
          toValue(projectId),
          true // includeCommentCounts
        );
        annotations.value = dbAnnotations.map((ann) => ann as Annotation);
      }
    } catch (err) {
      error.value = err.message;
    } finally {
      isLoading.value = false;
    }
  };

  const addAnnotation = async (annotationData) => {
    // Ensure comparison context is properly set
    const currentComparisonVideoId = toValue(comparisonVideoId);
    // isComparisonContext is derived via computed; no mutation here

    logger.debug('[useVideoAnnotations] addAnnotation', {
      annotationData,
      currentVideo: currentVideo.value,
      user: toValue(user)?.email,
      isComparisonContext: isComparisonContext.value,
      comparisonVideoId: currentComparisonVideoId,
    });

    // Column naming note: using camelCase for DB operations

    if (!toValue(user)) {
      logger.warn('[useVideoAnnotations] addAnnotation - missing user');
      return;
    }

    // Validate context-specific requirements
    if (isComparisonContext.value) {
      // For comparison context, we need comparisonVideoId
      if (!toValue(comparisonVideoId)) {
        logger.warn(
          '[useVideoAnnotations] addAnnotation - missing comparisonVideoId in comparison ctx'
        );
        return;
      }
      logger.debug(
        '[useVideoAnnotations] comparison ctx validation passed',
        toValue(comparisonVideoId)
      );
    } else {
      // For individual video context, we need currentVideo
      if (!currentVideo.value) {
        logger.warn(
          '[useVideoAnnotations] addAnnotation - missing currentVideo for individual context'
        );
        return;
      }
      // Handle both cases: currentVideo as object with id, or as string id directly
      const videoIdForLog =
        typeof currentVideo.value === 'string'
          ? currentVideo.value
          : currentVideo.value?.id;
      logger.debug(
        '[useVideoAnnotations] addAnnotation - individual ctx ok',
        videoIdForLog
      );
    }

    try {
      logger.debug('[useVideoAnnotations] addAnnotation context', {
        currentVideo: currentVideo.value,
        isComparisonContext: isComparisonContext.value,
      });

      let newAnnotation;

      if (isComparisonContext.value && toValue(comparisonVideoId)) {
        // In comparison context, create comparison-specific annotation
        logger.debug(
          '[useVideoAnnotations] create comparison annotation for',
          toValue(comparisonVideoId)
        );

        newAnnotation = await AnnotationService.createComparisonAnnotation(
          toValue(comparisonVideoId),
          annotationData,
          toValue(user).id,
          'comparison',
          undefined, // synchronizedFrame
          toValue(projectId)
        );
        // logger payloads available above; avoid verbose dumps
        logger.debug(
          '[useVideoAnnotations] comparison annotation created',
          newAnnotation?.id
        );
      } else {
        // In individual video context, create individual video annotation
        // Handle both cases: currentVideo as object with id, or as string id directly
        const videoIdToUse =
          typeof currentVideo.value === 'string'
            ? currentVideo.value
            : currentVideo.value?.id;

        logger.debug(
          '[useVideoAnnotations] creating individual annotation for',
          videoIdToUse
        );

        // Validate frame data before creating annotation (inline to avoid missing helper)
        const _start = annotationData.startFrame ?? annotationData.frame ?? 0;
        const _end = annotationData.endFrame ?? annotationData.frame ?? _start;

        // Extract labels from annotationData (they're handled separately)
        const { labels, ...annotationWithoutLabels } = annotationData;

        const dbAnnotation = {
          videoId: videoIdToUse,
          userId: toValue(user).id,
          projectId: toValue(projectId),
          content: annotationWithoutLabels.content,
          title: annotationWithoutLabels.title,
          severity: annotationWithoutLabels.severity,
          color: annotationWithoutLabels.color,
          timestamp: annotationWithoutLabels.timestamp,
          frame: annotationWithoutLabels.frame,
          startFrame: _start,
          endFrame: Math.max(_end, _start),
          duration: annotationWithoutLabels.duration,
          durationFrames: annotationWithoutLabels.durationFrames,
          annotationType: annotationWithoutLabels.annotationType,
          drawingData: annotationWithoutLabels.drawingData,
          metadata: annotationWithoutLabels.metadata,
        };

        const createdAnnotation = await AnnotationService.createAnnotation(
          dbAnnotation
        );

        // If there are labels, associate them with the annotation
        if (labels && labels.length > 0 && createdAnnotation?.id) {
          try {
            await AnnotationLabelService.addLabelsToAnnotation(
              createdAnnotation.id,
              labels
            );
            logger.debug('[useVideoAnnotations] Labels associated:', labels);
            // Add labels to the created annotation object for immediate display
            (createdAnnotation as any).labels = labels;
          } catch (labelError) {
            logger.error(
              '[useVideoAnnotations] Failed to associate labels:',
              labelError
            );
            // Continue even if label association fails
          }
        }
        logger.debug(
          '[useVideoAnnotations] createAnnotation payload',
          dbAnnotation
        );

        newAnnotation = createdAnnotation as Annotation;
        logger.debug(
          '[useVideoAnnotations] individual annotation created',
          newAnnotation?.id
        );
      }

      annotations.value.push(newAnnotation);
      annotations.value.sort((a, b) => a.timestamp - b.timestamp);

      logger.debug(
        '[useVideoAnnotations] annotation added locally',
        annotations.value.length
      );
      return newAnnotation;
    } catch (err) {
      logger.error('[useVideoAnnotations] addAnnotation error', err);
      error.value = (err as any).message;
      throw err;
    }
  };

  const updateAnnotation = async (annotationId, updates) => {
    if (!currentVideo.value) return;

    try {
      // Handle both calling patterns: (id, updates) or (annotationObject)
      let actualAnnotationId;
      let actualUpdates;

      if (
        typeof annotationId === 'object' &&
        annotationId !== null &&
        'id' in annotationId
      ) {
        // Called with a single object containing id and updates
        actualAnnotationId = annotationId.id;
        actualUpdates = annotationId;
      } else {
        // Called with separate parameters
        actualAnnotationId = annotationId;
        actualUpdates = updates;
      }
      // Ensure actualUpdates exists and has required properties
      if (!actualUpdates) {
        throw new Error('Updates object is required');
      }

      // Extract labels from updates (they're handled separately)
      const { labels, ...updatesWithoutLabels } = actualUpdates;

      const dbUpdates = {
        content: updatesWithoutLabels.content || '',
        title: updatesWithoutLabels.title || '',
        severity: updatesWithoutLabels.severity || 'medium',
        color: updatesWithoutLabels.color || '#6b7280',
        timestamp: updatesWithoutLabels.timestamp || 0,
        frame: updatesWithoutLabels.frame || 0,
        annotationType: updatesWithoutLabels.annotationType || 'text',
        drawingData: updatesWithoutLabels.drawingData || null,
      };

      const updatedAnnotation = await AnnotationService.updateAnnotation(
        actualAnnotationId,
        dbUpdates
      );

      // If labels were provided, update them
      if (labels !== undefined) {
        try {
          await AnnotationLabelService.updateAnnotationLabels(
            actualAnnotationId,
            labels || []
          );
          logger.debug(
            '[useVideoAnnotations] Labels updated for annotation:',
            actualAnnotationId
          );
          // Add labels to the updated annotation object for immediate display
          (updatedAnnotation as any).labels = labels;
        } catch (labelError) {
          logger.error(
            '[useVideoAnnotations] Failed to update labels:',
            labelError
          );
          // Continue even if label update fails
        }
      }

      const appAnnotation = updatedAnnotation as Annotation;

      const index = annotations.value.findIndex(
        (a) => a.id === actualAnnotationId
      );
      if (index !== -1) {
        annotations.value[index] = appAnnotation;
      }

      return appAnnotation;
    } catch (err) {
      error.value = err.message;
      throw err;
    }
  };

  const deleteAnnotation = async (annotationId) => {
    try {
      // Handle both cases: annotation object or annotation ID string
      const actualAnnotationId =
        typeof annotationId === 'object' &&
        annotationId !== null &&
        'id' in annotationId
          ? annotationId.id
          : annotationId;

      await AnnotationService.deleteAnnotation(actualAnnotationId);
      annotations.value = annotations.value.filter(
        (a) => a.id !== actualAnnotationId
      );
    } catch (err) {
      error.value = err.message;
      throw err;
    }
  };

  // Method to load pre-existing annotations (for loading saved videos)
  const loadExistingAnnotations = (existingAnnotations) => {
    annotations.value = existingAnnotations.map((ann) => {
      // If it's already in app format, use as-is, otherwise transform
      if (ann.frame !== undefined) {
        return ann; // Already in app format
      } else {
        return ann as Annotation; // Cast from DB format
      }
    });
  };

  /**
   * Complete cleanup for project switching
   * This clears all annotation data and resets to initial state
   */
  const cleanup = () => {
    console.log('🧹 [VideoAnnotations] Starting complete cleanup...');

    // Clear all annotations
    annotations.value = [];

    // Reset current video
    currentVideo.value = null;

    // Reset loading and error states
    isLoading.value = false;
    error.value = null;

    console.log('✅ [VideoAnnotations] Complete cleanup finished');
  };

  return {
    currentVideo: readonly(currentVideo),
    annotations: readonly(annotations),
    isLoading: readonly(isLoading),
    error: readonly(error),
    isComparisonContext: readonly(isComparisonContext),
    initializeVideo,
    loadAnnotations,
    loadExistingAnnotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    cleanup,
  };
}
