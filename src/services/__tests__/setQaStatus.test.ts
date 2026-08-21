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

describe('VideoService.setQaStatus', () => {
  it('calls the RPC with the video id and status', async () => {
    rpc.mockResolvedValue({
      data: { id: 'v1', qaStatus: 'staging' },
      error: null,
    });
    const VideoService = await loadService();

    await VideoService.setQaStatus('v1', 'staging');

    expect(rpc).toHaveBeenCalledWith('set_video_qa_status', {
      p_video_id: 'v1',
      p_status: 'staging',
    });
  });

  it('resolves with the updated row', async () => {
    rpc.mockResolvedValue({
      data: {
        id: 'v1',
        qaStatus: 'production',
        qaStatusUpdatedAt: '2026-08-21T10:00:00Z',
        qaStatusUpdatedBy: 'u1',
      },
      error: null,
    });
    const VideoService = await loadService();

    const video = await VideoService.setQaStatus('v1', 'production');

    expect(video.qaStatus).toBe('production');
    expect(video.qaStatusUpdatedBy).toBe('u1');
  });

  // The whole reason the RPC raises instead of relying on a policy: a denied
  // write must never look like a successful one.
  it('throws when the function raises', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Video v9 is not visible to the caller', code: '42501' },
    });
    const VideoService = await loadService();

    await expect(VideoService.setQaStatus('v9', 'staging')).rejects.toThrow(
      /not visible to the caller/
    );
  });

  it('throws when the RPC returns no row and no error', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const VideoService = await loadService();

    await expect(VideoService.setQaStatus('v1', 'staging')).rejects.toThrow();
  });
});
