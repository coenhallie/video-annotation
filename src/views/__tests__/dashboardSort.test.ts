// @vitest-environment jsdom
//
// The dashboard's sort toggle: last opened (the default) or match date. The
// real view is mounted with its services stubbed; the ordering itself has its
// own tests in utils/__tests__/projectOrdering.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, ref, nextTick, type App } from 'vue';
import type { Project } from '@/types/project';

const user = ref<{ id: string } | null>({ id: 'u1' });
const getAllProjects = vi.fn();
const getRecentOpens = vi.fn();
const deleteVideo = vi.fn();
const getDeleteImpact = vi.fn();
const notifyError = vi.fn();

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ user, signOut: vi.fn() }),
}));
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    error: notifyError,
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
    getProjectLabelData: vi.fn(async () => ({ labels: [], labelIdsByProject: {} })),
  },
}));
vi.mock('@/services/videoService', () => ({
  VideoService: { deleteVideo, getDeleteImpact, setQaStatus: vi.fn() },
}));
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

// ProjectListItem, VideoDetailsPanel and DeleteConfirmationDialog stay real.
const stubbed = [
  '@/components/AppHeader.vue',
  '@/components/CreateComparisonModal.vue',
  '@/components/FolderTree.vue',
  '@/components/NewFolderDialog.vue',
  '@/components/ShareModal.vue',
  '@/components/ChangelogModal.vue',
];
for (const path of stubbed) {
  vi.doMock(path, () => ({ default: { render: () => null } }));
}

const single = (id: string, title: string, matchDate: string | null): Project =>
  ({
    id,
    projectType: 'single',
    title,
    thumbnailUrl: '',
    createdAt: '2026-08-01T00:00:00Z',
    video: { id, title, url: 'https://example.test/v.mp4', duration: 10, qaStatus: 'not_started', matchDate },
  }) as unknown as Project;

const LIBRARY = [
  single('early', 'Early match', '2026-09-01'),
  single('undated', 'Undated video', null),
  single('late', 'Late match', '2026-10-14'),
];

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function mount(): Promise<{ root: HTMLElement; app: App }> {
  const { default: DashboardView } = await import('@/views/DashboardView.vue');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(DashboardView);
  app.mount(root);
  await flush();
  return { root, app };
}

const order = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[role="button"]')]
    .map((el) => el.textContent ?? '')
    .map((t) => ['Early match', 'Undated video', 'Late match'].find((title) => t.includes(title)))
    .filter(Boolean);

const sortButton = (root: HTMLElement, name: RegExp) =>
  [...root.querySelectorAll<HTMLButtonElement>('[data-testid^="sort-"]')].find((b) =>
    name.test(b.textContent ?? '')
  )!;

let mounted: { root: HTMLElement; app: App } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  mounted?.app.unmount();
  mounted?.root.remove();
  mounted = null;
  document.body.innerHTML = '';
  localStorage.clear();
  user.value = { id: 'u1' };
  getAllProjects.mockImplementation(async () => LIBRARY);
  // The undated video was opened most recently, the early match before it.
  getRecentOpens.mockResolvedValue({
    undated: '2026-10-16T10:00:00Z',
    early: '2026-10-15T10:00:00Z',
  });
});

describe('DashboardView sort toggle', () => {
  it('sorts by last opened by default', async () => {
    mounted = await mount();
    expect(order(mounted.root)).toEqual(['Undated video', 'Early match', 'Late match']);
  });

  it('sorts by match date, latest first, undated after', async () => {
    mounted = await mount();
    sortButton(mounted.root, /match date/i).click();
    await flush();
    expect(order(mounted.root)).toEqual(['Late match', 'Early match', 'Undated video']);
  });

  it('switches back to last opened', async () => {
    mounted = await mount();
    sortButton(mounted.root, /match date/i).click();
    await flush();
    sortButton(mounted.root, /last opened/i).click();
    await flush();
    expect(order(mounted.root)).toEqual(['Undated video', 'Early match', 'Late match']);
  });

  it('shows which sort is active', async () => {
    mounted = await mount();
    const lastOpened = sortButton(mounted.root, /last opened/i);
    const matchDate = sortButton(mounted.root, /match date/i);
    expect(lastOpened.getAttribute('aria-pressed')).toBe('true');
    expect(matchDate.getAttribute('aria-pressed')).toBe('false');
    matchDate.click();
    await flush();
    expect(lastOpened.getAttribute('aria-pressed')).toBe('false');
    expect(matchDate.getAttribute('aria-pressed')).toBe('true');
  });

  // Remembered like the All / Mine choice beside it.
  it('remembers the choice across visits', async () => {
    mounted = await mount();
    sortButton(mounted.root, /match date/i).click();
    await flush();
    mounted.app.unmount();
    mounted.root.remove();

    mounted = await mount();
    expect(order(mounted.root)).toEqual(['Late match', 'Early match', 'Undated video']);
  });

  // Page 2 of one order is an arbitrary slice of the other.
  it('goes back to the first page when the sort changes', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      single(`m${i}`, `Match number ${i}`, `2026-09-${String(i + 1).padStart(2, '0')}`)
    );
    getAllProjects.mockImplementation(async () => many);
    getRecentOpens.mockResolvedValue({});
    mounted = await mount();
    const next = [...mounted.root.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => /next/i.test(b.textContent ?? '')
    )!;
    next.click();
    await flush();

    sortButton(mounted.root, /match date/i).click();
    await flush();

    // The latest match, 30 September, heads the first page.
    expect(mounted.root.textContent).toContain('Match number 29');
  });
});

