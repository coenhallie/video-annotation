import { ref, readonly, onUnmounted, toValue } from 'vue';
import { supabase } from './useSupabase';
import { useAuth } from './useAuth';

export function useVideoSession(videoId) {
  const { user } = useAuth();
  const currentSession = ref(null);
  const isSessionActive = ref(false);
  const lastActivity = ref(new Date());

  let activityInterval = null;
  let heartbeatInterval = null;

  const startSession = async () => {
    if (!toValue(user) || !toValue(videoId)) return;

    try {
      // Update session activity
      await supabase.rpc('update_session_activity', {
        p_video_id: toValue(videoId),
        p_user_id: toValue(user).id,
      });

      isSessionActive.value = true;
      lastActivity.value = new Date();

      // Set up activity tracking
      setupActivityTracking();
      setupHeartbeat();
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const endSession = async () => {
    if (!toValue(user) || !toValue(videoId)) return;

    try {
      const { error } = await supabase
        .from('video_sessions')
        .update({ is_active: false })
        .eq('video_id', toValue(videoId))
        .eq('user_id', toValue(user).id);

      if (error) throw error;

      isSessionActive.value = false;
      cleanup();
    } catch (error) {
      console.error('Failed to end session:', error);
    }
  };

  const updateActivity = async () => {
    if (!isSessionActive.value) return;

    try {
      await supabase.rpc('update_session_activity', {
        p_video_id: toValue(videoId),
        p_user_id: toValue(user).id,
      });
      lastActivity.value = new Date();
    } catch (error) {
      console.error('Failed to update activity:', error);
    }
  };

  const setupActivityTracking = () => {
    // Track user interactions
    const events = ['click', 'keydown', 'mousemove', 'scroll'];

    const handleActivity = () => {
      lastActivity.value = new Date();
    };

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Clean up event listeners
    const cleanup = () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };

    return cleanup;
  };

  const setupHeartbeat = () => {
    // Send heartbeat every 30 seconds
    heartbeatInterval = setInterval(async () => {
      const timeSinceActivity = Date.now() - lastActivity.value.getTime();

      // If no activity for 5 minutes, end session
      if (timeSinceActivity > 5 * 60 * 1000) {
        await endSession();
        return;
      }

      // Update activity if recent
      if (timeSinceActivity < 60 * 1000) {
        await updateActivity();
      }
    }, 30 * 1000);
  };

  const cleanup = () => {
    if (activityInterval) {
      clearInterval(activityInterval);
      activityInterval = null;
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  onUnmounted(() => {
    endSession();
    cleanup();
  });

  return {
    currentSession: readonly(currentSession),
    isSessionActive: readonly(isSessionActive),
    lastActivity: readonly(lastActivity),
    startSession,
    endSession,
    updateActivity,
  };
}
