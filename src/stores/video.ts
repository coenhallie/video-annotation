import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Video } from '@/types/database';

export const useVideoStore = defineStore('video', () => {
  // State
  const url = ref('');
  const id = ref('');
  const duration = ref(0);
  const currentTime = ref(0);
  const isPlaying = ref(false);
  const playbackRate = ref(1);
  const volume = ref(1);
  const isMuted = ref(false);
  const dimensions = ref({ width: 0, height: 0 });
  const fps = ref(0);
  const totalFrames = ref(0);
  const currentFrame = ref(0);

  // Consolidated state (previously in DashboardView)
  const playerMode = ref<'single' | 'dual'>('single');
  const currentVideoId = ref<string | null>(null);
  const currentComparisonId = ref<string | null>(null);
  const currentVideoType = ref<'url' | 'upload' | 'shared'>('url');
  const currentVideoObject = ref<Partial<Video> | null>(null);
  const videoLoaded = ref(false);
  const isAwsVideo = ref(false);

  // Getters
  const progress = computed(() => {
    return duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0;
  });

  // Actions
  function setVideo(videoUrl: string, videoId: string) {
    url.value = videoUrl;
    id.value = videoId;
    // Reset state
    currentTime.value = 0;
    isPlaying.value = false;
  }

  function updateTime(time: number) {
    currentTime.value = time;
    // Update frame counter if we have valid FPS
    if (fps.value > 0) {
      currentFrame.value = Math.round(time * fps.value);
    }
  }

  function updateDuration(newDuration: number) {
    duration.value = newDuration;
  }

  function setDimensions(width: number, height: number) {
    dimensions.value = { width, height };
  }

  function setFrameData(frame: number, total: number, detectedFps: number) {
    currentFrame.value = frame;
    totalFrames.value = total;
    fps.value = detectedFps;
  }

  function togglePlay() {
    isPlaying.value = !isPlaying.value;
  }

  function setPlaying(playing: boolean) {
    isPlaying.value = playing;
  }

  function setPlayerMode(mode: 'single' | 'dual') {
    playerMode.value = mode;
  }

  function setCurrentVideo(video: Partial<Video> | null, type?: 'url' | 'upload' | 'shared') {
    currentVideoObject.value = video;
    if (type) {
      currentVideoType.value = type;
    }
    if (video) {
      url.value = video.url || '';
      id.value = video.id || '';
    }
  }

  function resetForProjectSwitch() {
    url.value = '';
    id.value = 'sample-video-1';
    currentTime.value = 0;
    duration.value = 0;
    isPlaying.value = false;
    currentFrame.value = 0;
    totalFrames.value = 0;
    fps.value = 0;
    currentVideoId.value = null;
    currentComparisonId.value = null;
    currentVideoObject.value = null;
    videoLoaded.value = false;
    isAwsVideo.value = false;
  }

  return {
    url,
    id,
    duration,
    currentTime,
    isPlaying,
    playbackRate,
    volume,
    isMuted,
    dimensions,
    fps,
    totalFrames,
    currentFrame,
    playerMode,
    currentVideoId,
    currentComparisonId,
    currentVideoType,
    currentVideoObject,
    videoLoaded,
    isAwsVideo,
    progress,
    setVideo,
    updateTime,
    updateDuration,
    setDimensions,
    setFrameData,
    togglePlay,
    setPlaying,
    setPlayerMode,
    setCurrentVideo,
    resetForProjectSwitch,
  };
});
