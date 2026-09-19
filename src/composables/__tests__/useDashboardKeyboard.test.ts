// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, defineComponent, ref } from 'vue';
import { useDashboardKeyboard } from '@/composables/useDashboardKeyboard';

function mountKeyboard(mode: 'single' | 'dual', playing = false) {
  const stepFrame = vi.fn();
  const play = vi.fn();
  const pause = vi.fn();
  const Host = defineComponent({
    setup() {
      useDashboardKeyboard({
        playerMode: ref(mode),
        transport: { isPlaying: () => playing, play, pause, step: stepFrame },
      });
      return () => null;
    },
  });
  const root = document.createElement('div');
  const app = createApp(Host);
  app.mount(root);
  return { stepFrame, play, pause, unmount: () => app.unmount() };
}

function press(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  window.dispatchEvent(event);
  return event;
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
});
