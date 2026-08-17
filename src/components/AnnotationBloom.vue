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
   * 'full' fans the tiles all the way around the cursor. 'up' fans them through
   * the upper half only, for callers anchored to something that must stay
   * visible below the cursor - the timeline.
   */
  arc: { type: String as PropType<'full' | 'up'>, default: 'full' },
});

const emit = defineEmits<{
  (e: 'select', label: Label): void;
  (e: 'close'): void;
}>();

// ── Geometry ────────────────────────────────────────────────────────────────
// Tiles are laid out along an arc around the pivot (the cursor). The arc's
// radius is derived from the tile count rather than fixed, so tiles never
// overlap however many there are.

const TILE = 74; // tile edge
const TILE_RADIUS = 18; // corner rounding
// Generous, because on an arc a tile's caption sits alongside its lower
// neighbour, not just below its own tile.
const TILE_GAP = 30;
const CAPTION_GAP = 12; // tile bottom to caption baseline
const CAPTION_H = 14;
const PAD = 6; // slack so strokes and shadows are not clipped
const EDGE_MARGIN = 8;

// The upward fan stops short of horizontal on purpose: a tile centred at
// exactly +/-90 degrees would straddle the pivot line, so half of it - and all
// of its caption - would fall below whatever the bloom is anchored to.
const ARCS = {
  full: { startDeg: 0, sweepDeg: 360, minRadius: 118 },
  up: { startDeg: -65, sweepDeg: 130, minRadius: 150 },
} as const;

const activeCategory = ref<LabelCategoryGroup | null>(null);
const hoveredKey = ref<string | null>(null);

const categories = computed(() => groupLabelsByCategory(props.labels));

const arcSpec = computed(() => ARCS[props.arc] ?? ARCS.full);
const isHalf = computed(() => props.arc === 'up');

interface Tile {
  key: string;
  glyph: string;
  caption: string;
  title: string;
  color: string;
  glyphColor: string;
  cx: number;
  cy: number;
  rotation: number;
  onPick: () => void;
}

/** The items currently on screen: categories at stage 1, that category's labels at stage 2. */
const items = computed(() =>
  activeCategory.value ? activeCategory.value.labels : categories.value
);

/**
 * Radius that keeps neighbouring tiles at least TILE_GAP apart. The chord
 * between two adjacent tile centres is 2r*sin(step/2), so solve that for r.
 */
const arcRadius = computed(() => {
  const { sweepDeg, minRadius } = arcSpec.value;
  const count = Math.max(items.value.length, 1);
  // A full circle wraps, so every tile has two neighbours; a partial arc has
  // one fewer gap than it has tiles.
  const gaps = sweepDeg >= 360 ? count : Math.max(count - 1, 1);
  const stepRad = ((sweepDeg / gaps) * Math.PI) / 180;
  const needed = (TILE + TILE_GAP) / (2 * Math.sin(stepRad / 2));
  return Math.max(minRadius, needed);
});

/** Half-extent of the drawn content, measured from the pivot. */
const reach = computed(
  () => arcRadius.value + TILE / 2 + CAPTION_GAP + CAPTION_H + PAD
);

const BOX_W = computed(() => reach.value * 2);
const BOX_H = computed(() => (isHalf.value ? reach.value + PAD : reach.value * 2));
const PIVOT_X = computed(() => BOX_W.value / 2);
const PIVOT_Y = computed(() =>
  isHalf.value ? BOX_H.value - PAD : BOX_H.value / 2
);

/** Angle 0 is straight up; angles increase clockwise. */
const polar = (radius: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: PIVOT_X.value + radius * Math.cos(rad),
    y: PIVOT_Y.value + radius * Math.sin(rad),
  };
};

// ── Colour ──────────────────────────────────────────────────────────────────
// An idle tile is opaque dark; the hovered one is filled with its own colour.
// Both are opaque, so the glyph's contrast never depends on the video behind.

const TILE_IDLE_FILL = '#16191d';
const TILE_IDLE_STROKE = 'rgba(255, 255, 255, 0.10)';
const TILE_IDLE_GLYPH = '#e5e7eb';
const TEXT_ON_LIGHT = '#0f172a';
const TEXT_ON_DARK = '#ffffff';

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
const relativeLuminance = (hex: string): number => {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = parseHexRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrastRatio = (l1: number, l2: number): number =>
  (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

const TEXT_ON_LIGHT_LUMINANCE = relativeLuminance(TEXT_ON_LIGHT);
const TEXT_ON_DARK_LUMINANCE = relativeLuminance(TEXT_ON_DARK);

/** Whichever text tone has more contrast against a filled tile of this colour. */
const glyphColorOn = (hex: string): string => {
  const background = relativeLuminance(hex);
  return contrastRatio(background, TEXT_ON_LIGHT_LUMINANCE) >=
    contrastRatio(background, TEXT_ON_DARK_LUMINANCE)
    ? TEXT_ON_LIGHT
    : TEXT_ON_DARK;
};

// ── Tiles ───────────────────────────────────────────────────────────────────

// Tiles lean with the arc, but only a fraction of the way, so the glyphs stay
// close to upright and readable.
const TILT_DAMPING = 0.1;

const buildTiles = <T,>(
  list: T[],
  describe: (item: T) => {
    key: string;
    glyph: string;
    caption: string;
    title: string;
    color: string;
  },
  pick: (item: T) => void
): Tile[] => {
  const { startDeg, sweepDeg } = arcSpec.value;
  const count = list.length;
  const gaps = sweepDeg >= 360 ? count : Math.max(count - 1, 1);
  const step = sweepDeg / gaps;
  // On a partial arc the first and last tiles sit on its ends; on a full circle
  // they are evenly spaced with no seam, so nudge by half a step.
  const offset = sweepDeg >= 360 ? step / 2 : 0;
  return list.map((item, index) => {
    const angle = count === 1 ? startDeg + sweepDeg / 2 : startDeg + offset + index * step;
    const centre = polar(arcRadius.value, angle);
    const described = describe(item);
    return {
      ...described,
      glyphColor: glyphColorOn(described.color),
      cx: centre.x,
      cy: centre.y,
      rotation: angle * TILT_DAMPING,
      onPick: () => pick(item),
    };
  });
};

const tiles = computed<Tile[]>(() => {
  const category = activeCategory.value;
  if (category) {
    return buildTiles(
      category.labels,
      (label) => {
        const short = labelShortName(label);
        return {
          key: label.id,
          // Stage 2 has no single-letter identity to lean on, so the tile
          // carries the label's own words and the caption is dropped.
          glyph: '',
          caption: short,
          title: label.description ? `${label.name}: ${label.description}` : label.name,
          color: label.color,
        };
      },
      (label) => emit('select', label)
    );
  }
  return buildTiles(
    categories.value,
    (group) => ({
      key: group.key,
      glyph: group.letter,
      caption: group.key,
      title: `${group.name} - ${group.labels.length} label${group.labels.length === 1 ? '' : 's'}`,
      color: group.labels[0]?.color ?? '#6b7280',
    }),
    (group) => {
      activeCategory.value = group;
      hoveredKey.value = null;
    }
  );
});

/** Stage 2 puts the label's words inside the tile, wrapped to fit. */
const tileWords = (tile: Tile): string[] => (tile.glyph ? [] : tile.caption.split(' '));

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
  return { left: `${px - PIVOT_X.value}px`, top: `${py - PIVOT_Y.value}px` };
});

// The Esc/Back pill sits at the pivot, in the empty middle of the fan. On a
// half bloom the pivot is the caller's anchor edge, so lift the pill clear of it.
const HUB_W = 60;
const HUB_H = 26;
const hubY = computed(() =>
  isHalf.value ? PIVOT_Y.value - HUB_H - 4 : PIVOT_Y.value - HUB_H / 2
);
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

// Repositioning without a close/reopen should also reset to stage 1, kept
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
    <div class="absolute" :style="position">
      <svg
        :width="BOX_W"
        :height="BOX_H"
        :viewBox="`0 0 ${BOX_W} ${BOX_H}`"
      >
        <g
          v-for="tile in tiles"
          :key="tile.key"
          class="cursor-pointer"
          @mouseenter="hoveredKey = tile.key"
          @mouseleave="hoveredKey = null"
          @click.stop="tile.onPick()"
        >
          <title>{{ tile.title }}</title>

          <g :transform="`rotate(${tile.rotation} ${tile.cx} ${tile.cy})`">
            <rect
              :x="tile.cx - TILE / 2"
              :y="tile.cy - TILE / 2"
              :width="TILE"
              :height="TILE"
              :rx="TILE_RADIUS"
              :ry="TILE_RADIUS"
              :fill="hoveredKey === tile.key ? tile.color : TILE_IDLE_FILL"
              :stroke="hoveredKey === tile.key ? tile.color : TILE_IDLE_STROKE"
              stroke-width="1.5"
            />

            <!-- Colour pip, so the item stays identifiable while unselected. -->
            <circle
              :cx="tile.cx + TILE / 2 - 15"
              :cy="tile.cy - TILE / 2 + 15"
              r="4"
              :fill="hoveredKey === tile.key ? tile.glyphColor : tile.color"
            />

            <text
              v-if="tile.glyph"
              :x="tile.cx"
              :y="tile.cy + 2"
              text-anchor="middle"
              dominant-baseline="middle"
              :fill="hoveredKey === tile.key ? tile.glyphColor : TILE_IDLE_GLYPH"
              class="pointer-events-none select-none text-[30px] font-light"
            >
              {{ tile.glyph }}
            </text>

            <!-- Stage 2: the label's own words, inside the tile. -->
            <text
              v-else
              :x="tile.cx"
              :y="tile.cy"
              text-anchor="middle"
              dominant-baseline="middle"
              :fill="hoveredKey === tile.key ? tile.glyphColor : TILE_IDLE_GLYPH"
              class="pointer-events-none select-none text-[10px] font-semibold uppercase tracking-wide"
            >
              <tspan
                v-for="(word, index) in tileWords(tile)"
                :key="index"
                :x="tile.cx"
                :dy="index === 0 ? -((tileWords(tile).length - 1) * 5.5) : 11"
              >
                {{ word }}
              </tspan>
            </text>
          </g>

          <!-- Caption stays upright, outside the tile. -->
          <text
            v-if="tile.glyph"
            :x="tile.cx"
            :y="tile.cy + TILE / 2 + CAPTION_GAP + 4"
            text-anchor="middle"
            :fill="hoveredKey === tile.key ? '#e5e7eb' : '#71717a'"
            class="pointer-events-none select-none text-[10px] font-medium uppercase tracking-[0.18em]"
          >
            {{ tile.caption }}
          </text>
        </g>

        <g class="cursor-pointer" @click.stop="handleHub()">
          <rect
            :x="PIVOT_X - HUB_W / 2"
            :y="hubY"
            :width="HUB_W"
            :height="HUB_H"
            :rx="HUB_H / 2"
            :ry="HUB_H / 2"
            fill="rgba(15, 23, 42, 0.92)"
            stroke="rgba(148, 163, 184, 0.35)"
            stroke-width="1.5"
          />
          <text
            :x="PIVOT_X"
            :y="hubY + HUB_H / 2 + 1"
            text-anchor="middle"
            dominant-baseline="middle"
            class="pointer-events-none select-none fill-slate-400 text-[10px] font-medium uppercase tracking-[0.14em]"
          >
            {{ hubText }}
          </text>
        </g>
      </svg>
    </div>
  </div>
</template>
