import { ref, watch, readonly, toValue } from 'vue';
import { supabase } from './useSupabase';
import { useAuth } from './useAuth';

export function useRealtimeTimeline(videoId, currentTime, isPlaying) {
  const { user } = useAuth();
  const connectedUsers = ref(new Map());
  const isFollowingUser = ref(null);
  const isBroadcasting = ref(false);

  let timelineChannel = null;

  const setupTimelineSync = () => {
    if (!toValue(videoId) || !toValue(user)) return;

    timelineChannel = supabase.channel(`timeline:${toValue(videoId)}`);

    // Listen for timeline updates from other users
    timelineChannel
      .on('broadcast', { event: 'timeline_update' }, (payload) => {
        const { userId, currentTime, isPlaying, timestamp } = payload.payload;

        if (userId !== toValue(user).id) {
          connectedUsers.value.set(userId, {
            currentTime,
            isPlaying,
            timestamp,
            lastSeen: new Date(),
          });
        }
      })
      .on('broadcast', { event: 'follow_request' }, (payload) => {
        const { fromUserId, toUserId } = payload.payload;

        if (toUserId === toValue(user).id) {
          // Handle follow request
        }
      })
      .subscribe();
  };

  const broadcastTimelineUpdate = () => {
    if (!timelineChannel || !isBroadcasting.value) return;

    timelineChannel.send({
      type: 'broadcast',
      event: 'timeline_update',
      payload: {
        userId: toValue(user).id,
        currentTime: toValue(currentTime),
        isPlaying: toValue(isPlaying),
        timestamp: Date.now(),
      },
    });
  };

  const followUser = (userId) => {
    isFollowingUser.value = userId;

    // Send follow request
    if (timelineChannel) {
      timelineChannel.send({
        type: 'broadcast',
        event: 'follow_request',
        payload: {
          fromUserId: toValue(user).id,
          toUserId: userId,
        },
      });
    }
  };

  const stopFollowing = () => {
    isFollowingUser.value = null;
  };

  const startBroadcasting = () => {
    isBroadcasting.value = true;
  };

  const stopBroadcasting = () => {
    isBroadcasting.value = false;
  };

  // Watch for timeline changes and broadcast if enabled
  watch([currentTime, isPlaying], () => {
    if (isBroadcasting.value) {
      broadcastTimelineUpdate();
    }
  });

  // Follow another user's timeline
  watch(isFollowingUser, (userId) => {
    if (userId && connectedUsers.value.has(userId)) {
      const userData = connectedUsers.value.get(userId);
      // Emit seek event to parent component
      // This would be handled by the parent to actually seek the video
    }
  });

  const cleanup = () => {
    if (timelineChannel) {
      supabase.removeChannel(timelineChannel);
      timelineChannel = null;
    }
    connectedUsers.value.clear();
    isFollowingUser.value = null;
    isBroadcasting.value = false;
  };

  return {
    connectedUsers: readonly(connectedUsers),
    isFollowingUser: readonly(isFollowingUser),
    isBroadcasting: readonly(isBroadcasting),
    setupTimelineSync,
    followUser,
    stopFollowing,
    startBroadcasting,
    stopBroadcasting,
    cleanup,
  };
}
