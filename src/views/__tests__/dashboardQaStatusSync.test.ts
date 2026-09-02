// @vitest-environment jsdom
//
// The dashboard shows a video's QA status twice: the inline control on the list
// row and the one in the details panel. They stay in step because both read the
// same project object, and every write is merged into that object by
// DashboardView's own handler.
//
// This test mounts the real view with its services stubbed, because the thing
// worth protecting is the wiring between the two surfaces, not either control -
// those have their own tests. The second case is the regression: reloading the
// projects while the panel is open used to leave the panel holding the previous
// copy of the project, after which neither surface could update the other.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, ref, nextTick, type App } from 'vue';
import type { Project } from '@/types/project';
import type { QaStatus, Video } from '@/types/database';

const user = ref<{ id: string } | null>({ id: 'u1' });
const getAllProjects = vi.fn();
const setQaStatus = vi.fn();

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
vi.mock('@/services/videoService', () => ({ VideoService: { setQaStatus } }));
vi.mock('@/services/watchProgressService', () => ({
  getMergedRangesForVideos: vi.fn(async () => ({})),
  getProgressForVideo: vi.fn(async () => []),
  mergeDualProgress: vi.fn(() => []),
}));
vi.mock('@/services/recentOpensService', () => ({
  getRecentOpens: vi.fn(async () => ({})),
}));
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
    // DashboardView renders a load-failure message from this, so the mock has
    // to carry it or the template dereferences undefined.
    foldersError: ref(null),
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

// Children that carry their own service dependencies and nothing this test
// looks at. ProjectListItem and VideoDetailsPanel are deliberately real.
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

const VIDEO_ID = 'video-1';

function makeProjects(qaStatus: QaStatus): Project[] {
  // Rebuilt on every call, exactly as a refetch rebuilds them: same ids and
  // same values, different objects.
  return [
    {
      id: 'project-1',
      projectType: 'single',
      title: 'demo',
      thumbnailUrl: '',
      createdAt: '2026-08-01T00:00:00Z',
      video: {
        id: VIDEO_ID,
        title: 'demo',
        url: 'https://example.test/demo.mp4',
        duration: 10,
        qaStatus,
      },
    } as unknown as Project,
  ];
}

function updatedVideo(qaStatus: QaStatus): Video {
  return {
    id: VIDEO_ID,
    qaStatus,
    updatedAt: '2026-08-22T00:00:00Z',
    qaStatusUpdatedAt: '2026-08-22T00:00:00Z',
    qaStatusUpdatedBy: 'u1',
  } as unknown as Video;
}

/** Long enough for loadData's chain of awaits to settle. */
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

const rowSelect = (root: HTMLElement) =>
  root.querySelector<HTMLSelectElement>('[data-testid="qa-status-pill-select"]')!;

// The panel renders twice - a docked aside and a Teleported mobile copy - and
// only the docked one lives inside the mounted root. jsdom has no layout, so
// scoping by container is what tells them apart.
const panelSelect = (root: HTMLElement) =>
  root.querySelector<HTMLSelectElement>('[data-testid="qa-status-select"]')!;

async function choose(el: HTMLSelectElement, value: QaStatus): Promise<void> {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}

function openPanel(root: HTMLElement): void {
  root
    .querySelector<HTMLElement>('[data-testid="qa-status-pill-select"]')!
    .parentElement!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  user.value = { id: 'u1' };
  getAllProjects.mockImplementation(async () => makeProjects('not_started'));
  setQaStatus.mockImplementation(async (_id: string, status: QaStatus) =>
    updatedVideo(status)
  );
});

describe('DashboardView QA status, row and details panel', () => {
  it('shows a panel-driven change on the row', async () => {
    const { root, app } = await mount();
    openPanel(root);
    await flush();

    expect(panelSelect(root).value).toBe('not_started');
    await choose(panelSelect(root), 'in_review');

    expect(rowSelect(root).value).toBe('in_review');
    app.unmount();
    root.remove();
  });

  it('shows a row-driven change on the panel', async () => {
    const { root, app } = await mount();
    openPanel(root);
    await flush();

    await choose(rowSelect(root), 'failed');

    expect(panelSelect(root).value).toBe('failed');
    app.unmount();
    root.remove();
  });

  // The regression. A token refresh reassigns `user`, which reloads the
  // projects underneath an open panel; every project object is replaced. If the
  // panel holds the object it was opened with rather than following the list,
  // its writes land on a copy nothing renders.
  it('keeps both surfaces in step after the projects reload', async () => {
    const { root, app } = await mount();
    openPanel(root);
    await flush();

    user.value = { id: 'u1' };
    await flush();
    // Asserted, not assumed: the trigger is a new user object with the SAME id,
    // so a future watch(() => user.value?.id) would stop reloading here and
    // leave the rest of this test passing without ever exercising a reload.
    expect(getAllProjects).toHaveBeenCalledTimes(2);

    await choose(panelSelect(root), 'staging');
    expect(rowSelect(root).value).toBe('staging');

    await choose(rowSelect(root), 'production');
    expect(panelSelect(root).value).toBe('production');

    app.unmount();
    root.remove();
  });
});
