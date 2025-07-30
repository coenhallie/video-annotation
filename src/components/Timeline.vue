<script setup>
import { ref, computed } from 'vue';

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
  playerMode: {
    type: String,
    default: 'single',
  },
  // New props for dual video FPS handling
  fpsCompatible: {
    type: Boolean,
    default: true,
  },
  primaryVideo: {
    type: String,
    default: 'A',
  },
  videoAState: {
    type: Object,
    default: () => ({ fps: -1, duration: 0 }),
  },
  videoBState: {
    type: Object,
    default: () => ({ fps: -1, duration: 0 }),
  },
});

const emit = defineEmits(['seek-to-time', 'annotation-click', 'play', 'pause']);

const timelineRef = ref(null);
const isDragging = ref(false);

// Debouncing for smooth scrubbing
let seekTimeout = null;
const SEEK_DEBOUNCE_MS = 16; // ~60fps for smooth scrubbing

// Use time-based progress for consistency with video player
const progressPercentage = computed(() => {
  const percentage = props.duration
    ? (props.currentTime / props.duration) * 100
    : 0;
  if (!props.duration) {
    return 0;
  }
  return percentage;
});

// Optimized formatters with memoization-like behavior
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

// Debounced timeline interaction for smooth scrubbing
const debouncedSeek = (time, immediate = false) => {
  if (seekTimeout) {
    clearTimeout(seekTimeout);
  }

  if (immediate) {
    emit('seek-to-time', time);
  } else {
    seekTimeout = setTimeout(() => {
      emit('seek-to-time', time);
    }, SEEK_DEBOUNCE_MS);
  }
};

// Simplified timeline interaction - use time-based seeking for consistency
const handleTimelineClick = (event, immediate = false) => {
  if (!timelineRef.value || !props.duration) {
    return;
  }

  const rect = timelineRef.value.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const percentage = Math.max(0, Math.min(clickX / rect.width, 1));
  const newTime = percentage * props.duration;

  // Use debounced seeking for smooth scrubbing, immediate for clicks
  debouncedSeek(newTime, immediate);
};

const handleTimelineMouseDown = (event) => {
  if (!props.duration) {
    return;
  }

  isDragging.value = true;

  handleTimelineClick(event, true); // Immediate seek on initial click

  const handleMouseMove = (e) => {
    if (isDragging.value) {
      handleTimelineClick(e, false); // Debounced seek during drag
    }
  };

  const handleMouseUp = (e) => {
    if (isDragging.value) {
      handleTimelineClick(e, true); // Immediate seek on release
    }
    isDragging.value = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    // Clear any pending debounced seeks
    if (seekTimeout) {
      clearTimeout(seekTimeout);
      seekTimeout = null;
    }
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};

// Severity color mapping - optimized constant
const SEVERITY_COLORS = {
  low: '#34d399',
  medium: '#fbbf24',
  high: '#ef4444',
};

const getSeverityColor = (severity) => {
  return SEVERITY_COLORS[severity] || SEVERITY_COLORS.medium;
};

// Optimized annotation positioning - use time-based for consistency
const getAnnotationStyle = (annotation) => {
  if (!props.duration) return { display: 'none' };

  // Always use time-based positioning for consistency with video player
  const startPercentage = (annotation.timestamp / props.duration) * 100;

  return {
    left: `${Math.max(0, Math.min(startPercentage, 100))}%`,
    width: '0.5%',
  };
};

const handleAnnotationClick = (annotation, event) => {
  event.stopPropagation();
  emit('annotation-click', annotation);
  emit('seek-to-time', annotation.timestamp);
};

// Play/pause button handlers
const handlePlayPause = () => {
  if (props.isPlaying) {
    emit('pause');
  } else {
    emit('play');
  }
};

// Optimized timeline markers - only create when needed
const timeMarkers = computed(() => {
  if (!props.duration || props.duration < 60) return [];

  const markers = [];
  const interval = Math.max(60, Math.floor(props.duration / 10)); // Adaptive interval

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
  <div class="bg-gray-900 text-white p-2">
    <!-- Play/Pause Controls (only show in dual mode) -->
    <div
      v-if="playerMode === 'dual'"
      class="flex items-center justify-center mb-4"
    >
      <button
        @click="handlePlayPause"
        class="flex items-center justify-center w-12 h-12 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg"
        :title="isPlaying ? 'Pause' : 'Play'"
      >
        <!-- Play Icon -->
        <svg
          v-if="!isPlaying"
          class="w-5 h-5 text-white ml-0.5"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
        <!-- Pause Icon -->
        <svg
          v-else
          class="w-5 h-5 text-white"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      </button>
    </div>

    <!-- Timeline Container (moved to top for priority) -->
    <div class="relative mb-4">
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
          class="absolute top-0 left-0 bottom-0 bg-white rounded-l"
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
          :title="`${annotation.title} (${formatTime(annotation.timestamp)})`"
          @click="handleAnnotationClick(annotation, $event)"
        >
          <!-- Circle shape for annotations -->
          <div
            class="w-4 h-4 rounded-full border-2 border-white shadow-lg absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-90"
            :class="{
              'border-yellow-400 shadow-yellow-400/50 opacity-100 scale-110':
                selectedAnnotation?.id === annotation.id,
            }"
            :style="{ backgroundColor: getSeverityColor(annotation.severity) }"
          ></div>
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
          <span
            v-if="playerMode === 'dual' && !fpsCompatible"
            class="text-yellow-400"
            :title="`Video A: ${videoAState.fps}fps, Video B: ${videoBState.fps}fps`"
          >
            {{ fps }}fps ({{ primaryVideo }})
          </span>
          <span v-else>{{ fps }}fps</span>
          <span
            v-if="playerMode === 'dual' && !fpsCompatible"
            class="text-yellow-400 text-xs ml-1"
            title="Videos have different frame rates"
          >
            ⚠️
          </span>
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
