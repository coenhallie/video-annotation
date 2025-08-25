<template>
  <div
    class="speed-chart-container"
    :class="{ compact: compactMode }"
  >
    <!-- Chart Settings (only show in non-compact mode) -->
    <div
      v-if="!compactMode"
      class="chart-settings"
    >
      <label class="setting-item">
        <span class="text-sm text-gray-600">Duration:</span>
        <select
          v-model="chartDuration"
          class="input text-xs"
        >
          <option :value="10">10s</option>
          <option :value="30">30s</option>
          <option :value="60">1min</option>
          <option :value="120">2min</option>
        </select>
      </label>

      <label class="setting-item">
        <span class="text-sm text-gray-600 whitespace-nowrap">Max Speed:</span>
        <select
          v-model="maxSpeedScale"
          class="input text-xs"
        >
          <option :value="1">1 m/s</option>
          <option :value="2">2 m/s</option>
          <option :value="5">5 m/s</option>
        </select>
      </label>

      <button
        class="btn btn-ghost btn-sm text-gray-500 hover:text-red-600"
        title="Clear chart history"
        @click="clearHistory"
      >
        <svg
          class="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>

    <!-- Speed Chart -->
    <div class="speed-chart">
      <div class="chart-header">
        <h4 class="text-sm font-medium text-gray-900">
          Overall Speed Over Time
        </h4>
        <div class="current-speed">
          <span class="text-xs text-gray-600">Current:</span>
          <span
            class="text-sm font-medium"
            :class="getSpeedColorClass(currentSpeed)"
          >
            {{ currentSpeed.toFixed(2) }} m/s
          </span>
        </div>
      </div>

      <div
        ref="chartWrapper"
        class="chart-wrapper"
      >
        <svg
          ref="chartSvg"
          class="speed-chart-svg"
          :width="chartWidth"
          :height="chartHeight"
          :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
        >
          <!-- Grid lines -->
          <defs>
            <pattern
              id="grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="#e5e7eb"
                stroke-width="1"
              />
            </pattern>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="url(#grid)"
          />

          <!-- Y-axis labels -->
          <g class="y-axis">
            <line
              x1="40"
              y1="20"
              x2="40"
              :y2="chartHeight - 30"
              stroke="#9ca3af"
              stroke-width="1"
            />
            <text
              v-for="(tick, index) in yAxisTicks"
              :key="index"
              :x="35"
              :y="tick.y + 4"
              fill="#6b7280"
              font-size="10"
              text-anchor="end"
            >
              {{ tick.value.toFixed(1) }}
            </text>
            <text
              x="20"
              :y="chartHeight / 2"
              fill="#6b7280"
              font-size="10"
              text-anchor="middle"
              transform="rotate(-90, 20, 120)"
            >
              Speed (m/s)
            </text>
          </g>

          <!-- X-axis -->
          <g class="x-axis">
            <line
              :x1="40"
              :y1="chartHeight - 30"
              :x2="chartWidth - 20"
              :y2="chartHeight - 30"
              stroke="#9ca3af"
              stroke-width="1"
            />
            <text
              v-for="(tick, index) in xAxisTicks"
              :key="index"
              :x="tick.x"
              :y="chartHeight - 15"
              fill="#6b7280"
              font-size="10"
              text-anchor="middle"
            >
              {{ tick.label }}
            </text>
            <text
              :x="chartWidth / 2"
              :y="chartHeight - 5"
              fill="#6b7280"
              font-size="10"
              text-anchor="middle"
            >
              Time (seconds ago)
            </text>
          </g>

          <!-- Speed line -->
          <g class="speed-line">
            <path
              v-if="speedPath"
              :d="speedPath"
              fill="none"
              stroke="#374151"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
            />

            <!-- Data points -->
            <circle
              v-for="(point, index) in visibleDataPoints"
              :key="index"
              :cx="point.x"
              :cy="point.y"
              r="2"
              :fill="getSpeedColor(point.speed)"
              stroke="#374151"
              stroke-width="1"
              opacity="0.8"
            >
              <title>
                {{ point.speed.toFixed(2) }} m/s at Frame {{ point.frame }}
              </title>
            </circle>
          </g>

          <!-- Current time indicator -->
          <line
            :x1="chartWidth - 20"
            y1="20"
            :x2="chartWidth - 20"
            :y2="chartHeight - 30"
            stroke="#d1d5db"
            stroke-width="2"
            stroke-dasharray="5,5"
            opacity="0.7"
          />
        </svg>
      </div>

      <!-- Chart Stats (only show in non-compact mode) -->
      <div
        v-if="!compactMode"
        class="chart-stats"
      >
        <div class="stat-item">
          <span class="text-xs text-gray-500 uppercase tracking-wide">Avg:</span>
          <span class="text-sm font-medium text-gray-900">{{ averageSpeed.toFixed(2) }} m/s</span>
        </div>
        <div class="stat-item">
          <span class="text-xs text-gray-500 uppercase tracking-wide">Max:</span>
          <span class="text-sm font-medium text-gray-900">{{ maxSpeed.toFixed(2) }} m/s</span>
        </div>
        <div class="stat-item">
          <span class="text-xs text-gray-500 uppercase tracking-wide">Frame:</span>
          <span class="text-sm font-medium text-gray-900">{{
            currentFrame
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  speedMetrics: {
    type: Object,
    default: null,
  },
  timestamp: {
    type: Number,
    default: 0,
  },
  currentFrame: {
    type: Number,
    default: 0,
  },
  visible: {
    type: Boolean,
    default: true,
  },
  chartDuration: {
    type: Number,
    default: 30,
  },
  maxSpeedScale: {
    type: Number,
    default: 1,
  },
  compactMode: {
    type: Boolean,
    default: false,
  },
});

// Remove emit since we no longer have internal toggle
// Chart state - now controlled by parent or props
const chartDuration = computed(() => props.chartDuration);
const maxSpeedScale = computed(() => props.maxSpeedScale);
const chartWidth = ref(400);
const chartHeight = ref(props.compactMode ? 145 : 160);

// Chart elements
const chartWrapper = ref(null);
const chartSvg = ref(null);

// Speed data history
const speedHistory = ref([]);
const maxHistorySize = 1000; // Maximum number of data points to store

// Current speed for display
const currentSpeed = computed(() => {
  return props.speedMetrics?.speed || 0;
});

// Add new speed data point using synchronized timestamp
const addSpeedData = (speed, timestamp, frameNumber) => {
  if (typeof speed !== 'number' || !isFinite(speed) || speed < 0) {
    console.warn(`📊 [SpeedChart] Invalid speed data: ${speed}`);
    return;
  }

  if (typeof timestamp !== 'number' || !isFinite(timestamp) || timestamp < 0) {
    console.warn(`📊 [SpeedChart] Invalid timestamp: ${timestamp}`);
    return;
  }

  // DEBUG: Log synchronized chart data addition
  console.log(
    `📊 [SpeedChart] Adding synchronized data point - timestamp: ${timestamp.toFixed(
      3
    )}s, frame: ${frameNumber}, speed: ${speed.toFixed(3)} m/s`
  );

  speedHistory.value.push({
    speed: Math.min(speed, 50), // Cap at 50 m/s for sanity
    timestamp: timestamp, // This is now the synchronized timestamp from video player
    frame: frameNumber || 0, // Store frame number
    id: Date.now() + Math.random(), // Unique ID for each point
  });

  // Remove old data points beyond max history size
  if (speedHistory.value.length > maxHistorySize) {
    speedHistory.value.shift();
  }

  // Remove data points older than chart duration using synchronized timestamp
  const cutoffTime = timestamp - chartDuration.value;
  speedHistory.value = speedHistory.value.filter(
    (point) => point.timestamp >= cutoffTime
  );
};

// Watch for new speed data - using synchronized timestamp from video player
watch(
  () => [props.speedMetrics?.speed, props.timestamp, props.currentFrame],
  ([newSpeed, newTimestamp, newFrame]) => {
    // Only add data when we have valid speed metrics and synchronized timestamp
    if (
      newSpeed !== undefined &&
      newTimestamp > 0 &&
      props.speedMetrics?.isValid
    ) {
      // DEBUG: Log synchronized timestamp usage
      console.log(
        `📊 [SpeedChart] Using synchronized timestamp from video player - timestamp: ${newTimestamp.toFixed(
          3
        )}s, frame: ${newFrame}, speed: ${newSpeed.toFixed(3)} m/s`
      );
      addSpeedData(newSpeed, newTimestamp, newFrame);
    }
  },
  { immediate: true }
);

// Filter visible data points based on chart duration
const visibleDataPoints = computed(() => {
  if (!speedHistory.value.length) return [];

  const currentTime = props.timestamp || 0;
  const cutoffTime = currentTime - chartDuration.value;

  return speedHistory.value
    .filter((point) => point.timestamp >= cutoffTime)
    .map((point) => {
      const timeAgo = currentTime - point.timestamp;
      const x =
        chartWidth.value -
        20 -
        (timeAgo / chartDuration.value) * (chartWidth.value - 60);
      const y =
        chartHeight.value -
        30 -
        (point.speed / maxSpeedScale.value) * (chartHeight.value - 50);

      return {
        x: Math.max(40, Math.min(chartWidth.value - 20, x)),
        y: Math.max(20, Math.min(chartHeight.value - 30, y)),
        speed: point.speed,
        timeAgo: timeAgo,
        timestamp: point.timestamp,
        frame: point.frame || 0,
      };
    });
});

// Generate SVG path for speed line
const speedPath = computed(() => {
  const points = visibleDataPoints.value;
  if (points.length < 2) return '';

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }

  return path;
});

// Y-axis ticks
const yAxisTicks = computed(() => {
  const ticks = [];
  const tickCount = 5;

  for (let i = 0; i <= tickCount; i++) {
    const value = (i / tickCount) * maxSpeedScale.value;
    const y =
      chartHeight.value - 30 - (i / tickCount) * (chartHeight.value - 50);
    ticks.push({ value, y });
  }

  return ticks;
});

// X-axis ticks
const xAxisTicks = computed(() => {
  const ticks = [];
  const tickCount = 5;

  for (let i = 0; i <= tickCount; i++) {
    const timeAgo = (i / tickCount) * chartDuration.value;
    const x = chartWidth.value - 20 - (i / tickCount) * (chartWidth.value - 60);
    const label = timeAgo.toFixed(0);
    ticks.push({ x, label });
  }

  return ticks.reverse(); // Reverse so 0 is on the right
});

// Calculate statistics
const averageSpeed = computed(() => {
  if (!visibleDataPoints.value.length) return 0;
  const sum = visibleDataPoints.value.reduce(
    (acc, point) => acc + point.speed,
    0
  );
  return sum / visibleDataPoints.value.length;
});

const maxSpeed = computed(() => {
  if (!visibleDataPoints.value.length) return 0;
  return Math.max(...visibleDataPoints.value.map((point) => point.speed));
});

// Speed color functions - converted to grayscale
const getSpeedColor = (speed) => {
  if (speed < 0.5) return '#374151'; // gray-700 (was bright green)
  if (speed < 1.5) return '#6b7280'; // gray-500 (was bright yellow)
  if (speed < 3.0) return '#9ca3af'; // gray-400 (was bright orange)
  return '#d1d5db'; // gray-300 (was bright red)
};

const getSpeedColorClass = (speed) => {
  if (speed < 0.5) return 'text-gray-700';
  if (speed < 1.5) return 'text-gray-500';
  if (speed < 3.0) return 'text-gray-400';
  return 'text-gray-300';
};

// Chart controls - removed internal toggle functionality

const clearHistory = () => {
  speedHistory.value = [];
};

// Handle window resize
const handleResize = () => {
  if (chartWrapper.value) {
    const rect = chartWrapper.value.getBoundingClientRect();
    chartWidth.value = Math.max(300, Math.min(600, rect.width));
  }
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
  handleResize();
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

// No need to return anything in script setup - all variables are automatically exposed
</script>

<style scoped>
.speed-chart-container {
  position: relative;
  margin-top: 16px;
  pointer-events: auto;
}

.speed-chart-container.compact {
  margin-top: 0;
}

.chart-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.chart-settings {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: rgba(249, 250, 251, 0.5);
  border: 1px solid rgba(229, 231, 235, 0.5);
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.setting-item select {
  min-width: 60px;
  padding: 2px 6px;
}

.chart-settings-compact {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}

.speed-chart {
  background-color: rgba(249, 250, 251, 0.5);
  border: 1px solid rgba(229, 231, 235, 0.5);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  min-width: 350px;
  max-width: 600px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.current-speed {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chart-wrapper {
  background-color: rgba(249, 250, 251, 0.5);
  border: 1px solid rgba(229, 231, 235, 0.5);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 12px;
}

.speed-chart-svg {
  display: block;
  background: transparent;
}

.chart-stats {
  display: flex;
  justify-content: space-around;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

/* Animation for chart visibility */
.chart-visible .speed-chart {
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
