import { ref, onUnmounted, watch, readonly, toValue } from 'vue';
import { supabase } from './useSupabase';
import { transformDatabaseAnnotationToApp } from '../types/database';

export function useRealtimeAnnotations(videoId, annotations) {
  const isConnected = ref(false);
  const activeUsers = ref(new Set());
  let subscription = null;
  let presenceChannel = null;

  const setupRealtimeSubscription = () => {
    if (!toValue(videoId)) return;

    // Subscribe to annotation changes
    subscription = supabase
      .channel(`video_annotations:${toValue(videoId)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'annotations',
          filter: `video_id=eq.${toValue(videoId)}`,
        },
        (payload) => {
          console.log('New annotation:', payload.new);
          const newAnnotation = transformDatabaseAnnotationToApp(payload.new);

          // Add to annotations if not already present
          if (!annotations.value.find((a) => a.id === newAnnotation.id)) {
            annotations.value.push(newAnnotation);
            annotations.value.sort((a, b) => a.timestamp - b.timestamp);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'annotations',
          filter: `video_id=eq.${toValue(videoId)}`,
        },
        (payload) => {
          console.log('Updated annotation:', payload.new);
          const updatedAnnotation = transformDatabaseAnnotationToApp(
            payload.new
          );

          const index = annotations.value.findIndex(
            (a) => a.id === updatedAnnotation.id
          );
          if (index !== -1) {
            annotations.value[index] = updatedAnnotation;
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'annotations',
          filter: `video_id=eq.${toValue(videoId)}`,
        },
        (payload) => {
          console.log('Deleted annotation:', payload.old);
          annotations.value = annotations.value.filter(
            (a) => a.id !== payload.old.id
          );
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        isConnected.value = status === 'SUBSCRIBED';
      });
  };

  const setupPresenceTracking = (userId, userName) => {
    if (!toValue(videoId) || !userId) return;

    presenceChannel = supabase.channel(`presence:video:${toValue(videoId)}`, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        activeUsers.value = new Set(Object.keys(state));
        console.log('Active users:', Array.from(activeUsers.value));
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: userId,
            user_name: userName,
            online_at: new Date().toISOString(),
          });
        }
      });
  };

  const cleanup = () => {
    if (subscription) {
      supabase.removeChannel(subscription);
      subscription = null;
    }
    if (presenceChannel) {
      supabase.removeChannel(presenceChannel);
      presenceChannel = null;
    }
    isConnected.value = false;
    activeUsers.value.clear();
  };

  // Watch for videoId changes
  watch(
    videoId,
    (newVideoId, oldVideoId) => {
      if (oldVideoId) {
        cleanup();
      }
      if (newVideoId) {
        setupRealtimeSubscription();
      }
    },
    { immediate: true }
  );

  onUnmounted(cleanup);

  return {
    isConnected: readonly(isConnected),
    activeUsers: readonly(activeUsers),
    setupPresenceTracking,
    cleanup,
  };
}
