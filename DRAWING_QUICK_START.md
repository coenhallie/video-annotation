# Drawing Functionality - Quick Start Guide

## 🎨 What's New

Your video annotation app now includes powerful drawing functionality using Fabric.js! You can draw directly on video frames with different tools, colors, and severity levels.

## 🚀 How to Try It

### Option 1: Demo Mode (Easiest)

1. **Start your app:** `npm run dev`
2. **Sign in** to your account
3. **Click the drawing/pen icon** in the header (next to the share button)
4. **You're now in Drawing Demo mode!**
   - Load a sample video or enter your own URL
   - Click "Start Drawing" to begin
   - Try different tools and settings

### Option 2: Direct Component Usage

Import and use the drawing components directly:

```vue
<template>
  <DrawingVideoPlayer
    :video-url="your - video - url"
    :video-id="your - video - id"
    :show-debug-panel="true"
  />
</template>

<script setup>
import DrawingVideoPlayer from '@/components/DrawingVideoPlayer.vue';
</script>
```

## 🛠️ Key Features

### Drawing Tools

- **Pen Tool:** Draw annotations on video frames
- **Eraser Tool:** Remove existing drawings
- **Stroke Width:** Adjustable from 1-20 pixels
- **Severity Levels:**
  - 🟢 Low (Green) - Minor notes
  - 🟡 Medium (Amber) - Moderate issues
  - 🔴 High (Red) - Critical problems

### Frame-Based Storage

- Drawings are tied to specific video frames
- Navigate between frames to see different drawings
- Frame numbers show which frames have drawings

### Management Features

- **Clear Frame:** Remove all drawings from current frame
- **Clear All:** Remove all drawings from video
- **Statistics:** See drawing counts per frame and total
- **Export/Import:** Save and load drawing data as JSON

## 📁 File Structure

```
src/
├── components/
│   ├── DrawingCanvas.vue      # Core Fabric.js canvas
│   ├── DrawingTools.vue       # Tool selection panel
│   ├── DrawingVideoPlayer.vue # Complete integration
│   └── DrawingDemo.vue        # Demo component
├── composables/
│   └── useDrawingCanvas.ts    # State management
└── types/
    └── database.ts            # Drawing data types
```

## 🔧 Integration Options

### Replace Video Player

Replace your current video player with the drawing-enabled version:

```vue
<!-- Instead of VideoPlayer, use: -->
<DrawingVideoPlayer
  :video-url="videoUrl"
  :video-id="videoId"
  @drawing-created="handleDrawingCreated"
/>
```

### Add as Overlay

Add drawing canvas as an overlay to existing video player:

```vue
<div class="relative">
  <VideoPlayer />
  <DrawingCanvas
    :video-width="videoWidth"
    :video-height="videoHeight"
    :current-frame="currentFrame"
    :is-drawing-mode="isDrawingMode"
  />
</div>
```

## 🎯 Next Steps

1. **Try the demo** - Click the pen icon in your app header
2. **Read the full guide** - See `DRAWING_GUIDE.md` for complete documentation
3. **Integrate with annotations** - Connect drawings to your existing annotation system
4. **Customize colors** - Modify severity colors in `useDrawingCanvas.ts`
5. **Add persistence** - Save drawings to your database

## 🐛 Troubleshooting

**Canvas not showing?**

- Make sure video is loaded first
- Check video dimensions are set correctly

**Drawings not saving?**

- Verify drawing events are being emitted
- Check frame number is correctly set

**Performance issues?**

- Limit drawings per frame
- Clear old drawings periodically

## 📚 Documentation

- **Full Guide:** `DRAWING_GUIDE.md` - Complete documentation
- **API Reference:** See guide for component props and events
- **Demo Component:** `src/components/DrawingDemo.vue` - Example usage

---

**Happy Drawing! 🎨**
