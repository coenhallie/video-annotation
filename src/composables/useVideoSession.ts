import { ref, readonly, onUnmounted, toValue } from 'vue';
import { supabase } from './useSupabase';
import { useAuth } from './useAuth';
import { ShareService } from '../services/shareService';
import { CommentService } from '../services/commentService';
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
      console.warn(
        '🎬 [useVideoSession] Cannot start session: missing video ID'
      );
      return;
    }

    try {
      console.log('🎬 [useVideoSession] Starting session for:', {
        videoId: currentVideoId,
        userId: currentUser?.id || 'anonymous',
      });

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
          console.error(
            '🎬 [useVideoSession] Failed to start session - RPC error:',
            error
          );
          // Continue without session tracking if RPC fails
        } else {
          console.log('🎬 [useVideoSession] Session started successfully');
        }
      } else if (!currentUser) {
        console.log(
          '🎬 [useVideoSession] Starting anonymous session for shared video:',
          currentVideoId
        );
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
        .update({ isActive: false })
        .eq('videoId', toValue(videoId))
        .eq('userId', toValue(user).id);

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
        videoId: currentVideoId,
        userId: currentUser.id,
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

  // ===== COMMENT PERMISSION METHODS =====

  /**
   * Initialize comment permissions for the current video
   */
  const initializeCommentPermissions = async (currentVideoId: string) => {
    try {
      console.log(
        '🔍 [useVideoSession] Initializing comment permissions for:',
        currentVideoId
      );

      // Check if this is a shared video by trying to validate shared access
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

        console.log(
          '✅ [useVideoSession] Comment permissions initialized for shared video:',
          permissionContext
        );
      } else {
        // For non-shared videos, set default permissions based on authentication
        const currentUser = toValue(user);
        commentPermissions.value = {
          canComment: !!currentUser,
          isAnonymous: false,
        };

        console.log(
          '✅ [useVideoSession] Comment permissions initialized for regular video'
        );
      }
    } catch (error) {
      console.error(
        '❌ [useVideoSession] Error initializing comment permissions:',
        error
      );
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

      console.log('🔍 [useVideoSession] Creating anonymous session:', {
        displayName,
        videoId: currentVideoId,
      });

      const session = await ShareService.createAnonymousSessionForSharedVideo(
        currentVideoId,
        displayName
      );

      anonymousSession.value = session;

      // Update comment permissions with the new session
      await initializeCommentPermissions(currentVideoId);

      console.log(
        '✅ [useVideoSession] Anonymous session created successfully'
      );
      return session;
    } catch (error) {
      console.error(
        '❌ [useVideoSession] Error creating anonymous session:',
        error
      );
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
