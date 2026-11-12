// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { MomentAvailability } from '@coenhallie/match-tracker';
import ReplayMomentTriggers from '@/components/ReplayMomentTriggers.vue';

const ALL: MomentAvailability = { goal: true, attack: { 0: true, 1: true }, corner: true, throwIn: true, varCheck: true, goalDisallowed: true, halfTime: true, secondHalf: true, fullTime: true, foul: true, shotOnGoal: true, headerOnGoal: true, yellowCard: true, redCard: true };
const TEAMS: [{ name: string; color: string }, { name: string; color: string }] = [
  { name: 'Manchester City', color: '#e51a1a' },
  { name: 'PSG', color: '#184fe7' },
];

function mount(availability: MomentAvailability | null = ALL) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const played: Array<[string, number | undefined]> = [];
  const demo: boolean[] = [];
  const available = ref(availability);
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(ReplayMomentTriggers, {
          availability: available.value,
          teams: TEAMS,
          onTrigger: (moment: string, team?: number) => played.push([moment, team]),
          onDemo: (on: boolean) => demo.push(on),
        }),
    })
  );
  app.mount(root);
  return {
    root,
    played,
    demo,
    available,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

const at = (root: HTMLElement, id: string) => root.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);

describe('ReplayMomentTriggers', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows only the Demo toggle until it is turned on', async () => {
    const m = mount();
    expect(at(m.root, 'moment-triggers')).toBeNull();
    const toggle = at(m.root, 'moment-demo-toggle')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    await nextTick();
    expect(at(m.root, 'moment-triggers')).not.toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    m.unmount();
  });

  it('says whether Demo is on, as it mounts and as it changes', async () => {
    const m = mount();
    expect(m.demo).toEqual([false]);
    at(m.root, 'moment-demo-toggle')!.click();
    await nextTick();
    expect(m.demo).toEqual([false, true]);
    m.unmount();
  });

  it('remembers that it is on', async () => {
    const first = mount();
    at(first.root, 'moment-demo-toggle')!.click();
    await nextTick();
    first.unmount();
    const again = mount();
    expect(at(again.root, 'moment-triggers')).not.toBeNull();
    again.unmount();
  });

  it('plays each moment, an attack for the team pressed', async () => {
    const m = mount();
    at(m.root, 'moment-demo-toggle')!.click();
    await nextTick();
    for (const id of ['moment-goal', 'moment-attack-1', 'moment-attack-0', 'moment-corner', 'moment-throwIn']) {
      at(m.root, id)!.click();
    }
    expect(m.played).toEqual([
      ['goal', undefined],
      ['attack', 1],
      ['attack', 0],
      ['corner', undefined],
      ['throwIn', undefined],
    ]);
    expect(at(m.root, 'moment-attack-0')!.textContent).toContain('Manchester City attack');
    m.unmount();
  });

  it('disables what cannot be played on the frame on screen, and everything before the replay is up', async () => {
    const m = mount({ goal: false, attack: { 0: true, 1: false }, corner: true, throwIn: true, varCheck: true, goalDisallowed: true, halfTime: true, secondHalf: true, fullTime: true, foul: true, shotOnGoal: true, headerOnGoal: true, yellowCard: true, redCard: true });
    at(m.root, 'moment-demo-toggle')!.click();
    await nextTick();
    expect(at(m.root, 'moment-goal')!.disabled).toBe(true);
    expect(at(m.root, 'moment-attack-1')!.disabled).toBe(true);
    expect(at(m.root, 'moment-attack-0')!.disabled).toBe(false);
    m.available.value = null;
    await nextTick();
    for (const id of ['moment-goal', 'moment-attack-0', 'moment-corner', 'moment-throwIn']) {
      expect(at(m.root, id)!.disabled).toBe(true);
    }
    m.unmount();
  });
});
