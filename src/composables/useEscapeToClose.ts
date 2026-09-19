import { onMounted, onBeforeUnmount } from 'vue';

/**
 * Escape closes the dialog that calls this, and only that.
 *
 * The listener sits on window in the capture phase and stops the event, so it
 * runs before - and instead of - page-level Escape handlers behind the dialog.
 * Without that, one key press closed the dialog and the dashboard's details
 * panel underneath it.
 *
 * `isOpen` is a getter because most dialogs here stay mounted and toggle a
 * v-if on their root.
 */
export function useEscapeToClose(isOpen: () => boolean, close: () => void): void {
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.stopPropagation();
    close();
  };
  onMounted(() => window.addEventListener('keydown', onKeydown, true));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true));
}
