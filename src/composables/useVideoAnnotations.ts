import {
  ref,
  readonly,
  toValue,
  watch,
  onMounted,
  computed,
  type Ref,
  type MaybeRefOrGetter,
} from 'vue';
import { VideoService } from '../services/videoService';
import { logger } from '../utils/logger';
import { AnnotationService } from '../services/annotationService';
import { AnnotationLabelService } from '../services/annotationLabelService';
import { useAuth } from './useAuth';
import { ComparisonVideoService } from '../services/comparisonVideoService';
import type { Annotation, AnnotationSurface } from '../types/database';
import type { AnnotationFormData } from '../types/component-interfaces';
import type { AnnotationInsert } from '../types/database';

export function useVideoAnnotations(
  videoUrl: Ref<string | null> | string,
  videoId: Ref<string | null> | string,
  projectId: Ref<string | null> | string,
  comparisonVideoId: Ref<string | null> | string,
  surface: MaybeRefOrGetter<AnnotationSurface> = 'video'
) {
  const { user } = useAuth();

  /**
   * What this composable actually reads off the video record. Deliberately not
   * the full Video type: `existingVideo` is handed in by callers as a loose
   * object, and only `id` and `isPublic` are ever read here. Typing `id` is what
   * matters - as a bare Record its type was `unknown`, so every service call
   * taking it was an error.
   */
  type CurrentVideoRecord = {
    id: string;
    isPublic?: boolean;
    [key: string]: unknown;
  };

  // State
  const currentVideo = ref<CurrentVideoRecord | null>(null);
  const annotations = ref<Annotation[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  // Derive comparison context from comparisonVideoId to avoid drift
  const isComparisonContext = computed(() => !!toValue(comparisonVideoId));

  // Monotonic token for loadAnnotations. Tab clicks put several loads in flight
  // at once, and without this whichever resolves last wins - so clicking
  // Pipeline then Video can leave pipeline rows sitting in the Video tab, where
  // nothing corrects them. Each call captures the token at entry and drops its
  // result if a newer load has started since.
  let loadToken = 0;

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

  // Switching tabs swaps which annotations exist, so the list has to be
  // refetched. Everything downstream - the annotation panel, the timeline
  // markers, the quick pick - reads this one array, so they all follow.
  watch(
    () => toValue(surface),
    async () => {
      // Cleared synchronously, before any await. loadAnnotations can skip
      // (no context, no video, unauthenticated) or fail, and every one of those
      // paths leaves the list untouched - which would show the other tab's
      // annotations under this tab, markers included. Empty is truthful here,
      // stale is a lie.
      annotations.value = [];
      await loadAnnotations();
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
  const initializeVideo = async (videoData: {
    existingVideo?: CurrentVideoRecord;
    // Not `string`: videos.videoType carries a check constraint accepting only
    // these two values, so anything else is rejected by the database.
    videoType?: 'url' | 'upload';
    title?: string;
    fps?: number;
    duration?: number;
    totalFrames?: number;
    [key: string]: unknown;
  }) => {
    const currentUser = toValue(user);
    if (!currentUser) return;

    try {
      isLoading.value = true;
      const url = toValue(videoUrl);

      // If we have an existing video record (for uploaded videos), use it directly
      if (videoData.existingVideo) {
        currentVideo.value = videoData.existingVideo;
        await loadAnnotations();
        return videoData.existingVideo;
      }

      // For uploaded videos, check if a video with this URL already exists as an upload via service
      if (videoData.videoType === 'upload') {
        const existingUploadedVideo = url
          ? await VideoService.findExistingUploadedVideo(url, currentUser.id)
          : null;
        if (existingUploadedVideo) {
          currentVideo.value = existingUploadedVideo;
          await loadAnnotations();
          return existingUploadedVideo;
        }
      }

      // A row with no url cannot be stored: videos.check_video_url_or_path
      // requires a non-empty url for videoType 'url'. Failing here names the
      // problem; letting it through surfaces as a constraint violation instead.
      if (!url) {
        throw new Error(
          'Cannot create a video record without a URL (videoUrl is null)'
        );
      }

      // Create or update video record (handles duplicates automatically)
      const video = await VideoService.createVideo({
        ownerId: currentUser.id,
        title: videoData.title || `Video ${new Date().toLocaleDateString()}`,
        url,
        videoId: toValue(videoId) ?? '',
        videoType: videoData.videoType || 'url',
        fps: videoData.fps || 30,
        duration: videoData.duration || 0,
        totalFrames: videoData.totalFrames || 0,
        isPublic: false,
      });

      currentVideo.value = video;

      // Load annotations for this video
      await loadAnnotations();
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      isLoading.value = false;
    }
  };

  const loadAnnotations = async () => {
    // Captured before the first await, so every assignment below can check that
    // this load is still the newest one.
    const token = ++loadToken;
    const isCurrent = () => token === loadToken;

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

        if (!isCurrent()) return;
        annotations.value = (shareData.annotations ||
          []) as unknown as Annotation[];
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

      const comparisonId = toValue(comparisonVideoId);
      if (comparisonId) {
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
                comparisonId,
                comparisonVideo.videoAId,
                comparisonVideo.videoBId
              );

            // Flatten all annotations into a single array
            if (!isCurrent()) return;
            annotations.value = [
              ...(allAnnotations.comparison || []),
              ...(allAnnotations.videoA || []),
              ...(allAnnotations.videoB || []),
            ];
          } else {
            logger.warn('[useVideoAnnotations] no comparison video found');
            if (!isCurrent()) return;
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
        // In individual video context, load individual video annotations.
        // Reachable with no current video: the guard above lets a shared video
        // through, and the shared branch only handles it when a share id is
        // present. That combination used to throw a TypeError on `.id`.
        const videoRecord = currentVideo.value;
        if (!videoRecord) {
          logger.warn('[useVideoAnnotations] skip load - no current video');
          if (!isCurrent()) return;
          annotations.value = [];
          return;
        }
        logger.debug(
          '[useVideoAnnotations] loading individual annotations for',
          videoRecord.id
        );
        dbAnnotations = await AnnotationService.getVideoAnnotations(
          videoRecord.id,
          // `?? undefined`, not `!`: these services take an optional projectId,
          // and "no project" is spelled undefined there but null here.
          toValue(projectId) ?? undefined,
          true, // includeCommentCounts
          toValue(surface)
        );
        if (!isCurrent()) return;
        annotations.value = dbAnnotations.map((ann) => ann as Annotation);
      }
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      isLoading.value = false;
    }
  };

  const addAnnotation = async (annotationData: AnnotationFormData) => {
    // Ensure comparison context is properly set
    const currentComparisonVideoId = toValue(comparisonVideoId);
    // The surface this annotation belongs to, fixed at entry. Creating one and
    // switching tabs before the insert returns must not drop the row into the
    // other tab's list.
    const surfaceAtEntry = toValue(surface);
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

      const author = toValue(user);
      if (!author) {
        throw new Error('Cannot create an annotation without a signed-in user');
      }

      const comparisonId = toValue(comparisonVideoId);
      if (comparisonId) {
        // In comparison context, create comparison-specific annotation
        logger.debug(
          '[useVideoAnnotations] create comparison annotation for',
          comparisonId
        );

        // Extract labels from annotationData (they're handled separately)
        const { labels, ...annotationWithoutLabels } = annotationData;

        const createdAnnotation =
          await AnnotationService.createComparisonAnnotation(
            comparisonId,
            annotationWithoutLabels,
            author.id,
            'comparison',
            undefined, // synchronizedFrame
            toValue(projectId) ?? undefined
          );

        // Always stamp the labels we were given, empty array included. Absence
        // of the field means "not hydrated", not "no labels", and consumers
        // such as the timeline's comment marker read the difference.
        if (createdAnnotation) {
          (createdAnnotation as Record<string, unknown>).labels = labels ?? [];
        }

        // If there are labels, associate them with the annotation
        if (labels && labels.length > 0 && createdAnnotation?.id) {
          try {
            await AnnotationLabelService.addLabelsToAnnotation(
              createdAnnotation.id,
              labels
            );
            logger.debug(
              '[useVideoAnnotations] Labels associated with comparison annotation:',
              labels
            );
          } catch (labelError) {
            logger.error(
              '[useVideoAnnotations] Failed to associate labels with comparison annotation:',
              labelError
            );
            // Continue even if label association fails
          }
        }

        newAnnotation = createdAnnotation as Annotation;
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

        // The form draft has every field optional, but these columns are NOT
        // NULL. The defaults are the same ones createComparisonAnnotation
        // applies, so both creation paths agree on what an incomplete draft
        // means. Passing undefined instead made PostgREST omit the column and
        // the insert fail on the NOT NULL constraint.
        const dbAnnotation: AnnotationInsert = {
          videoId: videoIdToUse ?? null,
          userId: author.id,
          projectId: toValue(projectId),
          content: annotationWithoutLabels.content || '',
          title: annotationWithoutLabels.title || 'Untitled Annotation',
          severity: annotationWithoutLabels.severity || 'medium',
          color: annotationWithoutLabels.color || '#6b7280',
          timestamp: Math.max(annotationWithoutLabels.timestamp || 0, 0),
          frame: annotationWithoutLabels.frame ?? null,
          startFrame: _start,
          endFrame: Math.max(_end, _start),
          duration: Math.max(annotationWithoutLabels.duration || 1 / 30, 1 / 30),
          durationFrames: Math.max(
            annotationWithoutLabels.durationFrames || 1,
            1
          ),
          annotationType:
            annotationWithoutLabels.annotationType ||
            (annotationWithoutLabels.drawingData ? 'drawing' : 'text'),
          drawingData: annotationWithoutLabels.drawingData ?? null,
          metadata: annotationWithoutLabels.metadata ?? null,
          surface: toValue(surface),
        };

        const createdAnnotation = await AnnotationService.createAnnotation(
          dbAnnotation
        );

        // Always stamp the labels we were given, empty array included. Absence
        // of the field means "not hydrated", not "no labels", and consumers
        // such as the timeline's comment marker read the difference.
        if (createdAnnotation) {
          (createdAnnotation as Record<string, unknown>).labels = labels ?? [];
        }

        // If there are labels, associate them with the annotation
        if (labels && labels.length > 0 && createdAnnotation?.id) {
          try {
            await AnnotationLabelService.addLabelsToAnnotation(
              createdAnnotation.id,
              labels
            );
            logger.debug('[useVideoAnnotations] Labels associated:', labels);
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

      // The row exists in the database either way, which is correct: only the
      // local list is surface-specific.
      if (toValue(surface) !== surfaceAtEntry) {
        logger.debug(
          '[useVideoAnnotations] surface changed during create, skipping local push',
          { from: surfaceAtEntry, to: toValue(surface) }
        );
        return newAnnotation;
      }

      annotations.value.push(newAnnotation);
      annotations.value.sort((a, b) => a.timestamp - b.timestamp);

      logger.debug(
        '[useVideoAnnotations] annotation added locally',
        annotations.value.length
      );
      return newAnnotation;
    } catch (err: unknown) {
      logger.error('[useVideoAnnotations] addAnnotation error', err);
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  };

  /**
   * Updates accepted here: annotation fields plus the label ids, which are
   * stored in a separate table and stripped out below.
   */
  type AnnotationUpdate = Partial<Annotation> & { labels?: string[] };

  /**
   * Two calling conventions, both in use: separate (id, updates), or a single
   * object carrying its own id. The union spells that out instead of leaving the
   * parameter untyped, which is what let `annotationId.id` narrow to never.
   */
  const updateAnnotation = async (
    annotationId: string | (AnnotationUpdate & { id: string }),
    updates?: AnnotationUpdate
  ) => {
    // In comparison context, we don't need currentVideo
    if (!isComparisonContext.value && !currentVideo.value) return;

    try {
      // Handle both calling patterns: (id, updates) or (annotationObject)
      let actualAnnotationId;
      let actualUpdates: AnnotationUpdate | undefined;

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

      // Build updates object, only including fields that are being updated
      // This prevents sending default values that might violate constraints
      const dbUpdates: Record<string, unknown> = {};

      // Only add fields that are explicitly provided in the updates
      if (updatesWithoutLabels.content !== undefined) {
        dbUpdates.content = updatesWithoutLabels.content;
      }
      if (updatesWithoutLabels.title !== undefined) {
        dbUpdates.title = updatesWithoutLabels.title;
      }
      if (updatesWithoutLabels.severity !== undefined) {
        dbUpdates.severity = updatesWithoutLabels.severity;
      }
      if (updatesWithoutLabels.color !== undefined) {
        dbUpdates.color = updatesWithoutLabels.color;
      }
      if (updatesWithoutLabels.timestamp !== undefined) {
        // Ensure timestamp is positive (database constraint requires > 0)
        dbUpdates.timestamp = Math.max(updatesWithoutLabels.timestamp, 0.001);
      }
      if (updatesWithoutLabels.frame !== undefined) {
        dbUpdates.frame = Math.max(updatesWithoutLabels.frame, 0);
      }
      if (updatesWithoutLabels.annotationType !== undefined) {
        dbUpdates.annotationType = updatesWithoutLabels.annotationType;
      }
      // Preserve drawingData exactly as provided
      if (updatesWithoutLabels.drawingData !== undefined) {
        dbUpdates.drawingData = updatesWithoutLabels.drawingData;
      }
      // Include dual video frame data if present
      if (updatesWithoutLabels.videoAFrame !== undefined) {
        dbUpdates.videoAFrame = Math.max(updatesWithoutLabels.videoAFrame, 0);
      }
      if (updatesWithoutLabels.videoBFrame !== undefined) {
        dbUpdates.videoBFrame = Math.max(updatesWithoutLabels.videoBFrame, 0);
      }
      if (updatesWithoutLabels.videoATimestamp !== undefined) {
        dbUpdates.videoATimestamp = Math.max(
          updatesWithoutLabels.videoATimestamp,
          0.001
        );
      }
      if (updatesWithoutLabels.videoBTimestamp !== undefined) {
        dbUpdates.videoBTimestamp = Math.max(
          updatesWithoutLabels.videoBTimestamp,
          0.001
        );
      }

      logger.debug('[useVideoAnnotations] Updating annotation with:', {
        annotationId: actualAnnotationId,
        dbUpdates,
        hasDrawingData: updatesWithoutLabels.drawingData !== undefined,
        isComparisonContext: isComparisonContext.value,
      });

      const updatedAnnotation = await AnnotationService.updateAnnotation(
        actualAnnotationId,
        dbUpdates
      );

      // If labels were provided, update them
      if (labels !== undefined) {
        // Stamped before the association, as on the create paths: an absent
        // labels array means "never hydrated", so leaving it off after a failed
        // association would make an edited comment render as a filled dot.
        (updatedAnnotation as Record<string, unknown>).labels = labels || [];
        try {
          await AnnotationLabelService.updateAnnotationLabels(
            actualAnnotationId,
            labels || []
          );
          logger.debug(
            '[useVideoAnnotations] Labels updated for annotation:',
            actualAnnotationId
          );
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
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  };

  const deleteAnnotation = async (annotationId: string | Annotation) => {
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
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  };

  // Method to load pre-existing annotations (for loading saved videos)
  const loadExistingAnnotations = (
    existingAnnotations: readonly Annotation[]
  ) => {
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
    /**
     * Deliberately NOT wrapped in readonly().
     *
     * useRealtimeAnnotations applies server events by pushing, splicing and
     * reassigning `annotations.value`. Behind Vue's readonly() - which is deep -
     * every one of those writes was blocked, so a realtime insert from another
     * client warned in dev and changed nothing at all in production. The
     * wrapper also forced consumers to launder DeepReadonly<Annotation> back
     * into Annotation at each hand-off, which is the same encapsulation claim
     * failing louder.
     */
    annotations,
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
