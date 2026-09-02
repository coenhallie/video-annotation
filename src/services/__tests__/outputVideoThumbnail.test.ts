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

// Captures what the AWS video paths read and write through supabase.
const state: {
  existing: any;
  rowsById: Record<string, any>;
  inserted: any;
  insertError: any;
  existingOnRetry: any;
  updates: Array<{ id: string; row: any }>;
  deleted: any;
  updateError: any;
  deleteError: any;
  callerId: string | null;
  rpcCalls: Array<{ fn: string; args: any }>;
  rpcError: any;
} = {
  existing: null,
  rowsById: {},
  inserted: null,
  insertError: null,
  existingOnRetry: null,
  updates: [],
  deleted: null,
  updateError: null,
  deleteError: null,
  callerId: 'user-1',
  rpcCalls: [],
  rpcError: null,
};

vi.mock('@/composables/useSupabase', () => ({
  getOptimizedSession: async () =>
    state.callerId ? { user: { id: state.callerId } } : null,
  supabase: {
    rpc: async (fn: string, args: any) => {
      state.rpcCalls.push({ fn, args });
      return { data: !state.rpcError, error: state.rpcError };
    },
    from: () => ({
      select: () => ({
        eq: (col: string, value: string) => ({
          // Two different lookups reach this: by videoId for the aws: ingest
          // record, and by id for the row the thumbnail gate reads.
          maybeSingle: async () => ({
            data: col === 'id' ? (state.rowsById[value] ?? null) : state.existing,
            error: null,
          }),
        }),
      }),
      insert: (row: any) => {
        state.inserted = row;
        return {
          select: () => ({
            single: async () => {
              if (!state.insertError) {
                return { data: { id: 'v1', ...row }, error: null };
              }
              // The winner's row only becomes visible once our insert has lost
              // the race, which is exactly when the retry looks for it.
              state.existing = state.existingOnRetry;
              return { data: null, error: state.insertError };
            },
          }),
        };
      },
      update: (row: any) => ({
        eq: (_col: string, id: string) => {
          state.updates.push({ id, row });
          const result = {
            data: state.updateError ? null : { ...state.existing, ...row },
            error: state.updateError,
          };
          // PostgREST's builder is itself thenable, so a caller can await it
          // directly or go on through .select().single().
          return {
            select: () => ({ single: async () => result }),
            then: (resolve: (value: any) => void) =>
              Promise.resolve({ error: state.updateError }).then(resolve),
          };
        },
      }),
      delete: () => ({
        eq: (_col: string, id: string) => {
          state.deleted = id;
          return Promise.resolve({ error: state.deleteError });
        },
      }),
    }),
  },
}));

/**
 * The thumbnail work is fired without being awaited, so a "did not happen"
 * assertion has to give it the chance to happen first.
 */
const flushPendingWork = () => new Promise((resolve) => setTimeout(resolve, 0));

const urlUpdates = () => state.updates.filter((u) => 'url' in u.row);
/**
 * Thumbnails are written through set_video_thumbnail rather than a direct
 * update, so that any signed-in viewer can fill in a missing one - not only
 * the owner the videos UPDATE policy admits.
 */
const thumbnailWrites = () =>
  state.rpcCalls.filter((c) => c.fn === 'set_video_thumbnail');

async function callFindOrCreate() {
  const { VideoService } = await import('@/services/videoService');
  return VideoService.findOrCreateOutputVideo('proj-123', 'user-1');
}

async function callRefresh(video: any) {
  const { VideoService } = await import('@/services/videoService');
  return VideoService.refreshAwsVideoUrl(video);
}

function resetState() {
  state.existing = null;
  state.rowsById = { v1: { id: 'v1', ownerId: 'user-1', thumbnailUrl: null } };
  state.inserted = null;
  state.insertError = null;
  state.existingOnRetry = null;
  state.updates = [];
  state.deleted = null;
  state.updateError = null;
  state.deleteError = null;
  state.callerId = 'user-1';
  state.rpcCalls = [];
  state.rpcError = null;
  generateSmallThumbnail.mockReset();
  getVideoUrlForProject.mockReset();
  getVideoUrlForProject.mockResolvedValue('https://s3.example.com/presigned.mp4');
}

/**
 * The thumbnail is deliberately not awaited by either entry point, so tests
 * wait for its write rather than for the call that kicked it off.
 */
const awsVideo = (overrides: Record<string, unknown> = {}) => ({
  id: 'v1',
  videoId: 'aws:proj-123',
  ownerId: 'user-1',
  thumbnailUrl: null,
  url: 'https://s3.example.com/expired.mp4',
  ...overrides,
});

describe('refreshAwsVideoUrl thumbnails', () => {
  beforeEach(resetState);

  it('generates and stores a thumbnail when the video has none', async () => {
    // Opening an AWS video from the dashboard goes through this path, not the
    // ?outputVideo= ingest, so this is where the backfill has to happen.
    generateSmallThumbnail.mockResolvedValue('data:image/jpeg;base64,fresh');

    await callRefresh(awsVideo());

    await vi.waitFor(() => expect(thumbnailWrites()).toHaveLength(1));
    expect(generateSmallThumbnail).toHaveBeenCalledWith(
      'https://s3.example.com/presigned.mp4'
    );
    expect(thumbnailWrites()[0]!.args).toEqual({
      video_id: 'v1',
      thumbnail: 'data:image/jpeg;base64,fresh',
    });
  });

  it('backfills when the caller knows only the video id', async () => {
    // The three refresh call sites hand over differently shaped projections -
    // one is a Partial<Video>, another a reshaped store object - so the gate
    // reads the row itself instead of trusting whatever it was handed.
    generateSmallThumbnail.mockResolvedValue('data:image/jpeg;base64,fresh');

    await callRefresh({ id: 'v1', videoId: 'aws:proj-123' });

    await vi.waitFor(() => expect(thumbnailWrites()).toHaveLength(1));
    expect(thumbnailWrites()[0]!.args).toEqual({
      video_id: 'v1',
      thumbnail: 'data:image/jpeg;base64,fresh',
    });
  });

  it('does not regenerate when the video already has a thumbnail', async () => {
    state.rowsById.v1!.thumbnailUrl = 'data:image/jpeg;base64,old';

    await callRefresh(awsVideo());
    await flushPendingWork();

    expect(generateSmallThumbnail).not.toHaveBeenCalled();
    expect(thumbnailWrites()).toEqual([]);
  });

  it('generates and stores for a viewer who does not own the video', async () => {
    // Everyone sees everyone's videos, so whoever opens one first fills in its
    // thumbnail. The owner may never open it again.
    state.callerId = 'someone-else';
    generateSmallThumbnail.mockResolvedValue('data:image/jpeg;base64,fresh');

    await callRefresh(awsVideo());

    await vi.waitFor(() => expect(thumbnailWrites()).toHaveLength(1));
    expect(thumbnailWrites()[0]!.args).toEqual({
      video_id: 'v1',
      thumbnail: 'data:image/jpeg;base64,fresh',
    });
  });

  it('does not generate for a signed-out viewer', async () => {
    // set_video_thumbnail refuses an anonymous caller, so there is nowhere to
    // put the result.
    state.callerId = null;

    await callRefresh(awsVideo());
    await flushPendingWork();

    expect(generateSmallThumbnail).not.toHaveBeenCalled();
    expect(thumbnailWrites()).toEqual([]);
  });

  it('returns the fresh url without waiting for the thumbnail', async () => {
    let finishGeneration: (value: string | null) => void = () => {};
    generateSmallThumbnail.mockReturnValue(
      new Promise((resolve) => {
        finishGeneration = resolve;
      })
    );

    const url = await callRefresh(awsVideo());

    expect(url).toBe('https://s3.example.com/presigned.mp4');
    expect(urlUpdates()).toHaveLength(1);
    expect(thumbnailWrites()).toEqual([]);
    finishGeneration(null);
  });

  it('still returns the fresh url when generation fails', async () => {
    generateSmallThumbnail.mockRejectedValue(new Error('canvas tainted'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const url = await callRefresh(awsVideo());

    expect(url).toBe('https://s3.example.com/presigned.mp4');
    // Wait for the report rather than the call, so the assertion covers the
    // whole failure path and the spy is still in place when it logs.
    await vi.waitFor(() =>
      expect(
        errorSpy.mock.calls.some((c) => String(c[0]).includes('ensureAwsThumbnail'))
      ).toBe(true)
    );
    expect(thumbnailWrites()).toEqual([]);
    errorSpy.mockRestore();
  });

  it('does not generate for a non-AWS video', async () => {
    const result = await callRefresh(awsVideo({ videoId: 'abc123' }));

    expect(result).toBeNull();
    expect(generateSmallThumbnail).not.toHaveBeenCalled();
  });
});

describe('findOrCreateOutputVideo thumbnails', () => {
  beforeEach(resetState);

  it('stores a generated thumbnail for a new record', async () => {
    generateSmallThumbnail.mockResolvedValue('data:image/jpeg;base64,abc');

    await callFindOrCreate();

    await vi.waitFor(() => expect(thumbnailWrites()).toHaveLength(1));
    expect(generateSmallThumbnail).toHaveBeenCalledWith(
      'https://s3.example.com/presigned.mp4'
    );
    expect(thumbnailWrites()[0]!.args).toEqual({
      video_id: 'v1',
      thumbnail: 'data:image/jpeg;base64,abc',
    });
  });

  it('creates the record without a thumbnail when generation returns null', async () => {
    generateSmallThumbnail.mockResolvedValue(null);

    await callFindOrCreate();

    expect(state.inserted).not.toBeNull();
    await vi.waitFor(() => expect(generateSmallThumbnail).toHaveBeenCalled());
    expect(thumbnailWrites()).toEqual([]);
  });

  it('creates the record without a thumbnail when generation throws', async () => {
    generateSmallThumbnail.mockRejectedValue(new Error('canvas tainted'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await callFindOrCreate();

    expect(state.inserted).not.toBeNull();
    expect('thumbnailUrl' in state.inserted).toBe(false);
    await vi.waitFor(() =>
      expect(
        errorSpy.mock.calls.some((c) => String(c[0]).includes('ensureAwsThumbnail'))
      ).toBe(true)
    );
    expect(thumbnailWrites()).toEqual([]);
    errorSpy.mockRestore();
  });

  it('backfills the thumbnail on an existing record that has none', async () => {
    state.existing = { id: 'v1', videoId: 'aws:proj-123', ownerId: 'user-1', thumbnailUrl: null };
    generateSmallThumbnail.mockResolvedValue('data:image/jpeg;base64,backfilled');

    await callFindOrCreate();

    expect(state.inserted).toBeNull();
    expect(urlUpdates()[0]!.row).toEqual({ url: 'https://s3.example.com/presigned.mp4' });
    await vi.waitFor(() => expect(thumbnailWrites()).toHaveLength(1));
    expect(thumbnailWrites()[0]!.args).toEqual({
      video_id: 'v1',
      thumbnail: 'data:image/jpeg;base64,backfilled',
    });
  });

  it('does not regenerate when the existing record already has a thumbnail', async () => {
    state.existing = {
      id: 'v1',
      videoId: 'aws:proj-123',
      ownerId: 'user-1',
      thumbnailUrl: 'data:image/jpeg;base64,existing',
    };
    state.rowsById.v1 = state.existing;

    await callFindOrCreate();
    await flushPendingWork();

    expect(generateSmallThumbnail).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]!.row).toEqual({ url: 'https://s3.example.com/presigned.mp4' });
  });

  it('returns without waiting for the thumbnail', async () => {
    let finishGeneration: (value: string | null) => void = () => {};
    generateSmallThumbnail.mockReturnValue(
      new Promise((resolve) => {
        finishGeneration = resolve;
      })
    );

    await callFindOrCreate();

    expect(state.inserted).not.toBeNull();
    expect(urlUpdates()).toHaveLength(1);
    expect(thumbnailWrites()).toEqual([]);
    finishGeneration(null);
  });

  it('abandons a generation that never settles without writing a thumbnail', async () => {
    vi.useFakeTimers();
    try {
      generateSmallThumbnail.mockReturnValue(new Promise(() => {}));

      await callFindOrCreate();
      await vi.advanceTimersByTimeAsync(15_000);

      expect(state.inserted).not.toBeNull();
      expect(thumbnailWrites()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('findOrCreateOutputVideo ordering', () => {
  beforeEach(resetState);

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
    expect(urlUpdates()[0]!.row.url).toBe('https://s3.example.com/presigned.mp4');
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

  it('does not delete a pre-existing row when the final update fails, and returns it with the fresh url', async () => {
    state.existing = {
      id: 'existing-1',
      ownerId: 'user-1',
      thumbnailUrl: 'data:image/jpeg;base64,old',
    };
    getVideoUrlForProject.mockResolvedValue('https://s3.example.com/presigned.mp4');
    state.updateError = new Error('update failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await callFindOrCreate();

    expect(state.deleted).toBeNull();
    // The update itself no-ops under RLS (e.g. a non-owner viewing a shared AWS
    // video), so `record` on its own carries the OLD, expired url. The freshly
    // fetched presignedUrl must still make it back to the caller.
    expect(result).toEqual({ ...state.existing, url: 'https://s3.example.com/presigned.mp4' });
    errorSpy.mockRestore();
  });

  it('reports it but still throws the original error when the post-fetch-failure delete itself fails', async () => {
    getVideoUrlForProject.mockRejectedValue(new Error('403 Not authorized for this video'));
    state.deleteError = new Error('delete blocked by RLS');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // The original fetch-failure error must still be what the caller sees, not
    // the delete's own error.
    await expect(callFindOrCreate()).rejects.toThrow('Not authorized');

    // Discriminate on the context string, not just "was console.error called":
    // handleServiceError logs `[${context}] ${message}` as the first arg, and
    // the orphan-cleanup contexts both contain "orphan cleanup". Asserting mere
    // call-count would pass even if the `if (deleteError)` check were removed,
    // since nothing else logs on this path in this test - but the sibling test
    // below does have an unconditional log on the same path, so this
    // discrimination is what actually pins the delete-error being reported.
    expect(
      errorSpy.mock.calls.some((c) => String(c[0]).includes('orphan cleanup'))
    ).toBe(true);
    errorSpy.mockRestore();
  });

  it('reports it but still throws the original error when the post-update-failure delete itself fails', async () => {
    getVideoUrlForProject.mockResolvedValue('https://s3.example.com/presigned.mp4');
    generateSmallThumbnail.mockResolvedValue(null);
    state.updateError = new Error('update failed');
    state.deleteError = new Error('delete blocked by RLS');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // The original update-failure error must still be what the caller sees, not
    // the delete's own error.
    await expect(callFindOrCreate()).rejects.toThrow('update failed');

    // handleServiceError also fires unconditionally for the update error itself
    // on this path, so a bare "was console.error called" assertion would pass
    // even without the delete-error check this test exists to pin. Require the
    // orphan-cleanup-specific log instead.
    expect(
      errorSpy.mock.calls.some((c) => String(c[0]).includes('orphan cleanup'))
    ).toBe(true);
    errorSpy.mockRestore();
  });
});


describe('findOrCreateOutputVideo losing the insert race', () => {
  beforeEach(resetState);

  /**
   * Two clients open the same pipeline output at once. Both find nothing, both
   * insert, and the partial unique index on aws: videoIds lets exactly one win.
   * Losing is a normal outcome: the winner's row is the row this caller wanted.
   */
  it('reads back the winner row instead of failing', async () => {
    state.insertError = { code: '23505', message: 'duplicate key value' };
    // What findVideoByOutputVideoId returns on the retry - the winner's row.
    state.existingOnRetry = {
      id: 'v1',
      videoId: 'aws:proj-123',
      ownerId: 'user-2',
      url: '',
      thumbnailUrl: null,
    };

    const result = await callFindOrCreate();

    expect(result.id).toBe('v1');
  });

  it('explains the conflict when RLS hides the winner row', async () => {
    state.insertError = { code: '23505', message: 'duplicate key value' };
    state.existingOnRetry = null;

    await expect(callFindOrCreate()).rejects.toThrow(/already claimed/i);
  });

  it('still throws on an unrelated insert error', async () => {
    state.insertError = { code: '42501', message: 'permission denied' };

    await expect(callFindOrCreate()).rejects.toMatchObject({ code: '42501' });
  });
});
