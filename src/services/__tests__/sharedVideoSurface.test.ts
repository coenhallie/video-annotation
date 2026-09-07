import { describe, it, expect, vi, beforeEach } from 'vitest';

// What the `videos` lookup answers with. Only the one query in
// getSharedVideoWithCommentPermissions reaches supabase here: the annotation
// fetch goes through the mocked AnnotationService and never falls back.
let videoRows: Record<string, unknown>[] = [];

const chain: Record<string, any> = {};
for (const m of ['select', 'eq', 'order']) {
  chain[m] = vi.fn(() => chain);
}
chain.then = (onFulfilled: any, onRejected: any) =>
  Promise.resolve({ data: videoRows, error: null }).then(
    onFulfilled,
    onRejected
  );

vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    from: () => chain,
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

const getVideoAnnotations = vi.fn();
vi.mock('@/services/annotationService', () => ({
  AnnotationService: {
    getVideoAnnotations: (...a: unknown[]) => getVideoAnnotations(...a),
  },
}));
vi.mock('@/services/commentService', () => ({ CommentService: {} }));

const publicVideo = {
  id: 'v1',
  title: 'Pipeline Output - 1b30b3cc',
  url: 'https://s3/presigned',
  videoType: 'url',
  videoId: 'aws:1b30b3cc',
  ownerId: 'owner',
  isPublic: true,
  allowAnnotations: false,
};

beforeEach(() => {
  getVideoAnnotations.mockReset();
  getVideoAnnotations.mockResolvedValue([]);
  videoRows = [publicVideo];
});

describe('ShareService.getSharedVideoWithCommentPermissions', () => {
  it('carries videoId so a share view can recognise an AWS pipeline video', async () => {
    const { ShareService } = await import('@/services/shareService');

    const shared = await ShareService.getSharedVideoWithCommentPermissions('v1');

    expect(shared.videoId).toBe('aws:1b30b3cc');
    expect(shared.videoType).toBe('url');
  });

  it('forwards the surface to the annotation fetch', async () => {
    const { ShareService } = await import('@/services/shareService');

    await ShareService.getSharedVideoWithCommentPermissions('v1', 'pipeline');

    expect(getVideoAnnotations).toHaveBeenCalledWith(
      'v1',
      'v1',
      true,
      'pipeline'
    );
  });

  // The share-view initialisers call this without a surface and must keep
  // getting every annotation, exactly as before surfaces existed.
  it('asks for every surface when none is given', async () => {
    const { ShareService } = await import('@/services/shareService');

    await ShareService.getSharedVideoWithCommentPermissions('v1');

    expect(getVideoAnnotations).toHaveBeenCalledWith('v1', 'v1', true, undefined);
  });
});
