// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, defineComponent, ref } from 'vue';
import { useDashboardKeyboard } from '@/composables/useDashboardKeyboard';

function mountKeyboard(mode: 'single' | 'dual', playing = false) {
  const stepFrame = vi.fn();
  const play = vi.fn();
  const pause = vi.fn();
  const openQuickPick = vi.fn(() => true);
  const Host = defineComponent({
    setup() {
      useDashboardKeyboard({
        playerMode: ref(mode),
        transport: { isPlaying: () => playing, play, pause, step: stepFrame },
        openQuickPick,
      });
      return () => null;
    },
  });
  const root = document.createElement('div');
  const app = createApp(Host);
  app.mount(root);
  return { stepFrame, play, pause, openQuickPick, unmount: () => app.unmount() };
}

function press(init: KeyboardEventInit, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  target.dispatchEvent(event);
  return event;
}

// jsdom has no PointerEvent, and only the type matters to the listener.
const pointerDown = () => new Event('pointerdown', { bubbles: true });

/** An element focused the way a mouse click focuses it. */
function focusedByPointer<K extends keyof HTMLElementTagNameMap>(tag: K) {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  el.dispatchEvent(pointerDown());
  el.focus();
  return el;
}

/** An element focused the way Tab focuses it. */
function focusedByKeyboard<K extends keyof HTMLElementTagNameMap>(tag: K) {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  press({ key: 'Tab' }, document.body);
  el.focus();
  return el;
}

describe('useDashboardKeyboard', () => {
  it('steps one frame on an arrow key in single mode', () => {
    const { stepFrame, unmount } = mountKeyboard('single');
    press({ key: 'ArrowRight' });
    expect(stepFrame.mock.calls).toEqual([[1]]);
    unmount();
  });

  it('leaves arrow keys to the dual timeline in dual mode', () => {
    // DualTimeline already steps the selected video. A second step from here
    // seeks both videos to A's time and destroys a manual alignment.
    const { stepFrame, unmount } = mountKeyboard('dual');
    press({ key: 'ArrowRight' });
    expect(stepFrame).not.toHaveBeenCalled();
    unmount();
  });

  it('does not hijack browser shortcuts such as Cmd+ArrowLeft', () => {
    const { stepFrame, unmount } = mountKeyboard('single');
    const event = press({ key: 'ArrowLeft', metaKey: true });
    expect(stepFrame).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    unmount();
  });

  // The transport is surface-aware, so Space reaches whichever of the video and
  // the pipeline replay is on screen rather than always the video.
  it('toggles playback through the transport on Space', () => {
    const paused = mountKeyboard('single', false);
    press({ key: ' ', code: 'Space' });
    expect(paused.play).toHaveBeenCalledTimes(1);
    paused.unmount();

    const running = mountKeyboard('single', true);
    press({ key: ' ', code: 'Space' });
    expect(running.pause).toHaveBeenCalledTimes(1);
    running.unmount();
  });

  describe('Enter', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('opens the quick pick when nothing in particular has focus', () => {
      const { openQuickPick, unmount } = mountKeyboard('single');
      const event = press({ key: 'Enter' }, document.body);
      expect(openQuickPick).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
      unmount();
    });

    it('opens it in a comparison too', () => {
      const { openQuickPick, unmount } = mountKeyboard('dual');
      press({ key: 'Enter' }, document.body);
      expect(openQuickPick).toHaveBeenCalledTimes(1);
      unmount();
    });

    it('fires once per press, not once per auto-repeat', () => {
      const { openQuickPick, unmount } = mountKeyboard('single');
      press({ key: 'Enter', repeat: true }, document.body);
      expect(openQuickPick).not.toHaveBeenCalled();
      unmount();
    });

    it('leaves Enter with a modifier alone', () => {
      const { openQuickPick, unmount } = mountKeyboard('single');
      press({ key: 'Enter', metaKey: true }, document.body);
      press({ key: 'Enter', ctrlKey: true }, document.body);
      press({ key: 'Enter', altKey: true }, document.body);
      press({ key: 'Enter', shiftKey: true }, document.body);
      expect(openQuickPick).not.toHaveBeenCalled();
      unmount();
    });

    it('leaves Enter to text fields and selects, however they got focus', () => {
      const { openQuickPick, unmount } = mountKeyboard('single');
      press({ key: 'Enter' }, focusedByPointer('input'));
      press({ key: 'Enter' }, focusedByPointer('textarea'));
      press({ key: 'Enter' }, focusedByPointer('select'));
      expect(openQuickPick).not.toHaveBeenCalled();
      unmount();
    });

    // Reached with Tab, the button is what the user is pointing the keyboard
    // at, so Enter has to keep pressing it.
    it('leaves Enter to a button reached from the keyboard', () => {
      const { openQuickPick, unmount } = mountKeyboard('single');
      const button = focusedByKeyboard('button');
      const pressed = vi.fn();
      button.addEventListener('keydown', pressed);
      const event = press({ key: 'Enter' }, button);
      expect(openQuickPick).not.toHaveBeenCalled();
      expect(pressed).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(false);
      unmount();
    });

    // Clicked with the mouse, the button only holds focus by accident. Letting
    // Enter press it again would, say, step a frame instead of labelling.
    it('takes Enter from a button that only has focus because it was clicked', () => {
      const { openQuickPick, unmount } = mountKeyboard('single');
      const button = focusedByPointer('button');
      const pressed = vi.fn();
      button.addEventListener('keydown', pressed);
      const event = press({ key: 'Enter' }, button);
      expect(openQuickPick).toHaveBeenCalledTimes(1);
      expect(pressed).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      unmount();
    });

    // A Tab-focused button that is then clicked holds focus because of the
    // click, the same as one the click focused in the first place.
    it('takes Enter from a keyboard-focused button once it has been clicked', () => {
      const { openQuickPick, unmount } = mountKeyboard('single');
      const button = focusedByKeyboard('button');
      button.dispatchEvent(pointerDown());
      press({ key: 'Enter' }, button);
      expect(openQuickPick).toHaveBeenCalledTimes(1);
      unmount();
    });

    it('leaves the event untouched when the editor declines to open', () => {
      const { openQuickPick, unmount } = mountKeyboard('single');
      openQuickPick.mockReturnValue(false);
      const button = focusedByPointer('button');
      const pressed = vi.fn();
      button.addEventListener('keydown', pressed);
      const event = press({ key: 'Enter' }, button);
      expect(openQuickPick).toHaveBeenCalledTimes(1);
      expect(pressed).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(false);
      unmount();
    });

    it('does nothing while a modal dialog is open', () => {
      const { openQuickPick, unmount } = mountKeyboard('single');
      const dialog = document.createElement('div');
      dialog.setAttribute('aria-modal', 'true');
      document.body.appendChild(dialog);
      press({ key: 'Enter' }, document.body);
      expect(openQuickPick).not.toHaveBeenCalled();
      unmount();
    });
  });
});
