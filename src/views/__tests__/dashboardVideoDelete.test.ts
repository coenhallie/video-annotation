// @vitest-environment jsdom
//
// Deleting a video from the dashboard: the details panel offers it, the
// confirmation dialog says what goes with the video before anything is
// removed, and the library reloads afterwards - a delete also removes every
// comparison that used the video, so patching the one row out would leave
// those comparisons on screen.
//
// The real view, panel and dialog are mounted with their services stubbed,
// because the thing worth protecting is the wiring between the three.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, ref, nextTick, type App } from 'vue';
import type { Project } from '@/types/project';

const user = ref<{ id: string } | null>({ id: 'u1' });
const getAllProjects = vi.fn();
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

const single: Project = {
  id: 'project-1',
  projectType: 'single',
  title: 'Derby',
  thumbnailUrl: '',
  createdAt: '2026-08-01T00:00:00Z',
  video: {
    id: 'video-1',
    title: 'Derby',
    url: 'https://example.test/derby.mp4',
    duration: 10,
    qaStatus: 'not_started',
  },
} as unknown as Project;

const dual: Project = {
  id: 'comparison-1',
  projectType: 'dual',
  title: 'Defence comparison',
  thumbnailUrl: '',
  createdAt: '2026-08-01T00:00:00Z',
  comparisonVideo: { id: 'comparison-1' },
  videoA: { id: 'video-a', duration: 10 },
  videoB: { id: 'video-b', duration: 10 },
} as unknown as Project;

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

function openPanel(root: HTMLElement, title: string): void {
  const row = [...root.querySelectorAll<HTMLElement>('[role="button"]')].find((el) =>
    el.textContent?.includes(title)
  );
  row!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// The panel renders twice - a docked aside and a Teleported mobile copy - and
// only the docked one lives inside the mounted root.
const deleteButton = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>('[data-testid="video-delete"]');

const dialog = () => document.body.querySelector<HTMLElement>('[role="alertdialog"]');

const confirmButton = () =>
  [...dialog()!.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    /delet/i.test(b.textContent ?? '')
  )!;

let mounted: { root: HTMLElement; app: App } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  mounted?.app.unmount();
  mounted?.root.remove();
  mounted = null;
  document.body.innerHTML = '';
  user.value = { id: 'u1' };
  getAllProjects.mockImplementation(async () => [single, dual]);
  getDeleteImpact.mockResolvedValue({ annotations: 12, comments: 3, comparisons: 2 });
  deleteVideo.mockResolvedValue(undefined);
});

describe('DashboardView video delete', () => {
  it('offers delete in the details panel of a single video', async () => {
    mounted = await mount();
    openPanel(mounted.root, 'Derby');
    await flush();
    expect(deleteButton(mounted.root)).not.toBeNull();
  });

  // A comparison goes when one of its videos goes; it has no delete of its own.
  it('does not offer delete for a comparison', async () => {
    mounted = await mount();
    openPanel(mounted.root, 'Defence comparison');
    await flush();
    expect(deleteButton(mounted.root)).toBeNull();
  });

  it('says what will be lost before deleting anything', async () => {
    mounted = await mount();
    openPanel(mounted.root, 'Derby');
    await flush();
    deleteButton(mounted.root)!.click();
    await flush();

    expect(getDeleteImpact).toHaveBeenCalledWith('video-1');
    const text = dialog()!.textContent ?? '';
    expect(text).toContain('Derby');
    expect(text).toContain('12 annotations');
    expect(text).toContain('3 comments');
    expect(text).toContain('2 comparisons');
    expect(deleteVideo).not.toHaveBeenCalled();
  });

  it('leaves out the comparison warning when no comparison uses the video', async () => {
    getDeleteImpact.mockResolvedValue({ annotations: 1, comments: 0, comparisons: 0 });
    mounted = await mount();
    openPanel(mounted.root, 'Derby');
    await flush();
    deleteButton(mounted.root)!.click();
    await flush();

    const text = dialog()!.textContent ?? '';
    expect(text).toContain('1 annotation ');
    expect(text).not.toMatch(/comparison/i);
  });

  // Confirming before the counts arrive would delete without the warning the
  // dialog exists to show.
  it('keeps the delete button disabled until the counts have loaded', async () => {
    getDeleteImpact.mockReturnValue(new Promise(() => {}));
    mounted = await mount();
    openPanel(mounted.root, 'Derby');
    await flush();
    deleteButton(mounted.root)!.click();
    await flush();

    expect(confirmButton().disabled).toBe(true);
  });

  // The counts are a courtesy. Failing to load them must not make the video
  // impossible to delete.
  it('still allows the delete when the counts cannot be loaded', async () => {
    getDeleteImpact.mockRejectedValue(new Error('offline'));
    mounted = await mount();
    openPanel(mounted.root, 'Derby');
    await flush();
    deleteButton(mounted.root)!.click();
    await flush();

    expect(confirmButton().disabled).toBe(false);
  });

  it('deletes on confirm, reloads the library and closes the panel', async () => {
    mounted = await mount();
    openPanel(mounted.root, 'Derby');
    await flush();
    deleteButton(mounted.root)!.click();
    await flush();

    getAllProjects.mockImplementation(async () => [dual]);
    confirmButton().click();
    await flush();

    expect(deleteVideo).toHaveBeenCalledWith('video-1');
    expect(getAllProjects).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
    expect(deleteButton(mounted.root)).toBeNull();
    expect(mounted.root.textContent).not.toContain('Derby');
  });

  it('reports a failed delete and keeps the video', async () => {
    deleteVideo.mockRejectedValue(new Error('This video could not be deleted'));
    mounted = await mount();
    openPanel(mounted.root, 'Derby');
    await flush();
    deleteButton(mounted.root)!.click();
    await flush();

    confirmButton().click();
    await flush();

    expect(notifyError).toHaveBeenCalledWith(
      'Could not delete video',
      'This video could not be deleted'
    );
    expect(dialog()).not.toBeNull();
    expect(mounted.root.textContent).toContain('Derby');
  });

  it('cancels without deleting', async () => {
    mounted = await mount();
    openPanel(mounted.root, 'Derby');
    await flush();
    deleteButton(mounted.root)!.click();
    await flush();

    const cancel = [...dialog()!.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => /cancel/i.test(b.textContent ?? '')
    )!;
    cancel.click();
    await flush();

    expect(dialog()).toBeNull();
    expect(deleteVideo).not.toHaveBeenCalled();
  });
});
