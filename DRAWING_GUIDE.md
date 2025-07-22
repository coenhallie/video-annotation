# Drawing Functionality Guide

## Overview

Your video annotation app includes a comprehensive drawing system built with Fabric.js that allows users to draw annotations directly on video frames. This guide explains how to use and integrate the drawing functionality.

## Components Overview

### 1. DrawingCanvas.vue

The core drawing surface that overlays on top of your video player.

**Features:**

- Fabric.js-powered canvas for smooth drawing
- Frame-based drawing storage
- Pen and eraser tools
- Severity-based color coding
- Coordinate normalization for different screen sizes

### 2. DrawingTools.vue

The control panel for managing drawing tools and settings.

**Features:**

- Toggle drawing mode on/off
- Tool selection (pen/eraser)
- Stroke width adjustment (1-20px)
- Severity level selection (low/medium/high)
- Frame navigation
- Drawing statistics
- Clear functions

### 3. DrawingVideoPlayer.vue

Complete integration that combines video player with drawing canvas.

**Features:**

- Video player with drawing overlay
- Frame synchronization
- Drawing event handling
- Export/import functionality
- Debug panel for testing

### 4. useDrawingCanvas.ts

Composable for state management and drawing operations.

**Features:**

- Drawing state management
- Frame-based storage
- Coordinate utilities
- Data serialization
- Annotation conversion

## How to Use the Drawing Functionality

### Option 1: Use the Demo Component

1. **Access the Demo:**

   ```vue
   <template>
     <DrawingDemo />
   </template>

   <script setup>
   import DrawingDemo from '@/components/DrawingDemo.vue';
   </script>
   ```

2. **Load a Video:**

   - Enter a video URL in the input field
   - Click "Load Video" or press Enter
   - Use sample videos for quick testing

3. **Start Drawing:**

   - Click "Start Drawing" to enable drawing mode
   - The canvas will become interactive

4. **Select Tools:**

   - **Pen:** Draw new annotations
   - **Eraser:** Remove existing drawings
   - Adjust stroke width with the slider
   - Choose severity level (affects color):
     - Low: Green (#34d399)
     - Medium: Amber (#fbbf24)
     - High: Red (#ef4444)

5. **Draw on Video:**

   - Click and drag on the video to draw
   - Drawings are automatically saved to the current frame
   - Navigate between frames to see frame-specific drawings

6. **Manage Drawings:**
   - **Clear Frame:** Remove all drawings from current frame
   - **Clear All:** Remove all drawings from all frames
   - **Jump to Frame:** Click frame numbers to navigate to frames with drawings

### Option 2: Integrate into Main App

#### Method A: Replace Video Player Section

Replace the current video player section in `App.vue`:

```vue
<template>
  <!-- Replace the VideoPlayer section with DrawingVideoPlayer -->
  <section class="flex-1 flex flex-col bg-black">
    <div class="flex-1 flex items-center justify-center p-6">
      <DrawingVideoPlayer
        :video-url="videoUrl"
        :video-id="videoId"
        :show-debug-panel="false"
        @drawing-created="handleDrawingCreated"
        @drawing-updated="handleDrawingUpdated"
        @drawing-deleted="handleDrawingDeleted"
      />
    </div>
    <!-- Keep your existing Timeline component -->
  </section>
</template>

<script setup>
import DrawingVideoPlayer from './components/DrawingVideoPlayer.vue';

// Add drawing event handlers
const handleDrawingCreated = (drawing) => {
  console.log('Drawing created:', drawing);
  // Convert to annotation and save
  // addAnnotation(convertDrawingToAnnotation(drawing));
};

const handleDrawingUpdated = (drawing) => {
  console.log('Drawing updated:', drawing);
};

const handleDrawingDeleted = (drawingId) => {
  console.log('Drawing deleted:', drawingId);
};
</script>
```

#### Method B: Add Drawing Canvas Overlay

Add drawing canvas as an overlay to your existing video player:

```vue
<template>
  <div class="relative">
    <!-- Your existing VideoPlayer -->
    <VideoPlayer
      ref="videoPlayerRef"
      :video-url="videoUrl"
      :video-id="videoId"
      <!-- ... other props -->
    />

    <!-- Add Drawing Canvas Overlay -->
    <DrawingCanvas
      v-if="videoLoaded"
      :video-width="videoWidth"
      :video-height="videoHeight"
      :current-frame="currentFrame"
      :is-drawing-mode="drawingCanvas.isDrawingMode.value"
      :selected-tool="drawingCanvas.currentTool.value.type"
      :stroke-width="drawingCanvas.currentTool.value.strokeWidth"
      :severity="drawingCanvas.currentTool.value.severity"
      :existing-drawings="drawingCanvas.currentFrameDrawings.value"
      @drawing-created="handleDrawingCreated"
    />
  </div>

  <!-- Add Drawing Tools Panel -->
  <DrawingTools
    :drawing-canvas="drawingCanvas"
    :current-frame="currentFrame"
    @jump-to-frame="handleJumpToFrame"
  />
</template>

<script setup>
import { useDrawingCanvas } from '@/composables/useDrawingCanvas';
import DrawingCanvas from '@/components/DrawingCanvas.vue';
import DrawingTools from '@/components/DrawingTools.vue';

// Initialize drawing canvas
const drawingCanvas = useDrawingCanvas();
</script>
```

## Integration with Annotations

The drawing system is designed to work with your existing annotation system:

```typescript
// Convert drawing to annotation
const convertDrawingToAnnotation = (drawing: DrawingData) => {
  return {
    content: 'Drawing annotation',
    title: 'Drawing',
    severity: drawingCanvas.currentTool.value.severity,
    color:
      drawingCanvas.severityColors[drawingCanvas.currentTool.value.severity],
    timestamp: (drawing.frame / fps) * 1000,
    frame: drawing.frame,
    annotationType: 'drawing',
    drawingData: drawing,
    user_id: user.value.id,
  };
};

// Save drawing as annotation
const handleDrawingCreated = (drawing: DrawingData) => {
  const annotation = convertDrawingToAnnotation(drawing);
  addAnnotation(annotation);
};
```

## Key Features

### Frame-Based Storage

- Drawings are stored per video frame
- Navigate between frames to see different drawings
- Frame numbers are displayed in the tools panel

### Severity Levels

- **Low (Green):** Minor issues or notes
- **Medium (Amber):** Moderate concerns
- **High (Red):** Critical issues

### Coordinate Normalization

- Drawings scale properly across different screen sizes
- Coordinates are normalized to 0-1 range
- Maintains aspect ratio when resizing

### Export/Import

- Export drawings as JSON for backup
- Import previously saved drawings
- Useful for sharing or migrating data

## Troubleshooting

### Common Issues

1. **Canvas not appearing:**

   - Ensure video is loaded before showing canvas
   - Check that video dimensions are properly set

2. **Drawings not saving:**

   - Verify drawing events are being emitted
   - Check that frame number is correctly set

3. **Performance issues:**
   - Limit the number of drawings per frame
   - Consider clearing old drawings periodically

### Debug Mode

Enable debug mode to see detailed information:

```vue
<DrawingVideoPlayer
  :show-debug-panel="true"
  <!-- other props -->
/>
```

The debug panel shows:

- Current drawing mode status
- Active tool and settings
- Number of drawings per frame
- Total drawings count
- Export/import buttons

## Next Steps

1. **Try the Demo:** Use the `DrawingDemo.vue` component to test the functionality
2. **Choose Integration Method:** Decide between replacing the video player or adding overlay
3. **Customize Colors:** Modify severity colors in `useDrawingCanvas.ts`
4. **Add Persistence:** Integrate with your annotation storage system
5. **Enhance UI:** Customize the drawing tools panel to match your design

## API Reference

### DrawingCanvas Props

- `videoWidth: number` - Video width in pixels
- `videoHeight: number` - Video height in pixels
- `currentFrame: number` - Current video frame
- `isDrawingMode: boolean` - Whether drawing is enabled
- `selectedTool: 'pen' | 'eraser'` - Active drawing tool
- `strokeWidth: number` - Stroke width (1-20)
- `severity: SeverityLevel` - Severity level for color
- `existingDrawings: DrawingData[]` - Existing drawings for frame

### DrawingCanvas Events

- `drawing-created` - Emitted when new drawing is created
- `drawing-updated` - Emitted when drawing is modified
- `drawing-deleted` - Emitted when drawing is removed

### useDrawingCanvas Methods

- `toggleDrawingMode()` - Toggle drawing on/off
- `setTool(tool)` - Set active tool
- `setStrokeWidth(width)` - Set stroke width
- `setSeverity(level)` - Set severity level
- `addDrawing(drawing)` - Add drawing to current frame
- `clearCurrentFrameDrawings()` - Clear current frame
- `clearAllDrawings()` - Clear all drawings
