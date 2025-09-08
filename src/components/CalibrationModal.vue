<template>
  <div v-if="props.show" class="calibration-modal-overlay">
    <div class="calibration-modal">
      <!-- Modal Header -->
      <div class="modal-header">
        <h2>Camera Calibration</h2>
        <div
          v-if="calibrationQuality && currentStep === 1"
          class="calibration-quality"
        >
          <span
            :class="['quality-badge', `quality-${calibrationQuality.level}`]"
          >
            {{ calibrationQuality.message }}
          </span>
        </div>
        <button class="close-button" @click="closeModal">×</button>
      </div>

      <!-- Main Content Area -->
      <div class="modal-content">
        <!-- Step 1: Camera Position Selection -->
        <div v-if="currentStep === 0" class="camera-position-section">
          <div class="instruction-panel">
            <h3>Step 1: Set Camera Position</h3>
            <p>
              Click on the court diagram to indicate where your camera is
              positioned.
            </p>
            <div class="benefits-box">
              <ul>
                <li>Improves height estimation</li>
                <li>Better perspective correction</li>
                <li>More accurate speed calculations</li>
              </ul>
            </div>
          </div>
          <EdgeBasedCameraSelector
            v-model="cameraPositionData"
            :court-dimensions="courtDimensions"
            @edge-selected="handleEdgeSelected"
            @position-changed="handleCameraPositionChanged"
          />
        </div>

        <!-- Step 2: Line Drawing and Calibration -->
        <div v-else-if="currentStep === 1" class="video-line-drawing-section">
          <!-- Current Line Instruction Header -->
          <div class="line-drawing-header">
            <div class="current-line-instruction">
              <div class="line-sequence-indicator">
                Line {{ currentLineIndex + 1 }} of
                {{ lineDrawingSequence.length }}
              </div>
              <div class="current-line-prompt">
                <span
                  class="prompt-icon"
                  :style="{ backgroundColor: getCurrentLineColor() }"
                />
                <span class="prompt-text">
                  Draw the <strong>{{ getCurrentLineName() }}</strong>
                </span>
              </div>
              <p class="line-help-text">
                {{ getCurrentLineDescription() }}
              </p>
            </div>
          </div>

          <div class="video-content-wrapper">
            <!-- Left Sidebar with Progress and Court Diagram -->
            <div class="line-progress-sidebar">
              <!-- Court Diagram Guide -->
              <div class="court-diagram-guide">
                <svg viewBox="0 0 440 240" class="guide-svg">
                  <!-- Court background -->
                  <rect x="0" y="0" width="440" height="240" fill="#f9fafb" />

                  <!-- Doubles court outline (outer boundary) -->
                  <rect
                    x="50"
                    y="20"
                    width="340"
                    height="200"
                    fill="#e5f3e5"
                    stroke="#6b7280"
                    stroke-width="2"
                  />

                  <!-- Singles sidelines (inner horizontal lines for side view) -->
                  <line
                    x1="50"
                    y1="40"
                    x2="390"
                    y2="40"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />
                  <line
                    x1="50"
                    y1="200"
                    x2="390"
                    y2="200"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />

                  <!-- Net line (center vertical for side view) -->
                  <line
                    x1="220"
                    y1="20"
                    x2="220"
                    y2="220"
                    stroke="#374151"
                    stroke-width="3"
                  />

                  <!-- Short service lines (vertical lines near net for side view) -->
                  <line
                    x1="176"
                    y1="20"
                    x2="176"
                    y2="220"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />
                  <line
                    x1="264"
                    y1="20"
                    x2="264"
                    y2="220"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />

                  <!-- Long service line for doubles (vertical lines at back for side view) -->
                  <line
                    x1="70"
                    y1="20"
                    x2="70"
                    y2="220"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />
                  <line
                    x1="370"
                    y1="20"
                    x2="370"
                    y2="220"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />

                  <!-- Long service line for singles (vertical lines for side view) -->
                  <line
                    x1="90"
                    y1="40"
                    x2="90"
                    y2="200"
                    stroke="#9ca3af"
                    stroke-width="1"
                    stroke-dasharray="3,2"
                  />
                  <line
                    x1="350"
                    y1="40"
                    x2="350"
                    y2="200"
                    stroke="#9ca3af"
                    stroke-width="1"
                    stroke-dasharray="3,2"
                  />

                  <!-- Center line (horizontal line dividing upper/lower courts for side view) -->
                  <line
                    x1="50"
                    y1="120"
                    x2="390"
                    y2="120"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />

                  <!-- Highlight current line being drawn -->
                  <!-- Double Long Service Line (Back Boundary - vertical for side view) -->
                  <line
                    v-if="currentLineIndex === 0"
                    x1="370"
                    y1="20"
                    x2="370"
                    y2="220"
                    :stroke="lineDrawingSequence[0]?.color || '#3b82f6'"
                    stroke-width="4"
                    opacity="0.8"
                  />
                  <!-- Center Line (horizontal for side view) -->
                  <line
                    v-if="currentLineIndex === 1"
                    x1="50"
                    y1="120"
                    x2="390"
                    y2="120"
                    :stroke="lineDrawingSequence[1]?.color || '#22c55e'"
                    stroke-width="4"
                    opacity="0.8"
                  />
                  <!-- Short Service Line (vertical for side view) -->
                  <line
                    v-if="currentLineIndex === 2"
                    x1="264"
                    y1="20"
                    x2="264"
                    y2="220"
                    :stroke="lineDrawingSequence[2]?.color || '#ef4444'"
                    stroke-width="4"
                    opacity="0.8"
                  />
                </svg>
              </div>

              <h4>Drawing Progress</h4>
              <div class="line-progress-list">
                <div
                  v-for="(lineType, index) in lineDrawingSequence"
                  :key="lineType.id"
                  :class="[
                    'progress-item',
                    {
                      current: index === currentLineIndex,
                      completed:
                        index < currentLineIndex ||
                        completedLines[index]?.confirmed,
                      pending:
                        index > currentLineIndex && !completedLines[index],
                    },
                  ]"
                >
                  <div class="progress-indicator">
                    <svg
                      v-if="completedLines[index]?.confirmed"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      class="check-icon"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <span
                      v-else-if="index === currentLineIndex"
                      class="current-dot"
                    />
                    <span v-else class="pending-dot" />
                  </div>
                  <div class="progress-info">
                    <span class="line-name">{{ lineType.name }}</span>
                    <span class="line-status">
                      {{ getLineStatus(index) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Quick Actions -->
              <div class="quick-actions">
                <button
                  class="action-btn"
                  :disabled="currentLineIndex === 0"
                  @click="goToPreviousLine"
                >
                  Previous Line
                </button>
                <button
                  class="action-btn"
                  :disabled="!canSkipCurrentLine()"
                  @click="skipCurrentLine"
                >
                  Skip Line
                </button>
                <button class="action-btn reset" @click="resetAllLines">
                  Reset All
                </button>
              </div>
            </div>

            <!-- Main Video Player with Drawing Canvas -->
            <div class="video-player-container">
              <!-- Video Element with Controls -->
              <div class="video-wrapper">
                <video
                  ref="videoElement"
                  :src="props.videoUrl"
                  class="calibration-video"
                  @loadedmetadata="handleVideoLoaded"
                  @timeupdate="handleTimeUpdate"
                />

                <!-- Video Area Indicator -->
                <div
                  class="video-area-indicator"
                  :style="{
                    left: `${videoDisplayArea.x}px`,
                    top: `${videoDisplayArea.y}px`,
                    width: `${videoDisplayArea.width}px`,
                    height: `${videoDisplayArea.height}px`,
                  }"
                />

                <!-- Drawing Canvas Overlay -->
                <canvas
                  ref="drawingCanvas"
                  class="drawing-canvas-overlay"
                  :width="videoDisplayArea.width"
                  :height="videoDisplayArea.height"
                  :style="{
                    left: `${videoDisplayArea.x}px`,
                    top: `${videoDisplayArea.y}px`,
                    width: `${videoDisplayArea.width}px`,
                    height: `${videoDisplayArea.height}px`,
                  }"
                  @mousedown="startDrawing"
                  @mousemove="handleDrawing"
                  @mouseup="endDrawing"
                  @mouseleave="cancelDrawing"
                />

                <!-- Permanent Reference Lines and Drawn Lines Overlay -->
                <svg
                  class="lines-overlay"
                  :width="videoDisplayArea.width"
                  :height="videoDisplayArea.height"
                  :style="{
                    left: `${videoDisplayArea.x}px`,
                    top: `${videoDisplayArea.y}px`,
                    width: `${videoDisplayArea.width}px`,
                    height: `${videoDisplayArea.height}px`,
                  }"
                >
                  <!-- Reference Lines (if enabled) -->
                  <g v-if="showReferenceLines">
                    <!-- Double Long Service Line (Back Boundary) -->
                    <line
                      :x1="referenceLines.doubleLongService.x1"
                      :y1="referenceLines.doubleLongService.y1"
                      :x2="referenceLines.doubleLongService.x2"
                      :y2="referenceLines.doubleLongService.y2"
                      stroke="rgba(59, 130, 246, 0.3)"
                      stroke-width="2"
                      stroke-dasharray="5,5"
                    />
                    <!-- Center Line -->
                    <line
                      :x1="referenceLines.centerLine.x1"
                      :y1="referenceLines.centerLine.y1"
                      :x2="referenceLines.centerLine.x2"
                      :y2="referenceLines.centerLine.y2"
                      stroke="rgba(34, 197, 94, 0.3)"
                      stroke-width="2"
                      stroke-dasharray="5,5"
                    />
                    <!-- Short Service Line -->
                    <line
                      :x1="referenceLines.shortService.x1"
                      :y1="referenceLines.shortService.y1"
                      :x2="referenceLines.shortService.x2"
                      :y2="referenceLines.shortService.y2"
                      stroke="rgba(239, 68, 68, 0.3)"
                      stroke-width="2"
                      stroke-dasharray="5,5"
                    />
                  </g>

                  <!-- Drawn Lines with Adjustment Handles -->
                  <g
                    v-for="(line, index) in displayCompletedLines"
                    :key="`line-${index}`"
                  >
                    <template
                      v-if="line && line.displayStart && line.displayEnd"
                    >
                      <line
                        :x1="line.displayStart.x"
                        :y1="line.displayStart.y"
                        :x2="line.displayEnd.x"
                        :y2="line.displayEnd.y"
                        :stroke="line.color"
                        stroke-width="5"
                        stroke-linecap="round"
                        :opacity="line.confirmed ? 0.8 : 0.5"
                        class="drawn-line"
                        @click="selectLineForAdjustment(index)"
                      />
                      <!-- Adjustment Handles -->
                      <circle
                        v-if="selectedLineIndex === index"
                        :cx="line.displayStart.x"
                        :cy="line.displayStart.y"
                        r="8"
                        fill="white"
                        stroke="#3b82f6"
                        stroke-width="2"
                        class="adjustment-handle"
                        @mousedown="startAdjustment(index, 'start', $event)"
                      />
                      <circle
                        v-if="selectedLineIndex === index"
                        :cx="line.displayEnd.x"
                        :cy="line.displayEnd.y"
                        r="8"
                        fill="white"
                        stroke="#3b82f6"
                        stroke-width="2"
                        class="adjustment-handle"
                        @mousedown="startAdjustment(index, 'end', $event)"
                      />
                    </template>
                  </g>

                  <!-- Currently Drawing Line -->
                  <line
                    v-if="isDrawing && displayDrawingStart"
                    :x1="displayDrawingStart.x"
                    :y1="displayDrawingStart.y"
                    :x2="displayCurrentMousePos.x"
                    :y2="displayCurrentMousePos.y"
                    :stroke="getCurrentLineColor()"
                    stroke-width="5"
                    stroke-linecap="round"
                    opacity="0.6"
                    stroke-dasharray="5,5"
                  />
                </svg>
              </div>

              <!-- Video Controls -->
              <div class="video-controls">
                <button class="control-btn" @click="togglePlayPause">
                  <svg
                    v-if="!isPlaying"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                </button>

                <div class="time-display">
                  {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
                </div>

                <input
                  type="range"
                  class="video-scrubber"
                  :min="0"
                  :max="duration"
                  :value="currentTime"
                  @input="handleScrub"
                />

                <button class="control-btn" @click="toggleReferenceLines">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"
                    />
                  </svg>
                  {{ showReferenceLines ? 'Hide' : 'Show' }} Guides
                </button>
              </div>

              <!-- Line Confirmation Panel -->
              <div
                v-if="currentDrawnLine && !currentDrawnLine.confirmed"
                class="line-confirmation"
              >
                <p>Is this line positioned correctly?</p>
                <div class="confirmation-buttons">
                  <button class="btn-confirm" @click="confirmCurrentLine">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    Confirm
                  </button>
                  <button class="btn-adjust" @click="enableLineAdjustment">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path
                        d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
                      />
                    </svg>
                    Adjust
                  </button>
                  <button class="btn-redraw" @click="redrawCurrentLine">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fill-rule="evenodd"
                        d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    Redraw
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="modal-footer">
        <button class="btn-secondary" @click="resetCalibration">Reset</button>
        <div class="footer-actions">
          <button
            v-if="currentStep > 0"
            class="btn-secondary"
            @click="previousStep"
          >
            Previous
          </button>
          <button
            v-if="currentStep < 1"
            class="btn-primary"
            :disabled="!canProceedToNext"
            @click="nextStep"
          >
            Next
          </button>
          <button
            v-if="currentStep === 1"
            class="btn-success"
            :disabled="!canProceedToNext"
            @click="completeCalibration"
          >
            Complete Calibration
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import EdgeBasedCameraSelector from './EdgeBasedCameraSelector.vue';
import { calculateVideoDisplayArea } from '../utils/videoDisplayArea';
import type { VideoDisplayArea } from '../utils/videoDisplayArea';

// Props
interface Props {
  show: boolean;
  videoUrl: string;
  courtType?: 'badminton' | 'tennis';
}

const props = withDefaults(defineProps<Props>(), {
  courtType: 'badminton',
});

// Emits
const emit = defineEmits<{
  close: [];
  'calibration-complete': [data: any];
}>();

// Types
interface Point2D {
  x: number;
  y: number;
}

interface DrawnLine {
  start: Point2D;
  end: Point2D;
  color: string;
  confirmed: boolean;
  type: string;
}

// Refs
const videoElement = ref<HTMLVideoElement>();
const drawingCanvas = ref<HTMLCanvasElement>();

// State
const currentStep = ref(0);
const cameraPositionData = ref({
  edge: null as 'top' | 'bottom' | 'left' | 'right' | null,
  distance: 5,
  height: 3.5,
  position3D: { x: 0, y: 0, z: 3.5 },
});

// Video state
const videoWidth = ref(1280);
const videoHeight = ref(720);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const videoDisplayArea = ref<VideoDisplayArea>({
  x: 0,
  y: 0,
  width: 1280,
  height: 720,
  scaleX: 1,
  scaleY: 1,
});

// Line drawing state
const currentLineIndex = ref(0);
const completedLines = ref<(DrawnLine | null)[]>([]);
const isDrawing = ref(false);
const drawingStart = ref<Point2D | null>(null);
const currentMousePos = ref<Point2D>({ x: 0, y: 0 });
const selectedLineIndex = ref<number | null>(null);
const showReferenceLines = ref(true);
const calibrationQuality = ref<{ level: string; message: string } | null>(null);

// Line drawing sequence for badminton court - simplified to 3 essential lines
const lineDrawingSequence = [
  {
    id: 'service-long-doubles',
    name: 'Long Service Line for Doubles',
    color: '#3b82f6',
    description:
      'Draw the vertical long service line for doubles (back boundary line)',
  },
  {
    id: 'center-line',
    name: 'Center Line',
    color: '#22c55e',
    description:
      'Draw the horizontal center line dividing the upper and lower courts',
  },
  {
    id: 'service-short',
    name: 'Short Service Line',
    color: '#ef4444',
    description:
      'Draw the vertical short service line (front service boundary)',
  },
];

// Reference lines (permanent guides) - corrected for side view
const referenceLines = computed(() => {
  const w = videoDisplayArea.value.width;
  const h = videoDisplayArea.value.height;
  return {
    // Vertical line on the right side (back boundary)
    doubleLongService: { x1: w * 0.8, y1: h * 0.1, x2: w * 0.8, y2: h * 0.9 },
    // Horizontal line in the middle (dividing upper/lower courts)
    centerLine: { x1: w * 0.2, y1: h * 0.5, x2: w * 0.8, y2: h * 0.5 },
    // Vertical line closer to center (short service line)
    shortService: { x1: w * 0.6, y1: h * 0.1, x2: w * 0.6, y2: h * 0.9 },
  };
});

// Court dimensions
const courtDimensions = computed(() => {
  if (props.courtType === 'tennis') {
    return { length: 23.77, width: 10.97 };
  }
  return { length: 13.4, width: 6.1 }; // Badminton
});

// Helper function to initialize completed lines array
const initializeCompletedLines = () => {
  completedLines.value = new Array(lineDrawingSequence.length).fill(null);
};

// Initialize when modal is shown
watch(
  () => props.show,
  (newValue) => {
    if (newValue && completedLines.value.length === 0) {
      initializeCompletedLines();
    }
  }
);

// Current line being drawn
const currentDrawnLine = computed(() => {
  return completedLines.value[currentLineIndex.value];
});

// Computed properties
const canProceedToNext = computed(() => {
  if (currentStep.value === 0) {
    return cameraPositionData.value.edge !== null;
  } else if (currentStep.value === 1) {
    // Need all 3 lines confirmed
    const confirmedCount = completedLines.value.filter(
      (l) => l?.confirmed
    ).length;
    return confirmedCount >= 3;
  }
  return false;
});

// Methods
const closeModal = () => {
  // Clean up resize listener
  window.removeEventListener('resize', updateCanvasDimensions);
  emit('close');
};

const nextStep = () => {
  if (canProceedToNext.value) {
    currentStep.value++;
  }
};

const previousStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
};

const resetCalibration = () => {
  currentStep.value = 0;
  currentLineIndex.value = 0;
  completedLines.value = [];
  selectedLineIndex.value = null;
};

const completeCalibration = () => {
  // Convert drawn lines to normalized coordinates (0-1 range) relative to video dimensions
  const normalizedLines = completedLines.value
    .map((line) => {
      if (!line || !line.start || !line.end || !videoElement.value) return null;

      const videoWidth = videoElement.value.videoWidth || 1920;
      const videoHeight = videoElement.value.videoHeight || 1080;

      // Normalize coordinates to 0-1 range based on video's natural dimensions
      return {
        ...line,
        start: {
          x: line.start.x / videoWidth,
          y: line.start.y / videoHeight,
        },
        end: {
          x: line.end.x / videoWidth,
          y: line.end.y / videoHeight,
        },
        // Store original video dimensions for reference
        videoDimensions: {
          width: videoWidth,
          height: videoHeight,
        },
      };
    })
    .filter((line) => line !== null);

  emit('calibration-complete', {
    cameraPosition: cameraPositionData.value,
    drawnLines: normalizedLines,
  });
  closeModal();
};

// Camera position handlers
const handleEdgeSelected = (edge: 'top' | 'bottom' | 'left' | 'right') => {
  console.log('Edge selected:', edge);
};

const handleCameraPositionChanged = (position: {
  x: number;
  y: number;
  z: number;
}) => {
  console.log('Camera position changed:', position);
};

// Video control methods
const handleVideoLoaded = () => {
  if (videoElement.value) {
    // Use the video's natural dimensions for consistent coordinate system
    videoWidth.value = videoElement.value.videoWidth;
    videoHeight.value = videoElement.value.videoHeight;
    duration.value = videoElement.value.duration;

    // Calculate the actual video display area accounting for object-fit: contain
    updateVideoDisplayArea();

    // Set canvas size to match the display area
    if (drawingCanvas.value) {
      drawingCanvas.value.width = videoDisplayArea.value.width;
      drawingCanvas.value.height = videoDisplayArea.value.height;
    }

    // Add resize listener to update dimensions
    window.addEventListener('resize', updateCanvasDimensions);
  }
};

const updateVideoDisplayArea = () => {
  if (videoElement.value) {
    const videoContainer = videoElement.value.parentElement;
    if (videoContainer) {
      videoDisplayArea.value = calculateVideoDisplayArea(
        videoElement.value,
        videoContainer
      );
    }
  }
};

// Convert video coordinates to SVG coordinates (since SVG now matches display area)
const convertVideoToDisplayCoordinates = (videoX: number, videoY: number) => {
  const displayArea = videoDisplayArea.value;
  return {
    x: videoX / displayArea.scaleX,
    y: videoY / displayArea.scaleY,
  };
};

// Computed properties for display coordinates
const displayDrawingStart = computed(() => {
  if (!drawingStart.value) return null;
  return convertVideoToDisplayCoordinates(
    drawingStart.value.x,
    drawingStart.value.y
  );
});

const displayCurrentMousePos = computed(() => {
  if (!currentMousePos.value) return { x: 0, y: 0 };
  return convertVideoToDisplayCoordinates(
    currentMousePos.value.x,
    currentMousePos.value.y
  );
});

const displayCompletedLines = computed(() => {
  return completedLines.value
    .map((line) => {
      if (!line || !line.start || !line.end) return null;

      const displayStart = convertVideoToDisplayCoordinates(
        line.start.x,
        line.start.y
      );
      const displayEnd = convertVideoToDisplayCoordinates(
        line.end.x,
        line.end.y
      );

      return {
        ...line,
        displayStart,
        displayEnd,
      };
    })
    .filter((line) => line !== null);
});

const updateCanvasDimensions = () => {
  if (videoElement.value && drawingCanvas.value) {
    // Update video display area first
    updateVideoDisplayArea();

    // Set canvas dimensions to match the display area
    drawingCanvas.value.width = videoDisplayArea.value.width;
    drawingCanvas.value.height = videoDisplayArea.value.height;
  }
};

const handleTimeUpdate = () => {
  if (videoElement.value) {
    currentTime.value = videoElement.value.currentTime;
  }
};

const togglePlayPause = () => {
  if (videoElement.value) {
    if (isPlaying.value) {
      videoElement.value.pause();
    } else {
      videoElement.value.play();
    }
    isPlaying.value = !isPlaying.value;
  }
};

const handleScrub = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (videoElement.value) {
    videoElement.value.currentTime = parseFloat(target.value);
  }
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const toggleReferenceLines = () => {
  showReferenceLines.value = !showReferenceLines.value;
};

// Line drawing methods
const startDrawing = (event: MouseEvent) => {
  if (!drawingCanvas.value || !videoElement.value) return;

  const canvasRect = drawingCanvas.value.getBoundingClientRect();
  const relativeX = event.clientX - canvasRect.left;
  const relativeY = event.clientY - canvasRect.top;

  // Check if click is within canvas bounds
  if (
    relativeX < 0 ||
    relativeY < 0 ||
    relativeX > canvasRect.width ||
    relativeY > canvasRect.height
  ) {
    return; // Click outside canvas area
  }

  // Since canvas now matches the video display area exactly, convert directly to video coordinates
  const displayArea = videoDisplayArea.value;
  const videoX = relativeX * displayArea.scaleX;
  const videoY = relativeY * displayArea.scaleY;

  isDrawing.value = true;
  drawingStart.value = { x: videoX, y: videoY };
  currentMousePos.value = { x: videoX, y: videoY };
};

const handleDrawing = (event: MouseEvent) => {
  if (!drawingCanvas.value || !videoElement.value) return;

  const canvasRect = drawingCanvas.value.getBoundingClientRect();
  const relativeX = event.clientX - canvasRect.left;
  const relativeY = event.clientY - canvasRect.top;

  // Since canvas now matches the video display area exactly, convert directly to video coordinates
  if (
    relativeX >= 0 &&
    relativeX <= canvasRect.width &&
    relativeY >= 0 &&
    relativeY <= canvasRect.height
  ) {
    const displayArea = videoDisplayArea.value;
    const videoX = relativeX * displayArea.scaleX;
    const videoY = relativeY * displayArea.scaleY;
    currentMousePos.value = { x: videoX, y: videoY };
  }
};

const endDrawing = (event: MouseEvent) => {
  if (
    !isDrawing.value ||
    !drawingStart.value ||
    !drawingCanvas.value ||
    !videoElement.value
  )
    return;

  const canvasRect = drawingCanvas.value.getBoundingClientRect();
  const relativeX = event.clientX - canvasRect.left;
  const relativeY = event.clientY - canvasRect.top;

  // Check if release is within canvas bounds
  if (
    relativeX < 0 ||
    relativeX > canvasRect.width ||
    relativeY < 0 ||
    relativeY > canvasRect.height
  ) {
    cancelDrawing();
    return; // Release is outside canvas area
  }

  // Since canvas now matches the video display area exactly, convert directly to video coordinates
  const displayArea = videoDisplayArea.value;
  const x = relativeX * displayArea.scaleX;
  const y = relativeY * displayArea.scaleY;

  const currentLine = lineDrawingSequence[currentLineIndex.value];
  if (!currentLine) return;

  const newLine: DrawnLine = {
    start: drawingStart.value,
    end: { x, y },
    color: currentLine.color,
    confirmed: false,
    type: currentLine.id,
  };

  completedLines.value[currentLineIndex.value] = newLine;

  isDrawing.value = false;
  drawingStart.value = null;
};

const cancelDrawing = () => {
  isDrawing.value = false;
  drawingStart.value = null;
};

const confirmCurrentLine = () => {
  if (currentDrawnLine.value) {
    currentDrawnLine.value.confirmed = true;
    if (currentLineIndex.value < lineDrawingSequence.length - 1) {
      currentLineIndex.value++;
    }
  }
};

const redrawCurrentLine = () => {
  // Set the current line to null to clear it
  completedLines.value[currentLineIndex.value] = null;
};

const enableLineAdjustment = () => {
  selectedLineIndex.value = currentLineIndex.value;
};

const selectLineForAdjustment = (index: number) => {
  selectedLineIndex.value = index;
};

const startAdjustment = (
  lineIndex: number,
  endpoint: 'start' | 'end',
  event: MouseEvent
) => {
  // Implementation for adjusting line endpoints
  event.stopPropagation();
  console.log('Adjusting line', lineIndex, endpoint);
};

const goToPreviousLine = () => {
  if (currentLineIndex.value > 0) {
    currentLineIndex.value--;
  }
};

const skipCurrentLine = () => {
  if (currentLineIndex.value < lineDrawingSequence.length - 1) {
    currentLineIndex.value++;
  }
};

const canSkipCurrentLine = () => {
  // Can skip if we have at least 2 confirmed lines (since we only have 3 total)
  const confirmedCount = completedLines.value.filter(
    (l) => l?.confirmed
  ).length;
  return confirmedCount >= 2;
};

const resetAllLines = () => {
  initializeCompletedLines();
  currentLineIndex.value = 0;
  selectedLineIndex.value = null;
};

const getCurrentLineName = () => {
  return lineDrawingSequence[currentLineIndex.value]?.name || '';
};

const getCurrentLineColor = () => {
  return lineDrawingSequence[currentLineIndex.value]?.color || '#000';
};

const getCurrentLineDescription = () => {
  return lineDrawingSequence[currentLineIndex.value]?.description || '';
};

const getLineStatus = (index: number) => {
  const line = completedLines.value[index];
  if (!line) return 'Pending';
  if (line.confirmed) return 'Confirmed';
  return 'Drawn';
};
</script>

<style scoped>
.calibration-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.calibration-modal {
  background: white;
  border-radius: 12px;
  width: 95%;
  max-width: 1600px;
  height: 90vh;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
}

.close-button {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.close-button:hover {
  background-color: #f3f4f6;
  color: #374151;
}

.modal-content {
  flex: 1;
  padding: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Camera Position Section */
.camera-position-section {
  display: grid;
  grid-template-columns: minmax(280px, 320px) 1fr;
  gap: 16px;
  height: 100%;
  overflow: hidden;
}

/* Constrain EdgeBasedCameraSelector within modal */
.camera-position-section :deep(.edge-based-camera-selector) {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.camera-position-section :deep(.court-svg) {
  max-width: 100%;
  max-height: calc(100vh - 280px);
  width: auto;
  height: auto;
}

.camera-position-section :deep(.court-container) {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  min-height: 0;
}

.camera-position-section :deep(.edge-based-camera-selector > * + *) {
  margin-top: 0.75rem;
}

.camera-position-section :deep(.camera-controls-panel) {
  padding: 0.75rem;
  margin-top: 0.5rem;
}

.camera-position-section :deep(.controls-grid) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.camera-position-section :deep(.method-comparison),
.camera-position-section :deep(.position-summary) {
  display: none;
}

.instruction-panel {
  background-color: #f9fafb;
  border-radius: 8px;
  padding: 12px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.instruction-panel h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.instruction-panel p {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.4;
}

.benefits-box {
  background-color: #eff6ff;
  border: 1px solid #3b82f6;
  border-radius: 6px;
  padding: 8px;
  margin-top: auto;
}

.benefits-box ul {
  margin: 0;
  padding-left: 16px;
  list-style-type: disc;
}

.benefits-box li {
  font-size: 12px;
  color: #1e40af;
  margin-bottom: 2px;
}

/* Video Line Drawing Section */
.video-line-drawing-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.line-drawing-header {
  background-color: #f9fafb;
  border-radius: 6px;
  padding: 12px;
  flex-shrink: 0;
}

.current-line-instruction {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.line-sequence-indicator {
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.current-line-prompt {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  color: #1f2937;
}

.prompt-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  flex-shrink: 0;
}

.line-help-text {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.video-content-wrapper {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
}

.video-player-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}

.video-wrapper {
  position: relative;
  background-color: #000;
  border-radius: 6px;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.calibration-video {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  position: relative;
  z-index: 1;
}

.video-area-indicator {
  position: absolute;
  border: 3px solid rgba(59, 130, 246, 0.8);
  background: rgba(59, 130, 246, 0.1);
  pointer-events: none;
  z-index: 5;
  transition: all 0.3s ease;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
}

.video-area-indicator::before {
  content: 'DRAW LINES WITHIN THIS BLUE AREA';
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(59, 130, 246, 0.95);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: bold;
  white-space: nowrap;
  opacity: 1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 10;
}

.video-wrapper:hover .video-area-indicator {
  border-color: rgba(59, 130, 246, 1);
  background: rgba(59, 130, 246, 0.15);
}

.drawing-canvas-overlay {
  position: absolute;
  cursor: crosshair;
  z-index: 15;
  pointer-events: auto;
}

.lines-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 10;
}

.lines-overlay .drawn-line {
  pointer-events: auto;
  cursor: pointer;
}

.lines-overlay .drawn-line:hover {
  stroke-width: 4;
}

.adjustment-handle {
  cursor: move;
  pointer-events: auto;
}

.video-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background-color: #f9fafb;
  border-radius: 6px;
  flex-shrink: 0;
  position: relative;
  z-index: 5;
}

.control-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: white;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn:hover {
  background-color: #f3f4f6;
}

.control-btn svg {
  width: 16px;
  height: 16px;
  color: #374151;
}

.time-display {
  font-size: 12px;
  color: #4b5563;
  min-width: 70px;
}

.video-scrubber {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background-color: #e5e7eb;
  outline: none;
  cursor: pointer;
}

.video-scrubber::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: #3b82f6;
  cursor: pointer;
}

.line-confirmation {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  z-index: 25;
  max-width: 90%;
}

.line-confirmation p {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #374151;
}

.confirmation-buttons {
  display: flex;
  gap: 8px;
}

.btn-confirm,
.btn-adjust,
.btn-redraw {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-confirm {
  background-color: #10b981;
  color: white;
}

.btn-confirm:hover {
  background-color: #059669;
}

.btn-adjust {
  background-color: #3b82f6;
  color: white;
}

.btn-adjust:hover {
  background-color: #2563eb;
}

.btn-redraw {
  background-color: #f59e0b;
  color: white;
}

.btn-redraw:hover {
  background-color: #d97706;
}

.btn-confirm svg,
.btn-adjust svg,
.btn-redraw svg {
  width: 16px;
  height: 16px;
}

/* Progress Sidebar */
.line-progress-sidebar {
  background-color: #f9fafb;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  height: 100%;
}

/* Court Diagram Guide */
.court-diagram-guide {
  background-color: white;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  margin-bottom: 8px;
}

.guide-svg {
  width: 100%;
  height: auto;
  max-height: 150px;
}

.line-progress-sidebar h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.line-progress-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
}

.progress-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background-color: white;
  border-radius: 4px;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.progress-item.current {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.progress-item.completed {
  opacity: 0.8;
}

.progress-indicator {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-indicator .check-icon {
  width: 24px;
  height: 24px;
  color: #10b981;
}

.current-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #3b82f6;
  animation: pulse 2s infinite;
}

.pending-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #d1d5db;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}

.progress-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.line-name {
  font-size: 13px;
  font-weight: 500;
  color: #1f2937;
}

.line-status {
  font-size: 11px;
  color: #6b7280;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  flex-shrink: 0;
}

.action-btn {
  padding: 6px 12px;
  background-color: white;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background-color: #f3f4f6;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.reset {
  background-color: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
}

.action-btn.reset:hover {
  background-color: #fca5a5;
}

/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  background-color: #f9fafb;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.btn-primary,
.btn-secondary,
.btn-success {
  padding: 8px 16px;
  border-radius: 4px;
  font-weight: 500;
  font-size: 13px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background-color: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #e5e7eb;
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-success {
  background-color: #10b981;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background-color: #059669;
}

.btn-success:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Calibration Quality Badge */
.calibration-quality {
  margin-left: auto;
  margin-right: 16px;
}

.quality-badge {
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
}

.quality-badge.quality-excellent {
  background-color: #10b981;
  color: white;
}

.quality-badge.quality-good {
  background-color: #3b82f6;
  color: white;
}

.quality-badge.quality-fair {
  background-color: #f59e0b;
  color: white;
}

.quality-badge.quality-poor {
  background-color: #ef4444;
  color: white;
}

/* Responsive adjustments */
@media (max-width: 1280px) {
  .calibration-modal {
    width: 98%;
    height: 95vh;
  }

  .camera-position-section {
    grid-template-columns: minmax(250px, 300px) 1fr;
  }

  .video-content-wrapper {
    grid-template-columns: 250px 1fr;
  }
}

@media (max-width: 768px) {
  .camera-position-section {
    grid-template-columns: 1fr;
  }

  .video-content-wrapper {
    grid-template-columns: 1fr;
  }

  .line-progress-sidebar {
    display: none;
  }
}
</style>
