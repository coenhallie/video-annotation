import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';

vi.mock('@/services/videoService', () => ({
  VideoService: {
    isAwsVideo: () => isAws,
    refreshAwsVideoUrl: vi.fn(async () => 'https://example.test/fresh.mp4'),
    storeMediaInfo: (...a: unknown[]) => storeMediaInfo(...a),
  },
}));

let isAws = false;
const storeMediaInfo = vi.fn(async (..._a: unknown[]) => {});

import { useVideoEventHandlers } from '@/composables/useVideoEventHandlers';

function setup(annotationVideoId: string | null, aws = false) {
  isAws = aws;
  const seekTo = vi.fn();
  const currentTime = ref(0);
  const duration = ref(0);
  const initializeVideo = vi.fn(async () => {});
  const loadAnnotations = vi.fn(async () => {});
  const handlers = useVideoEventHandlers({
    videoStore: {
      updateTime: vi.fn(),
      updateDuration: vi.fn(),
      setDimensions: vi.fn(),
      // As the real store does: a new source starts from the top.
      setVideo: vi.fn(() => (currentTime.value = 0)),
    },
    currentTime,
    unifiedVideoPlayerRef: ref({ seekTo }),
    duration,
    currentFrame: ref(0),
    totalFrames: ref(0),
    fps: ref(30),
    isPlaying: ref(false),
    playerMode: ref('single'),
    videoLoaded: ref(false),
    videoUrl: ref('https://example.test/v.mp4'),
    currentVideoId: ref('v1'),
    currentVideoType: ref('url'),
    currentVideoObject: ref({ id: 'v1', url: 'https://example.test/v.mp4' }),
    selectedAnnotation: ref(null),
    annotationVideoId: () => annotationVideoId,
    initializeVideo,
    loadAnnotations,
  } as unknown as Parameters<typeof useVideoEventHandlers>[0]);
  return { handlers, initializeVideo, loadAnnotations, seekTo, currentTime, duration };
}

// The project loader now gives the annotation list its video straight from the
// video record, so annotations load even when the media never does. The
// element's `loaded` event used to be the only thing that did it, and it did it
// twice (initializeVideo loads, then loadAnnotations loaded again).
describe('handleLoaded and the annotation context', () => {
  it('does not load annotations again when the list already belongs to this video', async () => {
    const s = setup('v1');
    await s.handlers.handleLoaded(new Event('loadedmetadata') as never);

    expect(s.initializeVideo).not.toHaveBeenCalled();
    expect(s.loadAnnotations).not.toHaveBeenCalled();
  });

  it('still initialises once when nothing set the context first', async () => {
    const s = setup(null);
    await s.handlers.handleLoaded(new Event('loadedmetadata') as never);

    expect(s.initializeVideo).toHaveBeenCalledTimes(1);
    expect(s.loadAnnotations).not.toHaveBeenCalled();
  });
});

// A URL refresh reloads the player, and a new source starts at 0:00. Two hours
// into a pipeline video, one network hiccup sent the viewer back to the start.
describe('AWS URL refresh keeps the playback position', () => {
  it('seeks back to where the video was once the refreshed source has loaded', async () => {
    const s = setup('v1', true);
    s.currentTime.value = 5400;

    await s.handlers.handleVideoError(new Event('error'));
    expect(s.seekTo).not.toHaveBeenCalled();
    await s.handlers.handleLoaded(new Event('loadedmetadata') as never);

    expect(s.seekTo).toHaveBeenCalledWith(5400);
  });

  it('does not seek on an ordinary load', async () => {
    const s = setup('v1', true);
    await s.handlers.handleLoaded(new Event('loadedmetadata') as never);
    expect(s.seekTo).not.toHaveBeenCalled();
  });
});

describe('measured frame rate', () => {
  // The player is the first thing that knows a pipeline video's real length.
  it('hands the measured duration and frame rate over to be stored', () => {
    storeMediaInfo.mockClear();
    const s = setup('v1', true);
    s.duration.value = 5412.4;

    s.handlers.handleFPSDetected({ fps: 25, totalFrames: 135310 });

    expect(storeMediaInfo).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'v1' }),
      { duration: 5412.4, fps: 25 }
    );
  });
});
