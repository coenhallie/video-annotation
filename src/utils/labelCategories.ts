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

export interface LabelCategoryGroup {
  key: LabelCategoryKey;
  name: string;
  labels: Label[];
}

const firstToken = (name: string): string =>
  name.trim().split(/\s+/)[0]?.toUpperCase() ?? '';

/**
 * The category a label belongs to, or null when its prefix is not one of the
 * six known categories. Uncategorised labels are deliberately excluded from the
 * bloom; they remain available in the sidebar.
 */
export function categoryKeyForLabel(label: Label): LabelCategoryKey | null {
  const token = firstToken(label.name ?? '');
  return (CATEGORY_ORDER as readonly string[]).includes(token)
    ? (token as LabelCategoryKey)
    : null;
}

/** Label name with the category prefix removed, for compact display in a ring. */
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
    labels: buckets.get(key) as Label[],
  }));
}
