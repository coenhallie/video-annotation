<script setup>
import { ref, computed, defineProps, defineEmits } from 'vue';

const props = defineProps({
  annotations: {
    type: Array,
    default: () => [],
  },
  selectedAnnotation: {
    type: Object,
    default: null,
  },
  currentTime: {
    type: Number,
    default: 0,
  },
  currentFrame: {
    type: Number,
    default: 0,
  },
  fps: {
    type: Number,
    default: 30,
  },
});

const emit = defineEmits([
  'add-annotation',
  'update-annotation',
  'delete-annotation',
  'select-annotation',
  'form-show',
  'form-hide',
  'pause',
]);

// Form state
const showAddForm = ref(false);
const editingAnnotation = ref(null);
const isRangedFrame = ref(false);
const newAnnotation = ref({
  content: '',
  severity: 'medium',
  color: '#6b7280',
  startFrame: 0,
  endFrame: 0,
  duration: 2.0,
  durationFrames: 60, // Default 2 seconds at 30fps
});

// Annotation severity levels
const severityLevels = [
  { value: 'low', label: 'Low', color: '#34d399', icon: 'info' },
  {
    value: 'medium',
    label: 'Medium',
    color: '#fbbf24',
    icon: 'alert-triangle',
  },
  { value: 'high', label: 'High', color: '#ef4444', icon: 'alert-circle' },
];

// Computed
const sortedAnnotations = computed(() => {
  return [...props.annotations].sort((a, b) => a.timestamp - b.timestamp);
});

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const formatFrame = (frameNumber) => {
  if (!frameNumber || isNaN(frameNumber)) return 'Frame 0';
  return `Frame ${frameNumber.toLocaleString()}`;
};

// Frame calculation utilities
const timeToFrame = (timeInSeconds) => {
  return Math.round(timeInSeconds * props.fps);
};

const frameToTime = (frameNumber) => {
  return frameNumber / props.fps;
};

const getSeverityInfo = (severity) => {
  return severityLevels.find((s) => s.value === severity) || severityLevels[1]; // Default to medium
};

// Check if annotation is ranged
const isRangedAnnotation = (annotation) => {
  return (
    annotation.endFrame !== undefined &&
    annotation.startFrame !== undefined &&
    annotation.endFrame !== annotation.startFrame
  );
};

// Methods
const startAddAnnotation = () => {
  emit('pause');
  newAnnotation.value = {
    content: '',
    severity: 'medium',
    color: '#fbbf24',
    startFrame: props.currentFrame,
    endFrame: props.currentFrame,
    duration: 2.0,
    durationFrames: Math.round(2.0 * props.fps), // 2 seconds in frames
  };
  isRangedFrame.value = false;
  showAddForm.value = true;
  editingAnnotation.value = null;
  emit('form-show');
};

const startEditAnnotation = (annotation) => {
  newAnnotation.value = { ...annotation };
  // Check if annotation has range data
  isRangedFrame.value =
    annotation.endFrame !== undefined &&
    annotation.endFrame !== annotation.startFrame;
  showAddForm.value = true;
  editingAnnotation.value = annotation;
};

const saveAnnotation = () => {
  if (!newAnnotation.value.content.trim()) return;

  const severityInfo = getSeverityInfo(newAnnotation.value.severity);
  const startFrame = newAnnotation.value.startFrame;
  const endFrame = isRangedFrame.value
    ? newAnnotation.value.endFrame
    : startFrame;

  const annotationData = {
    ...newAnnotation.value,
    color: severityInfo.color,
    title:
      newAnnotation.value.content.trim().substring(0, 50) +
      (newAnnotation.value.content.trim().length > 50 ? '...' : ''), // Generate title from content
    content: newAnnotation.value.content.trim(),
    startFrame: startFrame,
    endFrame: endFrame,
    // Calculate timestamp and duration from frames
    timestamp: startFrame / props.fps,
    duration: (endFrame - startFrame + 1) / props.fps,
    durationFrames: endFrame - startFrame + 1,
  };

  if (editingAnnotation.value) {
    emit('update-annotation', {
      ...annotationData,
      id: editingAnnotation.value.id,
    });
  } else {
    emit('add-annotation', annotationData);
  }

  cancelForm();
};

const cancelForm = () => {
  showAddForm.value = false;
  editingAnnotation.value = null;
  isRangedFrame.value = false;
  newAnnotation.value = {
    content: '',
    severity: 'medium',
    color: '#fbbf24',
    startFrame: 0,
    endFrame: 0,
    duration: 2.0,
    durationFrames: Math.round(2.0 * props.fps),
  };
  emit('form-hide');
};

const deleteAnnotation = (annotation) => {
  emit('delete-annotation', annotation.id);
};

const selectAnnotation = (annotation) => {
  emit('select-annotation', annotation);
};

const onSeverityChange = () => {
  const severityInfo = getSeverityInfo(newAnnotation.value.severity);
  newAnnotation.value.color = severityInfo.color;
};

const onDurationChange = () => {
  // Update frame duration when time duration changes
  newAnnotation.value.durationFrames = Math.round(
    newAnnotation.value.duration * props.fps
  );
};

const onFrameDurationChange = () => {
  // Update time duration when frame duration changes
  newAnnotation.value.duration = newAnnotation.value.durationFrames / props.fps;
};

const toggleRangedFrame = () => {
  isRangedFrame.value = !isRangedFrame.value;
  if (!isRangedFrame.value) {
    // Reset to single frame
    newAnnotation.value.endFrame = newAnnotation.value.startFrame;
  }
};

// Expose methods to parent component
defineExpose({
  startAddAnnotation,
  cancelForm,
});
</script>

<template>
  <div class="h-full flex flex-col bg-white">
    <!-- Header -->
    <div class="flex justify-end items-center p-2 border-b border-gray-200">
      <button
        class="btn btn-primary flex items-center space-x-1"
        @click="startAddAnnotation"
        title="Add new annotation"
      >
        <svg class="icon icon-sm" viewBox="0 0 24 24">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>Add</span>
      </button>
    </div>

    <!-- Add/Edit Form -->
    <div v-if="showAddForm" class="border-b border-gray-200 bg-gray-50">
      <div
        class="flex justify-between items-center p-2 border-b border-gray-200"
      >
        <h4 class="text-sm font-medium text-gray-900">
          {{ editingAnnotation ? 'Edit' : 'New' }} Annotation
        </h4>
        <button class="btn btn-ghost p-1" @click="cancelForm">
          <svg class="icon icon-sm" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="p-3">
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Severity</label
            >
            <select
              v-model="newAnnotation.severity"
              class="input"
              @change="onSeverityChange"
            >
              <option
                v-for="severity in severityLevels"
                :key="severity.value"
                :value="severity.value"
              >
                {{ severity.label }}
              </option>
            </select>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-sm font-medium text-gray-700"
                >Frame Position</label
              >
              <button
                type="button"
                class="text-xs text-blue-600 hover:text-blue-800 underline"
                @click="toggleRangedFrame"
              >
                {{ isRangedFrame ? 'single' : 'ranged' }}
              </button>
            </div>
            <div v-if="!isRangedFrame">
              <label class="block text-xs text-gray-500 mb-1"
                >Frame Number</label
              >
              <input
                v-model.number="newAnnotation.startFrame"
                type="number"
                min="0"
                step="1"
                class="input"
                placeholder="Enter frame number"
              />
            </div>
            <div v-else class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs text-gray-500 mb-1"
                  >Start Frame</label
                >
                <input
                  v-model.number="newAnnotation.startFrame"
                  type="number"
                  min="0"
                  step="1"
                  class="input"
                  placeholder="Start frame"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1"
                  >End Frame</label
                >
                <input
                  v-model.number="newAnnotation.endFrame"
                  type="number"
                  :min="newAnnotation.startFrame || 0"
                  step="1"
                  class="input"
                  placeholder="End frame"
                />
              </div>
            </div>
            <p class="text-xs text-gray-500 mt-1">@ {{ fps }}fps</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Content</label
            >
            <textarea
              v-model="newAnnotation.content"
              placeholder="Enter annotation content..."
              class="input resize-y min-h-[50px]"
              rows="2"
            ></textarea>
          </div>

          <div class="flex space-x-2 pt-1">
            <button class="btn btn-primary flex-1" @click="saveAnnotation">
              {{ editingAnnotation ? 'Update' : 'Save' }}
            </button>
            <button class="btn btn-secondary flex-1" @click="cancelForm">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Annotations List -->
    <div class="flex-1 overflow-y-auto p-2">
      <div
        v-if="sortedAnnotations.length === 0"
        class="text-center py-8 px-3 text-gray-500"
      >
        <svg
          class="w-10 h-10 mx-auto mb-3 text-gray-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          ></path>
          <polyline points="14,2 14,8 20,8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10,9 9,9 8,9"></polyline>
        </svg>
        <p class="text-sm mb-1">No annotations yet</p>
        <p class="text-xs text-gray-400">
          Click "Add" to create your first annotation
        </p>
      </div>

      <div
        v-for="annotation in sortedAnnotations"
        :key="annotation.id"
        class="card card-hover mb-2 p-2 cursor-pointer transition-all duration-200 relative group"
        :class="{
          'bg-gray-50': selectedAnnotation?.id === annotation.id,
        }"
        :style="{
          borderLeft: `4px solid ${getSeverityInfo(annotation.severity).color}`,
        }"
        @click="selectAnnotation(annotation)"
      >
        <div class="flex justify-between items-center mb-1">
          <div class="flex items-center space-x-1.5 text-xs text-gray-600">
            <svg
              class="icon icon-sm"
              viewBox="0 0 24 24"
              v-if="getSeverityInfo(annotation.severity).icon === 'info'"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <svg
              class="icon icon-sm"
              viewBox="0 0 24 24"
              v-else-if="
                getSeverityInfo(annotation.severity).icon === 'alert-triangle'
              "
            >
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              ></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <svg
              class="icon icon-sm"
              viewBox="0 0 24 24"
              v-else-if="
                getSeverityInfo(annotation.severity).icon === 'alert-circle'
              "
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>

            <span>{{ getSeverityInfo(annotation.severity).label }}</span>
          </div>
          <div
            class="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded flex flex-col items-center"
          >
            <!-- For ranged annotations, show start and end frames -->
            <template v-if="isRangedAnnotation(annotation)">
              <span>{{ formatTime(annotation.timestamp) }}</span>
              <div class="flex items-center space-x-1 text-xs opacity-75">
                <span>{{ formatFrame(annotation.startFrame) }}</span>
                <span>→</span>
                <span>{{ formatFrame(annotation.endFrame) }}</span>
              </div>
            </template>
            <!-- For non-ranged annotations, show single frame -->
            <template v-else>
              <span>{{ formatTime(annotation.timestamp) }}</span>
              <span class="text-xs opacity-75">{{
                annotation.startFrame !== undefined
                  ? formatFrame(annotation.startFrame)
                  : annotation.frame !== undefined
                  ? formatFrame(annotation.frame)
                  : formatFrame(timeToFrame(annotation.timestamp))
              }}</span>
            </template>
          </div>
        </div>

        <div>
          <h4 class="text-sm font-medium text-gray-900 mb-0.5 leading-tight">
            {{ annotation.title }}
          </h4>
          <p
            v-if="annotation.content"
            class="text-xs text-gray-600 mb-1 leading-snug"
          >
            {{ annotation.content }}
          </p>
        </div>

        <div
          class="flex justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        >
          <div class="flex space-x-1">
            <button
              class="btn btn-ghost p-1"
              @click.stop="startEditAnnotation(annotation)"
              title="Edit annotation"
            >
              <svg class="icon icon-sm" viewBox="0 0 24 24">
                <path
                  d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                ></path>
                <path
                  d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                ></path>
              </svg>
            </button>
            <button
              class="btn btn-ghost p-1 text-red-600 hover:text-red-700"
              @click.stop="deleteAnnotation(annotation)"
              title="Delete annotation"
            >
              <svg class="icon icon-sm" viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                ></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Panel Footer -->
    <div class="p-2 border-t border-gray-200 bg-gray-50">
      <div class="flex justify-between text-xs text-gray-500 font-mono">
        <span> {{ annotations.length }} annotations </span>
        <div class="flex flex-col items-end">
          <span>{{ formatTime(currentTime) }}</span>
          <span class="opacity-75">{{ formatFrame(currentFrame) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom styles if needed */
</style>
