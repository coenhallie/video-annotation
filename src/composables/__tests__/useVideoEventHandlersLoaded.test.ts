import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';

vi.mock('@/services/videoService', () => ({
  VideoService: { isAwsVideo: () => false, refreshAwsVideoUrl: vi.fn() },
}));

import { useVideoEventHandlers } from '@/composables/useVideoEventHandlers';

function setup(annotationVideoId: string | null) {
  const initializeVideo = vi.fn(async () => {});
  const loadAnnotations = vi.fn(async () => {});
  const handlers = useVideoEventHandlers({
    videoStore: { updateTime: vi.fn(), updateDuration: vi.fn(), setDimensions: vi.fn(), setVideo: vi.fn() },
    duration: ref(0),
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
  return { handlers, initializeVideo, loadAnnotations };
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
