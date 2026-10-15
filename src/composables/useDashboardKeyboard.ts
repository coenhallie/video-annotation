import { onMounted, onBeforeUnmount, type Ref } from 'vue';
import type { Transport } from '@/utils/surfaceTransport';

/**
 * Whether Enter means something to the element that has focus, so it must not
 * open the quick pick.
 *
 * Text fields and selects always keep it. Anything else keeps it only when the
 * keyboard put focus there: a button clicked with the mouse holds focus by
 * accident, and Enter pressing it again (frame step, typically) would be a
 * surprise rather than a shortcut. :focus-visible cannot make this call, since
 * Chrome turns it on for the focused element as soon as any key goes down, so
 * by the time Enter is dispatched a clicked button already reports it.
 */
function focusedElementOwnsEnter(
  target: EventTarget | null,
  keyboardFocused: EventTarget | null
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target === document.body || target === document.documentElement) return false;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return target === keyboardFocused;
}

/**
 * Composable that sets up global keyboard shortcuts for the editor.
 *
 * Handles:
 * - Space: toggle play/pause
 * - ArrowRight: step forward one frame (single mode)
 * - ArrowLeft: step backward one frame (single mode)
 * - Enter: open the annotation quick pick at the playhead
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
  /**
   * Opens the annotation quick pick at the playhead. Returns false when the
   * editor declines (read-only, drawing, panel already up), and Enter is then
   * left to whatever would have had it.
   */
  openQuickPick: () => boolean;
}): void {
  const { playerMode, transport, openQuickPick } = deps;

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

  // Which element the keyboard last put focus on, so Enter can tell a button
  // reached with Tab from one that was clicked. A pointer press clears it even
  // when focus does not move, because a Tab-focused button that is then
  // clicked holds focus because of the click. Anything focused before this
  // mounted counts as clicked, which hands Enter to the quick pick.
  let lastInputWasPointer = false;
  let keyboardFocused: EventTarget | null = null;

  const notePointer = () => {
    lastInputWasPointer = true;
    keyboardFocused = null;
  };
  const noteKey = () => {
    lastInputWasPointer = false;
  };
  const noteFocus = (e: FocusEvent) => {
    keyboardFocused = lastInputWasPointer ? null : e.target;
  };

  // Capture phase, so a clicked element's own Enter handler (AnnotationCard
  // seeks on it) never runs when the quick pick takes the key. The key is only
  // consumed once the panel has actually opened.
  const handleEnter = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    // A held key would otherwise reopen the panel on every auto-repeat.
    if (e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (focusedElementOwnsEnter(e.target, keyboardFocused)) return;
    // The panel would open behind the dialog, and take the next keystrokes.
    if (document.querySelector('[aria-modal="true"]')) return;

    if (!openQuickPick()) return;
    e.preventDefault();
    // Not stopImmediatePropagation: other window capture listeners, the
    // panel's own among them, still see the key.
    e.stopPropagation();
  };

  onMounted(() => {
    window.addEventListener('pointerdown', notePointer, true);
    window.addEventListener('keydown', noteKey, true);
    window.addEventListener('focusin', noteFocus, true);
    window.addEventListener('keydown', handleEnter, true);
    window.addEventListener('keydown', handleKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', notePointer, true);
    window.removeEventListener('keydown', noteKey, true);
    window.removeEventListener('focusin', noteFocus, true);
    window.removeEventListener('keydown', handleEnter, true);
    window.removeEventListener('keydown', handleKeydown);
  });
}
