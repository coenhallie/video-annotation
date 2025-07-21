<script setup>
import { ref, computed, defineProps, defineEmits } from 'vue';

const props = defineProps({
  currentTime: {
    type: Number,
    default: 0,
  },
  duration: {
    type: Number,
    default: 0,
  },
  currentFrame: {
    type: Number,
    default: 0,
  },
  totalFrames: {
    type: Number,
    default: 0,
  },
  fps: {
    type: Number,
    default: 30,
  },
  annotations: {
    type: Array,
    default: () => [],
  },
  selectedAnnotation: {
    type: Object,
    default: null,
  },
  isPlaying: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['seek-to-time', 'seek-to-frame', 'annotation-click']);

const timelineRef = ref(null);
const isDragging = ref(false);

// Computed properties
const progressPercentage = computed(() => {
  if (!props.duration) return 0;
  return (props.currentTime / props.duration) * 100;
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

// Progress calculation based on frames
const frameProgressPercentage = computed(() => {
  if (!props.totalFrames) return 0;
  return (props.currentFrame / props.totalFrames) * 100;
});

// Timeline interaction
const handleTimelineClick = (event) => {
  if (!timelineRef.value || !props.duration) return;

  const rect = timelineRef.value.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const percentage = clickX / rect.width;
  const newTime = percentage * props.duration;
  const newFrame = Math.round(percentage * props.totalFrames);

  emit('seek-to-time', Math.max(0, Math.min(newTime, props.duration)));
  emit('seek-to-frame', Math.max(0, Math.min(newFrame, props.totalFrames)));
};

const handleTimelineMouseDown = (event) => {
  isDragging.value = true;
  handleTimelineClick(event);

  const handleMouseMove = (e) => {
    if (isDragging.value) {
      handleTimelineClick(e);
    }
  };

  const handleMouseUp = () => {
    isDragging.value = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};

// Severity color mapping to match the legend
const severityColors = {
  low: '#34d399',
  medium: '#fbbf24',
  high: '#ef4444',
};

const getSeverityColor = (severity) => {
  return severityColors[severity] || severityColors.medium;
};

// Check if annotation is ranged
const isRangedAnnotation = (annotation) => {
  return (
    annotation.endFrame !== undefined &&
    annotation.startFrame !== undefined &&
    annotation.endFrame !== annotation.startFrame
  );
};

// Annotation positioning
const getAnnotationStyle = (annotation) => {
  if (!props.duration && !props.totalFrames) return { display: 'none' };

  // Use frame-based positioning if available, otherwise fall back to time
  let startPercentage, widthPercentage;

  if (
    props.totalFrames &&
    (annotation.startFrame !== undefined || annotation.frame !== undefined)
  ) {
    // Frame-based positioning
    const frameNumber =
      annotation.startFrame !== undefined
        ? annotation.startFrame
        : annotation.frame;
    startPercentage = (frameNumber / props.totalFrames) * 100;

    if (isRangedAnnotation(annotation)) {
      // For ranged annotations, calculate width based on frame range
      const durationInFrames = annotation.endFrame - annotation.startFrame + 1;
      widthPercentage = (durationInFrames / props.totalFrames) * 100;
    } else {
      // For non-ranged annotations, use minimal width for diamond shape
      widthPercentage = 0.5;
    }
  } else {
    // Time-based positioning (fallback)
    startPercentage = (annotation.timestamp / props.duration) * 100;
    if (isRangedAnnotation(annotation)) {
      widthPercentage = ((annotation.duration || 1) / props.duration) * 100;
    } else {
      widthPercentage = 0.5;
    }
  }

  return {
    left: `${startPercentage}%`,
    width: `${Math.max(widthPercentage, 0.5)}%`,
  };
};

const handleAnnotationClick = (annotation, event) => {
  event.stopPropagation();

  // Always seek to the start frame of the annotation
  const targetFrame = annotation.startFrame;

  emit('annotation-click', annotation);
  if (targetFrame !== undefined) {
    emit('seek-to-frame', targetFrame);
  }
};

// Timeline markers (every 60 seconds or equivalent frames)
const timeMarkers = computed(() => {
  if (!props.duration) return [];

  const markers = [];
  const interval = 60; // seconds

  for (let time = 0; time <= props.duration; time += interval) {
    markers.push({
      time,
      position: (time / props.duration) * 100,
      label: formatTime(time),
    });
  }

  return markers;
});
</script>

<template>
  <div class="bg-gray-900 text-white p-6">
    <!-- Timeline Container (moved to top for priority) -->
    <div class="relative mb-4">
      <!-- Time Markers -->
      <div class="relative h-5 mb-2">
        <div
          v-for="marker in timeMarkers"
          :key="marker.time"
          class="absolute top-0 transform -translate-x-1/2"
          :style="{ left: `${marker.position}%` }"
        >
          <div class="w-px h-3 bg-gray-600"></div>
          <div
            class="text-xs text-gray-500 mt-0.5 whitespace-nowrap transform -translate-x-1/2"
          >
            {{ marker.label }}
          </div>
        </div>
      </div>

      <!-- Main Timeline -->
      <div
        ref="timelineRef"
        class="relative h-12 cursor-pointer rounded overflow-hidden"
        @click="handleTimelineClick"
        @mousedown="handleTimelineMouseDown"
      >
        <!-- Background -->
        <div class="absolute inset-0 bg-gray-800 rounded"></div>

        <!-- Progress -->
        <div
          class="absolute top-0 left-0 bottom-0 bg-white rounded-l transition-all duration-100"
          :style="{ width: `${progressPercentage}%` }"
        ></div>

        <!-- Current Time Indicator -->
        <div
          class="absolute -top-1 -bottom-1 w-0.5 bg-white rounded-full transform -translate-x-1/2 shadow-lg z-10"
          :style="{ left: `${progressPercentage}%` }"
        ></div>

        <!-- Annotations -->
        <div
          v-for="annotation in annotations"
          :key="annotation.id"
          class="absolute top-0 bottom-0 cursor-pointer transition-all duration-200 z-5 hover:scale-110"
          :class="{
            'z-9': selectedAnnotation?.id === annotation.id,
          }"
          :style="getAnnotationStyle(annotation)"
          :title="`${annotation.title} (${formatTime(annotation.timestamp)} - ${
            annotation.startFrame !== undefined
              ? formatFrame(annotation.startFrame)
              : annotation.frame !== undefined
              ? formatFrame(annotation.frame)
              : formatFrame(timeToFrame(annotation.timestamp))
          })`"
          @click="handleAnnotationClick(annotation, $event)"
        >
          <!-- Circle shape for non-ranged annotations -->
          <div
            v-if="!isRangedAnnotation(annotation)"
            class="w-4 h-4 rounded-full border-2 border-white shadow-lg absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-90"
            :class="{
              'border-yellow-400 shadow-yellow-400/50 opacity-100 scale-110':
                selectedAnnotation?.id === annotation.id,
            }"
            :style="{ backgroundColor: getSeverityColor(annotation.severity) }"
          ></div>

          <!-- Rectangle for ranged annotations -->
          <div
            v-else
            class="absolute top-1/2 h-6 -translate-y-1/2 left-0 right-0 transform rounded border border-white min-w-1 opacity-90"
            :class="{
              'border-white shadow-lg opacity-100':
                selectedAnnotation?.id === annotation.id,
            }"
            :style="{ backgroundColor: getSeverityColor(annotation.severity) }"
          >
            <div class="px-1 py-0.5 h-full flex items-center overflow-hidden">
              <span
                class="text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis text-white"
              >
                {{ annotation.title }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline Info (moved below timeline) -->
    <div
      class="flex justify-between items-center md:flex-row flex-col md:gap-0 gap-2"
    >
      <div class="flex items-center space-x-4 font-mono text-sm text-gray-400">
        <div class="flex items-center space-x-2">
          <span>{{ formatTime(currentTime) }}</span>
          <span class="opacity-50">/</span>
          <span>{{ formatTime(duration) }}</span>
        </div>
        <div class="flex items-center space-x-2 text-xs">
          <span>{{ formatFrame(currentFrame) }}</span>
          <span class="opacity-50">/</span>
          <span>{{ formatFrame(totalFrames) }}</span>
          <span class="opacity-50">@</span>
          <span>{{ fps }}fps</span>
        </div>
      </div>

      <!-- Severity Legend -->
      <div class="flex space-x-3">
        <div class="flex items-center space-x-1.5 text-xs text-gray-400">
          <div
            class="w-2 h-2 rounded-sm"
            style="background-color: #34d399"
          ></div>
          <span>Low</span>
        </div>
        <div class="flex items-center space-x-1.5 text-xs text-gray-400">
          <div
            class="w-2 h-2 rounded-sm"
            style="background-color: #fbbf24"
          ></div>
          <span>Medium</span>
        </div>
        <div class="flex items-center space-x-1.5 text-xs text-gray-400">
          <div
            class="w-2 h-2 rounded-sm"
            style="background-color: #ef4444"
          ></div>
          <span>High</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-shadow {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
</style>
