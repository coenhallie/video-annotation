import { ref, reactive, computed } from 'vue';
import { supabase } from './useSupabase';
import type { Comment } from '../types/database';

// Global state for comment tracking across all annotations
const newCommentsByAnnotation = ref(new Map<string, Set<string>>());
const commentCountsByAnnotation = ref(new Map<string, number>());
const globalCommentSubscriptions = ref(new Map<string, any>());
const isGlobalSubscriptionActive = ref(false);

export interface GlobalCommentEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  comment: Comment;
  annotationId: string;
}

export function useGlobalComments() {
  // Event handlers for global comment events
  const eventHandlers = reactive({
    onNewComment: [] as Array<(event: GlobalCommentEvent) => void>,
    onCommentUpdate: [] as Array<(event: GlobalCommentEvent) => void>,
    onCommentDelete: [] as Array<(event: GlobalCommentEvent) => void>,
  });

  /**
   * Setup global comment subscription for all annotations in a video
   */
  const setupGlobalCommentSubscription = (
    videoId: string,
    currentUserId?: string
  ) => {
    if (isGlobalSubscriptionActive.value) {
      return;
    }

    const subscription = supabase
      .channel(`video_comments:${videoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'annotation_comments',
        },
        (payload) => {
          handleGlobalCommentInsert(payload.new, currentUserId, videoId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'annotation_comments',
        },
        (payload) => {
          handleGlobalCommentUpdate(
            payload.new,
            payload.old,
            currentUserId,
            videoId
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'annotation_comments',
        },
        (payload) => {
          handleGlobalCommentDelete(payload.old, currentUserId, videoId);
        }
      )
      .subscribe((status) => {
        isGlobalSubscriptionActive.value = status === 'SUBSCRIBED';
      });

    globalCommentSubscriptions.value.set(videoId, subscription);
  };

  /**
   * Handle global comment insert events
   */
  const handleGlobalCommentInsert = (
    dbComment: any,
    currentUserId?: string,
    videoId?: string
  ) => {
    try {
      const comment = dbComment as Comment;

      // Filter comments by video ID - we need to verify this comment belongs to our video
      // Since we can't filter at the database level, we'll need to check annotation ownership
      if (videoId) {
        // We'll need to verify the annotation belongs to this video
        // For now, we'll process all comments and let the individual annotation handlers filter
      }

      // Don't show indicator for comments from the current user
      if (currentUserId && comment.userId === currentUserId) {
        return;
      }

      // Add to new comments tracking
      if (!newCommentsByAnnotation.value.has(comment.annotationId)) {
        newCommentsByAnnotation.value.set(comment.annotationId, new Set());
      }
      newCommentsByAnnotation.value.get(comment.annotationId)!.add(comment.id);

      // Update comment count
      const currentCount =
        commentCountsByAnnotation.value.get(comment.annotationId) || 0;
      commentCountsByAnnotation.value.set(
        comment.annotationId,
        currentCount + 1
      );

      // Trigger event handlers
      const event: GlobalCommentEvent = {
        type: 'INSERT',
        comment,
        annotationId: comment.annotationId,
      };
      eventHandlers.onNewComment.forEach((handler) => handler(event));
    } catch (error) {}
  };

  /**
   * Handle global comment update events
   */
  const handleGlobalCommentUpdate = (
    dbComment: any,
    dbOldComment?: any,
    currentUserId?: string,
    videoId?: string
  ) => {
    try {
      const comment = dbComment as Comment;

      // Trigger event handlers
      const event: GlobalCommentEvent = {
        type: 'UPDATE',
        comment,
        annotationId: comment.annotationId,
      };
      eventHandlers.onCommentUpdate.forEach((handler) => handler(event));
    } catch (error) {}
  };

  /**
   * Handle global comment delete events
   */
  const handleGlobalCommentDelete = (
    dbComment: any,
    currentUserId?: string,
    videoId?: string
  ) => {
    try {
      const comment = dbComment as Comment;

      // Remove from new comments tracking
      if (newCommentsByAnnotation.value.has(comment.annotationId)) {
        newCommentsByAnnotation.value
          .get(comment.annotationId)!
          .delete(comment.id);
      }

      // Update comment count
      const currentCount =
        commentCountsByAnnotation.value.get(comment.annotationId) || 0;
      commentCountsByAnnotation.value.set(
        comment.annotationId,
        Math.max(0, currentCount - 1)
      );

      // Trigger event handlers
      const event: GlobalCommentEvent = {
        type: 'DELETE',
        comment,
        annotationId: comment.annotationId,
      };
      eventHandlers.onCommentDelete.forEach((handler) => handler(event));
    } catch (error) {}
  };

  /**
   * Mark comments as viewed for an annotation
   */
  const markCommentsAsViewed = (annotationId: string) => {
    newCommentsByAnnotation.value.delete(annotationId);
  };

  /**
   * Check if annotation has new comments
   */
  const hasNewComments = (annotationId: string): boolean => {
    const newComments = newCommentsByAnnotation.value.get(annotationId);
    return newComments ? newComments.size > 0 : false;
  };

  /**
   * Get new comment count for annotation
   */
  const getNewCommentCount = (annotationId: string): number => {
    const newComments = newCommentsByAnnotation.value.get(annotationId);
    return newComments ? newComments.size : 0;
  };

  /**
   * Get total comment count for annotation
   */
  const getTotalCommentCount = (annotationId: string): number => {
    return commentCountsByAnnotation.value.get(annotationId) || 0;
  };

  /**
   * Initialize comment counts for existing annotations
   */
  const initializeCommentCounts = (
    annotations: Array<{ id: string; commentCount?: number }>
  ) => {
    annotations.forEach((annotation) => {
      if (annotation.commentCount !== undefined) {
        commentCountsByAnnotation.value.set(
          annotation.id,
          annotation.commentCount
        );
      }
    });
  };

  /**
   * Cleanup global subscriptions
   */
  const cleanup = () => {
    globalCommentSubscriptions.value.forEach((subscription) => {
      supabase.removeChannel(subscription);
    });

    globalCommentSubscriptions.value.clear();
    isGlobalSubscriptionActive.value = false;
    newCommentsByAnnotation.value.clear();
    commentCountsByAnnotation.value.clear();
  };

  /**
   * Event handler registration
   */
  const onNewComment = (handler: (event: GlobalCommentEvent) => void) => {
    eventHandlers.onNewComment.push(handler);
    return () => {
      const index = eventHandlers.onNewComment.indexOf(handler);
      if (index > -1) eventHandlers.onNewComment.splice(index, 1);
    };
  };

  const onCommentUpdate = (handler: (event: GlobalCommentEvent) => void) => {
    eventHandlers.onCommentUpdate.push(handler);
    return () => {
      const index = eventHandlers.onCommentUpdate.indexOf(handler);
      if (index > -1) eventHandlers.onCommentUpdate.splice(index, 1);
    };
  };

  const onCommentDelete = (handler: (event: GlobalCommentEvent) => void) => {
    eventHandlers.onCommentDelete.push(handler);
    return () => {
      const index = eventHandlers.onCommentDelete.indexOf(handler);
      if (index > -1) eventHandlers.onCommentDelete.splice(index, 1);
    };
  };

  // Computed properties
  const totalNewComments = computed(() => {
    let total = 0;
    newCommentsByAnnotation.value.forEach((comments) => {
      total += comments.size;
    });
    return total;
  });

  return {
    // State
    isGlobalSubscriptionActive,
    totalNewComments,

    // Methods
    setupGlobalCommentSubscription,
    markCommentsAsViewed,
    hasNewComments,
    getNewCommentCount,
    getTotalCommentCount,
    initializeCommentCounts,
    cleanup,

    // Event handlers
    onNewComment,
    onCommentUpdate,
    onCommentDelete,
  };
}
