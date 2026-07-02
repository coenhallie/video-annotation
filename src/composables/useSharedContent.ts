import { ref, computed, type Ref, type ComputedRef, type DeepReadonly } from 'vue';
import { ShareService } from '@/services/shareService';
import type { Video } from '@/types/database';
import type {
  SharedVideoData,
  SharedComparisonData,
  PendingSharedContent,
} from '@/types/component-interfaces';

export interface SharedContentState {
  isSharedVideo: Ref<boolean>;
  isSharedComparison: Ref<boolean>;
  sharedVideoData: Ref<SharedVideoData | null>;
  showAuthPrompt: Ref<boolean>;
  userDeclinedAuth: Ref<boolean>;
  pendingSharedContent: Ref<PendingSharedContent | null>;
  sharedContentPermissionText: ComputedRef<string>;
  handleAuthSignIn: () => void;
  handleAuthContinueReadOnly: () => void;
  loadSharedVideoReadOnly: (shareData: SharedVideoData) => void;
  loadSharedComparisonReadOnly: (sharedComparisonData: SharedComparisonData) => Promise<void>;
  loadSharedVideoAuthenticated: (shareData: SharedVideoData) => Promise<void>;
  loadSharedComparisonAuthenticated: (sharedComparisonData: SharedComparisonData) => Promise<void>;
  /** Initialise shared content from the URL. Call from onMounted after auth is ready. */
  initSharedContent: () => Promise<void>;
  /** Watch user login to handle pending shared content. Intended for the user watcher. */
  handleUserLogin: () => void;
}

export function useSharedContent(deps: {
  user: Ref<{ id: string; email?: string } | null>;
  currentVideoId: Ref<string | null>;
  currentComparisonId: Ref<string | null>;
  playerMode: Ref<'single' | 'dual'>;
  loadVideo: (video: Partial<Video> & { id?: string; url?: string }, type: 'url' | 'upload' | 'shared') => void;
  startSession: () => Promise<void>;
  comparisonWorkflow: {
    currentComparison: Ref<any> | DeepReadonly<Ref<any>>;
    loadComparisonVideo: (comparison: any) => Promise<any>;
    [key: string]: any;
  };
}): SharedContentState {
  const {
    user,
    currentVideoId,
    currentComparisonId,
    playerMode,
    loadVideo,
    startSession,
    comparisonWorkflow,
  } = deps;

  // ── State ──────────────────────────────────────────────────────────────────
  const isSharedVideo = ref(false);
  const isSharedComparison = ref(false);
  const sharedVideoData = ref<SharedVideoData | null>(null);

  const showAuthPrompt = ref(false);
  const userDeclinedAuth = ref(false);
  const pendingSharedContent = ref<PendingSharedContent | null>(null);

  // ── Computed ────────────────────────────────────────────────────────────────
  const sharedContentPermissionText = computed(() => {
    if (isSharedComparison.value) {
      const comparison = comparisonWorkflow.currentComparison.value;
      const hasAnnotationPermission =
        comparison && (comparison as any).allowAnnotations;
      return hasAnnotationPermission
        ? 'Shared Comparison (Annotations Enabled)'
        : 'Shared Comparison (View Only)';
    } else if (isSharedVideo.value) {
      const hasAnnotationPermission = sharedVideoData.value?.allowAnnotations;
      return hasAnnotationPermission
        ? 'Shared Video (Annotations Enabled)'
        : 'Shared Video (View Only)';
    }
    return 'Shared Content';
  });

  // ── Auth prompt handlers ───────────────────────────────────────────────────
  const handleAuthSignIn = () => {
    showAuthPrompt.value = false;
    userDeclinedAuth.value = false;
    // The Login component will be shown since user is not authenticated
    // After successful login, the pending shared content will be loaded
  };

  const handleAuthContinueReadOnly = () => {
    userDeclinedAuth.value = true;

    // Load the shared content in read-only mode BEFORE closing the prompt
    // This ensures the isSharedVideo/isSharedComparison flags are set first
    if (pendingSharedContent.value) {
      if (pendingSharedContent.value.type === 'video') {
        loadSharedVideoReadOnly(pendingSharedContent.value.data);
      } else if (pendingSharedContent.value.type === 'comparison') {
        loadSharedComparisonReadOnly(pendingSharedContent.value.data);
      }
      pendingSharedContent.value = null;
    }

    // Close the prompt AFTER loading content to avoid unmounting the main div
    showAuthPrompt.value = false;
  };

  // ── Loading helpers ────────────────────────────────────────────────────────
  const loadSharedVideoReadOnly = (shareData: SharedVideoData) => {
    isSharedVideo.value = true;
    sharedVideoData.value = shareData;
    currentVideoId.value = shareData.id;

    loadVideo(
      {
        id: shareData.id,
        url: shareData.url || '',
      },
      'shared',
    );
  };

  const loadSharedComparisonReadOnly = async (
    sharedComparisonData: SharedComparisonData,
  ) => {
    isSharedComparison.value = true;
    currentComparisonId.value = sharedComparisonData.id;

    const comparisonVideo = {
      id: sharedComparisonData.id,
      title: sharedComparisonData.title,
      description: sharedComparisonData.description,
      videoAId: sharedComparisonData.videoA?.id || 'placeholder',
      videoBId: sharedComparisonData.videoB?.id || 'placeholder',
      videoA: sharedComparisonData.videoA,
      videoB: sharedComparisonData.videoB,
      isPublic: sharedComparisonData.isPublic,
      userId: '',
      createdAt: '',
      updatedAt: '',
    };

    if (comparisonWorkflow) {
      await comparisonWorkflow.loadComparisonVideo(comparisonVideo as any);
      playerMode.value = 'dual';

      // Start the session to initialize permissions even in read-only mode
      if (currentComparisonId.value) {
        await startSession();
      }
    }
  };

  const loadSharedVideoAuthenticated = async (shareData: SharedVideoData) => {
    try {
      // Re-fetch the shared video data now that user is authenticated
      // This ensures canComment is correctly set based on current auth state
      const freshShareData =
        await ShareService.getSharedVideoWithCommentPermissions(shareData.id);

      isSharedVideo.value = true;
      sharedVideoData.value = freshShareData;
      currentVideoId.value = freshShareData.id;

      loadVideo(
        {
          id: freshShareData.id,
          url: freshShareData.url || '',
        },
        'shared',
      );

      // Start the video session with proper permissions
      if (currentVideoId.value) {
        await startSession();
      }
    } catch (error) {
      console.error('Error loading authenticated shared video:', error);
      // Fallback to original data if re-fetch fails
      loadSharedVideoReadOnly(shareData);
    }
  };

  const loadSharedComparisonAuthenticated = async (
    sharedComparisonData: SharedComparisonData,
  ) => {
    try {
      // Re-fetch the shared comparison data now that user is authenticated
      // This ensures canComment is correctly set based on current auth state
      const freshComparisonData =
        await ShareService.getSharedComparisonVideoWithCommentPermissions(
          sharedComparisonData.id,
        );

      isSharedComparison.value = true;
      currentComparisonId.value = freshComparisonData.id;

      const comparisonVideo = {
        id: freshComparisonData.id,
        title: freshComparisonData.title,
        description: freshComparisonData.description,
        videoAId: freshComparisonData.videoA?.id || 'placeholder',
        videoBId: freshComparisonData.videoB?.id || 'placeholder',
        videoA: freshComparisonData.videoA,
        videoB: freshComparisonData.videoB,
        isPublic: freshComparisonData.isPublic,
        userId: '',
        createdAt: '',
        updatedAt: '',
      };

      if (comparisonWorkflow) {
        await comparisonWorkflow.loadComparisonVideo(comparisonVideo as any);
        playerMode.value = 'dual';

        // Start the video session with proper permissions after loading
        // This ensures the activeContentId computed property has the currentComparisonId
        if (currentComparisonId.value) {
          await startSession();
        }
      }
    } catch (error) {
      console.error('Error loading authenticated shared comparison:', error);
      // Fallback to original data if re-fetch fails
      loadSharedComparisonReadOnly(sharedComparisonData);
    }
  };

  // ── Initialization (call from onMounted after auth is ready) ───────────────
  const initSharedContent = async () => {
    const shareInfo = ShareService.parseShareUrl();

    if (!shareInfo.type || !shareInfo.id) return;

    try {
      if (shareInfo.type === 'video') {
        const shareData =
          await ShareService.getSharedVideoWithCommentPermissions(shareInfo.id);

        // Check if this shared video requires authentication for annotations
        const requiresAuth = shareData.canComment && !user.value;

        if (requiresAuth) {
          // Store the pending content and show auth prompt
          pendingSharedContent.value = {
            type: 'video',
            id: shareInfo.id,
            data: shareData,
          };
          showAuthPrompt.value = true;
        } else if (user.value && shareData.canComment) {
          // User is authenticated and video allows annotations - load with full permissions
          await loadSharedVideoAuthenticated(shareData);
        } else {
          // Annotations not allowed or user not authenticated, load in read-only mode
          loadSharedVideoReadOnly(shareData);
        }
      } else if (shareInfo.type === 'comparison') {
        try {
          // Load shared comparison video with proper permissions
          const sharedComparisonData =
            await ShareService.getSharedComparisonVideoWithCommentPermissions(
              shareInfo.id,
            );

          // Check if this shared comparison requires authentication for annotations
          const requiresAuth =
            sharedComparisonData.canComment && !user.value;

          if (requiresAuth) {
            // Store the pending content and show auth prompt
            pendingSharedContent.value = {
              type: 'comparison',
              id: shareInfo.id,
              data: sharedComparisonData,
            };
            showAuthPrompt.value = true;
          } else if (user.value && sharedComparisonData.canComment) {
            // User is authenticated and comparison allows annotations - load with full permissions
            await loadSharedComparisonAuthenticated(sharedComparisonData);
          } else {
            // Annotations not allowed or user not authenticated, load in read-only mode
            loadSharedComparisonReadOnly(sharedComparisonData);
          }
        } catch (error) {
          console.error(
            '❌ [App] Failed to load shared comparison video:',
            error,
          );
          throw error;
        }
      }
    } catch (error) {
      console.error('Failed to load shared content:', error);
    }
  };

  // ── Handle user login with pending shared content ──────────────────────────
  const handleUserLogin = () => {
    if (pendingSharedContent.value) {
      // User logged in after seeing auth prompt, load the shared content WITH full permissions
      if (pendingSharedContent.value.type === 'video') {
        loadSharedVideoAuthenticated(pendingSharedContent.value.data);
      } else if (pendingSharedContent.value.type === 'comparison') {
        loadSharedComparisonAuthenticated(pendingSharedContent.value.data);
      }
      pendingSharedContent.value = null;
    }
  };

  return {
    isSharedVideo,
    isSharedComparison,
    sharedVideoData,
    showAuthPrompt,
    userDeclinedAuth,
    pendingSharedContent,
    sharedContentPermissionText,
    handleAuthSignIn,
    handleAuthContinueReadOnly,
    loadSharedVideoReadOnly,
    loadSharedComparisonReadOnly,
    loadSharedVideoAuthenticated,
    loadSharedComparisonAuthenticated,
    initSharedContent,
    handleUserLogin,
  };
}
