<template>
  <div class="drawing-demo min-h-screen bg-gray-50 p-6">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">
          Drawing Functionality Demo
        </h1>
        <p class="text-gray-600">
          This demo shows how to use the Fabric.js drawing functionality in your
          video annotation app.
        </p>
      </div>

      <!-- Instructions -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h2 class="text-lg font-semibold text-blue-900 mb-2">How to Use:</h2>
        <ol class="list-decimal list-inside space-y-1 text-blue-800">
          <li>Load a video by entering a URL in the input field</li>
          <li>Click "Start Drawing" to enable drawing mode</li>
          <li>Select your tool (Pen or Eraser)</li>
          <li>Adjust stroke width and severity level</li>
          <li>Draw directly on the video by clicking and dragging</li>
          <li>Navigate between frames to see frame-specific drawings</li>
          <li>Use "Clear Frame" or "Clear All" to remove drawings</li>
        </ol>
      </div>

      <!-- Drawing Video Player -->
      <div class="bg-white rounded-lg shadow-lg overflow-hidden">
        <DrawingVideoPlayer
          :video-url="videoUrl"
          :video-id="videoId"
          :show-debug-panel="true"
          @drawing-created="handleDrawingCreated"
          @drawing-updated="handleDrawingUpdated"
          @drawing-deleted="handleDrawingDeleted"
        />
      </div>

      <!-- URL Input -->
      <div class="mt-6 bg-white rounded-lg shadow p-4">
        <h3 class="text-lg font-medium text-gray-900 mb-3">Load Video</h3>
        <div class="flex space-x-3">
          <input
            v-model="urlInput"
            type="url"
            placeholder="Enter video URL (e.g., https://example.com/video.mp4)"
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            @keypress="handleKeyPress"
          />
          <button
            @click="loadVideo"
            :disabled="!urlInput.trim()"
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Load Video
          </button>
        </div>

        <!-- Sample URLs -->
        <div class="mt-3">
          <p class="text-sm text-gray-600 mb-2">Sample videos:</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="sample in sampleVideos"
              :key="sample.url"
              @click="loadSampleVideo(sample.url)"
              class="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              {{ sample.name }}
            </button>
          </div>
        </div>
      </div>

      <!-- Drawing Events Log -->
      <div class="mt-6 bg-white rounded-lg shadow p-4">
        <h3 class="text-lg font-medium text-gray-900 mb-3">
          Drawing Events Log
        </h3>
        <div class="max-h-40 overflow-y-auto space-y-1">
          <div
            v-for="(event, index) in drawingEvents"
            :key="index"
            class="text-sm p-2 bg-gray-50 rounded"
          >
            <span class="font-medium text-blue-600">{{ event.type }}:</span>
            <span class="text-gray-700">{{ event.message }}</span>
            <span class="text-xs text-gray-500 ml-2">{{
              event.timestamp
            }}</span>
          </div>
          <div v-if="drawingEvents.length === 0" class="text-gray-500 text-sm">
            No drawing events yet. Start drawing to see events here.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DrawingVideoPlayer from './DrawingVideoPlayer.vue';
import type { DrawingData } from '@/types/database';

// State
const videoUrl = ref('');
const videoId = ref('demo-video');
const urlInput = ref('');

// Drawing events log
const drawingEvents = ref<
  Array<{
    type: string;
    message: string;
    timestamp: string;
  }>
>([]);

// Sample videos for testing
const sampleVideos = [
  {
    name: 'Big Buck Bunny',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    name: 'Elephant Dream',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  },
  {
    name: 'Sintel',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
];

// Load video from URL input
const loadVideo = () => {
  if (urlInput.value.trim()) {
    videoUrl.value = urlInput.value.trim();
    // Generate a simple video ID from URL
    const urlParts = urlInput.value.split('/');
    videoId.value = urlParts[urlParts.length - 1].split('.')[0] || 'demo-video';

    addEvent('Video Loaded', `Loaded video: ${videoUrl.value}`);
  }
};

// Load sample video
const loadSampleVideo = (url: string) => {
  urlInput.value = url;
  loadVideo();
};

// Handle key press in URL input
const handleKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    loadVideo();
  }
};

// Drawing event handlers
const handleDrawingCreated = (drawing: DrawingData) => {
  addEvent(
    'Drawing Created',
    `New drawing on frame ${drawing.frame} with ${drawing.paths.length} paths`
  );
};

const handleDrawingUpdated = (drawing: DrawingData) => {
  addEvent('Drawing Updated', `Updated drawing on frame ${drawing.frame}`);
};

const handleDrawingDeleted = (drawingId: string) => {
  addEvent('Drawing Deleted', `Deleted drawing: ${drawingId}`);
};

// Add event to log
const addEvent = (type: string, message: string) => {
  drawingEvents.value.unshift({
    type,
    message,
    timestamp: new Date().toLocaleTimeString(),
  });

  // Keep only last 20 events
  if (drawingEvents.value.length > 20) {
    drawingEvents.value = drawingEvents.value.slice(0, 20);
  }
};

// Load a default video on mount
loadSampleVideo(sampleVideos[0].url);
</script>

<style scoped>
/* Custom scrollbar for events log */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
