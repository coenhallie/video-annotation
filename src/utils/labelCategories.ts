import type { Label } from '@/types/labels';

/**
 * Labels carry their category as a name prefix (see DEFAULT_LABELS in
 * src/types/labels.ts). There is no category column on the labels table, so the
 * prefix is the only category signal we have.
 */
export type LabelCategoryKey = 'EVT' | 'PITCH' | 'TEAM' | 'NPL' | 'PLR' | 'BALL';

export const CATEGORY_ORDER: readonly LabelCategoryKey[] = [
  'EVT',
  'PITCH',
  'TEAM',
  'NPL',
  'PLR',
  'BALL',
] as const;

const CATEGORY_NAMES: Record<LabelCategoryKey, string> = {
  EVT: 'Events',
  PITCH: 'Pitch',
  TEAM: 'Team',
  NPL: 'Officials',
  PLR: 'Players',
  BALL: 'Ball',
};

/**
 * One-character glyph per category, for the quick pick's keycaps. Not simply the first
 * letter: PITCH and PLR would both claim P, so PLR takes L. Every value here is
 * distinct, which is what makes the glyph a usable shorthand on its own.
 */
const CATEGORY_LETTERS: Record<LabelCategoryKey, string> = {
  EVT: 'E',
  PITCH: 'P',
  TEAM: 'T',
  NPL: 'N',
  PLR: 'L',
  BALL: 'B',
};

export interface LabelCategoryGroup {
  key: LabelCategoryKey;
  /** Friendly name, e.g. "Officials" for NPL. */
  name: string;
  /** Single distinct character shown on the category's keycap. */
  letter: string;
  labels: Label[];
}

const firstToken = (name: string): string =>
  name.trim().split(/\s+/)[0]?.toUpperCase() ?? '';

/**
 * The category a label belongs to, or null when its prefix is not one of the
 * six known categories. Uncategorised labels are deliberately excluded from the
 * quick pick; they remain available in the sidebar.
 */
export function categoryKeyForLabel(label: Label): LabelCategoryKey | null {
  const token = firstToken(label.name ?? '');
  return (CATEGORY_ORDER as readonly string[]).includes(token)
    ? (token as LabelCategoryKey)
    : null;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Ordered shortcut candidates for a label: the initial of each word first, then
 * every remaining letter of the name. So "WRONG POS" offers W, then P, then R,
 * O, N, G, S.
 */
const shortcutCandidates = (label: Label): string[] => {
  const short = labelShortName(label).toUpperCase();
  const candidates: string[] = [];
  const add = (char: string) => {
    if (/[A-Z]/.test(char) && !candidates.includes(char)) candidates.push(char);
  };
  for (const word of short.split(/\s+/)) if (word) add(word[0] as string);
  for (const char of short) add(char);
  return candidates;
};

/**
 * Give every label in a category a distinct single-letter shortcut, so an
 * annotator can type a category letter then a label letter without looking.
 *
 * A letter that two labels would both claim is given to neither: "WRONG OWNER"
 * and "WRONG POS" both open with W, so W is dropped and they fall through to O
 * and P. Handing W to whichever sorted first would make the pair a coin flip to
 * remember, which defeats the point of the shortcut.
 *
 * Returns a map of label id to letter. Deterministic for a given input order.
 */
export function assignLabelShortcuts(labels: Label[]): Record<string, string> {
  const remaining = new Map(labels.map((l) => [l.id, shortcutCandidates(l)]));
  const assigned: Record<string, string> = {};
  const taken = new Set<string>();

  while (remaining.size > 0) {
    // Everyone still unassigned bids for their best letter that is still free.
    const bids = new Map<string, string[]>();
    for (const [id, candidates] of remaining) {
      const choice = candidates.find((c) => !taken.has(c));
      if (!choice) continue;
      const bidders = bids.get(choice);
      if (bidders) bidders.push(id);
      else bids.set(choice, [id]);
    }

    let progressed = false;

    // Uncontested bids are granted.
    for (const [letter, bidders] of bids) {
      if (bidders.length !== 1) continue;
      const id = bidders[0] as string;
      assigned[id] = letter;
      taken.add(letter);
      remaining.delete(id);
      progressed = true;
    }

    if (progressed) continue;

    // Nothing was uncontested, so retire the most-contested letter for everyone
    // who bid on it and let them fall through to their next candidate.
    const contested = [...bids.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (contested) {
      const [letter, bidders] = contested;
      for (const id of bidders) {
        remaining.set(
          id,
          (remaining.get(id) as string[]).filter((c) => c !== letter)
        );
      }
      progressed = true;
    }

    if (!progressed) break;
  }

  // Anyone who ran out of candidates takes the first free letter of the alphabet.
  for (const [id] of remaining) {
    const spare = ALPHABET.find((c) => !taken.has(c));
    if (!spare) break;
    assigned[id] = spare;
    taken.add(spare);
  }

  return assigned;
}

/** Label name with the category prefix removed, for compact display. */
export function labelShortName(label: Label): string {
  const name = (label.name ?? '').trim();
  if (!categoryKeyForLabel(label)) return name;
  const rest = name.split(/\s+/).slice(1).join(' ');
  return rest || name;
}

/**
 * Group labels into categories in CATEGORY_ORDER. Uncategorised labels are
 * dropped and empty categories are omitted, so the result is never a category
 * with nothing in it.
 */
export function groupLabelsByCategory(labels: Label[]): LabelCategoryGroup[] {
  const buckets = new Map<LabelCategoryKey, Label[]>();

  for (const label of labels) {
    const key = categoryKeyForLabel(label);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(label);
    else buckets.set(key, [label]);
  }

  return CATEGORY_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    name: CATEGORY_NAMES[key],
    letter: CATEGORY_LETTERS[key],
    labels: buckets.get(key) as Label[],
  }));
}
