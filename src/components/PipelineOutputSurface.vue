<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useRenderer2D } from '@/lib/vis/useRenderer2D';
import { FRAME_W, FRAME_H } from '@/lib/vis/constants';
import type { PipelineReplay } from '@/composables/usePipelineReplay';

const props = defineProps<{ replay: PipelineReplay }>();
const emit = defineEmits<{ (e: 'context-menu', ev: MouseEvent): void }>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: ReturnType<typeof useRenderer2D> | null = null;

// Zoom and pan, kept from FootballPitchView: inspecting a cluster of players is
// the common QA gesture and the pitch is small at editor sizes.
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.15;

let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOriginX = 0;
let panOriginY = 0;

const stageRef = ref<HTMLElement | null>(null);

const canvasTransform = computed(
  () => `translate(calc(-50% + ${panX.value}px), calc(-50% + ${panY.value}px)) scale(${zoom.value})`
);

function onWheel(e: WheelEvent) {
  const stage = stageRef.value;
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const mx = e.clientX - rect.left - rect.width / 2;
  const my = e.clientY - rect.top - rect.height / 2;

  const oldZoom = zoom.value;
  const next = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, oldZoom + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP))
  );
  if (next === oldZoom) return;

  const scale = next / oldZoom;
  panX.value = mx - scale * (mx - panX.value);
  panY.value = my - scale * (my - panY.value);
  zoom.value = next;

  if (next <= MIN_ZOOM) {
    panX.value = 0;
    panY.value = 0;
    // panOriginX/Y were captured at pointerdown and are not otherwise updated
    // mid-pan. Without re-capturing them here, the next pointermove computes
    // from the stale origin against the pan we just reset to 0, and the image
    // jumps.
    if (isPanning) {
      panOriginX = 0;
      panOriginY = 0;
      panStartX = e.clientX;
      panStartY = e.clientY;
    }
  }
}

function onPointerDown(e: PointerEvent) {
  if (zoom.value <= MIN_ZOOM) return;
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panOriginX = panX.value;
  panOriginY = panY.value;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!isPanning) return;
  panX.value = panOriginX + (e.clientX - panStartX);
  panY.value = panOriginY + (e.clientY - panStartY);
}

function onPointerUp() {
  isPanning = false;
}

function resetZoom() {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
}

function ensureRenderer() {
  const canvas = canvasRef.value;
  if (!canvas || renderer) return;
  // jsdom has no 2D context, so this is null under test. The component still
  // mounts and its states still render; only drawing is skipped.
  if (!canvas.getContext('2d')) return;
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  renderer = useRenderer2D(canvas);
}

// flush: 'post' is load-bearing. Vue's default pre-flush timing runs the
// callback BEFORE the component's DOM patch, and load() sets `frame` and then
// `state` synchronously, so with the default both callbacks fire while the
// canvas is still behind v-else and canvasRef is null. The renderer would
// never attach and the pitch would stay blank until an unrelated later frame
// arrived.
watch(
  () => props.replay.frame.value,
  (frame) => {
    if (!frame) return;
    ensureRenderer();
    renderer?.renderFrame(frame);
  },
  { flush: 'post' }
);

watch(
  () => props.replay.state.value,
  (state) => {
    if (state !== 'ready') return;
    ensureRenderer();
    const frame = props.replay.frame.value;
    if (frame) renderer?.renderFrame(frame);
  },
  { flush: 'post' }
);

onMounted(() => {
  void props.replay.load();
});

onUnmounted(() => {
  props.replay.dispose();
  renderer = null;
});
</script>

<template>
  <div
    ref="stageRef"
    data-testid="pipeline-stage"
    class="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
    @contextmenu.prevent="emit('context-menu', $event)"
  >
    <div
      v-if="replay.state.value === 'loading' || replay.state.value === 'idle'"
      data-testid="pipeline-loading"
      class="flex flex-col items-center text-center"
    >
      <div
        class="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-gray-300"
      ></div>
      <p class="text-[12px] text-gray-400">Loading pipeline data</p>
    </div>

    <div
      v-else-if="replay.state.value === 'empty'"
      data-testid="pipeline-empty"
      class="flex flex-col items-center text-center"
    >
      <svg
        class="mb-3 h-8 w-8 text-gray-600"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
        />
      </svg>
      <p class="text-[12px] text-gray-400">No pipeline data for this project</p>
      <p class="mt-1 text-[11px] text-gray-600">
        Annotations you add here stay separate from the video's.
      </p>
    </div>

    <div
      v-else-if="replay.state.value === 'error'"
      data-testid="pipeline-error"
      class="flex max-w-sm flex-col items-center text-center"
    >
      <p class="text-[12px] text-gray-300">Could not load pipeline data</p>
      <p class="mt-1 text-[11px] text-gray-500">{{ replay.error.value }}</p>
      <button
        type="button"
        class="mt-3 rounded border border-white/15 px-3 py-1 text-[11px] text-gray-300 hover:bg-white/5"
        @click="replay.load()"
      >
        Try again
      </button>
    </div>

    <template v-else>
      <div
        class="absolute inset-0 overflow-hidden"
        :class="{ 'cursor-grab': zoom > 1 }"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @dblclick="resetZoom"
      >
        <canvas
          ref="canvasRef"
          data-testid="pipeline-canvas"
          :width="FRAME_W"
          :height="FRAME_H"
          class="absolute left-1/2 top-1/2 max-h-full max-w-full object-contain"
          style="aspect-ratio: 1280 / 720"
          :style="{ transform: canvasTransform }"
        />
      </div>

      <div
        class="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2.5 py-1 font-mono text-[11px] text-white"
      >
        F{{ replay.currentFrame.value }}
      </div>

      <div
        v-if="zoom > 1"
        class="pointer-events-none absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white"
      >
        {{ zoom.toFixed(1) }}x
      </div>
    </template>
  </div>
</template>
