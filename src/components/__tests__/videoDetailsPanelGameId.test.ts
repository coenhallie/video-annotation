// @vitest-environment jsdom
//
// DALF's game id, from the "Open in Perspecto" link, sits in the details
// panel's stat row beside the annotation and comment counts, so a video can be
// matched back to its game in DALF.
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { Project } from '@/types/project';

vi.mock('@/services/watchProgressService', () => ({
  getProgressForVideo: vi.fn(async () => []),
  mergeDualProgress: vi.fn(() => []),
}));
vi.mock('@/services/ownerEnrichmentService', () => ({ UNKNOWN_OWNER_NAME: 'Unknown' }));
vi.mock('@/components/QaStatusSelect.vue', () => ({ default: { render: () => null } }));

const single = (gameId: string | null): Project =>
  ({
    id: 'video-1',
    projectType: 'single',
    title: 'Derby',
    thumbnailUrl: '',
    createdAt: '2026-08-01T00:00:00Z',
    video: { id: 'video-1', title: 'Derby', duration: 10, qaStatus: 'not_started', gameId },
  }) as unknown as Project;

const dual = {
  id: 'comparison-1',
  projectType: 'dual',
  title: 'Defence comparison',
  thumbnailUrl: '',
  createdAt: '2026-08-01T00:00:00Z',
  comparisonVideo: { id: 'comparison-1' },
  videoA: { id: 'video-a', duration: 10, gameId: '111' },
  videoB: { id: 'video-b', duration: 10, gameId: '222' },
} as unknown as Project;

async function mount(project: Project) {
  const { default: VideoDetailsPanel } = await import('@/components/VideoDetailsPanel.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({
    render: () =>
      h(VideoDetailsPanel, {
        project,
        annotations: [],
        loading: false,
        annotationCount: 11,
        commentCount: 1,
      }),
  });
  app.mount(root);
  await nextTick();
  return {
    root,
    gameId: () => root.querySelector<HTMLElement>('[data-testid="dalf-game-id"]'),
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

describe('VideoDetailsPanel DALF game id', () => {
  it('shows the game id beside the annotation and comment counts', async () => {
    const panel = await mount(single('48213'));
    const el = panel.gameId();
    expect(el?.textContent?.trim()).toMatch(/^48213\s*Game ID$/);
    // Same row as the counts it sits beside.
    expect(el?.parentElement?.textContent).toContain('Annotations');
    expect(el?.parentElement?.textContent).toContain('Comments');
    panel.unmount();
  });

  it('shows nothing when the video has no game id', async () => {
    const panel = await mount(single(null));
    expect(panel.gameId()).toBeNull();
    panel.unmount();
  });

  // A comparison is two games; one id would be a guess.
  it('shows nothing on a comparison', async () => {
    const panel = await mount(dual);
    expect(panel.gameId()).toBeNull();
    panel.unmount();
  });
});
