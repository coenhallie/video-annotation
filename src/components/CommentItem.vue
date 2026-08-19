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
  /** Arrived over realtime since this thread was last viewed. */
  isNew: {
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

const closeActions = (event) => {
  // Check if the new focused element is still within the action menu.
  // If not, close the menu.
  if (!event.currentTarget.contains(event.relatedTarget)) {
    showActions.value = false;
  }
};
</script>

<template>
  <div class="comment-item group/comment relative flex gap-2.5">
    <img
      v-if="comment.user?.avatarUrl && !comment.isAnonymous"
      :src="comment.user.avatarUrl"
      :alt="authorName"
      class="mt-0.5 h-5 w-5 shrink-0 rounded-full object-cover"
    >
    <span
      v-else
      class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gray-200 text-[9px] font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300"
    >
      {{ authorInitials }}
    </span>

    <div class="min-w-0 flex-1">
      <div class="flex items-baseline gap-2">
        <!-- Unread marks itself the way the annotation row does: a dot, not a
             tinted background and a coloured edge. -->
        <span
          v-if="isNew"
          class="h-1.5 w-1.5 shrink-0 self-center rounded-full bg-red-500"
          title="New comment"
        />
        <span class="truncate text-[12px] font-medium text-gray-800 dark:text-gray-200">
          {{ authorName }}
        </span>
        <span
          v-if="comment.isAnonymous"
          class="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-500"
        >
          Guest
        </span>

        <time
          class="ml-auto shrink-0 font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500"
          :title="new Date(comment.createdAt).toLocaleString()"
        >
          {{ formattedDate }}<span
            v-if="isEdited"
            title="This comment has been edited"
          >&nbsp;&middot; edited</span>
        </time>

        <div
          v-if="hasActions"
          class="relative shrink-0 self-center"
        >
          <button
            type="button"
            class="grid h-4 w-4 place-items-center rounded text-gray-500 opacity-0 transition-opacity hover:text-gray-900 focus-visible:opacity-100 group-hover/comment:opacity-100 dark:hover:text-gray-200"
            :class="{ 'opacity-100': showActions }"
            :aria-expanded="showActions"
            aria-label="Comment actions"
            @click.stop="toggleActions"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
            >
              <circle
                cx="12"
                cy="12"
                r="1.4"
              />
              <circle
                cx="19"
                cy="12"
                r="1.4"
              />
              <circle
                cx="5"
                cy="12"
                r="1.4"
              />
            </svg>
          </button>

          <div
            v-show="showActions"
            class="absolute right-0 top-full z-50 mt-1 w-28 overflow-hidden rounded border border-gray-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-gray-900"
            tabindex="-1"
            @focusout="closeActions"
          >
            <button
              v-if="canEdit"
              type="button"
              class="w-full px-3 py-1.5 text-left text-[11px] text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/50"
              @click.stop="handleEdit"
            >
              Edit
            </button>
            <button
              v-if="canEdit"
              type="button"
              class="w-full px-3 py-1.5 text-left text-[11px] text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              @click.stop="handleDelete"
            >
              Delete
            </button>
            <button
              v-if="canModerate && !canEdit"
              type="button"
              class="w-full px-3 py-1.5 text-left text-[11px] text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              @click.stop="handleModerate"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <p
        class="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-gray-600 dark:text-gray-300"
      >
        {{ comment.content }}
      </p>
    </div>
  </div>
</template>
