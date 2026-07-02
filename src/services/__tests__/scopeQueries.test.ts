import { describe, it, expect, vi, beforeEach } from 'vitest';

const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
};
const fromMock = vi.fn(() => chain);

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

beforeEach(() => {
  fromMock.mockClear();
  chain.select.mockClear();
  chain.eq.mockClear();
  chain.order.mockClear();
});

describe('VideoService.getAllVideos', () => {
  it('queries videos without an ownerId eq filter', async () => {
    const { VideoService } = await import('@/services/videoService');
    await VideoService.getAllVideos();
    expect(fromMock).toHaveBeenCalledWith('videos');
    expect(chain.eq).not.toHaveBeenCalled();
    expect(chain.order).toHaveBeenCalledWith('createdAt', { ascending: false });
  });
});
