// @vitest-environment jsdom
//
// loadData runs from several triggers (mount, scope, folder, user). Two things
// are protected here: a slower, superseded load must never overwrite a newer
// one, and a failed load must say so instead of reading as an empty library.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, ref, nextTick } from 'vue';
import type { Project } from '@/types/project';

const user = ref<{ id: string } | null>({ id: 'u1' });
const getAllProjects = vi.fn();
const getRecentOpens = vi.fn();

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ user, signOut: vi.fn() }),
}));
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    error: vi.fn(),
    success: vi.fn(),
    addNotification: vi.fn(),
  }),
}));
vi.mock('@/services/projectService', () => ({
  ProjectService: {
    getAllProjects,
    getProjectCountsBatched: vi.fn(async () => ({
      annotationCounts: {},
      commentCounts: {},
    })),
  },
}));
vi.mock('@/services/labelService', () => ({
  LabelService: {
    getProjectLabelData: vi.fn(async () => ({
      labels: [],
      labelIdsByProject: {},
    })),
  },
}));
vi.mock('@/services/videoService', () => ({ VideoService: { setQaStatus: vi.fn() } }));
vi.mock('@/services/watchProgressService', () => ({
  getMergedRangesForVideos: vi.fn(async () => ({})),
  getProgressForVideo: vi.fn(async () => []),
  mergeDualProgress: vi.fn(() => []),
}));
vi.mock('@/services/recentOpensService', () => ({ getRecentOpens }));
vi.mock('@/services/ownerEnrichmentService', () => ({
  UNKNOWN_OWNER_NAME: 'Unknown',
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/composables/useVideoDetails', () => ({
  useVideoDetails: () => ({
    annotations: ref([]),
    loading: ref(false),
    error: ref(null),
    selectProject: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock('@/composables/useDashboardFolders', () => ({
  useDashboardFolders: () => ({
    folders: ref([]),
    foldersError: ref(null),
    foldersLoaded: ref(true),
    folderTree: ref([]),
    currentFolderId: ref(null),
    dragOverFolderId: ref(null),
    folderProjectIds: ref({}),
    loadFolders: vi.fn(async () => {}),
    refreshFolderContents: vi.fn(async () => {}),
    selectFolder: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    fileProject: vi.fn(),
    filterByFolder: (list: Project[]) => list,
  }),
}));

const stubbed = [
  '@/components/AppHeader.vue',
  '@/components/CreateComparisonModal.vue',
  '@/components/FolderTree.vue',
  '@/components/NewFolderDialog.vue',
  '@/components/DeleteConfirmationDialog.vue',
  '@/components/ShareModal.vue',
  '@/components/ChangelogModal.vue',
];
for (const path of stubbed) {
  vi.doMock(path, () => ({ default: { render: () => null } }));
}

function project(title: string): Project {
  return {
    id: `project-${title}`,
    projectType: 'single',
    title,
    thumbnailUrl: '',
    createdAt: '2026-08-01T00:00:00Z',
    video: {
      id: `video-${title}`,
      title,
      url: `https://example.test/${title}.mp4`,
      duration: 10,
      qaStatus: 'not_started',
    },
  } as unknown as Project;
}

async function mountDashboard() {
  const { default: DashboardView } = await import('@/views/DashboardView.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(DashboardView);
  app.mount(root);
  const settle = async () => {
    for (let i = 0; i < 30; i++) {
      await Promise.resolve();
      await nextTick();
    }
  };
  const titles = () =>
    [...root.querySelectorAll('h3')].map((h) => (h.textContent ?? '').trim());
  const clickScope = (label: 'All' | 'Mine') =>
    [...root.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').trim() === label)!
      .click();
  return { root, settle, titles, clickScope, unmount: () => (app.unmount(), root.remove()) };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  user.value = { id: 'u1' };
  getRecentOpens.mockImplementation(async () => ({}));
});

describe('DashboardView load races and failures', () => {
  it('keeps the newest scope on screen when an older load finishes last', async () => {
    localStorage.setItem('dashboardScope', 'all');
    let finishMine!: (p: Project[]) => void;
    getAllProjects.mockImplementation(({ scope }: { scope: string }) =>
      scope === 'mine'
        ? new Promise<Project[]>((resolve) => (finishMine = resolve))
        : Promise.resolve([project('everyones')])
    );
    const d = await mountDashboard();
    await d.settle();

    d.clickScope('Mine');
    await d.settle();
    d.clickScope('All');
    await d.settle();
    finishMine([project('only-mine')]);
    await d.settle();

    expect(d.titles()).toEqual(['everyones']);
    d.unmount();
  });

  it('says the load failed instead of showing an empty library', async () => {
    getAllProjects.mockRejectedValue(new Error('network down'));
    const d = await mountDashboard();
    await d.settle();

    expect(d.root.textContent).toContain('Could not load videos');
    expect(d.root.textContent).not.toContain('No videos found.');
    d.unmount();
  });

  // PostgREST errors are plain objects with a `message`, not Error instances.
  it('shows the message of a plain-object database error', async () => {
    getAllProjects.mockRejectedValue({ message: 'upstream unavailable', code: '500' });
    const d = await mountDashboard();
    await d.settle();

    expect(d.root.textContent).toContain('Could not load videos: upstream unavailable');
    d.unmount();
  });
});
