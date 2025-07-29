<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useAuth } from '../composables/useAuth';
import { useRealtimeComments } from '../composables/useRealtimeComments';
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

// Composables
const { user, isAuthenticated } = useAuth();

// Real-time composable
const {
  isConnected,
  connectionError,
  realtimeComments,
  activeUsers,
  typingUsers,
  hasActiveUsers,
  typingUsersList,
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
const showCommentForm = ref(false);
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
  // Merge local comments with real-time comments, avoiding duplicates
  const commentMap = new Map();

  // Add local comments
  comments.value.forEach((comment) => {
    commentMap.set(comment.id, comment);
  });

  // Add real-time comments (will override local if same ID)
  realtimeComments.value.forEach((comment) => {
    commentMap.set(comment.id, comment);
  });

  return Array.from(commentMap.values());
});

const sortedComments = computed(() => {
  return [...allComments.value].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
});

const commentCount = computed(() => allComments.value.length);

const connectionStatus = computed(() => {
  if (connectionError.value) return 'error';
  if (isConnected.value) return 'connected';
  return 'disconnected';
});

const currentUserId = computed(() => user.value?.id || null);

const isAnonymous = computed(() => !isAuthenticated.value);

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
  if (isAuthenticated.value) return;

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

const startAddComment = () => {
  if (props.readOnly || !permissions.value.canComment) return;

  showCommentForm.value = true;
  editingComment.value = null;
};

const startEditComment = (comment) => {
  if (props.readOnly) return;

  editingComment.value = comment;
  showCommentForm.value = true;
};

const cancelCommentForm = () => {
  showCommentForm.value = false;
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

      if (isAuthenticated.value) {
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
        user: isAuthenticated.value ? user.value : null,
      };

      // Add optimistic comment
      addOptimisticComment(optimisticComment);

      try {
        result = await CommentService.createCommentWithRealtime(createParams);

        // Remove optimistic comment
        removeOptimisticComment(optimisticComment.id);

        // Add comment to local array
        comments.value.push(result);

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

  if (isAuthenticated.value) {
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

watch(
  isAuthenticated,
  (newValue) => {
    if (!newValue) {
      loadAnonymousSession();
    }
  },
  { immediate: true }
);

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
  }

  // Add visual indicator for new comment
  newCommentIndicators.value.add(comment.id);

  // Remove indicator after a delay
  setTimeout(() => {
    newCommentIndicators.value.delete(comment.id);
  }, 3000);

  emit('comment-added', comment);
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

// Setup real-time subscriptions
const setupRealtimeSubscriptions = () => {
  // Setup event handlers
  onCommentInsert(handleRealtimeCommentInsert);
  onCommentUpdate(handleRealtimeCommentUpdate);
  onCommentDelete(handleRealtimeCommentDelete);
  onUserJoin(handleUserJoin);
  onUserLeave(handleUserLeave);
  onTypingStart(handleTypingStart);
  onTypingStop(handleTypingStop);

  // Setup presence tracking if authenticated
  if (isAuthenticated.value && user.value) {
    setupPresenceTracking(
      user.value.id,
      user.value.fullName || user.value.email
    );
  }
};

// Setup real-time subscriptions immediately when component is created
setupRealtimeSubscriptions();

// Lifecycle
onMounted(() => {
  loadComments();
  if (!isAuthenticated.value) {
    loadAnonymousSession();
  }
});

// Expose methods for parent components
defineExpose({
  loadComments,
  startAddComment,
});
</script>

<template>
  <div class="comment-section">
    <!-- Header -->
    <div
      class="flex justify-between items-center p-3 border-b border-gray-200 bg-gray-50"
    >
      <div class="flex items-center space-x-2">
        <h4 class="text-sm font-medium text-gray-900">
          Comments
          <span v-if="commentCount > 0" class="text-gray-500 font-normal">
            ({{ commentCount }})
          </span>
        </h4>
      </div>

      <button
        v-if="!readOnly && permissions.canComment"
        class="btn btn-primary btn-sm flex items-center space-x-1"
        @click="startAddComment"
        :disabled="isLoading"
        title="Add comment"
      >
        <svg class="icon icon-xs" viewBox="0 0 24 24">
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          ></path>
        </svg>
        <span>Add Comment</span>
      </button>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="p-3 bg-red-50 border-l-4 border-red-400">
      <div class="flex">
        <svg class="icon icon-sm text-red-400" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <div class="ml-2">
          <p class="text-sm text-red-700">{{ error }}</p>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="p-4 text-center">
      <div class="inline-flex items-center space-x-2 text-gray-500">
        <svg class="animate-spin icon icon-sm" viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
            fill="none"
            opacity="0.25"
          ></circle>
          <path
            fill="currentColor"
            opacity="0.75"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span class="text-sm">Loading comments...</span>
      </div>
    </div>

    <!-- Comment Form -->
    <div v-if="showCommentForm && !readOnly" class="border-b border-gray-200">
      <CommentForm
        :annotation-id="props.annotationId"
        :editing-comment="editingComment"
        :is-anonymous="isAnonymous"
        :anonymous-session="anonymousSession"
        @submit="handleCommentSubmit"
        @cancel="cancelCommentForm"
        @typing="handleFormTyping"
        @stop-typing="handleFormStopTyping"
      />
    </div>

    <!-- Comments List -->
    <div class="comment-list">
      <div
        v-if="!isLoading && sortedComments.length === 0"
        class="p-4 text-center text-gray-500"
      >
        <svg
          class="icon icon-lg mx-auto mb-2 text-gray-300"
          viewBox="0 0 24 24"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          ></path>
        </svg>
        <p class="text-sm">No comments yet</p>
        <p
          v-if="!readOnly && permissions.canComment"
          class="text-xs text-gray-400 mt-1"
        >
          Be the first to add a comment
        </p>
      </div>

      <div v-else class="divide-y divide-gray-100">
        <CommentItem
          v-for="comment in sortedComments"
          :key="comment.id"
          :comment="comment"
          :can-edit="canEditComment(comment)"
          :can-moderate="canModerateComment(comment)"
          :read-only="readOnly"
          :class="{
            'bg-blue-50 border-l-4 border-l-blue-400': newCommentIndicators.has(
              comment.id
            ),
            'animate-pulse': comment.id.toString().startsWith('temp_'),
          }"
          @edit="handleCommentEdit"
          @delete="handleCommentDelete"
          @moderate="handleCommentModerate"
        />
      </div>
    </div>

    <!-- Read-only Notice -->
    <div v-if="readOnly" class="p-3 bg-gray-50 border-t border-gray-200">
      <p class="text-xs text-gray-500 text-center">
        Comments are view-only in this mode
      </p>
    </div>

    <!-- Permission Notice -->
    <div
      v-else-if="!permissions.canComment"
      class="p-3 bg-yellow-50 border-t border-yellow-200"
    >
      <p class="text-xs text-yellow-700 text-center">
        {{
          permissions.reason ||
          'You do not have permission to comment on this annotation'
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
@import 'tailwindcss' reference;

.comment-section {
  @apply bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden;
}

.comment-list {
  @apply max-h-96 overflow-y-auto;
}

.btn-sm {
  @apply px-2 py-1 text-xs;
}

.btn:disabled {
  @apply opacity-50 cursor-not-allowed;
}

.icon-xs {
  @apply w-3 h-3;
}

.icon-lg {
  @apply w-8 h-8;
}
</style>
