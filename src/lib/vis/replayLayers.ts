/**
 * The visuals the replay draws on top of the pipeline's data, each of which
 * can be shown or hidden from the replay's layers menu. Hiding one only stops
 * it being drawn: the data, and what is worked out from it, are unchanged.
 *
 * The choice is kept in the browser, so it holds across videos and visits.
 */

export type ReplayLayerKey =
  | 'goal'
  | 'throwIn'
  | 'attackShading'
  | 'attackArrows'
  | 'ballTrail'
  | 'phaseLabels'
  | 'nearbyRings'
  | 'farFade'
  | 'ringFades';

export type ReplayLayers = Record<ReplayLayerKey, boolean>;

/** In the order the menu lists them. */
export const REPLAY_LAYERS: ReadonlyArray<{ key: ReplayLayerKey; label: string; hint: string }> = [
  { key: 'goal', label: 'Goal animation', hint: 'A shot into the net on a goal label' },
  { key: 'throwIn', label: 'Throw-in zoom', hint: 'Zoom to the touchline, with a pulse' },
  {
    key: 'attackShading',
    label: 'Attack shading',
    hint: 'Team colour from the front of the attack to the goal',
  },
  { key: 'attackArrows', label: 'Attack arrows', hint: 'Arrows flowing toward the goal' },
  { key: 'ballTrail', label: 'Ball trail', hint: 'A line from where the ball was played' },
  {
    key: 'phaseLabels',
    label: 'Attacking / defending',
    hint: 'Team labels above the pitch',
  },
  {
    key: 'nearbyRings',
    label: 'Players near the ball',
    hint: 'White rings within 15 m of the ball carrier',
  },
  {
    key: 'farFade',
    label: 'Fade distant players',
    hint: 'Players over 15 m from the ball drawn faint',
  },
  {
    key: 'ringFades',
    label: 'Smooth ring changes',
    hint: 'Rings fade in and out instead of snapping',
  },
];

export const DEFAULT_REPLAY_LAYERS: ReplayLayers = {
  goal: true,
  throwIn: true,
  attackShading: true,
  attackArrows: true,
  ballTrail: true,
  phaseLabels: true,
  nearbyRings: true,
  farFade: true,
  ringFades: true,
};

const STORAGE_KEY = 'perspecto.replayLayers';

/**
 * The stored choice, over the defaults. Anything stored that is not a known
 * layer set to true or false is ignored, so an entry from another version, or
 * a damaged one, never hides a layer nobody chose to hide.
 */
export function readReplayLayers(storage: Pick<Storage, 'getItem'> | null): ReplayLayers {
  const layers = { ...DEFAULT_REPLAY_LAYERS };
  try {
    const stored: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (stored && typeof stored === 'object') {
      for (const key of Object.keys(layers) as ReplayLayerKey[]) {
        const value = (stored as Record<string, unknown>)[key];
        if (typeof value === 'boolean') layers[key] = value;
      }
    }
  } catch {
    // Unreadable or refused: the defaults stand.
  }
  return layers;
}

/** Keep the choice; a browser that refuses storage just does not remember it. */
export function writeReplayLayers(
  storage: Pick<Storage, 'setItem'> | null,
  layers: ReplayLayers,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(layers));
  } catch {
    // Private mode or full: the choice lasts for this visit only.
  }
}
