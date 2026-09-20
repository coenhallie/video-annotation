import { describe, it, expect, vi } from 'vitest';

const selectAllIn = vi.fn();
vi.mock('@/services/selectAllIn', () => ({
  selectAllIn: (...a: unknown[]) => selectAllIn(...a),
}));
vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    from: () => {
      throw new Error('one unbounded .in() over every id in the library');
    },
  },
}));
vi.mock('@/services/ownerEnrichmentService', () => ({ fetchOwners: vi.fn() }));

// The dashboard asks for every video in the shared library at once. A single
// `.in()` with a few hundred uuids is a URL the gateway refuses, and the
// function turned that failure into {}: every video then read 0% watched with
// no error anywhere.
describe('getMergedRangesForVideos on a large library', () => {
  it('reads through the chunked, paged helper and merges what comes back', async () => {
    selectAllIn.mockResolvedValue([
      { id: 'r1', videoId: 'v1', watchedRanges: [[0, 10]] },
      { id: 'r2', videoId: 'v1', watchedRanges: [[5, 20]] },
      { id: 'r3', videoId: 'v2', watchedRanges: [[1, 2]] },
    ]);
    const { getMergedRangesForVideos } = await import('@/services/watchProgressService');
    const ids = Array.from({ length: 400 }, (_, i) => `v${i}`);

    const merged = await getMergedRangesForVideos(ids);

    expect(selectAllIn).toHaveBeenCalledWith(
      'video_watch_progress',
      expect.stringContaining('id'),
      'videoId',
      ids
    );
    expect(merged).toEqual({ v1: [[0, 20]], v2: [[1, 2]] });
  });
});
