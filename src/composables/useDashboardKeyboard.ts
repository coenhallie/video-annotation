import { onMounted, onBeforeUnmount, type Ref } from 'vue';
import type { Transport } from '@/utils/surfaceTransport';

/**
 * Composable that sets up global keyboard shortcuts for the editor.
 *
 * Handles:
 * - Space: toggle play/pause
 * - ArrowRight: step forward one frame (single mode)
 * - ArrowLeft: step backward one frame (single mode)
 *
 * In dual mode the arrow keys belong to DualTimeline, which steps the selected
 * video. Handling them here as well stepped twice, and the second step seeks
 * both videos to A's time, destroying a manual alignment.
 *
 * Playback goes through `transport` rather than a player ref so that the keys
 * reach whichever surface is on screen (see surfaceTransport).
 *
 * This is a side-effect composable - it returns nothing.
 */
export function useDashboardKeyboard(deps: {
  /** Current player mode ('single' | 'dual'). */
  playerMode: Ref<'single' | 'dual'>;
  transport: Transport;
}): void {
  const { playerMode, transport } = deps;

  const handleKeydown = (e: KeyboardEvent) => {
    // Ignore if user is typing in an input or textarea
    const target = e.target as HTMLElement;
    if (
      ['INPUT', 'TEXTAREA'].includes(target.tagName) ||
      target.isContentEditable
    ) {
      return;
    }

    // Cmd/Ctrl/Alt + key is a browser or OS shortcut (Cmd+ArrowLeft is Back).
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const ownsArrows = playerMode.value === 'single';

    if (e.key === 'ArrowRight' && ownsArrows) {
      e.preventDefault();
      transport.step(1);
    } else if (e.key === 'ArrowLeft' && ownsArrows) {
      e.preventDefault();
      transport.step(-1);
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (transport.isPlaying()) transport.pause();
      else transport.play();
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
}
