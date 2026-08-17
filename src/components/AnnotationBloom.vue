<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, type PropType } from 'vue';
import {
  groupLabelsByCategory,
  labelShortName,
  type LabelCategoryGroup,
} from '../utils/labelCategories';
import type { Label } from '../types/labels';

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  labels: { type: Array as PropType<Label[]>, default: () => [] },
});

const emit = defineEmits<{
  (e: 'select', label: Label): void;
  (e: 'close'): void;
}>();

// Ring geometry, in pixels.
const INNER_RADIUS = 46;
const OUTER_RADIUS = 132;
const SIZE = OUTER_RADIUS * 2 + 8; // a little slack so strokes are not clipped
const CENTER = SIZE / 2;
const LABEL_RADIUS = (INNER_RADIUS + OUTER_RADIUS) / 2;
const EDGE_MARGIN = 8;

const activeCategory = ref<LabelCategoryGroup | null>(null);
const hoveredKey = ref<string | null>(null);

const categories = computed(() => groupLabelsByCategory(props.labels));

interface Segment {
  key: string;
  text: string;
  title: string;
  color: string;
  path: string;
  labelX: number;
  labelY: number;
  onPick: () => void;
}

const polar = (radius: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
};

/** Annulus wedge from startDeg to endDeg. */
const wedgePath = (startDeg: number, endDeg: number): string => {
  const outerStart = polar(OUTER_RADIUS, startDeg);
  const outerEnd = polar(OUTER_RADIUS, endDeg);
  const innerEnd = polar(INNER_RADIUS, endDeg);
  const innerStart = polar(INNER_RADIUS, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
};

const buildSegments = <T,>(
  items: T[],
  describe: (item: T) => { key: string; text: string; title: string; color: string },
  pick: (item: T) => void
): Segment[] => {
  const step = 360 / items.length;
  // A single item would produce a degenerate 360 degree arc, so leave a small gap.
  const sweep = items.length === 1 ? 359.9 : step;
  return items.map((item, index) => {
    const start = index * step;
    const mid = start + sweep / 2;
    const centroid = polar(LABEL_RADIUS, mid);
    const described = describe(item);
    return {
      ...described,
      path: wedgePath(start, start + sweep),
      labelX: centroid.x,
      labelY: centroid.y,
      onPick: () => pick(item),
    };
  });
};

const segments = computed<Segment[]>(() => {
  const category = activeCategory.value;
  if (category) {
    return buildSegments(
      category.labels,
      (label) => ({
        key: label.id,
        text: labelShortName(label),
        title: label.description ? `${label.name}: ${label.description}` : label.name,
        color: label.color,
      }),
      (label) => emit('select', label)
    );
  }
  return buildSegments(
    categories.value,
    (group) => ({
      key: group.key,
      text: group.name,
      title: `${group.name} (${group.labels.length})`,
      color: group.labels[0]?.color ?? '#6b7280',
    }),
    (group) => {
      activeCategory.value = group;
    }
  );
});

/**
 * Keep the whole ring on screen. The bloom is anchored at the cursor but slides
 * inward near a viewport edge rather than being clipped.
 */
const position = computed(() => {
  const halfSize = SIZE / 2;
  const maxX = window.innerWidth - halfSize - EDGE_MARGIN;
  const maxY = window.innerHeight - halfSize - EDGE_MARGIN;
  const minX = halfSize + EDGE_MARGIN;
  const minY = halfSize + EDGE_MARGIN;
  return {
    left: `${Math.min(Math.max(props.x, minX), Math.max(minX, maxX))}px`,
    top: `${Math.min(Math.max(props.y, minY), Math.max(minY, maxY))}px`,
  };
});

const hubText = computed(() => (activeCategory.value ? 'Back' : 'Esc'));

const handleHub = () => {
  if (activeCategory.value) activeCategory.value = null;
  else emit('close');
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  if (activeCategory.value) activeCategory.value = null;
  else emit('close');
};

watch(
  () => props.open,
  (open) => {
    if (open) {
      activeCategory.value = null;
      hoveredKey.value = null;
      // Capture phase so the video player's global Escape handling does not win.
      window.addEventListener('keydown', handleKeydown, true);
    } else {
      window.removeEventListener('keydown', handleKeydown, true);
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true);
});
</script>

<template>
  <div
    v-if="open && categories.length > 0"
    class="fixed inset-0 z-50"
    @click="emit('close')"
    @contextmenu.prevent="emit('close')"
  >
    <div
      class="absolute -translate-x-1/2 -translate-y-1/2"
      :style="position"
      @click.stop
    >
      <svg
        :width="SIZE"
        :height="SIZE"
        :viewBox="`0 0 ${SIZE} ${SIZE}`"
        class="drop-shadow-2xl"
      >
        <g
          v-for="segment in segments"
          :key="segment.key"
          class="cursor-pointer"
          @mouseenter="hoveredKey = segment.key"
          @mouseleave="hoveredKey = null"
          @click="segment.onPick()"
        >
          <title>{{ segment.title }}</title>
          <path
            :d="segment.path"
            :fill="segment.color"
            :fill-opacity="hoveredKey === segment.key ? 0.95 : 0.75"
            stroke="rgba(15, 23, 42, 0.85)"
            stroke-width="2"
          />
          <text
            :x="segment.labelX"
            :y="segment.labelY"
            text-anchor="middle"
            dominant-baseline="middle"
            class="pointer-events-none select-none fill-white text-[10px] font-semibold uppercase tracking-wide"
          >
            <tspan
              v-for="(word, index) in segment.text.split(' ')"
              :key="index"
              :x="segment.labelX"
              :dy="index === 0 ? -((segment.text.split(' ').length - 1) * 5) : 11"
            >
              {{ word }}
            </tspan>
          </text>
        </g>

        <circle
          :cx="CENTER"
          :cy="CENTER"
          :r="INNER_RADIUS - 4"
          fill="rgba(15, 23, 42, 0.92)"
          stroke="rgba(148, 163, 184, 0.5)"
          stroke-width="2"
          class="cursor-pointer"
          @click="handleHub()"
        />
        <text
          :x="CENTER"
          :y="CENTER"
          text-anchor="middle"
          dominant-baseline="middle"
          class="pointer-events-none select-none fill-slate-300 text-[11px] font-semibold uppercase tracking-wide"
        >
          {{ hubText }}
        </text>
      </svg>
    </div>
  </div>
</template>
