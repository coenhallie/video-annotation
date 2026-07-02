import { onMounted, onBeforeUnmount, type Ref } from 'vue';

/**
 * Composable that sets up global keyboard shortcuts for the dashboard.
 *
 * Handles:
 * - Space: toggle play/pause
 * - ArrowRight: step forward one frame
 * - ArrowLeft: step backward one frame
 *
 * This is a side-effect composable — it returns nothing.
 */
export function useDashboardKeyboard(deps: {
  /** Current player mode ('single' | 'dual'). */
  playerMode: Ref<'single' | 'dual'>;
  /** Whether the single-mode video is currently playing. */
  isPlaying: Ref<boolean>;
  /** Dual video player instance (for checking play state). */
  dualVideoPlayer: {
    videoAIsPlaying?: Ref<boolean>;
    videoBIsPlaying?: Ref<boolean>;
  } | null;
  /** The unified video player ref (must expose play, pause, stepFrame). */
  unifiedVideoPlayerRef: Ref<{
    play?: () => void;
    pause?: () => void;
    stepFrame?: (frames: number) => void;
  } | null>;
}): void {
  const { playerMode, isPlaying, dualVideoPlayer, unifiedVideoPlayerRef } = deps;

  const handleKeydown = (e: KeyboardEvent) => {
    // Ignore if user is typing in an input or textarea
    const target = e.target as HTMLElement;
    if (
      ['INPUT', 'TEXTAREA'].includes(target.tagName) ||
      target.isContentEditable
    ) {
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      unifiedVideoPlayerRef.value?.stepFrame?.(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      unifiedVideoPlayerRef.value?.stepFrame?.(-1);
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();

      let isCurrentlyPlaying = false;
      if (playerMode.value === 'single') {
        isCurrentlyPlaying = isPlaying.value;
      } else if (playerMode.value === 'dual' && dualVideoPlayer) {
        isCurrentlyPlaying =
          dualVideoPlayer.videoAIsPlaying?.value ||
          dualVideoPlayer.videoBIsPlaying?.value ||
          false;
      }

      if (isCurrentlyPlaying) {
        unifiedVideoPlayerRef.value?.pause?.();
      } else {
        unifiedVideoPlayerRef.value?.play?.();
      }
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
}
