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

const submitButtonText = computed(() => {
  if (isSubmitting.value) return 'Posting';
  return props.editingComment ? 'Update' : 'Post';
});

// Methods
const initializeForm = () => {
  if (!!props.editingComment && props.editingComment) {
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
    if (!props.editingComment) {
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
  // The composer is always on screen now, so cancelling has to clear the draft
  // itself; there is no unmount to do it. When editing, the parent clears
  // `editingComment` and the watcher below resets the field a second time,
  // which is harmless.
  content.value = '';
  error.value = null;
  emit('stop-typing');
  emit('cancel');
};

const handleTyping = () => {
  emit('typing');
};

const handleStopTyping = () => {
  emit('stop-typing');
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
    }
  },
  { immediate: true }
);

// Initialize form on mount
initializeForm();
</script>

<template>
  <div>
    <p
      v-if="error"
      class="mb-1.5 text-[11px] text-red-600 dark:text-red-400"
    >
      {{ error }}
    </p>

    <input
      v-if="needsDisplayName"
      id="display-name"
      ref="displayNameRef"
      v-model="displayName"
      type="text"
      placeholder="Your name"
      maxlength="50"
      :disabled="isSubmitting"
      class="mb-1.5 w-full rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 disabled:opacity-50 dark:border-white/10 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-white/25"
    >

    <textarea
      id="comment-content"
      ref="textareaRef"
      v-model="content"
      rows="2"
      :placeholder="editingComment ? 'Edit your comment' : 'Write a comment\u2026'"
      :maxlength="MAX_CONTENT_LENGTH"
      :disabled="isSubmitting"
      class="w-full resize-none rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 disabled:opacity-50 dark:border-white/10 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-white/25"
      @input="handleTyping"
      @blur="handleStopTyping"
      @keydown.enter.exact.prevent="handleSubmit"
    />

    <!-- The actions stay out of the way until there is something to do with
         them: an empty composer is one field and nothing else. -->
    <div
      v-if="content.length > 0 || editingComment"
      class="mt-1.5 flex items-center gap-3"
    >
      <button
        type="button"
        class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-900 transition-opacity hover:opacity-70 disabled:opacity-40 dark:text-white"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        {{ submitButtonText }}
      </button>
      <button
        type="button"
        class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
        :disabled="isSubmitting"
        @click="handleCancel"
      >
        Cancel
      </button>
      <span
        v-if="characterCount > MAX_CONTENT_LENGTH * 0.9"
        :class="['ml-auto font-mono text-[10px] tracking-wider', characterCountClass]"
      >
        {{ characterCount }}/{{ MAX_CONTENT_LENGTH }}
      </span>
    </div>
  </div>
</template>
