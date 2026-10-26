<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ReplayMoment } from '@/lib/vis/replayLayers';

/**
 * Demo controls for the 2D replay: play any of its moments by hand, at the
 * moment it should be seen, for recording the replay. They sit outside the
 * replay so a recording of it leaves them out. Hidden until "Demo" is turned
 * on, which the browser remembers.
 *
 * Pairs with the layers menu: switching a moment's layer off stops it playing
 * by itself, and these then decide when it plays.
 */

export interface MomentAvailability {
  goal: boolean;
  attack: Record<0 | 1, boolean>;
  freeKick: boolean;
  throwIn: boolean;
}

const props = defineProps<{
  /** What can be played on the frame on screen; null before the replay is up. */
  availability: MomentAvailability | null;
  /** The two teams, team 0 first: their names and the colours they are drawn in. */
  teams: [{ name: string; color: string }, { name: string; color: string }];
}>();

const emit = defineEmits<{
  (e: 'trigger', moment: ReplayMoment, team?: 0 | 1): void;
}>();

const STORAGE_KEY = 'perspecto.replayDemo';

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

const open = ref(readOpen());
watch(open, (on) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode or full: the choice lasts for this visit only.
  }
});

const can = (moment: Exclude<ReplayMoment, 'attack'>) => props.availability?.[moment] ?? false;
const canAttack = (team: 0 | 1) => props.availability?.attack[team] ?? false;

const BUTTON =
  'flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-semibold uppercase tracking-widest ring-1 transition-colors focus-visible:outline-none focus-visible:ring-white/60 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-35';
const IDLE = 'text-white/80 ring-white/10 hover:text-white enabled:hover:ring-white/30';
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5">
    <div
      v-if="open"
      role="group"
      aria-label="Play a replay animation"
      data-testid="moment-triggers"
      class="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
    >
      <button
        type="button"
        data-testid="moment-goal"
        :class="[BUTTON, IDLE]"
        :disabled="!can('goal')"
        :title="can('goal') ? 'Play the goal animation' : 'Needs a tracked ball to know which goal'"
        @click="emit('trigger', 'goal')"
      >
        Goal
      </button>
      <button
        v-for="team in ([0, 1] as const)"
        :key="team"
        type="button"
        :data-testid="`moment-attack-${team}`"
        :class="[BUTTON, IDLE]"
        :disabled="!canAttack(team)"
        :title="
          canAttack(team)
            ? `Play ${teams[team].name}'s attack`
            : 'Needs the keepers to tell which way the teams attack'
        "
        @click="emit('trigger', 'attack', team)"
      >
        <span
          class="h-2 w-2 shrink-0 rounded-full"
          :style="{ backgroundColor: teams[team].color }"
          aria-hidden="true"
        />
        <span class="whitespace-nowrap">{{ teams[team].name }} attack</span>
      </button>
      <button
        type="button"
        data-testid="moment-freeKick"
        :class="[BUTTON, IDLE]"
        :disabled="!can('freeKick')"
        title="Play the free kick banner"
        @click="emit('trigger', 'freeKick')"
      >
        Free kick
      </button>
      <button
        type="button"
        data-testid="moment-throwIn"
        :class="[BUTTON, IDLE]"
        :disabled="!can('throwIn')"
        title="Play the throw-in banner"
        @click="emit('trigger', 'throwIn')"
      >
        Throw-in
      </button>
    </div>
    <button
      type="button"
      data-testid="moment-demo-toggle"
      :class="[BUTTON, open ? 'bg-white/10 text-white ring-white/40' : IDLE]"
      :aria-pressed="open ? 'true' : 'false'"
      title="Buttons to play the replay's animations by hand, for recording it"
      @click="open = !open"
    >
      Demo
    </button>
  </div>
</template>
