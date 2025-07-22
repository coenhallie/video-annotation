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
    const currentVideoId = toValue(videoId);
    const currentUser = toValue(user);

    if (!currentUser || !currentVideoId) {
      console.warn(
        '🎬 [useVideoSession] Cannot start session: missing video ID or user'
      );
      return;
    }

    try {
      console.log('🎬 [useVideoSession] Starting session for:', {
        video_id: currentVideoId,
        user_id: currentUser.id,
      });

      // Only call RPC for valid UUID video IDs
      if (isValidUUID(currentVideoId)) {
        // Update session activity
        const { data, error } = await supabase.rpc('update_session_activity', {
          p_video_id: currentVideoId,
          p_user_id: currentUser.id,
        });

        if (error) {
          console.error(
            '🎬 [useVideoSession] Failed to start session - RPC error:',
            error
          );
          // Continue without session tracking if RPC fails
        } else {
          console.log('🎬 [useVideoSession] Session started successfully');
        }
      } else {
        console.log(
          '🎬 [useVideoSession] Skipping RPC for non-UUID video ID:',
          currentVideoId
        );
      }

      isSessionActive.value = true;
      lastActivity.value = new Date();

      // Set up activity tracking
      setupActivityTracking();
      setupHeartbeat();
    } catch (error) {
      console.error('🎬 [useVideoSession] Failed to start session:', error);
      // Continue without session tracking if it fails
      isSessionActive.value = true;
      lastActivity.value = new Date();
      setupActivityTracking();
      setupHeartbeat();
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

  const isValidUUID = (str: string) => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  const updateActivity = async () => {
    if (!isSessionActive.value) return;

    const currentVideoId = toValue(videoId);
    const currentUser = toValue(user);

    if (!currentVideoId || !currentUser?.id) {
      console.warn(
        '🎬 [useVideoSession] Cannot update activity: missing video ID or user ID'
      );
      return;
    }

    // Skip session activity for non-UUID video IDs (like upload IDs)
    if (!isValidUUID(currentVideoId)) {
      console.log(
        '🎬 [useVideoSession] Skipping session activity for non-UUID video ID:',
        currentVideoId
      );
      lastActivity.value = new Date();
      return;
    }

    try {
      console.log('🎬 [useVideoSession] Updating session activity for:', {
        video_id: currentVideoId,
        user_id: currentUser.id,
      });

      const { data, error } = await supabase.rpc('update_session_activity', {
        p_video_id: currentVideoId,
        p_user_id: currentUser.id,
      });

      if (error) {
        console.error('🎬 [useVideoSession] RPC error:', error);
        // Don't throw error to prevent disrupting the app
        return;
      }

      lastActivity.value = new Date();
      console.log('🎬 [useVideoSession] Activity updated successfully');
    } catch (error) {
      console.error('🎬 [useVideoSession] Failed to update activity:', error);
      // Don't throw error to prevent disrupting the app
    }
  };

  const setupActivityTracking = () => {
    // Track user interactions (removed mousemove to prevent conflicts with drawing)
    const events = ['click', 'keydown', 'scroll'];

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
