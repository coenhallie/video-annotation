<template>
  <div class="drawing-tools space-y-3">
    <!-- Drawing Mode Toggle -->
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-gray-900">Drawing</h3>
      <button
        @click="toggleDrawingMode"
        :class="[
          'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
          isDrawingMode
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        ]"
      >
        {{ isDrawingMode ? 'Exit' : 'Start' }}
      </button>
    </div>

    <!-- Tool Selection -->
    <div v-if="isDrawingMode" class="space-y-3">
      <!-- Stroke Width -->
      <div class="space-y-1">
        <label class="text-xs text-gray-600">
          Width: {{ currentTool.strokeWidth }}px
        </label>
        <input
          type="range"
          min="1"
          max="20"
          :value="currentTool.strokeWidth"
          @input="
            setStrokeWidth(parseInt(($event.target as HTMLInputElement).value))
          "
          class="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>

      <!-- Severity Level -->
      <div class="space-y-1">
        <label class="text-xs text-gray-600">Severity</label>
        <div class="grid grid-cols-3 gap-1">
          <button
            @click="setSeverity('low')"
            :class="[
              'flex items-center justify-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors border',
              currentTool.severity === 'low'
                ? 'bg-green-50 text-green-700 border-green-300'
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100',
            ]"
          >
            <div
              class="w-2 h-2 rounded-full"
              :style="{ backgroundColor: severityColors.low }"
            ></div>
            <span>Low</span>
          </button>
          <button
            @click="setSeverity('medium')"
            :class="[
              'flex items-center justify-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors border',
              currentTool.severity === 'medium'
                ? 'bg-amber-50 text-amber-700 border-amber-300'
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100',
            ]"
          >
            <div
              class="w-2 h-2 rounded-full"
              :style="{ backgroundColor: severityColors.medium }"
            ></div>
            <span>Med</span>
          </button>
          <button
            @click="setSeverity('high')"
            :class="[
              'flex items-center justify-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors border',
              currentTool.severity === 'high'
                ? 'bg-red-50 text-red-700 border-red-300'
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100',
            ]"
          >
            <div
              class="w-2 h-2 rounded-full"
              :style="{ backgroundColor: severityColors.high }"
            ></div>
            <span>High</span>
          </button>
        </div>
      </div>

      <!-- Drawing Actions -->
      <div class="flex space-x-1">
        <button
          @click="clearCurrentFrameDrawings"
          :disabled="!hasDrawingsOnCurrentFrame"
          class="flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            class="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="3,6 5,6 21,6" />
            <path
              d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"
            />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
          <span>Clear Frame</span>
        </button>
        <button
          @click="clearAllDrawings"
          :disabled="totalDrawingsCount === 0"
          class="flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            class="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="3,6 5,6 21,6" />
            <path
              d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"
            />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
          <span>Clear All</span>
        </button>
      </div>

      <!-- Frames with Drawings (Compact) -->
      <div v-if="framesWithDrawings.length > 0" class="space-y-1">
        <label class="text-xs text-gray-600">
          Frames ({{ framesWithDrawings.length }})
        </label>
        <div class="flex flex-wrap gap-1 max-h-12 overflow-y-auto">
          <button
            v-for="frame in framesWithDrawings"
            :key="frame"
            @click="$emit('jump-to-frame', frame)"
            :class="[
              'px-1.5 py-0.5 rounded text-xs font-medium transition-colors',
              frame === currentFrame
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
          >
            {{ frame }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { UseDrawingCanvas } from '@/composables/useDrawingCanvas';

// Icons are now inline SVG elements to avoid runtime template compilation

interface Props {
  drawingCanvas: UseDrawingCanvas;
  currentFrame: number;
  // Dual video mode props
  isDualMode?: boolean;
  activeVideoContext?: string;
  drawingCanvasA?: UseDrawingCanvas;
  drawingCanvasB?: UseDrawingCanvas;
}

interface Emits {
  (e: 'jump-to-frame', frame: number): void;
  (e: 'video-context-changed', context: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Get the active drawing canvas based on mode and context
const activeDrawingCanvas = computed(() => {
  if (props.isDualMode) {
    return props.activeVideoContext === 'A'
      ? props.drawingCanvasA
      : props.drawingCanvasB;
  }
  return props.drawingCanvas;
});

// Destructure drawing canvas composable from active canvas
const {
  isDrawingMode,
  currentTool,
  severityColors,
  toggleDrawingMode,
  setTool,
  setStrokeWidth,
  setSeverity,
  clearCurrentFrameDrawings,
  clearAllDrawings,
  getTotalDrawingsCount,
  getFramesWithDrawings,
  hasDrawingsOnFrame,
  currentFrameDrawings,
} = activeDrawingCanvas.value || props.drawingCanvas;

// Computed properties
const totalDrawingsCount = computed(() => getTotalDrawingsCount.value);
const framesWithDrawings = computed(() => getFramesWithDrawings.value);
const hasDrawingsOnCurrentFrame = computed(() =>
  hasDrawingsOnFrame(props.currentFrame)
);
</script>

<style scoped>
/* Custom slider styles */
.slider::-webkit-slider-thumb {
  appearance: none;
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.slider::-moz-range-thumb {
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.drawing-tools {
  width: 100%;
}

/* Scrollbar styles for frames list */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
