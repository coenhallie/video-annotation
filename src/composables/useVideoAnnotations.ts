import { ref, readonly, toValue, watch } from 'vue';
import { VideoService } from '../services/videoService';
import { AnnotationService } from '../services/annotationService';
import { useAuth } from './useAuth';
import {
  transformDatabaseAnnotationToApp,
  transformAppAnnotationToDatabase,
} from '../types/database';

export function useVideoAnnotations(videoUrl, videoId) {
  const { user } = useAuth();

  // State
  const currentVideo = ref(null);
  const annotations = ref([]);
  const isLoading = ref(false);
  const error = ref(null);

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

      // Create or update video record (handles duplicates automatically)
      const video = await VideoService.createVideo({
        owner_id: toValue(user).id,
        title: `Video ${new Date().toLocaleDateString()}`,
        url: toValue(videoUrl),
        video_id: toValue(videoId),
        video_type: 'url',
        fps: videoData.fps || 30,
        duration: videoData.duration || 0,
        total_frames: videoData.totalFrames || 0,
        is_public: false,
      });

      currentVideo.value = video;

      // Load annotations for this video
      await loadAnnotations();
    } catch (err) {
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
      const dbAnnotations = await AnnotationService.getVideoAnnotations(
        currentVideo.value.id
      );

      annotations.value = dbAnnotations.map(transformDatabaseAnnotationToApp);
    } catch (err) {
      error.value = err.message;
    }
  };

  const addAnnotation = async (annotationData) => {
    if (!currentVideo.value || !toValue(user)) {
      return;
    }

    try {
      const dbAnnotation = transformAppAnnotationToDatabase(
        annotationData,
        currentVideo.value.id,
        toValue(user).id
      );

      const newAnnotation = await AnnotationService.createAnnotation(
        dbAnnotation
      );

      const appAnnotation = transformDatabaseAnnotationToApp(newAnnotation);

      annotations.value.push(appAnnotation);
      annotations.value.sort((a, b) => a.timestamp - b.timestamp);

      return appAnnotation;
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
    initializeVideo,
    loadAnnotations,
    loadExistingAnnotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
  };
}
