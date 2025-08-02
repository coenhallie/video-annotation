import { ref, readonly, toValue, watch } from 'vue';
import { VideoService } from '../services/videoService';
import { AnnotationService } from '../services/annotationService';
import { useAuth } from './useAuth';
import { supabase } from './useSupabase';
import type { DatabaseAnnotation, Annotation } from '../types/database';

export function useVideoAnnotations(
  videoUrl,
  videoId,
  projectId,
  comparisonVideoId
) {
  const { user } = useAuth();

  // State
  const currentVideo = ref(null);
  const annotations = ref([]);
  const isLoading = ref(false);
  const error = ref(null);
  const isComparisonContext = ref(false);

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
    comparisonVideoId,
    async (newComparisonVideoId, oldComparisonVideoId) => {
      if (newComparisonVideoId !== oldComparisonVideoId) {
        console.log('🔄 [useVideoAnnotations] comparisonVideoId changed:', {
          old: oldComparisonVideoId,
          new: newComparisonVideoId,
        });

        // Update comparison context
        isComparisonContext.value = !!newComparisonVideoId;

        // Reload annotations when comparison video ID changes
        // Allow loading for shared comparison videos even without authentication
        if (toValue(user) || newComparisonVideoId) {
          await loadAnnotations();
        }
      }
    }
  );

  // Create or get video record
  const initializeVideo = async (videoData) => {
    if (!toValue(user)) return;

    try {
      isLoading.value = true;

      // Check if we're in a comparison context
      isComparisonContext.value = !!toValue(comparisonVideoId);

      console.log(
        '🐛 [DEBUG] useVideoAnnotations.initializeVideo called with:',
        {
          videoUrl: toValue(videoUrl),
          videoId: toValue(videoId),
          videoData,
          currentUser: toValue(user)?.email,
          comparisonVideoId: toValue(comparisonVideoId),
          isComparisonContext: isComparisonContext.value,
        }
      );

      // If we have an existing video record (for uploaded videos), use it directly
      if (videoData.existingVideo) {
        console.log(
          '🐛 [DEBUG] Using existing video record:',
          videoData.existingVideo.id
        );
        currentVideo.value = videoData.existingVideo;
        await loadAnnotations();
        return videoData.existingVideo;
      }

      // For uploaded videos, check if a video with this URL already exists as an upload
      if (videoData.videoType === 'upload') {
        console.log(
          '🐛 [DEBUG] Checking for existing uploaded video with URL:',
          toValue(videoUrl)
        );

        // Use VideoService to check for existing uploaded video
        const { data: existingUploadedVideos, error: videoError } =
          await supabase
            .from('videos')
            .select('*')
            .eq('url', toValue(videoUrl))
            .eq('ownerId', toValue(user).id)
            .eq('videoType', 'upload');

        const existingUploadedVideo =
          existingUploadedVideos && existingUploadedVideos.length > 0
            ? existingUploadedVideos[0]
            : null;

        if (existingUploadedVideo) {
          console.log(
            '🐛 [DEBUG] Found existing uploaded video, using it:',
            existingUploadedVideo.id
          );
          currentVideo.value = existingUploadedVideo;
          await loadAnnotations();
          return existingUploadedVideo;
        }
      }

      // Only create new video record if no existing video was found
      console.log(
        '🐛 [DEBUG] No existing video found, creating new video record'
      );

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

      console.log('🐛 [DEBUG] VideoService.createVideo returned:', {
        videoId: video.id,
        videoUrl: video.url,
        videoType: video.videoType,
        title: video.title,
      });

      console.log('🐛 [DEBUG] Setting currentVideo.value to:', video);
      currentVideo.value = video;
      console.log(
        '🐛 [DEBUG] currentVideo.value after setting:',
        currentVideo.value
      );

      // Load annotations for this video
      await loadAnnotations();
    } catch (err) {
      console.error('🐛 [DEBUG] Error in initializeVideo:', err);
      error.value = err.message;
    } finally {
      isLoading.value = false;
    }
  };

  const loadAnnotations = async () => {
    console.log('🔍 [useVideoAnnotations] loadAnnotations called:', {
      isComparisonContext: isComparisonContext.value,
      comparisonVideoId: toValue(comparisonVideoId),
      currentVideo: currentVideo.value?.id,
      user: toValue(user)?.email,
    });

    // For comparison context, we don't need currentVideo
    if (!isComparisonContext.value && !currentVideo.value) {
      console.log(
        '🔍 [useVideoAnnotations] Skipping - no comparison context and no current video'
      );
      return;
    }

    // Allow loading annotations if user is authenticated OR if video is public OR if in comparison context (for shared comparisons)
    if (
      !toValue(user) &&
      !isComparisonContext.value &&
      currentVideo.value &&
      !currentVideo.value.isPublic
    ) {
      console.log(
        '🔍 [useVideoAnnotations] Skipping - no user and video not public'
      );
      return;
    }

    try {
      isLoading.value = true;
      let dbAnnotations;

      if (isComparisonContext.value && toValue(comparisonVideoId)) {
        // In comparison context, load ALL annotations (individual + comparison-specific)
        console.log(
          '🔍 [useVideoAnnotations] Loading all annotations for comparison video:',
          toValue(comparisonVideoId)
        );

        try {
          // First get the comparison video details to get videoA and videoB IDs
          const { data: comparisonVideo, error: comparisonError } =
            await supabase
              .from('comparison_videos')
              .select('videoAId, videoBId')
              .eq('id', toValue(comparisonVideoId))
              .single();

          if (comparisonError) {
            console.error(
              '❌ [useVideoAnnotations] Error getting comparison video details:',
              comparisonError
            );
            throw comparisonError;
          }

          console.log(
            '🔍 [useVideoAnnotations] Comparison video details:',
            comparisonVideo
          );

          if (comparisonVideo) {
            // Load all annotations for the comparison (individual + comparison-specific)
            console.log(
              '🔍 [useVideoAnnotations] Loading annotations for videos:',
              {
                comparisonVideoId: toValue(comparisonVideoId),
                videoAId: comparisonVideo.videoAId,
                videoBId: comparisonVideo.videoBId,
              }
            );

            const allAnnotations =
              await AnnotationService.getAllComparisonVideoAnnotations(
                toValue(comparisonVideoId),
                comparisonVideo.videoAId,
                comparisonVideo.videoBId
              );

            console.log('🔍 [useVideoAnnotations] Retrieved all annotations:', {
              comparison: allAnnotations.comparison?.length || 0,
              videoA: allAnnotations.videoA?.length || 0,
              videoB: allAnnotations.videoB?.length || 0,
              total:
                (allAnnotations.comparison?.length || 0) +
                (allAnnotations.videoA?.length || 0) +
                (allAnnotations.videoB?.length || 0),
            });

            // Flatten all annotations into a single array
            annotations.value = [
              ...allAnnotations.comparison,
              ...allAnnotations.videoA,
              ...allAnnotations.videoB,
            ];

            console.log(
              '🔍 [useVideoAnnotations] Final annotations array:',
              annotations.value.length,
              'annotations'
            );
          } else {
            console.warn('🔍 [useVideoAnnotations] No comparison video found');
            annotations.value = [];
          }
        } catch (err) {
          console.error(
            '❌ [useVideoAnnotations] Error in comparison loading:',
            err
          );
          throw err;
        }
      } else {
        // In individual video context, load individual video annotations
        console.log(
          '🔍 [DEBUG] Loading individual video annotations for:',
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
    if (currentComparisonVideoId && !isComparisonContext.value) {
      console.log(
        '🔧 [DEBUG] Fixing comparison context - setting isComparisonContext to true'
      );
      isComparisonContext.value = true;
    }

    console.log('🔍 [DEBUG] addAnnotation called with:', {
      annotationData,
      currentVideo: currentVideo.value,
      user: toValue(user)?.email,
      isComparisonContext: isComparisonContext.value,
      comparisonVideoId: currentComparisonVideoId,
    });

    console.log(
      '✅ [DEBUG] Column naming fixes applied - using camelCase for database operations'
    );

    if (!toValue(user)) {
      console.log('❌ [DEBUG] addAnnotation - Missing user');
      return;
    }

    // Validate context-specific requirements
    if (isComparisonContext.value) {
      // For comparison context, we need comparisonVideoId
      if (!toValue(comparisonVideoId)) {
        console.log(
          '❌ [DEBUG] addAnnotation - Missing comparisonVideoId for comparison video context'
        );
        return;
      }
      console.log(
        '✅ [DEBUG] Comparison context validation passed - comparisonVideoId:',
        toValue(comparisonVideoId)
      );
    } else {
      // For individual video context, we need currentVideo
      if (!currentVideo.value) {
        console.log(
          '❌ [DEBUG] addAnnotation - Missing currentVideo for individual video context'
        );
        return;
      }
      console.log(
        '✅ [DEBUG] Individual context validation passed - currentVideo.id:',
        currentVideo.value.id
      );
    }

    try {
      console.log(
        '🐛 [DEBUG] addAnnotation - currentVideo.value:',
        currentVideo.value
      );
      console.log(
        '🐛 [DEBUG] addAnnotation - isComparisonContext:',
        isComparisonContext.value
      );

      let newAnnotation;

      if (isComparisonContext.value && toValue(comparisonVideoId)) {
        // In comparison context, create comparison-specific annotation
        console.log(
          '🐛 [DEBUG] addAnnotation - creating comparison annotation for:',
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
        console.log(
          'Annotation data being sent to createComparisonAnnotation:',
          annotationData
        );
        console.log(
          '✅ [DEBUG] addAnnotation - comparison annotation created:',
          newAnnotation
        );
      } else {
        // In individual video context, create individual video annotation
        console.log(
          '🐛 [DEBUG] addAnnotation - creating individual annotation for:',
          currentVideo.value.id
        );

        // Validate frame data before creating annotation
        const startFrame =
          annotationData.startFrame || annotationData.frame || 0;
        const endFrame =
          annotationData.endFrame || annotationData.frame || startFrame;

        // Ensure endFrame is not less than startFrame
        const validatedEndFrame = Math.max(endFrame, startFrame);

        console.log('🔍 [DEBUG] Frame validation:', {
          originalStartFrame: annotationData.startFrame,
          originalEndFrame: annotationData.endFrame,
          validatedStartFrame: startFrame,
          validatedEndFrame: validatedEndFrame,
          frame: annotationData.frame,
        });

        const dbAnnotation = {
          videoId: currentVideo.value.id,
          userId: toValue(user).id,
          projectId: toValue(projectId),
          content: annotationData.content,
          title: annotationData.title,
          severity: annotationData.severity,
          color: annotationData.color,
          timestamp: annotationData.timestamp,
          frame: annotationData.frame,
          startFrame: startFrame,
          endFrame: validatedEndFrame,
          duration: annotationData.duration,
          durationFrames: annotationData.durationFrames,
          annotationType: annotationData.annotationType,
          drawingData: annotationData.drawingData,
          metadata: annotationData.metadata,
        };

        const createdAnnotation = await AnnotationService.createAnnotation(
          dbAnnotation
        );
        console.log(
          'Annotation data being sent to createAnnotation:',
          dbAnnotation
        );

        newAnnotation = createdAnnotation as Annotation;
        console.log(
          '✅ [DEBUG] addAnnotation - individual annotation created:',
          newAnnotation
        );
      }

      annotations.value.push(newAnnotation);
      annotations.value.sort((a, b) => a.timestamp - b.timestamp);

      console.log(
        '✅ [DEBUG] addAnnotation - annotation added to local array, total:',
        annotations.value.length
      );
      return newAnnotation;
    } catch (err) {
      console.error('❌ [DEBUG] addAnnotation - Error:', err);
      error.value = err.message;
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

      const dbUpdates = {
        content: actualUpdates.content || '',
        title: actualUpdates.title || '',
        severity: actualUpdates.severity || 'medium',
        color: actualUpdates.color || '#6b7280',
        timestamp: actualUpdates.timestamp || 0,
        frame: actualUpdates.frame || 0,
        annotationType: actualUpdates.annotationType || 'text',
        drawingData: actualUpdates.drawingData || null,
      };

      const updatedAnnotation = await AnnotationService.updateAnnotation(
        actualAnnotationId,
        dbUpdates
      );

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
      await AnnotationService.deleteAnnotation(annotationId);
      annotations.value = annotations.value.filter(
        (a) => a.id !== annotationId
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
  };
}
