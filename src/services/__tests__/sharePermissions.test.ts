import { describe, it, expect, vi, beforeEach } from 'vitest';

let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
let sessionResult: { data: { session: { user: { id: string } } | null } } = {
  data: { session: null },
};

const chain: Record<string, any> = {};
for (const m of ['select', 'eq', 'update', 'order']) {
  chain[m] = vi.fn(() => chain);
}
chain.then = (onFulfilled: any, onRejected: any) =>
  Promise.resolve(queryResult).then(onFulfilled, onRejected);

const fromMock = vi.fn(() => chain);
const getSessionMock = vi.fn(() => Promise.resolve(sessionResult));

vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    auth: { getSession: () => getSessionMock() },
  },
}));

beforeEach(() => {
  fromMock.mockClear();
  getSessionMock.mockClear();
  queryResult = { data: null, error: null };
  sessionResult = { data: { session: null } };
  // createShareableLink builds URLs from window.location.origin (absent in node env)
  (globalThis as any).window = { location: { origin: 'http://localhost' } };
});

describe('ShareService comment permission contexts', () => {
  it('denies commenting on a shared comparison for unauthenticated visitors even when public and allowAnnotations', async () => {
    const { ShareService } = await import('@/services/shareService');
    queryResult = {
      data: [{ id: 'c1', isPublic: true, allowAnnotations: true }],
      error: null,
    };
    sessionResult = { data: { session: null } };

    const context = await ShareService.getComparisonCommentPermissionContext('c1');
    expect(context.canComment).toBe(false);
  });

  it('allows commenting on a shared comparison for authenticated users when public and allowAnnotations', async () => {
    const { ShareService } = await import('@/services/shareService');
    queryResult = {
      data: [{ id: 'c1', isPublic: true, allowAnnotations: true }],
      error: null,
    };
    sessionResult = { data: { session: { user: { id: 'u1' } } } };

    const context = await ShareService.getComparisonCommentPermissionContext('c1');
    expect(context.canComment).toBe(true);
  });

  it('denies commenting on a shared video for unauthenticated visitors even when public and allowAnnotations', async () => {
    const { ShareService } = await import('@/services/shareService');
    queryResult = {
      data: [{ id: 'v1', isPublic: true, allowAnnotations: true }],
      error: null,
    };
    sessionResult = { data: { session: null } };

    const context = await ShareService.getCommentPermissionContext('v1');
    expect(context.canComment).toBe(false);
  });

  it('allows commenting on a shared video for authenticated users when public and allowAnnotations', async () => {
    const { ShareService } = await import('@/services/shareService');
    queryResult = {
      data: [{ id: 'v1', isPublic: true, allowAnnotations: true }],
      error: null,
    };
    sessionResult = { data: { session: { user: { id: 'u1' } } } };

    const context = await ShareService.getCommentPermissionContext('v1');
    expect(context.canComment).toBe(true);
  });
});

describe('ShareService propagates database errors on share/revoke updates', () => {
  it('makeVideoPrivate rejects when the update fails', async () => {
    const { ShareService } = await import('@/services/shareService');
    queryResult = { data: null, error: { message: 'update failed' } };

    await expect(ShareService.makeVideoPrivate('v1')).rejects.toBeTruthy();
  });

  it('makeComparisonVideoPrivate rejects when the update fails', async () => {
    const { ShareService } = await import('@/services/shareService');
    queryResult = { data: null, error: { message: 'update failed' } };

    await expect(
      ShareService.makeComparisonVideoPrivate('c1')
    ).rejects.toBeTruthy();
  });

  it('createShareableLink rejects when the update fails', async () => {
    const { ShareService } = await import('@/services/shareService');
    queryResult = { data: null, error: { message: 'update failed' } };

    await expect(ShareService.createShareableLink('v1', true)).rejects.toBeTruthy();
  });

  it('createComparisonShareableLink rejects when the update fails', async () => {
    const { ShareService } = await import('@/services/shareService');
    queryResult = { data: null, error: { message: 'update failed' } };

    await expect(
      ShareService.createComparisonShareableLink('c1', true)
    ).rejects.toBeTruthy();
  });
});
