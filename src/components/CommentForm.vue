<script setup>
import { ref, computed, watch, nextTick } from 'vue';

const props = defineProps({
  annotationId: {
    type: String,
    required: true,
  },
  editingComment: {
    type: Object,
    default: null,
  },
  isAnonymous: {
    type: Boolean,
    default: false,
  },
  anonymousSession: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['submit', 'cancel', 'typing', 'stop-typing']);

// State
const content = ref('');
const displayName = ref('');
const isSubmitting = ref(false);
const error = ref(null);

// Refs
const textareaRef = ref(null);
const displayNameRef = ref(null);

// Constants
const MIN_CONTENT_LENGTH = 1;
const MAX_CONTENT_LENGTH = 2000;

// Computed
const isEditing = computed(() => !!props.editingComment);

const characterCount = computed(() => content.value.length);

const isContentValid = computed(() => {
  const trimmed = content.value.trim();
  return (
    trimmed.length >= MIN_CONTENT_LENGTH && trimmed.length <= MAX_CONTENT_LENGTH
  );
});

const isDisplayNameValid = computed(() => {
  if (!props.isAnonymous) return true;
  if (props.anonymousSession) return true;
  return displayName.value.trim().length >= 2;
});

const canSubmit = computed(() => {
  return (
    isContentValid.value && isDisplayNameValid.value && !isSubmitting.value
  );
});

const characterCountClass = computed(() => {
  const count = characterCount.value;
  if (count > MAX_CONTENT_LENGTH) return 'text-red-600';
  if (count > MAX_CONTENT_LENGTH * 0.9) return 'text-yellow-600';
  return 'text-gray-500';
});

const needsDisplayName = computed(() => {
  return props.isAnonymous && !props.anonymousSession;
});

const formTitle = computed(() => {
  return isEditing.value ? 'Edit Comment' : 'Add Comment';
});

const submitButtonText = computed(() => {
  if (isSubmitting.value) return 'Submitting...';
  return isEditing.value ? 'Update Comment' : 'Post Comment';
});

// Methods
const initializeForm = () => {
  if (isEditing.value && props.editingComment) {
    content.value = props.editingComment.content;
  } else {
    content.value = '';
  }

  if (props.anonymousSession) {
    displayName.value = props.anonymousSession.displayName;
  } else {
    displayName.value = '';
  }

  error.value = null;
};

const handleSubmit = async () => {
  if (!canSubmit.value) return;

  try {
    isSubmitting.value = true;
    error.value = null;

    const trimmedContent = content.value.trim();

    // Validate content length
    if (trimmedContent.length < MIN_CONTENT_LENGTH) {
      throw new Error('Comment cannot be empty');
    }

    if (trimmedContent.length > MAX_CONTENT_LENGTH) {
      throw new Error(`Comment cannot exceed ${MAX_CONTENT_LENGTH} characters`);
    }

    // Validate display name for anonymous users
    if (needsDisplayName.value && displayName.value.trim().length < 2) {
      throw new Error('Display name must be at least 2 characters');
    }

    const submitData = {
      content: trimmedContent,
    };

    // Add anonymous user data if needed
    if (props.isAnonymous && !props.anonymousSession) {
      submitData.displayName = displayName.value.trim();
      // Note: videoId should be provided by parent component
      // For now, we'll let the parent handle this
    }

    emit('submit', submitData);

    // Reset form if not editing
    if (!isEditing.value) {
      content.value = '';
      if (!props.anonymousSession) {
        displayName.value = '';
      }
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    isSubmitting.value = false;
  }
};

const handleCancel = () => {
  emit('cancel');
};

const handleKeydown = (event) => {
  // Hotkey functionality removed
};

const handleTyping = () => {
  emit('typing');
};

const handleStopTyping = () => {
  emit('stop-typing');
};

const focusTextarea = async () => {
  await nextTick();
  if (textareaRef.value) {
    textareaRef.value.focus();
  }
};

const focusDisplayName = async () => {
  await nextTick();
  if (displayNameRef.value) {
    displayNameRef.value.focus();
  }
};

// Watchers
watch(() => props.editingComment, initializeForm, { immediate: true });

watch(
  needsDisplayName,
  (newValue) => {
    if (newValue) {
      focusDisplayName();
    } else {
      focusTextarea();
    }
  },
  { immediate: true }
);

// Initialize form on mount
initializeForm();
</script>

<template>
  <div class="comment-form p-4 bg-gray-50 border-b border-gray-200">
    <!-- Form Header -->
    <div class="flex justify-between items-center mb-3">
      <h5 class="text-sm font-medium text-gray-900">{{ formTitle }}</h5>
      <button
        class="btn-ghost p-1"
        @click="handleCancel"
        :disabled="isSubmitting"
        title="Cancel"
      >
        <svg class="icon icon-sm" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Error Message -->
    <div
      v-if="error"
      class="mb-3 p-2 bg-red-50 border border-red-200 rounded-md"
    >
      <div class="flex items-center">
        <svg class="icon icon-sm text-red-400 mr-2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <p class="text-sm text-red-700">{{ error }}</p>
      </div>
    </div>

    <!-- Display Name Input (for anonymous users without session) -->
    <div v-if="needsDisplayName" class="mb-3">
      <label
        for="display-name"
        class="block text-sm font-medium text-gray-700 mb-1"
      >
        Display Name
      </label>
      <input
        id="display-name"
        ref="displayNameRef"
        v-model="displayName"
        type="text"
        class="form-input"
        placeholder="Enter your display name"
        maxlength="50"
        :disabled="isSubmitting"
        @keydown="handleKeydown"
      />
      <p class="mt-1 text-xs text-gray-500">
        This name will be shown with your comment
      </p>
    </div>

    <!-- Content Textarea -->
    <div class="mb-3">
      <label
        for="comment-content"
        class="block text-sm font-medium text-gray-700 mb-1"
      >
        Comment
      </label>
      <textarea
        id="comment-content"
        ref="textareaRef"
        v-model="content"
        class="form-textarea"
        rows="3"
        placeholder="Write your comment..."
        :maxlength="MAX_CONTENT_LENGTH"
        :disabled="isSubmitting"
        @keydown="handleKeydown"
        @input="handleTyping"
        @blur="handleStopTyping"
      ></textarea>

      <!-- Character Count -->
      <div class="flex justify-end items-center mt-1">
        <span :class="['text-xs', characterCountClass]">
          {{ characterCount }}/{{ MAX_CONTENT_LENGTH }}
        </span>
      </div>
    </div>

    <!-- Form Actions -->
    <div class="flex justify-end space-x-2">
      <button
        class="btn btn-secondary"
        @click="handleCancel"
        :disabled="isSubmitting"
      >
        Cancel
      </button>

      <button
        class="btn btn-primary"
        @click="handleSubmit"
        :disabled="!canSubmit"
      >
        <svg
          v-if="isSubmitting"
          class="animate-spin icon icon-xs mr-1"
          viewBox="0 0 24 24"
        >
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
        {{ submitButtonText }}
      </button>
    </div>
  </div>
</template>

<style scoped>
@import 'tailwindcss' reference;

.comment-form {
  @apply relative;
}

.form-input {
  @apply w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors;
}

.form-input:disabled {
  @apply bg-gray-100 cursor-not-allowed;
}

.form-textarea {
  @apply w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors resize-none;
}

.form-textarea:disabled {
  @apply bg-gray-100 cursor-not-allowed;
}

.btn:disabled {
  @apply opacity-50 cursor-not-allowed;
}

.btn-primary:disabled {
  @apply bg-gray-400 hover:bg-gray-400;
}

.icon-xs {
  @apply w-3 h-3;
}

/* Focus styles for better accessibility */
.form-input:focus,
.form-textarea:focus {
  @apply ring-2 ring-blue-500 border-blue-500;
}

/* Validation styles */
.form-input:invalid,
.form-textarea:invalid {
  @apply border-red-300 focus:border-red-500 focus:ring-red-500;
}

/* Animation for form appearance */
.comment-form {
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
