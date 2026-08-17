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
  /**
   * 'full' is a whole ring around the cursor. 'up' is a semicircle opening
   * upward from it, for callers anchored to something that must stay visible
   * below the cursor - the timeline.
   */
  arc: { type: String as PropType<'full' | 'up'>, default: 'full' },
});

const emit = defineEmits<{
  (e: 'select', label: Label): void;
  (e: 'close'): void;
}>();

// Ring geometry, in pixels. The half bloom gets more radial room because it has
// half the angular room: its wedges are half as wide, so they need to be deeper
// for the same label to stay legible.
const GEOMETRY = {
  full: { inner: 46, outer: 132, startDeg: 0, sweepDeg: 360 },
  up: { inner: 52, outer: 168, startDeg: -90, sweepDeg: 180 },
} as const;

const PAD = 4; // slack so strokes are not clipped by the viewBox
const EDGE_MARGIN = 8;

const geo = computed(() => GEOMETRY[props.arc] ?? GEOMETRY.full);
const INNER_RADIUS = computed(() => geo.value.inner);
const OUTER_RADIUS = computed(() => geo.value.outer);
const LABEL_RADIUS = computed(() => (geo.value.inner + geo.value.outer) / 2);

// The drawing box, and where the cursor (the pivot the bloom is anchored to)
// sits inside it. A half bloom reserves no space below the pivot, so it never
// covers what the caller anchored it to.
const isHalf = computed(() => props.arc === 'up');
const BOX_W = computed(() => geo.value.outer * 2 + PAD * 2);
const BOX_H = computed(() =>
  isHalf.value ? geo.value.outer + PAD * 2 : geo.value.outer * 2 + PAD * 2
);
const PIVOT_X = computed(() => BOX_W.value / 2);
const PIVOT_Y = computed(() =>
  isHalf.value ? BOX_H.value - PAD : BOX_H.value / 2
);

const activeCategory = ref<LabelCategoryGroup | null>(null);
const hoveredKey = ref<string | null>(null);

const categories = computed(() => groupLabelsByCategory(props.labels));

interface Segment {
  key: string;
  text: string;
  title: string;
  color: string;
  textColor: string;
  path: string;
  labelX: number;
  labelY: number;
  onPick: () => void;
}

// Dark backing (see the circle drawn behind the wedges below) and light text
// tones share the same near-black/near-white pair used elsewhere in the
// bloom (the hub fill is rgba(15, 23, 42, ...), i.e. the same slate-900).
const TEXT_ON_LIGHT = '#0f172a';
const TEXT_ON_DARK = '#ffffff';

// Same colour as the opaque backing circle in the template. Wedge fills are
// translucent, so what actually paints the screen is the wedge colour
// blended over this, not the wedge colour alone.
const BACKING_FILL = '#0f172a';

// The steadier (unhovered) wedge fill-opacity - see the `path` binding below.
// It is the more translucent of the two states, i.e. the one where the
// backing shows through the most, so it is the harder case for contrast.
const WEDGE_IDLE_OPACITY = 0.75;

const parseHexRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

/** Relative luminance of an sRGB colour (WCAG formula, sRGB -> linear). */
const relativeLuminanceRgb = (r: number, g: number, b: number): number => {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const relativeLuminance = (hex: string): number =>
  relativeLuminanceRgb(...parseHexRgb(hex));

/**
 * Alpha-blend `hex` over the opaque backing circle at the wedge's idle
 * fill-opacity, in sRGB space (matching how the browser actually composites
 * `fill-opacity`). This is the colour that is really on screen behind the
 * label text.
 */
const compositeOverBacking = (hex: string): [number, number, number] => {
  const [fr, fg, fb] = parseHexRgb(hex);
  const [br, bg, bb] = parseHexRgb(BACKING_FILL);
  const blend = (f: number, b: number) => WEDGE_IDLE_OPACITY * f + (1 - WEDGE_IDLE_OPACITY) * b;
  return [blend(fr, br), blend(fg, bg), blend(fb, bb)];
};

/** WCAG contrast ratio between two relative luminances. */
const contrastRatio = (l1: number, l2: number): number => {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

const TEXT_ON_LIGHT_LUMINANCE = relativeLuminance(TEXT_ON_LIGHT);
const TEXT_ON_DARK_LUMINANCE = relativeLuminance(TEXT_ON_DARK);

/**
 * Pick whichever of the two text tones has higher contrast against the
 * wedge's actual, composited on-screen colour (not its raw hex).
 */
const textColorFor = (hex: string): string => {
  const backgroundLuminance = relativeLuminanceRgb(...compositeOverBacking(hex));
  const darkContrast = contrastRatio(backgroundLuminance, TEXT_ON_LIGHT_LUMINANCE);
  const lightContrast = contrastRatio(backgroundLuminance, TEXT_ON_DARK_LUMINANCE);
  return darkContrast >= lightContrast ? TEXT_ON_LIGHT : TEXT_ON_DARK;
};

/** Angle 0 is straight up; angles increase clockwise. */
const polar = (radius: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: PIVOT_X.value + radius * Math.cos(rad),
    y: PIVOT_Y.value + radius * Math.sin(rad),
  };
};

/** Annulus wedge from startDeg to endDeg. */
const wedgePath = (startDeg: number, endDeg: number): string => {
  const outer = OUTER_RADIUS.value;
  const inner = INNER_RADIUS.value;
  const outerStart = polar(outer, startDeg);
  const outerEnd = polar(outer, endDeg);
  const innerEnd = polar(inner, endDeg);
  const innerStart = polar(inner, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
};

/** Half-disc opening upward from the pivot, used for the half bloom's backing and hub. */
const halfDiscPath = (radius: number): string => {
  const cx = PIVOT_X.value;
  const cy = PIVOT_Y.value;
  return `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy} Z`;
};

const buildSegments = <T,>(
  items: T[],
  describe: (item: T) => { key: string; text: string; title: string; color: string },
  pick: (item: T) => void
): Segment[] => {
  const { startDeg, sweepDeg } = geo.value;
  const step = sweepDeg / items.length;
  // A single item filling a whole circle would be a degenerate 360 degree arc,
  // so leave a small gap. A half bloom never reaches 360 and needs no such gap.
  const sweep = sweepDeg >= 360 && items.length === 1 ? 359.9 : step;
  return items.map((item, index) => {
    const start = startDeg + index * step;
    const mid = start + sweep / 2;
    const centroid = polar(LABEL_RADIUS.value, mid);
    const described = describe(item);
    return {
      ...described,
      textColor: textColorFor(described.color),
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
      hoveredKey.value = null;
    }
  );
});

/**
 * Keep the whole ring on screen. The bloom is anchored at the cursor but slides
 * inward near a viewport edge rather than being clipped.
 */
const position = computed(() => {
  // Clamp the pivot so the whole box stays on screen, then place the box by
  // subtracting where the pivot sits inside it.
  const clamp = (value: number, pivot: number, box: number, viewport: number) => {
    const min = pivot + EDGE_MARGIN;
    const max = viewport - EDGE_MARGIN - box + pivot;
    return Math.min(Math.max(value, min), Math.max(min, max));
  };
  const px = clamp(props.x, PIVOT_X.value, BOX_W.value, window.innerWidth);
  const py = clamp(props.y, PIVOT_Y.value, BOX_H.value, window.innerHeight);
  return {
    left: `${px - PIVOT_X.value}px`,
    top: `${py - PIVOT_Y.value}px`,
  };
});

const hubText = computed(() => (activeCategory.value ? 'Back' : 'Esc'));

const handleHub = () => {
  if (activeCategory.value) {
    activeCategory.value = null;
    hoveredKey.value = null;
  } else emit('close');
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  if (activeCategory.value) {
    activeCategory.value = null;
    hoveredKey.value = null;
  } else emit('close');
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

// Reposition without a close/reopen (e.g. the caller moves the bloom to a new
// cursor location while it is still open) should also reset to stage 1,
// independent of the Escape-listener lifecycle above, which stays tied to `open`.
watch(
  () => [props.x, props.y],
  () => {
    if (props.open) {
      activeCategory.value = null;
      hoveredKey.value = null;
    }
  }
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
      class="absolute"
      :style="position"
    >
      <svg
        :width="BOX_W"
        :height="BOX_H"
        :viewBox="`0 0 ${BOX_W} ${BOX_H}`"
        class="drop-shadow-2xl"
      >
        <!--
          Opaque backing so the wedges' translucent fills always composite
          over a known dark base instead of whatever video frame is behind
          the bloom - otherwise contrast would shift frame to frame.
        -->
        <path
          v-if="isHalf"
          :d="halfDiscPath(OUTER_RADIUS)"
          fill="#0f172a"
        />
        <circle
          v-else
          :cx="PIVOT_X"
          :cy="PIVOT_Y"
          :r="OUTER_RADIUS"
          fill="#0f172a"
        />

        <g
          v-for="segment in segments"
          :key="segment.key"
          class="cursor-pointer"
          @mouseenter="hoveredKey = segment.key"
          @mouseleave="hoveredKey = null"
          @click.stop="segment.onPick()"
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
            :fill="segment.textColor"
            class="pointer-events-none select-none text-[10px] font-semibold uppercase tracking-wide"
          >
            <tspan
              v-for="(word, index) in segment.text.split(' ')"
              :key="index"
              :x="segment.labelX"
              :dy="index === 0 ? -((segment.text.split(' ').length - 1) * 5.5) : 11"
            >
              {{ word }}
            </tspan>
          </text>
        </g>

        <path
          v-if="isHalf"
          :d="halfDiscPath(INNER_RADIUS)"
          fill="rgba(15, 23, 42, 0.92)"
          stroke="rgba(148, 163, 184, 0.5)"
          stroke-width="2"
          class="cursor-pointer"
          @click.stop="handleHub()"
        />
        <circle
          v-else
          :cx="PIVOT_X"
          :cy="PIVOT_Y"
          :r="INNER_RADIUS"
          fill="rgba(15, 23, 42, 0.92)"
          stroke="rgba(148, 163, 184, 0.5)"
          stroke-width="2"
          class="cursor-pointer"
          @click.stop="handleHub()"
        />
        <text
          :x="PIVOT_X"
          :y="isHalf ? PIVOT_Y - INNER_RADIUS * 0.45 : PIVOT_Y"
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
