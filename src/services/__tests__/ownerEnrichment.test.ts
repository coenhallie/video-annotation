import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/composables/useSupabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({
    data: [
      { id: 'u1', displayName: 'Alice', avatarUrl: null },
      { id: 'u2', displayName: 'bob', avatarUrl: 'http://img' },
    ],
    error: null,
  });
});

describe('fetchOwners', () => {
  it('dedupes ids and maps by owner id', async () => {
    const { fetchOwners } = await import('@/services/ownerEnrichmentService');
    const map = await fetchOwners(['u1', 'u2', 'u1']);

    expect(rpcMock).toHaveBeenCalledWith('get_user_display_names', {
      p_ids: ['u1', 'u2'],
    });
    expect(map.u1.name).toBe('Alice');
    expect(map.u2.name).toBe('bob');
    expect(map.u2.avatarUrl).toBe('http://img');
  });

  // The whole point of the RPC: reading `users` directly returns only the
  // caller's own row, so every other owner used to resolve to "Unknown".
  // A direct table read here would be a regression to that behaviour.
  it('goes through the RPC and never selects from users directly', async () => {
    const { fetchOwners } = await import('@/services/ownerEnrichmentService');
    await fetchOwners(['u1']);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe('get_user_display_names');
  });

  it('fills ids the RPC did not return, so every caller gets an entry', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'u1', displayName: 'Alice', avatarUrl: null }],
      error: null,
    });
    const { fetchOwners } = await import('@/services/ownerEnrichmentService');
    const map = await fetchOwners(['u1', 'missing']);

    expect(map.u1.name).toBe('Alice');
    expect(map.missing.name).toBe('Unknown');
  });

  it('falls back when the RPC returns a null display name', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'u1', displayName: null, avatarUrl: null }],
      error: null,
    });
    const { fetchOwners } = await import('@/services/ownerEnrichmentService');
    const map = await fetchOwners(['u1']);

    expect(map.u1.name).toBe('Unknown');
  });

  it('returns an empty map on an RPC error rather than throwing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { fetchOwners } = await import('@/services/ownerEnrichmentService');

    await expect(fetchOwners(['u1'])).resolves.toEqual({});
  });

  it('returns empty map for empty input without querying', async () => {
    const { fetchOwners } = await import('@/services/ownerEnrichmentService');
    const map = await fetchOwners([]);

    expect(map).toEqual({});
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
