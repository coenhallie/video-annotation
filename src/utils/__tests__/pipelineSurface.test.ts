import { describe, it, expect } from 'vitest';

import { isPipelineSurfaceVisible } from '../pipelineSurface';

const awsVideo = { videoId: 'aws:project-123' };
const plainVideo = { videoId: 'video-abc' };

describe('isPipelineSurfaceVisible', () => {
  it('shows the tab bar for an AWS video in single mode on a non-shared view', () => {
    expect(isPipelineSurfaceVisible(awsVideo, 'single', false)).toBe(true);
  });

  it('shows the tab bar for a plain uploaded video too', () => {
    // The tab bar is not gated on pipeline output existing: every single-video
    // project gets both tabs, and the pipeline one says it is empty.
    expect(isPipelineSurfaceVisible(plainVideo, 'single', false)).toBe(true);
  });

  it('hides the tab bar in dual mode', () => {
    // Comparison annotations scope by comparisonVideoId and bypass videoId
    // entirely, so a surface column does not apply to them.
    expect(isPipelineSurfaceVisible(awsVideo, 'dual', false)).toBe(false);
    expect(isPipelineSurfaceVisible(plainVideo, 'dual', false)).toBe(false);
  });

  it('hides the tab bar on a share view', () => {
    // ShareService's getVideoAnnotations takes no surface argument and
    // returns both surfaces, so tabs there would double up annotations.
    expect(isPipelineSurfaceVisible(awsVideo, 'single', true)).toBe(false);
    expect(isPipelineSurfaceVisible(plainVideo, 'single', true)).toBe(false);
  });

  it('hides the tab bar while no video has loaded', () => {
    expect(isPipelineSurfaceVisible(null, 'single', false)).toBe(false);
    expect(isPipelineSurfaceVisible(undefined, 'single', false)).toBe(false);
  });
});
