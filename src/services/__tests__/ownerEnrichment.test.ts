import { describe, it, expect, vi, beforeEach } from 'vitest';

const chain = {
  select: vi.fn(() => chain),
  in: vi.fn(() => Promise.resolve({
    data: [
      { id: 'u1', fullName: 'Alice', email: 'a@x.com', avatarUrl: null },
      { id: 'u2', fullName: null, email: 'bob@x.com', avatarUrl: 'http://img' },
    ],
    error: null,
  })),
};
const fromMock = vi.fn(() => chain);
vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

beforeEach(() => { fromMock.mockClear(); chain.in.mockClear(); });

describe('fetchOwners', () => {
  it('dedupes ids and maps by owner id, falling back on name', async () => {
    const { fetchOwners } = await import('@/services/ownerEnrichmentService');
    const map = await fetchOwners(['u1', 'u2', 'u1']);
    expect(chain.in).toHaveBeenCalledWith('id', ['u1', 'u2']);
    expect(map.u1.name).toBe('Alice');
    expect(map.u2.name).toBe('bob@x.com'); // falls back to email when no fullName
    expect(map.u2.avatarUrl).toBe('http://img');
  });

  it('returns empty map for empty input without querying', async () => {
    const { fetchOwners } = await import('@/services/ownerEnrichmentService');
    const map = await fetchOwners([]);
    expect(map).toEqual({});
    expect(fromMock).not.toHaveBeenCalled();
  });
});
