import { describe, it, expect, vi, beforeEach } from 'vitest';

const handleServiceError = vi.fn();
vi.mock('@/utils/errorHandler', () => ({ handleServiceError }));
vi.mock('@/services/awsStorageService', () => ({ AwsStorageService: {} }));
vi.mock('@/utils/thumbnailGenerator', () => ({ ThumbnailGenerator: {} }));

let row: Record<string, unknown> | null = null;
let deletedRows: Array<{ id: string }> = [];
let storageError: { message: string } | null = null;
// What remove() reports as removed. RLS filtering a file out is not an error:
// it comes back as an empty list.
let storageRemoved: Array<{ name: string }> | null = null;
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const removed: string[][] = [];
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

vi.mock('@/composables/useSupabase', () => ({
  getOptimizedSession: async () => ({ user: { id: 'me' } }),
  supabase: {
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return rpcResult;
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: row, error: null }) }),
      }),
      delete: () => ({
        eq: () => ({ select: async () => ({ data: deletedRows, error: null }) }),
      }),
    }),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          if (storageError) return { data: null, error: storageError };
          return { data: storageRemoved ?? paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  },
}));

const load = async () => (await import('@/services/videoService')).VideoService;

beforeEach(() => {
  vi.clearAllMocks();
  row = { videoType: 'upload', filePath: 'owner/1_clip.mp4' };
  deletedRows = [{ id: 'v1' }];
  storageError = null;
  storageRemoved = null;
  rpcResult = { data: null, error: null };
  removed.length = 0;
  rpcCalls.length = 0;
});

describe('VideoService.deleteVideo', () => {
  it('removes the uploaded file after the row', async () => {
    const VideoService = await load();
    await VideoService.deleteVideo('v1');
    expect(removed).toEqual([['owner/1_clip.mp4']]);
  });

  // The row is already gone, so the delete has succeeded as far as the user is
  // concerned; a file left behind is reported, not thrown.
  it('reports a file it could not remove without failing the delete', async () => {
    storageError = { message: 'denied' };
    const VideoService = await load();
    await expect(VideoService.deleteVideo('v1')).resolves.toBeUndefined();
    expect(handleServiceError).toHaveBeenCalledWith(
      expect.stringContaining('deleteVideo'),
      storageError
    );
  });

  it('reports a file that storage silently declined to remove', async () => {
    storageRemoved = [];
    const VideoService = await load();
    await expect(VideoService.deleteVideo('v1')).resolves.toBeUndefined();
    expect(handleServiceError).toHaveBeenCalledWith(
      expect.stringContaining('deleteVideo'),
      expect.anything()
    );
  });

  it('reports nothing when the file was removed', async () => {
    const VideoService = await load();
    await VideoService.deleteVideo('v1');
    expect(handleServiceError).not.toHaveBeenCalled();
  });

  it('throws when no row was deleted', async () => {
    deletedRows = [];
    const VideoService = await load();
    await expect(VideoService.deleteVideo('v1')).rejects.toThrow();
    expect(removed).toHaveLength(0);
  });
});

describe('VideoService.getDeleteImpact', () => {
  it('reads the counts from video_delete_impact', async () => {
    rpcResult = { data: { annotations: 12, comments: 3, comparisons: 2 }, error: null };
    const VideoService = await load();
    await expect(VideoService.getDeleteImpact('v1')).resolves.toEqual({
      annotations: 12,
      comments: 3,
      comparisons: 2,
    });
    expect(rpcCalls).toEqual([{ fn: 'video_delete_impact', args: { p_video_id: 'v1' } }]);
  });

  it('throws on an RPC error', async () => {
    rpcResult = { data: null, error: { message: 'not visible' } };
    const VideoService = await load();
    await expect(VideoService.getDeleteImpact('v1')).rejects.toThrow('not visible');
  });
});
