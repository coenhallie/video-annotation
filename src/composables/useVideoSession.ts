import { ref, readonly, onUnmounted, toValue } from 'vue';
import { supabase } from './useSupabase';
import { useAuth } from './useAuth';
import { ShareService } from '../services/shareService';
import type { CommentPermissionContext } from '../services/shareService';
import type { AnonymousSession } from '../types/database';

export function useVideoSession(videoId) {
  const { user } = useAuth();
  const currentSession = ref(null);
  const isSessionActive = ref(false);
  const lastActivity = ref(new Date());

  // Comment-related state
  const commentPermissions = ref<CommentPermissionContext>({
    canComment: false,
    isAnonymous: false,
  });
  const anonymousSession = ref<AnonymousSession | null>(null);
  const isSharedVideo = ref(false);

  let activityInterval = null;
  let heartbeatInterval = null;

  const startSession = async () => {
    const currentVideoId = toValue(videoId);
    const currentUser = toValue(user);

    if (!currentVideoId) {
      return;
    }

    try {
      // Check if this is a shared video and initialize comment permissions
      await initializeCommentPermissions(currentVideoId);

      // For authenticated users with valid UUID video IDs
      if (currentUser && isValidUUID(currentVideoId)) {
        // Update session activity
        const { data, error } = await supabase.rpc('update_session_activity', {
          p_video_id: currentVideoId,
          p_user_id: currentUser.id,
        });

        if (error) {
          // Continue without session tracking if RPC fails
        } else {
        }
      } else if (!currentUser) {
      } else {
      }

      isSessionActive.value = true;
      lastActivity.value = new Date();

      // Set up activity tracking
      setupActivityTracking();
      setupHeartbeat();
    } catch (error) {
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
        .update({ isActive: false })
        .eq('videoId', toValue(videoId))
        .eq('userId', toValue(user).id);

      if (error) throw error;

      isSessionActive.value = false;
      cleanup();
    } catch (error) {}
  };

  /**
   * Reset all session state for project switching
   * This clears all session-related data without ending the database session
   */
  const resetSessionState = () => {
    console.log('🧹 [VideoSession] Resetting session state...');

    // Reset session state
    currentSession.value = null;
    isSessionActive.value = false;
    lastActivity.value = new Date();

    // Reset comment-related state
    commentPermissions.value = {
      canComment: false,
      isAnonymous: false,
    };
    anonymousSession.value = null;
    isSharedVideo.value = false;

    // Clean up intervals
    cleanup();

    console.log('✅ [VideoSession] Session state reset completed');
  };

  /**
   * Complete session cleanup including database cleanup
   * This should be called when completely switching away from video annotation
   */
  const completeSessionCleanup = async () => {
    console.log('🧹 [VideoSession] Starting complete session cleanup...');

    try {
      // End the database session
      await endSession();

      // Reset all state
      resetSessionState();

      console.log('✅ [VideoSession] Complete session cleanup completed');
    } catch (error) {
      console.error('❌ [VideoSession] Error during complete cleanup:', error);
      // Still reset state even if database cleanup fails
      resetSessionState();
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
      return;
    }

    // Skip session activity for non-UUID video IDs (like upload IDs)
    if (!isValidUUID(currentVideoId)) {
      lastActivity.value = new Date();
      return;
    }

    try {
      const { data, error } = await supabase.rpc('update_session_activity', {
        p_video_id: currentVideoId,
        p_user_id: currentUser.id,
      });

      if (error) {
        // Don't throw error to prevent disrupting the app
        return;
      }

      lastActivity.value = new Date();
    } catch (error) {
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

  // ===== COMMENT PERMISSION METHODS =====

  /**
   * Initialize comment permissions for the current video
   */
  const initializeCommentPermissions = async (currentVideoId: string) => {
    try {
      // First check if this is a shared comparison video
      let isSharedComparison = false;
      try {
        isSharedComparison = await ShareService.validateSharedComparisonAccess(
          currentVideoId
        );
      } catch (comparisonError) {
        // Not a comparison video, continue with regular video check
      }

      if (isSharedComparison) {
        // Handle shared comparison video
        isSharedVideo.value = true;
        const permissionContext =
          await ShareService.getComparisonCommentPermissionContext(
            currentVideoId,
            anonymousSession.value?.sessionId
          );
        commentPermissions.value = permissionContext;
      } else {
        // Check if this is a shared individual video
        const isShared = await ShareService.validateSharedVideoAccess(
          currentVideoId
        );
        isSharedVideo.value = isShared;

        if (isShared) {
          // Get comment permission context for shared video
          const permissionContext =
            await ShareService.getCommentPermissionContext(
              currentVideoId,
              anonymousSession.value?.sessionId
            );
          commentPermissions.value = permissionContext;
        } else {
          // For non-shared videos, set default permissions based on authentication
          const currentUser = toValue(user);
          commentPermissions.value = {
            canComment: !!currentUser,
            isAnonymous: false,
          };
        }
      }
    } catch (error) {
      // Set safe defaults
      commentPermissions.value = {
        canComment: false,
        isAnonymous: false,
        reason: 'Error checking permissions',
      };
    }
  };

  /**
   * Create an anonymous session for shared video commenting
   */
  const createAnonymousSession = async (displayName: string) => {
    try {
      const currentVideoId = toValue(videoId);
      if (!currentVideoId) {
        throw new Error('No video ID available');
      }

      // Check if this is a comparison video first
      let session;
      try {
        const isSharedComparison =
          await ShareService.validateSharedComparisonAccess(currentVideoId);
        if (isSharedComparison) {
          session =
            await ShareService.createAnonymousSessionForSharedComparison(
              currentVideoId,
              displayName
            );
        } else {
          session = await ShareService.createAnonymousSessionForSharedVideo(
            currentVideoId,
            displayName
          );
        }
      } catch (comparisonError) {
        // If comparison check fails, try as regular video
        session = await ShareService.createAnonymousSessionForSharedVideo(
          currentVideoId,
          displayName
        );
      }

      anonymousSession.value = session;

      // Update comment permissions with the new session
      await initializeCommentPermissions(currentVideoId);

      return session;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Get the current comment context for the video session
   */
  const getCommentContext = () => {
    return {
      videoId: toValue(videoId),
      userId: toValue(user)?.id,
      sessionId: anonymousSession.value?.sessionId,
      displayName: anonymousSession.value?.displayName,
      permissions: commentPermissions.value,
      isSharedVideo: isSharedVideo.value,
    };
  };

  /**
   * Check if the current user can comment on this video
   */
  const canComment = () => {
    return commentPermissions.value.canComment;
  };

  /**
   * Refresh comment permissions (useful after authentication changes)
   */
  const refreshCommentPermissions = async () => {
    const currentVideoId = toValue(videoId);
    if (currentVideoId) {
      await initializeCommentPermissions(currentVideoId);
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
    resetSessionState,
    completeSessionCleanup,
    // Comment-related exports
    commentPermissions: readonly(commentPermissions),
    anonymousSession: readonly(anonymousSession),
    isSharedVideo: readonly(isSharedVideo),
    createAnonymousSession,
    getCommentContext,
    canComment,
    refreshCommentPermissions,
  };
}
