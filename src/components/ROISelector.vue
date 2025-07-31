<template>
  <div
    class="roi-selector absolute inset-0 pointer-events-auto"
    :style="{ zIndex: 15 }"
    @mousedown="startSelection"
    @mousemove="updateSelection"
    @mouseup="endSelection"
    @mouseleave="endSelection"
  >
    <!-- ROI Bounding Box -->
    <div
      v-if="roiBox && showROI"
      class="roi-box absolute border-2 border-blue-400"
      :style="{
        left: roiBox.x * 100 + '%',
        top: roiBox.y * 100 + '%',
        width: roiBox.width * 100 + '%',
        height: roiBox.height * 100 + '%',
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderWidth: '2px',
      }"
      @mousedown="startDrag"
    >
      <!-- ROI Label -->
      <div
        class="roi-label absolute -top-6 left-0 bg-blue-500 text-white px-2 py-1 text-xs rounded"
      >
        ROI: {{ Math.round(roiBox.width * canvasWidth) }}×{{
          Math.round(roiBox.height * canvasHeight)
        }}
      </div>

      <!-- Resize handles -->
      <div
        class="resize-handle absolute w-2 h-2 bg-blue-500 -top-1 -left-1 cursor-nw-resize"
        @mousedown.stop="startResize('nw')"
      ></div>
      <div
        class="resize-handle absolute w-2 h-2 bg-blue-500 -top-1 -right-1 cursor-ne-resize"
        @mousedown.stop="startResize('ne')"
      ></div>
      <div
        class="resize-handle absolute w-2 h-2 bg-blue-500 -bottom-1 -left-1 cursor-sw-resize"
        @mousedown.stop="startResize('sw')"
      ></div>
      <div
        class="resize-handle absolute w-2 h-2 bg-blue-500 -bottom-1 -right-1 cursor-se-resize"
        @mousedown.stop="startResize('se')"
      ></div>

      <!-- Delete button -->
      <button
        class="delete-roi absolute -top-6 -right-6 bg-red-500 text-white w-6 h-6 rounded-full text-xs hover:bg-red-600"
        @click.stop="clearROI"
        title="Delete ROI"
      >
        ×
      </button>
    </div>

    <!-- Selection preview while drawing -->
    <div
      v-if="isSelecting && selectionBox"
      class="selection-preview absolute border-2 border-dashed border-blue-300"
      :style="{
        left: selectionBox.x * 100 + '%',
        top: selectionBox.y * 100 + '%',
        width: selectionBox.width * 100 + '%',
        height: selectionBox.height * 100 + '%',
        backgroundColor: 'transparent',
        borderStyle: 'dashed',
        borderWidth: '2px',
      }"
    ></div>

    <!-- Instructions overlay -->
    <div
      v-if="!roiBox && showInstructions"
      class="instructions absolute top-4 left-4 bg-black bg-opacity-70 text-white px-3 py-2 rounded text-sm max-w-xs"
    >
      <div class="font-semibold mb-1">ROI Selection</div>
      <div class="text-xs">
        Click and drag to select a region of interest for pose detection. This
        will focus pose detection on the selected area only.
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, toRefs } from 'vue';

export default {
  name: 'ROISelector',
  props: {
    // Canvas dimensions
    canvasWidth: {
      type: Number,
      default: 1920,
    },
    canvasHeight: {
      type: Number,
      default: 1080,
    },

    // ROI state
    roiBox: {
      type: Object,
      default: null,
    },

    // Visibility controls
    showROI: {
      type: Boolean,
      default: true,
    },

    showInstructions: {
      type: Boolean,
      default: true,
    },

    // Enable/disable selection
    enabled: {
      type: Boolean,
      default: true,
    },
  },

  emits: ['roi-selected', 'roi-updated', 'roi-cleared'],

  setup(props, { emit }) {
    const { canvasWidth, canvasHeight, enabled } = toRefs(props);

    // Selection state
    const isSelecting = ref(false);
    const isResizing = ref(false);
    const isDragging = ref(false);
    const resizeMode = ref('');
    const selectionBox = ref(null);
    const startPoint = ref({ x: 0, y: 0 });
    const dragOffset = ref({ x: 0, y: 0 });

    // Convert mouse coordinates to normalized coordinates
    const getRelativeCoordinates = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      };
    };

    // Start ROI selection
    const startSelection = (event) => {
      if (!enabled.value || isResizing.value || isDragging.value) return;
      if (props.roiBox) return; // Don't start new selection if ROI exists

      const coords = getRelativeCoordinates(event);
      startPoint.value = coords;
      isSelecting.value = true;
      selectionBox.value = {
        x: coords.x,
        y: coords.y,
        width: 0,
        height: 0,
      };
    };

    // Start dragging ROI
    const startDrag = (event) => {
      if (!enabled.value || isResizing.value || isSelecting.value) return;
      event.stopPropagation();

      const coords = getRelativeCoordinates(event);
      isDragging.value = true;
      dragOffset.value = {
        x: coords.x - props.roiBox.x,
        y: coords.y - props.roiBox.y,
      };
    };

    // Update selection while dragging
    const updateSelection = (event) => {
      if (!enabled.value) return;

      const coords = getRelativeCoordinates(event);

      if (isSelecting.value) {
        // Creating new selection
        const start = startPoint.value;
        selectionBox.value = {
          x: Math.min(start.x, coords.x),
          y: Math.min(start.y, coords.y),
          width: Math.abs(coords.x - start.x),
          height: Math.abs(coords.y - start.y),
        };
      } else if (isDragging.value && props.roiBox) {
        // Dragging existing ROI
        const newX = Math.max(
          0,
          Math.min(coords.x - dragOffset.value.x, 1 - props.roiBox.width)
        );
        const newY = Math.max(
          0,
          Math.min(coords.y - dragOffset.value.y, 1 - props.roiBox.height)
        );

        const updatedROI = {
          ...props.roiBox,
          x: newX,
          y: newY,
        };

        emit('roi-updated', updatedROI);
      } else if (isResizing.value && props.roiBox) {
        // Resizing ROI
        handleResize(coords);
      }
    };

    // Handle ROI resizing
    const handleResize = (coords) => {
      if (!props.roiBox) return;

      const roi = { ...props.roiBox };
      const mode = resizeMode.value;

      switch (mode) {
        case 'nw':
          roi.width = Math.max(0.05, roi.width + (roi.x - coords.x));
          roi.height = Math.max(0.05, roi.height + (roi.y - coords.y));
          roi.x = Math.max(0, coords.x);
          roi.y = Math.max(0, coords.y);
          break;
        case 'ne':
          roi.width = Math.max(0.05, coords.x - roi.x);
          roi.height = Math.max(0.05, roi.height + (roi.y - coords.y));
          roi.y = Math.max(0, coords.y);
          break;
        case 'sw':
          roi.width = Math.max(0.05, roi.width + (roi.x - coords.x));
          roi.height = Math.max(0.05, coords.y - roi.y);
          roi.x = Math.max(0, coords.x);
          break;
        case 'se':
          roi.width = Math.max(0.05, coords.x - roi.x);
          roi.height = Math.max(0.05, coords.y - roi.y);
          break;
      }

      // Ensure ROI stays within bounds
      roi.x = Math.max(0, Math.min(roi.x, 1 - roi.width));
      roi.y = Math.max(0, Math.min(roi.y, 1 - roi.height));
      roi.width = Math.min(roi.width, 1 - roi.x);
      roi.height = Math.min(roi.height, 1 - roi.y);

      emit('roi-updated', roi);
    };

    // End selection/dragging/resizing
    const endSelection = () => {
      if (isSelecting.value && selectionBox.value) {
        // Only create ROI if selection is large enough
        if (
          selectionBox.value.width > 0.05 &&
          selectionBox.value.height > 0.05
        ) {
          emit('roi-selected', { ...selectionBox.value });
        }
        isSelecting.value = false;
        selectionBox.value = null;
      }

      if (isDragging.value) {
        isDragging.value = false;
      }

      if (isResizing.value) {
        isResizing.value = false;
        resizeMode.value = '';
      }
    };

    // Start resizing ROI
    const startResize = (mode) => {
      isResizing.value = true;
      resizeMode.value = mode;
    };

    // Clear ROI
    const clearROI = () => {
      emit('roi-cleared');
    };

    return {
      // State
      isSelecting,
      isResizing,
      isDragging,
      selectionBox,

      // Methods
      startSelection,
      startDrag,
      updateSelection,
      endSelection,
      startResize,
      clearROI,
    };
  },
};
</script>

<style scoped>
.roi-selector {
  cursor: crosshair;
}

.roi-box {
  cursor: move;
}

.resize-handle {
  z-index: 20;
}

.delete-roi {
  z-index: 20;
}

.selection-preview {
  pointer-events: none;
}

.instructions {
  z-index: 20;
}
</style>
