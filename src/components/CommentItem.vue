<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  comment: {
    type: Object,
    required: true,
  },
  canEdit: {
    type: Boolean,
    default: false,
  },
  canModerate: {
    type: Boolean,
    default: false,
  },
  readOnly: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['edit', 'delete', 'moderate']);

// State
const showActions = ref(false);

// Computed
const authorName = computed(() => {
  if (props.comment.isAnonymous) {
    return props.comment.userDisplayName || 'Anonymous';
  }

  // For authenticated users, try to get name from user object first
  if (props.comment.user) {
    return props.comment.user.fullName || props.comment.user.email || 'User';
  }

  // Fallback: if user object is missing but we have userDisplayName, use it
  if (props.comment.userDisplayName) {
    return props.comment.userDisplayName;
  }

  // Final fallback
  return 'User';
});

const authorInitials = computed(() => {
  const name = authorName.value;
  if (name === 'Anonymous' || name === 'User') {
    return '?';
  }

  const words = name.split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
});

const formattedDate = computed(() => {
  const date = new Date(props.comment.createdAt);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  } else {
    return date.toLocaleDateString();
  }
});

const isEdited = computed(() => {
  return props.comment.updatedAt !== props.comment.createdAt;
});

const hasActions = computed(() => {
  return !props.readOnly && (props.canEdit || props.canModerate);
});

// Methods
const handleEdit = () => {
  emit('edit', props.comment);
  showActions.value = false;
};

const handleDelete = () => {
  emit('delete', props.comment);
  showActions.value = false;
};

const handleModerate = () => {
  emit('moderate', props.comment);
  showActions.value = false;
};

const toggleActions = () => {
  showActions.value = !showActions.value;
};

const closeActions = () => {
  showActions.value = false;
};
</script>

<template>
  <div class="comment-item p-3">
    <div class="flex space-x-3">
      <!-- Avatar -->
      <div class="flex-shrink-0">
        <div
          v-if="comment.user?.avatarUrl && !comment.isAnonymous"
          class="avatar"
        >
          <img
            :src="comment.user.avatarUrl"
            :alt="authorName"
            class="w-8 h-8 rounded-full object-cover"
          />
        </div>
        <div v-else class="avatar-placeholder">
          <span class="text-xs font-medium text-gray-600">{{
            authorInitials
          }}</span>
        </div>
      </div>

      <!-- Comment Content -->
      <div class="flex-1 min-w-0">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <h5 class="text-sm font-medium text-gray-900 truncate">
              {{ authorName }}
            </h5>
            <span v-if="comment.isAnonymous" class="anonymous-badge">
              Anonymous
            </span>
          </div>

          <div class="flex items-center space-x-2">
            <time
              class="text-xs text-gray-500"
              :title="new Date(comment.createdAt).toLocaleString()"
            >
              {{ formattedDate }}
              <span
                v-if="isEdited"
                class="edited-indicator"
                title="This comment has been edited"
              >
                (edited)
              </span>
            </time>

            <!-- Actions Menu -->
            <div v-if="hasActions" class="relative">
              <button
                class="action-menu-trigger"
                @click="toggleActions"
                @blur="closeActions"
                :aria-expanded="showActions"
                aria-label="Comment actions"
              >
                <svg class="icon icon-xs" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="19" cy="12" r="1"></circle>
                  <circle cx="5" cy="12" r="1"></circle>
                </svg>
              </button>

              <div v-if="showActions" class="action-menu">
                <button
                  v-if="canEdit"
                  class="action-menu-item"
                  @click="handleEdit"
                >
                  <svg class="icon icon-xs" viewBox="0 0 24 24">
                    <path
                      d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                    ></path>
                    <path
                      d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                    ></path>
                  </svg>
                  Edit
                </button>

                <button
                  v-if="canEdit"
                  class="action-menu-item text-red-600 hover:bg-red-50"
                  @click="handleDelete"
                >
                  <svg class="icon icon-xs" viewBox="0 0 24 24">
                    <polyline points="3,6 5,6 21,6"></polyline>
                    <path
                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                    ></path>
                  </svg>
                  Delete
                </button>

                <button
                  v-if="canModerate && !canEdit"
                  class="action-menu-item text-red-600 hover:bg-red-50"
                  @click="handleModerate"
                >
                  <svg class="icon icon-xs" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                  </svg>
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Comment Text -->
        <div class="mt-1">
          <p class="text-sm text-gray-700 whitespace-pre-wrap break-words">
            {{ comment.content }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import 'tailwindcss' reference;

.comment-item {
  @apply relative;
}

.avatar-placeholder {
  @apply w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center;
}

.anonymous-badge {
  @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800;
}

.edited-indicator {
  @apply text-gray-400 italic;
}

.action-menu-trigger {
  @apply p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors duration-150;
}

.action-menu {
  @apply absolute right-0 top-full mt-1 w-32 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-10;
}

.action-menu-item {
  @apply w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2 transition-colors duration-150;
}

.action-menu-item:focus {
  @apply outline-none bg-gray-50;
}

.icon {
  @apply stroke-current fill-none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-xs {
  @apply w-3 h-3;
}

/* Ensure long content doesn't break layout */
.comment-item {
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Hover effects */
.comment-item:hover .action-menu-trigger {
  @apply opacity-100;
}

.action-menu-trigger {
  @apply opacity-0 transition-opacity duration-150;
}

.comment-item:hover .action-menu-trigger,
.action-menu-trigger:focus {
  @apply opacity-100;
}

/* Focus management for accessibility */
.action-menu-trigger:focus + .action-menu,
.action-menu:focus-within {
  @apply block;
}

/* Animation for action menu */
.action-menu {
  animation: slideDown 0.15s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
