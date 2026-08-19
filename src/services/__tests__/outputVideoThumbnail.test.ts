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
const state: {
  existing: any;
  inserted: any;
  updated: any;
  deleted: any;
  updateError: any;
} = {
  existing: null,
  inserted: null,
  updated: null,
  deleted: null,
  updateError: null,
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
                data: state.updateError ? null : { ...state.existing, ...row },
                error: state.updateError,
              }),
            }),
          }),
        };
      },
      delete: () => ({
        eq: (_col: string, id: string) => {
          state.deleted = id;
          return Promise.resolve({ error: null });
        },
      }),
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
    state.deleted = null;
    state.updateError = null;
    generateSmallThumbnail.mockReset();
    getVideoUrlForProject.mockResolvedValue('https://s3.example.com/presigned.mp4');
  });

  it('includes a generated thumbnail when creating a new record', async () => {
    generateSmallThumbnail.mockResolvedValue('data:image/jpeg;base64,abc');

    await callFindOrCreate();

    expect(generateSmallThumbnail).toHaveBeenCalledWith(
      'https://s3.example.com/presigned.mp4'
    );
    expect(state.updated.thumbnailUrl).toBe('data:image/jpeg;base64,abc');
  });

  it('creates the record without a thumbnail when generation returns null', async () => {
    generateSmallThumbnail.mockResolvedValue(null);

    await callFindOrCreate();

    expect(state.inserted).not.toBeNull();
    expect(state.updated.thumbnailUrl).toBeUndefined();
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

  it('creates the record without a thumbnail when generation never settles', async () => {
    vi.useFakeTimers();
    try {
      generateSmallThumbnail.mockReturnValue(new Promise(() => {}));

      const pending = callFindOrCreate();
      await vi.advanceTimersByTimeAsync(15_000);
      await pending;

      expect(state.inserted).not.toBeNull();
      expect('thumbnailUrl' in state.inserted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('findOrCreateOutputVideo ordering', () => {
  beforeEach(() => {
    state.existing = null;
    state.inserted = null;
    state.updated = null;
    state.deleted = null;
    state.updateError = null;
    generateSmallThumbnail.mockReset();
    getVideoUrlForProject.mockReset();
  });

  it('inserts the row before requesting the presigned URL', async () => {
    // The proxy authorizes on visibility, so the row has to exist first.
    getVideoUrlForProject.mockImplementation(async () => {
      expect(state.inserted).not.toBeNull();
      return 'https://s3.example.com/presigned.mp4';
    });
    generateSmallThumbnail.mockResolvedValue(null);

    await callFindOrCreate();

    expect(state.inserted).not.toBeNull();
    expect(state.inserted.url).toBe('');
    expect(state.updated.url).toBe('https://s3.example.com/presigned.mp4');
  });

  it('deletes a row it just created when the presigned URL fetch fails', async () => {
    getVideoUrlForProject.mockRejectedValue(new Error('403 Not authorized for this video'));

    await expect(callFindOrCreate()).rejects.toThrow('Not authorized');

    expect(state.deleted).toBe('v1');
  });

  it('does not delete a pre-existing row when the fetch fails', async () => {
    state.existing = { id: 'existing-1', thumbnailUrl: 'data:image/jpeg;base64,old' };
    getVideoUrlForProject.mockRejectedValue(new Error('boom'));

    await expect(callFindOrCreate()).rejects.toThrow('boom');

    expect(state.deleted).toBeNull();
  });

  it('deletes a freshly created row and rejects when the final update fails', async () => {
    getVideoUrlForProject.mockResolvedValue('https://s3.example.com/presigned.mp4');
    generateSmallThumbnail.mockResolvedValue(null);
    state.updateError = new Error('update failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(callFindOrCreate()).rejects.toThrow('update failed');

    expect(state.deleted).toBe('v1');
    errorSpy.mockRestore();
  });

  it('does not delete a pre-existing row and returns it when the final update fails', async () => {
    state.existing = { id: 'existing-1', thumbnailUrl: 'data:image/jpeg;base64,old' };
    getVideoUrlForProject.mockResolvedValue('https://s3.example.com/presigned.mp4');
    state.updateError = new Error('update failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await callFindOrCreate();

    expect(state.deleted).toBeNull();
    expect(result).toEqual(state.existing);
    errorSpy.mockRestore();
  });
});
