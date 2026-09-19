import { describe, it, expect, vi, beforeEach } from 'vitest';

let session: { user: { id: string } } | null = { user: { id: 'u1' } };
const rpc = vi.fn(async () => ({ data: true, error: null }));
vi.mock('@/composables/useSupabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) },
  getOptimizedSession: async () => session,
}));
vi.mock('@/utils/thumbnailGenerator', () => ({ ThumbnailGenerator: {} }));
vi.mock('@/services/awsStorageService', () => ({ AwsStorageService: {} }));

beforeEach(() => {
  session = { user: { id: 'u1' } };
  rpc.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const pipelineVideo = (duration: number) => ({ id: 'v1', videoId: 'aws:out-1', duration });

// A pipeline video's row is created before anything has played it, with a
// placeholder duration of 1s at 30fps. Nothing ever replaced it, so the library
// read "0:01" for every pipeline output and watch coverage - measured against
// the stored duration - read 100% after the first second of a two-hour match.
describe('VideoService.storeMediaInfo', () => {
  it('stores what the player measured for a video that still has the placeholder', async () => {
    const { VideoService } = await import('@/services/videoService');
    await VideoService.storeMediaInfo(pipelineVideo(1), { duration: 5412.4, fps: 25 });
    expect(rpc).toHaveBeenCalledWith('set_video_media_info', {
      p_video_id: 'v1',
      p_duration: 5412.4,
      p_fps: 25,
    });
  });

  it('leaves a video alone once it has a real duration', async () => {
    const { VideoService } = await import('@/services/videoService');
    await VideoService.storeMediaInfo(pipelineVideo(5412.4), { duration: 5412.4, fps: 25 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not store numbers a player could not have measured', async () => {
    const { VideoService } = await import('@/services/videoService');
    await VideoService.storeMediaInfo(pipelineVideo(1), { duration: Infinity, fps: 25 });
    await VideoService.storeMediaInfo(pipelineVideo(1), { duration: 600, fps: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('only concerns pipeline videos', async () => {
    const { VideoService } = await import('@/services/videoService');
    await VideoService.storeMediaInfo({ id: 'v2', videoId: 'upload_1', duration: 1 }, { duration: 600, fps: 30 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never rejects: this is housekeeping on a path whose job is playing the video', async () => {
    const { VideoService } = await import('@/services/videoService');
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'function does not exist' } } as never);
    await expect(
      VideoService.storeMediaInfo(pipelineVideo(1), { duration: 600, fps: 25 })
    ).resolves.toBeUndefined();
  });

  // The function refuses anonymous callers, so for a share-link visitor the
  // call was a guaranteed 401 and a console error on every view. Seen on the
  // live site right after the first deploy.
  it('does not try for a signed-out visitor', async () => {
    const { VideoService } = await import('@/services/videoService');
    session = null;
    await VideoService.storeMediaInfo(pipelineVideo(1), { duration: 600, fps: 25 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
