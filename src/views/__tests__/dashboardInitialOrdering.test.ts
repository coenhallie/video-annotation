// @vitest-environment jsdom
//
// The dashboard orders its list by when THIS user last opened each project, and
// that ordering data is a separate query from the project list itself. The bug
// this protects against: publishing `projects` as soon as its own fetch lands,
// and letting `recentOpens` arrive a few awaits later. The list paints in
// created-date order, then visibly resorts itself under the cursor - about half
// a second of it, measured in the browser.
//
// So the invariant is not "the final order is right", which a plain assertion
// after the load would check and the bug would pass. It is "no other order is
// ever rendered". This test records every distinct ordering the list goes
// through while loadData settles and requires that there be exactly one.
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

/** Created-date descending, which is the order ProjectService hands them over. */
const CREATED_ORDER = ['newest', 'middle', 'oldest'];

function makeProjects(): Project[] {
  return CREATED_ORDER.map(
    (title, i) =>
      ({
        id: `project-${title}`,
        projectType: 'single',
        title,
        thumbnailUrl: '',
        createdAt: `2026-08-0${3 - i}T00:00:00Z`,
        video: {
          id: `video-${title}`,
          title,
          url: `https://example.test/${title}.mp4`,
          duration: 10,
          qaStatus: 'not_started',
        },
      }) as unknown as Project
  );
}

/** The two least recently created are the two most recently opened. */
const OPENS: Record<string, string> = {
  'project-oldest': '2026-09-02T00:00:00Z',
  'project-middle': '2026-09-01T00:00:00Z',
};
const RECENCY_ORDER = ['oldest', 'middle', 'newest'];

/**
 * Mount the dashboard and return every distinct list ordering rendered while
 * the load settles, oldest first. Pumping microtasks between reads is what
 * makes an intermediate render observable: Vue's scheduler flushes on a
 * microtask, so a ref assigned between two awaits gets its own paint.
 */
async function orderingsDuringLoad(): Promise<string[][]> {
  const { default: DashboardView } = await import('@/views/DashboardView.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(DashboardView);
  app.mount(root);

  const seen: string[][] = [];
  for (let i = 0; i < 40; i++) {
    await Promise.resolve();
    await nextTick();
    const titles = [...root.querySelectorAll('h3')].map((h) =>
      (h.textContent ?? '').trim()
    );
    if (!titles.length) continue;
    const last = seen[seen.length - 1];
    if (!last || last.join('|') !== titles.join('|')) seen.push(titles);
  }

  app.unmount();
  root.remove();
  return seen;
}

beforeEach(() => {
  vi.clearAllMocks();
  user.value = { id: 'u1' };
  getAllProjects.mockImplementation(async () => makeProjects());
  // Deliberately slower than the project fetch - the ordering query is a
  // separate round trip and nothing guarantees it wins the race.
  getRecentOpens.mockImplementation(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    return OPENS;
  });
});

describe('DashboardView initial ordering', () => {
  it('never renders the list in any order but the final one', async () => {
    const orderings = await orderingsDuringLoad();

    expect(orderings).toEqual([RECENCY_ORDER]);
  });

  it('still orders by recency when the opens query returns nothing', async () => {
    getRecentOpens.mockImplementation(async () => ({}));

    const orderings = await orderingsDuringLoad();

    expect(orderings).toEqual([CREATED_ORDER]);
  });
});
