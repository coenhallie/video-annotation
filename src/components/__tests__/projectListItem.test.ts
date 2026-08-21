// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import ProjectListItem from '@/components/ProjectListItem.vue';
import type { Project } from '@/types/project';
import type { Video, ComparisonVideo } from '@/types/database';

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    title: 'A video',
    url: 'https://example.com/video.mp4',
    videoId: 'video-1',
    fps: 30,
    duration: 60,
    totalFrames: 1800,
    isPublic: false,
    allowAnnotations: true,
    ownerId: 'owner-1',
    videoType: 'url',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    qaStatus: 'not_started',
    ...overrides,
  };
}

function makeComparisonVideo(): ComparisonVideo {
  return {
    id: 'comparison-1',
    userId: 'owner-1',
    title: 'A comparison',
    videoAId: 'video-a',
    videoBId: 'video-b',
    isPublic: false,
    allowAnnotations: true,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };
}

const dualProject: Project = {
  id: 'project-1',
  projectType: 'dual',
  title: 'A dual project',
  createdAt: '2026-08-01T00:00:00Z',
  videoA: makeVideo({ id: 'video-a' }),
  videoB: makeVideo({ id: 'video-b' }),
  comparisonVideo: makeComparisonVideo(),
};

const singleProject: Project = {
  id: 'project-2',
  projectType: 'single',
  title: 'A single project',
  createdAt: '2026-08-01T00:00:00Z',
  video: makeVideo({ id: 'video-single', qaStatus: 'staging' }),
};

function mountItem(project: Project, watchPercent: number) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(ProjectListItem, {
          project,
          isSelected: false,
          isDragging: false,
          watchPercent,
        }),
    })
  );
  app.mount(root);
  return {
    root,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

// The trailing slot in the row (after the watch-coverage chip) is a fixed
// w-24 column. On a single project it holds the QaStatusPill; on a dual
// project there is no video.qaStatus to show, but the slot must still hold
// its position - otherwise a watch chip on a dual row (DashboardView passes
// a real, non-zero watchPercent for dual projects too) slides right by
// roughly the pill's own width and breaks its own column.
describe('ProjectListItem QA status slot', () => {
  it('reserves the trailing width slot on a dual project instead of collapsing it', () => {
    const harness = mountItem(dualProject, 42);

    const placeholder = harness.root.querySelector<HTMLElement>(
      '[data-testid="qa-status-pill-placeholder"]'
    );
    expect(placeholder).not.toBeNull();
    expect(placeholder?.className).toContain('w-24');
    expect(placeholder?.className).toContain('shrink-0');

    // No pill on a dual project - there is no per-video status to show.
    expect(
      harness.root.querySelector('[data-testid="qa-status-pill"]')
    ).toBeNull();

    harness.unmount();
  });

  it('renders the pill, not the placeholder, on a single project', () => {
    const harness = mountItem(singleProject, 42);

    expect(
      harness.root.querySelector('[data-testid="qa-status-pill"]')
    ).not.toBeNull();
    expect(
      harness.root.querySelector('[data-testid="qa-status-pill-placeholder"]')
    ).toBeNull();

    harness.unmount();
  });
});
