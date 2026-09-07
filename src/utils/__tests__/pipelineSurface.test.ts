import { describe, it, expect } from 'vitest';

import { isPipelineSurfaceVisible } from '../pipelineSurface';

const awsVideo = { videoId: 'aws:project-123' };
const plainVideo = { videoId: 'video-abc' };

describe('isPipelineSurfaceVisible', () => {
  it('shows the tab bar for an AWS video in single mode', () => {
    expect(isPipelineSurfaceVisible(awsVideo, 'single')).toBe(true);
  });

  it('shows the tab bar for a plain uploaded video too', () => {
    // The tab bar is not gated on pipeline output existing: every single-video
    // project gets both tabs, and the pipeline one says it is empty.
    expect(isPipelineSurfaceVisible(plainVideo, 'single')).toBe(true);
  });

  it('hides the tab bar in dual mode', () => {
    // Comparison annotations scope by comparisonVideoId and bypass videoId
    // entirely, so a surface column does not apply to them.
    expect(isPipelineSurfaceVisible(awsVideo, 'dual')).toBe(false);
    expect(isPipelineSurfaceVisible(plainVideo, 'dual')).toBe(false);
  });

  it('hides the tab bar while no video has loaded', () => {
    expect(isPipelineSurfaceVisible(null, 'single')).toBe(false);
    expect(isPipelineSurfaceVisible(undefined, 'single')).toBe(false);
  });
});
