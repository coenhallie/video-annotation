import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
const update = vi.fn();
const getVideoUrlForProject = vi.fn();

let currentRow: Record<string, unknown> | null = null;

// A chainable stub in the shape videoService uses: from().select().eq().maybeSingle()
// for the lookup, and from().update().eq().select().single() for the url write.
const from = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle }) }),
  update: (...args: unknown[]) => {
    update(...args);
    return {
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: currentRow, error: null }),
        }),
      }),
    };
  },
}));

vi.mock('@/composables/useSupabase', () => ({ supabase: { from, rpc: vi.fn() } }));
vi.mock('@/services/awsStorageService', () => ({
  AwsStorageService: { getVideoUrlForProject },
}));
vi.mock('@/utils/thumbnailGenerator', () => ({ ThumbnailGenerator: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  getVideoUrlForProject.mockResolvedValue('https://s3/fresh-url');
});

const loadService = async () =>
  (await import('@/services/videoService')).VideoService;

const row = (ownerId: string) => ({
  id: 'v1',
  ownerId,
  videoId: 'aws:1b30b3cc',
  title: 'Pipeline Output - 1b30b3cc',
  url: 'https://s3/stale-url',
});

describe('findOrCreateOutputVideo, opened by someone who does not own the row', () => {
  // Before pipeline outputs were team-visible this could not happen: the second
  // user could not see the row at all. Now they can, and the url write they
  // would fall into is owner-gated, so it matches zero rows and .single()
  // raises PGRST116 - breaking their open in a new way.
  it('does not write the url', async () => {
    currentRow = row('someone-else');
    maybeSingle.mockResolvedValue({ data: currentRow, error: null });
    const VideoService = await loadService();

    await VideoService.findOrCreateOutputVideo('1b30b3cc', 'me');

    expect(update).not.toHaveBeenCalled();
  });

  it('returns the fresh presigned url on the record anyway', async () => {
    currentRow = row('someone-else');
    maybeSingle.mockResolvedValue({ data: currentRow, error: null });
    const VideoService = await loadService();

    const video = await VideoService.findOrCreateOutputVideo('1b30b3cc', 'me');

    expect(video.url).toBe('https://s3/fresh-url');
    expect(video.id).toBe('v1');
  });
});

describe('findOrCreateOutputVideo, opened by the owner', () => {
  it('still writes the url', async () => {
    currentRow = { ...row('me'), url: 'https://s3/fresh-url' };
    maybeSingle.mockResolvedValue({ data: row('me'), error: null });
    const VideoService = await loadService();

    await VideoService.findOrCreateOutputVideo('1b30b3cc', 'me');

    expect(update).toHaveBeenCalledWith({ url: 'https://s3/fresh-url' });
  });
});
