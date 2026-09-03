import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: vi.fn(), rpc },
}));
vi.mock('@/services/awsStorageService', () => ({ AwsStorageService: {} }));
vi.mock('@/utils/thumbnailGenerator', () => ({ ThumbnailGenerator: {} }));

beforeEach(() => {
  vi.clearAllMocks();
});

const loadService = async () =>
  (await import('@/services/videoService')).VideoService;

describe('VideoService.renameVideo', () => {
  it('calls the RPC with the video id and the new title', async () => {
    rpc.mockResolvedValue({ data: { id: 'v1', title: 'Serve trial 3' }, error: null });
    const VideoService = await loadService();

    await VideoService.renameVideo('v1', 'Serve trial 3');

    expect(rpc).toHaveBeenCalledWith('rename_video', {
      p_video_id: 'v1',
      p_title: 'Serve trial 3',
    });
  });

  it('resolves with the row the function returned, not the title it was given', async () => {
    // The function trims. Trusting the input instead of the response would show
    // a name the database did not store.
    rpc.mockResolvedValue({ data: { id: 'v1', title: 'Serve trial 3' }, error: null });
    const VideoService = await loadService();

    const video = await VideoService.renameVideo('v1', '  Serve trial 3  ');

    expect(video.title).toBe('Serve trial 3');
  });

  // The whole reason the rename goes through an RPC: a denied write must never
  // look like a successful one.
  it('throws when the function raises', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Video v9 is not visible to the caller', code: '42501' },
    });
    const VideoService = await loadService();

    await expect(VideoService.renameVideo('v9', 'Nope')).rejects.toThrow(
      'Video v9 is not visible to the caller'
    );
  });

  it('throws when the function returns no row', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const VideoService = await loadService();

    await expect(VideoService.renameVideo('v1', 'Nope')).rejects.toThrow();
  });
});
