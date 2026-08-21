import { describe, it, expect, vi } from 'vitest';

// videoService.ts imports the real Supabase client, which reads
// `window.localStorage` at module load time and there is no browser
// `window` in this node-environment test. isPipelineSurfaceVisible only
// ever calls VideoService.isAwsVideo, which never touches supabase, so a
// minimal stub is enough to let the module load without faking anything
// this test actually exercises. vitest hoists vi.mock above the imports
// below, so this runs before pipelineSurface.ts (and, transitively,
// videoService.ts) is evaluated.
vi.mock('@/composables/useSupabase', () => ({
  supabase: {},
}));

import { isPipelineSurfaceVisible } from '../pipelineSurface';

const awsVideo = { videoId: 'aws:project-123' };
const plainVideo = { videoId: 'video-abc' };

describe('isPipelineSurfaceVisible', () => {
  it('shows the tab bar for an AWS video in single mode on a non-shared view', () => {
    expect(isPipelineSurfaceVisible(awsVideo, 'single', false)).toBe(true);
  });

  it('hides the tab bar in dual mode even for an AWS video', () => {
    // Comparison annotations scope by comparisonVideoId and bypass videoId
    // entirely, so a surface column does not apply to them.
    expect(isPipelineSurfaceVisible(awsVideo, 'dual', false)).toBe(false);
  });

  it('hides the tab bar on a share view even for an AWS video', () => {
    // ShareService's getVideoAnnotations takes no surface argument and
    // returns both surfaces, so tabs there would double up annotations.
    expect(isPipelineSurfaceVisible(awsVideo, 'single', true)).toBe(false);
  });

  it('hides the tab bar for a non-AWS video', () => {
    expect(isPipelineSurfaceVisible(plainVideo, 'single', false)).toBe(false);
  });

  it('hides the tab bar while no video has loaded', () => {
    expect(isPipelineSurfaceVisible(null, 'single', false)).toBe(false);
    expect(isPipelineSurfaceVisible(undefined, 'single', false)).toBe(false);
  });
});
