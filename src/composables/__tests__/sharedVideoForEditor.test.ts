import { describe, it, expect, vi } from 'vitest';

// useSharedContent imports ShareService, which builds a Supabase client at
// import time from env vars that are absent under vitest.
vi.mock('@/composables/useSupabase', () => ({ supabase: {} }));

import { sharedVideoForEditor } from '@/composables/useSharedContent';
import type { SharedVideoData } from '@/types/component-interfaces';

const base: SharedVideoData = {
  id: 'v1',
  title: 'Pipeline Output - 1b30b3cc',
  url: 'https://s3/presigned',
  videoType: 'url',
  isPublic: true,
  canComment: false,
  allowAnnotations: false,
  annotations: [],
};

describe('sharedVideoForEditor', () => {
  // Without videoId the editor cannot tell a pipeline video from an upload:
  // the pipeline tab's data fetch and the presigned-URL refresh both key off
  // the `aws:` prefix, and both used to be dead on every share view.
  it('carries videoId and videoType for an AWS pipeline video', () => {
    const video = sharedVideoForEditor({
      ...base,
      videoId: 'aws:1b30b3cc',
      ownerId: 'owner',
    });

    expect(video).toEqual({
      id: 'v1',
      url: 'https://s3/presigned',
      videoId: 'aws:1b30b3cc',
      videoType: 'url',
      ownerId: 'owner',
      isPublic: true,
      allowAnnotations: false,
    });
  });

  it('leaves absent optional fields absent rather than undefined', () => {
    const video = sharedVideoForEditor({ ...base, videoType: '' });

    expect(video).toEqual({
      id: 'v1',
      url: 'https://s3/presigned',
      isPublic: true,
      allowAnnotations: false,
    });
    expect('videoId' in video).toBe(false);
    expect('ownerId' in video).toBe(false);
  });
});
