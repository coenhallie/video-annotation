// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import VideoControls from '@/components/video/VideoControls.vue';

/**
 * The reveal is CSS, and jsdom evaluates neither the compiled scoped selectors
 * nor :focus-visible, so these cover the hooks those rules hang off instead:
 * `is-paused` is what shows the bar while paused in BOTH players (the single
 * player's wrapper has a .paused class, the dual player's has none), and
 * `primary` is what makes the play button the filled one.
 */
function mount(props: Record<string, unknown> = {}) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const isPlaying = ref(Boolean(props.isPlaying));
  const events: string[] = [];
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(VideoControls, {
          isPlaying: isPlaying.value,
          isMuted: false,
          volume: 1,
          playbackRate: 1,
          onTogglePlay: () => events.push('toggle-play'),
          onPrevFrame: () => events.push('prev-frame'),
          onNextFrame: () => events.push('next-frame'),
          ...props,
        }),
    })
  );
  app.mount(root);
  return {
    root,
    events,
    isPlaying,
    bar: () => root.querySelector('.video-controls') as HTMLElement,
    play: () => root.querySelector('.control-button.primary') as HTMLButtonElement,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

describe('VideoControls', () => {
  it('marks itself paused so the bar shows without a hover', async () => {
    const m = mount({ isPlaying: false });
    await nextTick();
    expect(m.bar().classList.contains('is-paused')).toBe(true);
    m.unmount();
  });

  it('drops the paused hook once playback starts', async () => {
    const m = mount({ isPlaying: true });
    await nextTick();
    expect(m.bar().classList.contains('is-paused')).toBe(false);
    m.unmount();
  });

  it('keeps the play button as the one filled control, labelled by state', async () => {
    const paused = mount({ isPlaying: false });
    await nextTick();
    expect(paused.play()).not.toBeNull();
    expect(paused.play().getAttribute('aria-label')).toBe('Play');
    paused.play().click();
    expect(paused.events).toEqual(['toggle-play']);
    paused.unmount();

    const playing = mount({ isPlaying: true });
    await nextTick();
    expect(playing.play().getAttribute('aria-label')).toBe('Pause');
    playing.unmount();
  });

  it('still emits the frame-step events from the outer buttons', async () => {
    const m = mount({ isPlaying: false });
    await nextTick();
    const buttons = m.root.querySelectorAll<HTMLButtonElement>('.control-button');
    buttons[0].click();
    buttons[2].click();
    expect(m.events).toEqual(['prev-frame', 'next-frame']);
    m.unmount();
  });

  it('reports volume changes from the slider', async () => {
    const onVolumeChange = vi.fn();
    const m = mount({ isPlaying: false, onVolumeChange });
    await nextTick();
    const slider = m.root.querySelector('.volume-slider') as HTMLInputElement;
    slider.value = '0.3';
    slider.dispatchEvent(new Event('input'));
    expect(onVolumeChange).toHaveBeenCalledWith(0.3);
    m.unmount();
  });
});
