import { describe, it, expect, vi } from 'vitest';
const chain: any = {
  select: vi.fn(() => chain), eq: vi.fn(() => chain),
  maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'c1', videoA: {}, videoB: {} }, error: null })),
};
const fromMock = vi.fn(() => chain);
vi.mock('@/composables/useSupabase', () => ({ supabase: { from: () => fromMock() } }));

describe('getComparisonVideoById', () => {
  it('fetches one comparison by id with joined videos', async () => {
    const { ComparisonVideoService } = await import('@/services/comparisonVideoService');
    const c = await ComparisonVideoService.getComparisonVideoById('c1');
    expect(chain.eq).toHaveBeenCalledWith('id', 'c1');
    expect(c?.id).toBe('c1');
  });
});
