import {
  ref,
  reactive,
  onUnmounted,
  computed,
  watch,
  toValue,
  readonly,
} from 'vue';
import type { Ref } from 'vue';
import { supabase } from './useSupabase';
import { transformDatabaseCommentToApp } from '../types/database';
import type { Comment } from '../types/database';

export interface RealtimeCommentEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  comment: Comment;
  old?: Comment;
}

export interface CommentPresence {
  user_id: string;
  user_name: string;
  annotation_id: string;
  typing: boolean;
  online_at: string;
}

export function useRealtimeComments(annotationId: string | Ref<string>) {
  // Connection state
  const isConnected = ref(false);
  const connectionError = ref<string | null>(null);
  const reconnectAttempts = ref(0);
  const maxReconnectAttempts = 5;

  // Comment state
  const realtimeComments = ref<Comment[]>([]);
  const pendingComments = ref<Comment[]>([]);
  const commentEvents = ref<RealtimeCommentEvent[]>([]);

  // Presence state
  const activeUsers = ref(new Set<string>());
  const typingUsers = ref(new Map<string, CommentPresence>());

  // Subscriptions
  let commentSubscription: any = null;
  let presenceChannel: any = null;

  // Event handlers
  const eventHandlers = reactive({
    onCommentInsert: [] as Array<(comment: Comment) => void>,
    onCommentUpdate: [] as Array<(comment: Comment, old?: Comment) => void>,
    onCommentDelete: [] as Array<(comment: Comment) => void>,
    onUserJoin: [] as Array<(userId: string) => void>,
    onUserLeave: [] as Array<(userId: string) => void>,
    onTypingStart: [] as Array<(userId: string, userName: string) => void>,
    onTypingStop: [] as Array<(userId: string) => void>,
  });

  // Computed properties
  const currentAnnotationId = computed(() => toValue(annotationId));
  const hasActiveUsers = computed(() => activeUsers.value.size > 0);
  const typingUsersList = computed(() =>
    Array.from(typingUsers.value.values())
  );

  /**
   * Setup real-time subscription for comment changes
   */
  const setupCommentSubscription = () => {
    const currentId = currentAnnotationId.value;
    if (!currentId) return;

    console.log(
      '🔄 [RealtimeComments] Setting up subscription for annotation:',
      currentId
    );

    commentSubscription = supabase
      .channel(`annotation_comments:${currentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'annotation_comments',
          filter: `annotation_id=eq.${currentId}`,
        },
        (payload) => {
          console.log('📥 [RealtimeComments] New comment:', payload.new);
          handleCommentInsert(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'annotation_comments',
          filter: `annotation_id=eq.${currentId}`,
        },
        (payload) => {
          console.log('📝 [RealtimeComments] Updated comment:', payload.new);
          handleCommentUpdate(payload.new, payload.old);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'annotation_comments',
          filter: `annotation_id=eq.${currentId}`,
        },
        (payload) => {
          console.log('🗑️ [RealtimeComments] Deleted comment:', payload.old);
          handleCommentDelete(payload.old);
        }
      )
      .subscribe((status) => {
        console.log('🔌 [RealtimeComments] Subscription status:', status);
        isConnected.value = status === 'SUBSCRIBED';

        if (status === 'CHANNEL_ERROR') {
          connectionError.value = 'Failed to connect to real-time comments';
          handleReconnection();
        } else if (status === 'SUBSCRIBED') {
          connectionError.value = null;
          reconnectAttempts.value = 0;
        }
      });
  };

  /**
   * Setup presence tracking for users viewing/commenting on annotation
   */
  const setupPresenceTracking = (userId: string, userName: string) => {
    const currentId = currentAnnotationId.value;
    if (!currentId || !userId) return;

    console.log('👥 [RealtimeComments] Setting up presence for:', {
      userId,
      userName,
      annotationId: currentId,
    });

    presenceChannel = supabase.channel(`presence:annotation:${currentId}`, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const users = new Set(Object.keys(state));
        activeUsers.value = users;

        console.log(
          '👥 [RealtimeComments] Active users synced:',
          Array.from(users)
        );
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('👋 [RealtimeComments] User joined:', key, newPresences);
        eventHandlers.onUserJoin.forEach((handler) => handler(key));
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('👋 [RealtimeComments] User left:', key, leftPresences);
        typingUsers.value.delete(key);
        eventHandlers.onUserLeave.forEach((handler) => handler(key));
      })
      .on('broadcast', { event: 'typing_start' }, ({ payload }) => {
        console.log('⌨️ [RealtimeComments] User started typing:', payload);
        if (payload.user_id !== userId) {
          typingUsers.value.set(payload.user_id, payload);
          eventHandlers.onTypingStart.forEach((handler) =>
            handler(payload.user_id, payload.user_name)
          );
        }
      })
      .on('broadcast', { event: 'typing_stop' }, ({ payload }) => {
        console.log('⌨️ [RealtimeComments] User stopped typing:', payload);
        if (payload.user_id !== userId) {
          typingUsers.value.delete(payload.user_id);
          eventHandlers.onTypingStop.forEach((handler) =>
            handler(payload.user_id)
          );
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: userId,
            user_name: userName,
            annotation_id: currentId,
            typing: false,
            online_at: new Date().toISOString(),
          });
        }
      });
  };

  /**
   * Handle comment insert events
   */
  const handleCommentInsert = (dbComment: any) => {
    try {
      const comment = transformDatabaseCommentToApp(dbComment);

      // Check if comment already exists (avoid duplicates)
      const exists = realtimeComments.value.find((c) => c.id === comment.id);
      if (!exists) {
        realtimeComments.value.push(comment);
        realtimeComments.value.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }

      // Add to event log
      commentEvents.value.push({
        type: 'INSERT',
        comment,
      });

      // Trigger event handlers
      eventHandlers.onCommentInsert.forEach((handler) => handler(comment));
    } catch (error) {
      console.error(
        '❌ [RealtimeComments] Error handling comment insert:',
        error
      );
    }
  };

  /**
   * Handle comment update events
   */
  const handleCommentUpdate = (dbComment: any, dbOldComment?: any) => {
    try {
      const comment = transformDatabaseCommentToApp(dbComment);
      const oldComment = dbOldComment
        ? transformDatabaseCommentToApp(dbOldComment)
        : undefined;

      // Update in realtime comments array
      const index = realtimeComments.value.findIndex(
        (c) => c.id === comment.id
      );
      if (index !== -1) {
        realtimeComments.value[index] = comment;
      }

      // Add to event log
      commentEvents.value.push({
        type: 'UPDATE',
        comment,
        old: oldComment,
      });

      // Trigger event handlers
      eventHandlers.onCommentUpdate.forEach((handler) =>
        handler(comment, oldComment)
      );
    } catch (error) {
      console.error(
        '❌ [RealtimeComments] Error handling comment update:',
        error
      );
    }
  };

  /**
   * Handle comment delete events
   */
  const handleCommentDelete = (dbComment: any) => {
    try {
      const comment = transformDatabaseCommentToApp(dbComment);

      // Remove from realtime comments array
      const index = realtimeComments.value.findIndex(
        (c) => c.id === comment.id
      );
      if (index !== -1) {
        realtimeComments.value.splice(index, 1);
      }

      // Add to event log
      commentEvents.value.push({
        type: 'DELETE',
        comment,
      });

      // Trigger event handlers
      eventHandlers.onCommentDelete.forEach((handler) => handler(comment));
    } catch (error) {
      console.error(
        '❌ [RealtimeComments] Error handling comment delete:',
        error
      );
    }
  };

  /**
   * Handle reconnection logic
   */
  const handleReconnection = () => {
    if (reconnectAttempts.value >= maxReconnectAttempts) {
      console.error('❌ [RealtimeComments] Max reconnection attempts reached');
      return;
    }

    reconnectAttempts.value++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000);

    console.log(
      `🔄 [RealtimeComments] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.value})`
    );

    setTimeout(() => {
      cleanup();
      setupCommentSubscription();
    }, delay);
  };

  /**
   * Add optimistic comment (before server confirmation)
   */
  const addOptimisticComment = (comment: Comment) => {
    console.log('⚡ [RealtimeComments] Adding optimistic comment:', comment);
    pendingComments.value.push(comment);
  };

  /**
   * Remove optimistic comment (after server confirmation)
   */
  const removeOptimisticComment = (commentId: string) => {
    console.log(
      '⚡ [RealtimeComments] Removing optimistic comment:',
      commentId
    );
    const index = pendingComments.value.findIndex((c) => c.id === commentId);
    if (index !== -1) {
      pendingComments.value.splice(index, 1);
    }
  };

  /**
   * Broadcast typing status
   */
  const broadcastTyping = (
    userId: string,
    userName: string,
    isTyping: boolean
  ) => {
    if (!presenceChannel) return;

    const event = isTyping ? 'typing_start' : 'typing_stop';
    presenceChannel.send({
      type: 'broadcast',
      event,
      payload: {
        user_id: userId,
        user_name: userName,
        annotation_id: currentAnnotationId.value,
        typing: isTyping,
        timestamp: new Date().toISOString(),
      },
    });
  };

  /**
   * Event handler registration
   */
  const onCommentInsert = (handler: (comment: Comment) => void) => {
    eventHandlers.onCommentInsert.push(handler);
    return () => {
      const index = eventHandlers.onCommentInsert.indexOf(handler);
      if (index > -1) eventHandlers.onCommentInsert.splice(index, 1);
    };
  };

  const onCommentUpdate = (
    handler: (comment: Comment, old?: Comment) => void
  ) => {
    eventHandlers.onCommentUpdate.push(handler);
    return () => {
      const index = eventHandlers.onCommentUpdate.indexOf(handler);
      if (index > -1) eventHandlers.onCommentUpdate.splice(index, 1);
    };
  };

  const onCommentDelete = (handler: (comment: Comment) => void) => {
    eventHandlers.onCommentDelete.push(handler);
    return () => {
      const index = eventHandlers.onCommentDelete.indexOf(handler);
      if (index > -1) eventHandlers.onCommentDelete.splice(index, 1);
    };
  };

  const onUserJoin = (handler: (userId: string) => void) => {
    eventHandlers.onUserJoin.push(handler);
    return () => {
      const index = eventHandlers.onUserJoin.indexOf(handler);
      if (index > -1) eventHandlers.onUserJoin.splice(index, 1);
    };
  };

  const onUserLeave = (handler: (userId: string) => void) => {
    eventHandlers.onUserLeave.push(handler);
    return () => {
      const index = eventHandlers.onUserLeave.indexOf(handler);
      if (index > -1) eventHandlers.onUserLeave.splice(index, 1);
    };
  };

  const onTypingStart = (
    handler: (userId: string, userName: string) => void
  ) => {
    eventHandlers.onTypingStart.push(handler);
    return () => {
      const index = eventHandlers.onTypingStart.indexOf(handler);
      if (index > -1) eventHandlers.onTypingStart.splice(index, 1);
    };
  };

  const onTypingStop = (handler: (userId: string) => void) => {
    eventHandlers.onTypingStop.push(handler);
    return () => {
      const index = eventHandlers.onTypingStop.indexOf(handler);
      if (index > -1) eventHandlers.onTypingStop.splice(index, 1);
    };
  };

  /**
   * Cleanup subscriptions
   */
  const cleanup = () => {
    console.log('🧹 [RealtimeComments] Cleaning up subscriptions');

    if (commentSubscription) {
      supabase.removeChannel(commentSubscription);
      commentSubscription = null;
    }

    if (presenceChannel) {
      supabase.removeChannel(presenceChannel);
      presenceChannel = null;
    }

    isConnected.value = false;
    activeUsers.value.clear();
    typingUsers.value.clear();
    connectionError.value = null;
    reconnectAttempts.value = 0;
  };

  /**
   * Initialize subscriptions
   */
  const initialize = () => {
    cleanup();
    setupCommentSubscription();
  };

  // Watch for annotation ID changes
  watch(
    () => currentAnnotationId.value,
    (newId, oldId) => {
      if (oldId) {
        cleanup();
      }
      if (newId) {
        setupCommentSubscription();
      }
    },
    { immediate: true }
  );

  // Cleanup on unmount
  onUnmounted(cleanup);

  return {
    // State
    isConnected: readonly(isConnected),
    connectionError: readonly(connectionError),
    realtimeComments: readonly(realtimeComments),
    pendingComments: readonly(pendingComments),
    commentEvents: readonly(commentEvents),
    activeUsers: readonly(activeUsers),
    typingUsers: readonly(typingUsers),
    hasActiveUsers,
    typingUsersList,

    // Methods
    setupPresenceTracking,
    addOptimisticComment,
    removeOptimisticComment,
    broadcastTyping,
    initialize,
    cleanup,

    // Event handlers
    onCommentInsert,
    onCommentUpdate,
    onCommentDelete,
    onUserJoin,
    onUserLeave,
    onTypingStart,
    onTypingStop,
  };
}
