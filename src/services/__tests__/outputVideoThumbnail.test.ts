import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateSmallThumbnail = vi.fn();
vi.mock('@/utils/thumbnailGenerator', () => ({
  ThumbnailGenerator: { generateSmallThumbnail },
}));

const getVideoUrlForProject = vi.fn(async () => 'https://s3.example.com/presigned.mp4');
vi.mock('@/services/awsStorageService', () => ({
  AwsStorageService: {
    getVideoUrlForProject,
    buildFilepath: (id: string) => `pipeline-output/${id}/streams/generated.mp4`,
  },
}));

// Captures what findOrCreateOutputVideo reads and writes through supabase.
const state: { existing: any; inserted: any; updated: any } = {
  existing: null,
  inserted: null,
  updated: null,
};

vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.existing, error: null }),
        }),
      }),
      insert: (row: any) => {
        state.inserted = row;
        return {
          select: () => ({
            single: async () => ({ data: { id: 'v1', ...row }, error: null }),
          }),
        };
      },
      update: (row: any) => {
        state.updated = row;
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: { ...state.existing, ...row },
                error: null,
              }),
            }),
          }),
        };
      },
    }),
  },
}));

async function callFindOrCreate() {
  const { VideoService } = await import('@/services/videoService');
  return VideoService.findOrCreateOutputVideo('proj-123', 'user-1');
}

describe('findOrCreateOutputVideo thumbnails', () => {
  beforeEach(() => {
    state.existing = null;
    state.inserted = null;
    state.updated = null;
    generateSmallThumbnail.mockReset();
  });

  it('includes a generated thumbnail when creating a new record', async () => {
    generateSmallThumbnail.mockResolvedValue('data:image/jpeg;base64,abc');

    await callFindOrCreate();

    expect(generateSmallThumbnail).toHaveBeenCalledWith(
      'https://s3.example.com/presigned.mp4'
    );
    expect(state.inserted.thumbnailUrl).toBe('data:image/jpeg;base64,abc');
  });

  it('creates the record without a thumbnail when generation returns null', async () => {
    generateSmallThumbnail.mockResolvedValue(null);

    await callFindOrCreate();

    expect(state.inserted).not.toBeNull();
    expect('thumbnailUrl' in state.inserted).toBe(false);
  });

  it('creates the record without a thumbnail when generation throws', async () => {
    generateSmallThumbnail.mockRejectedValue(new Error('canvas tainted'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await callFindOrCreate();

    expect(state.inserted).not.toBeNull();
    expect('thumbnailUrl' in state.inserted).toBe(false);
    warn.mockRestore();
  });

  it('backfills the thumbnail on an existing record that has none', async () => {
    state.existing = { id: 'v1', videoId: 'aws:proj-123', thumbnailUrl: null };
    generateSmallThumbnail.mockResolvedValue('data:image/jpeg;base64,backfilled');

    await callFindOrCreate();

    expect(state.inserted).toBeNull();
    expect(state.updated.url).toBe('https://s3.example.com/presigned.mp4');
    expect(state.updated.thumbnailUrl).toBe('data:image/jpeg;base64,backfilled');
  });

  it('does not regenerate when the existing record already has a thumbnail', async () => {
    state.existing = {
      id: 'v1',
      videoId: 'aws:proj-123',
      thumbnailUrl: 'data:image/jpeg;base64,existing',
    };

    await callFindOrCreate();

    expect(generateSmallThumbnail).not.toHaveBeenCalled();
    expect(state.updated).toEqual({ url: 'https://s3.example.com/presigned.mp4' });
  });
});
