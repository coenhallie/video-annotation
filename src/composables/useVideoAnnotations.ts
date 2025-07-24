import { ref, readonly, toValue, watch } from 'vue';
import { VideoService } from '../services/videoService';
import { AnnotationService } from '../services/annotationService';
import { useAuth } from './useAuth';
import { supabase } from './useSupabase';
import {
  transformDatabaseAnnotationToApp,
  transformAppAnnotationToDatabase,
} from '../types/database';

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
        const { data: existingUploadedVideo } = await supabase
          .from('videos')
          .select('*')
          .eq('url', toValue(videoUrl))
          .eq('owner_id', toValue(user).id)
          .eq('video_type', 'upload')
          .single();

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
        owner_id: toValue(user).id,
        title: videoData.title || `Video ${new Date().toLocaleDateString()}`,
        url: toValue(videoUrl),
        video_id: toValue(videoId),
        video_type: videoData.videoType || 'url',
        fps: videoData.fps || 30,
        duration: videoData.duration || 0,
        total_frames: videoData.totalFrames || 0,
        is_public: false,
      });

      console.log('🐛 [DEBUG] VideoService.createVideo returned:', {
        videoId: video.id,
        videoUrl: video.url,
        videoType: video.video_type,
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
    if (!currentVideo.value) {
      return;
    }

    // Allow loading annotations if user is authenticated OR if video is public
    if (!toValue(user) && !currentVideo.value.is_public) {
      return;
    }

    try {
      let dbAnnotations;

      if (isComparisonContext.value && toValue(comparisonVideoId)) {
        // In comparison context, load only comparison-specific annotations
        console.log(
          '🔍 [DEBUG] Loading comparison-specific annotations for:',
          toValue(comparisonVideoId)
        );
        dbAnnotations = await AnnotationService.getComparisonVideoAnnotations(
          toValue(comparisonVideoId)
        );
        // These are already transformed by the service
        annotations.value = dbAnnotations;
      } else {
        // In individual video context, load individual video annotations
        console.log(
          '🔍 [DEBUG] Loading individual video annotations for:',
          currentVideo.value.id
        );
        dbAnnotations = await AnnotationService.getVideoAnnotations(
          currentVideo.value.id,
          toValue(projectId)
        );
        annotations.value = dbAnnotations.map(transformDatabaseAnnotationToApp);
      }
    } catch (err) {
      error.value = err.message;
    }
  };

  const addAnnotation = async (annotationData) => {
    if (!currentVideo.value || !toValue(user)) {
      return;
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
      } else {
        // In individual video context, create individual video annotation
        console.log(
          '🐛 [DEBUG] addAnnotation - creating individual annotation for:',
          currentVideo.value.id
        );

        const dbAnnotation = transformAppAnnotationToDatabase(
          annotationData,
          currentVideo.value.id,
          toValue(user).id,
          toValue(projectId)
        );

        const createdAnnotation = await AnnotationService.createAnnotation(
          dbAnnotation
        );

        newAnnotation = transformDatabaseAnnotationToApp(createdAnnotation);
      }

      annotations.value.push(newAnnotation);
      annotations.value.sort((a, b) => a.timestamp - b.timestamp);

      return newAnnotation;
    } catch (err) {
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
        annotation_type: actualUpdates.annotationType || 'text',
        drawing_data: actualUpdates.drawingData || null,
      };

      const updatedAnnotation = await AnnotationService.updateAnnotation(
        actualAnnotationId,
        dbUpdates
      );

      const appAnnotation = transformDatabaseAnnotationToApp(updatedAnnotation);

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
        return transformDatabaseAnnotationToApp(ann); // Transform from DB format
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
