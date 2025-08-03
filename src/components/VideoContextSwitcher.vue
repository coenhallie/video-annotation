<template>
  <div class="video-context-switcher">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-medium text-gray-900">
        Video Context
      </h3>
      <div class="flex items-center space-x-1 bg-gray-100 rounded-md p-1">
        <button
          :class="[
            'px-3 py-1.5 rounded text-xs font-medium transition-colors',
            activeVideo === 'A'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
          ]"
          @click="setActiveVideo('A')"
        >
          Video A
        </button>
        <button
          :class="[
            'px-3 py-1.5 rounded text-xs font-medium transition-colors',
            activeVideo === 'B'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
          ]"
          @click="setActiveVideo('B')"
        >
          Video B
        </button>
      </div>
    </div>

    <!-- Active video indicator -->
    <div class="flex items-center space-x-2 text-xs text-gray-600 mb-3">
      <div
        :class="[
          'w-2 h-2 rounded-full',
          activeVideo === 'A' ? 'bg-blue-600' : 'bg-green-600',
        ]"
      />
      <span>
        Annotating: <strong>Video {{ activeVideo }}</strong>
      </span>
    </div>

    <!-- Video info if available -->
    <div
      v-if="videoInfo"
      class="text-xs text-gray-500 space-y-1"
    >
      <div v-if="videoInfo.title">
        <span class="font-medium">{{ activeVideo }}:</span>
        {{ videoInfo.title }}
      </div>
      <div v-if="videoInfo.duration">
        Duration: {{ formatTime(videoInfo.duration) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  activeVideo: {
    type: String,
    default: 'A',
    validator: (value) => ['A', 'B'].includes(value),
  },
  videoAInfo: {
    type: Object,
    default: null,
  },
  videoBInfo: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['update:activeVideo', 'video-context-changed']);

const videoInfo = computed(() => {
  return props.activeVideo === 'A' ? props.videoAInfo : props.videoBInfo;
});

const setActiveVideo = (video) => {
  if (video !== props.activeVideo) {
    emit('update:activeVideo', video);
    emit('video-context-changed', video);
  }
};

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};
</script>

<style scoped>
.video-context-switcher {
  width: 100%;
}
</style>
