import { describe, it, expect, vi, beforeEach } from 'vitest';

const tableResults: Record<string, { data: unknown; error: unknown }> = {};

function makeTableChain(table: string) {
  const chain: Record<string, any> = {};
  for (const m of ['select', 'eq', 'order']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() =>
    Promise.resolve(tableResults[table] ?? { data: null, error: null })
  );
  return chain;
}

const fromMock = vi.fn((table: string) => makeTableChain(table));

vi.mock('@/composables/useSupabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

beforeEach(() => {
  fromMock.mockClear();
  delete tableResults['annotations'];
  delete tableResults['videos'];
  delete tableResults['comparison_videos'];
});

describe('CommentService.canUserCommentOnAnnotation', () => {
  const annotationOnVideo = {
    id: 'a1',
    userId: 'owner-1',
    videoId: 'v1',
    comparisonVideoId: null,
  };

  it('denies anonymous (unauthenticated) users on a public video', async () => {
    const { CommentService } = await import('@/services/commentService');
    tableResults['annotations'] = { data: annotationOnVideo, error: null };
    tableResults['videos'] = {
      data: { isPublic: true, ownerId: 'owner-1', allowAnnotations: true },
      error: null,
    };

    const result = await CommentService.canUserCommentOnAnnotation('a1');
    expect(result.canComment).toBe(false);
  });

  it('allows authenticated non-owners on a public video with allowAnnotations', async () => {
    const { CommentService } = await import('@/services/commentService');
    tableResults['annotations'] = { data: annotationOnVideo, error: null };
    tableResults['videos'] = {
      data: { isPublic: true, ownerId: 'owner-1', allowAnnotations: true },
      error: null,
    };

    const result = await CommentService.canUserCommentOnAnnotation(
      'a1',
      'stranger-1'
    );
    expect(result.canComment).toBe(true);
  });

  it('denies authenticated non-owners on a public video without allowAnnotations', async () => {
    const { CommentService } = await import('@/services/commentService');
    tableResults['annotations'] = { data: annotationOnVideo, error: null };
    tableResults['videos'] = {
      data: { isPublic: true, ownerId: 'owner-1', allowAnnotations: false },
      error: null,
    };

    const result = await CommentService.canUserCommentOnAnnotation(
      'a1',
      'stranger-1'
    );
    expect(result.canComment).toBe(false);
  });

  it('allows the video owner regardless of allowAnnotations', async () => {
    const { CommentService } = await import('@/services/commentService');
    tableResults['annotations'] = { data: annotationOnVideo, error: null };
    tableResults['videos'] = {
      data: { isPublic: true, ownerId: 'owner-1', allowAnnotations: false },
      error: null,
    };

    const result = await CommentService.canUserCommentOnAnnotation(
      'a1',
      'owner-1'
    );
    expect(result.canComment).toBe(true);
  });

  it('denies anonymous users on a public comparison video', async () => {
    const { CommentService } = await import('@/services/commentService');
    tableResults['annotations'] = {
      data: {
        id: 'a2',
        userId: 'owner-1',
        videoId: null,
        comparisonVideoId: 'c1',
      },
      error: null,
    };
    tableResults['comparison_videos'] = {
      data: { isPublic: true, userId: 'owner-1', allowAnnotations: true },
      error: null,
    };

    const result = await CommentService.canUserCommentOnAnnotation('a2');
    expect(result.canComment).toBe(false);
  });
});
