import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside an open dialog.
 *
 * While `isOpen()` is true: focus moves into `container` (unless something
 * inside already has it, such as an input the dialog focuses itself), Tab and
 * Shift+Tab wrap at its ends, and when it closes focus returns to whatever had
 * it before. Without this, Tab walked into the page behind the backdrop and a
 * closed dialog left focus on <body>.
 */
export function useFocusTrap(
  container: Ref<HTMLElement | null>,
  isOpen: () => boolean
): void {
  let returnTo: HTMLElement | null = null;

  const focusable = (): HTMLElement[] =>
    container.value
      ? [...container.value.querySelectorAll<HTMLElement>(FOCUSABLE)]
      : [];

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !isOpen() || !container.value) return;
    const items = focusable();
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    const inside = active ? container.value.contains(active) : false;
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  };

  const release = () => {
    document.removeEventListener('keydown', onKeydown, true);
    const target = returnTo;
    returnTo = null;
    if (target && document.contains(target)) target.focus();
  };

  watch(
    isOpen,
    async (open) => {
      if (!open) {
        release();
        return;
      }
      returnTo = document.activeElement as HTMLElement | null;
      document.addEventListener('keydown', onKeydown, true);
      // The dialog's own onMounted focus (a name input, say) runs first.
      await nextTick();
      if (!container.value || container.value.contains(document.activeElement)) return;
      focusable()[0]?.focus();
    },
    { immediate: true, flush: 'post' }
  );

  onBeforeUnmount(release);
}
