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
      console.log(
        '🔄 [useVideoAnnotations] User changed, reloading annotations'
      );
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
      console.error('Failed to initialize video:', err);
    } finally {
      isLoading.value = false;
    }
  };

  const loadAnnotations = async () => {
    if (!currentVideo.value) {
      console.log(
        '🔍 [useVideoAnnotations] No current video, skipping annotation load'
      );
      return;
    }

    if (!toValue(user)) {
      console.log('🔍 [useVideoAnnotations] No user, skipping annotation load');
      return;
    }

    try {
      console.log(
        '🔍 [useVideoAnnotations] Loading annotations for video:',
        currentVideo.value.id
      );
      const dbAnnotations = await AnnotationService.getVideoAnnotations(
        currentVideo.value.id
      );
      annotations.value = dbAnnotations.map(transformDatabaseAnnotationToApp);
      console.log(
        '✅ [useVideoAnnotations] Loaded',
        annotations.value.length,
        'annotations'
      );
    } catch (err) {
      error.value = err.message;
      console.error(
        '❌ [useVideoAnnotations] Failed to load annotations:',
        err
      );
    }
  };

  const addAnnotation = async (annotationData) => {
    if (!currentVideo.value || !toValue(user)) {
      console.error(
        '❌ [useVideoAnnotations] Cannot add annotation: missing video or user'
      );
      console.error(
        '❌ [useVideoAnnotations] currentVideo:',
        currentVideo.value
      );
      console.error('❌ [useVideoAnnotations] user:', toValue(user));
      return;
    }

    try {
      console.log(
        '🔍 [useVideoAnnotations] Adding annotation:',
        annotationData
      );
      console.log(
        '🔍 [useVideoAnnotations] Current video:',
        currentVideo.value
      );
      console.log('🔍 [useVideoAnnotations] Current user:', toValue(user));

      const dbAnnotation = transformAppAnnotationToDatabase(
        annotationData,
        currentVideo.value.id,
        toValue(user).id
      );

      console.log(
        '🔍 [useVideoAnnotations] Transformed annotation for DB:',
        dbAnnotation
      );

      const newAnnotation = await AnnotationService.createAnnotation(
        dbAnnotation
      );
      const appAnnotation = transformDatabaseAnnotationToApp(newAnnotation);

      annotations.value.push(appAnnotation);
      annotations.value.sort((a, b) => a.timestamp - b.timestamp);

      console.log(
        '✅ [useVideoAnnotations] Successfully added annotation:',
        appAnnotation
      );
      console.log(
        '✅ [useVideoAnnotations] Total annotations now:',
        annotations.value.length
      );

      return appAnnotation;
    } catch (err) {
      error.value = err.message;
      console.error('❌ [useVideoAnnotations] Failed to add annotation:', err);
      console.error('❌ [useVideoAnnotations] Error details:', {
        message: err.message,
        details: err.details,
        hint: err.hint,
        code: err.code,
      });
      throw err;
    }
  };

  const updateAnnotation = async (annotationId, updates) => {
    if (!currentVideo.value) return;

    try {
      const dbUpdates = {
        content: updates.content,
        title: updates.title,
        severity: updates.severity,
        color: updates.color,
        timestamp: updates.timestamp,
        start_frame: updates.startFrame,
        end_frame: updates.endFrame,
        duration: updates.duration,
        duration_frames: updates.durationFrames,
      };

      const updatedAnnotation = await AnnotationService.updateAnnotation(
        annotationId,
        dbUpdates
      );
      const appAnnotation = transformDatabaseAnnotationToApp(updatedAnnotation);

      const index = annotations.value.findIndex((a) => a.id === annotationId);
      if (index !== -1) {
        annotations.value[index] = appAnnotation;
      }

      return appAnnotation;
    } catch (err) {
      error.value = err.message;
      console.error('Failed to update annotation:', err);
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
      console.error('Failed to delete annotation:', err);
      throw err;
    }
  };

  // Method to load pre-existing annotations (for loading saved videos)
  const loadExistingAnnotations = (existingAnnotations) => {
    console.log(
      '🔍 [useVideoAnnotations] Loading existing annotations:',
      existingAnnotations.length
    );
    annotations.value = existingAnnotations.map((ann) => {
      // If it's already in app format, use as-is, otherwise transform
      if (ann.startFrame !== undefined) {
        return ann; // Already in app format
      } else {
        return transformDatabaseAnnotationToApp(ann); // Transform from DB format
      }
    });
    console.log(
      '✅ [useVideoAnnotations] Loaded existing annotations:',
      annotations.value.length
    );
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
