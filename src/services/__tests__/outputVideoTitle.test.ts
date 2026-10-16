import { describe, it, expect, vi, beforeEach } from 'vitest';

const getVideoUrlForProject = vi.fn();
vi.mock('@/services/awsStorageService', () => ({
  AwsStorageService: { getVideoUrlForProject },
}));
vi.mock('@/utils/thumbnailGenerator', () => ({
  ThumbnailGenerator: { generateSmallThumbnail: vi.fn(async () => null) },
}));

const OUTPUT_ID = '2072c391-4cce-4594-9971-70bcdefd1303';
const DEFAULT_TITLE = 'Pipeline Output - 2072c391';
const MATCH_TITLE = 'Manchester City vs PSG - Champions League - 14/10/2026';

let existing: Record<string, unknown> | null = null;
let inserted: Record<string, unknown> | null = null;
let renameError: { message: string } | null = null;
let matchDateError: { message: string } | null = null;
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

vi.mock('@/composables/useSupabase', () => ({
  getOptimizedSession: async () => ({ user: { id: 'me' } }),
  supabase: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === 'set_video_match_date') {
        if (matchDateError) return { data: null, error: matchDateError };
        return { data: { ...existing, matchDate: args.p_match_date }, error: null };
      }
      if (fn !== 'rename_video') return { data: true, error: null };
      if (renameError) return { data: null, error: renameError };
      return { data: { ...existing, title: args.p_title }, error: null };
    },
    from: () => ({
      select: () => ({
        eq: (col: string) => ({
          // By videoId for the aws: lookup; by id for the thumbnail gate, which
          // a thumbnail already present keeps out of the way.
          maybeSingle: async () =>
            col === 'id'
              ? { data: { thumbnailUrl: 'https://thumb' }, error: null }
              : { data: existing, error: null },
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        inserted = row;
        return {
          select: () => ({
            single: async () => ({ data: { id: 'v1', ...row }, error: null }),
          }),
        };
      },
      update: (row: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => ({ data: { ...(existing ?? inserted), ...row }, error: null }),
          }),
        }),
      }),
    }),
  },
}));

const renames = () => rpcCalls.filter((c) => c.fn === 'rename_video');
const dateWrites = () => rpcCalls.filter((c) => c.fn === 'set_video_match_date');

const open = async (title?: string | null, matchDate: string | null = null) => {
  const { VideoService } = await import('@/services/videoService');
  return VideoService.findOrCreateOutputVideo(
    OUTPUT_ID,
    'me',
    title === undefined && matchDate === null ? null : { title: title ?? null, matchDate }
  );
};

const row = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  ownerId: 'someone-else',
  videoId: `aws:${OUTPUT_ID}`,
  title: DEFAULT_TITLE,
  url: 'https://s3/stale',
  ...over,
});

beforeEach(() => {
  existing = null;
  inserted = null;
  renameError = null;
  matchDateError = null;
  rpcCalls.length = 0;
  getVideoUrlForProject.mockResolvedValue('https://s3/fresh');
});

describe('findOrCreateOutputVideo titles', () => {
  it('names a new video after the match', async () => {
    const video = await open(MATCH_TITLE);
    expect(inserted?.title).toBe(MATCH_TITLE);
    expect(video.title).toBe(MATCH_TITLE);
  });

  it('keeps the default title for a new video when the link names no match', async () => {
    await open(null);
    expect(inserted?.title).toBe(DEFAULT_TITLE);
  });

  // Through rename_video, not a direct update: the videos UPDATE policy is
  // owner-only, so a teammate's update would match zero rows and report
  // success.
  it('renames an existing video whose title is still the default', async () => {
    existing = row();
    const video = await open(MATCH_TITLE);
    expect(renames()).toEqual([
      { fn: 'rename_video', args: { p_video_id: 'v1', p_title: MATCH_TITLE } },
    ]);
    expect(video.title).toBe(MATCH_TITLE);
  });

  it('never renames a video someone has already named', async () => {
    existing = row({ title: 'Derby, second half' });
    const video = await open(MATCH_TITLE);
    expect(renames()).toHaveLength(0);
    expect(video.title).toBe('Derby, second half');
  });

  it('does not rename when the link names no match', async () => {
    existing = row();
    await open(null);
    expect(renames()).toHaveLength(0);
  });

  // The title is cosmetic. Failing to set it must not stop the video opening.
  it('still opens the video when the rename fails', async () => {
    existing = row();
    renameError = { message: 'boom' };
    const video = await open(MATCH_TITLE);
    expect(video.url).toBe('https://s3/fresh');
    expect(video.title).toBe(DEFAULT_TITLE);
  });
});

describe('findOrCreateOutputVideo match dates', () => {
  it('stores the match date on a new video', async () => {
    const video = await open(MATCH_TITLE, '2026-10-14');
    expect(inserted?.matchDate).toBe('2026-10-14');
    expect(video.matchDate).toBe('2026-10-14');
  });

  it('leaves the match date empty on a new video when the link has none', async () => {
    await open(MATCH_TITLE, null);
    expect(inserted?.matchDate ?? null).toBeNull();
  });

  // DALF is where match dates come from, and nobody edits them here, so the
  // link's date wins over an older one, whoever owns the video.
  it('dates an existing video through set_video_match_date', async () => {
    existing = row({ title: 'Derby, second half', matchDate: null });
    const video = await open(null, '2026-10-14');
    expect(dateWrites()).toEqual([
      {
        fn: 'set_video_match_date',
        args: { p_video_id: 'v1', p_match_date: '2026-10-14' },
      },
    ]);
    expect(video.matchDate).toBe('2026-10-14');
  });

  it('does not rewrite a match date that already matches', async () => {
    existing = row({ matchDate: '2026-10-14' });
    await open(null, '2026-10-14');
    expect(dateWrites()).toHaveLength(0);
  });

  it('still opens the video when the date cannot be written', async () => {
    existing = row({ matchDate: null });
    matchDateError = { message: 'boom' };
    const video = await open(null, '2026-10-14');
    expect(video.url).toBe('https://s3/fresh');
    expect(video.matchDate ?? null).toBeNull();
  });
});
