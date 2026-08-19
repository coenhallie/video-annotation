<script setup lang="ts">
import { ref, computed } from 'vue';
import { logger } from '../utils/logger';
import { formatTime, formatFrame } from '@/utils/formatters';
import { isCommentAnnotation, isDrawingAnnotation } from '@/utils/annotationPayload';
import type { DrawingData } from '@/types/database';

/* Narrow annotation typing for the template to satisfy TS plugin */
interface TimelineAnnotation {
  id?: string;
  title?: string;
  timestamp: number;
  severity?: string;
  /**
   * Label ids. An empty array means this annotation is a comment; absent means
   * the labels were never hydrated (a raw realtime row), which is not the same
   * thing. See isCommentAnnotation.
   */
  labels?: string[];
  /** See isDrawingAnnotation: a comment-shaped annotation with strokes is a drawing. */
  annotationType?: string | null;
  drawingData?: DrawingData | null;
}

const __name = 'VideoTimelineComponent';

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

const emit = defineEmits([
  'seek-to-time',
  'annotation-click',
  'play',
  'pause',
  'open-quick-pick',
]);

const timelineRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);

// A press that moves further than this is a scrub, not a click, and must not
// pop the annotation quick pick.
const QUICK_PICK_DRAG_THRESHOLD_PX = 5;

// Debouncing for smooth scrubbing
let seekTimeout: ReturnType<typeof setTimeout> | null = null;
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

// Debounced timeline interaction for smooth scrubbing
const debouncedSeek = (time: number, immediate = false) => {
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
const handleTimelineClick = (event: MouseEvent, immediate = false) => {
  if (!timelineRef.value || !props.duration) {
    return;
  }

  const rect = timelineRef.value.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const percentage = Math.max(0, Math.min(clickX / rect.width, 1));
  const newTime = percentage * props.duration;

  // Use debounced seeking for smooth scrubbing, immediate for clicks
  debouncedSeek(newTime, immediate);
  if (import.meta.env.DEV) {
    logger.debug('[Timeline] seek', { newTime, immediate });
  }
};

/** Time under the pointer, from its x position over the timeline. */
const timeAtPointer = (event: MouseEvent): number | null => {
  if (!timelineRef.value || !props.duration) return null;
  const rect = timelineRef.value.getBoundingClientRect();
  const percentage = Math.max(
    0,
    Math.min((event.clientX - rect.left) / rect.width, 1)
  );
  return percentage * props.duration;
};

const handleTimelineMouseDown = (event: MouseEvent): void => {
  if (!props.duration) {
    return;
  }

  isDragging.value = true;

  // Where the press started, so mouseup can tell a click from a scrub.
  const startX = event.clientX;
  const startY = event.clientY;
  // Annotation markers sit inside the timeline and have their own click
  // handler; pressing one should seek to it, not open the quick pick.
  const onAnnotationMarker = !!(event.target as HTMLElement | null)?.closest(
    '[data-annotation-marker]'
  );

  // A press that started on a marker leaves seeking to the marker's own click
  // handler, which seeks to the annotation's exact timestamp. This bar's
  // pointer-derived seek lands a pixel's worth of time away from that, and a
  // pixel's worth of time is enough to miss a drawing: a drawing only renders
  // on its own exact frame. A drag that moves past the threshold is still a
  // scrub, not a marker click, so handleMouseMove and handleMouseUp below
  // keep seeking from the pointer once the press has actually moved.
  if (!onAnnotationMarker) {
    handleTimelineClick(event, true); // Immediate seek on initial click
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging.value) {
      handleTimelineClick(e, false); // Debounced seek during drag
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (isDragging.value) {
      const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
      const pressStartedOnMarker = onAnnotationMarker && moved <= QUICK_PICK_DRAG_THRESHOLD_PX;

      // Same reasoning as the mousedown skip above: a press that started on a
      // marker and never moved is a marker click, and the marker's own click
      // handler seeks to the annotation's exact timestamp. Seeking here too
      // would win the race with a pointer-derived time and land a pixel's
      // worth of time away from it, which is enough to miss a drawing. Once
      // the press has moved past the threshold it is a real scrub, so it
      // keeps seeking from the pointer as before.
      if (!pressStartedOnMarker) {
        handleTimelineClick(e, true); // Immediate seek on release
      }

      const time = timeAtPointer(e);
      if (
        !onAnnotationMarker &&
        moved <= QUICK_PICK_DRAG_THRESHOLD_PX &&
        time !== null
      ) {
        // Hand over the time under the pointer rather than letting the editor
        // read the player's current frame: the seek above is asynchronous, so
        // reading the frame now would capture the position before the jump.
        //
        // Anchor y to the top of the bar, not the pointer: the panel opens
        // upward from whatever y it is given, so anchoring to the pointer
        // would leave it overlapping the half of the bar below the click.
        emit('open-quick-pick', {
          time,
          clientX: e.clientX,
          clientY: timelineRef.value?.getBoundingClientRect().top ?? e.clientY,
        });
      }
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

const getSeverityColor = (severity?: string) => {
  return (
    SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] ||
    SEVERITY_COLORS.medium
  );
};

/**
 * Precedence: a label says what an annotation is about whatever else it
 * carries, so only a label-less annotation gets one of the outline treatments,
 * and its own content decides which. See isCommentAnnotation.
 */
const isDrawing = (annotation: TimelineAnnotation) =>
  isCommentAnnotation(annotation) && isDrawingAnnotation(annotation);

const isComment = (annotation: TimelineAnnotation) =>
  isCommentAnnotation(annotation) && !isDrawingAnnotation(annotation);

/**
 * One place, so exactly one border colour class can ever come out of it.
 * Drawings and comments share the outline; the shape is what separates them,
 * which reads better than a fill difference at this size.
 */
const markerClasses = (annotation: TimelineAnnotation) => {
  const shape = isDrawing(annotation) ? 'rounded-sm' : 'rounded-full';
  if (isSelected(annotation)) {
    return `${shape} border-yellow-400 shadow-yellow-400/50 opacity-100 scale-110`;
  }
  if (isDrawing(annotation) || isComment(annotation)) {
    return `${shape} border-gray-300 bg-transparent`;
  }
  return `${shape} border-white`;
};

const markerStyle = (annotation: TimelineAnnotation) =>
  isDrawing(annotation) || isComment(annotation)
    ? undefined
    : { backgroundColor: getSeverityColor((annotation as any)?.severity) };

const isSelected = (annotation: TimelineAnnotation) =>
  (props.selectedAnnotation as any)?.id === (annotation as any)?.id;

// Optimized annotation positioning - use time-based for consistency
/* (removed duplicate definition) */

const getAnnotationStyle = (annotation: TimelineAnnotation) => {
  if (!props.duration) return { display: 'none' };

  // Always use time-based positioning for consistency with video player
  const startPercentage = (annotation.timestamp / props.duration) * 100;

  return {
    left: `${Math.max(0, Math.min(startPercentage, 100))}%`,
    width: '0.5%',
  };
};

const handleAnnotationClick = (
  annotation: TimelineAnnotation,
  event: MouseEvent
): void => {
  event.stopPropagation();
  emit('annotation-click', annotation);
  emit('seek-to-time', annotation.timestamp);
};

// Play/pause button handlers
const handlePlayPause = (): void => {
  if (props.isPlaying) {
    emit('pause');
  } else {
    emit('play');
  }
};

// Optimized timeline markers - only create when needed
// const timeMarkers = computed(() => {
//   if (!props.duration || props.duration < 60) return [];

//   const markers = [];
//   const interval = Math.max(60, Math.floor(props.duration / 10)); // Adaptive interval

//   for (let time = 0; time <= props.duration; time += interval) {
//     markers.push({
//       time,
//       position: (time / props.duration) * 100,
//       label: formatTime(time),
//     });
//   }

//   return markers;
// });
</script>

<template>
  <div class="bg-gray-900 text-white p-2">
    <!-- Play/Pause Controls (only show in dual mode) -->
    <div
      v-if="playerMode === 'dual'"
      class="flex items-center justify-center mb-4"
    >
      <button
        class="flex items-center justify-center w-12 h-12 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-white/40 shadow-lg"
        :title="isPlaying ? 'Pause' : 'Play'"
        @click="handlePlayPause"
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
        <div class="absolute inset-0 bg-gray-800 rounded" />

        <!-- Progress -->
        <div
          class="absolute top-0 left-0 bottom-0 bg-white rounded-l"
          :style="{ width: `${progressPercentage}%` }"
        />

        <!-- Current Time Indicator -->
        <div
          class="absolute -top-1 -bottom-1 w-0.5 bg-white rounded-full transform -translate-x-1/2 shadow-lg z-10"
          :style="{ left: `${progressPercentage}%` }"
        />

        <!-- Annotations -->
        <div
          v-for="annotation in (annotations as unknown as TimelineAnnotation[])"
          :key="annotation?.id ?? `${annotation.timestamp}`"
          data-annotation-marker
          :data-annotation-id="annotation?.id"
          class="absolute top-0 bottom-0 cursor-pointer transition-all duration-200 z-5 hover:scale-110"
          :class="{
            'z-9': isSelected(annotation as TimelineAnnotation),
          }"
          :style="getAnnotationStyle(annotation as TimelineAnnotation)"
          :title="`${(annotation as any)?.title ?? 'Annotation'} (${formatTime((annotation as TimelineAnnotation).timestamp)})`"
          @click="
            handleAnnotationClick(annotation as TimelineAnnotation, $event)
          "
        >
          <!--
            Labels are filled dots, a comment is a hollow ring, and a drawing is
            a square, so a note and a sketch each read differently from an event
            at a glance. Same size and hit area for all three.
          -->
          <div
            class="w-4 h-4 border-2 shadow-lg absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-90"
            :class="markerClasses(annotation as TimelineAnnotation)"
            :style="markerStyle(annotation as TimelineAnnotation)"
          />
        </div>
      </div>
    </div>

    <!-- Timeline Info (moved below timeline) -->
    <div
      class="flex justify-between items-center md:flex-row flex-col md:gap-0 gap-2"
    >
      <div class="flex items-center space-x-4 font-mono text-[11px] tracking-wider text-gray-400">
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
          />
          <span>Low</span>
        </div>
        <div class="flex items-center space-x-1.5 text-xs text-gray-400">
          <div
            class="w-2 h-2 rounded-sm"
            style="background-color: #fbbf24"
          />
          <span>Medium</span>
        </div>
        <div class="flex items-center space-x-1.5 text-xs text-gray-400">
          <div
            class="w-2 h-2 rounded-sm"
            style="background-color: #ef4444"
          />
          <span>High</span>
        </div>
        <!--
          A comment carries no severity, so it gets the marker's own hollow
          ring rather than a filled swatch. Round, unlike its square
          neighbours, because that is what makes it read as the ring on the
          timeline above.
        -->
        <div class="flex items-center space-x-1.5 text-xs text-gray-400">
          <div
            class="w-2 h-2 rounded-full border"
            style="border-color: #d1d5db"
          />
          <span>Comment</span>
        </div>
        <div class="flex items-center space-x-1.5 text-xs text-gray-400">
          <div
            class="w-2 h-2 rounded-sm border"
            style="border-color: #d1d5db"
          />
          <span>Drawing</span>
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
