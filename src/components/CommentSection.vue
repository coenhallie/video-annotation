<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { useRealtimeComments } from '../composables/useRealtimeComments';
import { useAuth } from '../composables/useAuth';
import { CommentService } from '../services/commentService';
import CommentItem from './CommentItem.vue';
import CommentForm from './CommentForm.vue';

const props = defineProps({
  annotationId: {
    type: String,
    required: true,
  },
  readOnly: {
    type: Boolean,
    default: false,
  },
  currentUser: {
    type: Object,
    default: null,
  },
  videoId: {
    type: String,
    default: null,
  },
});

const emit = defineEmits([
  'comment-added',
  'comment-updated',
  'comment-deleted',
]);

// Auth composable
const { user, isAuthenticated } = useAuth();

// Real-time composable
const {
  realtimeComments,
  pendingComments,
  setupPresenceTracking,
  addOptimisticComment,
  removeOptimisticComment,
  broadcastTyping,
  onCommentInsert,
  onCommentUpdate,
  onCommentDelete,
  onUserJoin,
  onUserLeave,
  onTypingStart,
  onTypingStop,
} = useRealtimeComments(() => props.annotationId);

// State
const comments = ref([]);
const isLoading = ref(false);
const error = ref(null);
const editingComment = ref(null);
const anonymousSession = ref(null);
const permissions = ref({
  canComment: false,
  canModerate: false,
});

// Real-time state
const newCommentIndicators = ref(new Set());
const typingTimeout = ref(null);

// Computed
const allComments = computed(() => {
  try {
    // Merge local comments with real-time comments and pending comments, avoiding duplicates
    const commentMap = new Map();

    // Add local comments
    if (Array.isArray(comments.value)) {
      comments.value.forEach((comment) => {
        if (comment && comment.id) {
          commentMap.set(comment.id, comment);
        }
      });
    }

    // Add real-time comments (will override local if same ID)
    if (Array.isArray(realtimeComments.value)) {
      realtimeComments.value.forEach((comment) => {
        if (comment && comment.id) {
          commentMap.set(comment.id, comment);
        }
      });
    }

    // Add pending comments (optimistic updates)
    if (Array.isArray(pendingComments.value)) {
      pendingComments.value.forEach((comment) => {
        if (comment && comment.id) {
          commentMap.set(comment.id, comment);
        }
      });
    }

    // Optimistic and realtime copies of a comment carry no joined `user` row -
    // only the reload does. Without this, a comment you just posted shows up as
    // "User" with a placeholder avatar until the page is reloaded.
    return Array.from(commentMap.values()).map((comment) =>
      !comment.user && !comment.isAnonymous && comment.userId === currentUserId.value
        ? { ...comment, user: currentUserProfile.value }
        : comment
    );
  } catch (error) {
    console.error('Error in allComments computed:', error);
    return [];
  }
});

const sortedComments = computed(() => {
  try {
    return [...allComments.value].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
  } catch (error) {
    console.error('Error in sortedComments computed:', error);
    return [];
  }
});

/** Shaped like the `users` row CommentService joins, so CommentItem reads it
 *  the same way whether the comment came from the server or from this tab. */
const currentUserProfile = computed(() => {
  const authUser = user.value;
  const meta = authUser?.user_metadata ?? {};
  return {
    id: currentUserId.value,
    email: props.currentUser?.email || authUser?.email || null,
    fullName: meta.full_name || meta.name || null,
    avatarUrl: meta.avatar_url || null,
  };
});

const currentUserId = computed(() => {
  try {
    return props.currentUser?.id || user.value?.id || null;
  } catch (error) {
    console.error('Error in currentUserId computed:', error);
    return null;
  }
});

const isAnonymous = computed(() => {
  try {
    return !isAuthenticated.value;
  } catch (error) {
    console.error('Error in isAnonymous computed:', error);
    return true;
  }
});

/**
 * Whether to render the composer. Narrower than `canComment` alone: a
 * view-only share denies commenting outright even for the video's owner.
 */
const canCompose = computed(
  () => permissions.value.canComment && !props.readOnly
);

/**
 * What stands in for the composer when there isn't one. Exactly one line: an
 * empty thread is already visibly empty, so saying why you cannot write in it
 * is the only thing left worth saying.
 */
const composerNote = computed(() => {
  if (canCompose.value) return '';
  if (!permissions.value.canComment) {
    return permissions.value.reason || 'You cannot comment on this annotation';
  }
  return 'Comments are view-only on this share';
});

// Methods
const loadComments = async () => {
  if (!props.annotationId) return;

  try {
    isLoading.value = true;
    error.value = null;

    console.log(
      '🔍 [CommentSection] Loading comments for annotation:',
      props.annotationId
    );

    const [commentsData, permissionsData] = await Promise.all([
      CommentService.getAnnotationComments(props.annotationId),
      CommentService.canUserCommentOnAnnotation(
        props.annotationId,
        currentUserId.value
      ),
    ]);

    comments.value = commentsData;
    permissions.value = permissionsData;

    console.log('✅ [CommentSection] Loaded comments:', {
      count: commentsData.length,
      permissions: permissionsData,
    });
  } catch (err) {
    console.error('❌ [CommentSection] Error loading comments:', err);
    error.value = err.message || 'Failed to load comments';
  } finally {
    isLoading.value = false;
  }
};

const loadAnonymousSession = () => {
  if (props.currentUser) return;

  // Try to get existing session from localStorage
  const sessionId = localStorage.getItem('anonymousSessionId');
  if (sessionId) {
    CommentService.getAnonymousSession(sessionId)
      .then((session) => {
        if (session) {
          anonymousSession.value = session;
          // Update activity
          CommentService.updateAnonymousSessionActivity(sessionId);
        } else {
          // Session not found, clear localStorage
          localStorage.removeItem('anonymousSessionId');
        }
      })
      .catch((err) => {
        console.error(
          '❌ [CommentSection] Error loading anonymous session:',
          err
        );
        localStorage.removeItem('anonymousSessionId');
      });
  }
};

const createAnonymousSession = async (displayName, videoId) => {
  try {
    const session = await CommentService.createAnonymousSession({
      displayName: displayName,
      videoId: videoId,
    });

    anonymousSession.value = session;
    localStorage.setItem('anonymousSessionId', session.sessionId);

    console.log('✅ [CommentSection] Created anonymous session:', session);
    return session;
  } catch (err) {
    console.error('❌ [CommentSection] Error creating anonymous session:', err);
    throw err;
  }
};

const startEditComment = (comment) => {
  if (props.readOnly) return;

  editingComment.value = comment;
};

const cancelCommentForm = () => {
  editingComment.value = null;
};

const handleCommentSubmit = async (commentData) => {
  try {
    let result;

    if (editingComment.value) {
      // Update existing comment with optimistic update
      const optimisticComment = {
        ...editingComment.value,
        content: commentData.content,
        updatedAt: new Date().toISOString(),
      };

      // Add optimistic update
      addOptimisticComment(optimisticComment);

      try {
        result = await CommentService.updateCommentWithRealtime(
          editingComment.value.id,
          { content: commentData.content },
          anonymousSession.value?.sessionId
        );

        // Remove optimistic comment
        removeOptimisticComment(optimisticComment.id);

        // Update comment in local array
        const index = comments.value.findIndex(
          (c) => c.id === editingComment.value.id
        );
        if (index !== -1) {
          comments.value[index] = result;
        }

        emit('comment-updated', result);
        console.log('✅ [CommentSection] Comment updated:', result);
      } catch (updateError) {
        // Remove failed optimistic update
        removeOptimisticComment(optimisticComment.id);
        throw updateError;
      }
    } else {
      // Create new comment with optimistic update
      const createParams = {
        annotationId: props.annotationId,
        content: commentData.content,
      };

      if (props.currentUser) {
        createParams.userId = currentUserId.value;
        createParams.isAnonymous = false;
      } else {
        // Handle anonymous comment
        let session = anonymousSession.value;

        if (!session && commentData.displayName) {
          // Create new session if needed
          const videoIdToUse = commentData.videoId || props.videoId;
          if (!videoIdToUse) {
            throw new Error('Video ID is required for anonymous comments');
          }
          session = await createAnonymousSession(
            commentData.displayName,
            videoIdToUse
          );
        }

        if (!session) {
          throw new Error('Anonymous session required for anonymous comments');
        }

        createParams.sessionId = session.sessionId;
        createParams.userDisplayName = session.displayName;
        createParams.isAnonymous = true;
      }

      // Create optimistic comment
      const optimisticComment = {
        id: `temp_${Date.now()}`,
        annotationId: props.annotationId,
        content: commentData.content,
        userId: createParams.userId || null,
        sessionId: createParams.sessionId || null,
        userDisplayName: createParams.userDisplayName || null,
        isAnonymous: createParams.isAnonymous || false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: props.currentUser ? props.currentUser : null,
      };

      // Add optimistic comment
      addOptimisticComment(optimisticComment);

      try {
        result = await CommentService.createCommentWithRealtime(createParams);

        // Remove optimistic comment
        removeOptimisticComment(optimisticComment.id);

        // Add to local array immediately for display
        comments.value.push(result);
        comments.value.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        // Emit the event only once here - don't emit again in real-time handler
        emit('comment-added', result);
        console.log('✅ [CommentSection] Comment created:', result);
      } catch (createError) {
        // Remove failed optimistic update
        removeOptimisticComment(optimisticComment.id);
        throw createError;
      }
    }

    // Close form
    cancelCommentForm();
  } catch (err) {
    console.error('❌ [CommentSection] Error submitting comment:', err);
    error.value = err.message || 'Failed to submit comment';
  }
};

const handleCommentEdit = (comment) => {
  startEditComment(comment);
};

const handleCommentDelete = async (comment) => {
  if (!confirm('Are you sure you want to delete this comment?')) return;

  try {
    await CommentService.deleteCommentWithRealtime(
      comment.id,
      anonymousSession.value?.sessionId
    );

    // Remove comment from local array
    const index = comments.value.findIndex((c) => c.id === comment.id);
    if (index !== -1) {
      comments.value.splice(index, 1);
    }

    emit('comment-deleted', comment);
    console.log('✅ [CommentSection] Comment deleted:', comment.id);
  } catch (err) {
    console.error('❌ [CommentSection] Error deleting comment:', err);
    error.value = err.message || 'Failed to delete comment';
  }
};

const handleCommentModerate = async (comment) => {
  if (!confirm('Are you sure you want to delete this comment?')) return;

  try {
    // Use the updated moderateComment method that handles both authenticated and anonymous users
    await CommentService.moderateComment(
      comment.id,
      currentUserId.value,
      anonymousSession.value?.sessionId
    );

    // Remove comment from local array
    const index = comments.value.findIndex((c) => c.id === comment.id);
    if (index !== -1) {
      comments.value.splice(index, 1);
    }

    emit('comment-deleted', comment);
    console.log('✅ [CommentSection] Comment moderated:', comment.id);
  } catch (err) {
    console.error('❌ [CommentSection] Error moderating comment:', err);
    error.value = err.message || 'Failed to moderate comment';
  }
};

const canEditComment = (comment) => {
  if (props.readOnly) return false;

  console.log('🔍 [CommentSection] canEditComment check:', {
    commentId: comment.id,
    commentUserId: comment.userId,
    currentUserId: currentUserId.value,
    isAuthenticated: isAuthenticated.value,
    userValue: user.value,
    commentUserIdType: typeof comment.userId,
    currentUserIdType: typeof currentUserId.value,
    strictEqual: comment.userId === currentUserId.value,
    looseEqual: comment.userId == currentUserId.value,
  });

  if (props.currentUser) {
    const canEdit = comment.userId === currentUserId.value;
    console.log(
      '🔍 [CommentSection] Authenticated user canEdit result:',
      canEdit
    );
    return canEdit;
  } else {
    const canEdit = comment.sessionId === anonymousSession.value?.sessionId;
    console.log('🔍 [CommentSection] Anonymous user canEdit result:', canEdit);
    return canEdit;
  }
};

const canModerateComment = (comment) => {
  if (props.readOnly) return false;

  // User can moderate if they own the comment or have moderation permissions
  return canEditComment(comment) || permissions.value.canModerate;
};

// Watchers
watch(() => props.annotationId, loadComments, { immediate: true });

// Real-time event handlers
const handleRealtimeCommentInsert = (comment) => {
  console.log('📥 [CommentSection] Real-time comment insert:', comment);

  // Check if comment already exists in local array (avoid duplicates)
  const exists = comments.value.find((c) => c.id === comment.id);
  if (!exists) {
    // Add comment to local array for immediate display
    comments.value.push(comment);
    comments.value.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Only emit for comments from other users (not the current user)
    // This prevents double counting when the current user adds a comment
    const isFromCurrentUser =
      currentUserId.value && comment.userId === currentUserId.value;
    const isFromCurrentSession =
      anonymousSession.value &&
      comment.sessionId === anonymousSession.value.sessionId;

    if (!isFromCurrentUser && !isFromCurrentSession) {
      // This is a comment from another user, emit the event
      emit('comment-added', comment);
    }
  }

  // Add visual indicator for new comment from other users
  const isOwnComment =
    (currentUserId.value && comment.userId === currentUserId.value) ||
    (anonymousSession.value &&
      comment.sessionId === anonymousSession.value.sessionId);

  if (!isOwnComment) {
    newCommentIndicators.value.add(comment.id);

    // Remove indicator after a delay
    setTimeout(() => {
      newCommentIndicators.value.delete(comment.id);
    }, 3000);
  }
};

const handleRealtimeCommentUpdate = (comment, oldComment) => {
  console.log('📝 [CommentSection] Real-time comment update:', comment);

  // Update comment in local array
  const index = comments.value.findIndex((c) => c.id === comment.id);
  if (index !== -1) {
    comments.value[index] = comment;
  }

  emit('comment-updated', comment);
};

const handleRealtimeCommentDelete = (comment) => {
  console.log('🗑️ [CommentSection] Real-time comment delete:', comment);

  // Remove comment from local array
  const index = comments.value.findIndex((c) => c.id === comment.id);
  if (index !== -1) {
    comments.value.splice(index, 1);
  }

  emit('comment-deleted', comment);
};

const handleUserJoin = (userId) => {
  console.log('👋 [CommentSection] User joined:', userId);
};

const handleUserLeave = (userId) => {
  console.log('👋 [CommentSection] User left:', userId);
};

const handleTypingStart = (userId, userName) => {
  console.log('⌨️ [CommentSection] User started typing:', userName);
};

const handleTypingStop = (userId) => {
  console.log('⌨️ [CommentSection] User stopped typing:', userId);
};

// Typing indicator methods
const handleFormTyping = () => {
  if (!isAuthenticated.value || !user.value) return;

  // Clear existing timeout
  if (typingTimeout.value) {
    clearTimeout(typingTimeout.value);
  }

  // Broadcast typing start
  broadcastTyping(user.value.id, user.value.fullName || user.value.email, true);

  // Set timeout to stop typing
  typingTimeout.value = setTimeout(() => {
    broadcastTyping(
      user.value.id,
      user.value.fullName || user.value.email,
      false
    );
  }, 2000);
};

const handleFormStopTyping = () => {
  if (!isAuthenticated.value || !user.value) return;

  // Clear timeout
  if (typingTimeout.value) {
    clearTimeout(typingTimeout.value);
    typingTimeout.value = null;
  }

  // Broadcast typing stop
  broadcastTyping(
    user.value.id,
    user.value.fullName || user.value.email,
    false
  );
};

// Cleanup function
let cleanupFunctions = [];

// Setup real-time subscriptions
const setupRealtimeSubscriptions = () => {
  try {
    // Setup event handlers
    const unsubscribeInsert = onCommentInsert(handleRealtimeCommentInsert);
    const unsubscribeUpdate = onCommentUpdate(handleRealtimeCommentUpdate);
    const unsubscribeDelete = onCommentDelete(handleRealtimeCommentDelete);
    const unsubscribeUserJoin = onUserJoin(handleUserJoin);
    const unsubscribeUserLeave = onUserLeave(handleUserLeave);
    const unsubscribeTypingStart = onTypingStart(handleTypingStart);
    const unsubscribeTypingStop = onTypingStop(handleTypingStop);

    // Store cleanup functions
    cleanupFunctions.push(
      unsubscribeInsert,
      unsubscribeUpdate,
      unsubscribeDelete,
      unsubscribeUserJoin,
      unsubscribeUserLeave,
      unsubscribeTypingStart,
      unsubscribeTypingStop
    );

    // Setup presence tracking if authenticated
    if (isAuthenticated.value && user.value) {
      const presenceCleanup = setupPresenceTracking(
        user.value.id,
        user.value.fullName || user.value.email
      );
      if (presenceCleanup) {
        cleanupFunctions.push(presenceCleanup);
      }
    }
  } catch (error) {
    console.error('Error setting up realtime subscriptions:', error);
  }
};

// Cleanup function
const cleanup = () => {
  try {
    // Clear typing timeout
    if (typingTimeout.value) {
      clearTimeout(typingTimeout.value);
      typingTimeout.value = null;
    }

    // Run all cleanup functions
    cleanupFunctions.forEach((cleanup) => {
      if (typeof cleanup === 'function') {
        try {
          cleanup();
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
      }
    });
    cleanupFunctions = [];
  } catch (error) {
    console.error('Error during component cleanup:', error);
  }
};

// Lifecycle
onMounted(async () => {
  try {
    // Setup real-time subscriptions
    setupRealtimeSubscriptions();

    // Load initial data
    await loadComments();

    if (!isAuthenticated.value) {
      loadAnonymousSession();
    }
  } catch (error) {
    console.error('Error during component mount:', error);
    error.value = 'Failed to initialize comment section';
  }
});

onUnmounted(() => {
  cleanup();
});

// Expose methods for parent components
defineExpose({
  loadComments,
});
</script>

<template>
  <!--
    No card, no panel: the thread is a continuation of the annotation row above
    it, indented under the row's dot by AnnotationCard. The only chrome is the
    hairline rule that carries the eye down from the row.
  -->
  <div class="pt-1">
    <p
      v-if="error"
      class="pb-2 text-[11px] text-red-600 dark:text-red-400"
    >
      {{ error }}
    </p>

    <p
      v-if="isLoading"
      class="py-1 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
    >
      LOADING&hellip;
    </p>

    <template v-else>
      <div
        v-if="sortedComments.length > 0"
        class="space-y-3"
      >
        <template
          v-for="comment in sortedComments"
          :key="comment.id"
        >
          <!-- Editing happens where the comment sits, not in a form that
               appears somewhere else on screen. -->
          <CommentForm
            v-if="editingComment && editingComment.id === comment.id"
            :annotation-id="props.annotationId"
            :editing-comment="editingComment"
            :is-anonymous="isAnonymous"
            :anonymous-session="anonymousSession"
            @submit="handleCommentSubmit"
            @cancel="cancelCommentForm"
            @typing="handleFormTyping"
            @stop-typing="handleFormStopTyping"
          />
          <CommentItem
            v-else
            :comment="comment"
            :can-edit="canEditComment(comment)"
            :can-moderate="canModerateComment(comment)"
            :read-only="readOnly"
            :is-new="newCommentIndicators.has(comment.id)"
            :class="{ 'opacity-60': String(comment.id).startsWith('temp_') }"
            @edit="handleCommentEdit"
            @delete="handleCommentDelete"
            @moderate="handleCommentModerate"
          />
        </template>
      </div>

      <!-- An empty thread needs no prompt of its own: the composer's
           placeholder is the invitation, and where there is no composer the
           note below says why. -->
      <CommentForm
        v-if="canCompose && !editingComment"
        :class="{ 'mt-3': sortedComments.length > 0 }"
        :annotation-id="props.annotationId"
        :editing-comment="null"
        :is-anonymous="isAnonymous"
        :anonymous-session="anonymousSession"
        @submit="handleCommentSubmit"
        @cancel="cancelCommentForm"
        @typing="handleFormTyping"
        @stop-typing="handleFormStopTyping"
      />

      <p
        v-else-if="composerNote"
        class="py-1 text-[11px] text-gray-500 dark:text-gray-500"
      >
        {{ composerNote }}
      </p>
    </template>
  </div>
</template>
