<template>
  <div
    class="pose-visualization absolute inset-0 pointer-events-none"
    :style="{ zIndex: 10 }"
  >
    <!-- Pose landmarks and skeleton overlay -->
    <svg
      v-if="showPose && currentPose && currentPose.detected"
      class="absolute inset-0 w-full h-full"
      :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
      preserveAspectRatio="none"
    >
      <!-- Skeleton connections -->
      <g
        v-if="showSkeleton"
        class="pose-skeleton"
      >
        <line
          v-for="(connection, index) in filteredConnections"
          :key="`connection-${index}`"
          :x1="getLandmarkCanvasCoord(connection[0]).x"
          :y1="getLandmarkCanvasCoord(connection[0]).y"
          :x2="getLandmarkCanvasCoord(connection[1]).x"
          :y2="getLandmarkCanvasCoord(connection[1]).y"
          :stroke="skeletonColor"
          :stroke-width="skeletonWidth"
          :opacity="getConnectionOpacity(connection)"
          stroke-linecap="round"
        />
      </g>

      <!-- Landmark points -->
      <g
        v-if="showLandmarks"
        class="pose-landmarks"
      >
        <circle
          v-for="(landmark, index) in currentPose.landmarks"
          v-show="isKeypointSelected(index)"
          :key="`landmark-${index}`"
          :cx="getLandmarkCanvasCoord(index).x"
          :cy="getLandmarkCanvasCoord(index).y"
          :r="landmarkRadius"
          :fill="getLandmarkColor(index)"
          :opacity="getLandmarkOpacity(landmark)"
          :stroke="landmarkStrokeColor"
          :stroke-width="landmarkStrokeWidth"
        />
      </g>

      <!-- Landmark labels (optional) -->
      <g
        v-if="showLabels"
        class="pose-labels"
      >
        <text
          v-for="(landmark, index) in currentPose.landmarks"
          v-show="isKeypointSelected(index)"
          :key="`label-${index}`"
          :x="getLandmarkCanvasCoord(index).x + labelOffset.x"
          :y="getLandmarkCanvasCoord(index).y + labelOffset.y"
          :fill="labelColor"
          :font-size="labelFontSize"
          :opacity="getLandmarkOpacity(landmark)"
          font-family="Arial, sans-serif"
          text-anchor="start"
        >
          {{ LANDMARK_NAMES[index] }}
        </text>
      </g>

      <!-- Center of Mass -->
      <g
        v-if="
          showCenterOfMass &&
            speedMetrics &&
            speedMetrics.centerOfMassNormalized
        "
        class="center-of-mass"
      >
        <!-- Crosshair lines -->
        <line
          :x1="centerOfMassCanvasCoord.x - centerOfMassRadius - 2"
          :y1="centerOfMassCanvasCoord.y"
          :x2="centerOfMassCanvasCoord.x + centerOfMassRadius + 2"
          :y2="centerOfMassCanvasCoord.y"
          :stroke="centerOfMassColor"
          :stroke-width="centerOfMassStrokeWidth"
          stroke-linecap="round"
        />
        <line
          :x1="centerOfMassCanvasCoord.x"
          :y1="centerOfMassCanvasCoord.y - centerOfMassRadius - 2"
          :x2="centerOfMassCanvasCoord.x"
          :y2="centerOfMassCanvasCoord.y + centerOfMassRadius + 2"
          :stroke="centerOfMassColor"
          :stroke-width="centerOfMassStrokeWidth"
          stroke-linecap="round"
        />
        <!-- Center circle -->
        <circle
          :cx="centerOfMassCanvasCoord.x"
          :cy="centerOfMassCanvasCoord.y"
          :r="centerOfMassRadius"
          :fill="centerOfMassColor"
          :stroke="centerOfMassStrokeColor"
          :stroke-width="centerOfMassStrokeWidth"
          opacity="0.8"
        />
        <!-- CoM label -->
        <text
          v-if="showLabels"
          :x="centerOfMassCanvasCoord.x + centerOfMassRadius + 8"
          :y="centerOfMassCanvasCoord.y - centerOfMassRadius - 5"
          :fill="centerOfMassColor"
          :font-size="labelFontSize"
          font-family="Arial, sans-serif"
          font-weight="bold"
          text-shadow="1px 1px 2px rgba(0, 0, 0, 0.8)"
        >
          CoM
        </text>
      </g>
    </svg>
  </div>
</template>

<script setup>
import { computed, toRefs, watch } from 'vue';

const props = defineProps({
  // Pose data
  currentPose: {
    type: Object,
    default: null,
  },

  // Canvas dimensions
  canvasWidth: {
    type: Number,
    default: 1920,
  },
  canvasHeight: {
    type: Number,
    default: 1080,
  },

  // Visibility controls
  showPose: {
    type: Boolean,
    default: true,
  },
  showSkeleton: {
    type: Boolean,
    default: true,
  },
  showLandmarks: {
    type: Boolean,
    default: true,
  },
  showLabels: {
    type: Boolean,
    default: false,
  },
  showConfidence: {
    type: Boolean,
    default: true,
  },
  showNoPoseIndicator: {
    type: Boolean,
    default: true,
  },
  showCenterOfMass: {
    type: Boolean,
    default: false,
  },

  // Speed data
  speedMetrics: {
    type: Object,
    default: null,
  },

  // Keypoint selection
  selectedKeypoints: {
    type: Array,
    default: () => Array.from({ length: 33 }, (_, i) => i), // All keypoints by default
  },

  // Styling options
  skeletonColor: {
    type: String,
    default: '#00ff00',
  },
  skeletonWidth: {
    type: Number,
    default: 2,
  },
  landmarkRadius: {
    type: Number,
    default: 4,
  },
  landmarkStrokeColor: {
    type: String,
    default: '#ffffff',
  },
  landmarkStrokeWidth: {
    type: Number,
    default: 1,
  },
  labelColor: {
    type: String,
    default: '#ffffff',
  },
  labelFontSize: {
    type: Number,
    default: 10,
  },
  labelOffset: {
    type: Object,
    default: () => ({ x: 5, y: -5 }),
  },

  // Center of mass styling
  centerOfMassColor: {
    type: String,
    default: '#9333ea', // Purple to distinguish from other colors
  },
  centerOfMassRadius: {
    type: Number,
    default: 6,
  },
  centerOfMassStrokeColor: {
    type: String,
    default: '#ffffff',
  },
  centerOfMassStrokeWidth: {
    type: Number,
    default: 2,
  },

  // Minimum visibility threshold
  minVisibility: {
    type: Number,
    default: 0.5,
  },
});

const {
  currentPose,
  canvasWidth,
  canvasHeight,
  minVisibility,
  selectedKeypoints,
  speedMetrics,
  showPose,
} = toRefs(props);

// Debug logging for pose data
watch(
  currentPose,
  (newPose) => {
    console.log('🔍 [DEBUG] PoseVisualization currentPose changed:', {
      pose: !!newPose,
      detected: newPose?.detected,
      landmarksCount: newPose?.landmarks?.length || 0,
      showPose: showPose.value,
      timestamp: newPose?.timestamp,
    });
  },
  { immediate: true }
);

watch(
  showPose,
  (newShowPose) => {
    console.log('🔍 [DEBUG] PoseVisualization showPose changed:', newShowPose);
  },
  { immediate: true }
);

// MediaPipe pose landmark connections
const POSE_CONNECTIONS = [
  // Face
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
  // Torso
  [11, 12],
  [11, 13],
  [12, 14],
  [13, 15],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  // Left arm
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  // Right arm
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  // Left leg
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],
  // Right leg
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
];

// Landmark names
const LANDMARK_NAMES = [
  'nose',
  'left_eye_inner',
  'left_eye',
  'left_eye_outer',
  'right_eye_inner',
  'right_eye',
  'right_eye_outer',
  'left_ear',
  'right_ear',
  'mouth_left',
  'mouth_right',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_pinky',
  'right_pinky',
  'left_index',
  'right_index',
  'left_thumb',
  'right_thumb',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot_index',
  'right_foot_index',
];

// Landmark colors by body part
const LANDMARK_COLORS = {
  // Face (blue)
  0: '#3b82f6',
  1: '#3b82f6',
  2: '#3b82f6',
  3: '#3b82f6',
  4: '#3b82f6',
  5: '#3b82f6',
  6: '#3b82f6',
  7: '#3b82f6',
  8: '#3b82f6',
  9: '#3b82f6',
  10: '#3b82f6',
  // Arms (green)
  11: '#10b981',
  12: '#10b981',
  13: '#10b981',
  14: '#10b981',
  15: '#10b981',
  16: '#10b981',
  17: '#10b981',
  18: '#10b981',
  19: '#10b981',
  20: '#10b981',
  21: '#10b981',
  22: '#10b981',
  // Torso/Hips (yellow)
  23: '#f59e0b',
  24: '#f59e0b',
  // Legs (red)
  25: '#ef4444',
  26: '#ef4444',
  27: '#ef4444',
  28: '#ef4444',
  29: '#ef4444',
  30: '#ef4444',
  31: '#ef4444',
  32: '#ef4444',
};

// Convert normalized coordinates to canvas coordinates (simplified for reliability)
const getLandmarkCanvasCoord = (landmarkIndex) => {
  if (
    !currentPose.value ||
    !currentPose.value.landmarks ||
    !currentPose.value.landmarks[landmarkIndex]
  ) {
    return { x: 0, y: 0 };
  }

  const landmark = currentPose.value.landmarks[landmarkIndex];
  return {
    x: landmark.x * canvasWidth.value,
    y: landmark.y * canvasHeight.value,
  };
};

// Get landmark color
const getLandmarkColor = (index) => {
  return LANDMARK_COLORS[index] || '#ffffff';
};

// Get landmark opacity based on visibility
const getLandmarkOpacity = (landmark) => {
  if (!landmark || typeof landmark.visibility !== 'number') {
    return 0.8;
  }
  return Math.max(0.3, landmark.visibility);
};

// Get connection opacity based on both landmarks' visibility
const getConnectionOpacity = (connection) => {
  if (!currentPose.value || !currentPose.value.landmarks) {
    return 0;
  }

  const landmark1 = currentPose.value.landmarks[connection[0]];
  const landmark2 = currentPose.value.landmarks[connection[1]];

  if (!landmark1 || !landmark2) {
    return 0;
  }

  const visibility1 = landmark1.visibility || 0;
  const visibility2 = landmark2.visibility || 0;

  // Only show connection if both landmarks are visible enough
  if (visibility1 < minVisibility.value || visibility2 < minVisibility.value) {
    return 0;
  }

  return Math.min(visibility1, visibility2) * 0.8;
};

// Get confidence color
const getConfidenceColor = (confidence) => {
  if (confidence >= 0.8) return '#10b981'; // green
  if (confidence >= 0.6) return '#f59e0b'; // yellow
  return '#ef4444'; // red
};

// Check if keypoint is selected
const isKeypointSelected = (index) => {
  // If selectedKeypoints is empty or undefined, show all keypoints
  if (!selectedKeypoints.value || selectedKeypoints.value.length === 0) {
    return true;
  }

  return selectedKeypoints.value.includes(index);
};

// Get filtered connections based on selected keypoints
const filteredConnections = computed(() => {
  // If no keypoints are selected or selectedKeypoints is empty, show all connections
  if (!selectedKeypoints.value || selectedKeypoints.value.length === 0) {
    return POSE_CONNECTIONS;
  }

  return POSE_CONNECTIONS.filter(
    (connection) =>
      selectedKeypoints.value.includes(connection[0]) &&
      selectedKeypoints.value.includes(connection[1])
  );
});

// Convert normalized coordinates to canvas coordinates
// This matches the coordinate system used by pose landmarks (0-1 range)

// Center of Mass canvas coordinates
const centerOfMassCanvasCoord = computed(() => {
  if (!speedMetrics.value || !speedMetrics.value.centerOfMassNormalized) {
    return { x: 0, y: 0 };
  }
  // Use normalized coordinates for proper alignment with pose landmarks
  return {
    x: speedMetrics.value.centerOfMassNormalized.x * canvasWidth.value,
    y: speedMetrics.value.centerOfMassNormalized.y * canvasHeight.value,
  };
});

// No need to return anything in script setup - all variables are automatically exposed
</script>

<style scoped>
.pose-visualization {
  user-select: none;
  /* Optimize rendering performance */
  will-change: transform;
  transform: translateZ(0);
}

/* Remove transitions for better performance during real-time updates */
.pose-skeleton line {
  /* transition: opacity 0.1s ease; - Removed for performance */
}

.pose-landmarks circle {
  /* transition: opacity 0.1s ease; - Removed for performance */
}

.pose-labels text {
  /* transition: opacity 0.1s ease; - Removed for performance */
  font-weight: bold;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.pose-confidence text {
  font-weight: bold;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

/* Optimize SVG rendering */
svg {
  shape-rendering: optimizeSpeed;
  text-rendering: optimizeSpeed;
}
</style>
