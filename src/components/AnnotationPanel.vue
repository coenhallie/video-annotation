<script setup>
import { ref, computed, onMounted, watch } from 'vue';

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
  drawingCanvas: {
    type: Object,
    required: true,
  },
  readOnly: {
    type: Boolean,
    default: false,
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
  'drawing-created',
  'seek-to-frame',
]);

// Form state
const showAddForm = ref(false);
const editingAnnotation = ref(null);
const newAnnotation = ref({
  content: '',
  severity: 'medium',
  color: '#6b7280',
  frame: 0,
  annotationType: 'text', // 'text' or 'drawing'
  drawingData: null,
});

// Drawing state
const showDrawingSection = ref(false);
const hasDrawingData = ref(false);

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

// Severity colors mapping (same as drawing canvas)
const severityColors = {
  low: '#34d399', // green-400
  medium: '#fbbf24', // amber-400
  high: '#ef4444', // red-500
};

// Computed
const isSaveDisabled = computed(() => {
  const hasContent = newAnnotation.value.content.trim();
  const hasDrawing = hasDrawingData.value && newAnnotation.value.drawingData;
  return !hasContent && !hasDrawing;
});

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

// Methods
const startAddAnnotation = () => {
  emit('pause');
  newAnnotation.value = {
    content: '',
    severity: 'medium',
    color: '#fbbf24',
    frame: props.currentFrame,
    annotationType: 'text',
    drawingData: null,
  };
  showAddForm.value = true;
  editingAnnotation.value = null;
  showDrawingSection.value = false;
  hasDrawingData.value = false;
  props.drawingCanvas.disableDrawingMode();
  props.drawingCanvas.clearCurrentFrameDrawings();
  emit('form-show');
};

const startEditAnnotation = (annotation) => {
  // First navigate to the annotation's frame
  emit('pause');

  // Navigate to the annotation's frame
  const targetFrame =
    annotation.frame || Math.round(annotation.timestamp * props.fps);
  emit('seek-to-frame', targetFrame);

  newAnnotation.value = { ...annotation };
  showAddForm.value = true;
  editingAnnotation.value = annotation;

  // Handle drawing data if present, but keep drawing section closed by default
  if (annotation.drawingData) {
    hasDrawingData.value = true;
    showDrawingSection.value = false; // Always keep closed by default
    // Load the drawing data into the canvas
    props.drawingCanvas.clearCurrentFrameDrawings();
    props.drawingCanvas.addDrawing(annotation.drawingData);
  } else {
    hasDrawingData.value = false;
    showDrawingSection.value = false;
  }

  emit('form-show');
};

const saveAnnotation = () => {
  // Check if we have either content or drawing data
  const hasContent = newAnnotation.value.content.trim();
  const hasDrawing = hasDrawingData.value && newAnnotation.value.drawingData;

  if (!hasContent && !hasDrawing) return;

  const severityInfo = getSeverityInfo(newAnnotation.value.severity);

  // Generate title based on content type
  let title = '';
  if (hasContent) {
    title =
      newAnnotation.value.content.trim().substring(0, 50) +
      (newAnnotation.value.content.trim().length > 50 ? '...' : '');
  } else {
    title = 'Drawing Annotation';
  }

  const annotationData = {
    ...newAnnotation.value,
    color: severityInfo.color,
    title,
    content: newAnnotation.value.content.trim() || 'Drawing annotation',
    frame: newAnnotation.value.frame,
    timestamp: newAnnotation.value.frame / props.fps,
    annotationType: hasDrawing ? 'drawing' : 'text',
    drawingData: hasDrawing ? newAnnotation.value.drawingData : null,
  };

  if (editingAnnotation.value) {
    emit('update-annotation', {
      ...annotationData,
      id: editingAnnotation.value.id,
    });
  } else {
    emit('add-annotation', annotationData);
  }

  // Always close the drawing section when saving/updating
  showDrawingSection.value = false;
  cancelForm();
};

const cancelForm = () => {
  showAddForm.value = false;
  editingAnnotation.value = null;
  showDrawingSection.value = false;
  hasDrawingData.value = false;
  props.drawingCanvas.disableDrawingMode();
  props.drawingCanvas.clearCurrentFrameDrawings();
  newAnnotation.value = {
    content: '',
    severity: 'medium',
    color: '#fbbf24',
    frame: 0,
    annotationType: 'text',
    drawingData: null,
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
  // Update drawing canvas severity too
  props.drawingCanvas.setSeverity(newAnnotation.value.severity);
};

// Drawing-related methods
const toggleDrawingSection = () => {
  showDrawingSection.value = !showDrawingSection.value;

  if (showDrawingSection.value) {
    props.drawingCanvas.enableDrawingMode();
  } else {
    props.drawingCanvas.disableDrawingMode();
  }
};

const onDrawingCreated = (drawingData) => {
  // If we're editing an existing annotation and it already has drawing data,
  // we need to merge the new drawing with the existing one
  if (editingAnnotation.value && newAnnotation.value.drawingData) {
    // Merge the paths from both drawings
    const existingDrawing = newAnnotation.value.drawingData;
    const mergedDrawing = {
      ...existingDrawing,
      paths: [...existingDrawing.paths, ...drawingData.paths],
      // Update canvas dimensions to current size
      canvasWidth: drawingData.canvasWidth,
      canvasHeight: drawingData.canvasHeight,
    };

    newAnnotation.value.drawingData = mergedDrawing;
  } else {
    // For new annotations or when no existing drawing data, just use the new data
    newAnnotation.value.drawingData = drawingData;
  }

  hasDrawingData.value = true;
  // Removed emit('drawing-created', drawingData) to prevent infinite loop
  // The AnnotationPanel should only receive drawing events, not emit them
};

const clearDrawing = () => {
  props.drawingCanvas.clearCurrentFrameDrawings();
  newAnnotation.value.drawingData = null;
  hasDrawingData.value = false;
};

// Setup drawing canvas frame
onMounted(() => {
  props.drawingCanvas.currentFrame.value = props.currentFrame;
});

// Watch for currentFrame changes and update the annotation form if it's open
watch(
  () => props.currentFrame,
  (newFrame) => {
    // Only update the frame in the form if the form is open and we're not editing an existing annotation
    if (showAddForm.value && !editingAnnotation.value) {
      newAnnotation.value.frame = newFrame;
    }
  }
);

// Expose methods to parent component
defineExpose({
  startAddAnnotation,
  cancelForm,
  onDrawingCreated,
});
</script>

<template>
  <div class="h-full w-full bg-white overflow-y-auto overflow-x-hidden">
    <!-- Header -->
    <div
      class="sticky top-0 z-10 flex justify-between items-center p-2 border-b border-gray-200 bg-white"
    >
      <h3 v-if="readOnly" class="text-sm font-medium text-gray-600">
        Annotations (View Only)
      </h3>
      <div v-else class="flex-1"></div>
      <button
        v-if="!readOnly"
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
    <div
      v-if="showAddForm && !readOnly"
      class="border-b border-gray-200 bg-gray-50"
    >
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
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="severity in severityLevels"
                :key="severity.value"
                type="button"
                @click="
                  newAnnotation.severity = severity.value;
                  onSeverityChange();
                "
                :class="[
                  'flex items-center justify-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors border',
                  newAnnotation.severity === severity.value
                    ? 'border-gray-400 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300',
                ]"
                :style="{
                  backgroundColor:
                    newAnnotation.severity === severity.value
                      ? severity.color + '20'
                      : 'white',
                  color:
                    newAnnotation.severity === severity.value
                      ? severity.color
                      : '#374151',
                  borderColor:
                    newAnnotation.severity === severity.value
                      ? severity.color
                      : '#d1d5db',
                }"
              >
                <div
                  class="w-3 h-3 rounded-full"
                  :style="{ backgroundColor: severity.color }"
                ></div>
                <span>{{ severity.label }}</span>
              </button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Frame Position</label
            >
            <input
              v-model.number="newAnnotation.frame"
              type="number"
              min="0"
              step="1"
              class="input"
              placeholder="Enter frame number"
            />
            <p class="text-xs text-gray-500 mt-1">@ {{ fps }}fps</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Content <span class="text-red-500">*</span></label
            >
            <textarea
              v-model="newAnnotation.content"
              placeholder="Enter annotation content..."
              class="input resize-y min-h-[50px]"
              rows="2"
            ></textarea>
          </div>

          <!-- Drawing Section -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="block text-sm font-medium text-gray-700"
                >Drawing</label
              >
              <button
                type="button"
                @click="toggleDrawingSection"
                :class="[
                  'px-2 py-1 rounded text-xs font-medium transition-colors',
                  showDrawingSection
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                ]"
              >
                {{ showDrawingSection ? 'Hide' : 'Add Drawing' }}
              </button>
            </div>

            <!-- Drawing Tools and Canvas -->
            <div v-if="showDrawingSection" class="space-y-3">
              <!-- Drawing Tools -->
              <div class="bg-gray-50 p-3 rounded-lg space-y-2">
                <!-- Stroke Width -->
                <div class="space-y-1">
                  <label class="text-xs text-gray-600">
                    Width: {{ drawingCanvas.currentTool.value.strokeWidth }}px
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    :value="drawingCanvas.currentTool.value.strokeWidth"
                    @input="
                      drawingCanvas.setStrokeWidth(
                        parseInt($event.target.value)
                      )
                    "
                    class="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <!-- Drawing Color Preview -->
                <div class="flex items-center space-x-2 text-xs text-gray-600">
                  <span>Drawing color:</span>
                  <div
                    class="w-4 h-4 rounded-full border border-gray-300"
                    :style="{
                      backgroundColor: severityColors[newAnnotation.severity],
                    }"
                  ></div>
                  <span class="capitalize">{{ newAnnotation.severity }}</span>
                </div>

                <!-- Clear Drawing Button -->
                <div class="flex space-x-2">
                  <button
                    type="button"
                    @click="clearDrawing"
                    :disabled="!hasDrawingData"
                    class="flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg
                      class="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polyline points="3,6 5,6 21,6" />
                      <path
                        d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"
                      />
                    </svg>
                    <span>Clear Drawing</span>
                  </button>
                  <div
                    v-if="hasDrawingData"
                    class="flex items-center text-xs text-green-600"
                  >
                    <svg
                      class="w-3 h-3 mr-1"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polyline points="20,6 9,17 4,12" />
                    </svg>
                    Drawing added
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex space-x-2 pt-1">
            <button
              class="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              @click="saveAnnotation"
              :disabled="isSaveDisabled"
            >
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
    <div class="p-2">
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
            <!-- Show timestamp and frame for single-point annotations -->
            <span>{{ formatTime(annotation.timestamp) }}</span>
            <span class="text-xs opacity-75">{{
              annotation.frame !== undefined
                ? formatFrame(annotation.frame)
                : formatFrame(timeToFrame(annotation.timestamp))
            }}</span>
          </div>
        </div>

        <div>
          <div class="flex items-center space-x-1 mb-0.5">
            <h4 class="text-sm font-medium text-gray-900 leading-tight">
              {{ annotation.title }}
            </h4>
            <!-- Drawing indicator -->
            <div
              v-if="
                annotation.annotationType === 'drawing' ||
                annotation.drawingData
              "
              class="flex items-center space-x-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
            >
              <svg
                class="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              <span>Drawing</span>
            </div>
          </div>
          <p
            v-if="annotation.content"
            class="text-xs text-gray-600 mb-1 leading-snug"
          >
            {{ annotation.content }}
          </p>
        </div>

        <div
          v-if="!readOnly"
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
