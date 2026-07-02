import {
  ref,
  onUnmounted,
  watch,
  readonly,
  toValue,
  type Ref,
} from 'vue';
import { supabase } from './useSupabase';
import type { Annotation } from '../types/database';

type RealtimeChannel = ReturnType<typeof supabase.channel>;

export function useRealtimeAnnotations(
  videoId: Ref<string | null> | (() => string | null),
  annotations: Ref<Annotation[]>
) {
  const isConnected = ref(false);
  const activeUsers = ref<Set<string>>(new Set());
  let subscription: RealtimeChannel | null = null;
  let presenceChannel: RealtimeChannel | null = null;

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
          filter: `videoId=eq.${toValue(videoId)}`,
        },
        (payload) => {
          const newAnnotation = payload.new as Annotation;

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
          filter: `videoId=eq.${toValue(videoId)}`,
        },
        (payload) => {
          const updatedAnnotation = payload.new as Annotation;

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
          filter: `videoId=eq.${toValue(videoId)}`,
        },
        (payload) => {
          annotations.value = annotations.value.filter(
            (a) => a.id !== payload.old.id
          );
        }
      )
      .subscribe((status) => {
        isConnected.value = status === 'SUBSCRIBED';
      });
  };

  const setupPresenceTracking = (userId: string, userName: string) => {
    if (!toValue(videoId) || !userId) return;

    const channel = supabase.channel(`presence:video:${toValue(videoId)}`, {
      config: {
        presence: {
          key: userId,
        },
      },
    });
    presenceChannel = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        activeUsers.value = new Set(Object.keys(state));
      })
      .on('presence', { event: 'join' }, () => {})
      .on('presence', { event: 'leave' }, () => {})
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: userId,
            userName: userName,
            onlineAt: new Date().toISOString(),
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
