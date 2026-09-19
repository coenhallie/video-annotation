import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn(async () => ({ data: null, error: null }));
const chain: Record<string, any> = {};
for (const m of ['select', 'eq', 'delete', 'update', 'single']) chain[m] = vi.fn(() => chain);
chain.then = (ok: any) => Promise.resolve({ data: [{ id: 'c1' }], error: null }).then(ok);
vi.mock('@/composables/useSupabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])), from: () => chain },
}));

beforeEach(() => rpc.mockClear());

// The database function is set_session_context(session_id text). The client
// sent { sessionId }, which PostgREST rejects as an unknown function signature,
// so the call has never succeeded. Found by generating types from the schema.
describe('set_session_context', () => {
  it('is called with the parameter name the function declares', async () => {
    const { CommentService } = await import('@/services/commentService');
    await CommentService.deleteComment('c1', 'sess-1');
    expect(rpc).toHaveBeenCalledWith('set_session_context', { session_id: 'sess-1' });
  });
});
