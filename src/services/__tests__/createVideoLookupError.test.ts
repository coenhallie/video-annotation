import { describe, it, expect, vi } from 'vitest';

const insert = vi.fn();
const lookupError = { message: 'connection reset', code: '08006' };

vi.mock('@/composables/useSupabase', () => {
  const lookup: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) lookup[m] = () => lookup;
  lookup.maybeSingle = async () => ({ data: null, error: lookupError });
  return {
    supabase: { from: () => ({ ...lookup, insert }) },
    getOptimizedSession: async () => ({ user: { id: 'u1' } }),
  };
});
vi.mock('@/utils/thumbnailGenerator', () => ({ ThumbnailGenerator: {} }));
vi.mock('@/services/awsStorageService', () => ({ AwsStorageService: {} }));

// The existing-row lookup decides between "update that row" and "insert a new
// one". A failed lookup used to be ignored, which reads as "no row" and inserts
// a duplicate of a video that is already in the library.
describe('VideoService.createVideo when the existing-video lookup fails', () => {
  it('throws instead of inserting a second row', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { VideoService } = await import('@/services/videoService');
    await expect(
      VideoService.createVideo({
        title: 't',
        url: 'https://example.com/v.mp4',
        videoType: 'url',
        ownerId: 'u1',
        thumbnailUrl: 'data:image/png;base64,x',
        duration: 10,
        totalFrames: 300,
      } as never)
    ).rejects.toBe(lookupError);
    expect(insert).not.toHaveBeenCalled();
  });
});
