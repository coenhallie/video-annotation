<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import VideoTimeline from './VideoTimeline.vue';

const props = defineProps({
  // Video A timeline props
  videoACurrentTime: {
    type: Number,
    default: 0,
  },
  videoADuration: {
    type: Number,
    default: 0,
  },
  videoACurrentFrame: {
    type: Number,
    default: 0,
  },
  videoATotalFrames: {
    type: Number,
    default: 0,
  },
  videoAFps: {
    type: Number,
    default: 30,
  },
  // Video B timeline props
  videoBCurrentTime: {
    type: Number,
    default: 0,
  },
  videoBDuration: {
    type: Number,
    default: 0,
  },
  videoBCurrentFrame: {
    type: Number,
    default: 0,
  },
  videoBTotalFrames: {
    type: Number,
    default: 0,
  },
  videoBFps: {
    type: Number,
    default: 30,
  },
  // Shared props
  annotations: {
    type: Array,
    default: () => [],
  },
  selectedAnnotation: {
    type: Object,
    default: null,
  },
  videoAPlaying: {
    type: Boolean,
    default: false,
  },
  videoBPlaying: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'seek-video-a',
  'seek-video-b',
  'annotation-click',
  'play-video-a',
  'pause-video-a',
  'play-video-b',
  'pause-video-b',
  'frame-step-video-a',
  'frame-step-video-b',
]);

// Timeline selection state
const selectedTimeline = ref('A'); // 'A' or 'B'

// Handle timeline selection
const selectTimeline = (timeline) => {
  selectedTimeline.value = timeline;
};

// Handle seek events for each video
const handleSeekVideoA = (time) => {
  selectTimeline('A');
  emit('seek-video-a', time);
};

const handleSeekVideoB = (time) => {
  selectTimeline('B');
  emit('seek-video-b', time);
};

// Handle annotation clicks
const handleAnnotationClick = (annotation) => {
  emit('annotation-click', annotation);
};

// Handle play/pause for individual videos
const handlePlayVideoA = () => {
  emit('play-video-a');
};

const handlePauseVideoA = () => {
  emit('pause-video-a');
};

const handlePlayVideoB = () => {
  emit('play-video-b');
};

const handlePauseVideoB = () => {
  emit('pause-video-b');
};

// Frame stepping functions
const stepFrameForward = (videoContext) => {
  if (videoContext === 'A') {
    emit('frame-step-video-a', 1);
  } else {
    emit('frame-step-video-b', 1);
  }
};

const stepFrameBackward = (videoContext) => {
  if (videoContext === 'A') {
    emit('frame-step-video-a', -1);
  } else {
    emit('frame-step-video-b', -1);
  }
};

// Keyboard navigation
const handleKeydown = (event) => {
  // Only handle arrow keys when no input is focused
  if (
    document.activeElement?.tagName === 'INPUT' ||
    document.activeElement?.tagName === 'TEXTAREA'
  ) {
    return;
  }

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault();
      stepFrameBackward(selectedTimeline.value);
      break;
    case 'ArrowRight':
      event.preventDefault();
      stepFrameForward(selectedTimeline.value);
      break;
    case 'ArrowUp':
      event.preventDefault();
      selectTimeline('A');
      break;
    case 'ArrowDown':
      event.preventDefault();
      selectTimeline('B');
      break;
  }
};

// Lifecycle
onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

// Computed properties for timeline styling
const timelineAClasses = computed(() => ({
  'ring-2 ring-blue-500 ring-opacity-50': selectedTimeline.value === 'A',
  'opacity-75': selectedTimeline.value !== 'A',
}));

const timelineBClasses = computed(() => ({
  'ring-2 ring-blue-500 ring-opacity-50': selectedTimeline.value === 'B',
  'opacity-75': selectedTimeline.value !== 'B',
}));
</script>

<template>
  <div class="dual-timeline bg-gray-900 text-white">
    <!-- Instructions -->
    <div class="px-6 pt-4 pb-2">
      <div class="flex items-center justify-between text-xs text-gray-400">
        <div class="flex items-center space-x-4">
          <span>Use ↑/↓ to select timeline</span>
          <span>Use ←/→ to step frames</span>
        </div>
        <div class="flex items-center space-x-2">
          <span>Selected:</span>
          <span class="font-medium text-blue-400">
            Video {{ selectedTimeline }}
          </span>
        </div>
      </div>
    </div>

    <!-- Video A Timeline -->
    <div
      class="timeline-container cursor-pointer transition-all duration-200"
      :class="timelineAClasses"
      @click="selectTimeline('A')"
    >
      <div class="px-6 py-2">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-medium text-white">
            Video A Timeline
            <span v-if="selectedTimeline === 'A'" class="ml-2 text-blue-400"
              >●</span
            >
          </h3>
          <div class="flex items-center space-x-4">
            <div class="text-xs text-gray-400">{{ videoAFps }}fps</div>
            <!-- Individual Play/Pause Button for Video A -->
            <button
              class="flex items-center justify-center w-8 h-8 bg-gray-700 hover:bg-gray-600 border border-gray-500 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg"
              :title="videoAPlaying ? 'Pause Video A' : 'Play Video A'"
              @click.stop="
                videoAPlaying ? handlePauseVideoA() : handlePlayVideoA()
              "
            >
              <!-- Play Icon -->
              <svg
                v-if="!videoAPlaying"
                class="w-3 h-3 text-white ml-0.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              <!-- Pause Icon -->
              <svg
                v-else
                class="w-3 h-3 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            </button>
          </div>
        </div>

        <VideoTimeline
          :current-time="videoACurrentTime"
          :duration="videoADuration"
          :current-frame="videoACurrentFrame"
          :total-frames="videoATotalFrames"
          :fps="videoAFps"
          :annotations="
            annotations.filter(
              (ann) => ann.videoContext === 'A' || !ann.videoContext
            )
          "
          :selected-annotation="selectedAnnotation"
          :is-playing="videoAPlaying"
          :player-mode="'single'"
          @seek-to-time="handleSeekVideoA"
          @annotation-click="handleAnnotationClick"
          @play="handlePlayVideoA"
          @pause="handlePauseVideoA"
        />
      </div>
    </div>

    <!-- Video B Timeline -->
    <div
      class="timeline-container cursor-pointer transition-all duration-200"
      :class="timelineBClasses"
      @click="selectTimeline('B')"
    >
      <div class="px-6 py-2">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-medium text-white">
            Video B Timeline
            <span v-if="selectedTimeline === 'B'" class="ml-2 text-blue-400"
              >●</span
            >
          </h3>
          <div class="flex items-center space-x-4">
            <div class="text-xs text-gray-400">{{ videoBFps }}fps</div>
            <!-- Individual Play/Pause Button for Video B -->
            <button
              class="flex items-center justify-center w-8 h-8 bg-gray-700 hover:bg-gray-600 border border-gray-500 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg"
              :title="videoBPlaying ? 'Pause Video B' : 'Play Video B'"
              @click.stop="
                videoBPlaying ? handlePauseVideoB() : handlePlayVideoB()
              "
            >
              <!-- Play Icon -->
              <svg
                v-if="!videoBPlaying"
                class="w-3 h-3 text-white ml-0.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              <!-- Pause Icon -->
              <svg
                v-else
                class="w-3 h-3 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            </button>
          </div>
        </div>

        <VideoTimeline
          :current-time="videoBCurrentTime"
          :duration="videoBDuration"
          :current-frame="videoBCurrentFrame"
          :total-frames="videoBTotalFrames"
          :fps="videoBFps"
          :annotations="annotations.filter((ann) => ann.videoContext === 'B')"
          :selected-annotation="selectedAnnotation"
          :is-playing="videoBPlaying"
          :player-mode="'single'"
          @seek-to-time="handleSeekVideoB"
          @annotation-click="handleAnnotationClick"
          @play="handlePlayVideoB"
          @pause="handlePauseVideoB"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-container {
  border-radius: 0.5rem;
  margin: 0.25rem;
}

.timeline-container:hover {
  background-color: rgba(55, 65, 81, 0.3);
}
</style>
